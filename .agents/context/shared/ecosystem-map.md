<!-- Context: shared/ecosystem-map | Priority: high | Version: 1.0 | Updated: 2026-08-24 -->

# Ecosystem map — SMART PLATFORM product family

Purpose: the canonical cross-repo overview. The product is served by **three independent git repos** that live side by side under `/mnt/Projects/Kayan/website/` (it is **not** one monorepo). Sibling repos link here instead of duplicating this knowledge.

## Key points

- **smart-platform** — Next.js 15 multi-tenant SaaS shell: landing page, registration funnel, and admin/team management (SSO/SAML, directory sync, audit logs, webhooks, billing). The product umbrella and marketing surface. Dev server `http://localhost:4002` (see `guides/run-locally`).
- **SmartAndPro.ERP.ClientApp** — Angular 17 SPA (Metronic 8), the end-user ERP UI: POS/cashier, pharmacy, invoices, receipts, payments. Dev served on `http://localhost:4200`; talks to the WebAPI (default backend `http://localhost:5001`). Deploy target `https://erp.smartapro.com`.
- **SmartAndPro.ERP.Inventory** — .NET 8 WebAPI + layered solution (WebAPI / Application / Infrastructure / Domains / SharedKernel / Tests / Bee.ZatcaHelper): the ERP backend with `TenantMiddleware`, JWT auth, platform/super-admin endpoints, payments, and Salla/Zid/NPHIES/ChannelManager integrations. Dev on `http://localhost:5001` (http) / `https://localhost:7035` (https).
- **How they connect:** ClientApp → Inventory via HTTP (Bearer + `h-n` tenant header) and SignalR/WebSockets; the platform (smart-platform admin side) → Inventory via machine-to-machine `X-Platform-ApiKey` for tenant registration, super-admin, and billing endpoints. Tenancy is by subdomain `*.smartapro.com` (see `integration-contracts`).
- **Shared knowledge rule:** repo-scoped facts (paths, run-locally, errors) live in that repo's `.agents/context/`; cross-repo facts (this map, contracts, payments, workflow) live **here** and are linked not copied.

## Repos at a glance

| Repo | Stack | Role | Dev port | Default backend |
| --- | --- | --- | --- | --- |
| `smart-platform` | Next.js 15 (Pages Router) · TS · Prisma + Postgres | SaaS shell: landing + funnel + admin | 4002 | — |
| `SmartAndPro.ERP.ClientApp` | Angular 17 · Metronic 8 | ERP UI (POS / pharmacy / cashier / invoices) | 4200 | `http://localhost:5001` |
| `SmartAndPro.ERP.Inventory` | .NET 8 · EF Core + SQL Server | ERP WebAPI + domain services | 5001 / 7035 | — |
