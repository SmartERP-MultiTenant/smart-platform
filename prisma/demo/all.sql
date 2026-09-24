-- all.sql — conductor for the demo dataset. Applies every numbered file in order,
-- atomically.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f prisma/demo/all.sql
--
-- Order matters and is the reverse of teardown:
--
--   01-users            users (no dependencies)
--   02-teams-memberships teams + memberships (depend on 01)
--   03-invitations      invitations (depend on 01 + 02)
--   04-billing          service/price/subscription (independent)
--   05-apikeys-auditlog API keys + audit rows (depend on 02 and on 01's admin)
--   06-erp-link         ERP link on the flagship team (depends on 02)
--
-- ── ON TRANSACTIONS ───────────────────────────────────────────────────────────
-- This file opens its own BEGIN/COMMIT and `\ir`s each payload file, so it is
-- already atomic. Do NOT also pass `--single-transaction` here: nesting a second
-- BEGIN inside psql's own single transaction means the inner COMMIT ends the
-- transaction early, and any statement *after* it would run outside the atomic
-- block — a silent loss of the guarantee the flag was meant to provide. Run the
-- individual numbered files with `--single-transaction` if you need to apply a
-- subset; run this file as-is.
--
-- `\ir` (include-relative) resolves each path against THIS file's directory, so the
-- conductor works from any working directory.
--
-- `\set ON_ERROR_STOP on` below is a psql meta-command, and sqlfluff reports it as
-- LXR/PRS ("unable to lex / unparsable section") because it does not parse psql
-- client commands. That is a linter limitation, not a defect — do not delete the
-- line to silence it, or a failure half-way through would leave the database
-- partially seeded. The same applies to the `\echo` progress markers.

\set ON_ERROR_STOP on

\echo '==> applying demo dataset (all.sql)'

BEGIN;

\ir 01-users.sql
\ir 02-teams-memberships.sql
\ir 03-invitations.sql
\ir 04-billing.sql
\ir 05-apikeys-auditlog.sql
\ir 06-erp-link.sql

COMMIT;

\echo '==> demo dataset applied'
\echo '==> expected: 12 users, 3 teams, 8 memberships, 4 invitations, 3 API keys, 3 audit rows,'
\echo '==>           2 services, 3 prices, 2 subscriptions, 1 ERP-linked team'
