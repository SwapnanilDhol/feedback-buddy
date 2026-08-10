# Feedback Loop

A self-hosted feedback SDK and backend foundation for native apps. Feedback Loop is designed to give an app a structured feedback form, a versioned HTTP contract, durable storage, and asynchronous delivery to developer-owned destinations.

## What's here

- `FeedbackCore`: a Swift 6 package with platform-neutral models, validation, injected authorization/context/installation seams, and an HTTP transport.
- `contracts/`: versioned JSON schemas and golden fixtures for client and server compatibility.
- `docs/`: public architecture and engineering decision records.
- `.github/workflows/ci.yml`: package and contract validation in CI.

The current release is an early foundation containing the SDK core and contracts. The reusable SwiftUI form, reference Worker, installer, and deployment template are planned next.

## Design principles

- The SDK speaks a documented HTTP contract and does not depend on a particular hosting provider.
- Feedback is validated before submission and the transport supports stable idempotency keys.
- Installation identity and request authorization are injected so host apps control persistence and optional hardening.
- The package does not import analytics, logging, or third-party destination SDKs.

## Validation

```sh
swift test
node contracts/validate-fixtures.mjs
```

The public HTTP contract is the source of truth. The transport works with any compatible backend; a Cloudflare reference backend is planned but is not required by the Swift package.
