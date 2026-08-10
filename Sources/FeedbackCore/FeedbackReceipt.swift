import Foundation

public struct FeedbackReceipt: Decodable, Equatable, Sendable {
    public let feedbackID: UUID
    public let duplicate: Bool
    public let deliveryStatus: FeedbackDeliveryStatus

    public init(
        feedbackID: UUID,
        duplicate: Bool,
        deliveryStatus: FeedbackDeliveryStatus
    ) {
        self.feedbackID = feedbackID
        self.duplicate = duplicate
        self.deliveryStatus = deliveryStatus
    }

    private enum CodingKeys: String, CodingKey {
        case feedbackID = "feedback_id"
        case duplicate
        case deliveryStatus = "delivery_status"
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        feedbackID = try container.decode(UUID.self, forKey: .feedbackID)
        duplicate = try container.decode(Bool.self, forKey: .duplicate)
        deliveryStatus = try container.decode(FeedbackDeliveryStatus.self, forKey: .deliveryStatus)
    }
}
