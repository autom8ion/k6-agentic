import http from 'k6/http';
import { REST_BASE_URL, REST_DEMO_TOKEN } from '../config/env.ts';
import { authFailures } from './metrics.ts';

// QuickPizza's real auth flow (verified live): fetch a csrf cookie, then post
// it alongside credentials to exchange for a bearer token.

export function fetchCsrfToken(): string {
  const res = http.post(`${REST_BASE_URL}/api/csrf-token`, null, {
    tags: { name: 'POST /api/csrf-token' },
  });
  const cookie = res.cookies.csrf_token?.[0]?.value;
  if (!cookie) {
    authFailures.add(1);
    throw new Error(`csrf-token request did not set a csrf_token cookie (status ${res.status})`);
  }
  return cookie;
}

export function login(username: string, password: string): string | null {
  const csrf = fetchCsrfToken();
  const res = http.post(
    `${REST_BASE_URL}/api/users/token/login`,
    JSON.stringify({ username, password, csrf }),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { name: 'POST /api/users/token/login' },
    },
  );
  if (res.status !== 200) {
    authFailures.add(1);
    return null;
  }
  return (res.json() as { token: string }).token;
}

export function registerUser(username: string, password: string): boolean {
  const res = http.post(`${REST_BASE_URL}/api/users`, JSON.stringify({ username, password }), {
    headers: { 'Content-Type': 'application/json', Authorization: REST_DEMO_TOKEN },
    tags: { name: 'POST /api/users' },
  });
  const ok = res.status === 201;
  if (!ok) authFailures.add(1);
  return ok;
}
