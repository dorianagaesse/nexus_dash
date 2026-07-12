# TASK-270 App UI/UX Design Assessment

- Assessment date: 2026-07-03
- Baseline: `ce34e5e` (`origin/main`)
- Surfaces: unauthenticated entry, projects, project dashboard modules, task
  creation/detail, project owner settings, notifications, account settings
- Viewports: 1440 x 1000 and 390 x 844; light and dark themes

## Executive verdict

NexusDash currently sits at **6.2/10: a credible early-production SaaS UI**.
It is materially above a functional prototype: components are coherent, spacing
is mostly disciplined, feedback is visible, dark mode is intentional, and the
dashboard communicates substantial capability without looking improvised.

It is not yet at the level of a polished modern productivity product. The main
gap is structural rather than decorative: authenticated navigation is hidden in
floating utilities, modal behavior is not consistently accessible, and the
mobile dashboard converts desktop breadth into a very long sequence instead of
re-prioritizing it. Product copy also exposes implementation language where it
should explain user value.

The recommended direction is **calm, flat, touch-aware productivity UI**:
retain the neutral palette and restrained color, reduce layered card chrome,
make hierarchy come from layout and typography, and reserve strong surfaces for
actions or state. A wholesale visual redesign would discard good work and is
not recommended.

## Scorecard

| Dimension | Score | Assessment |
| --- | ---: | --- |
| Visual consistency | 7.5/10 | Shared cards, buttons, borders, radii, icons, and light/dark tokens feel related. |
| Dark mode | 7.5/10 | Designed rather than inverted; surfaces and status colors remain legible. |
| Interaction feedback | 7/10 | Loading labels, success/error messaging, empty states, and toasts are common and clear. |
| Information hierarchy | 6/10 | Individual modules scan well, but the dashboard gives too many modules equal visual weight. |
| Product voice | 5.5/10 | Generally concise, but entry copy and some labels describe architecture instead of outcomes. |
| Responsive design | 5.5/10 | Layouts fit 390 px without horizontal page overflow, but mobile density and sequence are not sufficiently re-composed. |
| Accessibility baseline | 4.5/10 | Visible labels and focus styles exist, but custom overlays lack a consistent dialog/focus contract and micro-text/touch sizes are risky. |

### Remediation status

- **F1 and overlay-specific F12 scope resolved by TASK-321 (2026-07-05):**
  task, context, attachment, calendar, project-settings, confirmation, meeting,
  roadmap, and project-creation overlays now use one accessible dialog/sheet
  foundation with modal semantics, focus containment/restoration, guarded
  Escape behavior, scroll isolation, nested-control support, and reduced-motion
  handling. Whole-app motion outside overlays remains assigned to TASK-108.
- **F3 and shell-specific F10 scope resolved by TASK-322 rework
  (2026-07-12):** project and account routes now share responsive labeled
  navigation focused on Projects and Notifications, with Account/Settings kept
  in the user avatar menu, semantic current-location state, safe project/task
  and notification-list return paths, secondary diagnostics, reserved mobile
  space, and coordinated fixed layers. The rework also adds a mobile Kanban
  status dock so board lanes are switched in context rather than stacked as a
  long scroll. Broader toast policy remains assigned to TASK-108.

## What is working

1. **The interface has a recognizable visual language.** Lucide icons, neutral
   surfaces, rounded controls, semantic state colors, and restrained gradients
   are used consistently. The result feels authored, not assembled from
   unrelated screens.
2. **Desktop dashboard composition is strong.** The header summary, collapsible
   modules, Kanban state colors, and roadmap lane communicate a large feature
   set cleanly at 1440 px.
3. **Dark mode is a genuine strength.** Surface separation, state colors, and
   foreground contrast remain coherent. It should be refined, not rebuilt.
4. **Forms usually explain themselves.** Visible labels, helper text, loading
   labels, disabled states, and nearby errors are present in important flows.
5. **Empty states are rarely blank.** Dashboard modules and disconnected
   calendar/settings states usually explain their status.
6. **Responsive containment is sound.** No page-level horizontal overflow was
   observed at 390 px; sheets and dense forms remain operable through internal
   scrolling.

Key evidence: [desktop dashboard](./task-270-ui-ux-assets/04-project-dashboard-desktop.png),
[dark dashboard](./task-270-ui-ux-assets/16-project-dashboard-dark-desktop.png),
and [account settings](./task-270-ui-ux-assets/10-account-settings-desktop.png).

## Ranked findings

### P1 — address before broad visual polish

| ID | Type | Finding and evidence | Impact | Owner |
| --- | --- | --- | --- | --- |
| F1 | Accessibility defect | Custom create-task, task-detail, project-settings, confirmation, and attachment overlays do not share a semantic dialog contract. Several overlay roots have no `role="dialog"`/`aria-modal`, close icon buttons have no accessible name, and focus trapping/restoration is not centralized. | Keyboard and screen-reader users can lose context or interact with obscured content. Inconsistent one-off overlay code also increases regression risk. | **New TASK-321** |
| F2 | Responsive-layout issue | At 390 px, dashboard modules form a very long linear page; Kanban renders four full-width columns in sequence, including large empty columns. Important work is separated by low-value empty space. [Mobile dashboard](./task-270-ui-ux-assets/12-project-dashboard-mobile.png) | Daily scanning and status movement require excessive scrolling; desktop information architecture is merely stacked rather than re-prioritized. | **TASK-100**, with long-term personalization in **TASK-110** |
| F3 | Navigation defect / product design | Authenticated routes rely on fixed top-right repository/version, account, notification, and theme controls rather than a clear app shell. Project-origin context is also discarded by hard-coded account links: Project -> Notifications -> “Back to account” -> “Back to projects” cannot return to the originating project or its task/query state. [Navigation context loss](./task-270-ui-ux-assets/17-notification-context-loss.png) | Weak orientation and destination discovery; visible “Back” controls behave as fixed hierarchy links rather than returning users to where they came from. | **TASK-322** |
| F4 | Accessibility + mobile ergonomics | Many controls are 40 px or smaller (`h-10`, `h-9`, `h-8`), while dense metadata frequently uses 10–11 px text. These sizes are especially visible in mobile task/Kanban/calendar surfaces. | Missed taps and reduced readability; falls below the audit benchmark of 44 px touch targets and a comfortable mobile text floor. | **TASK-100** for mobile; token/component cleanup in **TASK-108** |
| F5 | Product design / copy | The entry page is polished visually, but its copy foregrounds implementation details (“session model,” “authorization boundary,” provider configuration). On mobile the auth card is followed by a second, long marketing page, creating a 2,000+ px first visit. [Desktop entry](./task-270-ui-ux-assets/01-home-sign-in-desktop.png), [mobile sign-up](./task-270-ui-ux-assets/02-home-sign-up-mobile.png) | New users must translate technical language into product value; returning users carry unnecessary marketing weight. | **TASK-129** |

### P2 — fold into the planned refinement pass

| ID | Type | Finding and evidence | Impact | Owner |
| --- | --- | --- | --- | --- |
| F6 | Information design | Project context, meetings, epics, Kanban, roadmap, and calendar all use similarly weighted bordered containers. Empty and active modules therefore consume comparable attention. | The page is tidy but not prioritized; users must visually parse the entire workspace. | **TASK-108**, **TASK-134**, then **TASK-110** |
| F7 | Copy / metric semantics | The dashboard can show “1 task” beside an “Open 0” summary while the task is in Backlog. “Open” is ambiguous if it excludes backlog, and “completed” competes with the explicit Kanban state model. | Summary metrics can contradict the board at a glance. | **TASK-108** |
| F8 | Interaction defect | Opening a task presents a “Save changes” primary action even in the initial detail state, while task options separately contain Edit. On mobile, action order changes and the sheet fills most of the viewport. [Desktop task](./task-270-ui-ux-assets/05-task-detail-desktop.png), [mobile task](./task-270-ui-ux-assets/13-task-detail-mobile.png) | Read and edit modes are not visually distinct; users may hesitate over whether viewing changed data. | **TASK-133** plus mobile handling in **TASK-100** |
| F9 | Component consistency | Project descriptions in read mode use the same border/background language as inputs, while editing is hidden in an overflow menu/double-click behavior. Project timestamps include seconds and a numeric locale date. [Projects](./task-270-ui-ux-assets/11-projects-populated-desktop.png) | Read-only content looks editable; the undisclosed double-click interaction and timestamp precision add noise. | **TASK-108** |
| F10 | Feedback / layering | Several fast mutations create a tall toast stack in the same right-side region used by fixed utilities. Modal screenshots also show feedback competing with the surrounding chrome. | Important controls and messages can visually collide during bursty workflows. | **TASK-322** for shell/layers; **TASK-108** for toast policy |
| F11 | Empty-state UX | The notification center’s “No active notifications” state is technically clear but offers no explanation, project return path, or indication of what will appear there. [Notifications](./task-270-ui-ux-assets/09-notifications-empty-desktop.png) | The page is a dead end and undersells invitations, mentions, and activity. | **TASK-108** |
| F12 | Motion accessibility | Animations and transitions are present, but no product-level `prefers-reduced-motion` treatment was found. | Users who request reduced motion do not receive a consistent experience. | **TASK-321** for overlay motion; **TASK-108** globally |

## Focused navigation addendum

The follow-up navigation pass confirms that the app loses route context across
otherwise normal account detours. This is broader than one incorrect button.

| Journey | Current behavior | Required behavior |
| --- | --- | --- |
| Project -> account menu -> Notifications | The menu links directly to `/account/notifications` without the project route. | Preserve the project URL as a safe internal origin, including `taskId`, hash, or other meaningful view state. |
| Notifications -> “Back to account” | Always navigates to `/account`, even when Notifications was opened from a project. | Offer a contextual return such as “Back to [project]” while retaining global Account navigation separately. |
| Account -> “Back to projects” | Always navigates to `/projects`, completing the loss of the originating project. | Return to the captured origin when valid; use Projects only as the direct-entry fallback. |
| Project -> account menu -> Settings | Settings uses the same fixed account/projects chain. Native browser Back returns to the project, but the visible product controls do not. | Visible navigation must preserve context at least as well as browser history and must not label a fixed parent jump as historical “Back.” |
| Project notification banner -> Review notifications | The banner also links directly to the global notification center without origin state. | Carry the source project route into the notification center. |
| Notification center -> Open task/project | Notification `targetPath` correctly deep-links to the project and can open a task through `?taskId=...`, but the destination only offers “Back to projects.” | Carry a safe notification-center return route so users can inspect an item and continue triage without reconstructing their place. |
| Direct link/email/auth entry | Auth and invitation flows already normalize safe internal `returnTo` paths. | Reuse this existing safe-path pattern; do not depend on an untrusted referrer or create an open redirect. |

Design implication: Account, Notifications, Settings, and Projects should be
top-level destinations in the authenticated shell, not represented as a chain
of faux-history “Back” links. Contextual return is still valuable for temporary
detours, but it should be explicit (“Back to Apollo launch”) and have a stable
fallback when the page was opened directly.

The focused Playwright check passed **2/2 tests**: the in-product chain was
shown to end at `/projects`, while native browser Back from Settings restored
the exact originating project URL.

## Task routing and recommended sequence

The audit should not become a single redesign epic. Use this order:

1. **TASK-321 — accessible modal and sheet foundation.** Correct the highest-risk
   cross-product defect first and eliminate duplicated overlay behavior.
2. **TASK-322 — responsive authenticated app shell and primary navigation.**
   Establish orientation, utility placement, safe feedback layering, and
   context-preserving project/account/notification round trips.
3. **TASK-100 — mobile UI/UX refinement.** Focus on dashboard prioritization,
   Kanban state switching, 44 px targets, dense forms, and calendar ergonomics.
4. **TASK-133 — task detail/edit polish.** Separate reading from editing and
   remove the compact-scrollbar/modal regressions already assigned there.
5. **TASK-129 — login/home polish.** Replace architecture copy with outcomes,
   shorten the mobile path, and make sign-in versus discovery intentional.
6. **TASK-108 — whole-app refinement.** After the foundations above, normalize
   type/spacing tokens, module elevation, empty states, metrics, read-only
   affordances, toast policy, and reduced motion without re-solving navigation
   or dialogs.
7. **TASK-323 — production-readiness UX verification.** Re-test the remediated
   product across roles, critical journeys, accessibility modes, responsive
   layouts, realistic data, and recovery states before assigning a launch-ready
   UX verdict. TASK-110 remains an optional longer-term personalization epic,
   not a prerequisite for this verification gate.

TASK-134 remains useful after hierarchy work: help affordances should replace
persistent explanatory copy only where the primary interaction is already
clear.

## Design guardrails for implementation

- Keep the current neutral, low-chroma foundation and semantic task/roadmap
  colors. Avoid a brand-wide recolor.
- Prefer one app-shell surface and flatter content sections over adding more
  shadows, blur, or nested cards.
- Use a 4/8 px spacing scale, 16 px mobile body copy, 12 px minimum secondary
  copy, and 44 x 44 px minimum touch targets.
- Use layout, weight, and whitespace for hierarchy before introducing more
  color.
- Retain Inter unless a separate brand exercise justifies a font migration;
  typography consistency matters more than adopting a trendier family.
- Every overlay must expose a name, trap focus, support Escape when safe,
  restore trigger focus, lock background interaction, and respect reduced
  motion.
- Mobile Kanban should prioritize switching between statuses over rendering
  four tall columns consecutively.
- Product-facing copy should describe the user’s outcome. Security and session
  architecture belong in developer/help surfaces.

## Evidence and method

The walkthrough used the repository’s documented Playwright setup and existing
verified-user/project helpers against a local production build and migrated
PostgreSQL database. Test data created one populated project with a context
card, task, and roadmap event. Each capture disabled animation for stable
evidence. The capture run passed: **2 tests, 2 passed**.

The visual review was combined with source inspection for overlay semantics,
focus styles, responsive breakpoints, typography sizes, reduced-motion support,
and shared fixed-layer positioning. This is a heuristic assessment, not a
formal WCAG conformance audit or usability study.

### Screenshot inventory

- Entry: [desktop light](./task-270-ui-ux-assets/01-home-sign-in-desktop.png),
  [mobile sign-up](./task-270-ui-ux-assets/02-home-sign-up-mobile.png),
  [desktop dark](./task-270-ui-ux-assets/15-home-sign-in-dark-desktop.png)
- Projects: [empty](./task-270-ui-ux-assets/03-projects-empty-desktop.png),
  [populated](./task-270-ui-ux-assets/11-projects-populated-desktop.png)
- Dashboard: [desktop light](./task-270-ui-ux-assets/04-project-dashboard-desktop.png),
  [mobile](./task-270-ui-ux-assets/12-project-dashboard-mobile.png),
  [desktop dark](./task-270-ui-ux-assets/16-project-dashboard-dark-desktop.png)
- Tasks: [desktop detail](./task-270-ui-ux-assets/05-task-detail-desktop.png),
  [mobile detail](./task-270-ui-ux-assets/13-task-detail-mobile.png),
  [mobile create](./task-270-ui-ux-assets/14-create-task-mobile.png)
- Owner settings: [general](./task-270-ui-ux-assets/06-project-settings-general-desktop.png),
  [sharing](./task-270-ui-ux-assets/07-project-settings-sharing-desktop.png),
  [agent access](./task-270-ui-ux-assets/08-project-settings-agent-desktop.png)
- Account: [notifications](./task-270-ui-ux-assets/09-notifications-empty-desktop.png),
  [calendar settings](./task-270-ui-ux-assets/10-account-settings-desktop.png)
- Navigation: [project context lost at notifications](./task-270-ui-ux-assets/17-notification-context-loss.png)
