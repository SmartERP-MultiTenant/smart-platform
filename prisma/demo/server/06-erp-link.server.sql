-- 06-erp-link.server.sql — SERVER variant of ../06-erp-link.sql.
--
-- WHY THIS FILE EXISTS (do not "fix" it back to match the local file):
-- the local file carries facts about the LOCAL ERP database. None of them hold on
-- the production host, and writing them there would produce a wrong link:
--
--   local Tenant.Id          1F9E8D0F-4F59-4633-99B8-82AF5840BD16   (db `Erp`, container `sqlserver`)
--   server Tenant.Id         716BCBFD-7598-4CA5-AE88-25A076C86DE0   (db `SmartAndPro_MT`, container `erp-sqlserver`)
--   local erpApiUrl          http://localhost:5001/api
--   server erpApiUrl         https://server-mt.smartapro.com/api
--
-- A localhost API URL is unreachable from inside the platform container, so the
-- admin console's per-tenant ERP reads would fail for every seeded team.
--
-- Deliver this file instead of ../06-erp-link.sql on any host that is not the local
-- dev box. Apply ../01 through ../05 unchanged first: only the link facts differ.
--
-- ⚠️ `erpAccessToken` is deliberately left NULL. It is stored ENCRYPTED at rest
-- (`lib/crypto/erpToken.ts`; key `ERP_TOKEN_ENCRYPTION_KEY`, a CI-owned server
-- secret) and no seeded demo flow needs it: the funnel handoff is POST-only and
-- mints its own token, and admin reads are M2M via `ERP_PLATFORM_API_KEY`, not a
-- per-team token. Fabricating ciphertext would only create a row that fails to
-- decrypt.
--
-- Idempotent in the strongest sense: each UPDATE is guarded by an IS DISTINCT FROM
-- predicate, so a re-run touches zero rows instead of churning `erpLinkedAt`.

\set ON_ERROR_STOP on

-- demo-alpha -> the production ERP tenant.
UPDATE "Team"
   SET "erpTenantId"   = '716BCBFD-7598-4CA5-AE88-25A076C86DE0',
       "erpSubdomain"  = 'demo',
       "erpApiUrl"     = 'https://server-mt.smartapro.com/api',
       "erpLinkedAt"   = now(),
       "updatedAt"     = now()
 WHERE id = '00000000-de30-4000-8000-000000000101'
   AND (
         "erpTenantId"  IS DISTINCT FROM '716BCBFD-7598-4CA5-AE88-25A076C86DE0'
      OR "erpSubdomain" IS DISTINCT FROM 'demo'
      OR "erpApiUrl"    IS DISTINCT FROM 'https://server-mt.smartapro.com/api'
      OR "erpLinkedAt"  IS NULL
       );

-- The other two demo teams stay unlinked. Written explicitly rather than omitted,
-- so a half-finished manual link is corrected instead of silently surviving.
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

\echo '==> 06-erp-link.server.sql: ERP link applied (demo-alpha -> production ERP tenant)'

SELECT slug, "erpTenantId", "erpSubdomain", "erpApiUrl", "erpLinkedAt"
  FROM "Team"
 WHERE slug LIKE 'demo-%'
 ORDER BY slug;
