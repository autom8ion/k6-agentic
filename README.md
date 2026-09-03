# k6-agentic

An Agentic Performance Testing Framework in k6

A well-architected [k6](https://k6.io) performance-testing framework supporting both **RESTful** and **GraphQL** APIs, with results reported to a local **Grafana** dashboard (via Prometheus remote-write) and k6's built-in HTML dashboard. "Agentic" describes how this framework was designed and built (with Claude Code) — the tests themselves are ordinary, deterministic k6 scripts with no LLM calls at runtime.

## Highlights

- **TypeScript, run natively by k6** — no bundler, no build step. k6 transpiles `.ts` files directly (type-stripping only; run `npm run typecheck` for real type safety).
- **REST and GraphQL as first-class citizens** — parallel client wrappers (`src/lib/http/restClient.ts`, `src/lib/http/graphqlClient.ts`) with consistent tagging, checks, and custom metrics per protocol.
- **Composable scenarios** — `smoke` / `load` / `stress` / `soak` / `spike` executor factories in `src/config/scenarios.ts`, reused across every test file instead of copy-pasted `options` blocks.
- **Environment-driven SLOs** — thresholds derive from `src/config/env.ts`'s per-`TEST_ENV` SLO profile, not hardcoded numbers.
- **Self-hosted Grafana dashboard, zero manual setup** — `docker compose up` provisions Prometheus + Grafana with the official [k6 Prometheus dashboard](https://grafana.com/grafana/dashboards/19665-k6-prometheus/) pre-loaded.
- **Real example targets, not placeholders** — REST examples run against [QuickPizza](https://quickpizza.grafana.com) (Grafana's own public k6 demo/load-test target); GraphQL examples run against the [Countries GraphQL API](https://countries.trevorblades.com/graphql).

## Project layout

```
src/
  config/       __ENV reader + SLO profiles (env.ts); scenario factories + buildOptions() (scenarios.ts)
  lib/
    http/       restClient.ts, graphqlClient.ts — protocol wrappers with tagging/checks/metrics
    metrics.ts  custom Trend/Rate/Counter metrics, per protocol
    auth.ts     QuickPizza csrf -> login -> token chain
    journeys/   shared request logic reused by load/stress/soak/spike tests
  data/         hand-authored JSON fixtures, loaded via SharedArray
  graphql/      .graphql query files, loaded via open()
tests/
  rest/         smoke.ts, load.ts, stress.ts, soak.ts, spike.ts
  graphql/      smoke.ts, load.ts, stress.ts, soak.ts, spike.ts
docker/         Prometheus config + Grafana provisioning (datasource + dashboard)
```

## Prerequisites

- [k6](https://grafana.com/docs/k6/latest/set-up/install-k6/) v0.57+ (native TypeScript support; this framework was built/verified against k6 v1.5.0)
- Node.js (for linting/type-checking only — k6 never touches `node_modules`)
- Docker + Docker Compose (for the self-hosted Grafana dashboard)

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

## Test types

Every protocol ships all five standard k6 test types, built from the same scenario factories in `src/config/scenarios.ts`:

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
# ...etc, see package.json for the full list
```

## Configuration

Copy `.env.example` to `.env` and adjust as needed (k6 doesn't auto-load `.env` files — `export $(grep -v '^#' .env | xargs)` first, or pass `-e KEY=value` on the command line). Key variables:

- `TEST_ENV` — selects an SLO profile (`demo` / `staging` / `production`) from `src/config/env.ts`.
- `REST_BASE_URL`, `GRAPHQL_URL` — point the framework at your own APIs instead of the public demo targets.

## Known constraints of the public demo targets

- **QuickPizza** (REST) is Grafana's own dedicated load-testing target and comfortably handles real load/stress/spike traffic.
- **Countries GraphQL API** applies IP-based rate limiting (~50-60 requests/min via Stellate). The GraphQL smoke test is tuned to stay well under that budget and is a reliable CI gate; the `load`/`stress`/`soak`/`spike` GraphQL tests are structurally complete and demonstrate the framework's patterns, but at real "load" VU counts you'll see elevated `429`s from the demo API itself — that's the shared public API's rate limiter, not the framework. Point `GRAPHQL_URL` at your own GraphQL service for meaningful load/stress/soak/spike results.
- Because of the above, REST `load`/`stress`/`soak`/`spike` tests reuse a shared static demo token for read/rating traffic rather than registering a fresh user per iteration — only `tests/rest/smoke.ts` (low VUs, short duration) exercises full user registration, to avoid polluting QuickPizza's shared public database with throwaway accounts under sustained load. The full csrf → login → token chain lives in `src/lib/auth.ts` and is safe to reuse against a private target.

## Deliberate tradeoffs

- **No faker library.** Both `xk6-faker` (requires a custom Go-built k6 binary) and `@faker-js/faker` (requires webpack/babel bundling, since k6 can't resolve `node_modules`) conflict with this framework's "native TypeScript, no build step" design. Instead, realistic-looking test data comes from [`k6-jslib-utils`](https://github.com/grafana/k6-jslib-utils) (`randomIntBetween`, `randomItem`, `uuidv4`) plus small hand-authored JSON fixtures in `src/data/`, loaded via `SharedArray`.
- **`node_modules` has no role in test execution.** `package.json`'s `devDependencies` (`typescript`, `@types/k6`, `eslint`, `prettier`) power `npm run lint` / `npm run typecheck` / editor IntelliSense only.

## CI

`.github/workflows/ci.yml` lints, type-checks, then runs only the two smoke tests on every PR (via [`grafana/setup-k6-action`](https://github.com/grafana/setup-k6-action) + [`grafana/run-k6-action`](https://github.com/grafana/run-k6-action)). `load`/`stress`/`soak`/`spike` are intentionally excluded from CI — they shouldn't run automatically against a shared public demo target.
