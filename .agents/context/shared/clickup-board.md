<!-- Context: shared/clickup-board | Priority: high | Version: 1.0 | Updated: 2026-08-30 -->

# ClickUp board — SMART ERP SaaS

Purpose: canonical ClickUp structure + conventions so agents can file/read tasks. Workspace: Kayan, team member Mohamed Ashraf (user id 290600300, default assignee).

## Key points

- **Space "SMART ERP SaaS" (space_id 901511849290)** — the product board. Lists (all project statuses are only `to do` / `complete`): Phase 0 · Foundations & Environment (901525268579) · Phase 1 · Registration Funnel (901525268580) · Phase 2 · Payments Owner Gateways (901525268581) · Phase 3 · Subscription Management (901525268582) · Phase 4 · Launch & Hardening (901525268583) · **Phase 5 · Platform Admin Dashboard (901525407169)** — created 2026-08-30 in the UI; home of the `[P5.x]` admin-dashboard tasks. Its description was copy-pasted from Phase 4 at creation; correct Phase 5 exit criteria were appended 2026-08-30.
- **Conventions:** task names prefixed `[P#.#]` (e.g. [P2.11]) continuing phase numbering; ERP-side work items live in the SaaS board with an "ERP team" scope note + `erp-team` tag; tags used: `launch-blocker`, `erp-team`, `cross-repo`, `security`, `admin-dashboard`, `payments`, `subscription`, `infra`, `polish`, `funnel`, `i18n`, `tests`, `seo`, `backlog`, `cleanup`, `landing`, `email`, `legal`, `compliance`, `monitoring`, `deploy`, `backup`, `dns`, `launch`. Priority enum: urgent/high/normal/low (createTask response always shows "unknown" — verify with getTaskById).
- **Admin dashboard milestone = P5.x tasks, tag `admin-dashboard`** (2026-08-30): dedicated Phase 5 list exists (901525407169). The MCP server has NO createList tool and tasks CANNOT move between lists via API (server-documented limitation) — moves are a manual UI drag. **MOVE COMPLETED 2026-08-30 via UI drag: all 8 P5.x tasks now live in Phase 5 (task IDs unchanged, shared links still valid); Phase 4 holds only the 15 P4.x tasks.**
- **Other spaces:** "ERP" (901511438729, list 901524468778 — legacy Angular client tasks, Arabic titles) and "بجات الفنادق" (901511238495, hotel bookings — unrelated). MCP tool quirks: getTaskById takes `id` (6-9 chars, no prefix), not `task_id`; updateListInfo is APPEND-ONLY; no createList/move-task tools.
- **Decision 2026-08-30:** [P2.10] samsung_pay task CLOSED — owner skipped Samsung Pay (GO-LIVE 5.7); Phase 4 list description carries the roadmap/appended notes history (updateListInfo is append-only).
- **Lifecycle:** Phases 0-3 = build phases (exit criteria in each list description, synced from docs/plans/SMART-ERP-SAAS-INTEGRATION-PLAN.md); Phase 4 = launch & hardening incl. GO/NO-GO gate (docs/Roads/GO-LIVE-CHECKLIST.md §4); list descriptions carry roadmap references appended 2026-08-30.

## Related

- `roadmap-to-production.md` (what the tasks track) · `team-workflow.md` (git/deploy)
