public enum FeedbackDeliveryStatus: Equatable, Sendable {
    case accepted
    case complete
    case unknown(String)
}

extension FeedbackDeliveryStatus: Decodable {
    public init(from decoder: any Decoder) throws {
        let value = try decoder.singleValueContainer().decode(String.self)
        switch value {
        case "accepted": self = .accepted
        case "complete": self = .complete
        default: self = .unknown(value)
        }
    }
}

extension FeedbackDeliveryStatus: Encodable {
    public func encode(to encoder: any Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .accepted: try container.encode("accepted")
        case .complete: try container.encode("complete")
        case .unknown(let value): try container.encode(value)
        }
    }
}
