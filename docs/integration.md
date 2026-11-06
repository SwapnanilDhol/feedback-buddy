# Integrating FeedbackBuddy into an iOS app

Requirements: iOS 17+, Swift 6 toolchain (Xcode 16+), a project public key
from the dashboard.

## 1. Add the package

Xcode → File → Add Package Dependencies →
`https://github.com/SwapnanilDhol/feedback-buddy` → product **FeedbackBuddy**.

## 2. Configure once at launch

```swift
import FeedbackBuddy

@main
struct MyApp: App {
    init() {
        FeedbackBuddy.configure(apiKey: "fb_pub_…")
    }
    var body: some Scene { WindowGroup { ContentView() } }
}
```

`endpoint:` defaults to the hosted service; pass your own Worker URL if you
self-host. The key is a public key: it can only create feedback for one
project, so embedding it in the binary is fine.

## 3. Show the form

SwiftUI:

```swift
struct SettingsView: View {
    @State private var isShowingFeedback = false
    var body: some View {
        Button("Send feedback") { isShowingFeedback = true }
            .feedbackBuddySheet(isPresented: $isShowingFeedback, source: "settings")
    }
}
```

UIKit:

```swift
FeedbackBuddy.present(from: self, source: "settings")
```

## 4. Optional: tell it who the user is

```swift
import FeedbackBuddyCore

FeedbackBuddy.configure(
    apiKey: "fb_pub_…",
    userContextProvider: ClosureFeedbackUserContextProvider {
        FeedbackUserContext(id: userID, accountStatus: .paid, plan: "pro_annual",
                            entitlements: ["pro"], attributes: ["theme": "dark"])
    }
)

// Or, when the context is known up front and changes rarely:
FeedbackBuddy.identify(FeedbackUserContext(id: userID, accountStatus: .paid))
```

The provider runs when the user taps Send, so it can `await` RevenueCat or
StoreKit. Keep attributes to short, non-sensitive strings (≤ 20 keys).

## 5. Optional: appearance, copy, analytics

```swift
FeedbackBuddy.configure(
    apiKey: "fb_pub_…",
    appearance: .init(
        accentColor: .indigo,
        copy: .init(introductionTitle: "Tell us what you think",
                    attachmentRetentionDays: 30),
        allowsAttachment: true,
        categories: [.feedback, .bug, .idea]
    ),
    eventHandler: { event in
        switch event {
        case .opened(let source): Analytics.track("feedback_opened", ["source": source])
        case .submitted(let category): Analytics.track("feedback_submitted", ["category": category.rawValue])
        case .succeeded(let category, _): Analytics.track("feedback_succeeded", ["category": category.rawValue])
        case .failed(let category, let reason): Analytics.track("feedback_failed", ["category": category.rawValue, "reason": "\(reason)"])
        }
    }
)
```

## 6. Optional: your own UI

Use the core client directly and skip the bundled form:

```swift
let receipt = try await FeedbackBuddy.submit(
    FeedbackDraft(category: .bug, message: "Crash when rotating")
)
print(receipt.feedbackID, receipt.shortReference)
```

## What gets sent

Category, message, optional name and reply email, one compressed image if the
user adds one, app version/build, OS version, locale, device family/model, a
pseudonymous installation UUID (stored in the Keychain, with a `UserDefaults`
fallback if the Keychain is unavailable; hashed server-side), and whatever
your user-context provider returns. Nothing else.

## Triage without the dashboard

```bash
curl -s -H "Authorization: Bearer $FEEDBACK_ADMIN_TOKEN" \
  "https://<your-worker>/api/v1/projects/<project id>/feedback?status=new&category=bug"
```

Mark one triaged:

```bash
curl -s -X PATCH -H "Authorization: Bearer $FEEDBACK_ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"status":"triaged","internal_note":"Fixed in 5.1 (#123)"}' \
  "https://<your-worker>/api/v1/feedback/<feedback id>"
```
