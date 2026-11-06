import Foundation

/// App and device context attached to every submission.
public struct FeedbackContext: Codable, Equatable, Sendable {
    public let appVersion: String
    public let buildNumber: String
    public let osVersion: String
    public let locale: String
    public let deviceFamily: String
    public let deviceModel: String?

    public init(
        appVersion: String,
        buildNumber: String,
        osVersion: String,
        locale: String,
        deviceFamily: String,
        deviceModel: String? = nil
    ) {
        self.appVersion = appVersion.trimmingCharacters(in: .whitespacesAndNewlines)
        self.buildNumber = buildNumber.trimmingCharacters(in: .whitespacesAndNewlines)
        self.osVersion = osVersion.trimmingCharacters(in: .whitespacesAndNewlines)
        self.locale = locale.trimmingCharacters(in: .whitespacesAndNewlines)
        self.deviceFamily = deviceFamily.trimmingCharacters(in: .whitespacesAndNewlines)
        let model = deviceModel?.trimmingCharacters(in: .whitespacesAndNewlines)
        self.deviceModel = (model?.isEmpty ?? true) ? nil : model
    }

    private enum CodingKeys: String, CodingKey {
        case appVersion = "app_version"
        case buildNumber = "build_number"
        case osVersion = "os_version"
        case locale
        case deviceFamily = "device_family"
        case deviceModel = "device_model"
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.init(
            appVersion: try container.decode(String.self, forKey: .appVersion),
            buildNumber: try container.decode(String.self, forKey: .buildNumber),
            osVersion: try container.decode(String.self, forKey: .osVersion),
            locale: try container.decode(String.self, forKey: .locale),
            deviceFamily: try container.decode(String.self, forKey: .deviceFamily),
            deviceModel: try container.decodeIfPresent(String.self, forKey: .deviceModel)
        )
    }

    public func encode(to encoder: any Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(appVersion, forKey: .appVersion)
        try container.encode(buildNumber, forKey: .buildNumber)
        try container.encode(osVersion, forKey: .osVersion)
        try container.encode(locale, forKey: .locale)
        try container.encode(deviceFamily, forKey: .deviceFamily)
        try container.encodeIfPresent(deviceModel, forKey: .deviceModel)
    }
}
