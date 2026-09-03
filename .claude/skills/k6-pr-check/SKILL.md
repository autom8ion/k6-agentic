---
name: k6-pr-check
description: Use before approving/merging a PR in this repo, or when asked to check/review a PR. Runs the PR's changes through this framework's verification pipeline (format/lint/typecheck/smoke) plus a convention checklist specific to this codebase, before sign-off. Trigger phrases like "check this PR", "run PR checks", "is PR #12 ready to merge", "review this PR". Target defaults to the current branch's diff against main if no PR is specified.
---

# k6 framework PR check

Goal: catch the failure modes that generic code review misses in this repo — a new test that bypasses the scenario-factory/threshold/tagging conventions, `load`/`stress`/`soak`/`spike` accidentally wired into CI, a client wrapper with no ambient type declaration, a new external target nobody actually verified with `curl`. This is a convention/policy check specific to this framework, not a substitute for `/code-review` — run that too (or point the user at it) if the diff has non-trivial logic changes worth a deeper correctness pass.

## 1. Identify the target

- A PR number or URL → `gh pr view <target> --json number,title,headRefName,body` and `gh pr diff <target>`.
- No target given → check the current branch's diff against `main` (`git diff main...HEAD` / `git status`). Say clearly which you're using.

## 2. Run the verification pipeline

```bash
npm ci
npm run format:check
npm run lint
npm run typecheck
```

Then run smoke tests only for the protocols the diff actually touches (`src/lib/http/rest*`, `tests/rest/*` → REST; `graphql*` → GraphQL; `src/lib/db/*`, `tests/db/*` → DB). Don't run `load`/`stress`/`soak`/`spike` — same rule as CI, these shouldn't run unattended against shared targets.

```bash
k6 run tests/rest/smoke.ts        # only if touched
k6 run tests/graphql/smoke.ts     # only if touched
k6 run tests/db/smoke.ts          # only if touched (needs `npm run dashboard:up` for Postgres)
```

If a PR target is set, also check `gh pr checks <target>` for the actual CI run's status rather than only relying on your local reproduction — a green local run doesn't guarantee CI matches (different environment, network access to demo targets, etc).

## 3. Convention checklist

Walk the diff against each of these; only flag genuine violations, not stylistic preferences the diff is free to make:

- **Scenarios**: new/changed `tests/<protocol>/<type>.ts` calls `buildOptions()` with one of the `src/config/scenarios.ts` factories (`smokeScenario`/`loadScenario`/`stressScenario`/`soakScenario`/`spikeScenario`) — no raw inline `stages`/`executor` object in a test file.
- **Thresholds**: derived from `SLO`/`DB_SLO` (or a new profile map following that pattern) in `src/config/env.ts` — no hardcoded magic latency/error numbers in a test file.
- **Tagging discipline**: any new call through a protocol client (`restClient`, `graphqlRequest`, `pgQuery`/`pgExec`, or a new one) passes a required low-cardinality tag (`name`/`operationName`) — never a raw parameterized URL or query string as a tag.
- **Journeys, not duplication**: `load`/`stress`/`soak`/`spike` request logic lives in `src/lib/journeys/`, reused across test-type files for a protocol — not copy-pasted per file.
- **CI hygiene**: `.github/workflows/ci.yml` only runs `smoke` tests. A PR that adds `load`/`stress`/`soak`/`spike` (or a full suite run) to CI is a real finding, not a style nit — flag it.
- **Types for non-npm imports**: any new CDN-URL import (`jslib.k6.io/...`) or Go-extension module (`k6/x/sql/...`) import has a matching `declare module` block in `src/types/`. Missing this silently breaks `npm run typecheck`'s usefulness rather than erroring loudly.
- **New protocol/target verified for real**: if the PR adds a new external target or client, check the PR description/commits for evidence it was actually exercised against the real target (a `curl` transcript, or the test itself having been run and shown passing) — this repo's established practice (see `CLAUDE.md`, `k6-test-generator` skill) is "verify shapes with curl before writing code," not guessing from documentation. A plausible-looking but never-run integration is a finding.
- **Docs kept in sync**: a new protocol/target/toolchain requirement should update `README.md` (Highlights, project layout, Prerequisites, Known constraints/Deliberate tradeoffs as relevant) and `CLAUDE.md` (Architecture, Known constraints). A structural addition with no doc updates is a finding, not just a nice-to-have.
- **Secrets**: no hardcoded credentials/tokens — config comes through `src/config/env.ts` / `.env.example`, matching the existing `__ENV.X ?? 'default'` pattern.

## 4. Report

Report findings via the `ReportFindings` tool (most severe first — a broken/missing convention that will bite the next contributor ranks above a nit), with file/line references from the diff. Separately, summarize the pipeline results (format/lint/typecheck/smoke pass or fail, and PR CI status if checked) in a short pass/fail line before the findings — that's the actual go/no-go signal, findings are what to fix before it's a clean go.

If everything passes and no convention violations are found, say so plainly and briefly — don't manufacture findings to seem thorough.
