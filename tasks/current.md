# Current Task: ISSUE-079 Mobile Auth Toggle Scroll Reset

## Task ID
ISSUE-079

## Status
In Progress (2026-03-03)

## Objective
Prevent mobile auth form toggles from jumping the page back to the top.

## Why Now
- Issue #79 reports that tapping `Sign up` / `Sign in` on mobile resets scroll to top.
- This creates friction because users must repeatedly scroll back down to the auth card before continuing.

## Scope
- Keep auth-toggle navigation on the same visual section without resetting scroll.
- Preserve existing query-string behavior (`form`, optional normalized `email`) when toggling auth mode.
- Ensure both tab-style toggle buttons and inline mode-switch links use scroll-preserving navigation.
- Validate no regression in auth homepage rendering and toggle-link helper behavior.

## Out of Scope
- Authentication service contract changes.
- Form payload/schema updates for sign-in or sign-up.
- Broader homepage layout redesign.

## Acceptance Criteria
- Tapping `Sign up` / `Sign in` no longer forces viewport back to top on mobile.
- Form toggle navigation remains stateful and preserves existing query behavior.
- Validation baseline is green for this branch.

## Definition of Done
- Branch + PR opened and linked to issue #79.
- CI checks green.
- Copilot review threads handled/resolved.
- Tracking files updated (`tasks/current.md`, `journal.md`).

---

Last Updated: 2026-03-03
Assigned To: User + Agent
