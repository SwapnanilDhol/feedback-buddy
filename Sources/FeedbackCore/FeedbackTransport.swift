import Foundation

public protocol FeedbackTransport: Sendable {
    func submit(
        _ submission: FeedbackSubmission,
        idempotencyKey: UUID
    ) async throws -> FeedbackReceipt
}
