import Foundation

public struct FeedbackContext: Codable, Equatable, Sendable {
    public let appVersion: String
    public let buildNumber: String
    public let osVersion: String
    public let locale: String
    public let deviceFamily: String

    public init(
        appVersion: String,
        buildNumber: String,
        osVersion: String,
        locale: String,
        deviceFamily: String
    ) {
        self.appVersion = appVersion.trimmingCharacters(in: .whitespacesAndNewlines)
        self.buildNumber = buildNumber.trimmingCharacters(in: .whitespacesAndNewlines)
        self.osVersion = osVersion.trimmingCharacters(in: .whitespacesAndNewlines)
        self.locale = locale.trimmingCharacters(in: .whitespacesAndNewlines)
        self.deviceFamily = deviceFamily.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
