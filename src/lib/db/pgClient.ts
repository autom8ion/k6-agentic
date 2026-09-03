import sql from 'k6/x/sql';
import driver from 'k6/x/sql/driver/postgres';
import { check } from 'k6';
import { dbErrorRate, dbQueriesTotal, dbQueryDuration } from '../metrics.ts';
import { POSTGRES_URL } from '../../config/env.ts';

// sql.open() runs in init context, which k6 re-executes once per VU (and once
// more for the dedicated setup()/teardown() context) -- so each VU gets its
// own connection pool, sized conservatively since ramping-vus scenarios can
// spin up many VUs concurrently.
const db = sql.open(driver, POSTGRES_URL, { max_open_conns: 5, max_idle_conns: 2 });

// Only closes the pool opened by whichever context calls this (see note
// above) -- matches the official xk6-sql example pattern. Call from a test
// file's teardown() to close the setup/teardown context's own connection;
// per-VU pools are cleaned up by the OS when the k6 process exits.
export function closeDb(): void {
  db.close();
}

interface QueryOptions {
  /** Required, low-cardinality tag identifying the query shape (e.g. "SELECT product by id"). */
  name: string;
}

function recordOutcome(ok: boolean, durationMs: number, opts: QueryOptions): void {
  dbQueryDuration.add(durationMs, { name: opts.name });
  dbQueriesTotal.add(1, { name: opts.name });
  dbErrorRate.add(!ok);
  check(ok, { [`${opts.name}: no error`]: () => ok }, { name: opts.name });
}

export function pgQuery<T = Record<string, unknown>>(
  query: string,
  args: unknown[],
  opts: QueryOptions,
): T[] {
  const start = Date.now();
  let ok = true;
  let rows: T[] = [];
  try {
    rows = db.query(query, ...args) as unknown as T[];
  } catch (err) {
    ok = false;
    console.error(`[DB] ${opts.name} failed: ${String(err)}`);
  }
  recordOutcome(ok, Date.now() - start, opts);
  return rows;
}

export function pgExec(
  query: string,
  args: unknown[],
  opts: QueryOptions,
): ReturnType<typeof db.exec> | null {
  const start = Date.now();
  let ok = true;
  let result: ReturnType<typeof db.exec> | null = null;
  try {
    result = db.exec(query, ...args);
  } catch (err) {
    ok = false;
    console.error(`[DB] ${opts.name} failed: ${String(err)}`);
  }
  recordOutcome(ok, Date.now() - start, opts);
  return result;
}
