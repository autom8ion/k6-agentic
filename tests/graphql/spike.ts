import type { Options } from 'k6/options';
import { spikeScenario, buildOptions } from '../../src/config/scenarios.ts';
import { SLO } from '../../src/config/env.ts';
import { countryLookupJourney } from '../../src/lib/journeys/graphqlCountryJourney.ts';

export const options: Options = buildOptions({
  protocol: 'graphql',
  testType: 'spike',
  scenario: spikeScenario(),
  thresholds: {
    http_req_duration: [`p(95)<${SLO.p95Ms * 3}`],
    graphql_error_rate: [`rate<${SLO.errorRate * 5}`],
  },
});

export default function (): void {
  countryLookupJourney();
}
