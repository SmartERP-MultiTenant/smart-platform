# Task for worker

You are a delegated subagent running from a fork of the parent session. Treat the inherited conversation as reference-only context, not a live thread to continue. Do not continue or answer prior messages as if they are waiting for a reply. Your sole job is to execute the task below and return a focused result for that task using your tools.

Task:
Work in /mnt/Projects/Kayan/website/saas-starter-kit. An independent reviewer found documentation errors in the staged context work. Fix ALL of the following precisely. Do NOT commit — stage only. Do not touch app code or .env.

FACT CHECK (verified against source): `lib/env.ts` is a plain object reading `process.env` — there is NO zod validation anywhere in it. `middleware.ts` allowlist contains only the exact routes `/api/webhooks/stripe` and `/api/webhooks/dsync` (NOT a `/api/webhooks/*` wildcard).

APPLY THESE EDITS:

1. **AGENTS.md §1 (pre-flight list)** — the category list on lines 11-12 currently names 5 dirs and omits `context-system`. Add it so all 6 categories are listed, matching §6's table.

2. **AGENTS.md §5 Env line** — replace "`.env` (gitignored) validated at boot by `lib/env.ts` (zod)." with a true statement: env values are read through a single typed config object in `lib/env.ts` (plain `process.env` reads — no zod validation; missing keys surface as empty/undefined at their use site, not a boot failure).

3. **AGENTS.md §5 Auth line** — "/auth/join accepts any email+password" is imprecise. Change to: signup form requires name, team, email and password (credentials provider, no SMTP needed locally).

4. **`.agents/context/navigation.md`** — the category table (lines ~15-19) lists only 5 categories and omits `context-system`, violating the rule in context-system/navigation.md that "top-level navigation.md lists all categories". Add a `context-system` row mirroring the one in AGENTS.md §6 ("Rules for the knowledge base itself" / priority high). Bump its `Updated:` date to 2026-08-20.

5. **`.agents/context/quick-start.md`** — (a) the "Key constraints" section says ".env values validated at boot by `lib/env.ts` (zod) — missing keys fail fast." — correct it to the true statement (see item 2). (b) The `## Status (2026-08-17)` heading is stale relative to the file's `Updated: 2026-08-20` and content — change to `## Status (2026-08-20)`.

6. **`.agents/context/lookup/env-vars.md` line 5** — "Validated at boot by `lib/env.ts` (zod)." → true statement: "Read through the single config object in `lib/env.ts` (plain process.env reads — no zod validation)." Bump Updated to 2026-08-20 if not already.

7. **`.agents/context/guides/add-route.md` line 13** — "env through `lib/env.ts` (zod-validated)" → "env through `lib/env.ts` (plain process.env config object)".

8. **`.agents/context/lookup/stack-and-paths.md`** — file-map row for `lib/` currently says "`env.ts` (zod env)" → "`env.ts` (env config object)".

9. **`.agents/context/best-practices/security.md`** — two corrections in the Key points:
   a. "Input validation is centralized. All API bodies pass `validateWithSchema(zodSchema, body)` from `lib/zod/index.ts` → throws `ApiError(422, …)`. Server routes validate with zod; never trust `req.body` raw. `lib/env.ts` also validates env shape (zod) and fails fast on missing keys."
      → Replace with: "Input validation is centralized for most API routes via `validateWithSchema(zodSchema, body)` from `lib/zod/index.ts` → throws `ApiError(422, …)`. Caveat: `pages/api/oauth/token.ts`, `pages/api/oauth/saml.ts` and `pages/api/webhooks/dsync.ts` read raw `req.body` without a schema — validate before trusting them in new code. Env is read through `lib/env.ts` (plain process.env config object, no zod validation)."
   b. "Secrets live only in `.env` … accessed via `lib/env.ts` only, never hardcoded, never shipped." → append the caveat: "(exception: the standalone scripts `sync-stripe.js` and `delete-team.js` read env directly via `process.env`)". Bump Updated to 2026-08-20.

10. **`.agents/context/architecture/security.md`** — the public-allowlist bullet says `/api/webhooks/*`; middleware.ts only allows `/api/webhooks/stripe` and `/api/webhooks/dsync`. Correct that token to the two exact routes.

11. **UPGRADE `check-context.js`** — add a check: every category directory under .agents/context must be listed in the top-level `navigation.md` (parse category links from the table). This catches exactly the omission found in item 4. Also update the script's summary line to mention this check. Keep it dependency-free.

12. Run `node check-context.js` — must PASS (exit 0) after the navigation.md fix. Run `grep -rn 'zod' .agents/context/` — the only remaining zod mentions must be the legitimate one in best-practices/security.md ("validateWithSchema(zodSchema, body) from lib/zod/index.ts") and any mention of `lib/zod/` as a library path (NOT "zod-validated" or "env shape (zod)" claims). Run `npx prettier --write` on all touched files. Then `git add` the touched files (AGENTS.md, .agents/context/*, check-context.js) — no commit.

Report: list each of the 12 items with PASS, plus the final validation outputs (check-context.js exit code, grep results, staged file list).

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