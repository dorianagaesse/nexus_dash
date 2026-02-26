# ADR Directory Guide

This folder contains architecture decision records.

## File Roles

- `adr/decisions.md`
  - Short operational log of architecture-impacting decisions.
  - Use for concise entries and links.

- `adr/task-*.md`
  - Detailed ADR documents for decisions that need deeper analysis, options, and implementation contract.

- `adr/TEMPLATE.md`
  - Copy this template when creating a new detailed ADR.

## Current Detailed ADRs

- `adr/task-020-modern-auth-authorization-adr.md`
- `adr/task-056-data-platform-adr.md`
- `adr/task-057-supabase-environment-strategy.md`
- `adr/task-076-supabase-r2-google-calendar-boundaries.md`

## Usage Rule

1. Add/update a short entry in `adr/decisions.md` for any architecture-impacting choice.
2. If the decision needs option analysis, migration plan, or cross-task contract, create/update a detailed `adr/task-*.md` file and link it from `adr/decisions.md`.
