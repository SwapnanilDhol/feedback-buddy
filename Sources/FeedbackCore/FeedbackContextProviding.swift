public protocol FeedbackContextProviding: Sendable {
    func context() async -> FeedbackContext
}
