/// The kind of feedback a person is sending. Raw values are the wire values.
public enum FeedbackCategory: String, Codable, CaseIterable, Identifiable, Sendable {
    case feedback
    case bug
    case idea

    public var id: String { rawValue }
}
