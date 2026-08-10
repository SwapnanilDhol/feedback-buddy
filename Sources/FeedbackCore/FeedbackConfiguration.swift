import Foundation

public struct FeedbackConfiguration: Sendable {
    public let endpoint: URL
    public let projectID: String
    public let requestTimeout: Duration

    public init(
        endpoint: URL,
        projectID: String,
        requestTimeout: Duration = .seconds(15)
    ) {
        self.endpoint = endpoint
        self.projectID = projectID
        self.requestTimeout = requestTimeout
    }
}
