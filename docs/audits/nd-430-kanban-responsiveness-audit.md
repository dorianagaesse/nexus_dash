# ND-430 Kanban Responsiveness Audit

Date: 2026-10-06

Status: Complete

Follow-up: ND-431

## Conclusion

The large board's main measured cost is client work that grows with the number
of mounted cards. Opening a task detail takes 267 ms p95 with 240 active and 60
archived tasks, versus 91 ms p95 on a 12-task control. Drag lift likewise grows
from 43 to 111 ms p95. The large response is 1.02 MB of HTML and produces about
5,400 DOM elements. A remote comment update still paints within 59 ms p95.

Drag release has a second, variable client-side delay. Across three runs, its
p95 ranged from 566 to 945 ms. In the instrumented run, the reorder request
was dispatched 497 ms p95 after the drop key, while the HTTP request itself
took only 61 ms p95. The 12-task control also had an 858 ms drop outlier. This
rules out the reorder endpoint as the dominant cause of those slow releases in
this local fixture; the drag library's release path or browser rendering needs
closer inspection before changing the endpoint.

## Fixture and method

`tests/e2e/nd-430-kanban-audit.spec.ts` creates an isolated project with 60
tasks in each active lane and 60 archived Done tasks, then deletes the project.
A second project with three tasks per lane is the size control. Titles,
descriptions, labels, authors, and completed timestamps are present. No task
has attachments, comments, or relation edges. Both projects use the same
authenticated browser session.

Measurements used a production Next.js build, Playwright Chromium, local
PostgreSQL 16, Windows, Node 24.15.0, and an Intel i7-7700K. The app ran with
its normal RLS test context. Two warm-ups were discarded from each series.
The harness records browser elapsed time to visible cards, modal opening,
keyboard drag lift and release, reorder request dispatch/response, and a
synthetic typed remote comment event through the board's actual event handler.
The remote measure ends after the next animation frame following a card DOM
update. The synthetic event measures application, not transport delivery.

Run the audit against a **disposable local database** after installing packages,
generating Prisma, applying migrations, and building:

```pwsh
$env:DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:5432/nexusdash_nd430?schema=public"
$env:DIRECT_URL = $env:DATABASE_URL
$env:AGENT_TOKEN_SIGNING_SECRET = "local-placeholder-agent-token-signing-secret-0123456789"
$env:RESEND_API_KEY = "local-placeholder-resend-key"
$env:STORAGE_PROVIDER = "local"
$env:NODE_ENV = "test"
$env:ND_KANBAN_AUDIT = "1"
npx playwright test tests/e2e/nd-430-kanban-audit.spec.ts --reporter=list
```

The exact sample is written to ignored `.tmp/nd-430-kanban-baseline.json`.
Without `ND_KANBAN_AUDIT`, the spec skips during normal E2E runs. Its timing
figures include Playwright command overhead and are intended for before/after
comparison with this same harness, browser, and machine. They are not hosted
user percentiles. Pointer dragging, mobile layouts, Supabase Broadcast
transport delay, and a heavily related or attached board still need behavioral
validation during ND-431.

## Baseline

These figures are from the final instrumented run on 2026-10-06. Durations are
milliseconds, rounded to one decimal. Each large-board navigation has ten
samples; modal and remote event have twenty; drag has eight. The 12-task
control has five navigation, ten modal, and five drag samples.

| Interaction | 240 active + 60 archived p50 | p95 | 12-task control p50 | p95 |
| --- | ---: | ---: | ---: | ---: |
| Navigation to all board cards in DOM | 349.8 | 506.1 | 265.2 | 297.0 |
| Task-detail modal open | 229.3 | 267.0 | 87.8 | 91.4 |
| Keyboard drag lift | 94.3 | 111.1 | 31.9 | 43.3 |
| Keyboard drag release | 192.9 | 565.9 | 66.3 | 858.3 |
| Drop key to reorder request dispatch | 125.5 | 496.9 | — | — |
| Drop key to successful reorder response | 181.0 | 556.7 | — | — |
| Reorder HTTP request duration | 48.8 | 60.7 | — | — |
| Remote comment event to painted card | 32.2 | 59.1 | — | — |

The large-board HTML response was 1,021,408 bytes; the reorder POST body was
6,866 bytes. The DOM held about 5,400 elements on the large board versus 925
on the control. The initial board load combines server rendering, transfer,
parsing, and client work, so the above comparison alone cannot assign its
entire difference to one layer. The modal and drag comparisons more directly
show that local interactions scale with board size.

## Code-path evidence

- `KanbanBoardSection` fetches and serializes board-ready detail for every
  active and archived task before rendering the section. The initial payload
  includes descriptions, relations, attachment metadata, actor data, and other
  detail fields even though a compact card uses only some of them.
- `KanbanColumnsGrid` mounts one `Draggable` per active card. Archived cards are
  also rendered inside the archive disclosure. The measured DOM growth is
  consistent with this all-cards-at-once structure.
- The selected task, hovered task, modal draft, and columns live in
  `KanbanBoard`. Opening a modal updates that parent, which also renders the
  columns grid. The small/large modal gap is consistent with broad render
  work; a React profile should confirm the exact component cost in ND-431.
- A typed task-comment event patches board state directly. Its 59 ms p95
  application cost is below the other interaction costs, so the recent
  broadcast transport does not invalidate the audit. Actual delivery time is
  outside this measurement.
- The drag handler sends all 240 active task IDs to `/tasks/reorder`, but the
  local HTTP duration stayed below 61 ms p95. Slow drop samples arose before
  dispatch or during UI release, including on the small control.

## ND-431 fix order and targets

Use the same fixture and twenty post-warm-up samples for final comparison;
retain the small-board control and report desktop pointer, keyboard, and mobile
correctness separately. Proposed local p95 targets on the 240 + 60 fixture:

| Interaction | Target |
| --- | ---: |
| Navigation to board cards | <= 350 ms |
| Task-detail modal open | <= 130 ms |
| Drag lift | <= 70 ms |
| Drag release to settled UI | <= 200 ms |
| Drop to reorder request dispatch | <= 100 ms |
| Reorder HTTP request | <= 100 ms |
| Remote event application | <= 60 ms, no regression |

1. **Reduce interaction rerenders.** Isolate modal, hover, and draft state from
   the card grid; stabilize card props/callbacks and measure React commits.
   Coordinate with ND-543's planned Kanban decomposition so the performance
   work does not create a competing component split.
2. **Bound mounted board work.** Keep the archive disclosure's task subtree
   unmounted while closed. Then assess lane windowing or another drag-compatible
   strategy that preserves keyboard access, cross-lane drops, search results,
   and mobile navigation.
3. **Profile drag release before changing persistence.** Timestamp the drag
   library's release, `onDragEnd`, local state commit, request dispatch, and
   animation completion for keyboard and pointer input. Remove avoidable
   pre-dispatch delay while keeping immediate visual movement and rollback.
4. **Trim the initial board payload.** Return card-sized data for list rendering
   and fetch detail-only fields when the modal opens, provided modal latency
   still meets target and deep links work. Keep typed remote reconciliation.

The targets are local comparison gates. ND-431 should also verify that task
movement, modal state, filters, archive browsing, and remote freshness remain
correct on desktop and mobile, then report preview timings separately if a
branch preview is used.
