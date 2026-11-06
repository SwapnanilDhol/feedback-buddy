# Engineering notes

## Foundation — 2026-08-10

Scope completed in the initial public repository:

- Repository and package scaffold created as an independent product foundation.
- `FeedbackCore` public models and dependency seams added.
- Local validation enforces the documented message, reply-email, and context limits using Unicode scalar counts.
- HTTP transport adds the versioned request envelope, project/installation/idempotency headers, injected authorization, timeout, and documented status mapping.
- Receipt decoding preserves forward compatibility for unknown delivery statuses.
- Submission, receipt, and webhook schemas plus golden fixtures added.
- Package-scope and compatibility decisions recorded in ADR 0001.

Evidence:

- `swift test` — 6 Swift Testing cases passed, including shared fixture decoding and transport headers/body.
- `node contracts/validate-fixtures.mjs` — all three fixture families passed structural validation.

Next work:

- Add a full fixture-driven Swift/TypeScript schema validator once the Worker test harness exists.
- Expand the transport tests to exercise every documented HTTP status and authorizer failure.
- Complete `FeedbackUI` and the optional `FeedbackSFK` adapter in Phase 2.

## FeedbackBuddy v1 — 2026-11-06

Scope completed:

- Requirements gathered from the portfolio's existing stack
  (`SwapFoundationKitFeedback`, per-app edge Workers, Indie Ops) and written
  up in `docs/PLAN.md`; decisions in ADR 0002.
- Contract v1 finalized (`docs/contract-v1.md`, `contracts/`): bearer public
  keys, header-based installation ID and idempotency key, JSON or multipart,
  snake_case receipt, `feedback.created` webhook with HMAC signature, admin API.
- Package renamed to FeedbackBuddy. `FeedbackBuddyCore` (platform neutral)
  and `FeedbackBuddy` (iOS 17 UI: facade, `@Observable` view model, SwiftUI
  form, sheet modifier, UIKit presentation, Keychain installation ID with
  `UserDefaults` fallback, JPEG compression, localizable strings).
- `server/`: one Worker at one URL. Hono + zod, D1 + R2, request-driven
  maintenance for delivery retries and attachment retention (no cron: the
  Free plan's five slots were in use), SSR dashboard with `hono/jsx`, admin API,
  single operator login. Tests run on real miniflare D1/R2 through
  `@cloudflare/vitest-plugin`.

Evidence:

- `swift test` — 12 tests, 2 suites (macOS, core).
- `xcodebuild test -scheme FeedbackBuddy-Package` on iPhone 16 Pro (iOS 18.4)
  — 24 tests, 6 suites; zero compiler warnings on the generic iOS build.
- `cd server && npm run check` — typecheck clean, 30 tests, 7 files.
- `node contracts/validate-fixtures.mjs` — passes.
- Local `wrangler dev` smoke: health, project creation, JSON and multipart
  ingest, bad-key 401, admin list, login cookie, dashboard pages render.

Known gaps:

- Dashboard CSRF relies on `SameSite=Lax`; login throttle is per-isolate.
- No email destination, offline queue, or shake gesture (see PLAN §1 "Later").
- Simulator note: `name=iPhone 16 Pro` resolves to the newest runtime; pass
  `OS=18.4` or the device `id=` when the named simulator is on an older iOS.

## Passkey sign-in — 2026-11-06

- Added WebAuthn passkeys for the dashboard: `server/src/passkeys.ts`
  (`@simplewebauthn/server` 13), migration `0002_passkeys.sql`, public
  `/auth/passkey/{options,verify}`, session-protected
  `/security` page and `/security/passkeys/*` routes, inline client script
  (no bundler), same-origin checks on JSON posts, challenge in a signed
  5-minute cookie. Login page switches to passkey-first once one exists; the
  password remains behind a link.
- Fixed a latent flash-cookie bug: `btoa` rejected non-Latin-1 text (curly
  quotes, emoji). Cookie payloads now use UTF-8 safe helpers.
- Evidence: `npm run check` — 36 tests, 9 files; verification functions are
  swapped in tests since no authenticator exists under vitest.

## Dashboard redesign and project seeding — 2026-11-06

- Restyled the dashboard: warm palette with coral accent, dark sidebar with a
  stable per-app monogram colour (hashed from the slug) and unread counts,
  overview headline with total new messages, project cards with a big "new"
  numeral and a new/triaged/closed proportion bar, inbox rows with category
  markers, refreshed login page. CSS only, still server-rendered.
- Created one production project per live app from
  `~/Desktop/app-dashboard/apps.config.json` (15 total). Keys are in
  `server/.secrets.local`. The Cloudflare bot check (error 1010) rejects
  Python's default user agent on the admin API; scripts should send a named
  `User-Agent`.

## Minimalist dashboard rebuild — 2026-11-06

- Rebuilt the dashboard presentation layer from scratch (`layout.tsx`,
  `pages.tsx`) around a fixed page skeleton: every page has the same header
  block (crumb line, title, meta line, actions), panels with one border and
  no shadows, 32px controls, and no hover transforms. `scrollbar-gutter:
  stable` stops horizontal shift when page height changes; flash messages
  render as a fixed toast so they never push content; attachment images sit
  in a reserved frame; labels never wrap.
- Neutral palette with ink-coloured primary buttons; status and category are
  dot-plus-text; per-app colour is a small dot in the sidebar. Filters
  auto-submit on change with a visible Clear link. Narrow screens get a chip
  sidebar.
- Fixed a pre-existing flaky test: the session cookie tampering check was a
  no-op whenever the random ID's cookie already began with "Z".
- Verified in the browser at 1280px and 820px widths in light and dark mode.

## Overview dashboard, app icons, navigation — 2026-11-06

- Overview is now a dashboard: four stat tiles across all apps (new, open
  bugs, last 7 days, awaiting reply), a "Latest" stream of the newest
  messages from every app, and an app grid. Queries in `repository.ts`
  (`overviewStats`, `listLatestFeedback`).
- App icons: `src/icons.ts` looks up artwork by bundle ID through the iTunes
  Search API, normalises to a 256px square, caches it on `projects.icon_url`
  (migration `0003_project_icons.sql`) and rechecks weekly from maintenance.
  Lookups also run right after a project is created or its bundle ID changes.
  `Project.icon_url` is exposed on the admin API.
- Navigation: "New app" moved to the sidebar with its own page; every
  sub-page has a back link in the header; cross-document View Transitions
  give a 160ms crossfade between pages (disabled under reduced motion).
- Tests are hermetic: `test/setup.ts` stubs outbound fetch so nothing reaches
  the network unless a test stubs it explicitly. 40 tests.
- Icon lookups from the Worker hit Apple's per-address rate limit when run in
  bursts (shared Cloudflare egress): the first production pass of ten failed
  entirely. Now at most three lookups per maintenance pass; a failed lookup is
  retried after 15 minutes, while "no result" is rechecked weekly.

## Workflow statuses and issue keys — 2026-11-07

- Statuses are now `todo` / `in_progress` / `done` / `wont_do` (Jira/Linear
  style), validated in code; migration `0005` rebuilds `feedback` without the
  old CHECK and maps new→todo, triaged→in_progress, closed→done.
- Each project has a short issue key (`GOA`) and each feedback a per-project
  sequence number, shown as `GOA-12` everywhere, searchable by exact key, and
  exposed on the API (`key`, `number`) and MCP.
- Dashboard rows are single-line Linear-style issues (status icon, key, title,
  category, version, time); the detail header has a status dropdown that
  saves on change; the inbox defaults to open items (`status=open`).
- Also in this stretch: in-place client navigation with a page cache, a
  doctype on every page (Quirks Mode was adding form margins), an email
  destination via Cloudflare Email Sending, feedback deletion, and the
  `mcp/` server.

## Next.js dashboard on Vercel — 2026-11-07

- `dashboard/`: Next.js 16 App Router, Tailwind 4, shadcn/ui, `motion`,
  `@simplewebauthn/browser`. Server components fetch the Worker admin API
  with the admin token from Vercel env (`FEEDBACK_API_URL`,
  `FEEDBACK_ADMIN_TOKEN`, `DASHBOARD_SESSION_SECRET`); mutations are server
  actions; attachments are proxied through a route handler. Own HMAC session
  cookie; password and passkey ceremonies go through the Worker's
  `/api/v1/auth/*` endpoints with the dashboard host as relying party.
- Passkeys now carry `rp_id` (migration `0006`); each host only lists,
  offers and accepts its own. The Worker's `ALLOWED_RP_IDS` var lists the
  Vercel hostnames.
- Vercel project `feedback-buddy` (team swapnanildhols-projects), deployed
  with `vercel deploy --prod` from `dashboard/`. Framework had to be set to
  Next.js explicitly via the API (the CLI-created project had none, which
  served platform 404s), and Vercel Authentication was switched off because
  the app has its own login. Production: https://feedback-buddy.vercel.app.
- The Worker's SSR dashboard stays as a fallback at the workers.dev host.
