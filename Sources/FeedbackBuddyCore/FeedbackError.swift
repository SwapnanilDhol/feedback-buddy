import Foundation

public enum FeedbackError: Error, Equatable, Sendable {
    case invalidConfiguration
    case invalidResponse
    case temporarilyUnavailable
    case invalidSubmission
    case projectRejected
    case projectUnavailable
    case conflict
    case rateLimited
    case rejected(statusCode: Int)
    case authorizationFailed
}

extension FeedbackError {
    public static func fromHTTPStatus(_ statusCode: Int) -> FeedbackError {
        switch statusCode {
        case 400, 413, 415, 422: .invalidSubmission
        case 401, 403: .projectRejected
        case 404: .projectUnavailable
        case 409: .conflict
        case 429: .rateLimited
        case 500...599: .temporarilyUnavailable
        default: .rejected(statusCode: statusCode)
        }
    }
}
