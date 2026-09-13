<!-- Context: errors/navigation | Priority: medium | Version 1.2 | Updated: 2026-09-14 -->

# Errors

Known failures encountered on this machine and their fixes.

## Files

| File                                                | Topic                                                                    | Priority |
| --------------------------------------------------- | ------------------------------------------------------------------------ | -------- |
| [db-port-conflict](db-port-conflict.md)             | Host Postgres owns 5432 → use 5433                                       | high     |
| [no-smtp-login](no-smtp-login.md)                   | Email magic link needs SMTP → use credentials provider                   | medium   |
| [prisma-migration-drift](prisma-migration-drift.md) | `migrate deploy` passes on a drifted schema → CI enforces `migrate diff` | high     |

## Related

- `guides/run-locally` (boot order that avoids these) · `architecture/admin-console` (audit store that hit the drift trap).
