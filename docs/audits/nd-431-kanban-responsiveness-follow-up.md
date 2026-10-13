# ND-431 Kanban responsiveness follow-up

Date: 2026-10-08 (first pass), 2026-10-11 (second pass)

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
