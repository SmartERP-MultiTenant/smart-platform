<!-- Context: best-practices/navigation | Priority: high | Version: 1.0 | Updated: 2026-08-18 -->

# Best Practices

Durable engineering standards for this repo — security, performance, and UX/UI. Each file = what the codebase already does right (harvested from source) + the rules to keep it that way.

## Files

| File                          | Topic                                                                  | Priority |
| ----------------------------- | ---------------------------------------------------------------------- | -------- |
| [security](security.md)       | CSP/headers, validation, auth hardening, secrets — harvested from code | high     |
| [performance](performance.md) | CWV targets, next/font, Prisma singleton, bundle hygiene               | high     |
| [ux-ui](ux-ui.md)             | Design tokens, RTL/Arabic, anti-AI-slop, component standards           | high     |

## Related

- `architecture/security.md` (middleware detail) · `architecture/auth.md` (NextAuth)
- `lookup/stack-and-paths.md` (where everything lives)
