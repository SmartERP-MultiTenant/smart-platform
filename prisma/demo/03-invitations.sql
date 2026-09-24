-- 03-invitations.sql — pending and expired team invitations.
--
-- ⚠️ `"Invitation"` HAS NO STATUS COLUMN. The live DDL is: id, teamId, email, role,
-- token, expires, invitedBy, createdAt, updatedAt, sentViaEmail, allowedDomains.
-- An invitation's state is therefore expressed ONLY by `expires`:
--
--     pending  = expires > now()
--     expired  = expires < now()
--
-- A "revoked" invitation is a DELETED ROW, not a fourth state. Do not add a status
-- column to model revocation — `pages/api/teams/[slug]/invitations.ts` has no
-- revoke action and no code path reads such a column.
--
-- `sentViaEmail` is modelled both ways: a row with `true` represents an invitation
-- the mailer delivered, and the `false` row represents the copy-an-invite-link path
-- (which is how invitations are exercised locally without SMTP).
--
-- UNIQUE constraints in play: (token) and (teamId, email). Both hold below.

\set ON_ERROR_STOP on

INSERT INTO "Invitation" (
  id, "teamId", email, role, token, expires, "invitedBy",
  "sentViaEmail", "allowedDomains", "createdAt", "updatedAt"
) VALUES
  -- PENDING, domain-restricted: only an @smartapro.com address may accept it.
  ('00000000-de30-4000-8000-000000000301', '00000000-de30-4000-8000-000000000101',
   'demo-invitee@demo.smartapro.com', 'MEMBER'::"Role", 'demo-invite-token-0001',
   now() + interval '7 days', '00000000-de30-4000-8000-000000000001',
   true, ARRAY['smartapro.com']::text[], now() - interval '1 day', now() - interval '1 day'),

  -- EXPIRED three days ago, ADMIN role. The accept page must reject this by date
  -- alone — this is the row that proves expiry is enforced from `expires`.
  ('00000000-de30-4000-8000-000000000302', '00000000-de30-4000-8000-000000000101',
   'demo-expired-invitee@demo.smartapro.com', 'ADMIN'::"Role", 'demo-invite-token-0002',
   now() - interval '3 days', '00000000-de30-4000-8000-000000000001',
   true, ARRAY[]::text[], now() - interval '10 days', now() - interval '10 days'),

  -- PENDING, NOT emailed, restricted to the demo subdomain. The copyable-link case.
  ('00000000-de30-4000-8000-000000000303', '00000000-de30-4000-8000-000000000102',
   'demo-invitee2@demo.smartapro.com', 'MEMBER'::"Role", 'demo-invite-token-0003',
   now() + interval '30 days', '00000000-de30-4000-8000-00000000000b',
   false, ARRAY['demo.smartapro.com']::text[], now() - interval '2 days', now() - interval '2 days'),

  -- PENDING on the UNLINKED team, so the invitation list is populated on a team
  -- that has no ERP tenant at all.
  ('00000000-de30-4000-8000-000000000304', '00000000-de30-4000-8000-000000000103',
   'demo-invitee3@demo.smartapro.com', 'MEMBER'::"Role", 'demo-invite-token-0004',
   now() + interval '14 days', '00000000-de30-4000-8000-000000000009',
   true, ARRAY[]::text[], now() - interval '4 days', now() - interval '4 days')
ON CONFLICT (id) DO UPDATE SET
  "teamId"         = EXCLUDED."teamId",
  email            = EXCLUDED.email,
  role             = EXCLUDED.role,
  expires          = EXCLUDED.expires,
  "sentViaEmail"   = EXCLUDED."sentViaEmail",
  "allowedDomains" = EXCLUDED."allowedDomains",
  "updatedAt"      = EXCLUDED."updatedAt";

\echo '==> 03-invitations.sql: 4 invitations ensured (2 pending, 1 expired, 1 pending)'
