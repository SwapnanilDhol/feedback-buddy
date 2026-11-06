import Foundation

/// Server delivery state. Unknown future values decode as ``unknown(_:)`` and
/// should be treated as success: the feedback is stored either way.
public enum FeedbackDeliveryStatus: Equatable, Sendable {
    case accepted
    case delivered
    case failed
    case unknown(String)

    public var rawValue: String {
        switch self {
        case .accepted: "accepted"
        case .delivered: "delivered"
        case .failed: "failed"
        case .unknown(let value): value
        }
    }
}

extension FeedbackDeliveryStatus: Codable {
    public init(from decoder: any Decoder) throws {
        let value = try decoder.singleValueContainer().decode(String.self)
        switch value {
        case "accepted": self = .accepted
        case "delivered": self = .delivered
        case "failed": self = .failed
        default: self = .unknown(value)
        }
    }

    public func encode(to encoder: any Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(rawValue)
    }
}

public struct FeedbackReceipt: Codable, Equatable, Sendable {
    public let feedbackID: UUID
    public let duplicate: Bool
    public let deliveryStatus: FeedbackDeliveryStatus

    public init(feedbackID: UUID, duplicate: Bool, deliveryStatus: FeedbackDeliveryStatus) {
        self.feedbackID = feedbackID
        self.duplicate = duplicate
        self.deliveryStatus = deliveryStatus
    }

    /// Short, human-friendly reference shown to the person (first 8 hex chars).
    public var shortReference: String {
        String(feedbackID.uuidString.prefix(8)).uppercased()
    }

    private enum CodingKeys: String, CodingKey {
        case feedbackID = "feedback_id"
        case duplicate
        case deliveryStatus = "delivery_status"
    }
}
