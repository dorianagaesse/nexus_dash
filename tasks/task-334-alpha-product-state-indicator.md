# TASK-334 - Alpha product-state indicator

## Status

In review.

## Objective

Make NexusDash's alpha maturity visible at the brand level without competing
with navigation or primary work, using a small accessible label attached to the
authenticated shell wordmark.

## Rationale

Users should understand that the product is still evolving before they rely on
it as a finished service. The disclosure belongs with the persistent brand
rather than in a transient notice, and it must remain legible without making
the compact mobile header feel crowded.

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

## Out Of Scope

- Changing the release-version policy.
- Adding dismissible banners, onboarding copy, warnings, or feature-level
  instability notices.
- Redesigning the NexusDash logo, authenticated navigation, or account menu.

## Dependencies

- TASK-313
- TASK-322

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
