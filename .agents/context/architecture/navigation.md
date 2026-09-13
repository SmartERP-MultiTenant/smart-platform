<!-- Context: architecture/navigation | Priority: high | Version: 1.1 | Updated: 2026-09-13 -->

# Architecture

How the app is put together: tenancy, auth, and the security layer.

## Files

| File                              | Topic                                                                 | Priority |
| --------------------------------- | --------------------------------------------------------------------- | -------- |
| [multi-tenancy](multi-tenancy.md) | Team/TeamMember/Invitation data model, slug routing                   | high     |
| [auth](auth.md)                   | NextAuth providers, credentials login, Jackson SSO, session strategy  | high     |
| [security](security.md)           | middleware.ts CSP + security headers, unauthenticated route allowlist | high     |
| [admin-console](admin-console.md) | /admin pages + /api/admin routes, audit store, admin error contract   | high     |

## Related

- `lookup/stack-and-paths` (where everything lives) · `guides/run-locally` (boot the stack)
