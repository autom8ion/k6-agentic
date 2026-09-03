import type { Options } from 'k6/options';
import { soakScenario, buildOptions } from '../../src/config/scenarios.ts';
import { SLO } from '../../src/config/env.ts';
import { pizzaJourney } from '../../src/lib/journeys/restPizzaJourney.ts';

export const options: Options = buildOptions({
  protocol: 'rest',
  testType: 'soak',
  scenario: soakScenario(),
  thresholds: {
    // Soak tests watch for slow degradation (leaks, growing latency) over a
    // sustained, moderate, steady load rather than probing capacity limits.
    http_req_duration: [`p(95)<${SLO.p95Ms}`],
    rest_error_rate: [`rate<${SLO.errorRate}`],
  },
});

export default function (): void {
  pizzaJourney();
}
