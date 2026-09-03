import type { Options } from 'k6/options';
import { stressScenario, buildOptions } from '../../src/config/scenarios.ts';
import { SLO } from '../../src/config/env.ts';
import { countryLookupJourney } from '../../src/lib/journeys/graphqlCountryJourney.ts';

export const options: Options = buildOptions({
  protocol: 'graphql',
  testType: 'stress',
  scenario: stressScenario(),
  thresholds: {
    http_req_duration: [`p(95)<${SLO.p95Ms * 2}`],
    graphql_error_rate: [`rate<${SLO.errorRate * 3}`],
  },
});

export default function (): void {
  countryLookupJourney();
}
