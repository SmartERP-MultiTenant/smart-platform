<!-- Context: shared/team-workflow | Priority: high | Version: 1.0 | Updated: 2026-08-24 -->

# Team workflow

Purpose: git layout, branch conventions, and deploy path across the three related repos — plus what's currently mid-flight so agents don't collide.

## Key points

- **Three independent repos** (not a monorepo) — `smart-platform` is a single-origin repo (`github.com/mhmd-ashrf-saad/smart-platform`, default branch `main`, mostly dependabot branches). `SmartAndPro.ERP.ClientApp` and `SmartAndPro.ERP.Inventory` are **forks**: `origin = github.com/SmartERP-MultiTenant/<repo>`, `upstream = github.com/abdelruhmangomaa/<repo>` — work flows via the org repo, with the personal repo as upstream reference.
- **Branch conventions (ERP repos)** — `development` is the active working branch (checked out by default); alongside `main`, `Staging`, `deploy`, and `feature/*` (e.g. `feature/multi-tenant`); occasional one-offs (`Testing`, `PROJECT-ADD-NEW-FEAT`, `cashier-front`, ...). Almost all work happens on the `development` line.
- **Deploy path (ClientApp)** — `Jenkinsfile` takes a `SERVER` parameter (currently `vps_erp`): `npm i --legacy-peer-deps` → (rewrites `environment.prod.ts` per server) → `ng build --configuration production` → `sudo rsync -a --delete dist/demo1/ /var/www/<target>/` (target `erp.smartapro.com`), chown `www-data`. Each `vps_*` tenant in `src/environments/environment.prod.ts` maps to a prod URL (e.g. `https://server-erp.smartapro.com/api/`).
- **Currently mid-flight (2026-08-24)** — the multi-tenant/platform feature is uncommitted in Inventory's working tree: staged migration `20260823153625_AddMultiTenancyPlatform` (+ Designer) plus modified `ERPContextModelSnapshot.cs` and `appsettings.Development.json`. Smart-platform context tracks the same feature direction (tenant registration, super-admin, billing). **Coordinate before pulling/rebasing these repos.**
- **Context rule for this family** — repo-scoped context lives in each repo's `.agents/context/`; product-wide facts live **here** in `smart-platform/.agents/context/shared/`; the ERP repos' `shared/` stubs link back via `../../../../smart-platform/.agents/context/shared/<file>.md` (their stubs sit in a category dir, so four levels up; assumes the three sit side-by-side as they do today).
