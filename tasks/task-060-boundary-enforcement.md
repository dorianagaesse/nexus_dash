# TASK-060 Boundary Enforcement Pass

## Goal
Translate architecture intent into enforceable, testable boundaries before authentication and authorization phases.

## Ownership Rules
- `lib/services/**`: owns direct database access (`@/lib/prisma`) and persistence-focused business operations.
- `app/api/**`: transport adapters only (request parsing, response mapping, status codes).
- `app/**` pages/actions and `components/**`: UI orchestration and interaction only; no direct ORM/database access.
- `lib/**` outside `lib/services/**`: shared utilities and domain helpers; no direct ORM access.

## Allowed Dependency Direction
1. `app/**`, `components/**` -> `lib/services/**` (allowed)
2. `app/api/**` -> `lib/services/**` (allowed)
3. `lib/services/**` -> `lib/**` utilities (allowed)
4. `app/**`, `components/**`, and non-service `lib/**` -> `@/lib/prisma` (forbidden)

## Enforcement Mechanism
- ESLint `no-restricted-imports` rules:
  - Block `@/lib/prisma` in `app/**` and `components/**`.
  - Block `@/lib/prisma` in `lib/**` except `lib/services/**`.
- CI quality gate runs lint, so violations fail pull requests.

## TASK-060 Implementation Notes
- Extracted project read/write DB access into `lib/services/project-service.ts`.
- Extracted Google credential persistence into `lib/services/google-calendar-credential-service.ts`.
- Updated adapters/pages to consume services instead of direct Prisma.
- Added service-level tests for Google credential persistence edge cases.
