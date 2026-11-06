public enum FeedbackValidationError: Error, Equatable, Sendable {
    case messageTooShort
    case messageTooLong
    case nameTooLong
    case replyEmailTooLong
    case invalidReplyEmail
    case contextFieldEmpty(field: String)
    case contextFieldTooLong(field: String)
    case userFieldTooLong(field: String)
    case tooManyEntitlements
    case tooManyAttributes
    case attachmentTooSmall
    case attachmentTooLarge
}
