import Foundation

public enum FeedbackAttachmentContentType: String, Codable, Equatable, Sendable {
    case jpeg = "image/jpeg"
    case png = "image/png"

    public var fileExtension: String {
        switch self {
        case .jpeg: "jpg"
        case .png: "png"
        }
    }
}

/// One image attached to a submission. The contract allows at most one.
public struct FeedbackAttachment: Equatable, Sendable {
    public static let maximumBytes = 1_500_000
    public static let minimumBytes = 4

    public let fileName: String
    public let contentType: FeedbackAttachmentContentType
    public let data: Data

    public init(fileName: String, contentType: FeedbackAttachmentContentType, data: Data) {
        self.fileName = fileName
        self.contentType = contentType
        self.data = data
    }
}
