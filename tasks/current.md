# Current Task: TASK-050 Security Baseline Phase 2 - High-Priority Remediation Sprint

## Task ID
TASK-050

## Status
Ready to start

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

## Dependencies
- `TASK-048`
- `TASK-049`
- `TASK-043`

## Notes
- Treat this as a code-first remediation task, not another assessment pass.
- Use the findings and prioritization from
  `tasks/task-049-security-assessment-and-threat-model.md`.
- Follow-up verification and closure reporting remain in `TASK-051`.

---

Last Updated: 2026-04-09
Assigned To: User + Agent
