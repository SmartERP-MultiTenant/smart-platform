# Task for worker

You are a delegated subagent running from a fork of the parent session. Treat the inherited conversation as reference-only context, not a live thread to continue. Do not continue or answer prior messages as if they are waiting for a reply. Your sole job is to execute the task below and return a focused result for that task using your tools.

Task:
Work in /mnt/Projects/Kayan/website/saas-starter-kit. This is the SMART ERP SaaS Starter Kit (Next.js 15 Pages Router, Prisma/Postgres, NextAuth). The user's requirements, in order of priority:

1. **Root AGENTS.md** — create it. It is the "context of the context": it must (a) MANDATE loading the project context knowledge base at .agents/context/ before any task (quick-start.md → navigation.md → category file for the task), (b) encode the English-only rule: ALWAYS reply to the user in English, even when the user writes in Arabic (user's explicit request), (c) encode the context-sync rule: no commit/push is allowed if the context knowledge base is missing or stale for the areas the change touches — context updates ship in the same commit, (d) quick run commands, (e) stack + key facts summary that points into the KB, (f) links to the context categories (architecture, best-practices, guides, lookup, errors). Keep it concise (~80-120 lines), accurate, and consistent with reality: dev script is `npm run dev` → port **4002**, .env has NEXTAUTH_URL/APP_URL=http://localhost:4002, DATABASE_URL=postgresql://postgres:postgres@localhost:5433/saas, Postgres container saas-postgres on host port 5433 (5432 is taken by a host Postgres), AUTH_PROVIDERS=credentials (no SMTP needed), Pages Router not App Router.

2. **Fix .gitignore** — line 62 currently contains `.agents` which ignores the whole context knowledge base (only navigation.md was force-tracked earlier; the other 20 files are untracked). Remove the `.agents` line entirely (keep `.pi` ignored). Do NOT commit — just edit + stage.

3. **Stage the context KB** — run `git add .agents/` and verify with `git status --short .agents` that all 21 .md files under .agents/context/ show as staged (git add is allowed; do NOT git commit — the main agent handles that).

4. **Fix stale port references** — the knowledge base says 3001 everywhere but the app now runs on 4002. Update ALL of these files consistently to 4002 (match package.json `"dev": "next dev --port 4002"` and the actual .env values NEXTAUTH_URL=http://localhost:4002, APP_URL=http://localhost:4002):
   - .agents/context/quick-start.md (server line, dev command comment, first commands block)
   - .agents/context/guides/run-locally.md (env line, run command, verify line, npm run note)
   - .agents/context/lookup/env-vars.md (NEXTAUTH_URL and APP_URL rows)
   - .agents/context/errors/no-smtp-login.md (curl URL at line 20)
   After editing, `grep -rn '3001' .agents/context/` must return nothing.

5. **check-context.js + npm script** — create a small dependency-free Node script `check-context.js` at repo root (model after the existing check-locale.js style — plain JS, no imports beyond fs/path, clean exit codes and console output). It must: walk .agents/context recursively for .md files; assert every file starts with a `<!-- Context:` header comment line; assert every category directory (architecture, best-practices, guides, lookup, errors, context-system) has a navigation.md; verify every relative markdown link in each navigation.md resolves to a real file on disk; print a file count + pass/fail summary; exit 1 on any failure. Then add `"context:validate": "node check-context.js"` to package.json scripts (place it next to the other `node ...` scripts like check-locale). Then run it and it MUST pass.

6. **CONTRIBUTING.md** — append two sections: "## Context Knowledge Base" (no commit/push without a context update for covered areas; run `npm run context:validate` before opening a PR; new pages/routes/auth changes need a matching .agents/context update) and "## Communication" (all reviews, comments and replies in English, even if the requester writes in Arabic).

7. **Format & verify** — run `npx prettier --write AGENTS.md CONTRIBUTING.md check-context.js` and the edited context files; then `node check-context.js` must still pass; then `grep -rn '3001' .agents/context/` must be empty; then report: files created/changed, the staged file count, and the exact remaining task (git commit) left to the main agent.

Constraints: do NOT commit or push (git add only). Do NOT touch package-lock.json. Do NOT touch pages/, components/, or any app code. Do NOT edit .env. Reply with a concise summary at the end.

## Acceptance Contract
Acceptance level: attested
Completion is not accepted from prose alone. End with a structured acceptance report.

Criteria:
- criterion-1: Return concrete findings with file paths and severity when applicable

Required evidence: review-findings, residual-risks

Finish with a fenced JSON block tagged `acceptance-report` in this shape:
Use empty arrays when no items apply; array fields contain strings unless object entries are shown.
`criteriaSatisfied[].status` must be exactly one of: satisfied, not-satisfied, not-applicable.
`commandsRun[].result` must be exactly one of: passed, failed, not-run.
`manualNotes` and `notes` are optional strings; an empty string means no note and does not satisfy `manual-notes` evidence.
```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "specific proof"
    }
  ],
  "changedFiles": [
    "src/file.ts"
  ],
  "testsAddedOrUpdated": [
    "test/file.test.ts"
  ],
  "commandsRun": [
    {
      "command": "command",
      "result": "passed",
      "summary": "short result"
    }
  ],
  "validationOutput": [
    "validation output or concise summary"
  ],
  "residualRisks": [
    "none"
  ],
  "noStagedFiles": true,
  "diffSummary": "short description of the diff",
  "reviewFindings": [
    "blocker: file.ts:12 - issue found, or no blockers"
  ],
  "manualNotes": "anything else the parent should know"
}
```