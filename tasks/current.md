# Current Task: TASK-050 Security Baseline Phase 2 - High-Priority Remediation Sprint

## Task ID
TASK-050

## Status
In progress

## Objective
Implement the highest-priority security fixes identified by the completed
`TASK-049` assessment so the project closes its most material exposure gaps
before moving further into feature delivery.

## Why This Task Matters
- `TASK-049` produced a ranked remediation list instead of a vague audit.
- The next security value is now in code changes, not more assessment.
- This task is the bridge between the validated hardening baseline from
  `TASK-048` / `TASK-116` and a stronger production-ready security posture.

## Initial Focus
- implement abuse-control baseline on the public auth and token-exchange paths
- harden session-token storage semantics
- reduce revocation lag on agent bearer-token usage where feasible
- preserve existing CI and preview validation standards while making these
  changes

## Expected Output
- repo code changes that close the top three ranked findings from
  `TASK-049`
- any required Prisma migration(s) and compatibility handling for session-token
  storage changes
- regression coverage for the new abuse controls, session-token behavior, and
  agent revocation semantics
- documentation updates that capture any new runtime assumptions, follow-up
  constraints, or verification notes needed for `TASK-051`

## Acceptance Criteria
- Public auth and token-entry surfaces have a real abuse-control baseline for
  the implemented perimeter:
  - sign-in
  - sign-up
  - forgot-password request
  - verification-email resend
  - `POST /api/auth/agent/token`
- Abuse-control behavior is fail-closed on clear overuse while preserving
  stable, non-leaky user-facing responses and bounded logging metadata.
- Failed sign-in and failed agent token-exchange attempts become observable
  through structured telemetry and/or audit records with request correlation,
  without storing raw secrets.
- Human session tokens are no longer stored in plaintext at rest.
- Session lookup, sign-out, and session revocation flows continue to work
  correctly after the session-token storage change.
- Legacy plaintext-backed sessions are handled explicitly by the implementation:
  either migrated safely or invalidated/rotated with the chosen behavior
  documented in this task and the journal.
- Already-issued agent bearer tokens no longer remain valid solely because
  their signature and expiry are still valid; bearer-token use must also honor
  current credential liveness/revocation state.
- Existing valid human auth flows and valid agent flows continue to work after
  the remediation pass.
- The task remains code-first and does not expand into a new broad security
  assessment or unrelated hardening scope.

## Definition Of Done
1. The ranked remediation scope from `tasks/task-049-security-assessment-and-threat-model.md`
   findings 1-3 is implemented in code.
2. Automated coverage is added or updated for the changed behavior, including
   denial-path assertions for abuse controls, session-token lookup/storage
   semantics, and revoked/rotated agent bearer-token use.
3. Required tracking docs are updated and consistent:
   - `tasks/current.md`
   - `journal.md`
   - `README.md` and/or runbooks when runtime behavior or operator expectations
     change
4. Validation is completed with evidence captured:
   - `npm run lint`
   - `npm test`
   - `npm run test:coverage`
   - `npm run build`
   - `npm run test:e2e` when the local PostgreSQL-backed fixture path is
     available; if it is not available, the blocker and fallback validation
     path must be recorded explicitly
5. Residual risk and any verification-only follow-up work are left clearly
   bounded for `TASK-051` rather than staying implicit.

## Dependencies
- `TASK-048`
- `TASK-049`
- `TASK-043`

## Notes
- Treat this as a code-first remediation task, not another assessment pass.
- Use the findings and prioritization from
  `tasks/task-049-security-assessment-and-threat-model.md`.
- Follow-up verification and closure reporting remain in `TASK-051`.
- Implementation decision record:
  - `adr/task-050-security-remediation-adr.md`
- Chosen migration behavior for plaintext legacy sessions:
  - invalidate existing human sessions during rollout rather than preserve
    dual-format session lookup compatibility indefinitely
- Abuse-control baseline storage:
  - PostgreSQL-backed fixed-window buckets keyed by hashed identifiers so the
    controls remain authoritative across stateless app instances

---

Last Updated: 2026-04-10
Assigned To: User + Agent
