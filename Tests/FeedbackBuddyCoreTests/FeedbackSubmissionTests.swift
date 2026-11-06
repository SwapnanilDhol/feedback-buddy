import Foundation
import Testing
@testable import FeedbackBuddyCore

struct FeedbackSubmissionTests {
    private let context = FeedbackContext(
        appVersion: "5.0", buildNumber: "400", osVersion: "26.0", locale: "en-IN", deviceFamily: "iPhone"
    )

    @Test("validates message boundaries using Unicode scalar counts")
    func validatesMessageBoundaries() throws {
        let minimum = FeedbackSubmission(category: .bug, message: "🐛🐛🐛🐛", context: context)
        #expect(throws: Never.self) { try minimum.validated() }

        let tooShort = FeedbackSubmission(category: .bug, message: "🐛🐛🐛", context: context)
        #expect(throws: FeedbackValidationError.messageTooShort) { try tooShort.validated() }

        let maximum = String(repeating: "🛠️", count: 1_000)
        #expect(throws: Never.self) {
            try FeedbackSubmission(category: .idea, message: maximum, context: context).validated()
        }
        #expect(throws: FeedbackValidationError.messageTooLong) {
            try FeedbackSubmission(category: .idea, message: maximum + "x", context: context).validated()
        }
    }

    @Test("validates name, email, context, user and attachment limits")
    func validatesOtherLimits() {
        func submission(
            name: String? = nil,
            email: String? = nil,
            context: FeedbackContext? = nil,
            user: FeedbackUserContext = .anonymous,
            attachment: FeedbackAttachment? = nil
        ) -> FeedbackSubmission {
            FeedbackSubmission(
                category: .feedback, message: "A valid message", name: name, replyEmail: email,
                context: context ?? self.context, user: user, attachment: attachment
            )
        }

        #expect(throws: Never.self) { try submission(name: String(repeating: "n", count: 120)).validated() }
        #expect(throws: FeedbackValidationError.nameTooLong) {
            try submission(name: String(repeating: "n", count: 121)).validated()
        }
        #expect(throws: FeedbackValidationError.invalidReplyEmail) { try submission(email: "not-an-email").validated() }
        #expect(throws: FeedbackValidationError.invalidReplyEmail) { try submission(email: "a@b").validated() }
        #expect(throws: FeedbackValidationError.invalidReplyEmail) { try submission(email: "a b@c.d").validated() }
        #expect(throws: Never.self) { try submission(email: "user@example.com").validated() }
        #expect(throws: FeedbackValidationError.replyEmailTooLong) {
            try submission(email: String(repeating: "a", count: 250) + "@b.co").validated()
        }

        let shortLocale = FeedbackContext(appVersion: "5.0", buildNumber: "1", osVersion: "26", locale: "x", deviceFamily: "iPhone")
        #expect(throws: FeedbackValidationError.contextFieldEmpty(field: "locale")) {
            try submission(context: shortLocale).validated()
        }
        let longModel = FeedbackContext(
            appVersion: "5.0", buildNumber: "1", osVersion: "26", locale: "en", deviceFamily: "iPhone",
            deviceModel: String(repeating: "m", count: 81)
        )
        #expect(throws: FeedbackValidationError.contextFieldTooLong(field: "device_model")) {
            try submission(context: longModel).validated()
        }

        #expect(throws: FeedbackValidationError.tooManyEntitlements) {
            try submission(user: .init(entitlements: Array(repeating: "e", count: 21))).validated()
        }
        let manyAttributes = Dictionary(uniqueKeysWithValues: (0..<21).map { ("k\($0)", "v") })
        #expect(throws: FeedbackValidationError.tooManyAttributes) {
            try submission(user: .init(attributes: manyAttributes)).validated()
        }
        #expect(throws: FeedbackValidationError.userFieldTooLong(field: "attributes.k")) {
            try submission(user: .init(attributes: ["k": String(repeating: "v", count: 501)])).validated()
        }
        #expect(throws: FeedbackValidationError.userFieldTooLong(field: "id")) {
            try submission(user: .init(id: String(repeating: "i", count: 201))).validated()
        }

        #expect(throws: FeedbackValidationError.attachmentTooSmall) {
            try submission(attachment: .init(fileName: "a.jpg", contentType: .jpeg, data: Data([1, 2, 3]))).validated()
        }
        #expect(throws: FeedbackValidationError.attachmentTooLarge) {
            try submission(attachment: .init(
                fileName: "a.jpg", contentType: .jpeg, data: Data(count: FeedbackAttachment.maximumBytes + 1)
            )).validated()
        }
    }

    @Test("normalizes whitespace and blank optionals")
    func normalizes() {
        let submission = FeedbackSubmission(
            category: .feedback, message: "  A useful thought  ", name: "   ", replyEmail: "  user@example.com ",
            context: context, user: .init(id: " ", plan: " pro ")
        )
        #expect(submission.message == "A useful thought")
        #expect(submission.name == nil)
        #expect(submission.replyEmail == "user@example.com")
        #expect(submission.user.id == nil)
        #expect(submission.user.plan == "pro")
    }

    @Test("minimum envelope matches the shared fixture")
    func minimumEnvelopeMatchesFixture() throws {
        let submission = FeedbackSubmission(
            category: .bug, message: "The wind card clips when gusts are shown.", context: context
        )
        var expected = try fixture("minimum-valid-submission.json")
        // The envelope always sends name/reply_email (null when absent).
        expected["name"] = NSNull()
        expected["reply_email"] = NSNull()
        let encoded = try FeedbackRequestEnvelopeV1(submission: submission).encoded()
        let actual = try #require(JSONSerialization.jsonObject(with: encoded) as? [String: Any])
        #expect(NSDictionary(dictionary: actual) == NSDictionary(dictionary: expected))
        #expect(actual["user"] == nil, "anonymous user is omitted")
    }

    @Test("full envelope matches the shared fixture exactly")
    func fullEnvelopeMatchesFixture() throws {
        let submission = FeedbackSubmission(
            category: .idea,
            message: "Please add a dark mode option for the history screen.",
            name: "Swapnanil",
            replyEmail: "user@example.com",
            context: FeedbackContext(
                appVersion: "5.0", buildNumber: "400", osVersion: "26.0", locale: "en-IN",
                deviceFamily: "iPhone", deviceModel: "iPhone17,1"
            ),
            user: FeedbackUserContext(
                id: "$RCAnonymousID:1f2e3d4c", accountStatus: .paid, plan: "pro_annual",
                entitlements: ["pro"], attributes: ["theme": "dark", "onboarding": "complete"]
            )
        )
        let expected = try fixture("full-submission.json")
        let encoded = try FeedbackRequestEnvelopeV1(submission: submission).encoded()
        let actual = try #require(JSONSerialization.jsonObject(with: encoded) as? [String: Any])
        #expect(NSDictionary(dictionary: actual) == NSDictionary(dictionary: expected))
    }

    @Test("decodes receipts including future statuses")
    func decodesReceipts() throws {
        func decode(_ status: String) throws -> FeedbackReceipt {
            try JSONDecoder().decode(FeedbackReceipt.self, from: Data(
                #"{"feedback_id":"33333333-3333-4333-8333-333333333333","duplicate":true,"delivery_status":"\#(status)"}"#.utf8
            ))
        }
        #expect(try decode("accepted").deliveryStatus == .accepted)
        #expect(try decode("delivered").deliveryStatus == .delivered)
        #expect(try decode("failed").deliveryStatus == .failed)
        #expect(try decode("paused").deliveryStatus == .unknown("paused"))
        #expect(try decode("accepted").duplicate == true)
        #expect(try decode("accepted").shortReference == "33333333")

        let fixtureData = try Data(contentsOf: fixtureURL("accepted-receipt.json"))
        let receipt = try JSONDecoder().decode(FeedbackReceipt.self, from: fixtureData)
        #expect(receipt.feedbackID.uuidString.lowercased() == "33333333-3333-4333-8333-333333333333")
    }

    @Test("validates public API keys")
    func validatesAPIKeys() {
        #expect(FeedbackConfiguration(apiKey: "fb_pub_abcdefghijklmnopqrstuv").hasValidAPIKey)
        #expect(FeedbackConfiguration(apiKey: " fb_pub_abcdefghijklmnopqrstuv\n").hasValidAPIKey)
        #expect(!FeedbackConfiguration(apiKey: "fb_sec_abcdefghijklmnopqrstuv").hasValidAPIKey)
        #expect(!FeedbackConfiguration(apiKey: "fb_pub_short").hasValidAPIKey)
        #expect(!FeedbackConfiguration(apiKey: "").hasValidAPIKey)
        #expect(FeedbackConfiguration(apiKey: "fb_pub_x").submissionURL.absoluteString
            == "https://feedback-buddy.swapnanildhol.workers.dev/v1/feedback")
    }

    // MARK: Fixtures

    private func fixtureURL(_ name: String) -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("contracts/fixtures/\(name)")
    }

    private func fixture(_ name: String) throws -> [String: Any] {
        try #require(JSONSerialization.jsonObject(with: Data(contentsOf: fixtureURL(name))) as? [String: Any])
    }
}
