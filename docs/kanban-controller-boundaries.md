# Kanban controller responsibilities

`components/kanban-board.tsx` is the public client entry point. Its props and
rendered component tree stay stable while focused hooks own these lifecycles:

| Owner | Responsibility |
| --- | --- |
| `components/kanban/hooks/use-kanban-board-state.ts` | Active and archived tasks, epic options, incoming prop synchronization, and the authority bookkeeping shared by realtime reconciliation and keyboard settlement. |
| `components/kanban/hooks/use-kanban-drag-drop.ts` | Mapping filtered drag indices into complete lane orders, early keyboard persistence, pointer persistence, failure rollback, and settlement against acknowledged writes and remote authority. |
| `components/kanban/hooks/use-kanban-filters.ts` | Search revision and requests, label and epic selections, pruning removed epic selections, and active/archive visibility. |
| `components/kanban/hooks/use-kanban-task-navigation.ts` | Initial deep links, browser history, application task-open events, and fallback fetches guarded by the shared navigation request counter. |

The hooks are private to the Kanban UI. Routes and services continue to use
their existing entry points. They do not import these hooks. Shared pure
helpers stay in `kanban-board-utils.ts` and the existing domain helpers.

The board composes these owners with task editing, draft recovery, comments,
attachment handling, and task mutation orchestration. Those operations still
share the selected-task lifecycle in the board; this change does not introduce
a broad controller object for every modal field or a separate state store.

## Authority and interaction invariants

- Full-order deliveries (parent props and typed reorder events) carry board
  authority. Partial task events only supply authority for that task's lane.
- The board-state owner keeps both the version fence and the remote apply
  counter. The drag owner uses the same refs; it must not create a second
  authority history or use a stale snapshot of them.
- A confirmed keyboard drop starts one reorder request before animation
  settlement. A late acknowledgement restores its committed order only when
  a newer authoritative order has not already arrived.
- Filtered moves persist the complete board. Hidden tasks keep their relative
  order and appear in the stored order when filters are cleared.
- Navigation requests share one counter with modal selection and closing, so
  an earlier fallback response cannot reopen a task after another selection.
- Hook extraction adds no effect-triggered fetches or new subscriptions. The
  existing grid and memoized card tree retain their rendering boundaries.

## Validation seams

`tests/components/kanban-board-keyboard-reconcile.test.tsx` exercises the
composed hooks through the board's public grid integration, including
acknowledgement timing, newer and stale remote layouts, partial task changes,
cross-lane moves, failure rollback, and filtered moves with hidden cards.
The existing filter/search and task-detail component suites cover the other
public interactions. Browser coverage includes the Kanban search/filter,
drag rollback, task cancellation, shareable URLs, references, and smoke flows.

Each owner can be moved back into the board without changing public props,
API requests, database behavior, or task component contracts.
