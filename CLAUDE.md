# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A k6 performance-testing framework covering three protocols — REST, GraphQL, and Postgres (via the `k6/x/sql` Go extension) — with results reportable to a self-hosted Grafana dashboard (Prometheus remote-write) or k6's built-in HTML dashboard. Test scripts are plain TypeScript, run natively by k6 (no bundler). See `README.md` for the full user-facing walkthrough; this file is about working _on_ the framework itself.

## Commands

```bash
npm install                       # dev tooling only (lint/typecheck) — k6 never touches node_modules
npm run lint                      # eslint .
npm run typecheck                 # tsc --noEmit
npm run format / format:check     # prettier

k6 run tests/rest/smoke.ts        # run any single REST/GraphQL test file directly
k6 run tests/graphql/load.ts
k6 run --vus 1 --duration 5s tests/rest/load.ts   # quick structural check, CLI overrides options.scenarios
k6 inspect tests/rest/spike.ts    # parse + resolve options WITHOUT running iterations (fast sanity check)

npm run test:rest:<smoke|load|stress|soak|spike>
npm run test:graphql:<smoke|load|stress|soak|spike>

npm run test:db:smoke              # plain `k6 run` — k6 auto-provisions k6/x/sql (v1.2.0+); requires dashboard:up first
npm run test:db:load
npm run build:k6-sql                # OPTIONAL: pinned/offline ./bin/k6-sql (gitignored), not needed for normal use

npm run dashboard:up               # docker compose up -d: Prometheus + Grafana + seeded Postgres
npm run dashboard:down
npm run dashboard:logs

K6_WEB_DASHBOARD=true K6_WEB_DASHBOARD_EXPORT=reports/x.html k6 run tests/rest/smoke.ts
K6_PROMETHEUS_RW_SERVER_URL=http://localhost:9090/api/v1/write k6 run --out experimental-prometheus-rw tests/rest/load.ts
```

There is no single "run all tests" command by design — `load`/`stress`/`soak`/`spike` should never run unattended against the shared public demo targets (see Known constraints below). CI (`.github/workflows/ci.yml`) only ever runs the `smoke` tests.

## Architecture

**Layering**: `src/config/` (env + scenario factories) → `src/lib/` (protocol clients, metrics, auth, journeys) → `tests/<protocol>/<type>.ts` (thin entrypoints that pick a scenario + call a journey). When adding a new test, compose from existing layers rather than writing request logic directly in a test file — see the `k6-test-generator` skill in `.claude/skills/`.

- **`src/config/scenarios.ts`** — `smokeScenario()` / `loadScenario()` / `stressScenario()` / `soakScenario()` / `spikeScenario()` are factories returning k6 executor configs (`constant-vus`, `ramping-vus`, `ramping-arrival-rate`), each overridable via a partial-object argument. `buildOptions({ protocol, testType, scenario, thresholds })` merges a scenario + thresholds + `{ protocol, test_type }` run tags into a k6 `Options` object — every test file calls this exactly once. This is the single place scenario intensity is defined; never inline a raw `stages`/`executor` block in a test file.
- **`src/config/env.ts`** — reads `__ENV` with defaults, and exposes `SLO` (HTTP) and `DB_SLO` (Postgres, much tighter latency numbers) keyed by `TEST_ENV` (`demo`/`staging`/`production`). Thresholds in every test file derive from these, never hardcoded numbers.
- **Protocol clients** (`src/lib/http/restClient.ts`, `graphqlClient.ts`, `src/lib/db/pgClient.ts`) — each wraps the underlying k6 module (`k6/http`, `k6/x/sql`) and _requires_ a low-cardinality tag on every call (`name` for REST/DB, `operationName` for GraphQL) to avoid tag-cardinality blowups in Prometheus/Grafana. Each records into its own protocol-scoped custom metrics from `src/lib/metrics.ts` (`<protocol>_error_rate`, `<protocol>_req_duration`/`query_duration`, `<protocol>_requests_total`/`queries_total`) — distinct from k6's built-in `http_req_*` metrics so dashboards can tell protocols apart. Follow this pattern (required tag param, check + record on every call) for any new protocol client.
- **`src/lib/journeys/`** — the actual multi-request business logic (`restPizzaJourney.ts`, `graphqlCountryJourney.ts`, `dbCatalogJourney.ts`), reused by `load`/`stress`/`soak`/`spike` test files for a given protocol so request logic exists in exactly one place. `smoke.ts` files intentionally have their own inline logic (they exercise a fuller path, e.g. the REST auth chain) rather than reusing the load journey.
- **`src/lib/auth.ts`** — QuickPizza's real csrf→login→token chain (verified against the live API). Only `tests/rest/smoke.ts` calls `registerUser()`; `load`/`stress`/`soak`/`spike` reuse the shared static demo token instead, to avoid spamming the shared public QuickPizza database with throwaway accounts under load. Don't change this without re-reading that rationale.

**k6 execution model gotchas that shape this codebase** (get these wrong and things silently misbehave, not error):

- Module top-level code re-runs once per VU (plus once more for the dedicated setup/teardown context). `SharedArray` and `open()` calls are placed at module top-level for exactly this reason — e.g. `src/lib/journeys/graphqlCountryJourney.ts` and `src/lib/db/pgClient.ts` (`sql.open()`) rely on this. Never move an `open()`/`SharedArray`/`sql.open()` call inside an exported function — it'll fail or silently reload every iteration.
- Relative imports need the literal `.ts` extension (`'../../config/env.ts'`, not `'../../config/env'`) — k6's loader doesn't do Node-style extension resolution. `tsconfig.json` has `allowImportingTsExtensions: true` specifically so `tsc` accepts this.
- No `node_modules` resolution at all. Third-party libraries are imported by full CDN URL (`https://jslib.k6.io/k6-utils/1.6.0/index.js`) with a matching ambient `declare module '<url>'` block in `src/types/jslib.d.ts` so `tsc` can type-check the import. `k6/x/sql` gets the same treatment in `src/types/xk6-sql.d.ts` (adapted from the extension's own hosted `.d.ts`).
- `devDependencies` in `package.json` power `npm run lint`/`typecheck`/editor IntelliSense only — they play no role in what k6 actually executes.

**`k6/x/sql` needs no custom binary in normal use**: `k6/x/sql` (xk6-sql) is a Go extension, but k6 v1.2.0+'s [automatic extension resolution](https://grafana.com/docs/k6/latest/extensions/run/#use-automatic-extension-resolution) detects the import and transparently provisions + caches a binary with it on first `k6 run` — confirmed working in this repo (no local Go toolchain needed). `scripts/build-k6-sql.sh` is an opt-in fallback for pinned/offline builds only; don't assume `tests/db/*` requires it.

**Reporting duality**: `K6_WEB_DASHBOARD=true` gives a quick local HTML/live summary for ad-hoc runs; `--out experimental-prometheus-rw` (flag name is correct — this k6 output is still experimental, not renamed) streams metrics into the `docker compose` Prometheus+Grafana stack (`docker/`) for anything meant to be watched live or compared across runs. The Grafana dashboard (`docker/grafana/provisioning/dashboards/k6-prometheus.json`) is vendored from the official community dashboard (ID 19665) — only has panels for k6's built-in HTTP metrics; see README's "Custom metrics in Grafana" for PromQL to chart the custom `<protocol>_*` metrics.

## Known constraints (don't "fix" these — they're expected)

- **countries.trevorblades.com** (GraphQL demo target) rate-limits at ~50-60 req/min. `tests/graphql/smoke.ts` is deliberately paced (1 VU + `sleep(2)`) to stay under that and is a reliable CI gate; `load`/`stress`/`soak`/`spike` will show real `429`s from the demo API at actual load intensity — that's the public API's limiter, not a bug in the framework.
- **QuickPizza** (REST demo target) is Grafana's own dedicated load-testing service and has no such limit.
- Neither `xk6-faker` nor `@faker-js/faker` is used (both would require a build step this framework deliberately avoids for JS/TS) — test data comes from `k6-jslib-utils` + hand-authored JSON fixtures in `src/data/`.

## Working on this repo with Claude Code

`.claude/skills/` has four project skills for common workflows here:

- **`k6-perf-planning`** — use before writing a new test suite for a new target; walks through picking SLOs, scenario shapes, and which test types actually make sense for that target.
- **`k6-test-generator`** — use to scaffold a new protocol/test-type suite following the conventions above (client wrapper, journey, metrics, test entrypoints).
- **`k6-framework-maintenance`** — use periodically or when something in the stack seems stale/broken: pinned version audits (Docker images, jslib CDN version, vendored dashboard), demo-endpoint health checks, dependency bumps.
- **`k6-pr-check`** — use before approving/merging a PR; runs format/lint/typecheck/smoke plus the convention checklist above (scenario factories, threshold sourcing, tagging, journeys-not-duplication, CI hygiene, doc sync) and reports findings via `ReportFindings`.
