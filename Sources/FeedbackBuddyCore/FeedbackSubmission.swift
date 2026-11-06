import Foundation

/// A complete, client-side feedback submission. Call ``validated()`` before
/// sending; ``FeedbackHTTPTransport`` does this for you.
public struct FeedbackSubmission: Equatable, Sendable {
    public let category: FeedbackCategory
    public let message: String
    public let name: String?
    public let replyEmail: String?
    public let context: FeedbackContext
    public let user: FeedbackUserContext
    public let attachment: FeedbackAttachment?

    public init(
        category: FeedbackCategory,
        message: String,
        name: String? = nil,
        replyEmail: String? = nil,
        context: FeedbackContext,
        user: FeedbackUserContext = .anonymous,
        attachment: FeedbackAttachment? = nil
    ) {
        self.category = category
        self.message = message.trimmingCharacters(in: .whitespacesAndNewlines)
        self.name = Self.optionalTrimmed(name)
        self.replyEmail = Self.optionalTrimmed(replyEmail)
        self.context = context
        self.user = user
        self.attachment = attachment
    }

    public func validated() throws -> FeedbackSubmission {
        try FeedbackSubmissionValidator.validate(self)
        return self
    }

    private static func optionalTrimmed(_ value: String?) -> String? {
        guard let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines),
              !trimmed.isEmpty else { return nil }
        return trimmed
    }
}

/// The versioned JSON envelope sent on the wire (`schema_version` 1).
/// `name` and `reply_email` are always present (null when absent); `user` is
/// omitted entirely when anonymous.
public struct FeedbackRequestEnvelopeV1: Encodable, Sendable {
    public let schemaVersion = 1
    public let category: FeedbackCategory
    public let message: String
    public let name: String?
    public let replyEmail: String?
    public let context: FeedbackContext
    public let user: FeedbackUserContext?

    public init(submission: FeedbackSubmission) {
        category = submission.category
        message = submission.message
        name = submission.name
        replyEmail = submission.replyEmail
        context = submission.context
        user = submission.user.isAnonymous ? nil : submission.user
    }

    private enum CodingKeys: String, CodingKey {
        case schemaVersion = "schema_version"
        case category
        case message
        case name
        case replyEmail = "reply_email"
        case context
        case user
    }

    public func encode(to encoder: any Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(schemaVersion, forKey: .schemaVersion)
        try container.encode(category, forKey: .category)
        try container.encode(message, forKey: .message)
        try container.encode(name, forKey: .name)
        try container.encode(replyEmail, forKey: .replyEmail)
        try container.encode(context, forKey: .context)
        try container.encodeIfPresent(user, forKey: .user)
    }

    public func encoded() throws -> Data {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        return try encoder.encode(self)
    }
}
