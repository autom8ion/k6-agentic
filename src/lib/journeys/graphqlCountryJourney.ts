import { group, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { randomItem } from 'https://jslib.k6.io/k6-utils/1.6.0/index.js';
import { graphqlRequest } from '../http/graphqlClient.ts';

// open() and SharedArray must run at init scope (module top-level), not
// inside the exported journey function, so the query text/data are loaded
// once and shared across all VUs rather than re-read on every iteration.
const continentsQuery = open('../../graphql/continents.graphql');
const countryByCodeQuery = open('../../graphql/countryByCode.graphql');
const countriesByContinentQuery = open('../../graphql/countriesByContinent.graphql');

const countryCodes = new SharedArray('countryCodes', () => {
  return JSON.parse(open('../../data/countryCodes.json')) as string[];
});

const continentCodes = ['AF', 'AN', 'AS', 'EU', 'NA', 'OC', 'SA'];

// NOTE: countries.trevorblades.com applies IP-based rate limiting (~50-60
// requests/min via Stellate). Think-time sleep() below is both a realistic
// pacing best practice AND necessary to avoid tripping that limit at even
// modest VU counts. At real "load"/"stress" VU counts you will still see
// elevated 429s against this shared public demo target -- that's a property
// of the free demo API, not the framework. Point GRAPHQL_URL at your own
// GraphQL service (see .env.example) to get meaningful load/stress/soak/spike
// results without a third-party rate limiter in the way.
export function countryLookupJourney(): void {
  group('Country lookups', () => {
    graphqlRequest(continentsQuery, {}, { operationName: 'Continents' });

    graphqlRequest(
      countryByCodeQuery,
      { code: randomItem(countryCodes) },
      { operationName: 'CountryByCode' },
    );

    graphqlRequest(
      countriesByContinentQuery,
      { code: randomItem(continentCodes) },
      { operationName: 'CountriesByContinent' },
    );
  });

  sleep(1);
}
