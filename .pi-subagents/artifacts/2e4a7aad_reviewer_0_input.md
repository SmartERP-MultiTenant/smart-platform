# Task for reviewer

Independently review a "run scripts + fix problems" task in /mnt/Projects/Kayan/website/saas-starter-kit (Next.js 15 Pages Router + Prisma + Postgres). Read-only — do NOT edit anything, do NOT commit.

CONTEXT: a worker ran the package.json validation suite and fixed issues. Changed files (the task's footprint, all UNSTAGED per policy — do not stage): check-locale.js, locales/en/common.json, .prettierignore, eslint.config.cjs, lib/prisma.ts (+ prettier-formatted docs/audit/01,03,04, docs/smart-erp-design-tokens.json). Everything else modified in the tree (pages/index.tsx, middleware.ts, pages/auth/*, components/auth/*, components/defaultLanding/fenoise/) is pre-existing WIP from the user's landing redesign — verify the worker did NOT touch WIP code (check `git diff` timestamps/scope and diff content for those files — they should be unrelated to the worker's task or absent).

VERIFY THESE CLAIMS WITH EVIDENCE (run the commands yourself):

1. `node check-locale.js` — exit 0. Then confirm the 3 removed keys (sign-up, homepage-title, design-system) are truly unused: grep pages/ components/ lib/ hooks/ models/ styles/ for these exact keys as i18n usage (t('sign-up') etc., not substring matches in prose or other keys). Also confirm the check-locale.js change is the correct Node24 fix (Dirent.path → parentPath, 4 refs) and doesn't break Node 18 compatibility semantics. Read the diff.

2. `npm run check-lint` — must pass (exit 0). Confirm the eslint.config.cjs ignores addition (playwright-report, test-results, report) is justified — those dirs should exist and contain generated junk. Verify the lib/prisma.ts eslint-disable removal is safe (the comment was unnecessary). A grep for `no-var` in lib/ — confirm nothing else references it. Note any residual WIP warnings in the lint output (expected: fenoise <img> warnings) — confirm they're warnings, not errors.

3. `npm run check-types` — exit 0; `npm run check-format` — exit 0 (after prettier). `npm test` — all tests pass (expect 4/4).

4. KNIP TRIAGE — the key judgment call. Run `npx knip` (or `npm run check-unused`) and classify each finding:
   a. Unlisted deps: globals/@eslint/js/@eslint/eslintrc in eslint.config.cjs (loaded via compat.extends — false positive?), openid-client/jose in pages/api/import-hack.ts (read the file + its comment — is it deliberate?).
   b. Unused exports: WelcomeEmail (components/emailTemplates/), default in WelcomeEmail.tsx, getApiKey (models/apiKey.ts), getServiceByPriceId (models/price.ts), getTeamRoles + isTeamAdmin (models/team.ts), cleanup (tests/e2e/support/helper.ts). For EACH: grep the whole repo (excluding node_modules/.next) for real usages. Classify as TRUE dead code (safe to delete later) vs FALSE positive (used somewhere knip can't see — dynamic import, tests, email templates, App Router, page props). Also check whether any relate to the WIP redesign (e.g. WelcomeEmail may be unused because sendWelcomeEmail is being replaced). Recommend: which are safe deletions the parent could do next? Do NOT delete now — report findings.
   c. WIP-related: old defaultLanding/{Hero,Feature,FAQ,Pricing}, ProductNavigation, sendWelcomeEmail, find-dupe-locale.js — just confirm these are unreferenced and plausibly superseded by fenoise/ (check components/defaultLanding/fenoise/ exists and is imported).

5. BUILD — verify `npm run build` is actually green: either check for a fresh BUILD_ID in .next/ and the last build log, or run `npm run build-ci` yourself (prisma generate + next build; skips db push — the DB container saas-postgres is Up, DATABASE_URL=postgresql://postgres:postgres@localhost:5433/saas). If you run it, wait patiently (can take minutes). Report the tail of the build output and whether all routes compiled. The worker said the ONLY build blocker was a sandbox network quirk (next/font fetching Cairo/Almarai from Google Fonts gets an unroutable IPv6) worked around with an IPv4-forcing preload — evaluate: was any repo file changed for this workaround (check git status/diff — next.config.js, _document.tsx, layout files)? If the workaround was purely environmental (env var / hosts / node flag), confirm NO commit-able code change was made for it, because the user's real machine must build without it.

6. E2E — worker says setup/signup spec passed, SSO specs blocked by external mocksaml.com fetch (same network quirk). Read playwright.config.ts + tests/e2e/globalSetup.ts to assess: is the SSO dependency genuinely external (MOCKSAML_ORIGIN), and is the failure environmental rather than a WIP regression? Do NOT run the full e2e suite (slow); a targeted judgment from the config + any test-results/ artifacts is enough.

7. Confirm the worker's claimed footprint is accurate: `git status --short` — the listed files (check-locale.js, common.json, .prettierignore, eslint.config.cjs, lib/prisma.ts, docs/*) should be modified but NOT staged; no other unexpected modifications introduced by the task (distinguish from the ~26 pre-staged files from an earlier AGENTS.md task — those are expected: AGENTS.md, .gitignore, .agents/context/*, check-context.js, package.json, CONTRIBUTING.md; verify those are staged 'A'/'M' and untouched by this task).

OUTPUT: a verdict table — item → PASS/FAIL → evidence (exact command output lines, file:line). Give a clear overall verdict: is the repo in a healthy runnable state, what if anything must still be fixed, and a recommendation list (safe-delete candidates for knip, WIP-broken tests if any). Be strict and evidence-based.

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