-- 00-teardown.sql — exact reverse of the demo dataset.
--
-- Deletes ONLY rows this dataset created. Two independent signals are used, so a
-- partial or interrupted seed is still fully removable:
--
--   1. The reserved id namespace `00000000-de30-4000-8000-*` (platform-side tables
--      whose ids are UUID-shaped text).
--   2. EXACT demo natural keys — the three demo team slugs, the twelve demo emails,
--      the `demo-invite-token-*` tokens and the `service_demo_` / `price_demo_` /
--      `sub_demo_` text-id prefixes.
--
-- ── WHY THE NATURAL KEYS ARE EXACT AND NOT PREFIX PATTERNS ────────────────────
-- Team slugs are slugified from a USER-TYPED team name (`pages/api/auth/join.ts`),
-- and emails are user-supplied. So `slug LIKE 'demo-%'` is not a demo-only pattern:
-- a real customer who names their workspace "Demo Store" gets slug `demo-store` and
-- would have their team, memberships, invitations and API keys deleted by a
-- production teardown. The same applies to `email LIKE 'demo-%@demo.smartapro.com'`
-- for anyone registering `demo-something@demo.smartapro.com`. Every natural-key
-- predicate below is therefore an exact `=`/`IN` match — this is the property that
-- makes the file safe, not the improbability of a name collision.
--
-- Still deliberately narrow — this file must NEVER touch:
--   * `smaartx7@gmail.com` (the owner's account — a real user with a real uuid id and
--     a non-demo email; neither signal matches it),
--   * any team whose slug is not exactly demo-alpha / demo-beta / demo-gamma,
--   * any Stripe-synced Service/Price row (those ids are `prod_*`/`price_*` from Stripe,
--     not `service_demo_*`/`price_demo_*`).
--
-- Children are deleted before parents. The explicit order keeps the intent readable
-- and makes the file correct regardless of the cascade rules actually installed.
-- NOTE: the cascades are NOT uniform — most FKs here are `onDelete: Cascade`, but
-- `AdminAuditLog.actor` is `onDelete: SetNull`, so deleting an actor does not delete
-- its audit rows. The explicit ordering is what removes them.

\set ON_ERROR_STOP on

\echo '==> removing demo rows (children first)'

-- 1. Platform-admin audit trail. `actorEmail` is an exact match against the twelve
--    seeded demo addresses (see 01-users.sql); the id namespace catches rows whose
--    actor was already gone.
DELETE FROM "AdminAuditLog"
 WHERE id LIKE '00000000-de30-4000-8000-%'
    OR "actorEmail" IN (
      'demo-platform-admin@demo.smartapro.com',
      'demo-owner@demo.smartapro.com',
      'demo-admin@demo.smartapro.com',
      'demo-member@demo.smartapro.com',
      'demo-member2@demo.smartapro.com',
      'demo-owner2@demo.smartapro.com',
      'demo-erp-owner@demo.smartapro.com',
      'demo-unverified@demo.smartapro.com',
      'demo-locked@demo.smartapro.com',
      'demo-disabled@demo.smartapro.com',
      'demo-noteam@demo.smartapro.com',
      'demo-invitee@demo.smartapro.com'
    );

-- 2. API keys (belong to a demo team, or carry a demo id).
DELETE FROM "ApiKey"
 WHERE id LIKE '00000000-de30-4000-8000-%'
    OR "teamId" IN (
      SELECT id FROM "Team"
       WHERE slug IN ('demo-alpha', 'demo-beta', 'demo-gamma')
    );

-- 3. Invitations.
DELETE FROM "Invitation"
 WHERE id LIKE '00000000-de30-4000-8000-%'
    OR token LIKE 'demo-invite-token-%'
    OR "teamId" IN (
      SELECT id FROM "Team"
       WHERE slug IN ('demo-alpha', 'demo-beta', 'demo-gamma')
    );

-- 4. Billing rows. Text ids carry their own demo prefix; `\_` escapes the LIKE
--    wildcard so `subXdemoY` cannot match.
DELETE FROM "Subscription" WHERE id LIKE 'sub\_demo\_%';
DELETE FROM "Price"        WHERE id LIKE 'price\_demo\_%';
DELETE FROM "Service"      WHERE id LIKE 'service\_demo\_%';

-- 5. Memberships.
DELETE FROM "TeamMember"
 WHERE id LIKE '00000000-de30-4000-8000-%'
    OR "teamId" IN (
      SELECT id FROM "Team"
       WHERE slug IN ('demo-alpha', 'demo-beta', 'demo-gamma')
    );

-- 6. Teams.
DELETE FROM "Team"
 WHERE id LIKE '00000000-de30-4000-8000-%'
    OR slug IN ('demo-alpha', 'demo-beta', 'demo-gamma');

-- 7. Users last (TeamMember/Invitation/AdminAuditLog already reference none of them).
--    Exact addresses, not a `demo-%` prefix: a real signup on the demo domain must
--    survive a teardown.
DELETE FROM "User"
 WHERE id LIKE '00000000-de30-4000-8000-%'
    OR email IN (
      'demo-platform-admin@demo.smartapro.com',
      'demo-owner@demo.smartapro.com',
      'demo-admin@demo.smartapro.com',
      'demo-member@demo.smartapro.com',
      'demo-member2@demo.smartapro.com',
      'demo-owner2@demo.smartapro.com',
      'demo-erp-owner@demo.smartapro.com',
      'demo-unverified@demo.smartapro.com',
      'demo-locked@demo.smartapro.com',
      'demo-disabled@demo.smartapro.com',
      'demo-noteam@demo.smartapro.com',
      'demo-invitee@demo.smartapro.com'
    );

\echo '==> teardown complete'

-- Post-condition report. On a database that only ever held this dataset every
-- count below is 0. On a database with real data, these should return to the
-- pre-seed numbers you recorded before applying.
\echo '==> remaining row counts'
SELECT 'User'          AS table, count(*) AS rows FROM "User"
UNION ALL SELECT 'Team',          count(*) FROM "Team"
UNION ALL SELECT 'TeamMember',    count(*) FROM "TeamMember"
UNION ALL SELECT 'Invitation',    count(*) FROM "Invitation"
UNION ALL SELECT 'ApiKey',        count(*) FROM "ApiKey"
UNION ALL SELECT 'AdminAuditLog', count(*) FROM "AdminAuditLog"
UNION ALL SELECT 'Service',       count(*) FROM "Service"
UNION ALL SELECT 'Price',         count(*) FROM "Price"
UNION ALL SELECT 'Subscription',  count(*) FROM "Subscription"
ORDER BY 1;
