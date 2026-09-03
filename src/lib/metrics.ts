import { Counter, Rate, Trend } from 'k6/metrics';

// Custom, protocol-scoped metrics -- distinct from k6's built-in
// http_req_duration/http_req_failed so Grafana panels and thresholds can
// tell REST and GraphQL traffic apart.

export const restErrorRate = new Rate('rest_error_rate');
export const restReqDuration = new Trend('rest_req_duration', true);
export const restRequestsTotal = new Counter('rest_requests_total');

export const graphqlErrorRate = new Rate('graphql_error_rate');
export const graphqlReqDuration = new Trend('graphql_req_duration', true);
export const graphqlRequestsTotal = new Counter('graphql_requests_total');

export const authFailures = new Counter('auth_failures_total');
