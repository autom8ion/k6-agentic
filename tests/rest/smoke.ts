import { group, check } from 'k6';
import { SharedArray } from 'k6/data';
import type { Options } from 'k6/options';
import { smokeScenario, buildOptions } from '../../src/config/scenarios.ts';
import { SLO } from '../../src/config/env.ts';
import { restClient } from '../../src/lib/http/restClient.ts';
import { registerUser, login } from '../../src/lib/auth.ts';

const users = new SharedArray('users', () => {
  return JSON.parse(open('../../src/data/users.json')) as {
    usernamePrefix: string;
    password: string;
  }[];
});

export const options: Options = buildOptions({
  protocol: 'rest',
  testType: 'smoke',
  scenario: smokeScenario(),
  thresholds: {
    http_req_duration: [`p(95)<${SLO.p95Ms}`],
    rest_error_rate: [{ threshold: 'rate<0.01', abortOnFail: true }],
    checks: ['rate>0.99'],
  },
});

export default function (): void {
  group('Health', () => {
    restClient.get('/ready', { name: 'GET /ready' });
    restClient.get('/api/status/200', { name: 'GET /api/status/200' });
  });

  group('Auth chain', () => {
    const fixture = users[__VU % users.length];
    const username = `${fixture.usernamePrefix}-${__VU}-${Date.now()}`;

    const registered = registerUser(username, fixture.password);
    check(registered, { registered: (r) => r === true });
    if (!registered) return;

    const token = login(username, fixture.password);
    check(token, { 'logged in': (t) => typeof t === 'string' && t.length > 0 });
    if (!token) return;

    const authHeaders = { Authorization: `token ${token}` };

    const recommendation = restClient.post(
      '/api/pizza',
      {
        maxCaloriesPerSlice: 1000,
        mustBeVegetarian: false,
        excludedIngredients: [],
        excludedTools: [],
        maxNumberOfToppings: 5,
        minNumberOfToppings: 2,
        customName: '',
      },
      { name: 'POST /api/pizza', headers: authHeaders },
    );

    const body = recommendation.json() as unknown as { pizza?: { id: number } } | null;
    if (body?.pizza?.id) {
      restClient.post(
        '/api/ratings',
        { stars: 5, pizza_id: body.pizza.id },
        { name: 'POST /api/ratings', headers: authHeaders },
      );
    }
  });
}
