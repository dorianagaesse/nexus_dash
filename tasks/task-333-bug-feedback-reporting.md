# TASK-333 — In-product bug and feedback reporting

## Origin

- User request on 2026-07-26: add a desktop control above the sidebar user icon,
  choose an appropriate mobile placement, and deliver each submission as an
  email from NexusDash to `dorian.agaesse@gmail.com`.
- Backlog entry TASK-333.

## Product decision

Use one shell-owned report dialog. Desktop receives the requested full-width
single-line sidebar control directly above the identity card. Mobile receives
a persistent 44 px icon button in the compact header, with a combined
bug/message glyph, accessible name, and native tooltip, because adding a modal
action to the route-oriented bottom navigation would mix navigation and
mutation semantics.

The form defaults to “Bug”, also supports “Feedback”, and collects a bounded
message. It always includes authenticated reporter identity, current app path,
and product version. Browser, viewport, locale, and time-zone diagnostics are
included only while the user-controlled diagnostics option is enabled.

The backend uses the existing authenticated API-adapter and service
boundaries. A focused feedback service builds a safely escaped email and calls
the existing outbound-email service, which records delivery observability and
sends via Resend in production.

## Security and privacy

- Require a verified authenticated session on every submission.
- Validate category, message length, app-relative path, and diagnostic lengths
  on the server.
- Never accept a recipient, sender, reporter email, or arbitrary HTML from the
  browser.
- Resolve reporter identity server-side.
- Do not capture page form values, cookies, authorization data, referrers, or
  full URLs.
- Escape all user-controlled content in HTML email.

## Acceptance Criteria

1. The requested desktop placement and an intentional persistent mobile entry
   are implemented in the authenticated shell.
2. The responsive form has labeled inputs, inline validation, bounded content,
   an optional diagnostics disclosure, and explicit progress/outcome states.
3. Verified authenticated submissions send through the shared outbound-email
   foundation to the fixed owner address.
4. Email content is useful, safe, attributable, and privacy-conscious.
5. Keyboard, focus, 44 px target, 375 px containment, and light/dark behavior
   meet the shared shell and overlay standards.
6. Focused automated coverage exercises client, action, template, and service
   behavior, including failure recovery.

## Definition Of Done

- Code, tests, product version, changelog, current-task record, backlog status,
  and journal are consistent.
- Required local quality gates and relevant browser validation pass.
- The task branch is pushed and has a ready-for-review PR with initial
  automated feedback handled.
