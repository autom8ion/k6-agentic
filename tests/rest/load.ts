import type { Options } from 'k6/options';
import { loadScenario, buildOptions } from '../../src/config/scenarios.ts';
import { SLO } from '../../src/config/env.ts';
import { pizzaJourney } from '../../src/lib/journeys/restPizzaJourney.ts';

export const options: Options = buildOptions({
  protocol: 'rest',
  testType: 'load',
  scenario: loadScenario(),
  thresholds: {
    http_req_duration: [`p(95)<${SLO.p95Ms}`],
    rest_error_rate: [`rate<${SLO.errorRate}`],
  },
});

export default function (): void {
  pizzaJourney();
}
