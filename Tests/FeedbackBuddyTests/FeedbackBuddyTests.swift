import Foundation
import Testing
@testable import FeedbackBuddy
@testable import FeedbackBuddyCore

#if canImport(UIKit)
import UIKit

@MainActor
final class EventLog: Sendable {
    nonisolated(unsafe) var events: [FeedbackBuddyEvent] = []
}

struct StubTransport: FeedbackTransport {
    enum Mode: Sendable { case succeed, fail(FeedbackError) }
    let mode: Mode
    let recorder: SubmissionRecorder

    func submit(_ submission: FeedbackSubmission, idempotencyKey: UUID) async throws -> FeedbackReceipt {
        recorder.record(submission, key: idempotencyKey)
        switch mode {
        case .succeed:
            return FeedbackReceipt(feedbackID: UUID(uuidString: "33333333-3333-4333-8333-333333333333")!, duplicate: false, deliveryStatus: .accepted)
        case let .fail(error):
            throw error
        }
    }
}

final class SubmissionRecorder: @unchecked Sendable {
    private let lock = NSLock()
    private(set) var submissions: [(FeedbackSubmission, UUID)] = []

    func record(_ submission: FeedbackSubmission, key: UUID) {
        lock.lock(); defer { lock.unlock() }
        submissions.append((submission, key))
    }
}

@MainActor
@Suite(.serialized)
struct FeedbackBuddyFacadeTests {
    private let context = FeedbackContext(appVersion: "1.0", buildNumber: "1", osVersion: "26", locale: "en-IN", deviceFamily: "iPhone")

    @Test("configure, identify, submit and reset")
    func configureAndSubmit() async throws {
        FeedbackBuddy.reset()
        #expect(!FeedbackBuddy.isConfigured)
        let recorder = SubmissionRecorder()
        let log = EventLog()
        FeedbackBuddy.configure(
            configuration: FeedbackConfiguration(apiKey: "fb_pub_abcdefghijklmnopqrstuv"),
            transport: StubTransport(mode: .succeed, recorder: recorder),
            contextProvider: StaticFeedbackContextProvider(context),
            eventHandler: { log.events.append($0) }
        )
        #expect(FeedbackBuddy.isConfigured)
        FeedbackBuddy.identify(FeedbackUserContext(id: "rc-1", accountStatus: .paid, plan: "pro", entitlements: ["pro"]))

        let receipt = try await FeedbackBuddy.submit(FeedbackDraft(category: .idea, message: "A fine idea"))
        #expect(receipt.shortReference == "33333333")
        let (submission, _) = try #require(recorder.submissions.first)
        #expect(submission.user.id == "rc-1")
        #expect(submission.user.accountStatus == .paid)
        #expect(submission.context == context)

        FeedbackBuddy.resetUser()
        _ = try await FeedbackBuddy.submit(FeedbackDraft(message: "Another one"))
        #expect(recorder.submissions.last?.0.user == .anonymous)

        FeedbackBuddy.reset()
        #expect(!FeedbackBuddy.isConfigured)
        await #expect(throws: FeedbackError.invalidConfiguration) {
            try await FeedbackBuddy.submit(FeedbackDraft(message: "Unconfigured"))
        }
    }

    @Test("public configure uses the default endpoint and keychain store")
    func publicConfigureDefaults() {
        FeedbackBuddy.reset()
        FeedbackBuddy.configure(apiKey: "fb_pub_abcdefghijklmnopqrstuv", installationIdentifier: InMemoryInstallationIdentifier())
        #expect(FeedbackBuddy.isConfigured)
        #expect(FeedbackBuddy.runtime?.configuration.endpoint == FeedbackBuddy.defaultEndpoint)
        #expect(FeedbackBuddy.appearance.allowsAttachment)
        FeedbackBuddy.reset()
    }

    @Test("present returns a page sheet navigation controller")
    func presentsSheet() {
        FeedbackBuddy.reset()
        FeedbackBuddy.configure(apiKey: "fb_pub_abcdefghijklmnopqrstuv", installationIdentifier: InMemoryInstallationIdentifier())
        let window = UIWindow(frame: UIScreen.main.bounds)
        let root = UIViewController()
        window.rootViewController = root
        window.makeKeyAndVisible()
        let presented = FeedbackBuddy.present(from: root, source: "test")
        let navigation = presented as? UINavigationController
        #expect(navigation?.modalPresentationStyle == .pageSheet)
        #expect(navigation?.viewControllers.first is FeedbackBuddyViewController)
        #expect(FeedbackBuddy.makeViewController() is FeedbackBuddyViewController)
        FeedbackBuddy.reset()
    }
}

@MainActor
struct FeedbackBuddyViewModelTests {
    private func makeViewModel(
        mode: StubTransport.Mode = .succeed,
        recorder: SubmissionRecorder = SubmissionRecorder(),
        log: EventLog = EventLog()
    ) -> FeedbackBuddyViewModel {
        let transport = StubTransport(mode: mode, recorder: recorder)
        let context = FeedbackContext(appVersion: "1.0", buildNumber: "1", osVersion: "26", locale: "en-IN", deviceFamily: "iPhone")
        return FeedbackBuddyViewModel(
            source: "settings",
            appearance: .init(),
            eventHandler: { log.events.append($0) },
            submitter: { draft, key in
                let submission = FeedbackSubmission(
                    category: draft.category, message: draft.message, name: draft.name,
                    replyEmail: draft.replyEmail, context: context, attachment: draft.attachment
                )
                return try await transport.submit(submission, idempotencyKey: key)
            }
        )
    }

    @Test("canSubmit tracks validation state")
    func canSubmitTracksValidation() {
        let viewModel = makeViewModel()
        #expect(!viewModel.canSubmit)
        viewModel.message = "abc"
        #expect(!viewModel.canSubmit)
        viewModel.message = "abcd"
        #expect(viewModel.canSubmit)
        viewModel.replyEmail = "bad"
        #expect(!viewModel.canSubmit)
        viewModel.replyEmail = "ok@example.com"
        viewModel.name = String(repeating: "n", count: 121)
        #expect(!viewModel.canSubmit)
        viewModel.name = "Swap"
        #expect(viewModel.canSubmit)
        #expect(viewModel.remainingCharacters == 1_996)
        viewModel.beginAttachmentProcessing()
        #expect(!viewModel.canSubmit, "cannot submit while an image is being prepared")
    }

    @Test("stale attachment requests are ignored")
    func staleAttachmentRequestsIgnored() {
        let viewModel = makeViewModel()
        let first = viewModel.beginAttachmentProcessing()
        let second = viewModel.beginAttachmentProcessing()
        viewModel.failToLoadAttachment(requestID: first)
        #expect(viewModel.attachmentState == .processing(second))
        viewModel.attachImage(Data([0, 1, 2]), requestID: second)
        #expect(viewModel.attachmentState == .processingFailed)
        #expect(viewModel.attachmentErrorMessage != nil)
        viewModel.removeAttachment()
        #expect(viewModel.attachmentState == .empty)

        let image = UIGraphicsImageRenderer(size: CGSize(width: 40, height: 40)).image { context in
            UIColor.systemTeal.setFill()
            context.fill(CGRect(x: 0, y: 0, width: 40, height: 40))
        }
        let request = viewModel.beginAttachmentProcessing()
        viewModel.attachImage(image.jpegData(compressionQuality: 0.9)!, requestID: request)
        #expect(viewModel.attachment?.contentType == .jpeg)
    }

    @Test("retrying the same draft reuses the idempotency key; a changed draft gets a new one")
    func retryReusesIdempotencyKey() async throws {
        let recorder = SubmissionRecorder()
        let log = EventLog()
        let failing = makeViewModel(mode: .fail(.temporarilyUnavailable), recorder: recorder, log: log)
        failing.message = "It crashed on launch"
        await failing.submitAndWait()
        #expect(failing.outcome == .failed(.unavailable))
        await failing.submitAndWait()
        #expect(recorder.submissions.count == 2)
        #expect(recorder.submissions[0].1 == recorder.submissions[1].1)

        failing.message = "It crashed on launch twice"
        await failing.submitAndWait()
        #expect(recorder.submissions.count == 3)
        #expect(recorder.submissions[2].1 != recorder.submissions[0].1)
        #expect(log.events == [
            .submitted(category: .feedback), .failed(category: .feedback, reason: .unavailable),
            .submitted(category: .feedback), .failed(category: .feedback, reason: .unavailable),
            .submitted(category: .feedback), .failed(category: .feedback, reason: .unavailable),
        ])
    }

    @Test("successful submission emits events in order and clears the pending attempt")
    func successEmitsEvents() async throws {
        let recorder = SubmissionRecorder()
        let log = EventLog()
        let viewModel = makeViewModel(recorder: recorder, log: log)
        viewModel.onAppear()
        viewModel.onAppear()
        viewModel.category = .bug
        viewModel.message = "  Crash when rotating  "
        viewModel.name = " Swap "
        viewModel.replyEmail = "swap@example.com"
        await viewModel.submitAndWait()

        let receipt = FeedbackReceipt(feedbackID: UUID(uuidString: "33333333-3333-4333-8333-333333333333")!, duplicate: false, deliveryStatus: .accepted)
        #expect(viewModel.outcome == .accepted(receipt))
        #expect(viewModel.pendingAttempt == nil)
        #expect(!viewModel.isSubmitting)
        let (submission, _) = try #require(recorder.submissions.first)
        #expect(submission.message == "Crash when rotating")
        #expect(submission.name == "Swap")
        #expect(log.events == [
            .opened(source: "settings"),
            .submitted(category: .bug),
            .succeeded(category: .bug, feedbackID: receipt.feedbackID),
        ])
    }

    @Test("failure reasons map from transport errors", arguments: [
        (FeedbackError.rateLimited, FeedbackBuddyFailureReason.rateLimited),
        (.invalidSubmission, .invalidFeedback),
        (.projectRejected, .configuration),
        (.invalidConfiguration, .configuration),
        (.temporarilyUnavailable, .unavailable),
        (.invalidResponse, .unavailable),
    ])
    func failureMapping(error: FeedbackError, reason: FeedbackBuddyFailureReason) async {
        let viewModel = makeViewModel(mode: .fail(error))
        viewModel.message = "Enough text"
        await viewModel.submitAndWait()
        #expect(viewModel.outcome == .failed(reason))
        #expect(FeedbackBuddyFailureReason(error: error) == reason)
        #expect(!reason.alertMessage.isEmpty)
    }
}

struct FeedbackAttachmentProcessorTests {
    @Test("compresses a large image under the contract limit")
    func compressesLargeImage() throws {
        let size = CGSize(width: 4_000, height: 3_000)
        let image = UIGraphicsImageRenderer(size: size).image { context in
            // Noisy content so JPEG cannot trivially compress it.
            for x in stride(from: 0, to: Int(size.width), by: 25) {
                for y in stride(from: 0, to: Int(size.height), by: 25) {
                    UIColor(hue: CGFloat((x * 31 + y * 17) % 360) / 360, saturation: 0.9, brightness: 0.9, alpha: 1).setFill()
                    context.fill(CGRect(x: x, y: y, width: 25, height: 25))
                }
            }
        }
        let attachment = try FeedbackAttachmentProcessor().process(image)
        #expect(attachment.contentType == .jpeg)
        #expect(attachment.data.count <= FeedbackAttachment.maximumBytes)
        #expect(attachment.data.count > FeedbackAttachment.minimumBytes)
        let decoded = try #require(UIImage(data: attachment.data))
        #expect(max(decoded.size.width, decoded.size.height) <= FeedbackAttachmentProcessor.maximumDimension)
        #expect(decoded.size.width == 1_600)
        #expect(decoded.size.height == 1_200)
    }

    @Test("rejects non-image data")
    func rejectsNonImage() {
        #expect(throws: FeedbackAttachmentProcessor.ProcessingError.invalidImage) {
            try FeedbackAttachmentProcessor().process(Data("hello".utf8))
        }
    }
}

@MainActor
struct DefaultFeedbackContextProviderTests {
    @Test("reads non-empty context from the running process")
    func readsContext() async throws {
        let context = await DefaultFeedbackContextProvider().context()
        #expect(!context.appVersion.isEmpty)
        #expect(!context.buildNumber.isEmpty)
        #expect(!context.osVersion.isEmpty)
        #expect(context.locale.unicodeScalars.count >= 2)
        #expect(["iPhone", "iPad", "Mac", "Apple TV", "Apple Vision"].contains(context.deviceFamily))
        #expect(context.deviceModel != nil)
        #expect(throws: Never.self) {
            try FeedbackSubmission(category: .feedback, message: "Context check", context: context).validated()
        }
    }

    @Test("installation identifiers are stable")
    func installationIdentifiersStable() async throws {
        let memory = InMemoryInstallationIdentifier()
        #expect(try await memory.installationID() == memory.id)
        let bundleID = "dev.feedbackbuddy.tests.\(UUID().uuidString)"
        let defaults = try #require(UserDefaults(suiteName: bundleID))
        let keychain = KeychainInstallationIdentifier(bundleIdentifier: bundleID, fallbackDefaults: defaults)
        let first = try await keychain.installationID()
        let second = try await keychain.installationID()
        #expect(first == second)
        // A fresh instance (new in-memory cache) must resolve the same identifier,
        // whether it came from the Keychain or the UserDefaults fallback.
        let again = KeychainInstallationIdentifier(bundleIdentifier: bundleID, fallbackDefaults: defaults)
        #expect(try await again.installationID() == first)
        defaults.removePersistentDomain(forName: bundleID)
    }
}
#endif
