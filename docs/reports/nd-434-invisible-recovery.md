# ND-434 invisible recovery (2026-10-30)

The product requirement supersedes the recovery-review UI in the earlier
[review validation](./nd-434-review-validation.md). Autosave is an invisible
safety feature, with no restored/storage notices, status strips, announcements,
technical copy-out panels, or recovery/conflict-choice buttons.

The shared renderers remain silent for all authoring surfaces. Context and
Calendar forms use ordinary Save and Cancel actions. Outside click, Escape,
the close icon, navigation, and reload retain the input without explanation.
Explicit Cancel deliberately abandons an edit. Successful saves clear only
acknowledged values, preserving edits typed during a request.

Safety remains conditional: Calendar edits retain their original provider ETag;
unknown legacy ETags cannot become unconditional writes. Restored context-card
edits retain the original base and content revision, rather than inheriting the
latest revision as permission to overwrite. Disjoint content changes may rebase
internally; overlapping or unknown revisions produce the form's normal failed
Save message and keep the input. There are no comparison or keep/use choices.

The live epic and ND-432, ND-433, ND-434, ND-565, ND-577, and ND-180 task
descriptions now contain the invisible-recovery requirement, including its
supersession of earlier actionable-notice exceptions. The repository-wide rule
is also recorded in [AGENTS.md](../../AGENTS.md) and the
[ND-432 contract](../../adr/task-432-autosave-contract.md).
