import { group, sleep } from 'k6';
import type { Options } from 'k6/options';
import { smokeScenario, buildOptions } from '../../src/config/scenarios.ts';
import { SLO } from '../../src/config/env.ts';
import { graphqlRequest } from '../../src/lib/http/graphqlClient.ts';

const continentsQuery = open('../../src/graphql/continents.graphql');

// countries.trevorblades.com applies IP-based rate limiting (~50-60
// requests/min via Stellate). Kept to 1 VU + think-time so this stays well
// under that budget and remains a reliable CI gate. See
// src/lib/journeys/graphqlCountryJourney.ts for the load-test-side note.
export const options: Options = buildOptions({
  protocol: 'graphql',
  testType: 'smoke',
  scenario: smokeScenario({ vus: 1, duration: '20s' }),
  thresholds: {
    http_req_duration: [`p(95)<${SLO.p95Ms}`],
    graphql_error_rate: [{ threshold: 'rate<0.01', abortOnFail: true }],
    checks: ['rate>0.99'],
  },
});

export default function (): void {
  group('Continents smoke check', () => {
    graphqlRequest(continentsQuery, {}, { operationName: 'Continents' });
  });
  sleep(2);
}
