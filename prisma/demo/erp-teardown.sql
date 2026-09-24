-- erp-teardown.sql — ⚠️ SQL SERVER, NOT POSTGRES.
--
-- Exact reverse of `erp-paid-packages.sql`. Runs against the ERP database (`Erp`)
-- in the `sqlserver` container — every other file in this directory is psql.
-- See README.md → "ERP side" for the invocation.
--
-- ── WHAT THIS REVERSES, AND WHAT IT DELIBERATELY DOES NOT ─────────────────────
-- Reverse order is children-first: SubscriptionModules → PackageModules → Packages.
--
-- 1. SubscriptionModules. `erp-paid-packages.sql` did NOT move the demo tenant's
--    subscription to a new package — it left the subscription on its own package
--    (the boot seeder's `Starter`) and copied THAT package's modules into
--    SubscriptionModules. The pre-state was ZERO rows (the ERP's PlatformSeeder
--    creates a Trial subscription with no SubscriptionModules), which is why the
--    delete below mirrors the seeder's own join condition
--    (`s.PackageId → PackageModules`) instead of filtering on the three new
--    package GUIDs: the three new packages are not what the rows came from, and
--    scoping by them would either miss rows or delete unrelated ones.
--    Scoped to the demo tenant, so a real tenant's entitlements are untouched.
--
-- 2. PackageModules + Packages for the three deterministic demo GUIDs ONLY. If the
--    seed's name-fallback path was taken (a pre-existing package already carried
--    one of the DEMO names, so the seed linked to THEIR row), that package is not
--    deleted — it was never ours. Its attached modules are likewise left in place.
--    Removing those is a manual, name-based decision; this file stays conservative.
--
-- Nothing else in the ERP database is touched: the `demo` tenant, its `Starter`
-- package, its subscription, its users and the 14 SystemModules all predate this
-- dataset and survive.

SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @basicId      uniqueidentifier = '00000000-DE30-4000-8000-000000000701';
DECLARE @proId        uniqueidentifier = '00000000-DE30-4000-8000-000000000702';
DECLARE @enterpriseId uniqueidentifier = '00000000-DE30-4000-8000-000000000703';
DECLARE @demoTenantId uniqueidentifier = '1F9E8D0F-4F59-4633-99B8-82AF5840BD16';

BEGIN TRANSACTION;

-- ── 1. SubscriptionModules the seed copied for the demo tenant's subscription ──
DELETE sm
  FROM dbo.SubscriptionModules sm
  JOIN dbo.Subscriptions  s  ON s.Id = sm.SubscriptionId
  JOIN dbo.PackageModules pm ON pm.PackageId = s.PackageId
                            AND pm.SystemModuleId = sm.SystemModuleId
 WHERE s.TenantId = @demoTenantId;

-- ── 2. PackageModules belonging to the three demo packages ────────────────────
DELETE FROM dbo.PackageModules
 WHERE PackageId IN (@basicId, @proId, @enterpriseId);

-- ── 3. The three demo packages themselves ─────────────────────────────────────
DELETE FROM dbo.Packages
 WHERE Id IN (@basicId, @proId, @enterpriseId);

COMMIT TRANSACTION;

-- ── Verification ──────────────────────────────────────────────────────────────
PRINT '==> erp-teardown.sql applied (pre-state: Packages=1, PackageModules=14, SubscriptionModules=0)';

SELECT p.Name, p.PriceMonthly,
       (SELECT COUNT(*) FROM dbo.PackageModules pm WHERE pm.PackageId = p.Id) AS Modules
  FROM dbo.Packages p
 ORDER BY p.PriceMonthly;

SELECT (SELECT COUNT(*) FROM dbo.Packages)          AS Packages,
       (SELECT COUNT(*) FROM dbo.PackageModules)    AS PackageModules,
       (SELECT COUNT(*) FROM dbo.SubscriptionModules) AS SubscriptionModules;
