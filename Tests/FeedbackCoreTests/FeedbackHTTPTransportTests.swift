import Foundation
import Testing
@testable import FeedbackCore

struct FeedbackHTTPTransportTests {
    @Test("sends the versioned request with stable identity headers")
    func sendsContractRequest() async throws {
        let expectedInstallationID = UUID(uuidString: "11111111-1111-4111-8111-111111111111")!
        let expectedIdempotencyKey = UUID(uuidString: "22222222-2222-4222-8222-222222222222")!
        let recorder = RequestRecorder()
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [RecordingURLProtocol.self]
        RecordingURLProtocol.recorder = recorder

        let transport = FeedbackHTTPTransport(
            configuration: FeedbackConfiguration(endpoint: URL(string: "https://feedback.example")!, projectID: "my-app"),
            installationIdentifier: TestInstallationIdentifier(id: expectedInstallationID),
            session: URLSession(configuration: configuration)
        )
        let submission = FeedbackSubmission(
            category: .bug,
            message: "The wind card clips.",
            context: FeedbackContext(
                appVersion: "5.0",
                buildNumber: "400",
                osVersion: "26.0",
                locale: "en-IN",
                deviceFamily: "iPhone"
            )
        )

        let receipt = try await transport.submit(submission, idempotencyKey: expectedIdempotencyKey)
        #expect(receipt.feedbackID.uuidString == "33333333-3333-4333-8333-333333333333")
        #expect(recorder.request?.url?.absoluteString == "https://feedback.example/v1/feedback")
        #expect(recorder.request?.value(forHTTPHeaderField: "X-Feedback-Project-ID") == "my-app")
        #expect(recorder.request?.value(forHTTPHeaderField: "X-Feedback-Installation-ID") == expectedInstallationID.uuidString)
        #expect(recorder.request?.value(forHTTPHeaderField: "Idempotency-Key") == expectedIdempotencyKey.uuidString)

        let body = try #require(recorder.body)
        let object = try #require(JSONSerialization.jsonObject(with: body) as? [String: Any])
        #expect(object["schema_version"] as? Int == 1)
        #expect(object["category"] as? String == "bug")
        #expect(object["reply_email"] is NSNull)
    }
}

private final class RequestRecorder: @unchecked Sendable {
    var request: URLRequest?
    var body: Data?
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
        Self.recorder?.request = request
        Self.recorder?.body = body

        let response = HTTPURLResponse(
            url: request.url!,
            statusCode: 202,
            httpVersion: nil,
            headerFields: ["Content-Type": "application/json"]
        )!
        let data = Data(#"{"feedback_id":"33333333-3333-4333-8333-333333333333","duplicate":false,"delivery_status":"accepted"}"#.utf8)
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: data)
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}

private struct TestInstallationIdentifier: FeedbackInstallationIdentifying {
    let id: UUID

    func installationID() async throws -> UUID { id }
}

private extension InputStream {
    func readAllData() -> Data {
        var data = Data()
        var buffer = [UInt8](repeating: 0, count: 4096)
        while hasBytesAvailable {
            let count = read(&buffer, maxLength: buffer.count)
            guard count > 0 else { break }
            data.append(buffer, count: count)
        }
        return data
    }
}
