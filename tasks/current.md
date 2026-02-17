# Current Task: Attachment Storage Migration

## Task ID
TASK-065

## Status
In Progress (2026-02-17)

## Summary
Replace local filesystem attachment persistence with a provider-based storage boundary and Cloudflare R2 default backend while preserving download/preview behavior.

## Acceptance Criteria
- Introduce a `StorageProvider` abstraction used by attachment services.
- Implement Cloudflare R2 provider (S3-compatible) as default remote provider.
- Keep a local provider available for development fallback.
- Add signed URL support for file access and route behavior compatibility.
- Keep attachment create/delete/download flows working for both task and context-card attachments.
- Update docs/env examples for storage configuration.

## Definition of Done
- `npm run lint` passes.
- `npm test` passes.
- `npm run test:coverage` passes.
- `npm run build` passes.
- Branch pushed and PR opened.
- Copilot review triaged and resolved (apply valid findings, challenge non-actionable findings).

## Required Input
Cloudflare R2 credentials may be required for live integration validation; implement with safe fallbacks so CI/unit tests pass without live secrets.

## Next Step
Design provider interface + wire attachment service migration with regression-safe tests.

---

Last Updated: 2026-02-17  
Assigned To: User + Agent
