# FeedbackBuddy server

One Cloudflare Worker that serves the ingest API, the admin JSON API and the
dashboard for every project. State lives in one D1 database and one R2 bucket.
Delivery to Slack / webhooks runs in `waitUntil` after ingest and a five-minute
request-driven maintenance retries failures and enforces attachment retention (the Free plan's cron slots were in use). No Queues, no service
bindings, so it runs on the free plan.

See [`../docs/contract-v1.md`](../docs/contract-v1.md) for the HTTP contract and
[`../docs/PLAN.md`](../docs/PLAN.md) for the architecture.

## Layout

| Path | Purpose |
|---|---|
| `src/index.ts` | Hono app, route mounting, error handler, request-driven maintenance (and a `scheduled` handler if a cron is added) |
| `src/ingest.ts` | `POST /v1/feedback` (JSON + multipart), rate limits, R2 upload |
| `src/admin.ts` | `/api/v1/*` admin API (bearer token or session) |
| `src/dashboard/` | server-rendered dashboard (`hono/jsx`, no build step) |
| `src/delivery.ts` | Slack Block Kit + signed webhook delivery, backoff |
| `src/attachments.ts` | magic-byte checks, capability URLs, retention |
| `src/repository.ts` | all D1 access and row → contract mapping |
| `src/schema.ts` | zod schemas mirroring `contracts/*.schema.json` |
| `migrations/` | D1 migrations |
| `test/` | vitest running inside workerd (`@cloudflare/vitest-plugin`) |

## Local development

```sh
npm install
cp .dev.vars.example .dev.vars          # edit the three secrets
npm run db:migrate:local
npm run dev                             # http://127.0.0.1:8787
```

Open `http://127.0.0.1:8787/`, sign in with `ADMIN_PASSWORD`, create a project
and copy its public key. Submit feedback with curl:

```sh
curl -X POST http://127.0.0.1:8787/v1/feedback \
  -H "Authorization: Bearer fb_pub_…" \
  -H "X-Feedback-Installation-ID: $(uuidgen | tr A-Z a-z)" \
  -H "Idempotency-Key: $(uuidgen | tr A-Z a-z)" \
  -H 'Content-Type: application/json' \
  --data @../contracts/fixtures/minimum-valid-submission.json
```

`npm run check` runs the type check and the 30 tests (they use a real
miniflare D1 + R2 with the migrations applied).

## Deploying

Run once from this directory:

```sh
npx wrangler d1 create feedback-buddy            # copy database_id into wrangler.jsonc
npx wrangler r2 bucket create feedback-buddy-attachments
npx wrangler secret put ADMIN_PASSWORD           # dashboard login
npx wrangler secret put SESSION_SECRET           # ≥ 32 random chars; also keys attachment capability URLs
npx wrangler secret put ADMIN_API_TOKEN          # bearer token for /api/v1
npm run db:migrate:remote
npm run deploy
```

Then set `PUBLIC_BASE_URL` in `wrangler.jsonc` to the Worker's public URL
(for example `https://feedback-buddy.<account>.workers.dev` or a custom
domain) and deploy again so capability URLs and the integration snippet use
it. Optionally pass the build version: `npx wrangler deploy --var VERSION:$(git rev-parse --short HEAD)`.

Subsequent schema changes: add `migrations/000N_*.sql`, run
`npm run db:migrate:remote`, then `npm run deploy`.

## Operations

- Rotate a project's key from the dashboard (Settings → Create new key, ship
  it, then revoke the old one). Rotate `ADMIN_API_TOKEN` / `ADMIN_PASSWORD` with
  `wrangler secret put`. Changing `SESSION_SECRET` signs everyone out and
  invalidates attachment capability URLs already shared.
- Failed deliveries are retried by maintenance, which runs after requests at most once a minute per isolate (1, 5, 15, 60, 240 minutes, then
  every 6 hours, 8 attempts). "Redeliver failed" on a feedback page requeues
  immediately.
- Attachments are deleted after `retention_days` per project (default 30).
- Pull new items for triage from a script or agent:

```sh
curl -H "Authorization: Bearer $ADMIN_API_TOKEN" \
  "https://<worker>/api/v1/projects/<project id>/feedback?status=new&category=bug"
```

> **Deploy note (2026-11-06):** wrangler 4.158 failed every deploy with a 503
> from the `workers/services/<name>` lookup while 4.120 deployed fine. If
> `npm run deploy` fails that way, use `npx wrangler@4.120.0 deploy`.

## App icons

When a project has a bundle identifier, the Worker looks up the App Store artwork through Apple's public iTunes Search API, caches the URL on the project and rechecks it weekly. No key is needed. Apps that are not on the App Store fall back to a coloured dot.

Apple throttles that API per client address and Workers share egress
addresses, so the Worker looks up at most three apps per maintenance pass and
backs off for hours on a 403. If icons are slow to appear, run the lookup from
your own machine once:

```bash
FEEDBACK_BASE_URL=https://<worker> FEEDBACK_ADMIN_TOKEN=... node scripts/sync-icons.mjs
```

The admin API also accepts `icon_url` (https) on `PATCH /api/v1/projects/:id`.

## Signing in

The dashboard has one operator. Two ways in:

- **Passkey** (recommended). After the first password sign-in, open **Security**
  and add a passkey. From then on `/login` offers Face ID / Touch ID; the
  password form sits behind "Use the password instead" as the recovery path.
  Passkeys are bound to the dashboard's host, so enrol again after moving to a
  custom domain. Credentials are verified with `@simplewebauthn/server`; only
  the public key, credential ID and signature counter are stored (`passkeys`
  table). Challenges travel in a 5-minute signed cookie, so no challenge table
  is needed.
- **Password**: the `ADMIN_PASSWORD` secret. Rotate with `npx wrangler secret put ADMIN_PASSWORD`.

Scripts and agents use `ADMIN_API_TOKEN` on `/api/v1` and are unaffected.

