import Foundation

public enum FeedbackAccountStatus: String, Codable, Equatable, Sendable {
    case unknown
    case free
    case paid
}

/// Optional, host-supplied information about the person sending feedback.
/// Typically derived from RevenueCat or the app's own account system.
public struct FeedbackUserContext: Codable, Equatable, Sendable {
    public let id: String?
    public let accountStatus: FeedbackAccountStatus
    public let plan: String?
    public let entitlements: [String]
    public let attributes: [String: String]

    public init(
        id: String? = nil,
        accountStatus: FeedbackAccountStatus = .unknown,
        plan: String? = nil,
        entitlements: [String] = [],
        attributes: [String: String] = [:]
    ) {
        self.id = Self.normalized(id)
        self.accountStatus = accountStatus
        self.plan = Self.normalized(plan)
        self.entitlements = entitlements
        self.attributes = attributes
    }

    public static let anonymous = FeedbackUserContext()

    public var isAnonymous: Bool { self == .anonymous }

    private static func normalized(_ value: String?) -> String? {
        guard let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines),
              !trimmed.isEmpty else { return nil }
        return trimmed
    }

    private enum CodingKeys: String, CodingKey {
        case id
        case accountStatus = "account_status"
        case plan
        case entitlements
        case attributes
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.init(
            id: try container.decodeIfPresent(String.self, forKey: .id),
            accountStatus: try container.decodeIfPresent(FeedbackAccountStatus.self, forKey: .accountStatus) ?? .unknown,
            plan: try container.decodeIfPresent(String.self, forKey: .plan),
            entitlements: try container.decodeIfPresent([String].self, forKey: .entitlements) ?? [],
            attributes: try container.decodeIfPresent([String: String].self, forKey: .attributes) ?? [:]
        )
    }

    public func encode(to encoder: any Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encode(accountStatus, forKey: .accountStatus)
        try container.encode(plan, forKey: .plan)
        try container.encode(entitlements, forKey: .entitlements)
        try container.encode(attributes, forKey: .attributes)
    }
}

/// Resolves the user context at submission time so it is always fresh.
public protocol FeedbackUserContextProviding: Sendable {
    func userContext() async -> FeedbackUserContext
}

public struct StaticFeedbackUserContextProvider: FeedbackUserContextProviding {
    public let value: FeedbackUserContext

    public init(_ value: FeedbackUserContext = .anonymous) {
        self.value = value
    }

    public func userContext() async -> FeedbackUserContext { value }
}

/// Closure-backed provider for hosts that already have an async source.
public struct ClosureFeedbackUserContextProvider: FeedbackUserContextProviding {
    private let resolver: @Sendable () async -> FeedbackUserContext

    public init(_ resolver: @escaping @Sendable () async -> FeedbackUserContext) {
        self.resolver = resolver
    }

    public func userContext() async -> FeedbackUserContext { await resolver() }
}
