# Current Task

## Task

- ID: TASK-334
- Title: Alpha product-state indicator - subtle branding-level disclosure
- Status: In review
- Branch: `feature/task-334-alpha-product-state-indicator`
- Pull request: [#388](https://github.com/dorianagaesse/nexus_dash/pull/388)
- Brief:
  [`task-334-alpha-product-state-indicator.md`](./task-334-alpha-product-state-indicator.md)

## Objective

Make NexusDash's alpha maturity visible at the brand level without competing
with navigation or primary work, using a small accessible label attached to the
authenticated shell wordmark.

## Scope

- Add a reusable, non-interactive `Alpha` product-state label that uses the
  existing semantic design tokens.
- Attach the label to the desktop and compact-mobile NexusDash wordmarks in the
  authenticated app shell.
- Include the alpha state in the accessible name of each brand link.
- Preserve the existing brand link destination, focus treatment, sidebar
  dimensions, header actions, and navigation hierarchy.
- Verify light/dark readability and containment at 375, 768, 1024, and 1440 px.
- Add focused component and browser coverage for the disclosure.

## Runtime Assumptions

- Dependencies and Playwright Chromium are installed locally.
- Docker Engine and the repository database configuration are available if
  authenticated browser validation requires them.
- Preview validation will use
  `feature/task-334-alpha-product-state-indicator` as the explicit `git_ref`.

## Acceptance Criteria

1. Authenticated desktop and mobile shells show a small `Alpha` label attached
   to the NexusDash wordmark near the top left.
2. The label is visually subordinate to the wordmark and primary navigation,
   uses established semantic tokens, and remains readable in light and dark
   themes.
3. Screen readers encounter the product state as part of the brand link's
   accessible name; the disclosure does not rely on color alone.
4. The label does not alter navigation behavior or collide with the wordmark,
   theme control, account menu, or viewport edges at 375, 768, 1024, and
   1440 px.
5. Focused component and Playwright coverage protect desktop/mobile presence,
   accessible naming, and compact-shell containment.

## Definition Of Done

- A reusable product-state badge is implemented and used by both authenticated
  shell brand treatments.
- Focused component tests and the relevant authenticated-shell Playwright flow
  pass.
- Light/dark screenshots at the standard responsive widths are captured and
  visually reviewed.
- `npm run lint`, `npm run rls:check`, `npm test`, `npm run test:coverage`,
  `npm run build`, and relevant Playwright checks pass.
- Tracking documentation and release metadata are updated as required, the
  branch is committed and pushed, and a ready-for-review PR is open with
  initial automated review/check feedback handled before handoff.

## Outcome

- Added a reusable, non-interactive `Alpha` badge using existing semantic
  foreground, background, and border tokens.
- Attached the badge to the top-right of the NexusDash wordmark in both the
  desktop sidebar and compact mobile header.
- Included the alpha state in both brand links' accessible names while
  preserving their destination, focus treatment, and navigation hierarchy.
- Added component coverage for both rendered disclosures and Playwright
  coverage across light/dark 375, 768, 1024, and 1440 px shells, including
  mobile action-collision and horizontal-overflow checks.
- Prepared product release `v0.28.0` with matching package and changelog data.

## Validation

- `npm run lint` passed.
- `npm run rls:check` passed.
- `npm test`: 948 passed, 2 skipped.
- `npm run test:coverage`: 91.37% statements, 81.33% branches, 92.2%
  functions, 91.88% lines.
- `npm run build` passed with the repository's local-safe production
  validation environment.
- `npm run release:check -- --base origin/main --branch
  feature/task-334-alpha-product-state-indicator` passed for `v0.28.0`.
- `npx playwright test`: all 24 scenarios passed.
- Light/dark screenshots at 375, 768, 1024, and 1440 px were captured and
  visually reviewed under `.tmp/task334-alpha-indicator/`.
