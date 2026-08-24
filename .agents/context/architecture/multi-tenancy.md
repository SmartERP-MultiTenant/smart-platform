<!-- Context: architecture/multi-tenancy | Priority: high | Version: 1.0 | Updated: 2026-08-17 -->

# Multi-tenancy model

The starter's tenancy is **organization-per-Team** with slug-based routes — the reference model for SMART PLATFORM's `TenantRegistration` flow.

## Key points

- Core models in `prisma/schema.prisma`: `Team` (unique `slug`, optional unique `domain`, `defaultRole`), `TeamMember` (userId+teamId, `Role` enum OWNER/ADMIN/MEMBER), `Invitation` (email + role), plus per-team feature records: `ApiKey`, and billing (`Subscription`, `Service`, `Price`).
- A user belongs to many teams; `TeamMember.role` gates RBAC (`lib/rbac.ts`, `lib/permissions.ts`).
- Enterprise features are team-scoped pages under `pages/teams/[slug]/…` (sso, directory-sync, audit-logs, webhooks, api-keys, billing, members, products, settings).
- Auth helpers in `lib/server-common.ts` (e.g. `requireTeamMembership`) protect team routes; invitations flow through `pages/invitations/[token]`.
- Jackson (embedded SSO) stores its own tables (`jackson_store`, `jackson_index`, `jackson_ttl`) — do not hand-edit.

## Mapping to SMART PLATFORM

- Old app's `TenantRegistration` + subdomain check ≈ this kit's `Team.slug` uniqueness (`@unique` on slug).
- Old `localStorage` content model is NOT here — content must be added as a real model/API (see `docs/audit` in the sibling repo).

## References

- `prisma/schema.prisma` · `lib/server-common.ts` · `lib/rbac.ts` · `pages/teams/[slug]/*`
