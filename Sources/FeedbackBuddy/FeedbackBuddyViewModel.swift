import FeedbackBuddyCore
import Foundation

#if canImport(UIKit)
import Observation
import UIKit

enum FeedbackAttachmentState: Equatable {
    case empty
    case processing(UUID)
    case ready(FeedbackAttachment)
    case loadFailed
    case processingFailed

    var attachment: FeedbackAttachment? {
        guard case let .ready(attachment) = self else { return nil }
        return attachment
    }

    var isProcessing: Bool {
        guard case .processing = self else { return false }
        return true
    }
}

enum FeedbackBuddyOutcome: Equatable {
    case accepted(FeedbackReceipt)
    case failed(FeedbackBuddyFailureReason)
}

/// Form state and submission logic, independent of the SwiftUI view so it can
/// be tested directly.
@MainActor
@Observable
public final class FeedbackBuddyViewModel {
    public static let maximumMessageLength = FeedbackSubmissionValidator.messageMaximum
    public static let maximumNameLength = FeedbackSubmissionValidator.nameMaximum

    public var category: FeedbackCategory
    public var message = ""
    public var name = ""
    public var replyEmail = ""
    public private(set) var isSubmitting = false
    var attachmentState: FeedbackAttachmentState = .empty
    var outcome: FeedbackBuddyOutcome?

    let appearance: FeedbackBuddyAppearance
    private let source: String
    private let submitter: @MainActor @Sendable (FeedbackDraft, UUID) async throws -> FeedbackReceipt
    private let eventHandler: @MainActor @Sendable (FeedbackBuddyEvent) -> Void
    private let attachmentProcessor = FeedbackAttachmentProcessor()
    private var hasLoggedOpen = false
    private(set) var pendingAttempt: (id: UUID, draft: FeedbackDraft)?

    /// Uses the globally configured runtime.
    public convenience init(source: String = "settings") {
        let runtime = FeedbackBuddy.runtime
        self.init(
            source: source,
            appearance: runtime?.appearance ?? .init(),
            eventHandler: runtime?.eventHandler ?? Self.ignoreEvents,
            submitter: { draft, key in
                guard let runtime = FeedbackBuddy.runtime else { throw FeedbackError.invalidConfiguration }
                return try await runtime.submit(draft, idempotencyKey: key)
            }
        )
    }

    init(
        source: String,
        appearance: FeedbackBuddyAppearance,
        eventHandler: @escaping @MainActor @Sendable (FeedbackBuddyEvent) -> Void,
        submitter: @escaping @MainActor @Sendable (FeedbackDraft, UUID) async throws -> FeedbackReceipt
    ) {
        self.source = source
        self.appearance = appearance
        self.eventHandler = eventHandler
        self.submitter = submitter
        category = appearance.categories.first ?? .feedback
    }

    private static let ignoreEvents: @MainActor @Sendable (FeedbackBuddyEvent) -> Void = { _ in }

    // MARK: Derived state

    public var normalizedMessage: String {
        message.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    public var normalizedName: String? {
        let value = name.trimmingCharacters(in: .whitespacesAndNewlines)
        return value.isEmpty ? nil : value
    }

    public var normalizedReplyEmail: String? {
        let value = replyEmail.trimmingCharacters(in: .whitespacesAndNewlines)
        return value.isEmpty ? nil : value
    }

    public var isMessageValid: Bool {
        let count = normalizedMessage.unicodeScalars.count
        return count >= FeedbackSubmissionValidator.messageMinimum && count <= Self.maximumMessageLength
    }

    public var isNameValid: Bool {
        guard let name = normalizedName else { return true }
        return name.unicodeScalars.count <= Self.maximumNameLength
    }

    public var isReplyEmailValid: Bool {
        guard let email = normalizedReplyEmail else { return true }
        return FeedbackSubmissionValidator.isValidEmail(email)
    }

    public var remainingCharacters: Int { Self.maximumMessageLength - message.unicodeScalars.count }

    public var canSubmit: Bool {
        !isSubmitting && !attachmentState.isProcessing && isMessageValid && isNameValid && isReplyEmailValid
    }

    public var attachment: FeedbackAttachment? { attachmentState.attachment }
    public var isProcessingAttachment: Bool { attachmentState.isProcessing }

    var attachmentErrorMessage: String? {
        switch attachmentState {
        case .loadFailed:
            String(localized: "That image couldn’t be loaded. Choose another image and try again.", bundle: .module)
        case .processingFailed:
            String(localized: "That image couldn’t be prepared. Choose another image and try again.", bundle: .module)
        case .empty, .processing, .ready:
            nil
        }
    }

    // MARK: Lifecycle

    public func onAppear() {
        guard !hasLoggedOpen else { return }
        hasLoggedOpen = true
        eventHandler(.opened(source: source))
    }

    // MARK: Attachments

    @discardableResult
    public func beginAttachmentProcessing() -> UUID {
        let requestID = UUID()
        attachmentState = .processing(requestID)
        return requestID
    }

    public func attachImage(_ sourceData: Data, requestID: UUID) {
        guard attachmentState == .processing(requestID) else { return }
        do {
            attachmentState = .ready(try attachmentProcessor.process(sourceData))
        } catch {
            attachmentState = .processingFailed
        }
    }

    public func attach(_ attachment: FeedbackAttachment) {
        attachmentState = .ready(attachment)
    }

    public func failToLoadAttachment(requestID: UUID) {
        guard attachmentState == .processing(requestID) else { return }
        attachmentState = .loadFailed
    }

    public func removeAttachment() {
        attachmentState = .empty
    }

    // MARK: Submission

    public var currentDraft: FeedbackDraft {
        FeedbackDraft(
            category: category,
            message: normalizedMessage,
            name: normalizedName,
            replyEmail: normalizedReplyEmail,
            attachment: attachment
        )
    }

    public func submit() {
        guard canSubmit else { return }
        isSubmitting = true
        outcome = nil
        let draft = currentDraft
        let attempt: (id: UUID, draft: FeedbackDraft)
        if let pendingAttempt, pendingAttempt.draft == draft {
            attempt = pendingAttempt
        } else {
            attempt = (UUID(), draft)
            pendingAttempt = attempt
        }
        eventHandler(.submitted(category: draft.category))
        Task { await perform(attempt) }
    }

    /// Awaitable variant used by tests and custom flows.
    public func submitAndWait() async {
        guard canSubmit else { return }
        isSubmitting = true
        outcome = nil
        let draft = currentDraft
        let attempt: (id: UUID, draft: FeedbackDraft)
        if let pendingAttempt, pendingAttempt.draft == draft {
            attempt = pendingAttempt
        } else {
            attempt = (UUID(), draft)
            pendingAttempt = attempt
        }
        eventHandler(.submitted(category: draft.category))
        await perform(attempt)
    }

    private func perform(_ attempt: (id: UUID, draft: FeedbackDraft)) async {
        do {
            let receipt = try await submitter(attempt.draft, attempt.id)
            isSubmitting = false
            pendingAttempt = nil
            eventHandler(.succeeded(category: attempt.draft.category, feedbackID: receipt.feedbackID))
            outcome = .accepted(receipt)
        } catch {
            isSubmitting = false
            let reason = FeedbackBuddyFailureReason(error: error)
            eventHandler(.failed(category: attempt.draft.category, reason: reason))
            outcome = .failed(reason)
        }
    }

    public func clearOutcome() {
        outcome = nil
    }
}

extension FeedbackBuddyFailureReason {
    var alertMessage: String {
        switch self {
        case .configuration, .unavailable:
            String(localized: "Feedback is temporarily unavailable. Please try again in a moment.", bundle: .module)
        case .invalidFeedback:
            String(localized: "Check your name, message, and reply email, then try again.", bundle: .module)
        case .rateLimited:
            String(localized: "A few messages were sent recently. Please wait a minute and try again.", bundle: .module)
        }
    }
}
#endif
