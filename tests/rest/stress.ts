import type { Options } from 'k6/options';
import { stressScenario, buildOptions } from '../../src/config/scenarios.ts';
import { SLO } from '../../src/config/env.ts';
import { pizzaJourney } from '../../src/lib/journeys/restPizzaJourney.ts';

export const options: Options = buildOptions({
  protocol: 'rest',
  testType: 'stress',
  scenario: stressScenario(),
  thresholds: {
    // Stress tests probe for the breaking point -- monitor for degradation
    // rather than hard-failing the run early.
    http_req_duration: [`p(95)<${SLO.p95Ms * 2}`],
    rest_error_rate: [`rate<${SLO.errorRate * 3}`],
  },
});

export default function (): void {
  pizzaJourney();
}
