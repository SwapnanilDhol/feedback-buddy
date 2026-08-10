# Feedback Loop

Self-hosted feedback SDK and Cloudflare reference backend, extracted as a new product from the METARBuddy feedback loop.

This workspace currently contains the Phase 1 foundation:

- `FeedbackCore`, a Swift 6 package with platform-neutral models, validation, injected authorization/context/installation seams, and an HTTP transport.
- Versioned JSON contract schemas and golden fixtures under `contracts/`.
- Provisional implementation decisions under `docs/adr/`.

The product is not published, deployed, or connected to any production feedback pipeline. The Cloudflare Worker, reusable UI, installer, and deployment template are planned follow-on phases.

## Validation

```sh
swift test
node contracts/validate-fixtures.mjs
```

The package follows Plan 0004. Its public HTTP contract is the source of truth; the transport does not require Cloudflare.
