-- apply-server.sql — NON-LOCAL entry point for the demo dataset.
--
-- Same dataset as ../all.sql, with the two facts that differ off the local dev box
-- swapped in: the ERP link targets the production tenant, and the password hash is
-- supplied by the operator instead of being read from a committed literal.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--        -v demo_password_hash='<server-only bcrypt hash>' \
--        -f prisma/demo/server/apply-server.sql
--
-- REQUIRED INPUT: `demo_password_hash`. The requirement is enforced by the
-- fail-closed guard at the top of ../01-users.sql, which is the first file applied —
-- so forgetting it aborts with a non-zero exit and a message naming the variable,
-- rather than silently installing the committed dev hash. Do not add a default here:
-- a default is exactly the failure this design removes.
--
-- What this conductor is NOT:
--   * it does NOT include ../06-erp-link.sql — that file carries LOCAL ERP facts
--     (localhost API URL, local tenant GUID) which are wrong on any other host;
--   * it does NOT include ../erp-paid-packages.sql — that file is T-SQL against the
--     ERP database, not Postgres, and the server's ERP already carries paid packages;
--   * it is NOT run by copying the directory: `\ir` resolves against the SERVER
--     filesystem, so the whole `prisma/demo` tree has to be present there
--     (README.md §7.3).
--
-- ── ON TRANSACTIONS ───────────────────────────────────────────────────────────
-- This file opens its own BEGIN/COMMIT and `\ir`s each payload file, so it is
-- already atomic. Do NOT also pass `--single-transaction`: nesting a second BEGIN
-- inside psql's own single transaction means the inner COMMIT ends the transaction
-- early, and any statement after it would run outside the atomic block. That is the
-- same rule ../all.sql documents, for the same reason.
--
-- `\ir` (include-relative) resolves each path against THIS file's directory, so the
-- conductor works from any working directory: `../01-users.sql` is `prisma/demo/`
-- and `06-erp-link.server.sql` is this file's sibling.

\set ON_ERROR_STOP on

\echo '==> applying demo dataset (server variant)'

BEGIN;

\ir ../01-users.sql
\ir ../02-teams-memberships.sql
\ir ../03-invitations.sql
\ir ../04-billing.sql
\ir ../05-apikeys-auditlog.sql
\ir 06-erp-link.server.sql

COMMIT;

\echo '==> demo dataset applied (server variant)'
