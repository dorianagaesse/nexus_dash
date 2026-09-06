# Current Task

## ND-376: Allow meeting todo assignees who are external participants

## Status

In progress on `feature/nd-376-meeting-todo-external-assignees` (worktree
`../nexus_dash_nd376_wt`, branched from `origin/main` at 633278e). The Nexus
Dash board card ND-376 (feature label) is the source of truth and moved to In
Progress on 2026-09-06. No GitHub issue exists for this task; the PR carries
the ND-376 reference. Design aligned with the user: an external assignee is a
new `participant` actor kind, assignable from the meeting-notes panel and the
project-wide todos page.

## Context

Meeting-note todos (`ProjectMeetingNoteAction`) carry an assignee that is
today restricted to Nexus Dash project members (`human`) or project API
credentials (`agent`); assignee resolution validates references against the
project member/credential registry. Meeting participants already support
external people (no Nexus Dash user, `userId: null` + `displayName`), but a
todo assignee cannot be one of them. Meeting participants are rewritten on
every note save (`deleteMany` + `create`), so participant rows have no stable
id to reference — an assignee representation must be name-based with the
existing accountability snapshot pattern.

## Product Decisions

- External assignees become a third `participant` value of the shared
  `MeetingTodoActorKind` enum (TS + DB), persisted through the existing
  `assigneeKind`/`assigneeDisplayNameSnapshot` columns with no user or
  credential FK and no new columns. The additive enum migration keeps the
  existing DB CHECK constraints valid (`participant` rows carry both FKs
  null).
- A participant assignee reference is name-keyed: its id is the trimmed
  participant display name, resolved case/whitespace-insensitively against
  the external participants of the *same* meeting note at write time
  (create/update drafts and the dedicated action-assignee endpoint). The
  persisted snapshot keeps the canonical spelling, so the assignee remains
  identifiable after later participant renames or removal.
- A participant assignee renders active/assignable while that name is still
  an external participant of the note; once removed from the note it renders
  inactive with the name preserved and the existing needs-reassignment
  affordance (same semantics as a member who left the project).
- The assignee picker gains a "Meeting participants" group listing only the
  note's external participants. Members and agents remain the canonical
  "Project members"/"Project agents" options even when a member also attends
  the meeting. The group is available in the meeting-notes panel and on the
  project-wide todos page (options derived per meeting note).
- Assignee presentation (chips, identity rows, quick dialog) shows the name
  with a muted `external` hint for participants, mirroring the existing
  `agent` hint, so same-name humans and externals stay distinguishable in
  todo views and outputs.
- The `participant` kind is valid only in the assignee position; creators,
  completers, and stewards remain human/agent.

## Scope

- Additive `MeetingTodoActorKind` migration (`participant` value) plus TS
  domain types, reference guards, mapping, and avatar/summary handling.
- Service-layer resolution for participant references against note-scoped
  external participants in `createProjectMeetingNote` /
  `updateProjectMeetingNote` draft assignment and
  `setProjectMeetingNoteActionAssignee`.
- Mapping of stored participant assignees to active/inactive summaries in
  the meeting-note panel reads and the project-wide todo list.
- Assignee chip group, external hints, and per-note option sets in the
  meeting-notes panel and project-wide todos page; read-only surfaces
  unchanged in layout.
- Focused service, component, and Playwright coverage, including member
  parity and rejection of unknown/non-participant names.

## Out Of Scope

- Converting existing assignee rows or adding participant ids/columns.
- External stewards, creators, or completers; the participant kind stays
  assignee-only.
- Changing participant authoring UX, reminder email recipients (external
  participants have no account), or notification behavior.
- Task (kanban) assignees: this touches meeting-note todos only.

## Acceptance Criteria

1. External meeting participants can be selected as todo assignees: the
   assignee picker on a meeting-note todo offers the note's external
   participants (a "Meeting participants" group), and picking one persists
   the assignment with the participant's display name.
2. Existing Nexus Dash user/member assignment continues to work: member and
   agent options, resolution, display, and `mine`/responsibility filters
   behave exactly as before; member participants are not duplicated in the
   picker.
3. The assignee remains identifiable in meeting-note todo views and outputs:
   the stored name renders in the note panel, the project-wide todos page,
   the todo quick dialog, and assignee identity rows, with an `external`
   hint; unknown or non-participant names are rejected with
   `meeting-note-action-assignee-invalid`.

## Definition Of Done

- The `participant` actor kind is implemented end to end with an additive
  migration, service validation scoped to the note's external participants,
  name-keyed summaries, and picker/read-only presentation on the meeting
  panel and todos page.
- Focused service tests cover participant assignment through drafts and the
  dedicated endpoint (valid external participant, member as participant,
  renamed/removed participant, unknown name rejection); component tests
  cover the chip group, external hint, and selection for panel and todos
  rows; the relevant Playwright spec covers a real-browser external
  assignee flow.
- `git diff --check`, `npm run lint`, `npm run rls:check`, `npm run
  release:check`, `npm test`, `npm run test:coverage`, `npm run build`, and
  the focused Playwright run are green; the meeting-notes/todos e2e specs
  stay green.
- `package.json`/`package-lock.json` advance minor to v0.55.0 and the
  CHANGELOG release entry documents the feature under a dated v0.55.0
  section.
- The Nexus Dash board card ND-376 is updated (In Progress, then Done on
  delivery) and `tasks/current.md` + `journal.md` reflect the execution.
- Branch is pushed with an open ready-for-review PR referencing ND-376.

## Runtime Assumptions

- Existing PostgreSQL, authentication, and `.env` contracts remain unchanged;
  the schema change is an additive enum value with no table/column changes.
- Local validation uses the dockerized PostgreSQL setup from
  `docs/runbooks/local-validation.md`; preview deployment is not an
  acceptance requirement for this task.

## Previous Task Snapshot

The previous `tasks/current.md` brief (ND-408, released in v0.54.0) is
preserved verbatim below for history.

---

# Current Task

## TASK-342: Context Knowledge Stewardship and Attachment Provenance

## Status

In review via PR #459 on `feature/task-381-bounded-kanban-lanes`. On
2026-09-02 the branch was reconciled twice with current `origin/main`: first
against the agent API program, calendar, meeting-stewardship, and dependabot
changes (release advanced from the stale `v0.38.0` to `v0.51.0`), then again
after TASK-342 (PR #451) merged and advanced main itself to `v0.51.0`. Both
rounds resolved PR #459 conflicts without product-code changes; the release
now sits at `v0.52.0` (merge 7293cd6) and revalidation on the final merged
tree was green: lint, rls:check, release:check, 1,216 tests passed / 2
skipped, coverage 91.52/81.57/92.3/92.01, and a production build. Copilot
then completed a review on the reconciled head (2026-09-02/03) and its three
threads were triaged on 2026-09-03: the archived Done scroller received the
same visible focus-visible ring as the lane scrollers, read-only (viewer)
task cards became keyboard-operable with a button role, tab stop, and
Enter/Space activation, and the stale version-description thread was closed
against the reconciled v0.52.0 release notes with rationale (no code change
needed). Regression coverage was added in the component and Playwright
suites; revalidation is green.

## Objective

Keep dense Kanban boards usable by bounding each visible lane to a responsive
viewport-aware height and scrolling each lane's task region independently.
Lane metadata and board actions must remain visible while long task lists are
reviewed or reordered.

## Product Decisions

- Each lane uses `clamp(20rem, 64dvh, 42rem)` so it remains useful on small
  screens without growing indefinitely on large displays.
- The lane header and count stay outside the scroll region. The existing board
  header, create action, archive control, and mobile status dock retain their
  established placement.
- The task region is an explicitly named, keyboard-focusable scroll region
  with contained overscroll and a stable scrollbar gutter.
- All lane components remain mounted while the mobile status dock changes the
  visible lane, preserving their native scroll positions.

## Scope

- Bound active Kanban lane height on mobile and desktop.
- Make every lane's task area vertically scrollable without coupling lane
  scroll positions.
- Preserve pointer and keyboard drag-and-drop, including long-lane auto-scroll
  and movement within or between lanes.
- Preserve archive access, task selection/editing, viewer behavior, live
  refresh, and mobile status navigation.
- Add focused component and Playwright coverage for layout, accessibility,
  scrolling, responsive containment, and drag behavior.

## Out Of Scope

- Task search, label filters, or Epic filters.
- Task virtualization, pagination, persistence changes, or API changes.
- Redesigning task cards, the task detail dialog, the project shell, or other
  dashboard sections.
- URL-backed or persisted lane scroll positions across full navigation.

## Runtime Assumptions

- Existing PostgreSQL, authentication, and `.env` contracts remain unchanged.
- `@hello-pangea/dnd` continues to provide pointer and keyboard sensors and
  recognizes the focusable lane task area as its scroll container.
- The user has explicitly reprioritized TASK-381 ahead of the still-pending
  broad TASK-100 and TASK-133 UX passes.
- Preview validation uses `feature/task-381-bounded-kanban-lanes` as the
  explicit workflow `git_ref`.

## Acceptance Criteria

1. Every visible lane is `clamp(20rem, 64dvh, 42rem)` high and cannot grow with
   its task count.
2. Lane title and visible task count remain fixed while only that lane's task
   region scrolls; scrolling one lane does not move another lane.
3. Each task region has an accessible lane-specific name, keyboard focus, a
   visible focus indicator, contained overscroll, and stable scrollbar space.
4. Pointer and keyboard drag-and-drop continue to work within and across long
   lanes, with destination auto-scroll and no unrelated scroll reset.
5. The Done archive remains reachable outside the Done task-list overflow and
   the global create action remains outside all lane scroll regions.
6. Switching lanes through the mobile status dock preserves each mounted
   lane's scroll position and produces no horizontal viewport overflow at
   375 px or in mobile landscape.
7. Owner/editor and viewer behavior, task modal actions, live refresh, light
   and dark themes, and reduced-motion behavior remain unchanged.

## Definition Of Done

- The bounded independent lane layout and accessibility semantics are
  implemented with focused automated coverage.
- UI/UX Pro Max guidance is applied for `dvh` sizing, keyboard access, visible
  focus, responsive containment, theme parity, and non-jacking scroll behavior.
- `git diff --check`, release validation, `npm run lint`, `npm run rls:check`,
  `npm test`, `npm run test:coverage`, `npm run build`, and `npm run test:e2e`
  pass.
- The explicit-branch Preview workflow succeeds and focused Preview browser
  checks pass at mobile and desktop widths.
- The branch is committed and pushed, a ready-for-review PR is open, required
  checks pass, and review state is recorded. The Copilot review threads on PR
  #459 are addressed and resolved on the updated head.
- `tasks/current.md`, `tasks/backlog.md`, `CHANGELOG.md`, and `journal.md` are
  consistent, and the final handoff records PR, commit, Preview, validation,
  and review evidence without merging the PR.
