# Authenticated App Shell

The shared shell wraps all `/projects/**` and `/account/**` routes. It provides
the primary workspace destinations (Projects and Inbox), semantic
current-location state, theme/account utilities, safe contextual returns, and
reserved mobile space for fixed navigation. Account, Settings, logout, and
diagnostics remain available from the user avatar menu instead of competing with
project navigation.

## Navigation contract

- Desktop uses a stable left sidebar so navigation and account identity remain
  visible without consuming the page's working height.
- On a project dashboard, the sidebar changes `Projects` to the single
  `All projects` exit and adds a `Current project` group with Overview and
  owner-only Project settings. Project settings are rendered into the shell's
  contextual action slot so their position remains responsive and zoom-safe.
- Mobile uses a compact top utility bar and a two-item bottom navigation for
  true workspace destinations.
- The user avatar menu is retained as the predictable home for Account,
  Settings, diagnostics, and logout.
- Sidebar account menus open upward and toward the content area; mobile header
  menus open downward and toward the viewport edge.
- Every destination has a text label, Lucide icon, visible focus state, and a
  minimum 44 px target.
- `aria-current="page"` identifies the active destination.
- Account detours carry a normalized internal `returnTo` value. Only project
  routes and the notification center are valid contextual origins.
- Notification targets carry the exact notification-center URL so triage can
  resume. Unsafe, external, API, or malformed values use stable fallbacks.
- Fixed hierarchy links say `Projects` or `All projects`; only context-restoring
  controls use `Return to ...` language.

## Mobile Kanban Navigation

The project Kanban board owns its own mobile status navigation. At narrow
viewports the board shows one lane at a time and exposes a compact, floating
status dock for Backlog, Doing, Blocked, and Done above the app bottom
navigation. The active lane uses both color and a position indicator. Desktop
keeps the four-column board.

This keeps global navigation focused on destinations while letting daily task
scanning avoid scrolling through every status lane.

## Layer map

The CSS variables in `app/globals.css` are the shared source of truth:

| Layer                   | Token                                       |     Value |
| ----------------------- | ------------------------------------------- | --------: |
| Shell navigation        | `--layer-shell`                             |        40 |
| Menus                   | `--layer-menu`                              |        50 |
| Floating panels         | `--layer-floating`                          |        60 |
| Toasts                  | `--layer-toast`                             |        80 |
| Dialog overlay/content  | `--layer-dialog-overlay` / `--layer-dialog` |  90 / 100 |
| Popovers                | `--layer-popover`                           |       120 |
| Nested overlays/content | `--layer-nested-overlay` / `--layer-nested` | 140 / 150 |
| Skip link               | `--layer-skip-link`                         |       160 |

New fixed or portaled UI must use the nearest semantic layer token rather than
introducing an arbitrary z-index.
