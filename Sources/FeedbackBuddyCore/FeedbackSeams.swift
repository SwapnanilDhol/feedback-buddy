import Foundation

/// Provides the stable, pseudonymous installation identity sent with each
/// submission. Hosts may persist it however they like; the iOS module ships a
/// Keychain-backed implementation.
public protocol FeedbackInstallationIdentifying: Sendable {
    func installationID() async throws -> UUID
}

/// Provides app/device context at submission time.
public protocol FeedbackContextProviding: Sendable {
    func context() async -> FeedbackContext
}

public struct StaticFeedbackContextProvider: FeedbackContextProviding {
    public let value: FeedbackContext

    public init(_ value: FeedbackContext) {
        self.value = value
    }

    public func context() async -> FeedbackContext { value }
}

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

/// Adds authentication headers. The default sends the project public key as a
/// bearer token; hosts can layer App Attest or similar on top.
public protocol FeedbackRequestAuthorizing: Sendable {
    func headers(for request: FeedbackAuthorizationRequest) async throws -> [String: String]
}

public struct BearerKeyFeedbackRequestAuthorizer: FeedbackRequestAuthorizing {
    private let apiKey: String

    public init(apiKey: String) {
        self.apiKey = apiKey
    }

    public func headers(for request: FeedbackAuthorizationRequest) async throws -> [String: String] {
        ["Authorization": "Bearer \(apiKey)"]
    }
}

public struct NoOpFeedbackRequestAuthorizer: FeedbackRequestAuthorizing {
    public init() {}

    public func headers(for request: FeedbackAuthorizationRequest) async throws -> [String: String] {
        [:]
    }
}

public protocol FeedbackTransport: Sendable {
    func submit(_ submission: FeedbackSubmission, idempotencyKey: UUID) async throws -> FeedbackReceipt
}
