# TASK-329: Meeting Participant Identities

## Status

Complete on `feature/task-329-meeting-participant-identities` in ready-for-review
PR [#391](https://github.com/dorianagaesse/nexus_dash/pull/391). Initial
automated review feedback is resolved and all required checks pass.

## Context

Meeting notes currently store participants as free-form strings. The prepare
dialog renders those values as plain token chips, treats input blur as an add
action, and offers no participant discovery. That makes project collaborators
visually indistinguishable from guests, requires names to be retyped, and can
commit a partially entered multi-word name.

NexusDash already has a stable generated-avatar identity for registered users.
Meeting participants need to reuse that identity while still supporting people
who do not have NexusDash accounts.

## User Experience

- Opening the participant field shows useful project-scoped suggestions.
- Typing filters current collaborators and external names from prior meetings.
- Collaborator results show their NexusDash avatar and identifying account
  metadata; prior guests show a circular initials avatar.
- Activating a suggestion adds it immediately.
- A new external name is added only with Tab, Enter, or the visible plus
  control. Space and comma continue the name, and blur does not commit it.
- Selected identities retain an avatar, readable name, and accessible remove
  action in both the editor and meeting detail.

## Data and Service Intent

- Persist enough structured identity to distinguish a linked NexusDash user
  from an external display name.
- Resolve linked-user presentation from current account data so renamed users
  and regenerated avatars remain current.
- Derive prior external suggestions from project-scoped meeting participant
  history; do not create a global people directory.
- Backfill every existing participant string as an external identity without
  losing order or display text.
- Keep all persistence access in `lib/services/**` and enforce existing
  project viewer/editor authorization.

## Acceptance Criteria

See [`current.md`](./current.md#acceptance-criteria).

## Definition Of Done

See [`current.md`](./current.md#definition-of-done).
