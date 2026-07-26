# Current Task

## Task

- ID: TASK-333
- Title: In-product bug and feedback reporting
- Status: In review (2026-07-26)
- Branch: `feature/task-333-bug-feedback-reporting`
- Pull request: [#389](https://github.com/dorianagaesse/nexus_dash/pull/389)
- Brief: [`task-333-bug-feedback-reporting.md`](./task-333-bug-feedback-reporting.md)

## Objective

Give every authenticated user a persistent, accessible way to send a bug report
or product feedback to the NexusDash owner without leaving the app.

## Scope

- Place a labeled desktop entry immediately above the sidebar user area.
- Add a compact, persistent mobile-header entry that remains usable at 375 px.
- Open one responsive dialog/sheet with report type, message, optional
  diagnostics, validation, progress, success, and retry states.
- Send reports through the existing Resend-backed outbound-email service to
  `dorian.agaesse@gmail.com`.
- Include authenticated reporter identity and safe page/product context without
  including secrets or form contents from the current page.

## Runtime Assumptions

- Existing local database and `.env` prerequisites are unchanged.
- Production has `RESEND_API_KEY` configured and uses the existing NexusDash
  sender identity from `RESEND_FROM_EMAIL`.
- Local/test delivery may remain in the existing skipped mode; provider
  delivery is verified through mocked service coverage unless an explicitly
  enabled live smoke run is requested.
- Preview validation, when run, uses
  `git_ref=feature/task-333-bug-feedback-reporting` and verifies that exact ref
  in workflow logs.

## Acceptance Criteria

1. Desktop shows a labeled “Report a bug or feedback” control directly above
   the user identity area at the bottom of the left sidebar.
2. Mobile exposes the same action persistently in the compact shell without
   colliding with brand, theme, account, content, or bottom navigation at
   375 px.
3. The report UI distinguishes bug reports from general feedback, requires a
   useful message, and clearly communicates optional diagnostics.
4. Submitting authenticates the current user, validates and bounds all input,
   and sends an email from NexusDash to `dorian.agaesse@gmail.com` through the
   shared outbound-email service.
5. The email safely includes report type, message, reporter identity, current
   app path, product version, and only user-approved client diagnostics.
6. Loading prevents duplicate submissions; success closes/resets the form and
   is announced; failure remains recoverable without losing the message.
7. All controls are keyboard reachable, visibly focused, correctly labeled,
   at least 44 px, and usable in light/dark themes and at 375 px.
8. Focused service/action/component tests cover validation, authorization,
   safe email content, provider failures, dialog placement, and interaction
   states.

## Definition Of Done

- Implementation follows shell, dialog, service-boundary, environment, and
  outbound-email conventions already present in the repository.
- `npm run lint`, `npm run rls:check`, `npm test`, `npm run test:coverage`,
  `npm run build`, and relevant Playwright coverage pass.
- Light/dark desktop and 375 px mobile walkthroughs show no overflow,
  obstruction, or ambiguous submission outcome.
- Product version, changelog, task/backlog tracking, and journal are updated.
- The branch is committed and pushed, a ready-for-review PR is open, and
  initial automated review/check feedback is handled before handoff.

## Outcome

- Added the requested labeled desktop sidebar control directly above the user
  identity area and a persistent labeled mobile-header utility.
- Added one responsive dialog/sheet with bug and feedback types, bounded
  message input, privacy-explained optional diagnostics, protected in-flight
  dismissal, success confirmation, and retry-safe errors.
- Added authenticated `POST /api/feedback` delivery through a focused service
  and the existing Resend-backed outbound email foundation.
- Fixed the recipient server-side to `dorian.agaesse@gmail.com`, resolved
  reporter identity server-side, safely escaped report content, included only
  app-relative page/version context, and rate-limited each account to five
  recorded attempts per hour.
- Prepared product release `v0.28.0` with product, runtime, changelog, and task
  documentation updates.

## Validation

- `npm run lint` passed.
- `npm run rls:check` passed.
- `npm run release:check` and `git diff --check` passed.
- `npm test`: 960 passed, 2 skipped.
- `npm run test:coverage`: 91.37% statements, 81.33% branches, 92.2%
  functions, 91.88% lines.
- `npm run build` passed with the documented safe local database/build
  overrides because the existing root `.env` has identical remote
  `DATABASE_URL` and `DIRECT_URL` values that production guardrails reject.
- `npm run test:e2e`: production build and all 24 Playwright tests passed.
- Focused light/dark screenshots at 375 px and 1440 px are stored under
  `.tmp/task333/`; the browser journey also verified exact privacy payload,
  44 px mobile target height, no horizontal overflow, success feedback, and
  desktop placement above the identity card.
