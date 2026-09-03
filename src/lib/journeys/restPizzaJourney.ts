import { group, sleep } from 'k6';
import { restClient } from '../http/restClient.ts';
import { REST_DEMO_TOKEN } from '../../config/env.ts';

interface Pizza {
  pizza: { id: number };
}

const authHeaders = { Authorization: REST_DEMO_TOKEN };

// Read/rating traffic against the shared public demo token -- deliberately
// does NOT register a fresh user per iteration (see tests/rest/smoke.ts for
// the full registration/login chain), to avoid hammering QuickPizza's shared
// public database with throwaway accounts under sustained load.
export function pizzaJourney(): void {
  group('Pizza journey', () => {
    restClient.get('/api/tools', { name: 'GET /api/tools', headers: authHeaders });

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

    const body = recommendation.json() as unknown as Pizza | null;
    if (body?.pizza?.id) {
      restClient.post(
        '/api/ratings',
        { stars: Math.ceil(Math.random() * 5), pizza_id: body.pizza.id },
        { name: 'POST /api/ratings', headers: authHeaders },
      );
    }
  });

  sleep(1);
}
