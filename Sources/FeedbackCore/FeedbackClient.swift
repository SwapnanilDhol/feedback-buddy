import Foundation

public struct FeedbackClient: Sendable {
    private let transport: any FeedbackTransport
    private let contextProvider: any FeedbackContextProviding

    public init(
        transport: any FeedbackTransport,
        contextProvider: any FeedbackContextProviding
    ) {
        self.transport = transport
        self.contextProvider = contextProvider
    }

    public func submit(
        category: FeedbackCategory,
        message: String,
        replyEmail: String? = nil,
        idempotencyKey: UUID = UUID()
    ) async throws -> FeedbackReceipt {
        let submission = FeedbackSubmission(
            category: category,
            message: message,
            replyEmail: replyEmail,
            context: await contextProvider.context()
        )
        return try await transport.submit(submission, idempotencyKey: idempotencyKey)
    }
}
