# Implementation Plan: P5.3 Read-Only Platform Admin Dashboard

Build the platform control room: an Arabic, RTL `/admin` dashboard where the operator sees every platform team with its ERP subscription status, recent registrations, and live ERP-health indicator, degrading gracefully if the ERP service is down.

> [!NOTE]
> Paths below are repository-relative to the `smart-platform` repo root.
>
> Reconciled against `main` @ `1a5c5c4`: `main` already ships an `/admin` shell (`components/admin/AdminNav.tsx`, `pages/admin.tsx` hub with Revenue + Users entry points). This branch **integrates** the P5.3 dashboard into that shell instead of introducing a parallel navigation component — the standalone `components/admin/AdminNavigation.tsx` was removed during the rebase.

## User Review Required

> [!NOTE]
> This is Phase P5.3 (read-only dashboard). It establishes the `/admin` UI, `/api/admin/dashboard`, `/api/admin/tenants/[teamId]`, typed subscription normalization, and graceful ERP degradation. No mutation routes or revenue metrics are included in P5.3 (deferred to P5.4/P5.7).

## Proposed Changes

### 1. Data Models & Normalization

#### [NEW] `models/adminDashboard.ts`

- Define TypeScript types:
  - `AdminSubscriptionStatus = 'trial' | 'active' | 'expired' | 'cancelled' | 'unknown'`
  - `AdminTenantSubscription`: normalized subscription details (`status`, `planName`, `priceMonthly`, `startDate`, `endDate`, `extendedUntil`, `isTrial`, `daysRemaining`, `rawStatus`)
  - `AdminTenantRecord`: team metadata (`id`, `name`, `slug`, `domain`, `erpTenantId`, `erpSubdomain`, `erpLinkedAt`, `createdAt`, `memberCount`, `subscription`, `erpReachable`, `error`)
  - `AdminHealthStatus`: `{ ok: boolean; reachable: boolean; latencyMs?: number; statusCode?: number; error?: string }`
  - `AdminDashboardSummary`: `{ totalTeams: number; linkedTeams: number; activeSubscriptions: number; trialSubscriptions: number; expiredSubscriptions: number }`
  - `AdminDashboardPayload`: `{ generatedAt: string; summary: AdminDashboardSummary; health: AdminHealthStatus; tenants: AdminTenantRecord[]; recentRegistrations: AdminTenantRecord[] }`
- Implement pure normalization helpers:
  - `normalizeErpSubscription(raw: unknown)`: handles raw ERP envelope `{ subscription: { ... }, package?: { ... } }` and derives valid status / date expiration.
  - `deriveSubscriptionStatus(status?: string, endDate?: string | Date | null, isTrial?: boolean)`: classifies status with edge cases (e.g. `endDate < now` implies expired).
  - `toIso(value: unknown)`: parses an ERP datetime into an ISO-8601 UTC string; returns `null` (never throws) for unparseable input and pins offset-less values to UTC so classification is server-timezone independent.

### 2. Service Layer

#### [NEW] `lib/adminDashboard.ts`

- Query all platform `Team` records using Prisma with a strict select (`id`, `name`, `slug`, `domain`, `erpTenantId`, `erpSubdomain`, `erpLinkedAt`, `createdAt`, `_count: { select: { members: true } }`). Never select `erpAccessToken`, `erpApiUrl`, or credentials.
- Probe ERP health with a 3-second timeout (`/payments/methods` or `/platform/billing/subscriptions`), returning `{ ok, reachable, latencyMs?, statusCode?, error? }` without throwing.
- Fetch billing subscriptions per linked tenant via `Promise.allSettled` using `erp.getTenantBillingSubscription(env.erp.platformApiKey, team.erpTenantId)`, bounded to 5 concurrent rows and capped by a per-row `ERP_ROW_TIMEOUT_MS` (3s) `Promise.race` guard so a hung ERP socket cannot stall the whole dashboard.
- Fall back gracefully when ERP is unreachable / times out / fails, populating `subscription = null` and `erpReachable = false`. A per-row timeout maps to the distinct `erp-timeout` marker, not `erp-unavailable`.
- Build `summary` statistics and `recentRegistrations` (ordered by `createdAt desc`, top 5).
- Single tenant query helper `getAdminTenantById(teamId: string)`.

### 3. API Routes

#### [NEW] `pages/api/admin/dashboard.ts`

- Protected by `await requirePlatformAdmin(req, res)`.
- Method `GET` only (405 with `Allow: GET` for other methods).
- Returns 200 `{ data: AdminDashboardPayload }` even when ERP is down (`health.ok = false`).
- Error handling with `ApiError` / `apiErrorStatus` / `apiErrorMessage`.

#### [NEW] `pages/api/admin/tenants/[teamId].ts`

- Protected by `await requirePlatformAdmin(req, res)`.
- Method `GET` only.
- Returns 200 `{ data: AdminTenantRecord }`, 404 `Team not found`, or 422 for a malformed `teamId`.

### 4. Client SWR Hooks

#### [NEW] `hooks/useAdminDashboard.ts`

- SWR hook for `/api/admin/dashboard` returning `{ data, error, isLoading, mutate }`.

#### [NEW] `hooks/useAdminTenant.ts`

- SWR hook for `/api/admin/tenants/[teamId]` backing the tenant drill-down page.

### 5. UI

#### [MODIFY] `components/admin/AdminNav.tsx` (existing on `main` — extended, not replaced)

- Reuse `main`'s navigation bar for the `/admin` area (`نظرة عامة` / `المستخدمون` / `الإيرادات` / `سجل التدقيق`) and extend it with the `القواعد` (rules) entry, keeping the not-yet-shipped entries rendered as disabled/upcoming badges.

#### [NEW] `components/admin/AdminHealthCard.tsx`

- Card displaying live ERP connection status with green/red indicator, latency in ms, status code/error message, and graceful degradation notice.

#### [NEW] `components/admin/AdminSubscriptionBadge.tsx`

- Semantic badge rendering for `trial` (warning), `active` (success), `expired` (error), `cancelled` (ghost), with proper Arabic labels. Takes `linked` / `reachable` props so that a linked tenant whose ERP read failed renders `تعذر جلب الحالة` (distinct from a genuinely unlinked tenant's `غير مربوط`) — semantic text, never colour alone.

#### [NEW] `components/admin/AdminTenantTable.tsx`

- Table displaying team name, slug, subdomain/tenantId, members count, subscription badge, plan name, expiration date, and ERP link status. Team name links to the `/admin/tenants/[teamId]` drill-down.

#### [NEW] `components/admin/index.ts`

- Modified export barrel for the admin components.

#### [NEW] `pages/admin/tenants/[teamId].tsx`

- Read-only single-tenant drill-down. `requirePlatformAdmin` first in `getServerSideProps`; 401 → login redirect, 403 → forbidden state, anything else rethrown. No mutations, no audit writes, no revenue aggregation (P5.4+ scope).

#### [MODIFY] `components/shared/shell/UserNavigation.tsx`

- Conditionally render the `/admin` (لوحة تحكم المنصة) link when `session?.user?.isPlatformAdmin` is true.

#### [MODIFY] `components/shared/shell/Header.tsx`

- Surface the same `/admin` entry in the account dropdown for platform admins, gated on the typed `isPlatformAdmin` session claim.

#### [MODIFY] `pages/admin.tsx`

- Keep `main`'s existing `/admin` hub (welcome card, `admin-wip-badge`, and the `/admin/revenue` + `/admin/users` entry points) and integrate the P5.3 read-only dashboard into it:
  - Reuse `AdminNav` for navigation.
  - KPI StatCards (`إجمالي الشركات`, `الشركات المربوطة بـ ERP`, `الاشتراكات النشطة`, `الاشتراكات التجريبية`, `الاشتراكات المنتهية`).
  - ERP Health Card.
  - Recent Registrations list/cards.
  - Tenants table with filtering/search and subscription statuses.
  - Empty and loading states.
  - Maintain SSR `requirePlatformAdmin` guard + 401 redirect / 403 forbidden state.

#### [MODIFY] `eslint.config.cjs`

- Extend the `i18next/no-literal-string` relaxation block to `components/admin/**` and `pages/admin/**`, matching the existing entries for `pages/pricing.tsx` / `pages/register.tsx` / `pages/admin.tsx`. The admin surface deliberately adds no new locale keys (locked decision 2026-09-02), so its hardcoded Arabic copy needs the same exemption the funnel pages already have.

### 6. Tests & Documentation

#### [NEW] `__tests__/lib/adminDashboard.spec.ts`

- Unit tests for:
  - `normalizeErpSubscription` (various envelopes, trial flags, nulls, invalid dates).
  - `deriveSubscriptionStatus` (active, trial, expired past date, cancelled).
  - `getAdminDashboardData` (DB fetch, ERP success, ERP failure, mixed allSettled partial failure).
  - `getAdminTenantById` (found vs 404).

#### [NEW] `__tests__/api/admin-dashboard.spec.ts`

- API route tests for `/api/admin/dashboard` and `/api/admin/tenants/[teamId]` with mock auth guards, 401/403/405/200 assertions.

#### [NEW] `__tests__/components/admin/AdminTenantTable.spec.tsx`

- Component tests for real rows, trial/active/expired badges, the linked-but-unreachable state, the genuinely-unlinked state, and the empty state.

#### [MODIFY] `tests/e2e/admin/admin-access.spec.ts`

- Rebased onto `main`'s version, which already asserts the shipped `/admin` hub copy — no assertion regression.

#### [NEW] `tests/e2e/admin/admin-dashboard.spec.ts`

- End-to-end test verifying:
  - Platform admin lands on `/ar/admin` and sees the tenants list, subscription badges, and health card.
  - Regular member is forbidden (403).
  - Graceful degradation when ERP is unreachable (health card red, page still renders) — forced hermetically via the `tests/e2e/support/erp-stub.cjs` pattern, never by stopping a real ERP.

### 7. Context Knowledge Base

#### [MODIFY] `.agents/context/architecture/auth.md`, `.agents/context/lookup/stack-and-paths.md`, `.agents/context/shared/roadmap-to-production.md`

- Record the admin route/guard surface, the new file map entries, and the P5.3 status, per AGENTS.md rule 2 (context ships with the code change).

## Verification Plan

### Automated Tests

- `npm run check-types`
- `npm test`
- `npm run context:validate`

### Manual Verification

- Verify `/admin` in browser under Arabic locale, testing light and dark modes, table responsiveness, and ERP degraded status.
