import type { Options } from 'k6/options';
import { loadScenario, buildOptions } from '../../src/config/scenarios.ts';
import { SLO } from '../../src/config/env.ts';
import { countryLookupJourney } from '../../src/lib/journeys/graphqlCountryJourney.ts';

export const options: Options = buildOptions({
  protocol: 'graphql',
  testType: 'load',
  scenario: loadScenario(),
  thresholds: {
    http_req_duration: [`p(95)<${SLO.p95Ms}`],
    graphql_error_rate: [`rate<${SLO.errorRate}`],
  },
});

export default function (): void {
  countryLookupJourney();
}
