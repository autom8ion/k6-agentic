---
name: k6-perf-planning
description: Use before writing a new k6 test suite for a new target (REST, GraphQL, or DB) in this repo. Walks through picking SLOs, which test types actually make sense, and scenario sizing, before any code gets written. Trigger phrases like "plan a load test for", "help me test the performance of", "what test types do I need for", or when the user names a new API/DB to test.
---

# k6 performance test planning

Goal: turn "we need to performance-test X" into a concrete, justified spec — target SLOs, which of smoke/load/stress/soak/spike are actually worth building, and roughly how big each scenario should be — **before** touching `src/config/scenarios.ts` or writing a test file. Do not start scaffolding code from this skill; hand the resulting spec to the `k6-test-generator` skill (or do it yourself) once it's settled.

This is a conversation, not a form — use `AskUserQuestion` for anything genuinely undetermined rather than guessing, but don't ask about things you can find out yourself (read the target's OpenAPI/GraphQL schema, `curl` a health endpoint, check existing docs).

## Checklist to work through

1. **Identify the target precisely.**
   - Protocol: REST, GraphQL, or a SQL database (only Postgres has a client wrapper today — `src/lib/db/pgClient.ts`; a new DB engine needs a new `k6/x/sql/driver/<engine>` and possibly a new ambient declaration in `src/types/xk6-sql.d.ts`).
   - Base URL / connection string, and which env var will hold it (follow the `<PROTOCOL>_BASE_URL` / `POSTGRES_URL` naming already in `src/config/env.ts`).
   - Auth requirements — token, session cookie, API key? Look at `src/lib/auth.ts` for the shape of an existing chained-auth example (QuickPizza's csrf→login→token) if the new target needs something similar.

2. **Is this target shared/public, or private/dedicated?** This determines almost everything else:
   - **Shared/public** (someone else's demo API, a free-tier service): check for rate limits _before_ assuming you can run `load`/`stress`/`spike` at any real intensity — `curl` it a handful of times in a tight loop and see if you get 429s/errors. If it's rate-limited (like `countries.trevorblades.com` in this repo — ~50-60 req/min), say so explicitly: real load/stress/soak/spike testing needs a private/dedicated target, and the shared one is only good for a paced smoke test. Don't design a "load" scenario that will just spam 429s and call it done.
   - **Private/dedicated** (your own service, a local Postgres, a target that expects load): all five test types are fair game.

3. **Pick SLO numbers, don't invent them.** Ask the user (or find in existing docs/SLAs) for a target p95 latency and acceptable error rate. If genuinely nothing exists yet, propose a starting point using the existing profiles as a reference point (`SLO` in `src/config/env.ts` for HTTP: demo/staging/production at 800/500/300ms p95; `DB_SLO` for direct DB queries: 50/30/15ms p95 — DB queries should be roughly an order of magnitude tighter than HTTP round trips) and say clearly that it's a starting guess to refine once you have real data, not a measured target.

4. **Decide which test types earn their keep** — don't build all five reflexively:
   - `smoke` — always. Minimal-load sanity check, cheap, safe to run in CI.
   - `load` — needed if there's an expected/typical traffic pattern worth validating against.
   - `stress` — needed if you actually care where the target breaks (capacity planning, a known scaling concern). Skip it if nobody's asked "how far can this go."
   - `soak` — needed if there's a plausible leak/degradation concern (long-lived connections, growing memory, cache eviction issues). Skip it for a stateless read-only endpoint with no such history.
   - `spike` — needed if the target can plausibly see a sudden burst (a marketing push, a cron-triggered fan-out, a public rate-limiter you want to characterize). Skip it if traffic is inherently smooth.
   - It's fine — and often better — to ship just `smoke` + `load` first (that's exactly what `tests/db/` does in this repo) and add the rest later once there's a real reason to.

5. **Size the scenarios roughly**, referencing `src/config/scenarios.ts`'s factories (`smokeScenario`, `loadScenario`, `stressScenario`, `soakScenario`, `spikeScenario`) and their `overrides` parameter:
   - `load`: what VU count / duration approximates real expected concurrency? Don't default to the existing `loadScenario()` numbers (20 VUs) without checking they're sane for this target.
   - `stress`: what's the ramp target that's meaningfully above expected load — 2-5x is typical, but say why.
   - `spike`: what does an actual burst look like for this target (magnitude and duration)? A `ramping-arrival-rate` executor decouples request rate from VU count, which is usually the right shape for a burst.

6. **Write down the resulting spec** as a short summary (protocol, target, env var names, auth approach, SLO numbers with source, which test types and why, rough scenario sizing) before handing off to implementation. This is what `k6-test-generator` should be given.

## Output

End with a concise plan (a few sentences to a short list, not a document) covering points 1-5 above. If the user wants to proceed immediately, say so and move to `k6-test-generator` or implement directly using the same conventions it describes.
