# Current Task: Boundary Enforcement Pass

## Task ID
TASK-060

## Status
Done (2026-02-16)

## Summary
Boundary ownership is now explicit and enforced:
- Added `lib/services/project-service.ts` so project pages/actions no longer access Prisma directly.
- Added `lib/services/google-calendar-credential-service.ts` so Google OAuth callback route no longer owns credential persistence.
- Added lint guardrails in `.eslintrc.json` to block `@/lib/prisma` imports outside `lib/services/**`.
- Added TASK detail doc: `tasks/task-060-boundary-enforcement.md`.
- Recorded architecture decision in `adr/decisions.md`.

## Validation
- `npm run lint` -> passed.
- `npm test` -> 110 passed.
- `npm run test:e2e` -> 3 passed.
- `npm run build` -> passed.

## Notes
- Build output includes a non-blocking local webpack cache rename warning (`EPERM`) in `.next/cache`; build still succeeds.

## Next Recommended Task
TASK-039 (Deployment baseline phase 1 - runtime target and network allowlist)

---

Last Updated: 2026-02-16  
Assigned To: User + Agent
