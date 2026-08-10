import Foundation

public protocol FeedbackInstallationIdentifying: Sendable {
    func installationID() async throws -> UUID
}
