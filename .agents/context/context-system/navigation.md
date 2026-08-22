<!-- Context: context-system/navigation | Priority: high | Version: 1.0 | Updated: 2026-08-17 -->

# Context System

Canonical docs for the knowledge base itself. This folder mirrors the pi context skills.

## Files

| File                                          | Topic             |
| --------------------------------------------- | ----------------- |
| [standards/templates](standards/templates.md) | MVI file template |

## Canonical source of truth

The pi context skills (`.agents/skills/context-*` in the agent home) are authoritative for operations: scan, map, create, compact, harvest, extract, update, organize, migrate, validate, add-pattern.

## Rules

- MVI: <200 lines, 3–5 key points, one topic, HTML header `<!-- Context: path | Priority: x | Version: 1.0 | Updated: YYYY-MM-DD -->` (path = context-root-relative, no extension).
- Every category has `navigation.md`; every file is listed in one; top-level `navigation.md` lists all categories.
- Run `context-validate` after every change.
