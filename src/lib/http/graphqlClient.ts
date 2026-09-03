import http from 'k6/http';
import { check } from 'k6';
import { graphqlErrorRate, graphqlReqDuration, graphqlRequestsTotal } from '../metrics.ts';
import { GRAPHQL_URL } from '../../config/env.ts';

export interface GraphQLRequestOptions {
  /** Required tag identifying the operation (e.g. "CountryByCode"), since
   * GraphQL has a single URL and can't be distinguished by path/method alone. */
  operationName: string;
}

interface GraphQLResponseBody<T = unknown> {
  data?: T;
  errors?: unknown[];
}

export function graphqlRequest<T = unknown>(
  query: string,
  variables: Record<string, unknown> = {},
  opts: GraphQLRequestOptions,
): GraphQLResponseBody<T> {
  const res = http.post(GRAPHQL_URL, JSON.stringify({ query, variables }), {
    headers: { 'Content-Type': 'application/json' },
    tags: { name: opts.operationName },
  });

  graphqlReqDuration.add(res.timings.duration, { name: opts.operationName });
  graphqlRequestsTotal.add(1, { name: opts.operationName });

  const body = res.json() as unknown as GraphQLResponseBody<T>;

  const ok = check(
    res,
    {
      'http status 200': (r) => r.status === 200,
      'no graphql errors': () => !body.errors || body.errors.length === 0,
    },
    { name: opts.operationName },
  );

  graphqlErrorRate.add(!ok);
  if (!ok) {
    console.error(`[GraphQL] ${opts.operationName} failed: ${res.status} ${res.body}`);
  }

  return body;
}
