# Current Task: Git Governance Baseline

## Task ID
TASK-052

## Status
🟡 **In Progress**

## Priority
🔴 **High** - Required before broader collaboration and parallel agent work

## Description
Define and enforce repository governance with protected `main`, short-lived branch workflow, and pull-request quality gates.

## Acceptance Criteria / Definition of Done

### Policy Definition (Repo Rules)
- [ ] `main` branch is protected in GitHub
- [ ] Direct pushes to `main` are blocked
- [ ] Pull requests are mandatory for merges
- [ ] At least one approving review is required
- [ ] Dismiss stale approvals on new commits is enabled
- [ ] Required status checks are configured (at minimum lint/test/build once CI exists)
- [ ] Only squash merge is enabled (or merge policy explicitly documented)
- [ ] Auto-delete head branches after merge is enabled

### Branching Strategy
- [ ] Trunk-style cadence documented (short-lived branches, fast merge)
- [ ] Branch naming conventions documented: `feature/*`, `fix/*`, `refactor/*`, `docs/*`, `chore/*`, `test/*`
- [ ] Commit and PR hygiene expectations documented in `agent.md`

### Verification
- [ ] Governance settings validated on GitHub by repository owner
- [ ] Team execution guide shared (how to open PRs and merge safely)

## Implementation Notes
- Local update done in `agent.md` to formalize branching and PR governance expectations.
- GitHub settings must be applied by repository owner/maintainer in repository settings.

## Blockers / Dependencies

### Current Blockers
- GitHub repository admin actions required from user.

### Dependencies
- TASK-035

---

**Last Updated**: 2026-02-15
**Assigned To**: User + Agent
**Started At**: 2026-02-15
