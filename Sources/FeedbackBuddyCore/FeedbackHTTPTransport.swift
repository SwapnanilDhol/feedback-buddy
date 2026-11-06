import Foundation

/// Speaks the FeedbackBuddy HTTP contract v1 (`POST /v1/feedback`).
public struct FeedbackHTTPTransport: FeedbackTransport, @unchecked Sendable {
    public static let installationHeader = "X-Feedback-Installation-ID"
    public static let idempotencyHeader = "Idempotency-Key"

    private let configuration: FeedbackConfiguration
    private let installationIdentifier: any FeedbackInstallationIdentifying
    private let authorizer: any FeedbackRequestAuthorizing
    private let session: URLSession

    public init(
        configuration: FeedbackConfiguration,
        installationIdentifier: any FeedbackInstallationIdentifying,
        authorizer: (any FeedbackRequestAuthorizing)? = nil,
        session: URLSession = .shared
    ) {
        self.configuration = configuration
        self.installationIdentifier = installationIdentifier
        self.authorizer = authorizer ?? BearerKeyFeedbackRequestAuthorizer(apiKey: configuration.apiKey)
        self.session = session
    }

    public func submit(
        _ submission: FeedbackSubmission,
        idempotencyKey: UUID
    ) async throws -> FeedbackReceipt {
        guard configuration.hasValidAPIKey else {
            throw FeedbackError.invalidConfiguration
        }
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

        let request = try await makeRequest(
            for: submission,
            installationID: installationID,
            idempotencyKey: idempotencyKey
        )

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch is CancellationError {
            throw CancellationError()
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
            return try JSONDecoder().decode(FeedbackReceipt.self, from: data)
        } catch {
            throw FeedbackError.invalidResponse
        }
    }

    /// Builds the fully-formed request. Exposed for tests and custom transports.
    public func makeRequest(
        for submission: FeedbackSubmission,
        installationID: UUID,
        idempotencyKey: UUID
    ) async throws -> URLRequest {
        let payload = try FeedbackRequestEnvelopeV1(submission: submission).encoded()
        let url = configuration.submissionURL
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue(installationID.uuidString.lowercased(), forHTTPHeaderField: Self.installationHeader)
        request.setValue(idempotencyKey.uuidString.lowercased(), forHTTPHeaderField: Self.idempotencyHeader)
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        if let attachment = submission.attachment {
            let boundary = "FeedbackBuddy-\(UUID().uuidString)"
            request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
            request.httpBody = Self.multipartBody(payload: payload, attachment: attachment, boundary: boundary)
            request.timeoutInterval = configuration.attachmentRequestTimeout.timeInterval
        } else {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = payload
            request.timeoutInterval = configuration.requestTimeout.timeInterval
        }

        let authorizationRequest = FeedbackAuthorizationRequest(
            endpoint: url,
            method: "POST",
            body: request.httpBody ?? Data()
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
        return request
    }

    public static func multipartBody(
        payload: Data,
        attachment: FeedbackAttachment,
        boundary: String
    ) -> Data {
        var body = Data()
        body.appendUTF8("--\(boundary)\r\n")
        body.appendUTF8("Content-Disposition: form-data; name=\"payload\"\r\n")
        body.appendUTF8("Content-Type: application/json\r\n\r\n")
        body.append(payload)
        body.appendUTF8("\r\n--\(boundary)\r\n")
        body.appendUTF8("Content-Disposition: form-data; name=\"attachment\"; filename=\"\(attachment.fileName)\"\r\n")
        body.appendUTF8("Content-Type: \(attachment.contentType.rawValue)\r\n\r\n")
        body.append(attachment.data)
        body.appendUTF8("\r\n--\(boundary)--\r\n")
        return body
    }
}

private extension Data {
    mutating func appendUTF8(_ value: String) {
        append(Data(value.utf8))
    }
}

extension Duration {
    var timeInterval: TimeInterval {
        let components = components
        return TimeInterval(components.seconds)
            + TimeInterval(components.attoseconds) / 1_000_000_000_000_000_000
    }
}
