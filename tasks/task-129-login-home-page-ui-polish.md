# TASK-129 Login/Home Page UI Polish

## Status

Done (2026-07-16)

## Objective

Create a production-grade unauthenticated entry experience that helps returning
users sign in immediately and helps new users understand NexusDash through
clear product outcomes rather than authentication architecture.

## Design Brief

TASK-270 finding F5 identified two concrete problems: architecture-led copy and
a 2,000+ px mobile first-visit path. The pre-change Playwright baseline measured
the 390 px sign-up page at 1,993 px.

The chosen direction is a flat, typography-led productivity SaaS surface:

- desktop uses a balanced product/authentication split;
- mobile keeps authentication first and compresses product discovery into a
  short outcome summary;
- copy focuses on turning plans into progress, shared context, and coordinated
  execution;
- neutral surfaces use one restrained blue accent, clear borders, and minimal
  effects;
- interaction motion stays within 150-200 ms and is disabled for reduced-motion
  preferences.

## Acceptance Criteria

1. Sign-in is visible without scrolling on common mobile and desktop viewports.
2. Product copy contains no session-model, provider-configuration, or
   authorization-boundary explanations.
3. Mobile sign-up is materially shorter than the 1,993 px baseline and does not
   append a second marketing page.
4. Existing authentication behavior and safe navigation semantics are
   preserved.
5. Form labels, feedback, focus states, touch targets, contrast, dark mode, and
   responsive containment meet the repository's accessibility baseline.
6. Focused automated tests verify the revised hierarchy and copy.

## Definition Of Done

- Implementation and focused tests are complete.
- Required repository validation and relevant Playwright checks are green.
- Desktop/mobile before-and-after screenshots are recorded.
- Tracking docs are current and the delivery branch has a reviewable PR.

## Outcome

- Desktop now separates concise product context from the authentication task;
  mobile presents authentication first with one short outcome statement.
- The 390 px sign-up page is 1,119 px tall, down from 1,993 px, and has no
  horizontal overflow.
- Light, dark, 390 px, 768 px, 1,440 px, and reduced-motion states were checked.
- Agent access now leads the product story, supported by concrete task
  follow-up, meeting preparation, roadmap, and collaboration examples.
- Social-provider sign-in uses progressive email disclosure on phone widths;
  tablet and desktop keep the complete form visible. Light/dark selection is
  visibly distinct and persists across reloads.
- The desktop product preview now describes NexusDash's actual connected
  workflow instead of fictional weekly work. Its supporting copy focuses on
  user outcomes rather than implementation details.
- Both halves now share one neutral light/dark foundation with a continuous,
  slowly moving color field that travels from a stronger blue product edge to
  a neutral authentication surface without a hard divider. Reduced-motion
  preferences disable the movement.
- Focused and repository-wide validation passed.
