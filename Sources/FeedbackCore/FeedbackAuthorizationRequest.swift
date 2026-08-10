import Foundation

public struct FeedbackAuthorizationRequest: Sendable {
    public let endpoint: URL
    public let method: String
    public let body: Data

    public init(endpoint: URL, method: String, body: Data) {
        self.endpoint = endpoint
        self.method = method
        self.body = body
    }
}
