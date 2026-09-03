import { group } from 'k6';
import type { Options } from 'k6/options';
import { smokeScenario, buildOptions } from '../../src/config/scenarios.ts';
import { DB_SLO } from '../../src/config/env.ts';
import { closeDb, pgQuery } from '../../src/lib/db/pgClient.ts';

// `k6/x/sql` is a Go extension, but k6 v1.2.0+ auto-provisions it on first
// run (no manual xk6 build needed) -- see README.md "Database performance
// testing" for details and the offline/pinned-version fallback.
export const options: Options = buildOptions({
  protocol: 'db',
  testType: 'smoke',
  scenario: smokeScenario({ vus: 2, duration: '20s' }),
  thresholds: {
    db_error_rate: [{ threshold: 'rate<0.01', abortOnFail: true }],
    db_query_duration: [`p(95)<${DB_SLO.p95Ms}`],
    checks: ['rate>0.99'],
  },
});

export function teardown(): void {
  closeDb();
}

export default function (): void {
  group('DB health', () => {
    pgQuery('SELECT 1 AS ok;', [], { name: 'SELECT 1 health check' });
    pgQuery('SELECT * FROM products WHERE id = $1;', [1], { name: 'SELECT product by id' });
  });
}
