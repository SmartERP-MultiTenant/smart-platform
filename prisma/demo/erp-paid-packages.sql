-- erp-paid-packages.sql — ⚠️ SQL SERVER, NOT POSTGRES.
--
-- Runs against the ERP database (`Erp`) in the `sqlserver` container — NOT against
-- the platform's Postgres. Every other file in this directory is psql; this one is
-- T-SQL. See README.md for the exact invocation.
--
-- ── WHY THIS FILE EXISTS ──────────────────────────────────────────────────────
-- The ERP's own boot seeders (`DataSeeder.Seed` → `PlatformSeeder.SeedStarterPackage`)
-- create exactly ONE package — `Starter`, priced 0.00/0.00 — plus 14 SystemModules.
-- The public funnel therefore has nothing SELLABLE:
--
--   * `pages/pricing.tsx` renders every active package from the ERP catalogue and
--     prints "Free" for a package with no price, so the page works but sells nothing;
--   * `lib/payments/payablePackage.ts` REQUIRES a finite, strictly positive
--     `priceMonthly` — a 0-priced package is treated as trial-only and the funnel
--     deliberately renders NO payment step for it, so `POST /api/public/erp/payments`
--     answers `400 invalid-package` rather than charging a guess.
--
-- Creating paid packages is what makes the pricing → payment step reachable at all.
--
-- ── IDEMPOTENCY ───────────────────────────────────────────────────────────────
-- The three package GUIDs below are deterministic, so a re-run is a no-op. Each
-- insert is additionally guarded on the NAME, because `Packages.Name` has no unique
-- index — if someone already created a package called `DEMO-BASIC` through the ERP
-- admin UI under a different GUID, we link THEIR row instead of creating a second
-- one with the same name. The `COALESCE` resolution below is what makes the module
-- link land on whichever row actually exists.
--
-- `Packages` has no TenantId/CreatedBy/UpdatedAt columns and `CreatedAt` has NO
-- database default, so it is passed explicitly.

SET NOCOUNT ON;
SET XACT_ABORT ON;

-- Deterministic ids. Same `de30` family as the platform side, with a 07xx block so
-- they can never collide with the platform's 00xx/01xx/02xx… rows.
DECLARE @basicId      uniqueidentifier = '00000000-DE30-4000-8000-000000000701';
DECLARE @proId        uniqueidentifier = '00000000-DE30-4000-8000-000000000702';
DECLARE @enterpriseId uniqueidentifier = '00000000-DE30-4000-8000-000000000703';

BEGIN TRANSACTION;

-- ── 1. Paid packages ──────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM dbo.Packages WHERE Id = @basicId)
   AND NOT EXISTS (SELECT 1 FROM dbo.Packages WHERE Name = N'الباقة الأساسية (DEMO-BASIC)')
BEGIN
    INSERT INTO dbo.Packages (Id, Name, Description, PriceMonthly, PriceYearly, TrialDays, IsActive, CreatedAt)
    VALUES (@basicId, N'الباقة الأساسية (DEMO-BASIC)',
            N'باقة تجريبية للمنشآت الصغيرة — الفواتير والمخزون والعملاء.',
            299.00, 2990.00, 14, 1, SYSUTCDATETIME());
END

IF NOT EXISTS (SELECT 1 FROM dbo.Packages WHERE Id = @proId)
   AND NOT EXISTS (SELECT 1 FROM dbo.Packages WHERE Name = N'الباقة الاحترافية (DEMO-PRO)')
BEGIN
    INSERT INTO dbo.Packages (Id, Name, Description, PriceMonthly, PriceYearly, TrialDays, IsActive, CreatedAt)
    VALUES (@proId, N'الباقة الاحترافية (DEMO-PRO)',
            N'باقة تجريبية للمنشآت المتوسطة — تشمل نقاط البيع والحجوزات والمشتريات.',
            799.00, 7990.00, 14, 1, SYSUTCDATETIME());
END

IF NOT EXISTS (SELECT 1 FROM dbo.Packages WHERE Id = @enterpriseId)
   AND NOT EXISTS (SELECT 1 FROM dbo.Packages WHERE Name = N'باقة المؤسسات (DEMO-ENTERPRISE)')
BEGIN
    INSERT INTO dbo.Packages (Id, Name, Description, PriceMonthly, PriceYearly, TrialDays, IsActive, CreatedAt)
    VALUES (@enterpriseId, N'باقة المؤسسات (DEMO-ENTERPRISE)',
            N'باقة تجريبية شاملة — كل الوحدات مفعّلة، مع فترة تجريبية أطول.',
            1499.00, 14990.00, 30, 1, SYSUTCDATETIME());
END

-- Resolve to whichever row actually holds each name (ours, or a pre-existing one).
SET @basicId      = COALESCE((SELECT Id FROM dbo.Packages WHERE Id = @basicId),
                             (SELECT TOP 1 Id FROM dbo.Packages WHERE Name = N'الباقة الأساسية (DEMO-BASIC)'));
SET @proId        = COALESCE((SELECT Id FROM dbo.Packages WHERE Id = @proId),
                             (SELECT TOP 1 Id FROM dbo.Packages WHERE Name = N'الباقة الاحترافية (DEMO-PRO)'));
SET @enterpriseId = COALESCE((SELECT Id FROM dbo.Packages WHERE Id = @enterpriseId),
                             (SELECT TOP 1 Id FROM dbo.Packages WHERE Name = N'باقة المؤسسات (DEMO-ENTERPRISE)'));

-- ── 2. Package → module entitlements ──────────────────────────────────────────
-- Mirrors how the ERP's own Starter package is wired: the package owns a set of
-- SystemModules, and a tenant's SubscriptionModules are derived from it.
-- `dbo.PackageModules` is a pure join table — exactly two columns, both NOT NULL,
-- and composite-PK (PackageId, SystemModuleId).
--
-- Module codes are the 14 seeded by `PlatformSeeder.SeedSystemModules`. Existing
-- modules are REUSED, never inserted: `SystemModules.Code` is UNIQUE.

-- BASIC: the core commercial modules.
INSERT INTO dbo.PackageModules (PackageId, SystemModuleId)
SELECT @basicId, m.Id
  FROM dbo.SystemModules m
 WHERE m.IsActive = 1
   AND m.Code IN ('ACCOUNTING', 'CUSTOMERS', 'SUPPLIERS', 'INVENTORY', 'SALES', 'REPORTS', 'FINANCE')
   AND NOT EXISTS (SELECT 1 FROM dbo.PackageModules pm
                    WHERE pm.PackageId = @basicId AND pm.SystemModuleId = m.Id);

-- PRO: everything in BASIC, plus the operational surface.
INSERT INTO dbo.PackageModules (PackageId, SystemModuleId)
SELECT @proId, m.Id
  FROM dbo.SystemModules m
 WHERE m.IsActive = 1
   AND m.Code IN ('ACCOUNTING', 'CUSTOMERS', 'SUPPLIERS', 'INVENTORY', 'SALES', 'REPORTS', 'FINANCE',
                  'POS', 'OPERATIONS', 'PURCHASES', 'PROJECTS')
   AND NOT EXISTS (SELECT 1 FROM dbo.PackageModules pm
                    WHERE pm.PackageId = @proId AND pm.SystemModuleId = m.Id);

-- ENTERPRISE: every active module.
INSERT INTO dbo.PackageModules (PackageId, SystemModuleId)
SELECT @enterpriseId, m.Id
  FROM dbo.SystemModules m
 WHERE m.IsActive = 1
   AND NOT EXISTS (SELECT 1 FROM dbo.PackageModules pm
                    WHERE pm.PackageId = @enterpriseId AND pm.SystemModuleId = m.Id);

-- ── 3. SubscriptionModules for the demo tenant ────────────────────────────────
-- The seeded `demo` tenant has a Trial subscription but ZERO SubscriptionModules.
-- The ERP derives the JWT's `ActiveModules` claim from these rows
-- (`TokenService`), so without them the ERP client app has no modules enabled and
-- every module-gated screen is empty — a cross-repo flow that cannot be demoed.
--
-- This mirrors `TenantRegistrationService.RegisterAsync` exactly (its step 3), which
-- copies the subscription's package modules into SubscriptionModules, pricing each
-- at the module's own `PriceMonthly`. `PurchasedPrice` is NOT NULL, hence the value.
-- The existing Trial subscription is left otherwise untouched — no status change, no
-- package change, no new subscription row.
DECLARE @demoTenantId uniqueidentifier = '1F9E8D0F-4F59-4633-99B8-82AF5840BD16';
DECLARE @demoSubId uniqueidentifier =
    (SELECT TOP 1 s.Id FROM dbo.Subscriptions s
      WHERE s.TenantId = @demoTenantId
      ORDER BY s.StartDate DESC);

IF @demoSubId IS NOT NULL
BEGIN
    INSERT INTO dbo.SubscriptionModules (SubscriptionId, SystemModuleId, PurchasedPrice)
    SELECT s.Id, pm.SystemModuleId, m.PriceMonthly
      FROM dbo.Subscriptions s
      JOIN dbo.PackageModules pm ON pm.PackageId = s.PackageId
      JOIN dbo.SystemModules  m  ON m.Id = pm.SystemModuleId
     WHERE s.Id = @demoSubId
       AND NOT EXISTS (SELECT 1 FROM dbo.SubscriptionModules sm
                        WHERE sm.SubscriptionId = s.Id AND sm.SystemModuleId = pm.SystemModuleId);
END

COMMIT TRANSACTION;

-- ── Verification ──────────────────────────────────────────────────────────────
PRINT '==> erp-paid-packages.sql applied';

SELECT p.Name, p.PriceMonthly, p.PriceYearly, p.TrialDays, p.IsActive,
       (SELECT COUNT(*) FROM dbo.PackageModules pm WHERE pm.PackageId = p.Id) AS Modules
  FROM dbo.Packages p
 ORDER BY p.PriceMonthly;

SELECT (SELECT COUNT(*) FROM dbo.SubscriptionModules sm
         WHERE sm.SubscriptionId = @demoSubId) AS DemoSubscriptionModules;
