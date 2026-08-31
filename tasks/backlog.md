# Backlog

**This file is no longer the source of truth for task management.**

On 2026-08-31 the full backlog was migrated to the Nexus Dash project
**"Nexus Dash"** at <https://nexus-dash.app>. Credentials for agent access live
in `.config/.nd-nexus-dash.env` (gitignored). All backlog planning, sequencing,
status tracking, and task relationships now happen in the Nexus Dash kanban.

## What was migrated

- **5 epics**: TASK-385 (ChatGPT/Codex connector), TASK-110 (dashboard
  personalization), TASK-114 (task/context authoring), TASK-022 (production
  deployment baseline), TASK-021 (production-grade auth).
- **246 tasks**: every `TASK-XXX` entry from the previous backlog, including
  the Completed section.
- **Dependencies**: each entry's `Dependencies:` list became task relations.
  Nexus Dash relations are bilateral, so each dependency edge is visible from
  both tasks.
- **Sections**: the old backlog section groupings became task labels
  (`Active Runtime Remediation`, `Execution Queue`, `External UX Feedback`,
  `Codex Session Feedback`, `Collaboration Refinement` with `P0/P1/P2`
  priority labels, `Deferred`).
- **Briefs/reports**: every `Brief:` / `Report:` file referenced in the
  backlog was attached to its task as a GitHub raw link.
- **Full entry text**: each task description carries the original backlog
  entry (ID, title, status string, rationale, dependencies) so nothing was
  lost in translation.

## Mapping conventions

- Kanban columns: `Backlog` (Pending / Next / P0-P2 / Deferred),
  `In Progress` (TASK-100 "Now 1", TASK-406 "In review"),
  `Done` (Completed section plus TASK-407/TASK-370/TASK-325/TASK-330).
- Task titles are prefixed with the task ID (`TASK-407: ...`) so PR and
  workflow references stay searchable.
- Backlog column order mirrors the old Execution Queue sequencing
  (Next 2 → Next 10) followed by the remaining sections in file order.

## Known notes

- TASK-372 is preserved exactly as submitted (title "dd") pending scope
  clarification.
- Some `Dependencies:` entries reference task IDs that have no entry in the
  old backlog (TASK-002, TASK-003, TASK-008, TASK-009) or an epic
  (TASK-258 → TASK-022); those references remain in the task description
  text but have no relation row.
- Epic names are truncated to the Nexus Dash 80-character limit; the full
  epic title remains in the epic description.

## Historical reference

The pre-migration backlog content is preserved in git history (see commits
before 2026-08-31).
