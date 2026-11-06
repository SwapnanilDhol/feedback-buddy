import FeedbackBuddyCore
import Foundation

#if canImport(UIKit)
import SwiftUI

public extension View {
    /// Presents the feedback form as a sheet.
    ///
    /// ```swift
    /// .feedbackBuddySheet(isPresented: $showingFeedback)
    /// ```
    func feedbackBuddySheet(isPresented: Binding<Bool>, source: String = "settings") -> some View {
        sheet(isPresented: isPresented) {
            FeedbackBuddySheetContent(source: source)
        }
    }
}

struct FeedbackBuddySheetContent: View {
    @Environment(\.dismiss) private var dismiss
    let source: String

    var body: some View {
        NavigationStack {
            FeedbackBuddyView(source: source) { _ in dismiss() }
                .toolbar {
                    ToolbarItem(placement: .topBarLeading) {
                        Button { dismiss() } label: { Text("Close", bundle: .module) }
                            .accessibilityIdentifier("feedbackCloseButton")
                    }
                }
        }
        .presentationDetents([.large])
        .tint(FeedbackBuddy.appearance.accentColor)
    }
}
#endif
