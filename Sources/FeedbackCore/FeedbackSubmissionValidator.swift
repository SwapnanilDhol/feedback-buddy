import Foundation

public enum FeedbackSubmissionValidator {
    public static func validate(_ submission: FeedbackSubmission) throws {
        let messageLength = submission.message.unicodeScalars.count
        guard messageLength >= 4 else { throw FeedbackValidationError.messageTooShort }
        guard messageLength <= 2_000 else { throw FeedbackValidationError.messageTooLong }

        if let replyEmail = submission.replyEmail {
            guard replyEmail.unicodeScalars.count <= 254 else {
                throw FeedbackValidationError.replyEmailTooLong
            }
            guard isValidEmail(replyEmail) else {
                throw FeedbackValidationError.invalidReplyEmail
            }
        }

        try validateContext(submission.context)
    }

    private static func validateContext(_ context: FeedbackContext) throws {
        try validateContextField(context.appVersion, name: "app_version", maximum: 40, minimum: 1)
        try validateContextField(context.buildNumber, name: "build_number", maximum: 40, minimum: 1)
        try validateContextField(context.osVersion, name: "os_version", maximum: 80, minimum: 1)
        try validateContextField(context.locale, name: "locale", maximum: 80, minimum: 2)
        try validateContextField(context.deviceFamily, name: "device_family", maximum: 80, minimum: 1)
    }

    private static func validateContextField(
        _ value: String,
        name: String,
        maximum: Int,
        minimum: Int
    ) throws {
        let length = value.unicodeScalars.count
        guard length >= minimum else {
            throw FeedbackValidationError.contextFieldEmpty(field: name)
        }
        guard length <= maximum else {
            throw FeedbackValidationError.contextFieldTooLong(field: name)
        }
    }

    private static func isValidEmail(_ value: String) -> Bool {
        guard !value.isEmpty, !value.contains(where: { $0.isWhitespace }) else { return false }
        guard value.count <= 254 else { return false }
        guard let at = value.firstIndex(of: "@"), at != value.startIndex else { return false }
        guard value[at...].dropFirst().contains(".") else { return false }
        guard !value.hasSuffix(".") else { return false }
        return !value[..<at].hasSuffix(".")
    }
}
