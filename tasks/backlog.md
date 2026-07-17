# Backlog

Use this file to capture tasks discovered during development. Each entry should include: ID, title, rationale, dependencies.

Last reviewed: 2026-07-17

## Pending
### Execution Queue (Now / Next)
- ID: TASK-324
  Title: Unified user hub and avatar-menu navigation rework
  Status: Now 1 - account navigation consolidation
  Rationale: Replace the disordered avatar-menu destination list with a calmer entry into one coherent user hub. The hub should present Account, Settings, and Notifications as three persistent, route-backed tabs so the experience feels like one page while preserving deep links, browser history, unread state, and safe return-to-project behavior. Keep the avatar control, but reduce its menu to identity, one clear user-hub entry, appearance/diagnostics, and a spatially separated logout action; avoid duplicating the same account destinations across the menu, sidebar, and page chrome.
  Dependencies: TASK-270, TASK-321, TASK-322
  Brief: `tasks/task-324-unified-user-hub-navigation.md`
- ID: TASK-100
  Title: Mobile UI/UX refinement - touch ergonomics, compact layouts, and small-screen polish
  Status: Next 2 - mobile core-flow remediation
  Rationale: Re-prioritize the long mobile dashboard sequence, replace four vertically stacked Kanban columns with an intentional status-switching pattern, enforce 44px touch targets and readable secondary text, reduce task-sheet friction, and retain the existing Google Calendar narrow-viewport scope identified by TASK-270.
  Dependencies: TASK-091, TASK-079, TASK-096, TASK-270, TASK-321, TASK-322
- ID: TASK-133
  Title: Task UI bug fixing - mini scrollbar and detail/edit modal polish
  Status: Next 3 - daily task-flow clarity
  Rationale: Separate task reading from editing, remove ambiguous Save/Edit states, and fix compact scrollbar/modal regressions so the highest-frequency execution flow is visually clear and predictable after the shared overlay foundation lands.
  Dependencies: TASK-076, TASK-113, TASK-270, TASK-321
- ID: TASK-129
  Title: Login/home page UI polish - user-friendly, product-oriented entry experience
  Status: Next 4 - entry and product-voice refinement
  Rationale: Replace session/provider architecture language with user outcomes, reduce the very long mobile first-visit path, improve visual hierarchy and CTA clarity, and keep returning-user sign-in friction low. TASK-270 finding F5 is the design brief.
  Dependencies: TASK-045, TASK-059, TASK-083, TASK-270
- ID: TASK-108
  Title: Whole-app UI/UX refinement - global interaction, visual, and information-design polish
  Status: Next 5 - cross-app convergence pass
  Rationale: Use TASK-270 findings F6-F12 to normalize module hierarchy, metric semantics, read-only affordances, type/spacing tokens, empty states, toast policy, and reduced motion after the structural navigation, overlay, mobile, task, and entry work is complete.
  Dependencies: TASK-096, TASK-100, TASK-129, TASK-133, TASK-270, TASK-321, TASK-322, TASK-324
- ID: TASK-323
  Title: Production-readiness UX verification - accessibility, navigation, responsive, role, and recovery sign-off
  Status: Next 6 - blocked final verification gate
  Rationale: Re-audit the remediated product rather than assuming implementation tasks achieved production quality. Verify WCAG AA fundamentals, keyboard/screen-reader operation, owner/editor/viewer/invitee journeys, navigation state preservation, realistic data density, loading/error/empty recovery, responsive layouts, themes, and critical usability flows; produce a residual-risk sign-off report and focused defects for anything still below production grade.
  Dependencies: TASK-100, TASK-108, TASK-129, TASK-133, TASK-321, TASK-322, TASK-324
  Brief: `tasks/task-323-production-readiness-ux-verification.md`
- ID: TASK-325
  Title: Google Calendar integration audit - current-state architecture, behavior, and risk assessment
  Status: Next 7 - calendar integration discovery
  Rationale: Audit the current Google Calendar implementation across authentication, credential storage, account settings, project surfaces, event operations, tests, and deployment configuration; document the effective ownership model, known gaps, security risks, and a prioritized remediation path before extending the integration.
  Dependencies: TASK-005, TASK-032, TASK-076, TASK-083
- ID: TASK-326
  Title: Google Calendar connection ownership - enforce user-scoped rather than project-scoped integration
  Status: Next 8 - calendar ownership verification and remediation
  Rationale: Verify and enforce that each Google Calendar authorization, credential, target-calendar preference, refresh lifecycle, and disconnect action belongs to the authenticated user rather than an individual project, while ensuring project calendar views use only the current user's connection and cannot expose another member's credentials or settings.
  Dependencies: TASK-076, TASK-083, TASK-325
- ID: TASK-327
  Title: Additional calendar connections - provider and multi-calendar expansion
  Status: Next 9 - calendar connection expansion
  Rationale: Define and implement a scalable connection model beyond the current Google Calendar path, including additional Google accounts, selectable calendars, and future calendar providers, with clear per-user ownership, connection management, synchronization behavior, and consistent project-calendar UX.
  Dependencies: TASK-325, TASK-326
### Deferred (Intentional)
- ID: TASK-102
  Title: Collaboration service modularization - split invite, membership, and recipient flows into smaller service units
  Status: Pending
  Rationale: Reduce maintenance pressure in the current project-collaboration service by separating owner invite management, membership mutation, and recipient invitation-response concerns into smaller modules with clearer ownership, narrower tests, and easier future extension for v2 invite flows.
  Dependencies: TASK-058
- ID: TASK-109
  Title: Todo list feature - lightweight checklist capture alongside project execution
  Status: Pending
  Rationale: Add a lighter-weight todo list surface for quick checklist-style capture that does not require the full structure of Kanban tasks, giving teams a place for small actionable items, personal punch lists, or short operational checklists that may later connect to richer task flows.
  Dependencies: TASK-076, TASK-079
- ID: TASK-090
  Title: Internationalization baseline - FR/EN translation capabilities
  Status: Pending
  Rationale: Enable bilingual product usage (French and English) with consistent UI copy, locale routing/state strategy, and fallback behavior; defer implementation until we confirm i18n architecture and translation workflow.
  Dependencies: TASK-047, TASK-060
- ID: TASK-134
  Title: Section help affordances - opt-in question-mark guidance across dashboard modules
  Status: Pending
  Rationale: Replace persistent explanatory copy inside dashboard sections with lighter opt-in help affordances so users can click a question-mark entry point when they want extra context, keeping section layouts cleaner while creating a reusable explanation pattern for Roadmap and future modules.
  Dependencies: TASK-096, TASK-108
- ID: TASK-063
  Title: Background jobs phase 1 - maintenance workload extraction (deferred)
  Status: Pending
  Rationale: Move maintenance writes (for example auto-archive) from request paths to scheduled/background processing after deployment/runtime baseline is in place; defer now to avoid throwaway implementation.
  Dependencies: TASK-039, TASK-043
- ID: TASK-064
  Title: Security hardening - API rate limiting baseline (deferred)
  Status: Pending
  Rationale: Add rate limiting and abuse controls when endpoints are exposed publicly; defer now until deployment/auth topology is finalized so policy matches real traffic boundaries.
  Dependencies: TASK-039, TASK-040, TASK-046

### Epic Tracking (Non-Executable)
- ID: TASK-110
  Title: Modular dashboard personalization - user-configurable project workspace composition and arrangement
  Status: Pending (Epic - likely split into dashboard-layout foundation, module registry/adapters, arrangement UX, and mobile-specific follow-ups)
  Rationale: Let each user personalize their project dashboard by choosing which modules they want to see and arranging them as they wish, so the workspace can evolve beyond the fixed context/Kanban/calendar layout toward a more flexible surface that can host roadmap, meeting notes, todo lists, and future feature panels. The solution must work intentionally on mobile as well as desktop, which likely requires separate design/interaction treatment for ordering, density, collapse behavior, and module visibility.
  Dependencies: TASK-062, TASK-096, TASK-091, TASK-100
- ID: TASK-114
  Title: Task/context authoring refinement - richer content entry, compact metadata display, and scan-time preview polish
  Status: Pending (Epic - likely split into context-card layout/content, attachment-link input polish, and rich-content readability/rendering follow-ups)
  Rationale: Evolve the current task/context authoring experience from basic form capture into a cleaner content workspace where richer formatting, compact token handling, lighter attachment entry, and better preview behavior improve both writing and scanning without crowding the dashboard UI.
  Dependencies: TASK-111, TASK-112, TASK-113
- ID: TASK-022
  Title: Production deployment baseline (runtime, CI/CD, secrets, observability)
  Status: Pending (Epic - split into TASK-039/TASK-040/TASK-041/TASK-042/TASK-043)
  Rationale: Move from local Docker setup to reproducible Vercel deployment with modern operational best practices; public exposure requires completed app auth/authz and blob storage migration.
  Dependencies: TASK-042, TASK-043, TASK-048, TASK-058, TASK-065, TASK-066
- ID: TASK-021
  Title: Implement production-grade authentication and account onboarding
  Status: Pending (Epic - split into TASK-045/TASK-046/TASK-047/TASK-048/TASK-058/TASK-059/TASK-081/TASK-082/TASK-083/TASK-084)
  Rationale: Add user accounts, persistent sessions, and modern authentication UX aligned with architecture decision.
  Dependencies: TASK-048, TASK-058, TASK-059
- ID: TASK-023
  Title: Security assessment and remediation baseline
  Status: Done (Epic completed via TASK-049/TASK-050/TASK-051 on 2026-04-13)
  Rationale: Completed the full security-baseline sequence by producing the OWASP-focused assessment, implementing the top-ranked remediations, and closing the loop with a dedicated verification and residual-risk report.
  Dependencies: TASK-051

## Completed
- ID: TASK-322
  Title: Responsive authenticated app shell - primary navigation, utility placement, and safe feedback layers
  Status: Done (2026-07-16 redesigned after closed PR #361)
  Rationale: Replaced floating authenticated utilities with an adaptive desktop sidebar and mobile Projects/Inbox dock, retained the user avatar menu for Account/Settings/diagnostics/logout, preserved normalized project/task and notification-list return paths, and added a visually subordinate mobile Kanban lane dock that avoids scrolling across every status.
  Dependencies: TASK-270, TASK-321
  Brief: `tasks/task-322-responsive-authenticated-app-shell.md`
- ID: TASK-321
  Title: Accessible modal and sheet foundation - semantics, focus lifecycle, keyboard behavior, and responsive overlays
  Status: Done (2026-07-05)
  Rationale: Replaced duplicated custom overlays with a shared Radix-backed dialog/sheet contract covering modal semantics, named controls, focus containment/restoration, guarded Escape behavior, background isolation, nested controls, responsive internal scrolling, and reduced motion.
  Dependencies: TASK-270
  Brief: `tasks/task-321-accessible-modal-sheet-foundation.md`
- ID: TASK-270
  Title: App UI/UX design assessment - product-wide heuristic audit and refinement roadmap
  Status: Done (2026-07-03)
  Rationale: Assessed core entry, project, dashboard, task, notification, account, sharing, and agent-access surfaces at desktop/mobile widths and in light/dark themes. The report ranks the current product at a credible early-production baseline, routes findings into TASK-100/TASK-108/TASK-129/TASK-133/TASK-134/TASK-110, creates focused accessibility and app-shell follow-ups TASK-321/TASK-322, and closes the remediation sequence with verification gate TASK-323.
  Dependencies: TASK-091, TASK-096, TASK-100, TASK-108, TASK-129
  Brief: `tasks/task-270-app-ui-ux-design-assessment.md`
  Report: `docs/reports/task-270-ui-ux-assessment.md`
- ID: TASK-320
  Title: Project membership live refresh - update project pages when invited members join
  Status: Done (2026-06-26, merged via PR #354; closes GitHub issue #352)
  Rationale: Invitation acceptance now advances a membership-specific, monotonic project activity marker so already-open dashboards refresh when a viewer or editor joins without weakening owner-only sharing or editor-only content activity boundaries.
  Dependencies: TASK-058, TASK-309, TASK-311, TASK-119
  Brief: `tasks/task-320-project-membership-live-refresh.md`
- ID: TASK-119
  Title: Project collaboration presence UX - member avatars on project pages
  Status: Done (2026-06-26, merged via PR #347)
  Rationale: Added a compact, accessible collaborator presence block to project dashboard headers with avatar fallbacks, current-user context, member details, and bounded overflow behavior.
  Dependencies: TASK-058, TASK-082, TASK-089
- ID: TASK-314
  Title: Meeting todo overdue reminders - notification email and in-app reminder dispatch
  Status: Done (2026-06-25, merged via PR #346)
  Rationale: Added idempotent overdue meeting-todo reconciliation to the existing notification dispatcher, producing durable in-app reminders and queued project-digest emails with scheduler metrics and operator documentation.
  Dependencies: TASK-098, TASK-227, TASK-268, TASK-316
  Brief: `tasks/task-314-meeting-todo-overdue-reminders.md`
- ID: TASK-316
  Title: Meeting todo floating panel - project-wide open follow-up list
  Status: Done (2026-06-21, delivered via PR #345)
  Rationale: Added a responsive project-wide floating Meeting Todos card with overdue-first aggregation, minimal source meeting context and navigation, viewer-safe read access, a reducible compact state, and focused owner/editor completion and reopening without replacing the full meeting action list.
  Dependencies: TASK-098
  Brief: `tasks/task-316-meeting-todo-side-panel.md`
- ID: TASK-319
  Title: Prisma tooling dependency advisory remediation - restore green security audit
  Status: Done (2026-06-21, merged via PR #343)
  Rationale: Updated the Prisma tooling Hono override to patched release 4.12.26, refreshed compatible transitive tooling dependencies, restored green production/full security audits, and documented that the advisory path is not imported by the deployed request runtime.
  Dependencies: TASK-061, TASK-274, TASK-088
  Brief: `tasks/task-319-prisma-tooling-dependency-advisory-remediation.md`
- ID: TASK-318
  Title: RLS coverage inventory and tenant-isolation CI guardrail
  Status: Done (2026-06-21, completed via PR #344)
  Rationale: Classified all 33 Prisma models, extended forced RLS to previously unclassified project-derived tables, replaced broad pre-authentication credential reads with a narrow security-definer lookup, and added a non-superuser `NOBYPASSRLS` PostgreSQL isolation matrix to CI.
  Dependencies: TASK-085, TASK-088
  Brief: `tasks/task-318-rls-coverage-tenant-isolation-guardrail.md`
- ID: TASK-317
  Title: Agent access settings loading and overflow containment
  Status: Done (2026-06-18, merged via PR #332)
  Rationale: Resolved GitHub issue #312 by prefetching project agent credentials when settings opens, showing an immediate loading state, and containing long credential, quickstart, and audit values inside the settings modal.
  Dependencies: TASK-059, TASK-115
- ID: TASK-098
  Title: Meeting notes manager - structured project meeting log with participants, labels, outputs, and todos
  Status: Done (2026-06-18, merged via PR #331)
  Rationale: Added project-scoped meeting preparation and notes with participants, labels, outputs, personal todos, lifecycle state, archive/search behavior, API/service coverage, and project dashboard integration.
  Dependencies: TASK-076, TASK-079
- ID: TASK-088
  Title: Milestone architecture and security audit - post-auth/account hardening review
  Status: Done (2026-06-19, merged via PR #341)
  Rationale: Audited service and transport boundaries, authentication and agent-token controls, tenancy enforcement, environment and deployment safeguards, storage abstraction, scheduler trade-offs, caching, dependency posture, CI, and observability. The architecture remains sound enough for normal feature delivery; TASK-318 captures the RLS verification gap and TASK-319 owns the newly regressed Prisma/Hono tooling audit.
  Dependencies: TASK-084, TASK-085, TASK-086
  Report: `tasks/task-088-architecture-audit.md`
- ID: TASK-315
  Title: Protected preview agent-access diagnostics
  Status: Done (2026-06-18, merged via PR #333)
  Rationale: Documented how Vercel deployment protection can intercept token
    exchange before NexusDash, clarified raw-key `ApiKey` versus access-token
    `Bearer` authentication, and added secret-safe protected-preview diagnostics.
  Dependencies: TASK-059, TASK-115
- ID: TASK-313
  Title: App version governance - semantic release increments and build metadata clarity
  Status: Done (2026-06-06, merged via PR #329)
  Rationale: Implemented branch-based SemVer governance: `feature/*` PRs bump minor/reset patch, release-impacting `fix/*`/`refactor/*`/`chore/*` PRs bump patch, commit/build metadata remains diagnostic, and CI validates package-lock consistency plus changelog entries so product versions cannot stagnate accidentally.
  Dependencies: TASK-087, TASK-132, TASK-272
- ID: TASK-224
  Title: Agent roadmap access - scoped API contract for roadmap phases and events
  Status: Done (2026-06-06, merged via PR #326)
  Rationale: Added dedicated roadmap agent scopes, token/credential mappings, route and service authorization, hosted onboarding/OpenAPI coverage, and focused tests so project-scoped agents can inspect, create, update, move, reorder, and delete roadmap phases/events without borrowing task permissions.
  Dependencies: TASK-127, TASK-130, TASK-059
- ID: TASK-263
  Title: Real-time notification updates - live in-app inbox, counts, and awareness
  Status: Done (2026-06-06, merged via PR #320)
  Rationale: Added account-scoped live notification snapshots with SSE-first transport and polling fallback so notification-center rows, unread counts, and awareness banners update without navigation. The implementation keeps in-app notifications atomic, preserves grouped/debounced email delivery, and updates route/component/service/docs coverage.
  Dependencies: TASK-118, TASK-123, TASK-260
- ID: TASK-312
  Title: Hidden project refresh reconciliation - remove user-facing refresh prompt
  Status: Done (2026-06-04, merged via PR #319)
  Rationale: Removed the visible bottom-right project refresh prompt and manual refresh button while preserving hidden pending-version tracking and automatic refresh once active edit locks or hidden-tab constraints clear. This keeps realtime collaboration machinery out of the user's way.
  Dependencies: TASK-311, TASK-308
- ID: TASK-311
  Title: Product latency remediation - typed realtime events and targeted dashboard reconciliation
  Status: Done (2026-06-04, merged via PR #318)
  Rationale: Implemented the top-ranked path from TASK-310 by adding typed project activity events and direct dashboard reconciliation for task, task-comment, and context-card mutations. Final preview validation showed the observer dashboard applying a remote task create 98 ms after API completion, eliminating the prior 4-5 second broad-refresh fallback delay for supported events.
  Dependencies: TASK-310, TASK-309, TASK-308, TASK-276, TASK-263
- ID: TASK-310
  Title: Full-stack product performance investigation - user-perceived latency root cause report
  Status: Done (2026-06-04, merged via PR #317)
  Rationale: Completed a full-stack performance investigation report with local production-mode timing evidence, prior preview API timing evidence, root causes, and a ranked implementation path. The report identified remote observer latency as a poll-backed SSE plus broad route-refresh reconciliation problem, with deployed API/runtime latency as a compounding factor.
  Dependencies: TASK-275, TASK-276, TASK-308, TASK-309
  Report: `docs/reports/task-310-performance-investigation.md`
- ID: TASK-309
  Title: Realtime event-stream foundation - SSE transport for collaboration freshness
  Status: Done (2026-06-03, merged via PR #316)
  Rationale: Added an authenticated project activity SSE route, made dashboards prefer `EventSource` with adaptive polling fallback, preserved local mutation acknowledgement/edit-lock behavior, documented the SSE-first decision, and passed Copilot review plus Quality Gates before merge.
  Dependencies: TASK-118, TASK-263, TASK-308
- ID: TASK-308
  Title: Smart live project refresh - automatic collaboration updates without editing interruptions
  Status: Done (2026-06-02, merged via PR #315)
  Rationale: Added source-aware live project refresh semantics so local mutations are acknowledged without self-refresh prompts, remote updates auto-apply when safe, editing locks defer updates behind the manual affordance, and active dashboards use a lower-latency freshness cadence with hidden-tab backoff.
  Dependencies: TASK-118, TASK-276, TASK-263
- ID: TASK-276
  Title: App performance remediation - production-grade action latency fixes
  Status: Done (2026-05-31, merged via PR #314)
  Rationale: Implemented the first evidence-backed performance remediation batch from TASK-275: board-ready task mutation payloads, optimistic/local reconciliation for targeted task/comment/context-card flows, reduced reorder write amplification, deployed timing headers, preview API smoke validation, and green Quality Gates before merge.
  Dependencies: TASK-275, TASK-043, TASK-073, TASK-074, TASK-118, TASK-266
  Brief: `tasks/task-276-app-performance-remediation.md`
- ID: TASK-275
  Title: App performance investigation - action latency root-cause analysis
  Status: Done (2026-05-31, merged via PR #311)
  Rationale: Completed a measurement-first investigation across local service timings, local Playwright timing, deployed preview API timing, Vercel protection behavior, and browser refresh/perceived-latency paths. The report identified broad mutation-gated route refreshes and server-confirmation waits as the dominant user-visible cause, with direct deployed API timing retained as residual evidence for remediation.
  Dependencies: TASK-043, TASK-073, TASK-074, TASK-118, TASK-266
  Brief: `tasks/task-275-app-performance-investigation-report.md`
  Report: `docs/reports/task-275-performance-investigation.md`
- ID: TASK-307
  Title: Agent comment credential identity - label and shared avatar
  Status: Done (2026-05-31, merged via PR #309)
  Rationale: Agent-authored task comments now persist project agent credential metadata and render with `<credential label> (agent)` plus a shared robot-head-like avatar, while preserving the credential owner as the authorization principal. Post-merge preview smoke created three agent-authored comments, assigned two tasks to the validation user, mentioned that user in comments, and verified the deployed API reloads the agent author identity.
  Dependencies: TASK-059, TASK-127, TASK-265, TASK-306
  Brief: `tasks/task-307-agent-comment-credential-identity.md`
- ID: TASK-306
  Title: Task comment mention cursor spacing after mention autocomplete
  Status: Done (2026-05-31, merged via PR #307)
  Rationale: Fixed the task comment composer mirror/caret mismatch after
    mention autocomplete by using metric-neutral mirror styling, stabilizing
    selection after mention insertion, and adding regression coverage for
    typing immediately after a selected mention plus mention notification
    creation.
  Dependencies: TASK-076, TASK-123
- ID: TASK-118
  Title: Real-time collaboration updates - live project refresh for multi-user work
  Status: Done (2026-05-31, merged via PR #305)
  Rationale: Added live project refresh for multi-user work so task, context-card, roadmap, and related dashboard mutations can be observed across active collaborators without manual page refreshes. Remote Quality Gates and branch preview deployment passed before merge.
  Dependencies: TASK-058, TASK-076, TASK-103
- ID: TASK-274
  Title: Next.js dependency security update - restore green production audit
  Status: Done (2026-05-30, merged via PR #304)
  Rationale: Confirmed the high-severity Next.js advisory had cleared, then restored green production audit posture by pinning transitive production advisory fixes through npm overrides for Next/PostCSS and Prisma's Hono dev-server tree.
  Dependencies: TASK-116, TASK-132
- ID: TASK-266
  Title: Production pg query deprecation warning cleanup
  Status: Done (2026-05-26, merged via PR #293)
  Rationale: Serialized Prisma pg transaction-client query calls while preserving pg pool callback and Promise connect overloads, eliminating the pg query-overlap deprecation warning risk without weakening transaction-scoped RLS. Preview testing from the branch confirmed the app still works, remote Quality Gates passed, and the PR was merged after maintainer review.
  Dependencies: TASK-258, TASK-259
- ID: TASK-269
  Title: GitHub Actions workflow cleanup - simplify CI/CD, scheduled jobs, and maintenance automation
  Status: Done (2026-05-26, merged via PR #292)
  Rationale: Kept the workflow set intentionally scoped while cleaning contracts, permissions, documentation, and operator guidance for quality gates, Vercel deploys, notification email dispatch, dependency security, Dependabot triage, and Copilot repair.
  Dependencies: TASK-042, TASK-116, TASK-132, TASK-268
  Brief: `tasks/task-269-github-actions-workflow-cleanup.md`
- ID: TASK-273
  Title: Cost-aware notification email scheduling - industry-aligned delivery cadence
  Status: Done (2026-05-25, merged via PR #291)
  Rationale: Kept the app-owned durable notification email queue and protected dispatcher, reduced the no-new-cost GitHub Actions production bridge from 3 hours to 30 minutes, added scheduler-lag metrics to dispatcher/workflow summaries, and updated runbooks/tracking docs with expected latency and residual GitHub scheduler limitations.
  Dependencies: TASK-125, TASK-227, TASK-268, TASK-271, TASK-226
  Brief: `tasks/task-273-cost-aware-notification-email-scheduling.md`
- ID: TASK-226
  Title: Task due-date email reminders - production RLS reconciliation fix
  Status: Done (2026-05-22, merged via PR #279)
  Rationale: Follow-up production validation showed due-date reminders reconcile correctly; the merged hardening keeps reminder discovery/queueing RLS-safe and paginates verified-recipient scanning so production reminder dispatch stays resilient as data grows.
  Dependencies: TASK-101, TASK-125, TASK-063, TASK-268
- ID: TASK-265
  Title: Notification actor attribution and self-notification rules
  Status: Done (2026-05-22, merged via PR #277)
  Rationale: Agent-authored assignment and mention notifications now carry agent-aware actor metadata and email/in-app copy so agent activity is not misattributed to the credential owner, while human self-notification suppression remains intact.
  Dependencies: TASK-123, TASK-124, TASK-127, TASK-227, TASK-260
- ID: TASK-272
  Title: Release version cadence and tagging - pre-1.0 product version policy
  Status: Done (2026-05-21, merged via PR #276)
  Rationale: Defined the lightweight pre-1.0 release-version policy, release PR checklist, changelog convention, and helper script so product versions move intentionally while build/revision metadata remains separate.
  Dependencies: TASK-042, TASK-116, TASK-132
- ID: TASK-271
  Title: Notification email delivery deduplication - suppress already-emailed unread notifications
  Status: Done (2026-05-21, merged via PR #275)
  Rationale: Suppressed repeated notification digest emails by making sent email items cover notification IDs permanently, while pending/dispatching groups still use current fingerprints for pre-delivery refreshes and future distinct notifications remain eligible.
  Dependencies: TASK-125, TASK-227, TASK-268
- ID: TASK-268
  Title: GitHub Actions notification email scheduler - 3-hour production bridge
  Status: Done (2026-05-19, merged via PR #271)
  Rationale: QStash activation created too much operational friction for the current stage, and Vercel remains on Hobby where Vercel Cron is daily-only. Added the protected GitHub Actions dispatcher as a temporary production scheduler bridge every 3 hours, keeping the app-owned durable queue/idempotency guarantees while explicitly downgrading the email delivery promise from sub-hour to periodic digest delivery.
  Dependencies: TASK-125, TASK-227
- ID: TASK-132
  Title: Version update system adjustments - align version metadata, automation, and release communication
  Status: Done (2026-05-20, merged via PR #270)
  Rationale: Aligned app version metadata, dependency-update cadence, deployment visibility, and user-facing version display by making `package.json` the canonical product-version source and passing deterministic build metadata through Vercel deploy workflows.
  Dependencies: TASK-041, TASK-042, TASK-116
- ID: TASK-228
  Title: QStash notification email scheduler activation - production cadence and smoke validation
  Status: Superseded (2026-05-19, replaced by TASK-268)
  Rationale: QStash stayed a valid managed-scheduler option, but the account/token setup created too much operational friction for the current stage. The active production scheduler path moved to the GitHub Actions 3-hour bridge in TASK-268; future cost-aware scheduler improvement is now tracked by TASK-273.
  Dependencies: TASK-125, TASK-227
- ID: TASK-267
  Title: Notification task handoff briefs
  Status: Done (2026-05-17, merged via PR #265)
  Rationale: Added dedicated handoff briefs for TASK-228, TASK-265, and TASK-226 so future sessions can start from explicit product intent, architecture boundaries, acceptance criteria, and validation plans.
  Dependencies: TASK-228, TASK-265, TASK-226
- ID: TASK-260
  Title: Email-only notification digests - keep in-app notifications atomic
  Status: Done (2026-05-16, merged via PR #262)
  Rationale: Production smoke confirmed email grouping works, but in-app notification awareness must not present several unread items as one grouped notification. Kept one in-app notification per action/artifact while leaving recipient/project email digest grouping, debounce, and max-delay behavior in the email orchestration layer.
  Dependencies: TASK-123, TASK-125, TASK-227
- ID: TASK-259
  Title: Production DB project-ref guardrails - prevent runtime/database environment drift
  Status: Done (2026-05-16, merged via PR #261)
  Rationale: Added fail-fast validation and runbook guidance so `DATABASE_URL`, `DIRECT_URL`, and `SUPABASE_URL` cannot silently drift across Supabase project refs in production after a runtime database target incident.
  Dependencies: TASK-258
- ID: TASK-258
  Title: Production DB session pool exhaustion - serverless-safe Supabase runtime pooling
  Status: Done (2026-05-15, merged via PR #259)
  Rationale: Hardened the runtime env contract and validation so Vercel/serverless runtime traffic uses the Supabase transaction pooler while direct migration/admin traffic stays on the direct endpoint.
  Dependencies: TASK-022, TASK-125, TASK-227
- ID: TASK-227
  Title: Production-grade notification email orchestration - debounce, grouping, and scheduler refactor
  Status: Done (2026-05-14, merged via PR #254)
  Rationale: Refactored project notification email dispatch into durable recipient/project grouped orchestration with debounce, max-delay, concurrency-safe claims, idempotent delivery recording, protected dispatch endpoint, and invitation reminder support. The current production trigger is the TASK-268 GitHub Actions bridge; cadence improvement is tracked by TASK-273.
  Dependencies: TASK-123, TASK-125, TASK-225
- ID: TASK-225
  Title: Project notification email digests - grouped, rate-limited outbound summaries
  Status: Done (2026-05-12, merged via PR #246)
  Rationale: Extended the notification center foundation with project-grouped outbound email digest support; TASK-227 replaced the initial workaround-shaped scheduling/orchestration path with production-grade dispatch semantics.
  Dependencies: TASK-123, TASK-125
- ID: TASK-104
  Title: Invite email delivery - app-managed sending for project collaboration invites
  Status: Done (2026-05-08, merged via PR #245)
  Rationale: Added app-managed project invitation email delivery on top of the reusable outbound email foundation, with owner-visible delivery feedback, active-invitation resend, copy-link fallback preservation, safe outbound metadata, trusted-origin invite URLs, live smoke validation for email-only and matched-account recipients, green PR checks, and resolved Copilot feedback.
  Dependencies: TASK-103, TASK-083, TASK-125
- ID: TASK-125
  Title: Outbound email foundation - reusable app-owned email delivery for invites and future notifications
  Status: Done (2026-05-07, merged via PR #243)
  Rationale: Established a reusable Resend-backed outbound email foundation with typed template keys, sender/delivery-mode env config, durable `OutboundEmailDelivery` observability records, provider-safe failure handling, verification/password-reset integration, future project-invitation template support, and live email smoke validation.
  Dependencies: TASK-083
- ID: TASK-127
  Title: API capability audit - confirm every shipped feature remains fully manageable through the API
  Status: Done (2026-05-07, merged via PR #241)
  Rationale: Audited shipped app features against API coverage, documented the parity matrix, and closed session-user API gaps for project list/create, account profile/security, Google Calendar target settings, notification read state, mark-all-read, pending invitations, and invitation responses while preserving the existing project-scoped agent API boundary.
  Dependencies: TASK-107, TASK-115, TASK-128
- ID: TASK-214
  Title: Task and card focus border consistency
  Status: Done (2026-05-06, merged via PR #239)
  Rationale: Aligned task creation, task edit, context-card creation, and context-card edit focus borders around the title-field treatment, keeping focus paint inside field boxes so dark-theme borders no longer appear clipped.
  Dependencies: TASK-010, TASK-011
- ID: TASK-217
  Title: Mention notification open route
  Status: Done (2026-05-06, merged via PR #238)
  Rationale: Fixed mention notification `Open` links by targeting the project dashboard task modal with `taskId` and `commentId` query parameters, plus a redirect for stale nested task links.
  Dependencies: TASK-124
- ID: TASK-223
  Title: Mention highlighting and keyboard navigation consistency
  Status: Done (2026-05-06, merged via PR #236)
  Rationale: Unified mention highlight styling across comments and task descriptions and aligned modified ArrowLeft navigation around highlighted task-description mentions with the comment input behavior.
  Dependencies: TASK-124
- ID: TASK-131
  Title: Local validation baseline repair - reproducible container, database, and toolchain setup
  Status: Done (2026-05-06, merged via PR #235)
  Rationale: Added the repo-owned local validation baseline with a pinned Node contract, Docker Compose PostgreSQL, local DB helpers, `npm run validate:local`, and README/runbook documentation for install, Prisma, tests, coverage, build, Playwright, and app-container validation.
  Dependencies: TASK-041, TASK-067
- ID: TASK-124
  Title: Comment mentions - project-member @tagging with notification-center delivery
  Status: Done (2026-05-04, merged via PR #211)
  Rationale: Added project-member `@` mention tagging in task comments with autocomplete, highlighted mention rendering, and notification-center delivery so task discussion can pull collaborators into the right thread from inside the product.
  Dependencies: TASK-058, TASK-099, TASK-123
- ID: TASK-126
  Title: Comment reactions - lightweight emoji response system on task threads
  Status: Done (2026-05-01, merged via PR #213)
  Rationale: Added lightweight emoji reactions on task comments so collaborators can acknowledge, support, or quickly respond without posting extra text, with toggle semantics, grouped display with counts, and persisted database storage.
  Dependencies: TASK-099
- ID: TASK-123
  Title: Notification center - unified in-app inbox for invitations, mentions, and future activity
  Status: Done (2026-04-29)
  Rationale: Added a durable per-user notification backend with recipient-scoped persistence, unread/read and resolved lifecycle, invitation notification delivery/resolution, a `/account/notifications` review surface, notification-aware account menu counts, and a reusable foundation for future mention/activity producers.
  Dependencies: TASK-058, TASK-103
- ID: TASK-130
  Title: Roadmap v2 - milestone phases, grouped events, and editable timeline layout
  Status: Done (2026-04-23)
  Rationale: Rebuilt the Roadmap section around milestone phases plus grouped child events, preserved shipped roadmap data through migration, added direct phase/event editing with drag-and-drop sequencing, and validated the grouped roadmap flow against a deployed preview using Playwright.
  Dependencies: TASK-106, TASK-096, TASK-091
- ID: TASK-106
  Title: Project roadmap feature - milestone/timeline visibility for better execution sight
  Status: Done (2026-04-23)
  Rationale: Added a dedicated project `Roadmap` section with standalone manual milestones, visual sequencing, and intentionally distinct desktop/mobile timeline treatments so teams can communicate project direction without coupling the first release to tasks or epics yet.
  Dependencies: TASK-076, TASK-079, TASK-096
- ID: TASK-128
  Title: Task assignee quick action from task options menu
  Status: Done (2026-04-23)
  Rationale: Completed the task options menu assignee quick-action flow so collaborators can assign or clear task ownership during daily execution without switching into full edit mode, while preserving the shipped `TASK-101` assignee validation and task update boundaries.
  Dependencies: TASK-101, TASK-079
- ID: TASK-107
  Title: Project epics and task epic flags
  Status: Done (2026-04-23)
  Rationale: Completed first-class project epics as dedicated planning entities, with one optional epic flag per task, so teams can group execution work under visible initiatives without turning epics into pseudo-tasks or weakening Kanban clarity.
  Dependencies: TASK-079, TASK-095
- ID: TASK-101
  Title: Task ownership and provenance - created-by visibility, assignee model, and task activity attribution
  Status: Done (2026-04-21, merged via PR #193 into PR #192)
  Rationale: Added task-level ownership/provenance across schema, services, APIs, and Kanban surfaces so collaborators can see who created a task, who is assigned, and who last updated it, with avatar-backed UI and durable attribution for future filtering and notification workflows.
  Dependencies: TASK-058, TASK-076, TASK-079
- ID: TASK-089
  Title: Automatic avatar creation - generated identity avatar baseline
  Status: Done (2026-04-21, merged via PR #192)
  Rationale: Added a generated avatar baseline with account regeneration support so users without uploaded photos still have a stable visual identity across collaboration and account surfaces.
  Dependencies: TASK-047, TASK-082
- ID: TASK-099
  Title: Task comments - project-scoped discussion thread on tasks
  Status: Done (2026-04-20, merged via PR #180)
  Rationale: Added project-scoped task discussion threads with append-only, chronological, author-attributed comments in task detail, lightweight board-level comment visibility, API/service coverage, and merged the rollout through PR `#180`.
  Dependencies: TASK-076, TASK-079
- ID: TASK-117
  Title: Deadline feature - due dates, urgency visibility, and reminder-ready planning hooks
  Status: Done (2026-04-19, merged via PR #178)
  Rationale: Added first-class task deadline tracking across schema, service/API contracts, Kanban create/edit/read surfaces, board-level urgency visibility, and agent/OpenAPI documentation, then merged the rollout through PR `#178`.
  Dependencies: TASK-076, TASK-079, TASK-096
- ID: TASK-105
  Title: Convex migration assessment - fit, tradeoffs, and migration risk review
  Status: Done (2026-04-17)
  Rationale: Completed a repo-specific reassessment of the current PostgreSQL/Prisma baseline against Convex, reviewed the implemented architecture plus official Convex/Supabase documentation, recorded the recommendation to keep the current stack for now, and merged the durable assessment/decision through PR `#176`.
  Dependencies: TASK-056, TASK-057, TASK-085
- ID: TASK-091
  Title: Mobile UI adaptation - responsive layout and interaction polish
  Status: Done (2026-04-15)
  Rationale: Delivered the baseline mobile responsive pass across the priority surfaces, improved small-screen layout safety and modal behavior, validated the main flows with focused mobile QA evidence, and merged the task through PR `#175`.
  Dependencies: TASK-012, TASK-024
- ID: TASK-122
  Title: Dependabot repair cadence - scheduled full-backlog drain with bounded parallelism
  Status: Done (2026-04-14)
  Rationale: Aligned the weekly Dependabot repair lane with the intended operating model by letting scheduled runs scan the full eligible red-PR backlog, preserving manual targeted controls, bounding execution with explicit matrix parallelism, and validating the rollout through merged PR `#174`.
  Dependencies: TASK-120, TASK-116
- ID: TASK-051
  Title: Security baseline phase 3 - verification, retest, and closure report
  Status: Done (2026-04-13)
  Rationale: Confirmed that the TASK-050 remediation still closes the top-ranked TASK-049 findings on the current repo baseline, recorded explicit evidence plus environment blockers, corrected the local Node prerequisite docs, and closed the security-baseline verification/reporting pass.
  Dependencies: TASK-050
- ID: TASK-120
  Title: Dependabot repair-lane follow-up - precise labeling and resilient superseding PR creation
  Status: Done (2026-04-13)
  Rationale: Completed the TASK-116 follow-up by making Dependabot labels track real PR health, widening the repair scanner beyond stale labels, moving Copilot repair artifacts into the repo so superseding-PR creation can complete again, and validating the rollout through merged PR `#167`.
  Dependencies: TASK-116, TASK-061, TASK-041
- ID: TASK-050
  Title: Security baseline phase 2 - high-priority remediation sprint
  Status: Done (2026-04-10)
  Rationale: Completed the top-ranked security remediation slice by adding DB-backed abuse controls across public auth and agent-token entry points, moving human sessions to hashed-at-rest lookup semantics with explicit legacy invalidation, and enforcing current credential liveness during agent bearer-token use.
  Dependencies: TASK-048, TASK-049, TASK-043
- ID: TASK-116
  Title: Dependabot and CI automation - workflow hygiene, safe auto-merge, and bounded red-PR repair agent
  Status: Done (2026-04-09)
  Rationale: Completed the Dependabot operating model end to end by keeping safe lanes auto-mergeable after full CI, validating the weekly Copilot repair lane on live red PRs, automatically producing green repo-owned superseding PRs, and closing the original Dependabot PRs to preserve a single review surface.
  Dependencies: TASK-038, TASK-041, TASK-042, TASK-061
- ID: TASK-049
  Title: Security baseline phase 1 - OWASP-focused assessment and threat model
  Status: Done (2026-04-09)
  Rationale: Completed the OWASP-focused security assessment and threat model, refreshed it against the merged dependency/workflow baseline, and produced the ranked remediation scope that now feeds TASK-050.
  Dependencies: TASK-020, TASK-039
- ID: TASK-061
  Title: Dependency security baseline - vulnerability remediation and scan cadence definition
  Status: Done (2026-04-04)
  Rationale: Remediated the repo's actionable npm dependency vulnerabilities, added scheduled dependency-security automation plus weekly Dependabot coverage, carried the required Next.js 15 compatibility migration, resolved Copilot review feedback, and restored a fully green PR by tightening a flaky project-creation Playwright assertion exposed during follow-up CI.
  Dependencies: TASK-038
- ID: TASK-048
  Title: Authentication implementation phase 4 - auth tests and hardening
  Status: Done (2026-04-04)
  Rationale: Closed the auth hardening pass with signed-in verification-link mismatch protection, broader auth redirect normalization coverage, production-only verification enforcement failure handling, green CI/preview validation, and final manual validation.
  Dependencies: TASK-046, TASK-047, TASK-058, TASK-059
- ID: TASK-059
  Title: Agent access implementation - scoped API tokens, rotation, and audit trail
  Status: Done (2026-04-04)
  Rationale: Delivered owner-managed, project-scoped agent credentials with exchange, scoped bearer-token enforcement, audit visibility, onboarding/docs support, and merged preview-validated rollout coverage.
  Dependencies: TASK-046, TASK-076
- ID: TASK-115
  Title: Agent onboarding v1 - hosted docs, OpenAPI surface, and in-app setup UX
  Status: Done (2026-04-04)
  Rationale: Delivered a hosted agent onboarding experience with rendered docs, a versioned OpenAPI contract, account-level developer entry points, project-level bootstrap guidance, and external-agent-driven refinements around JSON-first writes, binary upload documentation, lifecycle examples, and copy-paste-safe status guidance.
  Dependencies: TASK-059, TASK-082
- ID: TASK-113
  Title: Rich content readability polish - code formatting, compact token fields, focus-only emoji affordance, and improved Kanban previews
  Status: Done (2026-03-27)
  Rationale: Added lightweight rich-text code/token blocks with compact copyable rendering, moved emoji field chrome to focus-only visibility, improved Kanban rich-text preview summarization, addressed Copilot follow-up feedback with renderer safeguards/tests, and validated the task locally plus through PR #111 checks.
  Dependencies: TASK-094, TASK-096, TASK-111
- ID: TASK-111
  Title: Context card presentation refinement - adaptive card sizing and rich-content support
  Status: Done (2026-03-27)
  Rationale: Upgraded context cards to the shared sanitized rich-text model, improved mixed-length card sizing and preview density, preserved attachment workflows, and aligned create/edit/preview rendering so richer project notes fit the dashboard more naturally.
  Dependencies: TASK-004, TASK-094, TASK-096
- ID: TASK-112
  Title: Attachment link entry polish - add-icon affordance and Enter-to-add across task/context flows
  Status: Done (2026-03-27)
  Rationale: Delivered a lighter attachment-link composer across task/context create-edit flows with add-oriented affordances, Enter-to-add support, resolved Copilot review follow-up, green validation, and preview deployment before merge via PR #109.
  Dependencies: TASK-026, TASK-027, TASK-033
- ID: TASK-103
  Title: Project sharing v2 - email-bound invites for non-existing users and copyable invite-link delivery
  Status: Done (2026-03-24)
  Rationale: Extended collaboration invites so owners can invite verified-email recipients before they have an account, kept acceptance bound to the intended verified identity, shipped copyable invite-link delivery plus resumable sign-in/sign-up/verify flows, and enforced safe replacement/revoke/expiry/replay behavior with matching pending invites appearing automatically once the invited account exists.
  Dependencies: TASK-058, TASK-083, TASK-102
- ID: TASK-058
  Title: Authorization implementation - project sharing, membership roles, and invitations
  Status: Done (2026-03-23)
  Rationale: Delivered project sharing v1 with owner-managed invites for existing verified users, member role management, recipient invitation visibility, role-aware project surfaces, and production validation through the merged rollout path.
  Dependencies: TASK-046, TASK-047, TASK-076
- ID: TASK-096
  Title: Project dashboard UI polish - hierarchy, section rhythm, and Kanban lane clarity
  Status: Done (2026-03-17)
  Rationale: Refreshed the project workspace hierarchy and section chrome, tightened dashboard stats and calendar status treatment, improved Kanban lane scanning, fixed context-modal stacking above dashboard chrome, and merged the task into `main` through the integration path that superseded PR #96.
  Dependencies: TASK-078, TASK-079, TASK-093, TASK-094, TASK-095
- ID: TASK-095
  Title: Related tasks - symmetric task linking with hover highlight
  Status: Done (2026-03-19)
  Rationale: Added project-scoped symmetric related-task links across task create/edit flows, validated relationship constraints in the service/API layer, kept related links visible from task detail state, and highlighted connected tasks during Kanban hover interactions.
  Dependencies: TASK-076, TASK-079
- ID: TASK-087
  Title: Product metadata surface - repository link and running version visibility
  Status: Done (2026-03-19)
  Rationale: Added an in-app metadata pill that exposes the repository link plus the running version/revision summary, with environment-aware normalization for repository URL and version labeling.
  Dependencies: TASK-041, TASK-042
- ID: TASK-068
  Title: Authentication provider rollout - phase social providers (Google/GitHub) after baseline email auth
  Status: Done (2026-03-19)
  Rationale: Delivered Google and GitHub social sign-in/sign-up flows on top of the existing session model, including provider init/callback routes, account linking/user creation rules, home-page auth refresh, and automated coverage for provider routing and account resolution.
  Dependencies: TASK-047
- ID: TASK-085
  Title: PostgreSQL hardening - enable RLS policies with staged rollout (staging then production)
  Status: Done (2026-03-11)
  Rationale: Enabled PostgreSQL Row-Level Security on the protected project/user table set, validated the staged rollout in preview, promoted `FORCE ROW LEVEL SECURITY` to production, documented rollback handling, and confirmed production behavior remained healthy.
  Dependencies: TASK-046, TASK-067, TASK-076
- ID: TASK-093
  Title: Task lifecycle UX - manual archive action for done tasks
  Status: Done (2026-03-11)
  Rationale: Added explicit archive and unarchive actions for done tasks, aligned the task options UI, and updated the task detail state treatment so manual archiving fits the existing lifecycle cleanly.
  Dependencies: TASK-046, TASK-076, TASK-079
- ID: TASK-094
  Title: Text input UX - emoji picker/button across text fields
  Status: Done (2026-03-11)
  Rationale: Added a reusable emoji picker/button across supported text-entry surfaces, then iterated on the in-field placement, search, icon-only trigger, compact popover layout, emoji rendering consistency, and theme-aware visual polish until preview behavior and UX were clean.
  Dependencies: TASK-078, TASK-079
- ID: TASK-086
  Title: Account page adjustment - email change verification flow, compact layout, and settings navigation
  Status: Done (2026-02-28)
  Rationale: Completed account self-service adjustments with verified email-change flow, denser account-page organization, and improved settings navigation placement to keep the page clearer and more practical in daily use.
  Dependencies: TASK-082, TASK-083
- ID: TASK-084
  Title: Password recovery lifecycle - forgot-password request, reset token flow, and secure password rotation
  Status: Done (2026-02-28)
  Rationale: Delivered end-to-end password recovery with forgot-password request flow, hashed single-use reset tokens, expiry/replay protection, reset-password UX/actions, password rotation, and session revocation; hardened origin/token handling after review and merged via PR #71.
  Dependencies: TASK-046, TASK-083
- ID: TASK-083
  Title: Email verification lifecycle - signup verification tokens, confirmation route, and guarded session state
  Status: Done (2026-02-27)
  Rationale: Added one-click verification lifecycle for credentials users with hashed single-use TTL tokens, guarded-session access enforcement for unverified accounts, `/verify-email` status + resend UX, production-gated transactional email delivery, and callback validation with replay/expiry handling.
  Dependencies: TASK-047, TASK-081
- ID: TASK-082
  Title: Account profile phase 2 - account page and user-menu identity UX
  Status: Done (2026-02-26)
  Rationale: Added authenticated `/account` self-service for username/password updates, enforced backend validation + current-password verification, implemented session revocation for all other sessions after password changes, and updated account menu identity UX with `Welcome <username>!`, `Account`, `Settings`, and `Log out`.
  Dependencies: TASK-080, TASK-081
- ID: TASK-081
  Title: Account identity phase 1 - username onboarding, discriminator, and signup password confirmation
  Status: Done (2026-02-26)
  Rationale: Added username onboarding + confirm-password validation in sign-up flow, introduced persisted username identity fields (`username`, `usernameDiscriminator`) with uniqueness constraints/migration, implemented collision-safe discriminator generation with retry handling, and exposed full `username#suffix` identity in account-menu context while preserving `user.id` as the sole authorization identifier.
  Dependencies: TASK-047
- ID: TASK-047
  Title: Authentication implementation phase 3 - home-page auth entry and account onboarding UX
  Status: Done (2026-02-25)
  Rationale: Delivered signed-out homepage auth entry (`Sign in` / `Sign up`) with credentials onboarding, secure DB-backed session creation, and authenticated redirect behavior to `/projects`; validated via CI/Copilot/preview and merged through PR #54.
  Dependencies: TASK-046
- ID: TASK-046
  Title: Authentication implementation phase 2 - auth core and route protection
  Status: Done (2026-02-23)
  Rationale: Implemented auth runtime guardrails across protected pages/APIs with server-validated sessions, added regression coverage, passed CI/Copilot/preview gates, and merged to main via PR #52.
  Dependencies: TASK-045, TASK-076
- ID: TASK-080
  Title: Account settings - per-user Google Calendar target configuration
  Status: Done (2026-02-23)
  Rationale: Added `/account/settings` with per-user calendar target save/reset (`primary` default), introduced authenticated account menu + logout endpoint, validated CI/Copilot/preview gates, and wired calendar target normalization/fallback behavior end to end.
  Dependencies: TASK-046, TASK-076
- ID: TASK-076
  Title: Multi-user data/storage/integration boundary transition - principal-scoped DB access, R2 ownership isolation, and user-scoped Google Calendar
  Status: Done (2026-02-23)
  Rationale: Delivered principal-aware ownership boundaries across DB services/routes, attachment storage key/metadata checks, and per-user Google Calendar credential flows; PR checks passed, Copilot review threads resolved, and manual preview deployment validated.
  Dependencies: TASK-020, TASK-045, TASK-065, TASK-060
- ID: TASK-079
  Title: Projects page edit/delete safety UX - gated save action, contextual options menu, and double-click edit activation
  Status: Done (2026-02-22)
  Rationale: Reworked project cards to non-editable-by-default with explicit edit mode (options menu + double-click activation), showed save action only for dirty state, and added confirm-gated project deletion to reduce accidental destructive mutations.
  Dependencies: TASK-078, TASK-077, TASK-012
- ID: TASK-078
  Title: UX polish phase 1 - context/task interaction model, options menus, confirmation flows, and modal visual bug fix
  Status: Done (2026-02-22)
  Rationale: Introduced contextual options menus for context cards and task modal actions, safer deletion confirmations, task move controls, double-click edit gestures, and fixed modal overflow/top-edge visual issues.
  Dependencies: TASK-062, TASK-071, TASK-072, TASK-075
- ID: TASK-077
  Title: Mutation/upload UX smoothing - global toast queue, finite async feedback, and removal of persistent inline background status text
  Status: Done (2026-02-22)
  Rationale: Replaced persistent inline background mutation text with a global FIFO toast queue and standardized success/failure feedback for create/update/delete/upload flows.
  Dependencies: TASK-078, TASK-071, TASK-075
- ID: TASK-020
  Title: Modern authentication/authorization ADR (user ownership, sharing, agent access, session model)
  Status: Done (2026-02-21)
  Rationale: Define a state-of-the-art authz/authn model covering user-owned projects, shareable collaboration, secure agent access, and persistent web sessions without repeated login prompts, including explicit signed-out home-page entry behavior (`Sign in`/`Sign up`), DB-backed user sessions, and JWT-style scoped agent/API tokens.
  Dependencies: TASK-035, TASK-039, TASK-040, TASK-057, TASK-060, TASK-062
- ID: TASK-045
  Title: Authentication implementation phase 1 - user/session data model and migrations
  Status: Done (2026-02-22)
  Rationale: Establish durable auth persistence primitives (Auth.js/Prisma-compatible user/account/session entities, revocation support, session lifecycle) before middleware/UI implementation.
  Dependencies: TASK-020, TASK-057
- ID: TASK-062
  Title: UI decomposition phase - split oversized dashboard components into focused modules
  Status: Done (2026-02-20)
  Rationale: Completed focused dashboard panel decomposition by extracting Kanban/context/calendar rendering-heavy surfaces into dedicated modules while preserving existing API contracts and user interactions.
  Dependencies: TASK-054, TASK-060
- ID: TASK-074
  Title: Project page performance - panel-level async loading and progressive hydration
  Status: Done (2026-02-20)
  Rationale: Split `/projects/[projectId]` into lightweight shell + panel-level async server sections with progressive Suspense fallbacks, preserving not-found behavior and existing panel interaction contracts while improving perceived load speed.
  Dependencies: TASK-073
- ID: TASK-073
  Title: Projects dashboard entry performance - async project list loading and instant shell
  Status: Done (2026-02-20)
  Rationale: Split `/projects` into immediate shell + streamed grid (`Suspense` fallback), added route-level loading skeleton, and removed over-eager forced prefetch on dynamic routes after review.
  Dependencies: TASK-039, TASK-042
- ID: TASK-072
  Title: Mutation responsiveness pass - reduce blocking waits on create/save interactions
  Status: Done (2026-02-20)
  Rationale: Shifted task/context-card create-save flows to non-blocking UX with background mutation status feedback, plus unmount-safe async guards and accessible live-region announcements.
  Dependencies: TASK-071
- ID: TASK-075
  Title: Context-card attachment parity - direct-to-R2 create flow + shared background uploader
  Status: Done (2026-02-20)
  Rationale: Aligned context-card create with task-create direct R2 strategy, added a shared background upload helper, and standardized provider-aware size validation plus progress feedback.
  Dependencies: TASK-065, TASK-071
- ID: TASK-071
  Title: Smooth upload/creation UX - non-blocking task creation and background attachment uploads
  Status: Done (2026-02-19)
  Rationale: Implemented background R2 uploads for task creation, added progress/error feedback, reduced modal upload blocking, and fixed overlay sizing behavior to prevent top white-bar artifacts.
  Dependencies: TASK-070
- ID: TASK-070
  Title: Attachment uploads phase 2 - direct-to-R2 upload pipeline (serverless-safe)
  Status: Done (2026-02-19)
  Rationale: Eliminated Vercel request-body limits (`413 FUNCTION_PAYLOAD_TOO_LARGE`) by moving file transfer off app API routes to a direct upload flow (pre-signed upload URL + finalize metadata endpoint), with hardened error mapping and modal overlay rendering fixes.
  Dependencies: TASK-065, TASK-069
- ID: TASK-069
  Title: Cloudflare R2 storage validation - end-to-end smoke and deployment readiness
  Status: Done (2026-02-18)
  Rationale: Validated R2-backed attachment lifecycle across task and context-card flows (upload, signed-download redirect mode, delete + DB removal + storage read-miss), and added a gated reproducible smoke test (`R2_SMOKE=1`) for future verification.
  Dependencies: TASK-065, TASK-066
- ID: TASK-067
  Title: Database connection hardening - pooler/direct split, credential hygiene, and runbook
  Status: Done (2026-02-18)
  Rationale: Added production DB runtime guardrails (remote TLS enforcement, pooler/direct endpoint split checks, Supabase endpoint sanity rules), extended env runtime tests for edge cases, and documented credential/rotation runbook.
  Dependencies: TASK-066
- ID: TASK-043
  Title: Deployment baseline phase 5 - observability minimum viable stack
  Status: Done (2026-02-17)
  Rationale: Added liveness/readiness endpoints, request-id propagation middleware, and structured server logging with targeted hardening (request-id validation, metadata Error serialization, bounded upstream error payload logging, readiness timeout) plus regression coverage.
  Dependencies: TASK-042
- ID: TASK-065
  Title: Attachment storage migration - StorageProvider abstraction + Cloudflare R2 object storage
  Status: Done (2026-02-17)
  Rationale: Introduced provider-based attachment storage with local and Cloudflare R2 implementations, signed URL redirect download path, env/docs/test updates, and key uniqueness hardening for concurrent uploads.
  Dependencies: TASK-039, TASK-040
- ID: TASK-066
  Title: Configuration/secrets hardening gate before production rollout
  Status: Done (2026-02-17)
  Rationale: Strengthened startup fail-fast runtime validation, enforced production `DIRECT_URL` requirement, and expanded coverage for env guardrails across auth/storage/database configuration.
  Dependencies: TASK-040
- ID: TASK-042
  Title: Deployment baseline phase 4 - CD deployment and rollback strategy
  Status: Done (2026-02-17)
  Rationale: Added Vercel CLI staged production deploy workflow with manual promote/rollback operations, deployment artifacts, and validation checks.
  Dependencies: TASK-041, TASK-066
- ID: TASK-041
  Title: Deployment baseline phase 3 - CI pipeline for build/test/image
  Status: Done (2026-02-16)
  Rationale: Extended CI with a dedicated container-image gate that runs after quality + E2E checks, validates Docker build reproducibility (`npm ci`), and publishes image metadata artifacts for traceable pre-deploy verification.
  Dependencies: TASK-040
- ID: TASK-040
  Title: Deployment baseline phase 2 - secrets and configuration management
  Status: Done (2026-02-16)
  Rationale: Centralized server configuration access in `lib/env.server.ts` (required/optional env readers, runtime mode checks, DB fallback, Supabase pair validation), migrated core server env reads to this module, added env guardrail tests, and documented the configuration baseline in README.
  Dependencies: TASK-039
- ID: TASK-039
  Title: Deployment baseline phase 1 - runtime target and exposure model
  Status: Done (2026-02-16)
  Rationale: Confirmed Vercel as deployment runtime target and adopted a public-exposure model secured by application-layer auth/authz (no trusted-IP allowlist dependency), with blob storage migration tracked explicitly as a deployment prerequisite.
  Dependencies: TASK-019
- ID: TASK-060
  Title: Boundary enforcement pass - explicit module ownership and layering rules
  Status: Done (2026-02-16)
  Rationale: Enforced service-layer ownership for persistence by extracting project/dashboard and Google credential DB operations into dedicated services, then codified dependency guardrails with ESLint restrictions that block direct `@/lib/prisma` imports outside `lib/services/**`.
  Dependencies: TASK-035, TASK-038
- ID: TASK-038
  Title: Validation suite phase 3 - CI quality gates
  Status: Done (2026-02-16)
  Rationale: Added CI quality-gates workflow that enforces lint/test/coverage/build and Playwright smoke checks on pull requests and `main`, with PostgreSQL-backed E2E isolation and failure artifact upload.
  Dependencies: TASK-036, TASK-037
- ID: TASK-006
  Title: Full validation suite after refinement pass
  Status: Done (Epic completed via TASK-036/TASK-037/TASK-038 on 2026-02-16)
  Rationale: Completed validation stack across API contracts, critical UI smoke journeys, and CI enforcement gates to reduce regression risk before upcoming architecture/auth/security work.
  Dependencies: TASK-038
- ID: TASK-037
  Title: Validation suite phase 2 - critical UI/E2E smoke flows
  Status: Done (2026-02-16)
  Rationale: Added Playwright-based smoke coverage for high-value UI journeys (project creation/navigation, task lifecycle with attachment interactions, calendar panel interaction states) with reusable test helpers and deterministic selectors.
  Dependencies: TASK-036
- ID: TASK-036
  Title: Validation suite phase 1 - API regression contracts
  Status: Done (2026-02-16)
  Rationale: Expanded route-level contract coverage to auth bootstrap/callback and project attachment endpoints (task + context-card create/delete/download), ensuring consistent error mapping and response contracts before auth/security/deployment changes.
  Dependencies: TASK-034
- ID: TASK-057
  Title: Database migration phase 1 - SQLite to PostgreSQL parity migration
  Status: Done (2026-02-15)
  Rationale: Switched Prisma datasource to PostgreSQL with repository-owned baseline migration, archived legacy SQLite migrations for traceability, and validated runtime/build/test/docker flows against Supabase-backed configuration without introducing auth/user model changes.
  Dependencies: TASK-056, TASK-055
- ID: TASK-056
  Title: Data platform ADR - PostgreSQL baseline and Supabase fit assessment
  Status: Done (2026-02-15)
  Rationale: Selected PostgreSQL as the persistence baseline and Supabase-managed Postgres as the default hosting target, with explicit guardrails to keep Prisma schema/migrations provider-agnostic and avoid premature platform coupling.
  Dependencies: TASK-035
- ID: TASK-055
  Title: Boundary refactor phase 3 - unify mutation boundaries across server actions and API routes
  Status: Done (2026-02-15)
  Rationale: Standardized project/task/context-card create/update/delete mutations on API routes and removed legacy project server-action mutation file; client mutation UI now targets one boundary contract per use case.
  Dependencies: TASK-053, TASK-054
- ID: TASK-054
  Title: Boundary refactor phase 2 - decompose oversized client panels into modules/hooks
  Status: Done (2026-02-15)
  Rationale: Extracted panel-specific utility modules (kanban/context/calendar), split calendar date-time picker into a dedicated component, and introduced a shared project-section expansion hook used across Kanban, Context, and Calendar panels.
  Dependencies: TASK-053
- ID: TASK-053
  Title: Boundary refactor phase 1 - extract backend application service layer
  Status: Done (2026-02-15)
  Rationale: Extracted shared backend service modules for task/context-card/attachment/calendar flows and converted server actions plus API routes into thin adapters with preserved response contracts.
  Dependencies: TASK-035
- ID: TASK-052
  Title: Git governance baseline (protected main + short-lived branch workflow + PR gates)
  Status: Done (2026-02-15)
  Rationale: Governance workflow is defined and documented in-repo (`agent.md` + workflow checks); GitHub protection enforcement is queued for repo-public milestone.
  Dependencies: TASK-035
- ID: TASK-035
  Title: Architecture audit baseline (system boundaries, risks, and technical debt)
  Status: Done (2026-02-15)
  Rationale: Produced a concrete architecture snapshot and risk assessment, then aligned on targeted medium boundary refactor + staged PostgreSQL migration + modern auth/share/agent roadmap.
  Dependencies: TASK-034
- ID: TASK-034
  Title: API route integration tests and coverage expansion
  Status: Done (2026-02-13)
  Rationale: Validate real request/response contracts and error mapping across API routes to catch regressions that unit tests alone may miss.
  Dependencies: TASK-028
- ID: TASK-028
  Title: Test writing and coverage
  Status: Done (2026-02-13)
  Rationale: Establish automated tests and measurable coverage to prevent regressions across core workflows.
  Dependencies: TASK-026
- ID: TASK-033
  Title: Attachment workflow fluidity on create/edit
  Status: Done (2026-02-13)
  Rationale: Allow Enter-to-add for link attachments and keep create/edit modal open so users can add multiple attachments in one flow.
  Dependencies: TASK-026, TASK-027
- ID: TASK-032
  Title: Calendar event creation and edit
  Status: Done (2026-02-13)
  Rationale: Extend current read-only calendar integration so events can be created and edited directly from NexusDash.
  Dependencies: TASK-005
- ID: TASK-005
  Title: Google auth and calendar integration
  Status: Done (2026-02-13)
  Rationale: Enables calendar events visibility directly in NexusDash.
  Dependencies: TASK-004
- ID: TASK-029
  Title: File preview for attachment files (image, PDF)
  Status: Done (2026-02-13)
  Rationale: Allow quick in-app preview for supported file types without forcing immediate download.
  Dependencies: TASK-019
- ID: TASK-030
  Title: Traceable blocked follow-up timeline on Kanban cards
  Status: Done (2026-02-13)
  Rationale: Make blocked follow-up auditable by storing append-only updates where each entry shows its creation date/time.
  Dependencies: TASK-016
- ID: TASK-031
  Title: Multi-label Kanban card creation with Enter-to-add and autocomplete
  Status: Done (2026-02-13)
  Rationale: Improve task labeling by supporting multiple labels, Enter-to-add interactions, pastel auto-colors, and suggestions from existing labels.
  Dependencies: TASK-003, TASK-010
- ID: TASK-027
  Title: Attachment UI refinement with minimalist action icons
  Status: Done (2026-02-13)
  Rationale: Simplify attachment zones by using compact icon-first controls for link and file actions.
  Dependencies: TASK-026
- ID: TASK-025
  Title: Auto-close create-project modal on successful submit
  Status: Done (2026-02-13)
  Rationale: Keep create flow consistent with other modals by closing immediately after submission.
  Dependencies: TASK-012
- ID: TASK-026
  Title: Enable attachments during task/context card creation
  Status: Done (2026-02-13)
  Rationale: Attachment support should be available at creation-time, not only after opening edit mode.
  Dependencies: TASK-007, TASK-019
- ID: TASK-004
  Title: Project context panel with user-defined info cards
  Status: Done (2026-02-12)
  Rationale: Each project needs lightweight contextual information above Kanban that users can add/edit quickly.
  Dependencies: TASK-010
- ID: TASK-010
  Title: Task creation UX polish (modal close behavior + placement of "+ New task")
  Status: Done (2026-02-12)
  Rationale: Keep board compact by auto-closing create modal on submit, supporting outside-click close, and placing the trigger top-left under "Kanban board" to reserve right-side area for project context.
  Dependencies: TASK-008
- ID: TASK-011
  Title: App theming (light/dark mode toggle with persistence)
  Status: Done (2026-02-12)
  Rationale: Dark-only UI is not suitable in all lighting conditions; users need an accessible bright mode.
  Dependencies: TASK-003
- ID: TASK-012
  Title: Home page refinement (projects-first + create-project modal)
  Status: Done (2026-02-12)
  Rationale: Prioritize visibility of current projects and align project creation UX with task creation modal behavior, including outside-click close.
  Dependencies: TASK-002
- ID: TASK-013
  Title: Simplify Kanban column containers by removing dashed task-area borders
  Status: Done (2026-02-12)
  Rationale: Reduce visual noise inside columns and improve readability of task cards.
  Dependencies: TASK-003
- ID: TASK-014
  Title: Move task edit action to top-right icon near modal close control
  Status: Done (2026-02-12)
  Rationale: Keep task detail modal actions compact and aligned with expected edit affordances.
  Dependencies: TASK-009
- ID: TASK-015
  Title: Show blocked-state warning icon on tasks in Blocked column
  Status: Done (2026-02-12)
  Rationale: Blocked items should be immediately visible at scan-time without opening details.
  Dependencies: TASK-003
- ID: TASK-016
  Title: Add editable warning follow-up section for blocked task details
  Status: Done (2026-02-12)
  Rationale: Teams need a dedicated place to capture blocker context and follow-up notes when expanding blocked tasks.
  Dependencies: TASK-009
- ID: TASK-017
  Title: Auto-archive old Done tasks with Done-column archive dropdown
  Status: Done (2026-02-12)
  Rationale: Keep Done column focused by moving tasks older than 7 days into an archive list accessible from Done.
  Dependencies: TASK-003
- ID: TASK-007
  Title: Extend project context cards with optional document attachments/links
  Status: Done (2026-02-12)
  Rationale: Preserves original resource panel intent while building on user-defined info cards model.
  Dependencies: TASK-004
- ID: TASK-018
  Title: Task attachment architecture ADR (external links + file storage strategy)
  Status: Done (2026-02-12)
  Rationale: Task-level attachments need a clear storage strategy before implementation (local volume vs DB blobs vs object storage with signed URLs).
  Dependencies: TASK-007
- ID: TASK-019
  Title: Task attachments MVP (add links and file attachments per task)
  Status: Done (2026-02-12)
  Rationale: Users need to attach contextual URLs and files directly to tasks for execution continuity.
  Dependencies: TASK-018
- ID: TASK-024
  Title: Persist dashboard section expand/collapse state in localStorage
  Status: Done (2026-02-12)
  Rationale: Keep Project context and Kanban board in the user's preferred expanded/collapsed state across refreshes for smoother daily usage.
  Dependencies: TASK-004
