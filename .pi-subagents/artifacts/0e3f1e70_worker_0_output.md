All 6 task items are implemented and verified. Here is the focused result.

## Implemented

1. **`AGENTS.md`** (new, root) — the "context of the context": mandates loading `.agents/context/` (quick-start → navigation → category) before any task, encodes the **context-sync rule** (no commit/push without a matching context update), the **English-only** rule (even when the user writes Arabic), quick run commands (port 4002), stack/key facts, and links to all 6 context categories.
2. **`.gitignore`** — removed the `.agents` line (it was silently ignoring the whole KB; only `navigation.md` was previously force-tracked). Added a comment explaining the KB must be committed.
3. **Staged the context KB** — `git add .agents/` → all **21** markdown files staged.
4. **Stale port refs fixed** (3001 → 4002) in 4 files: `quick-start.md`, `guides/run-locally.md`, `lookup/env-vars.md`, `errors/no-smtp-login.md`; bumped their MVI `Updated:` dates to 2026-08-20. `grep -rn '3001' .agents/context/` → **CLEAN**.
5. **`check-context.js`** (new, dependency-free) + `"context:validate"` npm script — validates MVI headers, per-category `navigation.md`, and that every relative link in navigation.md resolves. Passes on all 21 files.
6. **`CONTRIBUTING.md`** — appended "Context Knowledge Base" (no commit/push without context update; run `npm run context:validate` before PR) and "Communication" (English always).

**Validation:** `node check-context.js` PASSED (21 files, exit 0) · `eslint check-context.js` clean · `prettier --check` clean on new files · `grep 3001` empty. **26 files staged, no commit made** (per constraint).

Note: pre-existing unrelated changes (pages/, components/, middleware.ts, public/, docs/, `.pi-subagents/`) remain unstaged — those were already in the working tree before this task.