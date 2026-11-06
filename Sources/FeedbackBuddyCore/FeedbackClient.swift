import Foundation

/// Convenience wrapper that assembles a submission from the configured
/// providers and sends it through a transport.
public struct FeedbackClient: Sendable {
    private let transport: any FeedbackTransport
    private let contextProvider: any FeedbackContextProviding
    private let userContextProvider: any FeedbackUserContextProviding

    public init(
        transport: any FeedbackTransport,
        contextProvider: any FeedbackContextProviding,
        userContextProvider: any FeedbackUserContextProviding = StaticFeedbackUserContextProvider()
    ) {
        self.transport = transport
        self.contextProvider = contextProvider
        self.userContextProvider = userContextProvider
    }

    /// Creates the client with the default HTTP transport.
    public init(
        configuration: FeedbackConfiguration,
        installationIdentifier: any FeedbackInstallationIdentifying,
        contextProvider: any FeedbackContextProviding,
        userContextProvider: any FeedbackUserContextProviding = StaticFeedbackUserContextProvider(),
        session: URLSession = .shared
    ) {
        self.init(
            transport: FeedbackHTTPTransport(
                configuration: configuration,
                installationIdentifier: installationIdentifier,
                session: session
            ),
            contextProvider: contextProvider,
            userContextProvider: userContextProvider
        )
    }

    public func submit(
        category: FeedbackCategory,
        message: String,
        name: String? = nil,
        replyEmail: String? = nil,
        attachment: FeedbackAttachment? = nil,
        idempotencyKey: UUID = UUID()
    ) async throws -> FeedbackReceipt {
        let submission = FeedbackSubmission(
            category: category,
            message: message,
            name: name,
            replyEmail: replyEmail,
            context: await contextProvider.context(),
            user: await userContextProvider.userContext(),
            attachment: attachment
        )
        return try await transport.submit(submission, idempotencyKey: idempotencyKey)
    }
}
