import FeedbackBuddyCore
import Foundation

#if canImport(UIKit)
import SwiftUI
import UIKit

/// Entry point for in-app feedback. Configure once at launch, then present
/// the form from anywhere.
///
/// ```swift
/// FeedbackBuddy.configure(apiKey: "fb_pub_…")
/// FeedbackBuddy.present(from: viewController)
/// ```
@MainActor
public enum FeedbackBuddy {
    public static let defaultEndpoint = FeedbackConfiguration.defaultEndpoint

    private(set) static var runtime: FeedbackBuddyRuntime?

    /// Whether ``configure(apiKey:endpoint:appearance:userContextProvider:installationIdentifier:eventHandler:)`` has run.
    public static var isConfigured: Bool { runtime != nil }

    /// Configures the SDK. Safe to call again; the latest configuration wins.
    ///
    /// - Parameters:
    ///   - apiKey: the project's public key from the FeedbackBuddy dashboard (`fb_pub_…`).
    ///   - endpoint: server origin. Defaults to ``defaultEndpoint``; override for self-hosting.
    ///   - appearance: accent color, copy and feature toggles for the form.
    ///   - userContextProvider: resolves account/plan context at submission time (RevenueCat, your own auth).
    ///   - installationIdentifier: persistence for the pseudonymous installation ID. Defaults to the Keychain.
    ///   - eventHandler: receives lifecycle events for your analytics. Never receives message or contact content.
    public static func configure(
        apiKey: String,
        endpoint: URL = FeedbackConfiguration.defaultEndpoint,
        appearance: FeedbackBuddyAppearance = .init(),
        userContextProvider: (any FeedbackUserContextProviding)? = nil,
        installationIdentifier: (any FeedbackInstallationIdentifying)? = nil,
        eventHandler: @escaping @MainActor @Sendable (FeedbackBuddyEvent) -> Void = { _ in }
    ) {
        let configuration = FeedbackConfiguration(apiKey: apiKey, endpoint: endpoint)
        let identifier = installationIdentifier ?? KeychainInstallationIdentifier()
        configure(
            configuration: configuration,
            transport: FeedbackHTTPTransport(configuration: configuration, installationIdentifier: identifier),
            appearance: appearance,
            contextProvider: DefaultFeedbackContextProvider(),
            userContextProvider: userContextProvider ?? StaticFeedbackUserContextProvider(),
            eventHandler: eventHandler
        )
    }

    /// Full-control variant for custom transports (tests, App Attest, proxies).
    public static func configure(
        configuration: FeedbackConfiguration,
        transport: any FeedbackTransport,
        appearance: FeedbackBuddyAppearance = .init(),
        contextProvider: any FeedbackContextProviding = DefaultFeedbackContextProvider(),
        userContextProvider: any FeedbackUserContextProviding = StaticFeedbackUserContextProvider(),
        eventHandler: @escaping @MainActor @Sendable (FeedbackBuddyEvent) -> Void = { _ in }
    ) {
        runtime = FeedbackBuddyRuntime(
            configuration: configuration,
            transport: transport,
            appearance: appearance,
            contextProvider: contextProvider,
            userContextProvider: userContextProvider,
            eventHandler: eventHandler
        )
    }

    /// Replaces the user context with a fixed value (for example after sign-in).
    public static func identify(_ user: FeedbackUserContext) {
        runtime?.userContextProvider = StaticFeedbackUserContextProvider(user)
    }

    /// Replaces the user context provider (for example a RevenueCat-backed one).
    public static func setUserContextProvider(_ provider: any FeedbackUserContextProviding) {
        runtime?.userContextProvider = provider
    }

    /// Clears the user context back to anonymous.
    public static func resetUser() {
        runtime?.userContextProvider = StaticFeedbackUserContextProvider()
    }

    /// The current appearance, or the defaults when unconfigured.
    public static var appearance: FeedbackBuddyAppearance {
        runtime?.appearance ?? .init()
    }

    /// Presents the feedback form as a sheet from a UIKit view controller.
    /// - Parameter source: analytics label describing where the form was opened from.
    @discardableResult
    public static func present(
        from presenter: UIViewController,
        source: String = "settings",
        onDismiss: (@MainActor () -> Void)? = nil
    ) -> UIViewController? {
        let controller = FeedbackBuddyViewController(source: source)
        controller.onDismiss = onDismiss
        let navigation = UINavigationController(rootViewController: controller)
        navigation.modalPresentationStyle = .pageSheet
        navigation.sheetPresentationController?.detents = [.large()]
        navigation.presentationController?.delegate = controller
        presenter.present(navigation, animated: true)
        return navigation
    }

    /// A ready-to-push view controller hosting the form (no Close button).
    public static func makeViewController(source: String = "settings") -> UIViewController {
        FeedbackBuddyViewController(source: source, showsCloseButton: false)
    }

    /// Submits feedback without the built-in UI. Context and user context come
    /// from the configured providers; attachment data is sent as-is (use
    /// ``FeedbackAttachmentProcessor`` to compress images first).
    public static func submit(
        _ draft: FeedbackDraft,
        idempotencyKey: UUID = UUID()
    ) async throws -> FeedbackReceipt {
        guard let runtime else { throw FeedbackError.invalidConfiguration }
        return try await runtime.submit(draft, idempotencyKey: idempotencyKey)
    }

    /// Forgets the configuration. Intended for tests and previews.
    public static func reset() {
        runtime = nil
    }
}

/// What a person typed in the form (or what your custom UI collected).
public struct FeedbackDraft: Equatable, Sendable {
    public var category: FeedbackCategory
    public var message: String
    public var name: String?
    public var replyEmail: String?
    public var attachment: FeedbackAttachment?

    public init(
        category: FeedbackCategory = .feedback,
        message: String,
        name: String? = nil,
        replyEmail: String? = nil,
        attachment: FeedbackAttachment? = nil
    ) {
        self.category = category
        self.message = message
        self.name = name
        self.replyEmail = replyEmail
        self.attachment = attachment
    }
}

/// Lifecycle events for host analytics. Never carries message or contact content.
public enum FeedbackBuddyEvent: Equatable, Sendable {
    case opened(source: String)
    case submitted(category: FeedbackCategory)
    case succeeded(category: FeedbackCategory, feedbackID: UUID)
    case failed(category: FeedbackCategory, reason: FeedbackBuddyFailureReason)
}

public enum FeedbackBuddyFailureReason: String, Equatable, Sendable {
    case configuration
    case invalidFeedback
    case rateLimited
    case unavailable

    public init(error: any Error) {
        switch error as? FeedbackError {
        case .invalidConfiguration, .authorizationFailed, .projectRejected, .projectUnavailable:
            self = .configuration
        case .invalidSubmission:
            self = .invalidFeedback
        case .rateLimited:
            self = .rateLimited
        case .invalidResponse, .temporarilyUnavailable, .conflict, .rejected, .none:
            self = .unavailable
        }
    }
}

/// Holds the live configuration. Internal; the facade is the public surface.
@MainActor
final class FeedbackBuddyRuntime {
    let configuration: FeedbackConfiguration
    let transport: any FeedbackTransport
    let appearance: FeedbackBuddyAppearance
    let contextProvider: any FeedbackContextProviding
    var userContextProvider: any FeedbackUserContextProviding
    let eventHandler: @MainActor @Sendable (FeedbackBuddyEvent) -> Void

    init(
        configuration: FeedbackConfiguration,
        transport: any FeedbackTransport,
        appearance: FeedbackBuddyAppearance,
        contextProvider: any FeedbackContextProviding,
        userContextProvider: any FeedbackUserContextProviding,
        eventHandler: @escaping @MainActor @Sendable (FeedbackBuddyEvent) -> Void
    ) {
        self.configuration = configuration
        self.transport = transport
        self.appearance = appearance
        self.contextProvider = contextProvider
        self.userContextProvider = userContextProvider
        self.eventHandler = eventHandler
    }

    func submit(_ draft: FeedbackDraft, idempotencyKey: UUID) async throws -> FeedbackReceipt {
        let submission = FeedbackSubmission(
            category: draft.category,
            message: draft.message,
            name: draft.name,
            replyEmail: draft.replyEmail,
            context: await contextProvider.context(),
            user: await userContextProvider.userContext(),
            attachment: draft.attachment
        )
        return try await transport.submit(submission, idempotencyKey: idempotencyKey)
    }
}
#endif
