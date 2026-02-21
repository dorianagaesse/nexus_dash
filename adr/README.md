# ADR Folder

This folder stores architecture decision records and related decision notes.

## Files

- `adr/decisions.md`: chronological ADR log used by day-to-day development workflow.
- `adr/task-020-modern-auth-authorization-adr.md`: detailed auth/authz architecture decision for user sessions, project authorization, and agent access.
- `adr/task-076-supabase-r2-google-calendar-boundaries.md`: dedicated boundary contract for multi-user Supabase, Cloudflare R2, and Google Calendar integration isolation.
- `adr/task-056-data-platform-adr.md`: detailed analysis for TASK-056 (PostgreSQL baseline + Supabase fit).
- `adr/task-057-supabase-environment-strategy.md`: interim environment strategy while Supabase branching is unavailable on current plan.

## Update Rule

When a task introduces a major architectural choice, add or update an entry in `adr/decisions.md` and link any detailed companion document in this folder.
