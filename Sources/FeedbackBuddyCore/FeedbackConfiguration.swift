import Foundation

/// Where and how submissions are sent.
public struct FeedbackConfiguration: Equatable, Sendable {
    public static let publicKeyPrefix = "fb_pub_"
    public static let defaultEndpoint = URL(string: "https://feedback-buddy.swapnanildhol.workers.dev")!

    public let endpoint: URL
    public let apiKey: String
    public let requestTimeout: Duration
    public let attachmentRequestTimeout: Duration

    /// - Parameters:
    ///   - apiKey: a project public key (`fb_pub_…`) created in the dashboard.
    ///   - endpoint: the FeedbackBuddy server origin, without a path.
    public init(
        apiKey: String,
        endpoint: URL = FeedbackConfiguration.defaultEndpoint,
        requestTimeout: Duration = .seconds(15),
        attachmentRequestTimeout: Duration = .seconds(30)
    ) {
        self.apiKey = apiKey.trimmingCharacters(in: .whitespacesAndNewlines)
        self.endpoint = endpoint
        self.requestTimeout = requestTimeout
        self.attachmentRequestTimeout = attachmentRequestTimeout
    }

    public var hasValidAPIKey: Bool {
        apiKey.hasPrefix(Self.publicKeyPrefix)
            && apiKey.count > Self.publicKeyPrefix.count + 8
            && !apiKey.contains(where: { $0.isWhitespace })
    }

    public var submissionURL: URL {
        endpoint.appending(path: "v1/feedback")
    }
}
