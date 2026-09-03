export const TEST_ENV = __ENV.TEST_ENV ?? 'demo';

export const REST_BASE_URL = __ENV.REST_BASE_URL ?? 'https://quickpizza.grafana.com';
export const REST_DEMO_TOKEN = __ENV.REST_DEMO_TOKEN ?? 'token abcdef0123456789';
export const REST_DEFAULT_USERNAME = __ENV.REST_DEFAULT_USERNAME ?? 'default';
export const REST_DEFAULT_PASSWORD = __ENV.REST_DEFAULT_PASSWORD ?? '12345678';

export const GRAPHQL_URL = __ENV.GRAPHQL_URL ?? 'https://countries.trevorblades.com/graphql';

interface SloProfile {
  p95Ms: number;
  errorRate: number;
}

// Per-environment SLO targets. Every test derives its thresholds from these
// instead of hardcoding latency/error numbers per file.
const SLO_PROFILES: Record<string, SloProfile> = {
  demo: { p95Ms: 800, errorRate: 0.02 },
  staging: { p95Ms: 500, errorRate: 0.01 },
  production: { p95Ms: 300, errorRate: 0.005 },
};

export const SLO = SLO_PROFILES[TEST_ENV] ?? SLO_PROFILES.demo;
