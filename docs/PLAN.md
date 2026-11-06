# FeedbackBuddy — plan

Date: 2026-11-06

## 1. Why this exists

Requirements were gathered from the existing feedback stack across the iOS
portfolio (SwapFoundationKit, Indie Ops, per-app edge Workers, the BookBuddy
"Almond feedback integration plan") and from how feedback is actually triaged
in practice (bug reports pasted into Claude Code sessions from Slack).

### What exists today

| Layer | Today | Pain |
|---|---|---|
| SDK | `SwapFoundationKitFeedback` (SwiftUI form, UIKit coordinator, Keychain installation ID, 1 compressed JPEG, RevenueCat context injected by host) | Depends on `SwapFoundationKit` + `SwapFoundationKitMedia`; apps outside SFK (WhatsPlaying, PadelScore, Tap2WiFi, HabitBuddy, SplitBuddy, StickerTweet, Emoticon, VoiceNotes, SortDaily) fall back to a mail sheet. |
| Edge | One Cloudflare Worker per app (`neon-`, `passmaker-`, `windfall-`, `recur-`, `goaley-`, `almond-`, `moonspan-feedback`), app slug baked in via `FEEDBACK_APP_SLUG`, shared `FEEDBACK_EDGE_TOKEN` | Every new app = new Worker deploy + token rotation. |
| Core | Indie Ops Worker: zod contract, D1 `feedback` table, Queue delivery, Slack bot per channel, email mirror | Apps are a static `config/apps.json`; Slack routes are hand-written D1 migrations; Queues need the paid plan. |
| Triage | Slack channels (`<app>-user-feedback`, `-bug-reports`, `-ideas`) + support mailbox mirror | No inbox, no status, no search, no API for an agent to pull "new bugs for Goaley". `feedback.status` exists but nothing sets it. |
| Onboarding one app | ~8 steps: registry edit + tests, deploy edge Worker, rotate token, create 3 Slack channels, write migration, deploy Indie Ops, provision secret, write host composition file | Hours, error-prone, undocumented per app. |

### Requirements distilled

Must have (v1):

1. **One-line integration.** `FeedbackBuddy.configure(apiKey:)` then
   `FeedbackBuddy.present(from:)` or `.feedbackBuddySheet(isPresented:)`.
   No SwapFoundationKit dependency, iOS 17+, Swift 6 strict concurrency.
2. **Same form features apps already ship:** category (feedback / bug /
   idea), message, optional name and reply email, one compressed image,
   privacy disclosure, accent color and copy overrides, analytics event hook.
3. **Stable pseudonymous installation ID** in Keychain, hashed server-side;
   idempotent submission with retry of the same attempt.
4. **User context** (RevenueCat-derived user ID, plan, free/paid,
   entitlements, bounded attributes) supplied by the host, never required.
5. **One backend, one URL, many projects.** Single owner, no accounts. Create a project in the
   dashboard → get a public API key → paste it in the app. Projects, keys and
   destinations live in D1, not in code.
6. **Inbox.** List, filter (category, status, app version), search, open,
   view attachment, change status (new → triaged → closed), add internal
   notes, mailto reply.
7. **Destinations.** Slack incoming webhook per project (keeps the existing
   channels working), signed generic webhook (`feedback.created`).
8. **Admin API** with a bearer token so Claude Code / scripts can pull
   `new` feedback for a project and update status. This replaces pasting
   Slack posts into sessions.
9. **Rate limiting, size limits, attachment retention** (default 30 days).
10. **Migration path** from `SwapFoundationKitFeedback`: a ten-line change in
    each app's `UserFeedbackComposition.swift`.

Later (not v1): email destination, offline
queue in the SDK, shake-to-report, screenshots annotation, macOS/visionOS UI,
reply-by-email threads, App Store review prompting, per-project custom
categories.

## 2. Architecture

```
┌──────────────┐  HTTPS, Bearer fb_pub_…   ┌─────────────────────────────┐
│ iOS app      │ ─────────────────────────▶│ feedback-buddy Worker        │
│ FeedbackBuddy│  POST /v1/feedback        │  Hono + zod                  │
└──────────────┘                           │  D1: projects, api_keys,     │
                                           │      feedback, destinations, │
┌──────────────┐  session cookie / Bearer  │      deliveries, sessions    │
│ Dashboard    │ ◀────────────────────────▶│  R2: attachments             │
│ (SSR, same   │  /  /p/:id  /api/v1/…     │  Maintenance: retry+retention│
│  Worker)     │                           └──────────┬──────────────────┘
└──────────────┘                                      │ waitUntil + per-request maintenance
                                                      ▼
                                        Slack incoming webhook · signed webhook
```

One Worker at one URL, one D1 database, one R2 bucket. Single owner. No Queues (works on the free
plan, and no cron: the account's five Free cron slots were taken); delivery
runs in `waitUntil` and a throttled post-request maintenance pass retries failures with
backoff and enforces attachment retention.

### Repository layout

```
Package.swift                 FeedbackBuddy, FeedbackBuddyCore products
Sources/FeedbackBuddyCore/    platform-neutral contract, validation, transport
Sources/FeedbackBuddy/        iOS UI: configure/present, SwiftUI form, Keychain ID, image compression
Tests/                        Swift Testing
contracts/                    JSON schemas + golden fixtures (source of truth)
server/                       Cloudflare Worker (API + dashboard), migrations, vitest
docs/                         this plan, contract, integration, migration, ADRs
```

### Server data model (D1)

- `projects(id, slug, name, bundle_id?, accent?, retention_days, created_at)` — no owner concept; the dashboard has one operator
- `api_keys(id, project_id, kind 'public'|'admin', prefix, hash, created_at, revoked_at)`
- `feedback(id, project_id, idempotency_key, category, message, name, reply_email, installation_hash, app_version, build_number, os_version, locale, device_family, device_model, user_id, account_status, plan, entitlements_json, attributes_json, attachment_key, attachment_content_type, attachment_byte_count, status, internal_note, created_at, updated_at, UNIQUE(project_id, idempotency_key))`
- `destinations(id, project_id, kind 'slack_webhook'|'webhook', url, secret, categories_json, enabled, created_at)`
- `deliveries(id, feedback_id, destination_id, status, attempts, next_attempt_at, last_error, delivered_at)`
- `sessions(id, expires_at, created_at)`

### Authentication

- **Ingest:** `Authorization: Bearer fb_pub_<project>_<random>`; the key's
  SHA-256 is looked up in `api_keys`. Public keys are safe to embed; they can
  only create feedback for one project. Rotation keeps the old key valid until
  revoked.
- **Dashboard:** single owner. Passkey (WebAuthn) sign-in once enrolled from the
  Security page, with the password as recovery. `ADMIN_PASSWORD` secret → HMAC session
  cookie (`SESSION_SECRET`), 30-day expiry, `HttpOnly; Secure; SameSite=Lax`.
- **Admin API:** `Authorization: Bearer <ADMIN_API_TOKEN>` on `/api/v1/*`.
  The dashboard uses the same handlers with the session cookie.


## 3. Wire contract v1

Defined in [docs/contract-v1.md](contract-v1.md) and enforced by
`contracts/*.schema.json`. Summary:

- `POST /v1/feedback` — JSON or `multipart/form-data` (`payload` JSON part +
  `attachment` JPEG/PNG ≤ 1.5 MB). Headers: `Authorization`,
  `X-Feedback-Installation-ID` (UUID), `Idempotency-Key` (UUID).
- Response `202 {"feedback_id","duplicate","delivery_status"}`.
- Errors are `{"error": "<snake_case_code>"}` with 400/401/404/413/415/422/429/5xx.
- Webhook event `feedback.created` signed with `X-Feedback-Signature: sha256=<hmac>`.

## 4. Migration from SwapFoundationKitFeedback

Per app (Windfall, Goaley, PassMaker, Neon, Recur, Almond, Moonspan, Aeronautical):

1. Create the project in the dashboard; copy its public key.
2. Add the `FeedbackBuddy` product; remove `SwapFoundationKitFeedback`.
3. Replace `UserFeedbackComposition.makeCoordinator()` with
   `FeedbackBuddy.configure(...)` at launch and `FeedbackBuddy.present(from:)`
   where `presentFeedback()` is called. The RevenueCat context provider moves
   over unchanged in shape (see [docs/migration-from-sfk.md](migration-from-sfk.md)).
4. Point the project's Slack destination at the existing
   `<app>-user-feedback` channel via an incoming webhook (one per channel if
   bug/idea routing is wanted).
5. Once an app ships on FeedbackBuddy, delete its `<app>-feedback` edge Worker.

Apps on a mail sheet (WhatsPlaying, PadelScore, Tap2WiFi, HabitBuddy, …)
skip step 2's removal and only add steps 1–4.

## 5. Delivery plan

| Step | Output | Verification |
|---|---|---|
| Contract | `docs/contract-v1.md`, schemas, fixtures | `node contracts/validate-fixtures.mjs` |
| Server | `server/` Worker, migrations, dashboard, admin API | `npm run check` (typecheck + vitest with Workers pool), `wrangler dev` smoke via curl |
| SDK | `FeedbackBuddyCore`, `FeedbackBuddy` | `swift test` (macOS, core), `xcodebuild test` on iPhone simulator (UI) |
| Docs | README, integration, migration, ADR 0002 | review |
| Deploy | `feedback-buddy` Worker, D1, R2, secrets | `/health`, create project, submit from curl, see it in inbox |

## 6. Open decisions (made for v1, revisit later)

- **Name**: the package and products are `FeedbackBuddy`; the August scaffold
  was called "Feedback Loop" and `FeedbackCore`. Renamed in ADR 0002.
- **Hosting**: Cloudflare is the reference and the only supported backend for
  now; the Swift package still speaks only the documented HTTP contract.
- **Indie Ops** stays untouched. FeedbackBuddy does not forward to it; the
  Slack webhook destination covers the same channels.
- **Image types**: JPEG only from the SDK (compressed), server also accepts PNG
  for other clients.
