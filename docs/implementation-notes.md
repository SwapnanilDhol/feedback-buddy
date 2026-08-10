# Implementation notes

## Phase 0 / Phase 1 — 2026-08-10

Scope completed in the initial standalone workspace:

- Repository/package scaffold created separately from METARBuddy.
- `FeedbackCore` public models and dependency seams added.
- Local validation enforces the documented message, reply-email, and context limits using Unicode scalar counts.
- HTTP transport adds the versioned request envelope, project/installation/idempotency headers, injected authorization, timeout, and documented status mapping.
- Receipt decoding preserves forward compatibility for unknown delivery statuses.
- Submission, receipt, and webhook schemas plus golden fixtures added.
- Provisional decisions recorded in ADR 0001; no product or ownership decision was published.

Evidence:

- `swift test` — 6 Swift Testing cases passed, including shared fixture decoding and transport headers/body.
- `node contracts/validate-fixtures.mjs` — all three fixture families passed structural validation.

Remaining Phase 1 work:

- Add a full fixture-driven Swift/TypeScript schema validator once the Worker test harness exists.
- Expand the transport tests to exercise every documented HTTP status and authorizer failure.
- Complete `FeedbackUI` and the optional `FeedbackSFK` adapter in Phase 2.
