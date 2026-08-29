# Current Task

## TASK-407: Public Privacy Policy Page for Google OAuth Production Verification

## Status

Implementation and local validation complete on
`feature/task-407-public-privacy-policy`; Preview and PR review pending.

## Validation Evidence

- `npm run lint`: passed.
- `npm run rls:check`: passed.
- `npm test`: 149 files passed, 2 skipped; 1,055 tests passed, 2 skipped.
- `npm run test:coverage`: passed at 91.37% statements, 81.33% branches,
  92.2% functions, and 91.88% lines. The first Windows run hit fixed five-second
  timeouts in temporary-Git version-policy fixtures; an unchanged warm rerun
  passed all tests.
- `npm run build`: passed with process-local localhost database placeholders,
  Calendar OAuth disabled, and a non-secret local agent-signing placeholder so
  no repository or deployed secrets were read or changed.
- `npx playwright test tests/e2e/privacy-policy.spec.ts`: 2 passed against the
  local development server.
- Visual QA passed at 390x844 and 1440x1000 in light mode; no horizontal
  overflow was detected and the policy link remained visible on the homepage.

## Context

The production Google OAuth application cannot be published while its consent
screen is missing a public privacy-policy URL. NexusDash also needs a durable,
unauthenticated explanation of the information the service handles, with
specific disclosures for Google identity and Calendar data.

## Scope

- Add a public, responsive `/privacy` page with page-specific metadata.
- Describe the account, workspace, technical, and Google data NexusDash handles.
- State the Google Calendar scope and purposes accurately from the runtime
  implementation, including encrypted token storage and user-initiated access
  removal options.
- Explain service-provider sharing, retention, deletion requests, security,
  international processing, children's privacy, policy changes, and contact.
- Include the Google API Services User Data Policy Limited Use disclosure and
  link to the authoritative Google policy.
- Add a visible privacy-policy link to the unauthenticated homepage.
- Add automated coverage proving the route is public and linked from `/`.

## Out Of Scope

- Adding account deletion or Google Calendar credential-disconnect product
  controls; the policy will document the controls currently available through
  Google and the support contact for deletion requests.
- Changing Google OAuth clients, secrets, scopes, consent-screen settings, or
  publishing status in Google Cloud.
- Promoting a production deployment.

## Prerequisites And Runtime Assumptions

- No new secret or database migration is required.
- Google Calendar authorization requests only
  `https://www.googleapis.com/auth/calendar.events` in the current runtime.
- Google Calendar access and refresh tokens are encrypted before database
  persistence with the server-only `GOOGLE_TOKEN_ENCRYPTION_KEY` contract.
- Social sign-in may receive identity information from Google or GitHub; this
  is separate from the optional Google Calendar connection.
- `https://nexus-dash.app/privacy` becomes usable in Google Auth Platform only
  after this change is included in a promoted production deployment.

## Deployment And Review Assumptions

- Follow the explicit-branch Preview workflow in `agent.md` and
  `.github/workflows/deploy-vercel.yml` using
  `feature/task-407-public-privacy-policy` as `git_ref`.
- Validate the public route and homepage link against the resulting Preview URL.
- Open one ready-for-review PR, wait for required checks and the initial Copilot
  review, resolve actionable feedback, then merge to `main`.
- Production promotion and Google Auth Platform publication remain user-owned
  follow-up actions because they change live external state.

## Acceptance Criteria

1. `/privacy` returns successfully without authentication and presents a clear,
   readable privacy policy on mobile and desktop in the existing visual system.
2. The policy accurately covers collected data, purposes, Google identity and
   Calendar event access, encrypted OAuth token storage, sharing, retention,
   deletion/access-removal options, security, user choices, and contact details.
3. The policy links to the Google API Services User Data Policy and explicitly
   states compliance with its Limited Use requirements.
4. The public homepage has a visible, keyboard-accessible link to `/privacy`.
5. Page metadata identifies the route as the NexusDash privacy policy and the
   canonical URL is `https://nexus-dash.app/privacy`.
6. Automated tests cover unauthenticated route access, core Google disclosures,
   and homepage navigation to the policy.

## Definition Of Done

- The acceptance criteria above are satisfied.
- `npm run lint`, `npm run rls:check`, `npm test`, `npm run test:coverage`,
  `npm run build`, and the relevant Playwright tests pass.
- A Preview deploy for the explicit feature branch completes and the generated
  URL is validated for `/privacy` and its homepage link.
- The feature version and changelog are updated according to repository policy.
- `tasks/current.md`, `tasks/backlog.md`, and `journal.md` record the delivered
  behavior and validation evidence.
- The ready PR has completed required checks and initial Copilot review, all
  actionable threads are resolved, and the PR is merged to `main`.

## References

- `agent.md`
- `docs/runbooks/vercel-env-contract-and-secrets.md`
- `docs/runbooks/database-connection-hardening.md`
- `lib/google-calendar.ts`
- `lib/services/google-calendar-credential-service.ts`
