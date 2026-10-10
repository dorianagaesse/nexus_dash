# ND-431 Kanban responsiveness follow-up

Date: 2026-10-08

The ND-430 fixture was run against the merged audit baseline and this branch
using the same production build, local PostgreSQL 16, Chromium, and Windows
i7-7700K machine. Each large-board metric has 20 measured samples after two
warm-ups. The fixture has 240 active and 60 archived tasks; the 12-task control
is retained. The repeatable probe is
`tests/e2e/nd-430-kanban-audit.spec.ts`. Set `ND_KANBAN_AUDIT_OUTPUT` to keep
each run in a separate ignored `.tmp` JSON file.

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
