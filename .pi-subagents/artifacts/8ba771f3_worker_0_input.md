# Task for worker

You are a delegated subagent running from a fork of the parent session. Treat the inherited conversation as reference-only context, not a live thread to continue. Do not continue or answer prior messages as if they are waiting for a reply. Your sole job is to execute the task below and return a focused result for that task using your tools.

Task:
Work in /mnt/Projects/Kayan/website/saas-starter-kit (SMART ERP SaaS Starter Kit, Next.js 15 Pages Router, Prisma+Postgres, NextAuth). The user asked to run every runnable script in package.json and fix all problems it reveals. Environment is ready: Node 24, npm 11, eslint/jest/playwright/prettier/tsc installed, Playwright chromium browsers cached, and the Postgres container `saas-postgres` is Up.

PREFACE (mandatory): read .agents/context/navigation.md + .agents/context/quick-start.md first. These are the project knowledge base — follow its run instructions and constraints.

IMPORTANT CONTEXT: There is WIP landing-redesign work in the working tree (pages/index.tsx, components/defaultLanding/fenoise/, middleware.ts, pages/auth/*, components/auth/MagicLink.tsx, _app/_document) — these are deliberate, in-progress changes the user is actively building. Fix only GENUINE errors these checks reveal (type errors, lint violations, broken imports, failing tests). Do NOT revert, redesign, or "improve" the WIP design work. If a failure comes purely from WIP code and can't be fixed as a type/lint-correctness issue without changing behavior, leave it and report it as a pre-existing WIP issue instead of guessing.

DO NOT RUN (destructive/irrelevant): release, sync-stripe, delete-team, dev, start, playwright:update, test:watch, test:cov. Those touch Stripe API, delete data, or are long-running servers.

EXECUTION ORDER (iterate until green):

1. Quick checks first: `npm run check-locale`, `npm run context:validate`, `npm run check-format`, `npm run check-lint`, `npm run check-types`, `npm run check-unused` (check-unused uses npx knip — it may download; allow a few minutes).
2. Unit tests: `npm test` (jest). Investigate and fix real failures (component/hook/logic/type bugs). If a test failure is caused by WIP code, judge whether fixing the test or the code is correct for an in-progress feature — prefer fixing the failure minimally; if the test encodes stale expectations for a feature being redesigned, report it and leave it, don't rewrite the test wholesale.
3. Database: verify reachability first — `PGPASSWORD=postgres psql -h 127.0.0.1 -p 5433 -U postgres -d saas -c "SELECT 1;"` (if psql not available, use a node pg check via `npx prisma db execute`). If the DB is unreachable, check docker-compose.yml + .env (DATABASE_URL=postgresql://postgres:postgres@localhost:5433/saas) and restart the container (`docker restart saas-postgres`), then retry.
4. Build: `npm run build` (does prisma generate && prisma db push && next build). Fix build errors (TypeScript in build, static generation, missing assets, import errors). If `prisma db push` fails due to schema/env issues, diagnose from the error and fix minimally.
5. E2E: read playwright.config.ts first — check if it self-hosts the server (webServer config) or expects a running one. If it needs a running server, start `npm run dev` in the background (nohup or `npm run dev > /tmp/next-dev.log 2>&1 &`), wait for it to respond on port 4002, then run `npm run test:e2e`. Kill the background server afterwards. Playwright tests that fail due to real app regressions: fix them; tests that fail because the WIP landing/auth redesign changed the UI they assert on: report as WIP-related, do not rewrite the tests to match unfinished UI.
6. Re-run everything after fixes until all pass. Final gate: check-format, check-lint, check-types, check-locale, context:validate, npm test, npm run build all green. test:e2e green unless failures are WIP-related (report precisely).

FIX DISCIPLINE: minimal, surgical changes only. Never change app behavior to satisfy a lint rule. For formatting, run `npx prettier --write` on the affected files. For lint, prefer targeted eslint-disable comments with justification over rewriting logic. Type errors: fix the type, not the logic. Keep a log of every fix: file, what was wrong, what you changed.

After each script run, record the result. At the end report: per-script table (script → PASS/FAIL → fix applied), the list of files you changed, any remaining WIP-related failures you deliberately did NOT fix (with reasons), and the exact final commands you ran to verify green. Do NOT commit anything. Do NOT push.

## Acceptance Contract
Acceptance level: checked
Completion is not accepted from prose alone. End with a structured acceptance report.

Criteria:
- criterion-1: Implement the requested change without widening scope
- criterion-2: Return evidence sufficient for an independent acceptance review

Required evidence: changed-files, tests-added, commands-run, residual-risks, no-staged-files

Review gate: required by reviewer.

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
    },
    {
      "id": "criterion-2",
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