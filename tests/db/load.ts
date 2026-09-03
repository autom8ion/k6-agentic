import type { Options } from 'k6/options';
import { loadScenario, buildOptions } from '../../src/config/scenarios.ts';
import { DB_SLO } from '../../src/config/env.ts';
import { closeDb } from '../../src/lib/db/pgClient.ts';
import { catalogJourney } from '../../src/lib/journeys/dbCatalogJourney.ts';

// `k6/x/sql` auto-provisions on first run with k6 v1.2.0+ -- see
// README.md "Database performance testing".
export const options: Options = buildOptions({
  protocol: 'db',
  testType: 'load',
  scenario: loadScenario(),
  thresholds: {
    db_error_rate: [`rate<${DB_SLO.errorRate}`],
    db_query_duration: [`p(95)<${DB_SLO.p95Ms}`],
  },
});

export function teardown(): void {
  closeDb();
}

export default function (): void {
  catalogJourney();
}
