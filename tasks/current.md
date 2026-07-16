# Current Task

## Task

- ID: TASK-129
- Title: Login/home page UI polish - user-friendly, product-oriented entry experience
- Status: Complete (2026-07-16)
- Branch: `feature/task-129-login-home-page-ui-polish`
- Brief: [`task-129-login-home-page-ui-polish.md`](./task-129-login-home-page-ui-polish.md)

## Objective

Replace the implementation-focused unauthenticated home page with a concise,
outcome-led entry experience that keeps returning-user sign-in immediate,
explains NexusDash in product language, and avoids a second long marketing page
on mobile.

## Scope

- Preserve the existing credentials, social-provider, return-path, verification,
  recovery, and inline validation behavior.
- Reframe the page around user outcomes: planning, delivery focus, shared
  context, and calendar-aware execution.
- Establish a clear desktop split between product context and authentication.
- Make authentication the first and dominant mobile experience, with only a
  compact product-value summary.
- Improve form hierarchy, touch targets, focus treatment, loading feedback,
  responsive containment, light/dark contrast, and reduced-motion behavior.
- Add focused unit and Playwright coverage for the entry experience.

## Runtime Assumptions

- Local PostgreSQL and the repository `.env` contract are available for runtime
  rendering and authenticated redirect validation.
- Social sign-in controls render only for providers enabled through the existing
  server-side configuration.
- Preview validation, if required by review, will use the active branch as the
  explicit `git_ref` per `agent.md`.

## Acceptance Criteria

1. Returning users can reach and understand the sign-in form without scrolling
   at 390 px, 768 px, and desktop widths.
2. New users see concrete product outcomes rather than session, provider, or
   authorization architecture language.
3. The 390 px sign-up page no longer appends a long card-based marketing page
   and is materially shorter than the 1,993 px baseline.
4. Sign-in and sign-up retain email prefill, safe `returnTo`, social-provider,
   password recovery, status/error, and pending-submit behavior.
5. Inputs and primary actions are at least 44 px high, labels remain visible,
   keyboard focus is obvious, and status/error feedback is announced.
6. The page remains usable without horizontal overflow in light and dark modes
   and respects reduced-motion preferences.
7. Focused tests and Playwright screenshots cover desktop sign-in and mobile
   sign-up at minimum.

## Definition Of Done

- The redesigned entry page is implemented with repository-native Next.js,
  Tailwind, Shadcn, and Lucide patterns.
- Task tracking and the execution journal describe the design decision,
  baseline evidence, and validation outcome.
- `npm run lint`, `npm run rls:check`, `npm test`, `npm run test:coverage`,
  `npm run build`, and relevant Playwright checks pass.
- Before/after desktop and 390 px mobile screenshots are captured under `.tmp/`.
- The branch is committed, pushed, and represented by a ready-for-review PR.

## Outcome

- Replaced the long mixed auth/marketing page with a desktop product/auth split
  and an auth-first mobile layout using product-outcome language throughout.
- Reduced the 390 px sign-up document from 1,993 px to 1,119 px with no
  horizontal overflow; sign-in remains visible in the initial mobile viewport.
- Preserved credentials, social providers, password recovery, safe return paths,
  prefill, verification/status feedback, and signup validation behavior.
- Added 48 px form/provider/primary controls, visible focus treatment, semantic
  live feedback, dark-mode verification, and global reduced-motion handling.
- Refined the entry experience after visual review: agent access is now the
  lead product capability, task/meeting/roadmap examples reflect real
  NexusDash workflows, and primary auth actions use the shared neutral button
  treatment.
- On phone widths with social providers enabled, Google, GitHub, and email are
  presented as three compact choices; choosing email replaces those choices
  with the credential form and retains a clear back path. Tablet and desktop
  layouts keep the credential form immediately visible.
- The product panel now changes meaningfully between light and dark themes, and
  Playwright verifies that the selected theme persists across a reload.
- Validation passed: lint, RLS inventory, 932 unit tests, coverage thresholds,
  production build, and focused Playwright checks across desktop, mobile, dark
  mode, tablet containment, and reduced motion.
