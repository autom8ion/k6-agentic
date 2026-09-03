---
name: k6-framework-maintenance
description: Use periodically, or when something in this k6 framework seems stale/broken, to audit pinned versions, verify demo/target endpoints are still live, and confirm the test suite still passes. Trigger phrases like "check if this repo is still healthy", "audit dependencies", "is anything out of date here", or when a test that used to pass starts failing for no code-level reason.
---

# k6 framework maintenance

Goal: catch drift before it causes a confusing failure — a demo API that moved (this happened once already: `test-api.k6.io` was retired mid-project and now redirects to `quickpizza.grafana.com`), a Docker image tag that's aged out, a vendored Grafana dashboard that's fallen behind the upstream version. Run through the checklist below, report findings, and only make changes the user has actually asked for or approved — a version bump is low-risk but still a change; propose it, don't silently apply a batch of them.

## 1. Demo/target endpoint health

```bash
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" https://quickpizza.grafana.com/ready
curl -s -X POST https://countries.trevorblades.com/graphql -H "Content-Type: application/json" \
  -d '{"query":"{ continents { code name } }"}'
```

If either has moved, redirects somewhere new, or errors: that's a real finding, not something to route around locally. Check whether the redirect target is itself the new canonical demo service (as `quickpizza.grafana.com` was for the old `test-api.k6.io`) before assuming the test needs a different target entirely. Note the shared-rate-limit caveat on the GraphQL target (see `CLAUDE.md`) — a single 429 isn't drift, a consistently much-lower budget than documented would be.

## 2. Pinned version audit

Check each of these against current upstream and report anything meaningfully behind (a patch version behind isn't worth flagging; a stale major version, or a version with a known issue, is):

- **k6 itself** — `k6 version` vs. current Grafana k6 release. Confirm native TypeScript support assumptions in `CLAUDE.md`/`README.md` still hold (currently: enabled by default since v0.57).
- **Docker images** in `docker-compose.yml`: `prom/prometheus`, `grafana/grafana`, `postgres`. Check current stable tags (Docker Hub API or the project's release notes) before bumping — a Postgres major version bump can be a real migration, not just a version string edit, so flag it rather than doing it unprompted.
- **`jslib.k6.io/k6-utils` version** — hardcoded as a literal CDN URL in every file that imports it (`journeys/graphqlCountryJourney.ts`, `journeys/dbCatalogJourney.ts`, and the ambient declaration in `src/types/jslib.d.ts`). Check https://github.com/grafana/k6-jslib-utils for the current version; if bumping, update the URL _and_ the ambient module declaration together, everywhere it's referenced (`grep -rn "jslib.k6.io/k6-utils" .`).
- **`@types/k6` and other `devDependencies`** in `package.json` — `npm outdated`.
- **xk6-sql / xk6-sql-driver-postgres** — resolved dynamically by k6's automatic extension resolution at `tests/db/*` runtime (no version pin to bump); `scripts/build-k6-sql.sh`'s `@latest` pins only matter if that optional fallback script is actually used. Confirm `npm run test:db:smoke` still passes (see section 4) to catch any upstream extension breakage.
- **GitHub Actions versions** in `.github/workflows/ci.yml` — `actions/checkout`, `actions/setup-node`, `actions/setup-go`, `grafana/setup-k6-action`, `grafana/run-k6-action`.

## 3. Vendored dashboard drift

`docker/grafana/provisioning/dashboards/k6-prometheus.json` is a point-in-time copy of the official community dashboard (Grafana dashboard ID 19665). Re-fetch and diff:

```bash
curl -sL "https://grafana.com/api/dashboards/19665/revisions/latest/download" -o /tmp/k6-prometheus-latest.json
diff docker/grafana/provisioning/dashboards/k6-prometheus.json /tmp/k6-prometheus-latest.json
```

A meaningful diff (new panels, changed queries, schema version bump) is worth pulling in; a trivial `id`/timestamp-only diff isn't. Don't overwrite the vendored file without showing the user what changed.

## 4. Confirm the suite still actually passes

```bash
npm run format:check && npm run lint && npm run typecheck
k6 run tests/rest/smoke.ts
k6 run tests/graphql/smoke.ts
```

If Docker is available:

```bash
npm run dashboard:up
npm run test:db:smoke   # k6 auto-provisions k6/x/sql; a failure here can mean upstream extension breakage
npm run dashboard:down
```

A failure here that isn't explained by section 1 or 2 is a real regression — investigate before dismissing it as "the demo API being flaky."

## Reporting

Summarize findings as a short punch list: what's current (no action needed), what's behind but low-priority, and what's actually broken or needs a decision from the user (an endpoint that moved, a major version bump, a dashboard that materially changed upstream). Don't apply multi-file version bumps or endpoint swaps without the user confirming the direction first — this mirrors how the original `test-api.k6.io` → `quickpizza.grafana.com` migration should be handled if something similar happens again.
