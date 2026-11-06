import Foundation

/// Mirrors the server's limits so invalid submissions never leave the device.
/// All lengths are Unicode scalar counts.
public enum FeedbackSubmissionValidator {
    public static let messageMinimum = 4
    public static let messageMaximum = 2_000
    public static let nameMaximum = 120
    public static let emailMaximum = 254

    public static func validate(_ submission: FeedbackSubmission) throws {
        let messageLength = submission.message.unicodeScalars.count
        guard messageLength >= messageMinimum else { throw FeedbackValidationError.messageTooShort }
        guard messageLength <= messageMaximum else { throw FeedbackValidationError.messageTooLong }

        if let name = submission.name {
            guard name.unicodeScalars.count <= nameMaximum else {
                throw FeedbackValidationError.nameTooLong
            }
        }

        if let replyEmail = submission.replyEmail {
            guard replyEmail.unicodeScalars.count <= emailMaximum else {
                throw FeedbackValidationError.replyEmailTooLong
            }
            guard isValidEmail(replyEmail) else {
                throw FeedbackValidationError.invalidReplyEmail
            }
        }

        try validateContext(submission.context)
        try validateUser(submission.user)

        if let attachment = submission.attachment {
            guard attachment.data.count >= FeedbackAttachment.minimumBytes else {
                throw FeedbackValidationError.attachmentTooSmall
            }
            guard attachment.data.count <= FeedbackAttachment.maximumBytes else {
                throw FeedbackValidationError.attachmentTooLarge
            }
        }
    }

    public static func isValidEmail(_ value: String) -> Bool {
        guard !value.isEmpty, !value.contains(where: { $0.isWhitespace }) else { return false }
        guard value.unicodeScalars.count <= emailMaximum else { return false }
        guard let at = value.firstIndex(of: "@"), at != value.startIndex else { return false }
        let domain = value[at...].dropFirst()
        guard !domain.isEmpty, !domain.contains("@") else { return false }
        guard domain.contains(".") else { return false }
        guard !value.hasSuffix("."), !domain.hasPrefix(".") else { return false }
        return !value[..<at].hasSuffix(".")
    }

    private static func validateContext(_ context: FeedbackContext) throws {
        try validateField(context.appVersion, name: "app_version", minimum: 1, maximum: 40)
        try validateField(context.buildNumber, name: "build_number", minimum: 1, maximum: 40)
        try validateField(context.osVersion, name: "os_version", minimum: 1, maximum: 80)
        try validateField(context.locale, name: "locale", minimum: 2, maximum: 80)
        try validateField(context.deviceFamily, name: "device_family", minimum: 1, maximum: 80)
        if let model = context.deviceModel {
            try validateField(model, name: "device_model", minimum: 1, maximum: 80)
        }
    }

    private static func validateUser(_ user: FeedbackUserContext) throws {
        if let id = user.id, id.unicodeScalars.count > 200 {
            throw FeedbackValidationError.userFieldTooLong(field: "id")
        }
        if let plan = user.plan, plan.unicodeScalars.count > 200 {
            throw FeedbackValidationError.userFieldTooLong(field: "plan")
        }
        guard user.entitlements.count <= 20 else { throw FeedbackValidationError.tooManyEntitlements }
        for entitlement in user.entitlements {
            let length = entitlement.unicodeScalars.count
            guard length >= 1, length <= 200 else {
                throw FeedbackValidationError.userFieldTooLong(field: "entitlements")
            }
        }
        guard user.attributes.count <= 20 else { throw FeedbackValidationError.tooManyAttributes }
        for (key, value) in user.attributes {
            let keyLength = key.unicodeScalars.count
            guard keyLength >= 1, keyLength <= 80 else {
                throw FeedbackValidationError.userFieldTooLong(field: "attributes.\(key)")
            }
            guard value.unicodeScalars.count <= 500 else {
                throw FeedbackValidationError.userFieldTooLong(field: "attributes.\(key)")
            }
        }
    }

    private static func validateField(
        _ value: String,
        name: String,
        minimum: Int,
        maximum: Int
    ) throws {
        let length = value.unicodeScalars.count
        guard length >= minimum else {
            throw FeedbackValidationError.contextFieldEmpty(field: name)
        }
        guard length <= maximum else {
            throw FeedbackValidationError.contextFieldTooLong(field: name)
        }
    }
}
