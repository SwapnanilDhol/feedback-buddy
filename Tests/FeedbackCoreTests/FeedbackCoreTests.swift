import Foundation
import Testing
@testable import FeedbackCore

struct FeedbackCoreTests {
    private let context = FeedbackContext(
        appVersion: "5.0",
        buildNumber: "400",
        osVersion: "26.0",
        locale: "en-IN",
        deviceFamily: "iPhone"
    )

    @Test("validates Unicode scalar boundaries")
    func validatesMessageBoundaries() throws {
        let minimum = FeedbackSubmission(category: .bug, message: "🐛🐛🐛🐛", context: context)
        #expect(throws: Never.self) { try minimum.validated() }

        let tooShort = FeedbackSubmission(category: .bug, message: "🐛🐛🐛", context: context)
        #expect(throws: FeedbackValidationError.messageTooShort) { try tooShort.validated() }

        let maximum = String(repeating: "🛠️", count: 1_000)
        let validMaximum = FeedbackSubmission(category: .idea, message: maximum, context: context)
        #expect(throws: Never.self) { try validMaximum.validated() }

        let tooLong = FeedbackSubmission(category: .idea, message: maximum + "x", context: context)
        #expect(throws: FeedbackValidationError.messageTooLong) { try tooLong.validated() }
    }

    @Test("normalizes whitespace and encodes the versioned request")
    func normalizesAndEncodesRequest() throws {
        let submission = FeedbackSubmission(
            category: .feedback,
            message: "  A useful thought  ",
            replyEmail: "  user@example.com ",
            context: context
        )
        #expect(submission.message == "A useful thought")
        #expect(submission.replyEmail == "user@example.com")

        let encoded = try JSONEncoder().encode(submission)
        let object = try #require(JSONSerialization.jsonObject(with: encoded) as? [String: Any])
        #expect(object["category"] as? String == "feedback")
        #expect(object["message"] as? String == "A useful thought")
        #expect(object["replyEmail"] as? String == "user@example.com")
    }

    @Test("decodes future receipt status without failing")
    func decodesUnknownStatus() throws {
        let data = Data(#"{"feedback_id":"33333333-3333-4333-8333-333333333333","duplicate":false,"delivery_status":"paused"}"#.utf8)
        let decoder = JSONDecoder()
        let receipt = try decoder.decode(FeedbackReceipt.self, from: data)
        #expect(receipt.deliveryStatus == .unknown("paused"))
    }

    @Test("rejects invalid email and context")
    func rejectsInvalidFields() {
        let invalidEmail = FeedbackSubmission(
            category: .feedback,
            message: "A valid message",
            replyEmail: "not-an-email",
            context: context
        )
        #expect(throws: FeedbackValidationError.invalidReplyEmail) { try invalidEmail.validated() }

        let invalidLocale = FeedbackSubmission(
            category: .feedback,
            message: "A valid message",
            context: FeedbackContext(
                appVersion: "5.0",
                buildNumber: "400",
                osVersion: "26.0",
                locale: "x",
                deviceFamily: "iPhone"
            )
        )
        #expect(throws: FeedbackValidationError.contextFieldEmpty(field: "locale")) { try invalidLocale.validated() }
    }

    @Test("decodes the shared minimum submission fixture")
    func decodesSharedSubmissionFixture() throws {
        let fixtureURL = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("contracts/fixtures/minimum-valid-submission.json")
        let data = try Data(contentsOf: fixtureURL)
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        let fixture = try decoder.decode(SubmissionFixture.self, from: data)

        #expect(fixture.schemaVersion == 1)
        #expect(fixture.category == .bug)
        #expect(fixture.message == "The wind card clips when gusts are shown.")
        #expect(fixture.replyEmail == nil)
        #expect(fixture.context.deviceFamily == "iPhone")
    }
}

private struct SubmissionFixture: Decodable {
    let schemaVersion: Int
    let category: FeedbackCategory
    let message: String
    let replyEmail: String?
    let context: FeedbackContext
}

private struct StubInstallationIdentifier: FeedbackInstallationIdentifying {
    let id: UUID

    func installationID() async throws -> UUID { id }
}

private struct StubContextProvider: FeedbackContextProviding {
    let value: FeedbackContext

    func context() async -> FeedbackContext { value }
}

private struct StubTransport: FeedbackTransport {
    let receipt: FeedbackReceipt

    func submit(
        _ submission: FeedbackSubmission,
        idempotencyKey: UUID
    ) async throws -> FeedbackReceipt { receipt }
}
