import FeedbackBuddyCore
import Foundation

#if canImport(UIKit)
import SwiftUI

/// Copy shown in the form. Defaults are first-person indie-developer voice.
public struct FeedbackBuddyCopy: Sendable {
    public var introductionTitle: String
    public var introductionMessage: String
    public var privacyMessage: String
    /// When set, the attachment disclosure mentions how long images are kept.
    public var attachmentRetentionDays: Int?

    /// Pass `nil` for any field to keep the built-in, localized default.
    public init(
        introductionTitle: String? = nil,
        introductionMessage: String? = nil,
        privacyMessage: String? = nil,
        attachmentRetentionDays: Int? = 30
    ) {
        self.introductionTitle = introductionTitle
            ?? String(localized: "Tell me what you think", bundle: .module)
        self.introductionMessage = introductionMessage ?? String(
            localized: "Share what worked, what didn’t, or what you’d like me to build next. I read every message.",
            bundle: .module
        )
        self.privacyMessage = privacyMessage ?? String(
            localized: "Your name, email, and image are sent only if you add them. A pseudonymous subscription ID and limited app context may also be shared to help prioritize feedback.",
            bundle: .module
        )
        self.attachmentRetentionDays = attachmentRetentionDays
    }
}

public struct FeedbackBuddyAppearance: Sendable {
    public var accentColor: Color
    public var copy: FeedbackBuddyCopy
    public var allowsAttachment: Bool
    public var categories: [FeedbackCategory]

    public init(
        accentColor: Color = .accentColor,
        copy: FeedbackBuddyCopy = .init(),
        allowsAttachment: Bool = true,
        categories: [FeedbackCategory] = FeedbackCategory.allCases
    ) {
        self.accentColor = accentColor
        self.copy = copy
        self.allowsAttachment = allowsAttachment
        self.categories = categories.isEmpty ? FeedbackCategory.allCases : categories
    }
}

extension FeedbackCategory {
    var label: String {
        switch self {
        case .feedback: String(localized: "Feedback", bundle: .module)
        case .bug: String(localized: "Bug", bundle: .module)
        case .idea: String(localized: "Idea", bundle: .module)
        }
    }

    var symbolName: String {
        switch self {
        case .feedback: "bubble.left.and.text.bubble.right.fill"
        case .bug: "ladybug.fill"
        case .idea: "lightbulb.fill"
        }
    }

    var tintColor: Color {
        switch self {
        case .feedback: .blue
        case .bug: .red
        case .idea: .orange
        }
    }
}
#endif
