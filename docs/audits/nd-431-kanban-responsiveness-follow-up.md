# ND-431 Kanban responsiveness follow-up

Date: 2026-10-08 (first pass), 2026-10-11 (second pass), 2026-10-12,
2026-10-14, 2026-10-16, 2026-10-20, and 2026-10-22 (review fixes),
2026-10-26 (third performance pass)

The ND-430 fixture was run against the merged audit baseline and this branch
using the same production build, local PostgreSQL 16, Chromium, and Windows
i7-7700K machine. Each large-board metric has 20 measured samples after two
warm-ups. The fixture has 240 active and 60 archived tasks; the 12-task control
is retained. The repeatable probe is
`tests/e2e/nd-430-kanban-audit.spec.ts`. Set `ND_KANBAN_AUDIT_OUTPUT` to keep
each run in a separate ignored `.tmp` JSON file.

## First pass (2026-10-08)

| Metric, p95 ms | Baseline | After change | ND-431 target |
| --- | ---: | ---: | ---: |
| Navigation to 240 cards | 482.8 | 346.6 | 350 |
| Task detail open | 289.6 | 133.2 | 130 |
| Keyboard drag lift | 124.1 | 75.8 | 70 |
| Drop key to settled card | 610.7 | 237.9 | 200 |
| Drop key to reorder request | 513.1 | 125.6 | 100 |
| Reorder HTTP duration | 93.7 | 76.6 | 100 |
| Typed remote comment event to painted card | 35.4 | 19.7 | 60 |

The archive stays mounted only while open. Hover highlighting now belongs to
the grid, and each draggable card skips renders when its task and highlight
state are unchanged. The grid skips modal state renders. A 10 ms transform
transition replaces the drag library's distance-based drop transition; it
still fires the transition event that completes a drop. Moving a task with no
relations no longer scans every task to update relation summaries.

Initial HTML fell from 1,021,013 to 954,553 bytes, and DOM elements fell from
5,404 to 4,861 in the closed-archive state. The reorder body stayed 6,866
bytes. Task details, filters, archive browsing, pointer and keyboard drag, and
mobile lane navigation are covered by the component and Playwright suites.

The four interaction targets that remain above threshold are near the limits
of this local run. A second after-change run yielded 347.9 ms navigation,
125.4 ms modal, 89.4 ms lift, 230.1 ms release, and 116.9 ms dispatch p95;
the variation is material. The release timer in this harness waits for the
successful HTTP response before checking that the card has settled, so it is
an end-to-end measure rather than paint-only latency. Playwright command
round trips are also included. The next performance step is to reduce the
number of mounted draggables and the board detail payload while preserving
cross-lane pointer and keyboard movement; ND-543 tracks the structural board
decomposition.

## Second pass (2026-10-11)

Changes on `fix/nd-431-kanban-p95-targets`:

- Keyboard (SNAP) drops persist on the confirming Space keypress. The grid
  reports the drop intent from its keydown handler, the board starts the
  reorder request inside that same keypress, and `onDragEnd` later reconciles
  instead of re-sending; when an early persist fails and rolls the board
  back, `onDragEnd` also skips the local re-apply so the stored order stays
  consistent. Pointer drags keep the existing `onDragEnd` path.
- Card bodies are referentially memoized (`MemoizedTaskCardContent`) so the
  drag library's render-prop re-renders and grid re-renders reuse each card
  subtree instead of rebuilding hundreds of card bodies per interaction.
- The grid's drag responders and the keydown listener use latest-ref
  indirection, so grid re-renders never invalidate them and cannot cascade
  through the mounted draggables.

Measurements use the same fixture and 20 post-warm-up samples per metric, with
the control board in every run. The measurement machine is shared with other
agent worktrees, and load is the dominant variance: contended runs took
101-118 s against 38-45 s clean, inflating every metric roughly 2-8x while the
control board stayed at baseline speed (a run's reorder HTTP p50 read 449.9 ms
under load versus 48-68 ms clean). Two clean runs, each accepted only at 75 s
or under, are reported; run durations double as the quiescence check.

| Metric, p95 ms | Baseline | After A (54 s) | After B (38 s) | ND-431 target |
| --- | ---: | ---: | ---: | ---: |
| Navigation to 240 cards | 544.3 | 1256.8 * | 475.9 | 350 |
| Task detail open | 249.7 | 205.2 | 148.2 | 130 |
| Keyboard drag lift | 131.3 | 117.7 | 99.0 | 70 |
| Drop key to settled card | 253.0 | 277.0 | 217.6 | 200 |
| Drop key to reorder request | 147.8 | 156.0 | 120.2 | 100 |
| Reorder HTTP duration | 100.3 | 168.5 | 93.7 | 100 |
| Remote comment event to painted card | 21.1 | 21.0 | 30.3 | 60 |

\* Navigation caught a load spike in run A while its control board nav read
357 ms p95; run B measured 475.9 against a 332.6 ms control.

Run B p50 pairs (baseline to after): navigation 382.8 to 323.3, modal 180.0 to
117.2, lift 82.4 to 60.5, release 191.4 to 191.4, dispatch 104.3 to 98.8,
reorder HTTP 54.0 to 48.3, remote 15.0 to 14.9. Control-board p50 pairs in the
same runs: navigation 289.7 to 208.6, modal 113.5 to 81.0, lift 35.4 to 32.4,
drop 43.7 to 54.5. Subtracting the control board isolates the board-size cost:

| Board-attributable (large minus control) | Baseline p50/p95 | Second pass p50/p95 |
| --- | ---: | ---: |
| Task detail open | 66.5 / 83.3 | 36.2 / 28.9 |
| Keyboard drag lift | 47.0 / 91.8 | 28.1 / 43.0 |
| Drop key to settled card | 147.7 / 187.5 | 136.9 / 78.2 |

The control drag rows have five samples, so their p95 is the noisiest number
here. On this machine the 12-task control board itself floors near the
targets (nav 332.6 versus 350; modal 119.3 versus 130), so absolute p95
sign-off should come from a quieter measurement environment. What the harness
does support: reorder HTTP (93.7) and the typed remote event (30.3) stay
inside target; dispatch is now synchronous with the keypress in-page (the
residual 98.8-120.2 ms is the Playwright round-trip floor plus the drop
re-render wave); and board-attributable p95 costs fell about 65% for modal
open, 53% for lift, and 58% for drop-to-settled.

The remaining board-size cost is the drag library's store-change re-render
wave across 240 mounted draggables (all cards re-render on lift and drop) and
the reorder HTTP leg that the release path overlaps. Cutting those needs
fewer mounted draggables and a leaner reorder route - the structural work
already tracked by ND-543.

### Review fix (2026-10-12): identity-based drop reconciliation

Review found that `onDragEnd` could apply a committed keyboard move twice: it
recomputed the move from the original source/destination indices against
whatever columns were current, so if a typed reorder event or a refetch
reconciled the columns between the early Space-keypress persist and the drop
settling, the recompute moved whichever card now held the source index and
displayed a different order than the database.

The reconciliation now retains the submitted task's identity
(`keyboardDropIntentRef` records `movedTaskId` at submit time) and is
idempotent against current columns:

- if the submitted task already occupies the destination slot, the move is
  acknowledged (error cleared, related-task summary synced) and nothing is
  re-applied or re-sent;
- otherwise the submitted task is located by id across visible lanes and the
  move is applied from where it actually sits, so intervening remote changes
  to every other card are preserved and the card at the original source index
  is never moved;
- an early failure still leaves the stored order in place, and a failure that
  lands after the drop settled still reverts the optimistic apply.

Regression coverage in `tests/components/kanban-board-keyboard-reconcile.test.tsx`:
typed reorder between early accept and settle (stays acknowledged order, one
request), remote reorder that shifts the submitted task (moves the submitted
task by identity), early failure (stored order kept), late failure (optimistic
apply reverted). The two race tests fail on the pre-fix revision.

### Review fix (2026-10-14): version-fenced settlement

Review found the identity reconcile from the previous round over-corrected: it
re-derived the intent over current columns even when those columns were a
newer authoritative order. Repro: A/B/C, the early save commits B/A/C, a
collaborator commits C/B/A, the typed reorder applies C/B/A, and the settle
then recomputed C/A/B from the stale destination index and returned without a
request - displaying an order the server never had. This also disproved the
round-1 note that fresh parent props never reach a mounted board: the board
does reset its columns from `initialTasks` in a prop-sync effect, so refetches
are a real second delivery path for authoritative columns.

Columns are now version-fenced against the project activity version:

- The early persist reads the reorder response's activity version into the
  intent (`writeVersion`); while the write is still in flight the newest
  version already applied at submit time (`intentStartVersion`) is the
  baseline.
- Typed reshape events (created/updated/deleted/reordered) and fresh
  server-rendered props record the newest applied version and increment an
  apply counter. Props carry their version through a new
  `initialActivityVersion` prop, plumbed from `project.updatedAt` (the same
  marker the reorder response reports) via the project page and board section.
- At settle, a layout whose version is newer than the baseline is kept
  verbatim - acknowledged, error cleared, no re-derivation, no extra request.
  Older or equal layouts settle by the round-1 identity reconcile, so a stale
  delivery still converges to the committed write.
- The late-failure revert is guarded by the apply counter: a failed write
  keeps a newer authoritative layout instead of reverting over it and only
  surfaces the error toast.

Regression coverage now spans nine cases including the reviewer's repro
(newer typed reorder kept verbatim after acceptance), the stale typed reorder
that settles by identity, a remote insertion that shifts the submitted card's
index, a newer parent-prop refetch respected at settle, and a stale
parent-prop refetch that settles by identity; the reviewer's
`kanban-newer-remote-review.test.tsx` repro passes against this revision.

### Review fix (2026-10-16): committed-order settlement

Review found two cases where the version fence still settled a keyboard drop
against the wrong order:

- A partial task event (created, updated, or deleted) carried a newer version
  than the acknowledged write but patched only one task. The fence treated it
  as a newer authoritative layout and skipped the outstanding move: after an
  accepted A-to-index-1 write at version 1, a collaborator renaming C at
  version 2 left the board at A/B/C although the server stored B/A/C.
- A successful acknowledgement that resolved after the drop settled was
  discarded because `onDragEnd` cleared the intent record: with the request
  held, a refetch applying C/B/A at version 2 settled the drop verbatim, and
  the write then committing B/A/C at version 3 never reached the board.

The settle now separates column mutations from full-order authority and
reconciles against the write's committed payload (the reorder route stores the
request's lane task ids verbatim):

- Partial deltas (task upserts, archive flags, deletions) increment the apply
  counter used by the failure-revert guard but no longer record an activity
  version; only typed reorder events and fresh server-rendered props do.
- Each keyboard intent captures the lane orders its payload persists
  (`committedOrders`). At settle, unless a full-order delivery newer than the
  write (or, while the write is in flight, newer than the intent-start
  baseline) has been applied, the columns are restored to the committed
  orders: the stored order of every lane wins while partial deltas keep their
  current positions, so the move is never re-derived by index.
- The intent is marked settled rather than discarded, and an acknowledgement
  that resolves after the settle restores the committed orders unless a newer
  full-order delivery landed in the meantime.

Regression coverage in `tests/components/kanban-board-keyboard-reconcile.test.tsx`
now spans eleven cases, including a partial task rename after acceptance (move
preserved, rename kept in place) and a held request acknowledged after the
settle (the board converges to the committed order with one request). The
reviewer's `kanban-pending-ack-review.test.tsx` repros pass against this
revision, as do the earlier `kanban-newer-remote-review.test.tsx` and
`kanban-review-regressions.test.tsx` files.

### Review fix (2026-10-20): cross-lane committed settlement

Review found that the committed-order settle from the previous round was
lane-local: it reconciled each lane in isolation against only the tasks that
lane currently held. A keyboard move between lanes never applied. Repro:
confirm A from Backlog 0 to In Progress 0; the request persists Backlog B/C
and In Progress A, but after the acknowledgement and settle the board still
shows Backlog A/B/C and an empty In Progress lane with one request, because
the source lane treated the moved task as an uncommitted extra and kept it
while the destination lane could not find it. The same happened for
acknowledgements that resolved before and after settlement.

The reconcile now runs over the complete board with the complete committed
payload:

- one task map is built across all lanes, and every task named in the payload
  is placed in its committed lane, with its status stamped when the committed
  lane differs from where it currently sits;
- tasks that are not named in any committed lane (partial creations) keep
  their current lane and index, and deleted task ids are skipped so they are
  never resurrected;
- a task already placed is never placed again, so payload and partial deltas
  cannot duplicate a card; lanes that are already correct keep their array
  identity.

Regression coverage in `tests/components/kanban-board-keyboard-reconcile.test.tsx`
adds a parameterized cross-lane case for both acknowledgement timings (before
and after settlement), asserting the moved task's lane, its status, the
source lane's remaining order, and a single request; the eleven earlier cases
pass unchanged. The reviewer's `kanban-lane-order-review.test.tsx` repro
passes 2/2, and the earlier `kanban-pending-ack-review.test.tsx` (2/2),
`kanban-newer-remote-review.test.tsx` (4/4), and
`kanban-review-regressions.test.tsx` (1/1) still pass on this revision.

### Review fix (2026-10-22): newer per-task lane authority

Review found that the complete-board restore from the previous round
overwrote a newer task representation's lane. Repro: start Backlog A/B/C; the
early keyboard reorder accepts B/A/C at version 1; a collaborator moves B to
Blocked and edits it, and the version-2 `task/updated` representation (which
carries B's current Blocked status) is applied; when `onDragEnd` settles, the
committed restore puts B back in Backlog and empties Blocked with no second
mutation. Partial events do not advance the full-order fence, so neither the
settlement nor a late acknowledgement protected them.

The settle now weighs per-task authority against the write version:

- every applied remote task representation (created or updated) records its
  status, activity version, and arrival sequence;
- at settlement or late acknowledgement, a representation applied after the
  intent was submitted and newer than the version whose layout is being
  restored (the write's version, or the intent-start baseline while the write
  is in flight) keeps its lane; the committed order still applies to every
  other task, and the newer representation's lane order places it at its
  current slot;
- representations older than the write lose even when they arrive later, and
  full-order deliveries (typed reorder events, fresh props) keep their
  existing authority; a full-order delivery also prunes the representations
  it supersedes.

Regression coverage in `tests/components/kanban-board-keyboard-reconcile.test.tsx`
grows to seventeen cases: the reviewer's newer-status sequence, the same
sequence with the status change on the locally moved card, a late
acknowledgement variant, and an older-version representation that must lose to
the acknowledgement. The three newer-status cases fail on the previous head;
the older-version case guards against over-preservation. The reviewer's
`kanban-newer-status-review.test.tsx` repro passes, and the earlier cross-lane,
partial-rename, insertion/deletion, full-order-version, and
late-acknowledgement cases pass unchanged.

## Third performance pass (2026-10-26): per-card DOM reduction

The remaining gap after the merge-forward round was concentrated in costs that
scale with the mounted card count. CDP profiles of the fixture showed two
per-card costs: the grip rendered a lucide `GripVertical` SVG with six
`<circle>` nodes per editable card, and the card header added two nested
wrapper elements per card. The 240-card fixture mounted 5,248 DOM elements.

Changes on `nd431-p95-followup` (stacked on the ND-431 branch):

- The drag grip is now a single span painted from a CSS mask
  (`.task-card-grip` in `app/globals.css`), keeping the six-dot shape and the
  span's `aria-label`/`title` without the SVG. This removes 1,680 elements
  from the fixture board.
- The card header stacks the reference and title directly and positions the
  grip and Blocked badge absolutely against the header; the title and icon
  wrapper divs are gone. This removes two more elements per card.

Closed-archive fixture DOM fell from 5,248 to 3,128 elements (-40%), and the
server-rendered project HTML fell from 988,598 to 858,116 bytes because the
mask replaces per-card SVG markup. Card reference/title spacing, title
clamping, the Blocked badge, and drag-label semantics are unchanged; the
component and keyboard-reconcile suites pass unmodified.

Four runs on the usual machine (240 active + 60 archived tasks, two warm-ups
plus 20 measured samples, 12-task control) measured p95. All four finished in
31-34 s, inside the established 75 s quiescence gate; control-board navigation
p95 brackets them at 256.3-288.0 ms.

| Metric, p95 ms | Pre-change clean run | Post-change range (4 runs) | ND-431 target |
| --- | ---: | ---: | ---: |
| Navigation to 240 cards | 426.7 | 285.9 - 393.4 | 350 |
| Task detail open | 147.6 | 121.1 - 167.6 | 130 |
| Keyboard drag lift | 94.2 | 61.5 - 85.0 | 70 |
| Drop key to settled card | 233.6 | 181.2 - 203.9 | 200 |
| Drop key to reorder request | 140.3 | 96.7 - 106.1 | 100 |
| Reorder HTTP duration | 54.2 | 47.8 - 69.7 | 100 |
| Typed remote comment event to painted card | 16.8 | 15.5 - 18.6 | 60 |

The pre-change column is the `a045626` merge-forward run, whose control-board
navigation p95 was 273.7 ms. The primary run (control nav 256.3, 32 s) reads navigation
305.6, modal 121.1, lift 73.2, release 187.6, dispatch 96.7, HTTP 62.5, and
remote 18.6. Against the pre-change run that is -28% navigation, -18% modal,
-22% lift, -20% release, and -31% dispatch. Reorder HTTP and the typed remote
metric stay inside target with margin in every run.

Reorder dispatch moved from 140.3 to 96.7 - 106.1 p95, with p50 at 75 - 84 ms
in every run, so the in-page keypress-to-request leg is now at the harness's
Playwright round-trip floor; its remaining board-size share is the drag
library's store-change re-render wave across all mounted draggables, the same
cost visible in lift. In the primary run navigation has 44 ms of headroom,
release 12 ms, and modal 9 ms; lift (73.2) and dispatch (96.7) are at the
target boundary and cross it on the noisiest runs. The structural remainder
stays with ND-543 (fewer mounted draggables and a leaner reorder route);
ND-431 remains In Progress.
