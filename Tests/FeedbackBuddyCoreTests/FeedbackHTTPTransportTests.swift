import Foundation
import Testing
@testable import FeedbackBuddyCore

@Suite(.serialized)
struct FeedbackHTTPTransportTests {
    private let installationID = UUID(uuidString: "11111111-1111-4111-8111-111111111111")!
    private let idempotencyKey = UUID(uuidString: "22222222-2222-4222-8222-222222222222")!
    private let context = FeedbackContext(
        appVersion: "5.0", buildNumber: "400", osVersion: "26.0", locale: "en-IN", deviceFamily: "iPhone"
    )
    private let receiptJSON = #"{"feedback_id":"33333333-3333-4333-8333-333333333333","duplicate":false,"delivery_status":"accepted"}"#

    private func makeTransport(
        apiKey: String = "fb_pub_abcdefghijklmnopqrstuv",
        status: Int = 202,
        body: String? = nil,
        authorizer: (any FeedbackRequestAuthorizing)? = nil
    ) -> (FeedbackHTTPTransport, RequestRecorder) {
        let recorder = RequestRecorder(status: status, body: Data((body ?? receiptJSON).utf8))
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [RecordingURLProtocol.self]
        RecordingURLProtocol.recorder = recorder
        let transport = FeedbackHTTPTransport(
            configuration: FeedbackConfiguration(apiKey: apiKey, endpoint: URL(string: "https://feedback.example")!),
            installationIdentifier: StubInstallationIdentifier(id: installationID),
            authorizer: authorizer,
            session: URLSession(configuration: configuration)
        )
        return (transport, recorder)
    }

    @Test("sends the JSON contract request with bearer key and identity headers")
    func sendsJSONRequest() async throws {
        let (transport, recorder) = makeTransport()
        let submission = FeedbackSubmission(category: .bug, message: "The wind card clips.", context: context)

        let receipt = try await transport.submit(submission, idempotencyKey: idempotencyKey)
        #expect(receipt.feedbackID.uuidString.lowercased() == "33333333-3333-4333-8333-333333333333")
        #expect(receipt.deliveryStatus == .accepted)

        let request = try #require(recorder.request)
        #expect(request.url?.absoluteString == "https://feedback.example/v1/feedback")
        #expect(request.httpMethod == "POST")
        #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer fb_pub_abcdefghijklmnopqrstuv")
        #expect(request.value(forHTTPHeaderField: "X-Feedback-Installation-ID") == "11111111-1111-4111-8111-111111111111")
        #expect(request.value(forHTTPHeaderField: "Idempotency-Key") == "22222222-2222-4222-8222-222222222222")
        #expect(request.value(forHTTPHeaderField: "Content-Type") == "application/json")
        #expect(request.timeoutInterval == 15)

        let body = try #require(recorder.body)
        let object = try #require(JSONSerialization.jsonObject(with: body) as? [String: Any])
        #expect(object["schema_version"] as? Int == 1)
        #expect(object["category"] as? String == "bug")
        #expect(object["name"] is NSNull)
        #expect(object["reply_email"] is NSNull)
        #expect(object["user"] == nil)
    }

    @Test("sends multipart when an attachment is present")
    func sendsMultipartRequest() async throws {
        let (transport, recorder) = makeTransport()
        let imageBytes = Data([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10])
        let submission = FeedbackSubmission(
            category: .feedback, message: "Screenshot attached.", context: context,
            attachment: FeedbackAttachment(fileName: "feedback.jpg", contentType: .jpeg, data: imageBytes)
        )

        _ = try await transport.submit(submission, idempotencyKey: idempotencyKey)

        let request = try #require(recorder.request)
        let contentType = try #require(request.value(forHTTPHeaderField: "Content-Type"))
        #expect(contentType.hasPrefix("multipart/form-data; boundary=FeedbackBuddy-"))
        #expect(request.timeoutInterval == 30)
        let boundary = String(contentType.dropFirst("multipart/form-data; boundary=".count))
        let body = try #require(recorder.body)
        let text = String(decoding: body, as: UTF8.self)
        #expect(text.contains("--\(boundary)\r\nContent-Disposition: form-data; name=\"payload\"\r\nContent-Type: application/json\r\n\r\n"))
        #expect(text.contains("Content-Disposition: form-data; name=\"attachment\"; filename=\"feedback.jpg\"\r\nContent-Type: image/jpeg\r\n\r\n"))
        #expect(text.hasSuffix("\r\n--\(boundary)--\r\n"))
        #expect(body.range(of: imageBytes) != nil)
        #expect(text.contains("\"schema_version\":1"))
    }

    @Test("maps HTTP statuses to FeedbackError", arguments: [
        (400, FeedbackError.invalidSubmission), (413, .invalidSubmission), (415, .invalidSubmission),
        (422, .invalidSubmission), (401, .projectRejected), (403, .projectRejected),
        (404, .projectUnavailable), (409, .conflict), (429, .rateLimited),
        (500, .temporarilyUnavailable), (503, .temporarilyUnavailable), (418, .rejected(statusCode: 418)),
    ])
    func mapsStatuses(status: Int, expected: FeedbackError) async throws {
        let (transport, _) = makeTransport(status: status, body: #"{"error":"x"}"#)
        let submission = FeedbackSubmission(category: .bug, message: "Something broke.", context: context)
        await #expect(throws: expected) {
            try await transport.submit(submission, idempotencyKey: idempotencyKey)
        }
    }

    @Test("rejects invalid configuration and submissions before any request")
    func rejectsLocally() async throws {
        let (badKey, recorder) = makeTransport(apiKey: "nope")
        await #expect(throws: FeedbackError.invalidConfiguration) {
            try await badKey.submit(FeedbackSubmission(category: .bug, message: "Valid.", context: context), idempotencyKey: idempotencyKey)
        }
        #expect(recorder.request == nil)

        let (transport, recorder2) = makeTransport()
        await #expect(throws: FeedbackError.invalidSubmission) {
            try await transport.submit(FeedbackSubmission(category: .bug, message: "no", context: context), idempotencyKey: idempotencyKey)
        }
        #expect(recorder2.request == nil)
    }

    @Test("maps invalid receipts and authorizer failures")
    func mapsInvalidReceiptAndAuthorizer() async throws {
        let (transport, _) = makeTransport(body: "not json")
        let submission = FeedbackSubmission(category: .bug, message: "Something broke.", context: context)
        await #expect(throws: FeedbackError.invalidResponse) {
            try await transport.submit(submission, idempotencyKey: idempotencyKey)
        }

        let (failing, _) = makeTransport(authorizer: FailingAuthorizer())
        await #expect(throws: FeedbackError.authorizationFailed) {
            try await failing.submit(submission, idempotencyKey: idempotencyKey)
        }
    }
}

private struct StubInstallationIdentifier: FeedbackInstallationIdentifying {
    let id: UUID
    func installationID() async throws -> UUID { id }
}

private struct FailingAuthorizer: FeedbackRequestAuthorizing {
    struct Failure: Error {}
    func headers(for request: FeedbackAuthorizationRequest) async throws -> [String: String] { throw Failure() }
}

private final class RequestRecorder: @unchecked Sendable {
    var request: URLRequest?
    var body: Data?
    let status: Int
    let responseBody: Data

    init(status: Int, body: Data) {
        self.status = status
        responseBody = body
    }
}

private final class RecordingURLProtocol: URLProtocol, @unchecked Sendable {
    nonisolated(unsafe) static var recorder: RequestRecorder?

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        let body = request.httpBody ?? request.httpBodyStream.flatMap { stream in
            stream.open()
            defer { stream.close() }
            return stream.readAllData()
        }
        let recorder = Self.recorder
        recorder?.request = request
        recorder?.body = body
        let response = HTTPURLResponse(
            url: request.url!, statusCode: recorder?.status ?? 202, httpVersion: nil,
            headerFields: ["Content-Type": "application/json"]
        )!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: recorder?.responseBody ?? Data())
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}

private extension InputStream {
    func readAllData() -> Data {
        var data = Data()
        let bufferSize = 4_096
        let buffer = UnsafeMutablePointer<UInt8>.allocate(capacity: bufferSize)
        defer { buffer.deallocate() }
        while hasBytesAvailable {
            let read = self.read(buffer, maxLength: bufferSize)
            if read <= 0 { break }
            data.append(buffer, count: read)
        }
        return data
    }
}
