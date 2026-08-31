<!-- Context: shared/navigation | Priority: high | Version: 1.0 | Updated: 2026-08-24 -->

# Shared (cross-repo)

Canonical knowledge for the whole SMART PLATFORM product family — the three related repos. Repo-scoped facts live in each repo's own context root; anything cross-repo/product-wide belongs here and is referenced (not duplicated) by the sibling repos.

## Files

| File                                              | Topic                                                          | Priority |
| ------------------------------------------------- | -------------------------------------------------------------- | -------- |
| [ecosystem-map](ecosystem-map.md)                 | The three repos, their roles, and how they connect (canonical) | high     |
| [integration-contracts](integration-contracts.md) | SPA↔WebAPI and platform↔WebAPI contracts, tenancy rules, ports | high     |
| [payments](payments.md)                           | Payment providers + standalone integrations across the product | high     |
| [team-workflow](team-workflow.md)                 | Git layout, branch conventions, deploy path, current state     | high     |
| [roadmap-to-production](roadmap-to-production.md) | Production gap state, launch blockers, recorded decisions      | high     |
| [clickup-board](clickup-board.md)                 | ClickUp structure, conventions, task filing rules              | high     |

## Related

- Sibling context roots (thin stubs link back here): `../../../../SmartAndPro.ERP.ClientApp/.agents/context/`, `../../../../SmartAndPro.ERP.Inventory/.agents/context/`
- Per-repo `navigation.md` for repo-scoped facts.
