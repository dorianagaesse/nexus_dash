# Current Task: Cloudflare R2 Validation Gate

## Task ID
TASK-069

## Status
Ready (2026-02-18)

## Summary
Validate Cloudflare R2 storage end to end before starting the next code-heavy delivery phase.

## Acceptance Criteria
- With `STORAGE_PROVIDER=r2`, file attachment upload succeeds for task and context-card flows.
- Download flow returns valid signed redirect behavior for stored files.
- Delete flow removes DB attachment entry and underlying R2 object.
- Failure behavior is explicit (misconfigured R2 env fails fast at startup with actionable error).
- Validation steps and outcomes are captured in docs/journal for reproducibility.

## Definition of Done
- Manual R2 smoke path (upload/download/delete) executed and logged.
- Targeted automated tests pass (`npm test -- lib/storage/r2-storage-provider.test.ts` or equivalent suite).
- `npm run lint` passes for touched files.
- `npm run build` passes.
- Branch pushed and PR opened.
- Copilot review triaged/resolved (apply valid findings, challenge non-actionable findings).
- `tasks/backlog.md`, `tasks/current.md`, `journal.md`, and `adr/decisions.md` updated to reflect outcomes.

## Required Input
User provides Cloudflare account + bucket + R2 credentials in local/CI env (or confirms existing values are valid) for real smoke validation.

## Next Step
Run R2 smoke validation and close TASK-069; then move back to TASK-062 decomposition work.

---

Last Updated: 2026-02-18  
Assigned To: User + Agent
