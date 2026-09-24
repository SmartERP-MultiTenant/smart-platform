-- 05-apikeys-auditlog.sql — API keys and the platform-admin audit trail.
--
-- ── API KEYS ──────────────────────────────────────────────────────────────────
-- `models/apiKey.ts` stores `sha256(rawKey)` in `"ApiKey"."hashedKey"` (UNIQUE):
--
--     apiKey  = randomBytes(16).toString('hex')   -- 32 hex chars
--     hashedKey = sha256(apiKey)                  -- 64 hex chars
--
-- The raw key is shown to the user ONCE at creation and never stored, so a seeded
-- row is only useful if the raw value is recorded somewhere. Those values are in
-- README.md → "Demo credentials" (out-of-band handover, deliberately NOT here).
-- Each hash below was produced with `printf %s '<raw>' | sha256sum`.
--
-- ⚠️ SCOPE, stated honestly: no code path in this repository ever VERIFIES a
-- presented API key — `grep -rn hashedKey` finds only the writer in
-- `models/apiKey.ts`. These rows therefore exercise the settings UI (list, create,
-- expiry display, delete) and nothing else. There is no API-key-authenticated
-- endpoint to call, so do not build a demo flow that depends on one.
--
-- ── ADMIN AUDIT LOG ───────────────────────────────────────────────────────────
-- `"AdminAuditLog"` records platform-admin MUTATIONS. It is unrelated to the
-- per-team audit-log page, which reads the external Retraced service — see the
-- "not seeded" section of README.md.
--
-- All three `AdminAuditStatus` values are represented so every rendering branch has
-- a row: SUCCEEDED (before/after snapshots present), FAILED (errorCode present,
-- no `after`), and STARTED (an in-flight action — the row the console shows while
-- a slow ERP call is still running).

\set ON_ERROR_STOP on

INSERT INTO "ApiKey" (id, name, "teamId", "hashedKey", "expiresAt", "lastUsedAt", "createdAt", "updatedAt") VALUES
  -- Healthy key: no expiry, recently used.
  ('00000000-de30-4000-8000-000000000501', 'Demo Alpha CI Key',
   '00000000-de30-4000-8000-000000000101',
   '4eefbee4d8ab0425bd152e2bf324feebabc4583ec5bae7de38d5d1fb58bf88cb',
   NULL, now() - interval '1 day', now() - interval '30 days', now() - interval '1 day'),

  -- Expired 10 days ago and never used: the "revoke this" state.
  ('00000000-de30-4000-8000-000000000502', 'Demo Alpha Expired Key',
   '00000000-de30-4000-8000-000000000101',
   '2ef4a2ca36aef53578ecb56674bbbdbf1cd09798c18ef2706117e7664674bca0',
   now() - interval '10 days', NULL, now() - interval '60 days', now() - interval '10 days'),

  -- A second team's key, proving the list is team-scoped.
  ('00000000-de30-4000-8000-000000000503', 'Demo Beta Key',
   '00000000-de30-4000-8000-000000000102',
   '85381665ca0d4ce11d52ae1606b9d3c8964ddfdd1eac28ccc752a5b45193e582',
   NULL, now() - interval '3 hours', now() - interval '28 days', now() - interval '3 hours')
ON CONFLICT (id) DO UPDATE SET
  name         = EXCLUDED.name,
  "teamId"     = EXCLUDED."teamId",
  "hashedKey"  = EXCLUDED."hashedKey",
  "expiresAt"  = EXCLUDED."expiresAt",
  "lastUsedAt" = EXCLUDED."lastUsedAt",
  "updatedAt"  = EXCLUDED."updatedAt";

INSERT INTO "AdminAuditLog" (
  id, "actorId", "actorEmail", "actorName", action, "targetType", "targetId",
  status, before, after, metadata, "errorCode", "createdAt", "updatedAt"
) VALUES
  -- SUCCEEDED — a completed subscription extension, with the before/after snapshot
  -- the console renders as the change diff.
  ('00000000-de30-4000-8000-000000000601', '00000000-de30-4000-8000-000000000002',
   'demo-platform-admin@demo.smartapro.com', 'Demo Platform Admin',
   'subscription.extend', 'Team', '00000000-de30-4000-8000-000000000101',
   'SUCCEEDED'::"AdminAuditStatus",
   '{"endDate": "2026-10-01T00:00:00.000Z"}'::jsonb,
   '{"endDate": "2026-12-31T00:00:00.000Z"}'::jsonb,
   '{"source": "demo-seed", "erpTenantId": "1F9E8D0F-4F59-4633-99B8-82AF5840BD16"}'::jsonb,
   NULL, now() - interval '2 days', now() - interval '2 days'),

  -- FAILED — the ERP was unreachable. `after` is NULL by design: a failed action
  -- has no resulting state, and `errorCode` is what the console branches on.
  ('00000000-de30-4000-8000-000000000602', '00000000-de30-4000-8000-000000000002',
   'demo-platform-admin@demo.smartapro.com', 'Demo Platform Admin',
   'subscription.cancel', 'Team', '00000000-de30-4000-8000-000000000102',
   'FAILED'::"AdminAuditStatus",
   '{"status": "active"}'::jsonb,
   NULL,
   '{"source": "demo-seed", "attempt": 1}'::jsonb,
   'ERP_UNREACHABLE', now() - interval '1 day', now() - interval '1 day'),

  -- STARTED — the in-flight row. `targetId` here is an ERP-side identifier (the
  -- Starter package in the local ERP database), which is legitimate: the audit log
  -- records cross-system targets, not only platform UUIDs.
  -- The GUID below IS the local `Starter` package id — verified against the local
  -- SQL Server (`SELECT Id, Name FROM dbo.Packages` → F6850611-…  |  Starter).
  ('00000000-de30-4000-8000-000000000603', '00000000-de30-4000-8000-000000000002',
   'demo-platform-admin@demo.smartapro.com', 'Demo Platform Admin',
   'package.update-modules', 'Package', 'F6850611-3ADA-4540-AB33-D6C8AC56DD18',
   'STARTED'::"AdminAuditStatus",
   NULL, NULL,
   '{"source": "demo-seed", "syncExistingSubscriptions": true}'::jsonb,
   NULL, now() - interval '5 minutes', now() - interval '5 minutes')
ON CONFLICT (id) DO UPDATE SET
  "actorId"    = EXCLUDED."actorId",
  "actorEmail" = EXCLUDED."actorEmail",
  "actorName"  = EXCLUDED."actorName",
  action       = EXCLUDED.action,
  "targetType" = EXCLUDED."targetType",
  "targetId"   = EXCLUDED."targetId",
  status       = EXCLUDED.status,
  before       = EXCLUDED.before,
  after        = EXCLUDED.after,
  metadata     = EXCLUDED.metadata,
  "errorCode"  = EXCLUDED."errorCode",
  "updatedAt"  = EXCLUDED."updatedAt";

\echo '==> 05-apikeys-auditlog.sql: 3 API keys + 3 audit rows ensured'
