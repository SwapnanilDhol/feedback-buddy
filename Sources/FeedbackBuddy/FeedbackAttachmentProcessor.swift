import FeedbackBuddyCore
import Foundation

#if canImport(UIKit)
import UIKit

/// Downscales and re-encodes a picked image so it fits the contract limit.
public struct FeedbackAttachmentProcessor: Sendable {
    public static let maximumBytes = FeedbackAttachment.maximumBytes
    public static let maximumDimension: CGFloat = 1_600
    public static let initialQuality: CGFloat = 0.78
    public static let qualityFloor: CGFloat = 0.1

    public init() {}

    public func process(_ sourceData: Data) throws -> FeedbackAttachment {
        guard let image = UIImage(data: sourceData) else {
            throw ProcessingError.invalidImage
        }
        return try process(image)
    }

    public func process(_ image: UIImage) throws -> FeedbackAttachment {
        let resized = Self.downscaled(image, maximumDimension: Self.maximumDimension)
        var quality = Self.initialQuality
        while quality >= Self.qualityFloor {
            if let data = resized.jpegData(compressionQuality: quality),
               data.count <= Self.maximumBytes {
                return FeedbackAttachment(fileName: "feedback.jpg", contentType: .jpeg, data: data)
            }
            quality -= 0.1
        }
        // Last resort: halve the dimensions once more at the floor quality.
        let smaller = Self.downscaled(resized, maximumDimension: Self.maximumDimension / 2)
        if let data = smaller.jpegData(compressionQuality: Self.qualityFloor),
           data.count <= Self.maximumBytes {
            return FeedbackAttachment(fileName: "feedback.jpg", contentType: .jpeg, data: data)
        }
        throw ProcessingError.couldNotCompress
    }

    static func downscaled(_ image: UIImage, maximumDimension: CGFloat) -> UIImage {
        let size = image.size
        let longest = max(size.width, size.height)
        guard longest > maximumDimension, longest > 0 else {
            return image.imageOrientation == .up && image.scale == 1 ? image : rendered(image, size: size)
        }
        let scale = maximumDimension / longest
        let target = CGSize(width: (size.width * scale).rounded(.down), height: (size.height * scale).rounded(.down))
        return rendered(image, size: target)
    }

    private static func rendered(_ image: UIImage, size: CGSize) -> UIImage {
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        format.opaque = true
        return UIGraphicsImageRenderer(size: size, format: format).image { _ in
            image.draw(in: CGRect(origin: .zero, size: size))
        }
    }

    public enum ProcessingError: Error, Equatable {
        case invalidImage
        case couldNotCompress
    }
}
#endif
