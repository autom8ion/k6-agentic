---
name: k6-test-generator
description: Use to scaffold a new k6 test suite in this repo — a new test type for an existing protocol (REST/GraphQL/DB), or a whole new target/protocol. Follows this framework's client-wrapper/journey/scenario-factory conventions instead of writing ad-hoc request logic. Trigger phrases like "add a new k6 test for", "generate a load test for", "scaffold a stress test", or "add stress/soak/spike to the db tests".
---

# k6 test generation

Goal: add a new test (or a whole new target) that looks and behaves like the rest of this repo — reusing `src/config/scenarios.ts` factories, following the client-wrapper tagging pattern, and landing in the right place — rather than a one-off script that duplicates logic already sitting in `src/lib/`.

If there's no settled SLO/scenario-sizing/test-type decision yet for this target, run the `k6-perf-planning` skill first (or work through its checklist inline) — don't guess thresholds or scenario sizes.

## Before writing any code: verify the target for real

This repo's existing tests (`tests/rest/*`, `tests/graphql/*`) were built by `curl`-ing the real target first and matching request/response shapes exactly — guessed API shapes caused real bugs during development (wrong field names, wrong auth header format). Do the same here:

- `curl` the actual endpoint(s)/query you're about to script. Confirm exact request body shape, exact response field names, exact status codes, exact auth header format.
- If it's a GraphQL API, send the real query via `curl -X POST ... -d '{"query": "..."}'` and check the response shape — don't assume a schema.
- If it's a database, connect (or at least know the schema) and confirm table/column names and index coverage for the queries you're about to write — an "indexed lookup" query that isn't actually indexed is a different (and misleading) kind of test.
- If the target is a shared/public service, send a few requests in quick succession and watch for rate-limiting (see `k6-perf-planning`'s point 2) before assuming `load`/`stress`/`spike` traffic patterns are viable against it.

## Where things go (existing protocols: REST, GraphQL, DB)

For a **new test type on an existing protocol** (e.g. adding `stress.ts` to `tests/db/`, which today only has `smoke`/`load`):

1. If a journey function for the shared request logic doesn't exist yet for this protocol, check `src/lib/journeys/` — `restPizzaJourney.ts`, `graphqlCountryJourney.ts`, `dbCatalogJourney.ts` are the existing examples. Reuse it; don't duplicate its request logic into the new test file.
2. Create `tests/<protocol>/<type>.ts` following the shape of the sibling files exactly:
   ```ts
   import type { Options } from 'k6/options';
   import { <type>Scenario, buildOptions } from '../../src/config/scenarios.ts';
   import { SLO } from '../../src/config/env.ts'; // or DB_SLO for tests/db/
   import { <journeyFn> } from '../../src/lib/journeys/<journey>.ts';

   export const options: Options = buildOptions({
     protocol: '<rest|graphql|db>',
     testType: '<type>',
     scenario: <type>Scenario(/* overrides from planning, if any */),
     thresholds: {
       /* derive from SLO/DB_SLO, don't hardcode numbers */
     },
   });

   export default function (): void {
     <journeyFn>();
   }
   ```
3. Add the npm script to `package.json` (`test:<protocol>:<type>`) following the existing naming pattern.
4. Only add `smoke` tests to `.github/workflows/ci.yml` — never `load`/`stress`/`soak`/`spike` (see `CLAUDE.md` "Known constraints").
5. Run `npm run lint && npm run typecheck`, then `k6 inspect tests/<protocol>/<type>.ts` to confirm the scenario/thresholds resolve correctly without running a full load — cheap and catches config mistakes immediately. Then actually run it (short-circuited with `k6 run --vus 1 --duration 5s <file>` first if it's a load-shaped scenario) against the real target and confirm it passes before considering it done.

## Adding a whole new protocol/target

1. **Env + config**: add `<PROTOCOL>_BASE_URL` (or equivalent) to `src/config/env.ts` and `.env.example`, with the same `__ENV.X ?? 'default'` pattern. If it needs its own SLO scale (like `DB_SLO` does relative to `SLO`), add a new profile map rather than forcing it into the existing one.
2. **Client wrapper**: add `src/lib/<protocol>/<name>Client.ts` (or `src/lib/http/<name>Client.ts` for another HTTP-based protocol) wrapping the underlying k6 module. Match the existing pattern exactly:
   - a required, low-cardinality tag parameter on every call (`name` or an equivalent) — never let a raw parameterized URL/query become a tag,
   - a `check()` on every call,
   - recording into protocol-scoped custom metrics (next step),
   - `console.error` on failure with enough context to debug from CI logs alone.
3. **Metrics**: add `<protocol>ErrorRate` (Rate), `<protocol>ReqDuration`/`QueryDuration` (Trend, `true` for time units), `<protocol>RequestsTotal`/`QueriesTotal` (Counter) to `src/lib/metrics.ts`, following the existing three-per-protocol shape.
4. **Types**: if the protocol needs a non-npm import (a CDN URL like jslib, or a Go extension module like `k6/x/sql`), add an ambient `declare module` block to `src/types/` — see `jslib.d.ts` and `xk6-sql.d.ts` for the two existing patterns. Don't skip this; it's what keeps `npm run typecheck` meaningful.
5. **Protocol type**: add the new protocol to the `Protocol` union in `src/config/scenarios.ts`, and check whether `buildOptions()`'s default thresholds (currently `http_req_failed`, skipped for `db`) make sense for it — skip them the same way `db` does if the protocol doesn't generate that metric.
6. **Journey + tests**: same as the "existing protocol" section above — start with `smoke` + `load` (see `k6-perf-planning` point 4 on when the rest are worth it).
7. **README**: update the Highlights list, project layout tree, prerequisites (if a new toolchain like Go/Docker is now required), the test-types/"Known constraints" sections if relevant, and add a section analogous to "Database performance testing" if the new protocol needs its own non-trivial setup (a build step, a seeded datastore, etc.).
8. **CLAUDE.md**: update the Architecture section with the new client/journey, and Known constraints if the new target has any (rate limits, shared-resource concerns, a required build step).

## After scaffolding

Always finish with: `npm run format`, `npm run lint`, `npm run typecheck`, then actually execute the new smoke test against the real target (not just `k6 inspect`) before calling the work done. A test that only ever ran against `k6 inspect` hasn't been verified.
