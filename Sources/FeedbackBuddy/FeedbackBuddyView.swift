import FeedbackBuddyCore
import Foundation

#if canImport(UIKit)
import PhotosUI
import SwiftUI

/// The feedback form. Embed it in your own navigation, or use
/// ``FeedbackBuddy/present(from:source:onDismiss:)`` / `.feedbackBuddySheet`.
public struct FeedbackBuddyView: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var viewModel: FeedbackBuddyViewModel
    @FocusState private var focusedField: Field?
    @State private var selectedPhoto: PhotosPickerItem?
    @State private var photoLoadingTask: Task<Void, Never>?
    @State private var alert: AlertContent?

    private let onFinished: (@MainActor (FeedbackReceipt) -> Void)?

    /// - Parameters:
    ///   - source: analytics label for where the form was opened from.
    ///   - onFinished: called after the person dismisses the success alert.
    public init(source: String = "settings", onFinished: (@MainActor (FeedbackReceipt) -> Void)? = nil) {
        _viewModel = State(initialValue: FeedbackBuddyViewModel(source: source))
        self.onFinished = onFinished
    }

    init(viewModel: FeedbackBuddyViewModel, onFinished: (@MainActor (FeedbackReceipt) -> Void)? = nil) {
        _viewModel = State(initialValue: viewModel)
        self.onFinished = onFinished
    }

    private var appearance: FeedbackBuddyAppearance { viewModel.appearance }
    private var accent: Color { appearance.accentColor }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                introduction
                if appearance.categories.count > 1 { categorySection }
                messageSection
                if appearance.allowsAttachment { attachmentSection }
                contactSection
                privacyCard
            }
            .padding(.horizontal, 20)
            .padding(.top, 16)
            .padding(.bottom, 32)
        }
        .background(Color(.systemGroupedBackground))
        .navigationTitle(Text("Send Feedback", bundle: .module))
        .navigationBarTitleDisplayMode(.inline)
        .scrollDismissesKeyboard(.interactively)
        .onAppear(perform: viewModel.onAppear)
        .onDisappear { photoLoadingTask?.cancel() }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) { submitButton }
        }
        .onChange(of: viewModel.outcome) { _, outcome in
            guard let outcome else { return }
            switch outcome {
            case let .accepted(receipt):
                alert = AlertContent(
                    title: String(localized: "Feedback sent", bundle: .module),
                    message: String(
                        localized: "Thank you. Your feedback reference is \(receipt.shortReference).",
                        bundle: .module
                    ),
                    receipt: receipt
                )
            case let .failed(reason):
                alert = AlertContent(
                    title: String(localized: "Couldn’t send feedback", bundle: .module),
                    message: reason.alertMessage,
                    receipt: nil
                )
            }
            viewModel.clearOutcome()
        }
        .alert(item: $alert) { content in
            Alert(
                title: Text(content.title),
                message: Text(content.message),
                dismissButton: .default(Text("Done", bundle: .module)) {
                    if let receipt = content.receipt { onFinished?(receipt) }
                }
            )
        }
    }

    // MARK: Sections

    private var introduction: some View {
        VStack(alignment: .leading, spacing: 7) {
            Text(appearance.copy.introductionTitle)
                .font(.title2.weight(.bold))
                .tracking(-0.3)
            Text(appearance.copy.introductionMessage)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var categorySection: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionTitle(Text("What’s this about?", bundle: .module))
            FeedbackChipFlowLayout(spacing: 8) {
                ForEach(appearance.categories) { category in
                    FeedbackSelectableChip(
                        title: category.label,
                        symbolName: category.symbolName,
                        isSelected: viewModel.category == category,
                        tint: category.tintColor
                    ) { viewModel.category = category }
                    .accessibilityIdentifier("feedbackCategory.\(category.rawValue)")
                }
            }
        }
    }

    private var messageSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                sectionTitle(Text("Your message", bundle: .module))
                Spacer()
                Text("\(viewModel.remainingCharacters)")
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(viewModel.remainingCharacters < 0 ? .red : .secondary)
            }
            ZStack(alignment: .topLeading) {
                if viewModel.message.isEmpty {
                    Text("What happened, or what should I build?", bundle: .module)
                        .foregroundStyle(.tertiary)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 18)
                        .allowsHitTesting(false)
                }
                TextEditor(text: $viewModel.message)
                    .focused($focusedField, equals: .message)
                    .frame(minHeight: 150)
                    .padding(10)
                    .scrollContentBackground(.hidden)
                    .background(Color.clear)
                    .accessibilityIdentifier("feedbackMessageField")
            }
            .background(RoundedRectangle(cornerRadius: 16).fill(Color(.secondarySystemGroupedBackground)))
            .overlay {
                RoundedRectangle(cornerRadius: 16)
                    .strokeBorder(messageBorderColor, lineWidth: focusedField == .message ? 1.5 : 1)
            }
            .animation(fieldAnimation, value: focusedField)
            if shouldShowMessageError {
                validationMessage(String(
                    localized: "Enter at least 4 characters and keep your message under 2,000.",
                    bundle: .module
                ))
            }
        }
    }

    private var attachmentSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionTitle(Text("Add an image", bundle: .module))
            if let attachment = viewModel.attachment, let image = UIImage(data: attachment.data) {
                FeedbackCard(padding: 12) {
                    HStack(spacing: 12) {
                        Image(uiImage: image)
                            .resizable()
                            .scaledToFill()
                            .frame(width: 72, height: 72)
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Image attached", bundle: .module)
                                .font(.subheadline.weight(.semibold))
                            Text(ByteCountFormatter.string(fromByteCount: Int64(attachment.data.count), countStyle: .file))
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            Button(role: .destructive) {
                                selectedPhoto = nil
                                viewModel.removeAttachment()
                            } label: {
                                Label { Text("Remove", bundle: .module) } icon: { Image(systemName: "trash") }
                                    .font(.footnote.weight(.semibold))
                            }
                            .buttonStyle(.bordered)
                            .controlSize(.small)
                        }
                        Spacer(minLength: 0)
                    }
                }
            } else if viewModel.isProcessingAttachment {
                HStack(spacing: 10) {
                    ProgressView()
                    Text("Preparing image…", bundle: .module)
                }
                .frame(maxWidth: .infinity, minHeight: 44)
            } else {
                PhotosPicker(selection: $selectedPhoto, matching: .images) {
                    Label { Text("Choose an image", bundle: .module) } icon: { Image(systemName: "photo.badge.plus") }
                        .font(.subheadline.weight(.semibold))
                        .frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.bordered)
                .tint(accent)
                .disabled(viewModel.isSubmitting)
                .accessibilityIdentifier("feedbackImagePicker")
            }
            Text(attachmentDisclosure)
                .font(.footnote)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            if let error = viewModel.attachmentErrorMessage { validationMessage(error) }
        }
        .onChange(of: selectedPhoto) { _, photo in
            photoLoadingTask?.cancel()
            guard let photo else { return }
            let requestID = viewModel.beginAttachmentProcessing()
            let viewModel = viewModel
            photoLoadingTask = Task {
                do {
                    guard let data = try await photo.loadTransferable(type: Data.self) else {
                        viewModel.failToLoadAttachment(requestID: requestID)
                        return
                    }
                    try Task.checkCancellation()
                    viewModel.attachImage(data, requestID: requestID)
                } catch is CancellationError {
                    return
                } catch {
                    viewModel.failToLoadAttachment(requestID: requestID)
                }
            }
        }
    }

    private var contactSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            sectionTitle(Text("About you", bundle: .module))
            FeedbackTextField(
                title: String(localized: "Name", bundle: .module),
                prompt: String(localized: "Optional", bundle: .module),
                symbolName: "person",
                text: $viewModel.name,
                tint: accent,
                errorMessage: nameError,
                isFocused: focusedField == .name
            )
            .focused($focusedField, equals: .name)
            .textContentType(.name)
            .textInputAutocapitalization(.words)
            .autocorrectionDisabled()
            .submitLabel(.next)
            .onSubmit { focusedField = .email }
            .accessibilityIdentifier("feedbackNameField")

            FeedbackTextField(
                title: String(localized: "Email", bundle: .module),
                prompt: String(localized: "Optional", bundle: .module),
                symbolName: "envelope",
                text: $viewModel.replyEmail,
                tint: accent,
                errorMessage: emailError,
                isFocused: focusedField == .email
            )
            .focused($focusedField, equals: .email)
            .textContentType(.emailAddress)
            .keyboardType(.emailAddress)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .submitLabel(.done)
            .onSubmit { focusedField = nil }
            .accessibilityIdentifier("feedbackEmailField")

            Text("Optional. Add these only if you’d like me to reply.", bundle: .module)
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
    }

    private var privacyCard: some View {
        FeedbackCard(padding: 14) {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: "hand.raised.fill")
                    .font(.title3)
                    .foregroundStyle(accent)
                    .frame(width: 28)
                VStack(alignment: .leading, spacing: 5) {
                    Text("What gets shared", bundle: .module)
                        .font(.subheadline.weight(.semibold))
                    Text(appearance.copy.privacyMessage)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }

    private var submitButton: some View {
        Button {
            focusedField = nil
            viewModel.submit()
        } label: {
            if viewModel.isSubmitting {
                ProgressView().tint(accent)
            } else {
                Label { Text("Send", bundle: .module) } icon: { Image(systemName: "paperplane.fill") }
                    .labelStyle(.titleAndIcon)
                    .font(.body.weight(.semibold))
            }
        }
        .tint(accent)
        .disabled(!viewModel.canSubmit)
        .accessibilityLabel(Text("Send Feedback", bundle: .module))
        .accessibilityIdentifier("feedbackSubmitButton")
    }

    // MARK: Helpers

    private var attachmentDisclosure: String {
        if let days = appearance.copy.attachmentRetentionDays {
            return String(
                localized: "Optional. One image is compressed before upload and removed after \(days) days.",
                bundle: .module
            )
        }
        return String(localized: "Optional. One image is compressed before upload.", bundle: .module)
    }

    private func sectionTitle(_ title: Text) -> some View {
        title.font(.subheadline.weight(.semibold))
    }

    private func validationMessage(_ message: String) -> some View {
        Label(message, systemImage: "exclamationmark.circle.fill")
            .font(.caption)
            .foregroundStyle(.red)
            .fixedSize(horizontal: false, vertical: true)
    }

    private var fieldAnimation: Animation? {
        reduceMotion ? nil : .spring(response: 0.3, dampingFraction: 1)
    }

    private var messageBorderColor: Color {
        if shouldShowMessageError { return .red.opacity(0.75) }
        return focusedField == .message ? accent.opacity(0.65) : .secondary.opacity(0.14)
    }

    private var shouldShowMessageError: Bool {
        !viewModel.message.isEmpty && !viewModel.isMessageValid && focusedField != .message
    }

    private var nameError: String? {
        !viewModel.isNameValid && focusedField != .name
            ? String(localized: "Keep your name under 120 characters.", bundle: .module) : nil
    }

    private var emailError: String? {
        !viewModel.isReplyEmailValid && focusedField != .email
            ? String(localized: "Enter a valid email address or leave this blank.", bundle: .module) : nil
    }

    private enum Field: Hashable { case message, name, email }

    private struct AlertContent: Identifiable {
        let id = UUID()
        let title: String
        let message: String
        let receipt: FeedbackReceipt?
    }
}

// MARK: - Components

struct FeedbackCard<Content: View>: View {
    let padding: CGFloat
    @ViewBuilder let content: Content

    var body: some View {
        content
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 16).fill(Color(.secondarySystemGroupedBackground)))
    }
}

struct FeedbackSelectableChip: View {
    let title: String
    let symbolName: String
    let isSelected: Bool
    let tint: Color
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Label { Text(title) } icon: { Image(systemName: symbolName) }
                .font(.subheadline.weight(.semibold))
                .padding(.horizontal, 14)
                .padding(.vertical, 9)
                .background(
                    Capsule().fill(isSelected ? tint.opacity(0.18) : Color(.secondarySystemGroupedBackground))
                )
                .overlay(Capsule().strokeBorder(isSelected ? tint : .clear, lineWidth: 1.5))
                .foregroundStyle(isSelected ? tint : .primary)
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isSelected ? [.isSelected] : [])
    }
}

struct FeedbackTextField: View {
    let title: String
    let prompt: String
    let symbolName: String
    @Binding var text: String
    let tint: Color
    let errorMessage: String?
    let isFocused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 10) {
                Image(systemName: symbolName)
                    .foregroundStyle(isFocused ? tint : .secondary)
                    .frame(width: 20)
                TextField(title, text: $text, prompt: Text(prompt))
            }
            .padding(.horizontal, 14)
            .frame(minHeight: 48)
            .background(RoundedRectangle(cornerRadius: 14).fill(Color(.secondarySystemGroupedBackground)))
            .overlay(
                RoundedRectangle(cornerRadius: 14)
                    .strokeBorder(borderColor, lineWidth: isFocused ? 1.5 : 1)
            )
            if let errorMessage {
                Label(errorMessage, systemImage: "exclamationmark.circle.fill")
                    .font(.caption)
                    .foregroundStyle(.red)
            }
        }
    }

    private var borderColor: Color {
        if errorMessage != nil { return .red.opacity(0.75) }
        return isFocused ? tint.opacity(0.65) : .secondary.opacity(0.14)
    }
}

/// Lays children out left-to-right, wrapping to new rows as needed.
struct FeedbackChipFlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let rows = arrange(proposal: proposal, subviews: subviews)
        let width = rows.map(\.width).max() ?? 0
        let height = rows.reduce(0) { $0 + $1.height } + CGFloat(max(rows.count - 1, 0)) * spacing
        return CGSize(width: proposal.width ?? width, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var y = bounds.minY
        for row in arrange(proposal: proposal, subviews: subviews) {
            var x = bounds.minX
            for index in row.indices {
                let size = subviews[index].sizeThatFits(.unspecified)
                subviews[index].place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
                x += size.width + spacing
            }
            y += row.height + spacing
        }
    }

    private struct Row {
        var indices: [Int] = []
        var width: CGFloat = 0
        var height: CGFloat = 0
    }

    private func arrange(proposal: ProposedViewSize, subviews: Subviews) -> [Row] {
        let maxWidth = proposal.width ?? .infinity
        var rows: [Row] = [Row()]
        for (index, subview) in subviews.enumerated() {
            let size = subview.sizeThatFits(.unspecified)
            var current = rows[rows.count - 1]
            let proposedWidth = current.width + (current.indices.isEmpty ? 0 : spacing) + size.width
            if !current.indices.isEmpty, proposedWidth > maxWidth {
                rows.append(Row(indices: [index], width: size.width, height: size.height))
            } else {
                current.indices.append(index)
                current.width = proposedWidth
                current.height = max(current.height, size.height)
                rows[rows.count - 1] = current
            }
        }
        return rows
    }
}
#endif
