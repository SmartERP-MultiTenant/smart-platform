# Task for reviewer

Independently verify a completed task in /mnt/Projects/Kayan/website/saas-starter-kit (SMART ERP SaaS Starter Kit). Do NOT edit anything — read-only review. The task claimed: created root AGENTS.md, removed `.agents` from .gitignore, staged all 21 .agents/context files, fixed stale port refs (3001→4002) in context docs, added check-context.js + `context:validate` npm script, appended CONTRIBUTING.md sections. And it must NOT have committed.

Verify each claim precisely:
1. Read the root AGENTS.md — does it exist? Does it (a) mandate loading .agents/context/ (quick-start → navigation → category) before any task, (b) contain an English-only communication rule (reply in English even when user writes Arabic), (c) contain a context-sync rule (no commit/push without context update), (d) give correct run commands with port 4002, (e) link the 6 context categories? Flag any factual errors (wrong ports, wrong paths, wrong commands).
2. Check .gitignore — the `.agents` line must be GONE; `.pi` should still be ignored. Confirm with `git check-ignore .agents/context/navigation.md` → must print NOTHING (not ignored) and `grep -n agents .gitignore`.
3. Run `git status --short .agents` — ALL files under .agents/context/ must be staged (A or M). Count them — should be 21. Also confirm NOTHING was committed: run `git status` — if you see "Changes to be committed" that's fine, but verify there is no new commit beyond the pre-existing HEAD (run `git log --oneline -1` and compare with the topic's known HEAD ab318a2).
4. Grep for stale ports: `grep -rn '3001' .agents/context/` must return NOTHING. Also confirm 4002 references exist in the corrected files (quick-start.md, guides/run-locally.md, lookup/env-vars.md, errors/no-smtp-login.md).
5. Run `node check-context.js` — must exit 0 and report 21 files. Run `grep -n 'context:validate' package.json` — script must exist. Sanity-check the script logic by reading it: header comment check, per-category navigation.md presence, relative-link resolution, exit codes.
6. Read CONTRIBUTING.md tail — must contain "Context Knowledge Base" (with the no-commit-without-context rule + run npm run context:validate before PR) and "Communication"/English-only sections.
7. Confirm no app code was touched: `git status --short` — the worker's changes should be limited to AGENTS.md, .gitignore, .agents/context/*, check-context.js, package.json, CONTRIBUTING.md. Pre-existing unrelated working-tree changes (pages/, components/, middleware.ts, public/, docs/, .pi-subagents/, .env) are expected and NOT part of this task — do not flag them.

Return a verdict: PASS or FAIL per item, with the exact evidence (file paths, command outputs, counts) for each. List any discrepancies or factual errors you find in AGENTS.md or the context docs. Be strict — your job is to catch what the worker missed.

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