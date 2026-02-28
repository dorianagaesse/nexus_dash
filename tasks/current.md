# Current Task: TASK-087 Product Metadata Surface - Repository Link and Running Version Visibility

## Task ID
TASK-087

## Status
In Progress (2026-02-28)

## Objective
Add a polished in-app metadata surface that links to the GitHub repository and displays the running app version.

## Why Now
- Deferred backlog item selected as a low-risk, high-signal upgrade.
- Improves release transparency and debugging clarity without touching core domain flows.

## Scope
- Add reusable app metadata resolver (repository URL + version label).
- Render a compact, modern metadata UI element aligned with existing design language.
- Support optional environment-based metadata overrides.
- Add unit coverage for metadata formatting behavior.

## Out of Scope
- Full release-management/versioning workflow design.
- Changelog generation and release-note automation.

## Acceptance Criteria
- Users can open the repository from the app UI.
- UI displays a version label (for example `v1.2.13` or `v1.2.13+abc1234`).
- Metadata display remains visually consistent across signed-in/signed-out states.
- Tests cover override/fallback formatting logic.

## Definition of Done
- Branch + PR opened.
- CI checks green.
- Copilot comments resolved.
- Preview deployment successful.
- Tracking files updated (`tasks/current.md`).

---

Last Updated: 2026-02-28
Assigned To: User + Agent
