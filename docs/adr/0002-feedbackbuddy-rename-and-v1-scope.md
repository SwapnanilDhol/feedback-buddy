# ADR 0002 — FeedbackBuddy name, single-Worker SaaS, and v1 scope

Date: 2026-11-06

Status: Accepted

## Context

The August 2026 scaffold ("Feedback Loop", product `FeedbackCore`) stopped at
a platform-neutral client core and JSON contracts. Meanwhile the portfolio
shipped feedback through `SwapFoundationKitFeedback` plus one edge Worker per
app in front of the Indie Ops Worker. Onboarding an app takes about eight
operational steps and there is no inbox; triage happens from Slack posts.
See [docs/PLAN.md](../PLAN.md) for the gathered requirements.

## Decisions

1. **Name.** The package, products and service are `FeedbackBuddy`. Products:
   `FeedbackBuddy` (iOS UI + facade) and `FeedbackBuddyCore` (platform-neutral
   contract, validation, transport). The GitHub repository stays
   `SwapnanilDhol/feedback-buddy`. `FeedbackCore` is renamed; it had no
   consumers.
2. **Contract v1 is final** as written in [docs/contract-v1.md](../contract-v1.md).
   It supersedes both the scaffold's draft (`X-Feedback-Project-ID`) and the
   SFK/Indie Ops envelope (`contract_version`, `X-Installation-ID`, body
   idempotency key). Project identity comes from a bearer **public key**;
   idempotency and installation identity are headers so JSON and multipart
   share one path.
3. **One Worker at one URL, many projects** with D1 + R2 + cron, no Queues and no
   per-app Workers. Projects, keys and destinations are rows, created from the
   dashboard. This is what makes "plug into my apps easily" true.
4. **Dashboard is server-rendered inside the same Worker** (Hono JSX, no
   build step). An admin bearer token exposes the same handlers as JSON so
   Claude Code and scripts can triage without the UI.
5. **Single owner, no accounts.** `ADMIN_PASSWORD` + HMAC session cookie. There is deliberately no user, team or billing model.
6. **Indie Ops is left as is.** Apps migrate one at a time; their Slack
   channels keep working through a Slack incoming-webhook destination. Once an
   app ships on FeedbackBuddy its `<app>-feedback` edge Worker is deleted.
7. **No SwapFoundationKit dependency** in the package, so non-SFK apps
   (WhatsPlaying, PadelScore, Tap2WiFi, HabitBuddy, …) can adopt it.

## Consequences

- Hosts migrate by replacing their `UserFeedbackComposition` with
  `FeedbackBuddy.configure(...)`; the RevenueCat context provider keeps its
  shape ([docs/migration-from-sfk.md](../migration-from-sfk.md)).
- An email destination is explicitly
  deferred. Multi-user accounts and billing are out of scope by design.
