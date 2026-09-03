import type { Options } from 'k6/options';
import { spikeScenario, buildOptions } from '../../src/config/scenarios.ts';
import { SLO } from '../../src/config/env.ts';
import { pizzaJourney } from '../../src/lib/journeys/restPizzaJourney.ts';

export const options: Options = buildOptions({
  protocol: 'rest',
  testType: 'spike',
  scenario: spikeScenario(),
  thresholds: {
    // Spike tests expect transient degradation during the burst -- widen
    // tolerances further and only fail on outright breakage.
    http_req_duration: [`p(95)<${SLO.p95Ms * 3}`],
    rest_error_rate: [`rate<${SLO.errorRate * 5}`],
  },
});

export default function (): void {
  pizzaJourney();
}
