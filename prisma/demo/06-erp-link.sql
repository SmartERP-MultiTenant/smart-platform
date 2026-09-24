-- 06-erp-link.sql — links the flagship demo team to the local ERP tenant.
--
-- This file OWNS every `erp*` column. 02-teams-memberships.sql deliberately leaves
-- them NULL, so "linked" and "not linked" each have exactly one author and the
-- diff for either state is a one-file read.
--
-- The link is what the tenant-lifecycle features key off. `pages/api/cron/renewal-reminders.ts`
-- skips every team whose `erpTenantId` IS NULL (`if (!team.erpTenantId) continue`),
-- and the admin console reads subscription state per linked tenant. So demo-alpha is
-- linked, and demo-beta/demo-gamma are explicitly unlinked — that difference is the
-- demo.
--
-- IDs below are facts about the LOCAL ERP database (container `sqlserver`, db `Erp`),
-- already seeded by the ERP's own boot seeders (`DataSeeder.Seed` →
-- `PlatformSeeder.SeedDemoTenant`):
--
--     Tenant.Id       1F9E8D0F-4F59-4633-99B8-82AF5840BD16
--     Tenant.Subdomain demo          (UNIQUE — and NOT a reserved subdomain)
--     Tenant.AdminEmail demo@demo.com
--     Subscription    Trial, EndDate ~1 year out, so `TenantMiddleware`'s
--                     active/trial gate passes.
--
-- ⚠️ `erpApiUrl` is `http://localhost:5001/api` — the LOCAL WebAPI. On the server
-- this must be the public origin instead (`https://server-mt.smartapro.com/api`),
-- never a localhost URL, or every admin ERP read fails from inside the container.
--
-- ⚠️ `erpAccessToken` is deliberately left NULL. It is stored ENCRYPTED at rest
-- (`lib/crypto/erpToken.ts`; the key is `ERP_TOKEN_ENCRYPTION_KEY`, a CI-owned
-- server secret) and no seeded demo flow requires it: the funnel's handoff is
-- POST-only and mints its own token, and the admin reads are M2M via
-- `ERP_PLATFORM_API_KEY`, not a per-team token. Fabricating ciphertext here would
-- only create a row that fails to decrypt.
--
-- Idempotent in the strongest sense: each UPDATE is guarded by an IS DISTINCT FROM
-- predicate, so a re-run touches zero rows instead of rewriting identical values
-- (which would churn `erpLinkedAt` and `updatedAt` on every run).

\set ON_ERROR_STOP on

-- demo-alpha → the local ERP tenant.
UPDATE "Team"
   SET "erpTenantId"   = '1F9E8D0F-4F59-4633-99B8-82AF5840BD16',
       "erpSubdomain"  = 'demo',
       "erpApiUrl"     = 'http://localhost:5001/api',
       "erpLinkedAt"   = now(),
       "updatedAt"     = now()
 WHERE id = '00000000-de30-4000-8000-000000000101'
   AND (
         "erpTenantId"  IS DISTINCT FROM '1F9E8D0F-4F59-4633-99B8-82AF5840BD16'
      OR "erpSubdomain" IS DISTINCT FROM 'demo'
      OR "erpApiUrl"    IS DISTINCT FROM 'http://localhost:5001/api'
      OR "erpLinkedAt"  IS NULL
       );

-- The other two demo teams stay unlinked. Written explicitly rather than omitted,
-- so a half-finished manual link from an earlier experiment is corrected instead of
-- silently surviving.
UPDATE "Team"
   SET "erpTenantId"  = NULL,
       "erpSubdomain" = NULL,
       "erpApiUrl"    = NULL,
       "erpLinkedAt"  = NULL,
       "updatedAt"    = now()
 WHERE id IN ('00000000-de30-4000-8000-000000000102', '00000000-de30-4000-8000-000000000103')
   AND (
         "erpTenantId"  IS NOT NULL
      OR "erpSubdomain" IS NOT NULL
      OR "erpApiUrl"    IS NOT NULL
      OR "erpLinkedAt"  IS NOT NULL
       );

\echo '==> 06-erp-link.sql: ERP link applied (demo-alpha linked; demo-beta/gamma unlinked)'

-- Expected: exactly one linked team, pointing at the local ERP tenant.
SELECT slug, "erpTenantId", "erpSubdomain", "erpApiUrl", "erpLinkedAt"
  FROM "Team"
 WHERE slug LIKE 'demo-%'
 ORDER BY slug;
