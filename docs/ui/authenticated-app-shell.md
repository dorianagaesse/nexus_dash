# Authenticated App Shell

The shared shell wraps all `/projects/**` and `/account/**` routes. It provides
the four top-level destinations (Projects, Notifications, Account, Settings),
semantic current-location state, theme/account utilities, safe contextual
returns, and reserved mobile space for the bottom navigation.

## Navigation contract

- Desktop uses one sticky top navigation surface.
- Mobile uses a compact top utility bar and a four-item bottom navigation.
- Every destination has a text label, Lucide icon, visible focus state, and a
  minimum 44 px target.
- `aria-current="page"` identifies the active destination.
- Account detours carry a normalized internal `returnTo` value. Only project
  routes and the notification center are valid contextual origins.
- Notification targets carry the exact notification-center URL so triage can
  resume. Unsafe, external, API, or malformed values use stable fallbacks.
- Fixed hierarchy links say `Projects` or `All projects`; only context-restoring
  controls use `Return to ...` language.

## Layer map

The CSS variables in `app/globals.css` are the shared source of truth:

| Layer | Token | Value |
| --- | --- | ---: |
| Shell navigation | `--layer-shell` | 40 |
| Menus | `--layer-menu` | 50 |
| Floating panels | `--layer-floating` | 60 |
| Toasts | `--layer-toast` | 80 |
| Dialog overlay/content | `--layer-dialog-overlay` / `--layer-dialog` | 90 / 100 |
| Popovers | `--layer-popover` | 120 |
| Nested overlays/content | `--layer-nested-overlay` / `--layer-nested` | 140 / 150 |
| Skip link | `--layer-skip-link` | 160 |

New fixed or portaled UI must use the nearest semantic layer token rather than
introducing an arbitrary z-index.
