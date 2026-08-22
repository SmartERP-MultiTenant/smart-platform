<!-- Context: errors/navigation | Priority: medium | Version: 1.0 | Updated: 2026-08-17 -->

# Errors

Known failures encountered on this machine and their fixes.

## Files

| File                                    | Topic                                                  | Priority |
| --------------------------------------- | ------------------------------------------------------ | -------- |
| [db-port-conflict](db-port-conflict.md) | Host Postgres owns 5432 → use 5433                     | high     |
| [no-smtp-login](no-smtp-login.md)       | Email magic link needs SMTP → use credentials provider | medium   |

## Related

- `guides/run-locally` (boot order that avoids these).
