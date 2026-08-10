# ADR 0001 — Package foundation decisions

Date: 2026-08-10

Status: Accepted for the current foundation

## Context

The project needs a small, independently usable client foundation before the reusable UI and backend are added. These decisions establish the compatibility boundary without coupling the SDK to a hosting provider or a host application's internal architecture.

## Decisions for this implementation slice

- Use `FeedbackCore` as the first public Swift module. UI, hosting, and installer concerns remain separate modules.
- Target Swift 6, iOS 17, and macOS 14 for package validation.
- Keep protocol fixtures as platform-neutral JSON shared by future client and server implementations.
- Keep the transport backend-independent. Cloudflare may provide a reference backend, but it is not a client dependency.

## Not decided

The next releases still need product decisions for the final name, licensing, supported destinations, retention defaults, administrative surface, and installer UX. Those choices should be documented before they become release or deployment behavior.

## Consequences

The current package keeps those concerns behind stable seams so later decisions do not require changing the core submission contract.
