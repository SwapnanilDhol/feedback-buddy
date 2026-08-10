import Foundation

public struct FeedbackHTTPTransport: FeedbackTransport, @unchecked Sendable {
    private let configuration: FeedbackConfiguration
    private let installationIdentifier: any FeedbackInstallationIdentifying
    private let authorizer: any FeedbackRequestAuthorizing
    private let session: URLSession

    public init(
        configuration: FeedbackConfiguration,
        installationIdentifier: any FeedbackInstallationIdentifying,
        authorizer: any FeedbackRequestAuthorizing = NoOpFeedbackRequestAuthorizer(),
        session: URLSession = .shared
    ) {
        self.configuration = configuration
        self.installationIdentifier = installationIdentifier
        self.authorizer = authorizer
        self.session = session
    }

    public func submit(
        _ submission: FeedbackSubmission,
        idempotencyKey: UUID
    ) async throws -> FeedbackReceipt {
        do {
            _ = try submission.validated()
        } catch {
            throw FeedbackError.invalidSubmission
        }

        let installationID: UUID
        do {
            installationID = try await installationIdentifier.installationID()
        } catch is CancellationError {
            throw CancellationError()
        } catch {
            throw FeedbackError.authorizationFailed
        }

        let requestBody = try makeRequestBody(for: submission)
        let url = configuration.endpoint
            .appendingPathComponent("v1")
            .appendingPathComponent("feedback")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.httpBody = requestBody
        request.timeoutInterval = configuration.requestTimeout.timeInterval
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(configuration.projectID, forHTTPHeaderField: "X-Feedback-Project-ID")
        request.setValue(installationID.uuidString, forHTTPHeaderField: "X-Feedback-Installation-ID")
        request.setValue(idempotencyKey.uuidString, forHTTPHeaderField: "Idempotency-Key")

        let authorizationRequest = FeedbackAuthorizationRequest(
            endpoint: url,
            method: "POST",
            body: requestBody
        )
        do {
            for (name, value) in try await authorizer.headers(for: authorizationRequest) {
                request.setValue(value, forHTTPHeaderField: name)
            }
        } catch is CancellationError {
            throw CancellationError()
        } catch {
            throw FeedbackError.authorizationFailed
        }

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch is CancellationError {
            throw CancellationError()
        } catch let error as URLError where error.code == .timedOut || error.code == .notConnectedToInternet {
            throw FeedbackError.temporarilyUnavailable
        } catch {
            throw FeedbackError.temporarilyUnavailable
        }

        guard let httpResponse = response as? HTTPURLResponse else {
            throw FeedbackError.invalidResponse
        }
        guard (200...299).contains(httpResponse.statusCode) else {
            throw FeedbackError.fromHTTPStatus(httpResponse.statusCode)
        }

        do {
            let decoder = JSONDecoder()
            return try decoder.decode(FeedbackReceipt.self, from: data)
        } catch {
            throw FeedbackError.invalidResponse
        }
    }

    private func makeRequestBody(for submission: FeedbackSubmission) throws -> Data {
        let body = FeedbackRequestV1(submission: submission)
        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
        return try encoder.encode(body)
    }
}

private struct FeedbackRequestV1: Encodable {
    let schemaVersion = 1
    let category: FeedbackCategory
    let message: String
    let replyEmail: String?
    let context: FeedbackContext

    init(submission: FeedbackSubmission) {
        category = submission.category
        message = submission.message
        replyEmail = submission.replyEmail
        context = submission.context
    }

    private enum CodingKeys: String, CodingKey {
        case schemaVersion
        case category
        case message
        case replyEmail
        case context
    }

    func encode(to encoder: any Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(schemaVersion, forKey: .schemaVersion)
        try container.encode(category, forKey: .category)
        try container.encode(message, forKey: .message)
        try container.encode(replyEmail, forKey: .replyEmail)
        try container.encode(context, forKey: .context)
    }
}

private extension Duration {
    var timeInterval: TimeInterval {
        let components = components
        return TimeInterval(components.seconds) + TimeInterval(components.attoseconds) / 1_000_000_000_000_000_000
    }
}
