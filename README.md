# k6-agentic

An Agentic Performance Testing Framework in k6

A well-architected [k6](https://k6.io) performance-testing framework supporting **RESTful**, **GraphQL**, and **SQL database** targets, with results reported to a local **Grafana** dashboard (via Prometheus remote-write) and k6's built-in HTML dashboard. "Agentic" describes how this framework was designed and built (with Claude Code) — the tests themselves are ordinary, deterministic k6 scripts with no LLM calls at runtime.

## Highlights

- **TypeScript, run natively by k6** — no bundler, no build step. k6 transpiles `.ts` files directly (type-stripping only; run `npm run typecheck` for real type safety).
- **REST, GraphQL, and Postgres as first-class citizens** — parallel client wrappers (`src/lib/http/restClient.ts`, `src/lib/http/graphqlClient.ts`, `src/lib/db/pgClient.ts`) with consistent tagging, checks, and custom metrics per protocol.
- **Composable scenarios** — `smoke` / `load` / `stress` / `soak` / `spike` executor factories in `src/config/scenarios.ts`, reused across every test file instead of copy-pasted `options` blocks.
- **Environment-driven SLOs** — thresholds derive from `src/config/env.ts`'s per-`TEST_ENV` SLO profile, not hardcoded numbers (DB queries get their own, much tighter, latency profile than HTTP APIs).
- **Self-hosted Grafana dashboard, zero manual setup** — `docker compose up` provisions Prometheus + Grafana with the official [k6 Prometheus dashboard](https://grafana.com/grafana/dashboards/19665-k6-prometheus/) pre-loaded, plus a seeded Postgres instance for the DB example.
- **Real example targets, not placeholders** — REST examples run against [QuickPizza](https://quickpizza.grafana.com) (Grafana's own public k6 demo/load-test target); GraphQL examples run against the [Countries GraphQL API](https://countries.trevorblades.com/graphql); DB examples run against a locally seeded Postgres catalog/orders schema.

## Project layout

```
src/
  config/       __ENV reader + SLO profiles (env.ts); scenario factories + buildOptions() (scenarios.ts)
  lib/
    http/       restClient.ts, graphqlClient.ts — protocol wrappers with tagging/checks/metrics
    db/         pgClient.ts — k6/x/sql wrapper with the same tagging/checks/metrics pattern
    metrics.ts  custom Trend/Rate/Counter metrics, per protocol
    auth.ts     QuickPizza csrf -> login -> token chain
    journeys/   shared request logic reused by load/stress/soak/spike tests
  data/         hand-authored JSON fixtures, loaded via SharedArray
  graphql/      .graphql query files, loaded via open()
  types/        ambient .d.ts for jslib.k6.io / k6/x/sql CDN & extension imports
tests/
  rest/         smoke.ts, load.ts, stress.ts, soak.ts, spike.ts
  graphql/      smoke.ts, load.ts, stress.ts, soak.ts, spike.ts
  db/           smoke.ts, load.ts (see "Database performance testing" below)
docker/         Prometheus config, Grafana provisioning, Postgres schema + seed
k8s/            k6-operator example — distributed tests/rest/load.ts across pods (see below)
scripts/        build-k6-sql.sh — OPTIONAL pinned/offline binary for tests/db (see below)
.claude/        CLAUDE.md + skills for working on this repo with Claude Code
```

## Prerequisites

- [k6](https://grafana.com/docs/k6/latest/set-up/install-k6/) v1.2.0+ (native TypeScript support since v0.57; `tests/db/*` needs v1.2.0+ for automatic extension resolution — see below. This framework was built/verified against k6 v1.5.0/v1.8.1.)
- Node.js (for linting/type-checking only — k6 never touches `node_modules`)
- Docker + Docker Compose (for the self-hosted Grafana dashboard and Postgres)

## Getting started

```bash
npm install
npm run lint
npm run typecheck
```

### Run a smoke test with the built-in HTML dashboard

```bash
K6_WEB_DASHBOARD=true K6_WEB_DASHBOARD_EXPORT=reports/rest-smoke.html npm run test:rest:smoke
K6_WEB_DASHBOARD=true K6_WEB_DASHBOARD_EXPORT=reports/graphql-smoke.html npm run test:graphql:smoke
```

Open the exported HTML file, or watch live at `http://localhost:5665` while the test runs.

### Bring up the self-hosted Grafana dashboard

```bash
npm run dashboard:up
```

- Grafana: [http://localhost:3000](http://localhost:3000) (`admin` / `admin`, or browse anonymously as a viewer) — the **k6** folder has the official k6 Prometheus dashboard pre-provisioned.
- Prometheus: [http://localhost:9090](http://localhost:9090)

### Stream a load test into Prometheus/Grafana

```bash
K6_PROMETHEUS_RW_SERVER_URL=http://localhost:9090/api/v1/write \
  k6 run --out experimental-prometheus-rw tests/rest/load.ts

K6_PROMETHEUS_RW_SERVER_URL=http://localhost:9090/api/v1/write \
  k6 run --out experimental-prometheus-rw tests/graphql/load.ts
```

Watch the run live in Grafana, filtering by the `protocol` / `test_type` tags to compare REST vs GraphQL panels.

```bash
npm run dashboard:down
```

### Database performance testing

`k6/x/sql` (the [xk6-sql](https://github.com/grafana/xk6-sql) extension) is a **Go** extension, not an npm package — but k6 v1.2.0+ has [automatic extension resolution](https://grafana.com/docs/k6/latest/extensions/run/#use-automatic-extension-resolution): it detects the `k6/x/sql` import, transparently provisions a binary with it and its Postgres driver included, and caches that binary for next time. No manual build step, no Go toolchain required — `k6 run tests/db/smoke.ts` just works, the same as any other test file here (it does need network access the first time, to fetch the provisioned binary).

```bash
# Bring up Postgres (part of the same docker-compose stack as Grafana),
# seeded on first start with a 5,000-product / 200,000-order catalog schema
# (docker/postgres/init/*.sql) sized for realistic indexed-lookup,
# filtered-scan, and write-path perf testing.
npm run dashboard:up

npm run test:db:smoke
npm run test:db:load
```

`tests/db/` intentionally ships only `smoke` and `load` (not the full five test types) — it's a template for the pattern, not a from-the-box exhaustive suite; add `stress`/`soak`/`spike` variants the same way the REST/GraphQL ones are built (reuse `src/config/scenarios.ts` + `src/lib/journeys/dbCatalogJourney.ts`) if you extend it. Query latency thresholds come from `DB_SLO` in `src/config/env.ts` — deliberately much tighter than the HTTP `SLO`, since an indexed Postgres lookup should return in low-single-digit milliseconds, not hundreds.

**If you need a pinned or offline binary** (auto-resolution picks extension versions dynamically and needs network access on first run): `npm run build:k6-sql` builds `./bin/k6-sql` — a drop-in k6 binary with the SQL extension versions fixed — using a local `xk6` install if you have Go, otherwise the `grafana/xk6` Docker image. This is optional; nothing else in the repo needs it.

## Distributed load testing with Kubernetes (k6-operator)

`k8s/` has a [k6-operator](https://github.com/grafana/k6-operator) example that runs `tests/rest/load.ts` across multiple pods for load generation beyond a single machine — REST only (QuickPizza has no rate limit, unlike the GraphQL demo target). It's a manual, opt-in workflow requiring a real cluster, so like `load`/`stress`/`soak`/`spike` it's never wired into CI.

```bash
npm run k8s:build   # build the runner image (bakes in src/ + tests/)
npm run k8s:apply   # install the ConfigMap + TestRun CR
npm run k8s:delete  # tear down
```

See `k8s/README.md` for prerequisites (installing the operator) and details.

## Test types

REST and GraphQL each ship all five standard k6 test types, built from the same scenario factories in `src/config/scenarios.ts`; DB ships `smoke` and `load` (see above):

| Type   | Executor               | Purpose                                           |
| ------ | ---------------------- | ------------------------------------------------- |
| smoke  | `constant-vus`         | Minimal-load sanity check; runs in CI on every PR |
| load   | `ramping-vus`          | Expected production-like traffic                  |
| stress | `ramping-vus`          | Find the breaking point                           |
| soak   | `constant-vus`         | Sustained moderate load; catch leaks/degradation  |
| spike  | `ramping-arrival-rate` | Sudden burst of traffic                           |

```bash
npm run test:rest:load
npm run test:graphql:stress
npm run test:db:load
# ...etc, see package.json for the full list
```

## Configuration

Copy `.env.example` to `.env` and adjust as needed (k6 doesn't auto-load `.env` files — `export $(grep -v '^#' .env | xargs)` first, or pass `-e KEY=value` on the command line). Key variables:

- `TEST_ENV` — selects an SLO profile (`demo` / `staging` / `production`) from `src/config/env.ts`.
- `REST_BASE_URL`, `GRAPHQL_URL`, `POSTGRES_URL` — point the framework at your own APIs/database instead of the public demo targets / local Postgres.

## Custom metrics in Grafana

Every protocol records its own Trend/Rate/Counter metrics (`src/lib/metrics.ts`) tagged by request/operation `name`, distinct from k6's built-ins, so you can build panels per operation. Once pushed via `--out experimental-prometheus-rw`, k6 metric names appear in Prometheus as `k6_<metric>_<stat>` for Trends (e.g. `_p95`, `_avg`, `_min`, `_max`), `k6_<metric>_rate` for Rates, and `k6_<metric>_total` for Counters — for example:

```promql
# p95 REST request duration by endpoint
avg by (name) (k6_rest_req_duration_p95{testid=~"$testid"})

# p95 GraphQL request duration by operation
avg by (name) (k6_graphql_req_duration_p95{testid=~"$testid"})

# p95 DB query duration by query shape
avg by (name) (k6_db_query_duration_p95{testid=~"$testid"})

# DB error rate
k6_db_error_rate_rate{testid=~"$testid"}
```

The provisioned dashboard (ID 19665) only has panels for k6's built-in HTTP metrics — add panels using the queries above (or clone the dashboard) to visualize the custom REST/GraphQL/DB metrics.

## Publishing dashboards to GitHub Pages

`.github/workflows/perf-dashboard.yml` runs the same three smoke suites CI already gates on (REST, GraphQL, DB — see "Known constraints" below for why nothing heavier runs unattended) on every push to `main`, plus manual dispatch. Each run enables k6's built-in web dashboard (`K6_WEB_DASHBOARD=true` + `K6_WEB_DASHBOARD_EXPORT=<path>.html`) alongside the usual `--summary-export=<path>.json`, so a `publish` job can assemble the results into the `gh-pages` branch:

```
gh-pages/
├── index.html              # every published run, newest first
├── data/runs.json          # rolling manifest (last 50 runs): per-protocol pass/fail + key metrics
└── runs/<runId>/
    ├── index.html           # per-run summary with links to the reports below
    ├── rest-dashboard.html  # k6 web dashboard export
    ├── rest-summary.json    # k6 --summary-export
    ├── graphql-dashboard.html / graphql-summary.json
    └── db-dashboard.html / db-summary.json
```

`scripts/publish-dashboard.mjs` does the assembly: it reads whichever protocol artifacts succeeded, seeds itself from the current `gh-pages` content so history accumulates across runs instead of being wiped, and regenerates `index.html` + `data/runs.json`. A single protocol failing (e.g. a transient GraphQL `429`) doesn't block publishing the others — `if: always()` on the `publish` job picks up whatever's there.

Once GitHub Pages is enabled for this repo (Settings → Pages → Build and deployment → Deploy from a branch → `gh-pages` / `/`), the site is live at `https://<org>.github.io/<repo>/`.

### Feeding this into Grafana

`data/runs.json` is plain JSON served over HTTPS, so the self-hosted Grafana instance (`docker compose`, see above) can chart trends across CI runs without a database: add a **JSON API** or **Infinity** datasource (Grafana → Connections → Data sources) pointing at `https://<org>.github.io/<repo>/data/runs.json`, then build a table or time-series panel over fields like `timestamp`, `protocols[].p95Ms`, and `protocols[].errorRatePct`. This is complementary to the Prometheus remote-write dashboard described above, not a replacement — that one is for watching a single run live; `data/runs.json` is for trends across runs over time.

## Known constraints of the public demo targets

- **QuickPizza** (REST) is Grafana's own dedicated load-testing target and comfortably handles real load/stress/spike traffic.
- **Countries GraphQL API** applies IP-based rate limiting (~50-60 requests/min via Stellate). The GraphQL smoke test is tuned to stay well under that budget and is a reliable CI gate; the `load`/`stress`/`soak`/`spike` GraphQL tests are structurally complete and demonstrate the framework's patterns, but at real "load" VU counts you'll see elevated `429`s from the demo API itself — that's the shared public API's rate limiter, not the framework. Point `GRAPHQL_URL` at your own GraphQL service for meaningful load/stress/soak/spike results.
- Because of the above, REST `load`/`stress`/`soak`/`spike` tests reuse a shared static demo token for read/rating traffic rather than registering a fresh user per iteration — only `tests/rest/smoke.ts` (low VUs, short duration) exercises full user registration, to avoid polluting QuickPizza's shared public database with throwaway accounts under sustained load. The full csrf → login → token chain lives in `src/lib/auth.ts` and is safe to reuse against a private target.
- **Postgres** is local/self-hosted (via `docker compose`), so there's no third-party rate limit to worry about — `tests/db/load.ts` generates real load against it.

## Deliberate tradeoffs

- **No faker library.** Both `xk6-faker` (requires a custom Go-built k6 binary) and `@faker-js/faker` (requires webpack/babel bundling, since k6 can't resolve `node_modules`) conflict with this framework's "native TypeScript, no build step" design. Instead, realistic-looking test data comes from [`k6-jslib-utils`](https://github.com/grafana/k6-jslib-utils) (`randomIntBetween`, `randomItem`, `uuidv4`) plus small hand-authored JSON fixtures in `src/data/`, loaded via `SharedArray`.
- **`node_modules` has no role in test execution.** `package.json`'s `devDependencies` (`typescript`, `@types/k6`, `eslint`, `prettier`) power `npm run lint` / `npm run typecheck` / editor IntelliSense only.
- **`tests/db/*` needs k6 v1.2.0+.** `k6/x/sql` is a Go extension, but k6's automatic extension resolution provisions it on demand — no Go toolchain needed for normal use (see "Database performance testing" above). `scripts/build-k6-sql.sh` remains available for the pinned-version/offline case.

## CI

`.github/workflows/ci.yml` has three jobs: `lint-typecheck` (format/lint/typecheck), `smoke-tests` (REST + GraphQL smoke, via [`grafana/setup-k6-action`](https://github.com/grafana/setup-k6-action) + [`grafana/run-k6-action`](https://github.com/grafana/run-k6-action)), and `db-smoke-test` (spins up a Postgres service container, seeds it, runs `tests/db/smoke.ts` via plain `k6 run` — k6's automatic extension resolution handles `k6/x/sql`, no separate build step). `load`/`stress`/`soak`/`spike` are intentionally excluded from CI — they shouldn't run automatically against a shared target.

`.github/workflows/perf-dashboard.yml` runs on push to `main` (plus manual dispatch) and publishes the same smoke suites' k6 web-dashboard HTML + summary JSON to GitHub Pages — see "Publishing dashboards to GitHub Pages" above.
