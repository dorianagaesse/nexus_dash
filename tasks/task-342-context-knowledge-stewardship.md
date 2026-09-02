# TASK-342: Context Knowledge Stewardship and Attachment Provenance

## Status

Implementation in progress on
`feature/task-342-context-knowledge-stewardship`.

## Product Outcome

Context cards become accountable knowledge artifacts: collaborators can see who
created, last edited, and stewards each card; understand which attachments each
collaborator uploaded; reassign stewardship without losing identity history; and
recognize cards that need a fresh review because they have not been touched in
a long time.

## Design Notes

- Stewardship is a separate concept from edit capability. Editors and owners can
  still edit any card, but stewards are the visible accountable human or active
  project agent credential that owns the knowledge the card captures.
- The actor contract reuses the narrow human/agent pattern shipped by TASK-330,
  so this task delivers knowledge accountability without waiting on the broader
  TASK-337 universal project actor foundation.
- Creator, last editor, and steward identity are durable display snapshots so
  removed human members or revoked agents still appear with their original
  label, plus an explicit `Needs reassignment` flag, instead of silently
  converting to an unassigned state.
- Attachment uploader identity is recorded at create time using the same
  display snapshot strategy, so historical context-card attachment provenance
  survives user removal and credential revocation.
- Review / staleness state is derived, not editable: a card is "needs review"
  when it has not been edited for a configurable number of days. The signal is
  visible everywhere the card is shown without forcing editors to maintain it
  by hand.
- Stewardship and review signals are visible to every project member; only
  editors and owners can change the steward. Viewers see the same identity
  information without mutation affordances.

## Acceptance Criteria

See [`current.md`](./current.md#acceptance-criteria).

## Definition Of Done

See [`current.md`](./current.md#definition-of-done).
