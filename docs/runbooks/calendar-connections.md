# Calendar Connections Operations Runbook

## Deployment contract

Apply Prisma migrations with the privileged `DIRECT_URL` before starting the
new application revision. The TASK-327 migration renames the credential table,
preserves encrypted token bytes, assigns `legacy:<connection-id>` identities,
creates one selected legacy source, and creates the default/write preference.

After migration:

1. Run `npm run rls:check`.
2. Provision grants with `npm run test:rls:setup`.
3. Run `npm run test:rls` as the NOBYPASSRLS role.
4. Confirm legacy connection/source/preference counts match before traffic is
   enabled.

`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and
`GOOGLE_TOKEN_ENCRYPTION_KEY` remain required together outside tests. The
Google OAuth consent screen must allow `openid`, `email`, Calendar events, and
read-only CalendarList scopes.

## Compatibility

`GET` and `PATCH /api/account/settings/google-calendar` resolve the default
connection/write target. `DELETE` disconnects that default connection. New
clients use `/api/account/calendar-connections`, per-connection sync/delete,
and `/api/account/calendar-preferences`.

## Recovery

- `reauthorization-required`: reconnect the same account card. A different
  Google `sub` is rejected for established connections.
- Calendar list stale or missing: use **Refresh all calendars**. Calendars absent
  from the provider response become unavailable but are not reassigned.
- Partial project warning: retry the failed source; successful sources remain
  visible. Reads retry one 429/5xx automatically, mutations never do.
- Revocation unconfirmed: local tokens are already deleted. Direct the user to
  Google Account permissions to remove NexusDash upstream.
- Missing write target: choose an owner/writer source and save preferences.

## Two-account acceptance smoke

Using two authorized Google test accounts:

1. Add account A, verify its primary calendar is selected and becomes target.
2. Add account B, verify account A remains the target.
3. Select calendars from both and create/edit/delete on the chosen target.
4. Confirm each event names its originating source and read-only events cannot
   be edited.
5. Reconnect account A with the same identity; verify a different identity is
   rejected.
6. Disconnect account B and confirm account A, its tokens, and target are
   unchanged.

Record the preview URL, checked-out commit, Google test-account aliases (never
tokens), and results in `journal.md`.
