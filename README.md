# FeedbackBuddy

In-app feedback for iOS apps in one line, with a hosted inbox you own.

```swift
import FeedbackBuddy

FeedbackBuddy.configure(apiKey: "fb_pub_…")       // once, at launch
FeedbackBuddy.present(from: viewController)        // UIKit
.feedbackBuddySheet(isPresented: $showFeedback)    // SwiftUI
```

Users get a polished form (feedback / bug / idea, message, optional name and
email, one compressed screenshot). You get a dashboard inbox, Slack and
webhook destinations, an admin API for scripts and agents, and nothing to
deploy per app.

## What's in this repository

| Path | What |
|---|---|
| `Sources/FeedbackBuddy` | iOS 17+ UI: `FeedbackBuddy` facade, SwiftUI form, sheet modifier, UIKit presentation, Keychain installation ID, image compression |
| `Sources/FeedbackBuddyCore` | Platform-neutral contract models, validation, HTTP transport (no UIKit) |
| `server/` | Cloudflare Worker: ingest API, admin API, D1 + R2, delivery retries and retention, plus a built-in fallback dashboard |
| `dashboard/` | The dashboard: Next.js 16, Tailwind 4, shadcn/ui, motion. Deployed on Vercel at https://feedback-buddy.vercel.app, talks to the Worker admin API server-side |
| `mcp/` | MCP server exposing projects, feedback, attachments and triage to agents |
| `contracts/` | JSON schemas and golden fixtures — the source of truth for client and server |
| `docs/` | [Plan](docs/PLAN.md) · [HTTP contract v1](docs/contract-v1.md) · [Integration](docs/integration.md) · [Migrating from SwapFoundationKitFeedback](docs/migration-from-sfk.md) · ADRs |

## Add it to an app

1. Dashboard → **New project** → copy the public key.
2. Xcode → Add Package → `https://github.com/SwapnanilDhol/feedback-buddy` → product **FeedbackBuddy**.
3. Call `FeedbackBuddy.configure(apiKey:)` at launch and present the form from Settings.

Full options (user context from RevenueCat, appearance, analytics events,
custom UI) are in [docs/integration.md](docs/integration.md).

## Run the backend

```bash
cd server
npm install
npm run check          # typecheck + tests against local D1/R2
npm run dev            # http://localhost:8787 — dashboard at /, login with ADMIN_PASSWORD from .dev.vars
```

Deploying to your own Cloudflare account is described in
[server/README.md](server/README.md): one Worker, one D1 database, one R2
bucket, three secrets.

## Triage from the terminal (or from an agent)

```bash
curl -s -H "Authorization: Bearer $FEEDBACK_ADMIN_TOKEN" \
  "https://<worker>/api/v1/projects/<id>/feedback?status=new"
```

## Validate

```bash
swift test                                  # core, macOS
xcodebuild test -scheme FeedbackBuddy-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro'
node contracts/validate-fixtures.mjs
cd server && npm run check
```

## Design principles

- The SDK speaks only the documented HTTP contract; the Cloudflare Worker is
  the reference backend, not a dependency.
- Public keys can only create feedback; everything else needs the admin token
  or a dashboard session.
- The package imports no analytics, logging, or third-party SDKs.
- Installation identity is pseudonymous and hashed before storage; attachments
  expire.

## License

MIT (see [LICENSE](LICENSE)).
