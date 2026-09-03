import type { Options } from 'k6/options';

type Scenario = NonNullable<Options['scenarios']>[string];
type Thresholds = NonNullable<Options['thresholds']>;

// Composable executor factories -- the definition of "load" or "spike" lives
// here exactly once, instead of being copy-pasted into every test file.

export function smokeScenario(overrides: Partial<Scenario> = {}): Scenario {
  return {
    executor: 'constant-vus',
    vus: 2,
    duration: '30s',
    ...overrides,
  } as Scenario;
}

export function loadScenario(overrides: Partial<Scenario> = {}): Scenario {
  return {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '2m', target: 20 },
      { duration: '5m', target: 20 },
      { duration: '2m', target: 0 },
    ],
    gracefulRampDown: '30s',
    ...overrides,
  } as Scenario;
}

export function stressScenario(overrides: Partial<Scenario> = {}): Scenario {
  return {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '2m', target: 50 },
      { duration: '5m', target: 50 },
      { duration: '2m', target: 100 },
      { duration: '5m', target: 100 },
      { duration: '5m', target: 0 },
    ],
    gracefulRampDown: '1m',
    ...overrides,
  } as Scenario;
}

export function soakScenario(overrides: Partial<Scenario> = {}): Scenario {
  return {
    executor: 'constant-vus',
    vus: 15,
    duration: '1h',
    ...overrides,
  } as Scenario;
}

export function spikeScenario(overrides: Partial<Scenario> = {}): Scenario {
  return {
    executor: 'ramping-arrival-rate',
    startRate: 5,
    timeUnit: '1s',
    preAllocatedVUs: 50,
    maxVUs: 300,
    stages: [
      { duration: '30s', target: 5 },
      { duration: '30s', target: 300 },
      { duration: '1m', target: 300 },
      { duration: '30s', target: 5 },
      { duration: '1m', target: 5 },
    ],
    ...overrides,
  } as Scenario;
}

export type Protocol = 'rest' | 'graphql' | 'db';
export type TestType = 'smoke' | 'load' | 'stress' | 'soak' | 'spike';

interface BuildOptionsArgs {
  protocol: Protocol;
  testType: TestType;
  scenario: Scenario;
  thresholds?: Thresholds;
}

// Merges a scenario, its thresholds, and low-cardinality run tags into a
// single k6 `options` object. Every test entrypoint calls this once.
export function buildOptions({
  protocol,
  testType,
  scenario,
  thresholds = {},
}: BuildOptionsArgs): Options {
  return {
    scenarios: { [testType]: scenario },
    thresholds: {
      // db tests issue no HTTP requests, so http_req_failed has no samples
      // for them -- only apply this default to the HTTP-based protocols.
      ...(protocol === 'db' ? {} : { http_req_failed: ['rate<0.05'] }),
      ...thresholds,
    },
    tags: { protocol, test_type: testType },
  };
}
