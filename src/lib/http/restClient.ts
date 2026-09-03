import http, { type RefinedResponse, type ResponseType } from 'k6/http';
import { check } from 'k6';
import { restErrorRate, restReqDuration, restRequestsTotal } from '../metrics.ts';
import { REST_BASE_URL } from '../../config/env.ts';

type Res = RefinedResponse<ResponseType>;

export interface RequestOptions {
  /** Required, low-cardinality tag (e.g. "POST /api/ratings") -- never a raw
   * parameterized URL, to avoid high-cardinality tags blowing up Grafana/Prometheus. */
  name: string;
  headers?: Record<string, string>;
  extraChecks?: Record<string, (res: Res) => boolean>;
}

function record(res: Res, opts: RequestOptions): Res {
  restReqDuration.add(res.timings.duration, { name: opts.name });
  restRequestsTotal.add(1, { name: opts.name });

  const ok = check(
    res,
    {
      'status < 400': (r: Res) => r.status < 400,
      ...(opts.extraChecks ?? {}),
    },
    { name: opts.name },
  );

  restErrorRate.add(!ok);
  if (!ok) {
    console.error(`[REST] ${opts.name} failed: ${res.status} ${res.body}`);
  }
  return res;
}

function jsonHeaders(extra?: Record<string, string>): Record<string, string> {
  return { 'Content-Type': 'application/json', ...extra };
}

export const restClient = {
  get(path: string, opts: RequestOptions): Res {
    const res = http.get(`${REST_BASE_URL}${path}`, {
      headers: opts.headers,
      tags: { name: opts.name },
    });
    return record(res, opts);
  },

  post(path: string, body: unknown, opts: RequestOptions): Res {
    const res = http.post(`${REST_BASE_URL}${path}`, JSON.stringify(body), {
      headers: jsonHeaders(opts.headers),
      tags: { name: opts.name },
    });
    return record(res, opts);
  },

  put(path: string, body: unknown, opts: RequestOptions): Res {
    const res = http.put(`${REST_BASE_URL}${path}`, JSON.stringify(body), {
      headers: jsonHeaders(opts.headers),
      tags: { name: opts.name },
    });
    return record(res, opts);
  },

  patch(path: string, body: unknown, opts: RequestOptions): Res {
    const res = http.patch(`${REST_BASE_URL}${path}`, JSON.stringify(body), {
      headers: jsonHeaders(opts.headers),
      tags: { name: opts.name },
    });
    return record(res, opts);
  },

  del(path: string, opts: RequestOptions): Res {
    const res = http.del(`${REST_BASE_URL}${path}`, null, {
      headers: opts.headers,
      tags: { name: opts.name },
    });
    return record(res, opts);
  },
};
