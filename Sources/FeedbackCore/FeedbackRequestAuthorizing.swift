public protocol FeedbackRequestAuthorizing: Sendable {
    func headers(
        for request: FeedbackAuthorizationRequest
    ) async throws -> [String: String]
}

public struct NoOpFeedbackRequestAuthorizer: FeedbackRequestAuthorizing {
    public init() {}

    public func headers(
        for request: FeedbackAuthorizationRequest
    ) async throws -> [String: String] {
        [:]
    }
}
