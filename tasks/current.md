# Current Task: Attachment System (Architecture + MVP)

## Task ID
TASK-019 (with TASK-018 and TASK-007 delivered in the same iteration)

## Status
🟢 **Done (Implementation Complete, Awaiting Joint Validation)**

## Priority
🔴 **High** - Core execution context for tasks and project notes

## Description
Implement attachment support with a local server-side storage strategy and S3-ready abstraction, then expose link/file attachments in both task details and project context cards.

## Acceptance Criteria / Definition of Done

### ✅ Architecture (TASK-018)
- [x] Added explicit attachment storage strategy with local filesystem backend
- [x] Added reusable storage helper (`save/read/delete`) instead of in-route file handling
- [x] Added attachment validation constants (kind, MIME allowlist, size limit)
- [x] Documented architecture decision in `decisions.md`

### ✅ Task Attachments MVP (TASK-019)
- [x] Added Prisma `TaskAttachment` model with cascade cleanup
- [x] Added task attachment APIs (create link/file, delete, download file)
- [x] Added task detail modal UI to list/add/delete task attachments
- [x] Added file size metadata display + safe download links

### ✅ Context Card Attachments (TASK-007)
- [x] Added Prisma `ResourceAttachment` model with cascade cleanup
- [x] Added context card attachment APIs (create link/file, delete, download file)
- [x] Added context panel UI to preview attachments on cards
- [x] Added context edit modal UI to manage attachments

### ✅ Docker/Runtime
- [x] Added dedicated Docker volume for `/app/storage`
- [x] Added `.gitignore` entry for local uploaded files (`/storage/uploads`)

### ✅ Verification
- [x] `npm run lint` passes
- [x] `npm run build` passes
- [ ] Joint manual validation session with user

## Implementation Notes
- New upload/download APIs:
  - `app/api/projects/[projectId]/tasks/[taskId]/attachments/route.ts`
  - `app/api/projects/[projectId]/tasks/[taskId]/attachments/[attachmentId]/route.ts`
  - `app/api/projects/[projectId]/tasks/[taskId]/attachments/[attachmentId]/download/route.ts`
  - `app/api/projects/[projectId]/context-cards/[cardId]/attachments/route.ts`
  - `app/api/projects/[projectId]/context-cards/[cardId]/attachments/[attachmentId]/route.ts`
  - `app/api/projects/[projectId]/context-cards/[cardId]/attachments/[attachmentId]/download/route.ts`
- Attachment storage abstraction implemented in `lib/attachment-storage.ts`.
- Upload limits and allowlist implemented in `lib/task-attachment.ts`.
- Prisma migrations applied:
  - `prisma/migrations/20260212210530_add_attachments/migration.sql`
  - `prisma/migrations/20260212211407_add_attachment_indexes/migration.sql`

## Blockers / Dependencies

### Current Blockers
- None

### Dependencies
- TASK-018
- TASK-007

---

**Last Updated**: 2026-02-12
**Assigned To**: Agent
**Started At**: 2026-02-12
**Completed At**: 2026-02-12
