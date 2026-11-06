# Migrating an app from SwapFoundationKitFeedback

Applies to Windfall, Goaley, PassMaker, Neon, Recur, Almond, Moonspan and
Aeronautical. Apps on a mail sheet (WhatsPlaying, PadelScore, Tap2WiFi,
HabitBuddy, SplitBuddy, …) skip the removal steps.

## 1. Create the project

Dashboard → **New project** → name (and the bundle ID). Copy the public key
shown once (`fb_pub_…`). If you lose it, create a new key in Settings and
revoke the old one.

## 2. Swap the package

Xcode → package dependencies:

- Add `https://github.com/SwapnanilDhol/feedback-buddy`, product
  **FeedbackBuddy**, to the app target.
- Remove **SwapFoundationKitFeedback** from the app and test targets. Leave
  the other SwapFoundationKit products alone.

## 3. Replace the composition file

Before (`App/UserFeedbackComposition.swift`):

```swift
import SwapFoundationKitFeedback

typealias UserFeedbackCoordinator = SFKFeedbackCoordinator

@MainActor
enum UserFeedbackComposition {
    private static let backendBaseURL = URL(string: "https://goaley-feedback.swapnanildhol.workers.dev")!

    static func makeCoordinator() -> SFKFeedbackCoordinator {
        let installationStore = SFKFeedbackInstallationIdentifierStore()
        return SFKFeedbackCoordinator(
            configuration: SFKFeedbackConfiguration(
                baseURL: backendBaseURL,
                accentColor: .accentColor,
                copy: SFKFeedbackCopy(attachmentRetentionDays: 30),
                userContextProvider: .revenueCat,
                installationIDProvider: { try installationStore.identifier() }
            )
        )
    }
}
```

After:

```swift
import FeedbackBuddy
import FeedbackBuddyCore

@MainActor
enum UserFeedbackComposition {
    static func configure() {
        FeedbackBuddy.configure(
            apiKey: "fb_pub_…",                       // from the dashboard
            appearance: .init(accentColor: .accentColor,
                              copy: .init(attachmentRetentionDays: 30)),
            userContextProvider: .revenueCat,
            eventHandler: { event in AnalyticsService.track(event) } // optional
        )
    }
}
```

Call `UserFeedbackComposition.configure()` once at launch (where RevenueCat is
configured). Where the app used to do
`coordinator.present(from: viewController)` inside `presentFeedback()`, call:

```swift
FeedbackBuddy.present(from: viewController, source: "settings")
```

or, in SwiftUI, `.feedbackBuddySheet(isPresented: $isShowingFeedback)`.

The `onAccepted` hook that synced the contact to RevenueCat
(`UserFeedbackComposition.syncRevenueCatContact` in Windfall) maps to the
`.succeeded` event plus the draft's name/email, or simply drop it: the
dashboard now shows the reply email.

## 4. RevenueCat user context

Same shape as before, different type names:

```swift
import FeedbackBuddyCore
import RevenueCat

extension ClosureFeedbackUserContextProvider {
    static let revenueCat = ClosureFeedbackUserContextProvider {
        let userID = await Purchases.shared.appUserID
        guard let info = try? await Purchases.shared.customerInfo() else {
            return FeedbackUserContext(id: userID)          // accountStatus defaults to .unknown
        }
        let active = info.entitlements.active
        return FeedbackUserContext(
            id: userID,
            accountStatus: active.isEmpty ? .free : .paid,
            plan: active.values.map(\.productIdentifier).sorted().first,
            entitlements: active.keys.sorted()
        )
    }
}
```

## 5. Keep Slack working

Dashboard → project → Settings → **Destinations** → Slack webhook. Create an
incoming webhook in Slack for the existing `<app>-user-feedback` channel
(Slack app → Incoming Webhooks → Add to workspace → pick the channel). Add a
second destination filtered to `bug` for `<app>-bug-reports`, and one for
`idea` → `<app>-ideas`, if you want to keep the three-channel split. Press
**Test** to confirm.

## 6. Clean up after shipping

Once the FeedbackBuddy build is live for a release or two:

```bash
cd ~/Desktop/iOS-Projects/indie-ops
npx wrangler delete --name <app>-feedback
```

Then remove the app's row from the feedback-edge README table. Indie Ops
itself keeps running for any app not yet migrated.

## Analytics mapping

| SFK event | FeedbackBuddy event |
|---|---|
| `.opened(source:)` | `.opened(source:)` |
| `.submitted(category:)` | `.submitted(category:)` |
| `.succeeded(category:)` | `.succeeded(category:feedbackID:)` |
| `.failed(category:reason:)` | `.failed(category:reason:)` |

Never record the message, name, email or attachment in analytics; the events
carry none of them.

## Installation ID

`KeychainInstallationIdentifier` stores the pseudonymous UUID under
`<bundle id>.feedbackbuddy` / `installation-id`, the same way SFK did, so
existing installs get a new ID once (the SFK ID was under a different
service). If the Keychain is unavailable it falls back to `UserDefaults`
rather than failing the submission.
