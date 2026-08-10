# ADR 0001 — Initial product foundation decisions

Date: 2026-08-10

Status: Provisional, pending product-owner approval

## Context

The implementation workspace was created empty from Plan 0004. The plan requires a separate repository/workspace and identifies several product decisions that must not be silently finalized during extraction.

## Decisions for this implementation slice

- Use `FeedbackLoop` as an internal Swift package/repository working name only. No package or npm artifact is published under this name.
- Start with `FeedbackCore` only. `FeedbackUI`, `FeedbackSFK`, the Worker, and the installer remain separate phase deliverables.
- Target Swift 6, iOS 17, and macOS 14 for package validation, matching the plan's recommended defaults.
- Keep the protocol fixtures platform-neutral JSON. The eventual Worker and installer will consume the same files.

## Not decided

Product ownership, public naming/domains, organization and npm scope, licenses, public/private repository status, reply-email default, retention policy, admin surface, multi-project installer UX, Deploy Button launch status, and commercial follow-up remain open as listed in Plan 0004 §23.

## Consequences

The current package is intentionally safe to rename before publication. Later phases must add an amendment or ADR before making any of the open decisions part of a generated project, public docs, or release artifact.
