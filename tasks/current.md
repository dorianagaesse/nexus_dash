# TASK-325: Google Calendar Integration Audit

## Status

Complete on `docs/task-325-google-calendar-audit`; ready for review.

## Objective

Audit the implemented Google Calendar integration from OAuth initiation through
event operations and deployment, establish the effective user/project ownership
model, and turn every material gap into decision-complete follow-up work.

## Scope

- OAuth initiation, callback state and actor binding, scopes, and redirect
  configuration.
- Credential schema, RLS, encryption, refresh, revocation, and recovery.
- Account settings and project dashboard Calendar behavior.
- Event list/create/update/delete contracts and upstream failure handling.
- Unit, API, RLS, E2E, deployment, and live-provider validation coverage.

## Acceptance Criteria

1. A dated, commit-pinned audit documents current architecture and behavior.
2. Security and product strengths are distinguished from verified gaps and
   residual risks.
3. Findings cover ownership, token lifecycle, UI semantics, event operations,
   tests, environment configuration, and operational recovery.
4. Each material remediation is assigned to TASK-326, TASK-327, TASK-348, or a
   clearly identified future concern without duplicating existing work.
5. TASK-326 and TASK-327 have decision-complete briefs derived from the audit.

## Definition Of Done

- The audit is committed under `docs/audits/`.
- TASK-326 and TASK-327 briefs are committed under `tasks/`.
- Backlog status, `tasks/current.md`, and `journal.md` are consistent.
- Documentation checks, focused calendar tests, and the RLS inventory check
  pass.
- The branch is pushed, a ready-for-review PR is open, and initial automated
  review/check feedback is handled.

## Outcome

- Audit: `docs/audits/task-325-google-calendar-integration-audit.md`
- Ownership hardening brief:
  `tasks/task-326-google-calendar-connection-ownership.md`
- Connection expansion brief:
  `tasks/task-327-additional-calendar-connections.md`
