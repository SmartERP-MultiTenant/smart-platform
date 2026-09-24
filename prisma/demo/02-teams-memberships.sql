-- 02-teams-memberships.sql — three demo workspaces and their memberships.
--
-- Three teams, each proving a different state the tenancy layer supports:
--
--   demo-alpha  — the FLAGSHIP demo team. Has a custom `domain`, an active billing
--                 customer, and (via 06-erp-link.sql) an ERP tenant link. Read the
--                 ERP link in 06, not here: this file leaves every `erp*` column NULL
--                 so that the "linked" vs "not linked" distinction has exactly one
--                 owner.
--   demo-beta   — billing that has been CANCELLED, and a renewal reminder already
--                 sent (`lastReminderStage`), so the reminder cron's "don't send
--                 twice" branch has a real row to skip.
--   demo-gamma  — deliberately UNLINKED (no ERP tenant, no billing) and with a
--                 non-default `defaultRole`, so the admin console's "not linked"
--                 filtering and the role-default path both have data.
--
-- `slug` and `domain` are UNIQUE. `domain` is set on exactly ONE team — a nullable
-- unique column is only interesting when some rows leave it NULL.
--
-- Ids are explicit (see 01-users.sql for why that is mandatory, not stylistic).

\set ON_ERROR_STOP on

INSERT INTO "Team" (
  id, name, slug, domain, "defaultRole", "billingId", "billingProvider",
  "createdAt", "updatedAt"
) VALUES
  ('00000000-de30-4000-8000-000000000101', 'شركة ديمو ألفا للتجارة (Demo Alpha)', 'demo-alpha',
   'demo-alpha.smartapro.com', 'MEMBER'::"Role", 'cus_demo_active', 'stripe',
   now() - interval '40 days', now() - interval '2 days'),

  ('00000000-de30-4000-8000-000000000102', 'مؤسسة ديمو بيتا (Demo Beta)', 'demo-beta',
   NULL, 'MEMBER'::"Role", 'cus_demo_cancelled', 'stripe',
   now() - interval '28 days', now() - interval '3 days'),

  ('00000000-de30-4000-8000-000000000103', 'ديمو جاما للخدمات (Demo Gamma)', 'demo-gamma',
   NULL, 'ADMIN'::"Role", NULL, NULL,
   now() - interval '25 days', now() - interval '25 days')
ON CONFLICT (id) DO UPDATE SET
  name            = EXCLUDED.name,
  slug            = EXCLUDED.slug,
  domain          = EXCLUDED.domain,
  "defaultRole"   = EXCLUDED."defaultRole",
  "billingId"     = EXCLUDED."billingId",
  "billingProvider" = EXCLUDED."billingProvider",
  "updatedAt"     = EXCLUDED."updatedAt";

-- Memberships. UNIQUE (teamId, userId) is the real constraint here; the explicit
-- ids are what make a re-run an update rather than a duplicate-key error.
--
-- Role spread: OWNER + ADMIN + two MEMBERs on demo-alpha (so the RBAC matrix and
-- the "last owner cannot leave" guard both have subjects), an independent OWNER on
-- the other two teams, and the unverified user placed on demo-gamma on purpose —
-- email verification gates sign-in, not membership.
INSERT INTO "TeamMember" (id, "teamId", "userId", role, "createdAt", "updatedAt") VALUES
  ('00000000-de30-4000-8000-000000000201', '00000000-de30-4000-8000-000000000101',
   '00000000-de30-4000-8000-000000000001', 'OWNER'::"Role", now() - interval '40 days', now() - interval '40 days'),
  ('00000000-de30-4000-8000-000000000202', '00000000-de30-4000-8000-000000000101',
   '00000000-de30-4000-8000-000000000003', 'ADMIN'::"Role", now() - interval '38 days', now() - interval '38 days'),
  ('00000000-de30-4000-8000-000000000203', '00000000-de30-4000-8000-000000000101',
   '00000000-de30-4000-8000-000000000004', 'MEMBER'::"Role", now() - interval '35 days', now() - interval '35 days'),
  ('00000000-de30-4000-8000-000000000204', '00000000-de30-4000-8000-000000000101',
   '00000000-de30-4000-8000-00000000000a', 'MEMBER'::"Role", now() - interval '30 days', now() - interval '30 days'),
  ('00000000-de30-4000-8000-000000000205', '00000000-de30-4000-8000-000000000102',
   '00000000-de30-4000-8000-00000000000b', 'OWNER'::"Role", now() - interval '28 days', now() - interval '28 days'),
  ('00000000-de30-4000-8000-000000000206', '00000000-de30-4000-8000-000000000102',
   '00000000-de30-4000-8000-000000000004', 'MEMBER'::"Role", now() - interval '27 days', now() - interval '27 days'),
  ('00000000-de30-4000-8000-000000000207', '00000000-de30-4000-8000-000000000103',
   '00000000-de30-4000-8000-000000000009', 'OWNER'::"Role", now() - interval '25 days', now() - interval '25 days'),
  ('00000000-de30-4000-8000-000000000208', '00000000-de30-4000-8000-000000000103',
   '00000000-de30-4000-8000-000000000005', 'MEMBER'::"Role", now() - interval '10 days', now() - interval '10 days')
ON CONFLICT (id) DO UPDATE SET
  "teamId"    = EXCLUDED."teamId",
  "userId"    = EXCLUDED."userId",
  role        = EXCLUDED.role,
  "updatedAt" = EXCLUDED."updatedAt";

-- demo-beta already had its T-7 reminder sent. Without this the renewal cron would
-- re-send it on every local run (the stage guard is `lastReminderStage !== targetStage`).
UPDATE "Team"
   SET "lastReminderSentAt" = now() - interval '3 days',
       "lastReminderStage"  = 'T-7',
       "updatedAt"          = now() - interval '3 days'
 WHERE id = '00000000-de30-4000-8000-000000000102';

\echo '==> 02-teams-memberships.sql: 3 teams + 8 memberships ensured'
