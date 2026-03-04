# Current Task: ISSUE-081 Username Discriminator Numeric-4 Contract

## Task ID
ISSUE-081

## Status
In Review (2026-03-04)

## Objective
Enforce username discriminator format as exactly 4 numeric digits across generation, storage, and account identity surfaces.

## Why Now
- Current discriminator behavior uses 6-character base36 values, which no longer matches the expected identity format.
- A strict 4-digit numeric contract keeps tags predictable and easier to communicate.

## Scope
- Update discriminator generation policy from 6-char base36 to 4-digit numeric.
- Sanitize legacy invalid discriminator values for account/profile display and username updates.
- Align Prisma schema/migration with the new discriminator format constraint.
- Update UI preview and regression tests (unit + e2e helpers) for the numeric-4 contract.

## Out of Scope
- Username syntax/length policy changes.
- Auth/session architecture changes.
- Broader profile UX redesign.

## Acceptance Criteria
- Newly generated discriminators are always 4 digits (`0000`-`9999`).
- Account profile and identity summary do not expose legacy invalid discriminator formats.
- Username update flow regenerates invalid/legacy discriminator values when needed.
- Prisma schema + migration enforce `usernameDiscriminator` as `VARCHAR(4)` with numeric-only check.
- Validation baseline is green for this branch.

## Definition of Done
- Branch + PR opened and linked to issue #81.
- CI checks green.
- Copilot review threads handled/resolved.
- Tracking files updated (`tasks/current.md`, `journal.md`, `adr/decisions.md`).

---

Last Updated: 2026-03-04
Assigned To: User + Agent
