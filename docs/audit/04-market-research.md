# SMART ERP — Open-Source Market Research (2026-08-17)

**Goal:** find open-source projects to build on (or reference) instead of starting from scratch — for a React multi-tenant SaaS website with landing + registration funnel + KSA payments + admin with visual content editing (Arabic-first, RTL).

**Your locked decisions that shape this:** D1 landing-first · D2 visual editor = core feature → content must be real backend data · D3 hybrid restructure (reuse working code) · D4 TypeScript.

---

## 1. Top candidates (verified on GitHub, audit date)

| Project                      | Repo                          | Stars ≈ | License      | Stack                                  | What it gives you                                                                                          |
| ---------------------------- | ----------------------------- | ------- | ------------ | -------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **Puck**                     | `puckeditor/puck`             | ~13k    | MIT          | React (any env)                        | Visual drag-drop page editor as a React component; data you own; react-router v7 recipe                    |
| **PayloadCMS**               | `payloadcms/payload`          | ~25k    | MIT          | Next.js + TS                           | Headless CMS + built-in admin panel + auth; self-hostable anywhere Node runs                               |
| **BoxyHQ SaaS Starter Kit**  | `boxyhq/saas-starter-kit`     | ~4.9k   | Apache-2.0   | Next.js + Prisma + Postgres + NextAuth | Enterprise boilerplate: auth, teams/orgs (tenancy primitives), billing, account, admin, Docker             |
| **Refine**                   | `refinedev/refine`            | ~35k    | MIT          | React (headless)                       | Admin/dashboard meta-framework; i18n + theming built in; many UI adapters                                  |
| **React-Admin**              | `marmelab/react-admin`        | ~27k    | MIT          | React + MUI                            | Admin panel framework over REST/GraphQL                                                                    |
| **ERPNext / Frappe**         | `frappe/erpnext`              | ~19k    | GPLv3        | Frappe (Python)                        | Full ERP; default multi-tenant = separate DB per tenant (bench); built-in website module; Arabic UI exists |
| **Odoo (Community)**         | `odoo/odoo`                   | ~38k    | LGPLv3       | Python                                 | Full ERP; multi-company; big ecosystem                                                                     |
| **GrapesJS**                 | `GrapesJS/grapesjs`           | ~21k    | BSD-3        | Vanilla JS                             | Classic WYSIWYG web-page builder framework                                                                 |
| **Webstudio**                | `webstudio-is/webstudio`      | ~7k     | **AGPL-3.0** | Next.js                                | Webflow-like visual development platform                                                                   |
| **TinaCMS**                  | `tinacms/tinacms`             | ~12k    | Apache-2.0   | Next.js, git-based                     | Visual editing for markdown/MDX/JSON content                                                               |
| **etlaq-nextjs-template**    | `Etlaq/etlaq-nextjs-template` | niche   | verify       | Next.js + shadcn/ui + MongoDB          | Arabic-first RTL landing with LTR/RTL toggle + i18n                                                        |
| **Saas starter kits (misc)** | several                       | 0–16    | MIT          | Next.js                                | Auth + Stripe + admin dashboards — mostly immature/unproven                                                |

## 2. Licensing watchlist

| License                          | Meaning for a commercial SaaS                                                                   | Projects                                                                                     |
| -------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| ✅ MIT / Apache-2.0 / BSD-3      | Free to use commercially, closed-source allowed                                                 | Puck, PayloadCMS, Refine, React-Admin, BoxyHQ, TinaCMS, GrapesJS                             |
| ⚠️ AGPL-3.0 / GPL-3.0 / LGPL-3.0 | Copyleft: distributing a modified product likely forces open-sourcing (or a commercial license) | Webstudio (AGPL), ERPNext (GPLv3), Odoo (LGPLv3), Dub, Cal.com, Formbricks, Directus (GPLv3) |

**Rule of thumb:** MIT/Apache/BSD for anything you fork into the product; GPL/AGPL projects are _reference architectures only_ (patterns, not code).

## 3. Gaps no open-source project fills for you

- **KSA payments** (Moyasar, Tabby, Tamara, Mada/Apple Pay): no ready-made open-source integration — keep your `features/payments` custom work.
- **Arabic-first RTL design system**: most open-source SaaS UIs are LTR-first; Arabic-first RTL is your differentiator — your Phase-1 tokens/RTL work stays bespoke (etlaq template is the closest reference).

## 4. Recommendations

### Option A — stay Vite+React (recommended, aligns with D1/D3)

1. **Puck** → replace the Horizons AST visual editor; embed in admin; pages saved as JSON to a new content API (fulfils D2).
2. **Content backend** → extend `SmartERP.API` with `GET/PUT /api/content` + `POST /api/contact` (contract-first, Phase 1) — _or_ adopt **PayloadCMS** as a self-hosted CMS service if a separate Node service is acceptable.
3. **Refine or React-Admin** → foundation for the admin dashboard rebuild (follow-up cycle).
4. **ERPNext/Frappe** → architecture reference for tenant isolation (db-per-tenant, subdomain routing).

### Option B — biggest head start, new stack

5. **BoxyHQ SaaS Starter Kit** → migrate the whole site to this Next.js shell (auth, orgs/tenancy, billing, admin pre-built). Trade-offs: Next.js migration, Stripe-centric billing must be reworked for Moyasar/Tabby/Tamara, contradicts D3 "reuse what works".

### Suggested spike (before committing)

Clone **Puck** and **BoxyHQ** locally; run each's demo; verify: (a) Puck can render your existing React components + save JSON to your API, (b) BoxyHQ's tenancy model maps to your `TenantRegistration` flow.

## 5. Sources

- github.com/puckeditor/puck · github.com/payloadcms/payload · github.com/boxyhq/saas-starter-kit · github.com/refinedev/refine · github.com/marmelab/react-admin · github.com/frappe/erpnext · github.com/odoo/odoo · github.com/GrapesJS/grapesjs · github.com/webstudio-is/webstudio · github.com/tinacms/tinacms · github.com/Etlaq/etlaq-nextjs-template · discuss.frappe.io multi-tenant architecture threads · oec.sh/deploymonkey Odoo multi-tenant guides
