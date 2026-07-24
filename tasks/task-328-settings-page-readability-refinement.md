# TASK-328 - Human-readable account Settings refinement

## Status

Pending - queue after TASK-108 and before the TASK-323 production UX verification.

## Objective

Make account Settings understandable to casual users by replacing the current
implementation-oriented hierarchy and copy with a clear, task-oriented
experience that explains what can be changed and what each choice affects.

## Rationale

The shared user hub and Settings route are structurally sound after TASK-324,
but the Settings content still exposes technical concepts such as calendar IDs,
connection prerequisites, and developer configuration without enough plain-
language context or progressive disclosure. Users should not need product or
implementation knowledge to understand the page.

## Scope

- Audit `/account/settings` and `/account/settings/developers` for terminology,
  reading order, information density, and unclear prerequisites.
- Reframe sections around user goals with plain-language titles, descriptions,
  helper text, and outcome-oriented actions.
- Improve grouping and progressive disclosure so advanced calendar and
  developer details do not compete with common settings.
- Clarify connected, disconnected, saved, default, unavailable, loading, and
  error states without changing their underlying behavior.
- Preserve the shared TASK-324 user hub, stable Settings URLs, safe `returnTo`
  context, and the About NexusDash metadata section.
- Verify keyboard navigation, focus visibility, semantic headings, 44 px
  targets, responsive containment, and light/dark readability.

## Out Of Scope

- Adding new calendar providers, accounts, or synchronization capabilities.
- Changing credential ownership, calendar persistence, or agent API behavior.
- Redesigning Account or Notifications content outside shared navigation.

## Dependencies

- TASK-270
- TASK-108
- TASK-324

## Acceptance Criteria

1. A casual user can identify the purpose of each Settings section and its
   primary action without understanding calendar IDs or developer terminology.
2. Common settings and advanced/developer settings have a clear visual and
   semantic hierarchy with progressive disclosure where appropriate.
3. Calendar connection prerequisites, current target, default behavior, and
   save/reset outcomes are explained in plain language next to the relevant
   control.
4. Developer settings explain who they are for and what opening the onboarding
   documentation will do before navigation occurs.
5. Loading, success, error, disabled, disconnected, and empty states provide a
   specific recovery path where action is possible.
6. Existing URLs, persistence behavior, authorization boundaries, safe return
   paths, and the About NexusDash metadata remain intact.
7. The page is keyboard-operable, screen-reader coherent, and readable without
   clipping or horizontal overflow at 375, 768, 1024, and 1440 px in light and
   dark themes.

## Definition Of Done

- Settings information architecture and copy are implemented with reusable,
  semantic components and established NexusDash tokens.
- Focused component/API tests protect preserved behavior and accessible state
  presentation.
- Playwright covers the primary calendar and developer-settings journeys,
  including disconnected and responsive states.
- Light/dark screenshots at the standard responsive widths are captured and
  visually reviewed.
- Required repository validation passes and task, backlog, changelog, and
  journal documentation are updated in the task's dedicated branch and PR.
