# FeedbackBuddy HTTP contract v1

This document is normative. `contracts/*.schema.json` and the fixtures in
`contracts/fixtures/` are the machine-readable form and are validated in CI by
both the Swift package tests and the server tests.

All JSON uses `snake_case`. Timestamps are RFC 3339 UTC. IDs are lowercase
UUID v4 strings unless stated otherwise.

## Authentication

| Surface | Header | Value |
|---|---|---|
| Ingest (apps) | `Authorization` | `Bearer fb_pub_<22+ url-safe chars>` — a project **public key**. Safe to embed in an app binary; it can only create feedback for its project. |
| Admin API (scripts, agents, dashboard) | `Authorization` | `Bearer <ADMIN_API_TOKEN>` — operator secret. |
| Dashboard pages | Cookie `fb_session` | HMAC-signed session created by `POST /login`. |

Keys are stored as SHA-256 hashes. A revoked key returns `401 {"error":"invalid_api_key"}`.

## `POST /v1/feedback`

Required headers:

| Header | Format | Purpose |
|---|---|---|
| `Authorization` | `Bearer fb_pub_…` | project resolution |
| `X-Feedback-Installation-ID` | UUID | stable pseudonymous install identity; the server stores only `sha256("feedback-installation:" + lowercase uuid)` |
| `Idempotency-Key` | UUID | one per *attempt*; resubmitting the same key for the same project returns the original receipt with `duplicate: true` |
| `Content-Type` | `application/json` **or** `multipart/form-data; boundary=…` | |

Optional headers: `User-Agent` (recorded, ≤ 200 chars).

### JSON body (`application/json`, ≤ 16 KiB)

```json
{
  "schema_version": 1,
  "category": "bug",
  "message": "The wind card clips when gusts are shown.",
  "name": "Swapnanil",
  "reply_email": "user@example.com",
  "context": {
    "app_version": "5.0",
    "build_number": "400",
    "os_version": "26.0",
    "locale": "en-IN",
    "device_family": "iPhone",
    "device_model": "iPhone17,1"
  },
  "user": {
    "id": "$RCAnonymousID:abc",
    "account_status": "paid",
    "plan": "pro_annual",
    "entitlements": ["pro"],
    "attributes": { "theme": "dark" }
  }
}
```

| Field | Rules |
|---|---|
| `schema_version` | literal `1` |
| `category` | `feedback` \| `bug` \| `idea` |
| `message` | 4–2000 Unicode scalars after trimming |
| `name` | optional/null, 1–120 scalars after trimming |
| `reply_email` | optional/null, ≤ 254, must contain `@` and a `.` after it, no whitespace |
| `context.app_version`, `build_number` | 1–40 |
| `context.os_version`, `device_family` | 1–80 |
| `context.locale` | 2–80 |
| `context.device_model` | optional, 1–80 |
| `user` | optional; defaults to anonymous |
| `user.id` | optional/null, 1–200 |
| `user.account_status` | `unknown` \| `free` \| `paid`, default `unknown` |
| `user.plan` | optional/null, 1–200 |
| `user.entitlements` | ≤ 20 strings, each 1–200 |
| `user.attributes` | ≤ 20 keys, key 1–80, value ≤ 500, strings only |

Unknown top-level or nested keys are rejected (`422 invalid_feedback`).

### Multipart body (`multipart/form-data`)

Two parts, in any order:

- `payload` — the JSON document above as a string part.
- `attachment` — one image file. `image/jpeg` or `image/png`, 4 bytes – 1,500,000 bytes, magic bytes checked. Filename is ignored.

### Responses

`202 Accepted`

```json
{ "feedback_id": "33333333-3333-4333-8333-333333333333", "duplicate": false, "delivery_status": "accepted" }
```

`delivery_status` is `accepted` (stored, destinations pending or none),
`delivered` (all destinations succeeded synchronously) or `failed`
(stored, at least one destination failed; cron will retry). Clients must
treat unknown values as success — the feedback is stored either way.

Errors always have the shape `{"error": "<code>"}`:

| Status | `error` | When |
|---|---|---|
| 400 | `invalid_installation_id` | header missing / not a UUID |
| 400 | `invalid_idempotency_key` | header missing / not a UUID |
| 401 | `invalid_api_key` | missing, malformed, unknown or revoked key |
| 413 | `payload_too_large` / `attachment_too_large` | |
| 415 | `unsupported_media_type` / `invalid_attachment` | wrong content type or magic bytes |
| 422 | `invalid_json` / `invalid_multipart` / `invalid_feedback` | shape or limit violation |
| 429 | `rate_limited` | > 5 submissions per installation per 10 minutes, or > 60 per project per minute |
| 5xx | `internal_error` / `feedback_unavailable` | retry later |

Client status mapping used by the SDK: 429 → `.rateLimited`; 400/413/415/422 →
`.invalidSubmission`; 401 → `.projectRejected`; 404 → `.projectUnavailable`;
5xx and transport errors → `.temporarilyUnavailable`.

## `GET /health`

`200 {"ok": true, "service": "feedback-buddy", "version": "<git sha or dev>"}`.

## Admin API (`/api/v1`, Bearer `ADMIN_API_TOKEN` or session cookie)

| Method & path | Body / query | Returns |
|---|---|---|
| `GET /api/v1/projects` | | `{ "projects": [Project] }` with `counts: {new, triaged, closed}` |

`Project` carries `icon_url` (nullable): the App Store artwork looked up by bundle ID via the iTunes Search API, cached and rechecked weekly.
| `POST /api/v1/projects` | `{ "name", "slug"?, "bundle_id"?, "retention_days"? }` | `201 { "project": Project, "public_key": "fb_pub_…" }` — the plaintext key is returned **once** |
| `GET /api/v1/projects/:id` | | `{ "project": Project, "keys": [Key], "destinations": [Destination] }` |
| `PATCH /api/v1/projects/:id` | any of `name`, `bundle_id`, `retention_days`, `accent`, `icon_url` (https or null) | `{ "project" }` |
| `POST /api/v1/projects/:id/keys` | | `201 { "key": Key, "public_key": "fb_pub_…" }` |
| `DELETE /api/v1/projects/:id/keys/:keyId` | | `{ "ok": true }` (revokes) |
| `POST /api/v1/projects/:id/destinations` | `{ "kind": "slack_webhook"\|"webhook"\|"email", "url", "secret"?, "categories"?: ["bug"] }` — for `email`, `url` is the recipient address | `201 { "destination" }` |
| `PATCH /api/v1/projects/:id/destinations/:destId` | `enabled`, `url`, `categories` | `{ "destination" }` |
| `DELETE /api/v1/projects/:id/destinations/:destId` | | `{ "ok": true }` |
| `POST /api/v1/projects/:id/destinations/:destId/test` | | sends a sample event; `{ "ok", "error"? }` |
| `GET /api/v1/projects/:id/feedback` | `status`, `category`, `app_version`, `q`, `limit` (≤ 100, default 50), `cursor` | `{ "feedback": [Feedback], "next_cursor"? }` newest first |
| `GET /api/v1/feedback/:feedbackId` | | `{ "feedback": Feedback, "deliveries": [Delivery] }` |
| `PATCH /api/v1/feedback/:feedbackId` | `{ "status"?: "new"\|"triaged"\|"closed", "internal_note"?: string ≤ 4000 }` | `{ "feedback" }` |
| `GET /api/v1/feedback/:feedbackId/attachment` | | the image bytes, or 404 |
| `POST /api/v1/feedback/:feedbackId/redeliver` | | requeues failed deliveries; `202` |
| `DELETE /api/v1/feedback/:feedbackId` | | removes the record and its attachment; `{ "ok": true }` |

`Feedback` object:

```json
{
  "id": "…", "project_id": "…", "category": "bug", "status": "new",
  "message": "…", "name": null, "reply_email": null,
  "context": { "app_version": "5.0", "build_number": "400", "os_version": "26.0", "locale": "en-IN", "device_family": "iPhone", "device_model": null },
  "user": { "id": null, "account_status": "unknown", "plan": null, "entitlements": [], "attributes": {} },
  "attachment": { "content_type": "image/jpeg", "byte_count": 48213, "url": "/api/v1/feedback/<id>/attachment" } ,
  "internal_note": null,
  "created_at": "2026-11-06T10:00:00.000Z", "updated_at": "2026-11-06T10:00:00.000Z"
}
```

`attachment` is `null` when none was sent or after retention expiry.

## Webhook event `feedback.created`

Sent to every enabled `webhook` destination whose `categories` filter is
empty or contains the feedback's category. Body:

```json
{
  "schema_version": 1,
  "id": "44444444-4444-4444-8444-444444444444",
  "type": "feedback.created",
  "occurred_at": "2026-08-10T12:00:00.000Z",
  "project": { "id": "…", "slug": "my-app", "name": "My App" },
  "data": { …Feedback object…, "attachment": { "content_type", "byte_count", "url": "https://<worker>/v1/attachments/<capability-token>" } }
}
```

Headers: `Content-Type: application/json`, `X-Feedback-Event: feedback.created`,
`X-Feedback-Delivery: <delivery id>`, `X-Feedback-Signature: sha256=<hex HMAC-SHA256 of the raw body with the destination secret>`.
Receivers must treat the same `id` as idempotent. Timeout 5 s; non-2xx
responses are retried with backoff (1, 5, 15, 60, 240 minutes, then every 6 h
up to 8 attempts).

Attachment capability URLs (`/v1/attachments/<token>`) are unguessable
HMAC tokens bound to the feedback ID; they expire with retention.

## Email destination

`email` destinations send one message per feedback through Cloudflare Email
Sending: subject `[App] Category: first line`, the message, the attached image
inline when present, context facts, a link to the dashboard item, and
`Reply-To` set to the sender's email when they left one. Recipients must be
verified addresses on the Cloudflare account.

## Slack destination

`slack_webhook` destinations receive a Block Kit message: header with the
category emoji and project name, the message, a context line with app
version/build/OS/device/locale/plan, name and email when present, and the
attachment capability URL when present. No retries beyond the generic policy.

## Versioning

Additive changes (new optional fields, new `delivery_status` values, new event
types) do not bump `schema_version`. Removing or re-typing a field does.
