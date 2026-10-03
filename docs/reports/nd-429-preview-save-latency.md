# ND-429 branch-preview save latency

Date: 2026-10-03  
PR: [#550](https://github.com/dorianagaesse/nexus_dash/pull/550)

## Cause and change

The first preview ran database-backed Vercel Functions in `iad1` while the
Preview Supabase transaction pooler was in AWS `eu-west-1`. The pooler hostname
and the Preview project ref matched the configured Preview database. Vercel's
`x-vercel-id` confirmed the function location: `fra1::iad1` before the change.
The browser used the Frankfurt edge in both measurements.

One authenticated diagnostic save on the prior deployment separated the time
using the existing route `Server-Timing` header. A roadmap event edit took
1,094 ms from click to dialog close: 805 ms in the route, 268 ms in the
remaining fetch path, and 22 ms of browser work. A meeting output edit with ten
existing todos took 2,555 ms: 2,143 ms in the route, 388 ms in the remaining
fetch path, and 24 ms of browser work. The cross-Atlantic database round trips
dominated both operations; client rendering did not.

The deploy workflow now derives the Vercel Function region from each
environment's runtime Supabase pooler hostname and passes it to `vercel deploy`.
An unmapped region stops deployment. This applies to branch previews and staged
production deployments without assuming that both databases share a region.
The preview selected `dub1` for `eu-west-1`. The resulting response reported
`fra1::dub1` and database readiness `ok`. The task service also omits unused
relation, epic, and actor-registry reads on the common unassigned/no-epic path.
A live RLS-enabled SQL count measured 20 statements for task create and 20 for
task edit, meeting the audit's budget of 20 (earlier PR counts: 22 and 23).

## Measurement method

The temporary, gitignored Playwright harness used an isolated project and
verified browser session on the immutable branch preview. It discarded three
warmups, then performed 20 sequential saves per surface. It measured button
click to dialog close for roadmap event edit and meeting output edit. Other
surfaces were measured with same-origin browser fetches, so their wall times
exclude dialog work. `Server-Timing` supplied route duration; the rest of fetch
duration includes edge and network transport, function invocation outside the
handler, and connection overhead. For the two UI surfaces, the remaining
click-to-close duration is browser work. The harness used nearest-rank p95.
Each of the 160 measured saves returned success; it removed the probe data.

| Surface | Samples | Preview wall p50 / p95 | Server p50 / p95 | Fetch remainder p50 / p95 | Browser p50 / p95 | Target p95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Roadmap event edit, UI | 20 | 200 / 285 ms | 37 / 39 ms | 136 / 229 ms | 20 / 37 ms | 750 ms |
| Meeting output edit, ten existing todos, UI | 20 | 245 / 358 ms | 96 / 107 ms | 129 / 238 ms | 17 / 33 ms | 1,000 ms |
| Task create, browser API | 20 | 210 / 289 ms | 89 / 158 ms | 123 / 140 ms | — | 1,000 ms |
| Task edit, browser API | 20 | 210 / 334 ms | 87 / 98 ms | 118 / 248 ms | — | 1,000 ms |
| Meeting create, browser API | 20 | 220 / 250 ms | 99 / 109 ms | 120 / 131 ms | — | 1,000 ms |
| Meeting preparation edit, browser API | 20 | 219 / 235 ms | 94 / 109 ms | 124 / 139 ms | — | 1,000 ms |
| Roadmap phase edit, browser API | 20 | 157 / 252 ms | 36 / 44 ms | 119 / 134 ms | — | 750 ms |
| New milestone plus event, two browser API requests | 20 | 329 / 608 ms | 78 / 94 ms | 249 / 445 ms | — | 1,000 ms |

The table is from the first `dub1` deployment at commit `5eabb12`, workflow
[37151643429](https://github.com/dorianagaesse/nexus_dash/actions/runs/37151643429),
immutable URL
`https://nexus-dash-go0r2m6g2-dorian-agaesses-projects.vercel.app`.
The subsequent task-query change does not alter roadmap or meeting paths; its
final-head preview samples are recorded below.

No meeting save stalled in the 20 measured output edits. Task create had one
1,913 ms outlier and the two-request roadmap create had one 1,519 ms outlier;
both p95 values remained below their targets. These samples establish the
specified p95 gate, not a guarantee against rare long-tail delays.

## Final-head verification

Workflow [37152881897](https://github.com/dorianagaesse/nexus_dash/actions/runs/37152881897)
successfully checked out and deployed commit `1f6a78fd0be12c7ca50ba32e171791afadb61ab2`.
Its immutable URL was
`https://nexus-dash-2c23ucjvf-dorian-agaesses-projects.vercel.app`.
The workflow checked revision and Preview database readiness. Every timed
response reported `fra1::dub1`; the runtime database pooler hostname identified
AWS `eu-west-1` (Vercel `dub1`). The final-head run again discarded three
warmups per surface and recorded 20 sequential saves per surface. All 200
post-warmup saves succeeded.

| Surface | Samples | Preview wall p50 / p95 | Server p50 / p95 | Fetch remainder p50 / p95 | Browser p50 / p95 | Target p95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Roadmap event edit, UI | 20 | 197 / 224 ms | 42 / 45 ms | 129 / 157 ms | 23 / 40 ms | 750 ms |
| Meeting output edit, ten existing todos, UI | 20 | 262 / 288 ms | 112 / 123 ms | 129 / 159 ms | 17 / 35 ms | 1,000 ms |
| Task create, browser API | 20 | 211 / 238 ms | 91 / 97 ms | 121 / 141 ms | — | 1,000 ms |
| Task edit, browser API | 20 | 188 / 206 ms | 66 / 71 ms | 122 / 137 ms | — | 1,000 ms |
| Meeting create, browser API | 20 | 205 / 312 ms | 85 / 158 ms | 115 / 227 ms | — | 1,000 ms |
| Meeting preparation edit, browser API | 20 | 236 / 289 ms | 116 / 130 ms | 118 / 172 ms | — | 1,000 ms |
| Roadmap phase create, browser API | 20 | 164 / 185 ms | 44 / 56 ms | 120 / 147 ms | — | 750 ms |
| Roadmap phase edit, browser API | 20 | 160 / 184 ms | 41 / 44 ms | 119 / 142 ms | — | 750 ms |
| Roadmap event create, browser API | 20 | 162 / 175 ms | 44 / 48 ms | 117 / 131 ms | — | 750 ms |
| New milestone plus event, two browser API requests | 20 | 332 / 371 ms | 79 / 89 ms | 251 / 295 ms | — | 1,000 ms |

The two UI p95 values are click-to-dialog-close measurements. API rows measure
the complete fetch from the same browser origin. All p95 values meet the
ND-429 targets. The largest final-head UI save was 300 ms for meeting output
and 260 ms for event edit; the largest two-request milestone-plus-event save
was 394 ms. The earlier >15-second retry was not reproduced in these samples.

Final-head local validation: `npm run lint`, `npm run rls:check`, `npm test`
(217 files passed, two skipped; 1,791 tests passed, two skipped),
`npm run test:coverage` (93.77% statements, 84.46% branches, 95.42% functions,
94.07% lines), and `npm run build` passed. The temporary live RLS-enabled SQL
count measured 20 statements for each task mutation. The browser E2E result is
recorded in the journal and PR handoff.
