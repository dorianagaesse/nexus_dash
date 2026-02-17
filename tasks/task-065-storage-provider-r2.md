# TASK-065 Attachment Storage Migration

## Goal
Migrate attachment file persistence from local filesystem-only storage to a provider-based architecture with Cloudflare R2 as the default production backend.

## Scope
- Introduce `StorageProvider` abstraction for save/read/delete/download-url operations.
- Keep a local filesystem provider for development compatibility.
- Add Cloudflare R2 provider (S3-compatible) with signed URL support.
- Wire attachment service download flow to support:
  - proxy mode (local)
  - redirect mode (signed URL when provider supports it)
- Update documentation and env examples for storage provider configuration.

## Acceptance
- Existing task/context attachment CRUD and download flows remain functional.
- Download endpoints support redirect mode when provider returns signed URL.
- No direct provider coupling leaks into API route handlers.
- CI and local validation pass.

## Definition of Done
- `npm run lint`
- `npm test`
- `npm run test:coverage`
- `npm run build`
- PR opened with green checks and Copilot feedback resolved.

