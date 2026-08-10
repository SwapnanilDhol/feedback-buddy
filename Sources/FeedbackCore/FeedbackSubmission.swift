public struct FeedbackSubmission: Encodable, Equatable, Sendable {
    public let category: FeedbackCategory
    public let message: String
    public let replyEmail: String?
    public let context: FeedbackContext

    public init(
        category: FeedbackCategory,
        message: String,
        replyEmail: String? = nil,
        context: FeedbackContext
    ) {
        self.category = category
        self.message = message.trimmingCharacters(in: .whitespacesAndNewlines)
        self.replyEmail = replyEmail?.trimmingCharacters(in: .whitespacesAndNewlines)
        self.context = context
    }

    public func validated() throws -> FeedbackSubmission {
        try FeedbackSubmissionValidator.validate(self)
        return self
    }
}
