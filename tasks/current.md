# Current Task: Direct-to-R2 Upload Pipeline + Modal Overlay Fix

## Task ID
TASK-070

## Status
In Review (2026-02-19, PR #29)

## Summary
Implement serverless-safe direct upload for file attachments (task/context-card edit flows) so large files no longer go through Next.js API request bodies, and fix modal overlay rendering so the top white-bar artifact does not appear when opening existing tasks.

## Acceptance Criteria
- Add direct upload API flow for task/context-card file attachments:
  - generate signed upload target
  - upload file directly to R2 from browser
  - finalize attachment metadata in DB
- Preserve existing link attachment behavior and download/delete behavior.
- Keep local storage provider compatibility (fallback to existing multipart upload where direct upload is unsupported).
- Enforce attachment validation (size/type) for direct-upload flow with explicit API error mapping.
- Fix modal overlay styling/scroll behavior so opening an existing task no longer shows the top white-bar artifact.
- Add/adjust tests for new direct-upload endpoints/service behavior and keep existing contracts stable.

## Definition of Done
- `npm run lint` passes.
- `npm test` passes.
- `npm run test:coverage` passes.
- `npm run build` passes.
- Branch pushed and PR opened.
- PR checks pass on GitHub.
- Copilot review triaged/resolved (apply valid findings, challenge non-actionable findings).
- Deployment validation monitored after merge trigger (staged/prod workflow status checked).
- `tasks/backlog.md` and `tasks/current.md` remain aligned with TASK-070 progress.

## Required Input
No blocking input expected for implementation; if Cloudflare R2 CORS policy blocks browser PUT, user action may be required to update bucket CORS rules.

## Next Step
Merge PR #29, run a production smoke validation on Vercel (`task` + `context-card` direct uploads including >4MB file), then close TASK-070 in backlog if validation passes.

---

Last Updated: 2026-02-19  
Assigned To: User + Agent
