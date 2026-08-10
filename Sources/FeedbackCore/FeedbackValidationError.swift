public enum FeedbackValidationError: Error, Equatable, Sendable {
    case messageTooShort
    case messageTooLong
    case replyEmailTooLong
    case invalidReplyEmail
    case contextFieldEmpty(field: String)
    case contextFieldTooLong(field: String)
}
