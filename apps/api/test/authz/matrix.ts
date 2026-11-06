import type { RouteKey } from './routes';

/**
 * TST-02 authorization matrix: every route × role with the expected status.
 * A new controller route without a row fails `every route is covered`.
 * - `owner`: a `user` acting on their own resource; `'n/a'` when the route
 *   has no owned resource.
 * - `deactivated`: a user with `active: false` (session still presented).
 * - `m2m`: valid M2M Basic credentials (only the attendance route accepts them).
 */
export const ROLES = [
  'anonymous',
  'deactivated',
  'user',
  'owner',
  'admin',
  'm2m',
] as const;

export type Role = (typeof ROLES)[number];

export interface MatrixRow {
  /** Concrete request path when the route has params (default: route path). */
  path?: string;
  expect: Readonly<Record<Role, number | 'n/a'>>;
}

const everyone = (status: number): MatrixRow['expect'] => ({
  anonymous: status,
  deactivated: status,
  user: status,
  owner: 'n/a',
  admin: status,
  m2m: status,
});

const sessionUser: MatrixRow['expect'] = {
  anonymous: 401,
  deactivated: 401,
  user: 200,
  owner: 'n/a',
  admin: 200,
  m2m: 401,
};

const adminOnly: MatrixRow['expect'] = {
  anonymous: 401,
  deactivated: 401,
  user: 403,
  owner: 'n/a',
  admin: 200,
  m2m: 401,
};

export const AUTHORIZATION_MATRIX: Readonly<Record<RouteKey, MatrixRow>> = {
  // OPS-01 readiness probe: public.
  'GET /health-check': { expect: everyone(200) },
  'HEAD /health-check': { expect: everyone(200) },
  // AUTH-02: cookie-authenticated; these requests carry no refresh cookie
  // (a Bearer token is never accepted here) → 401 REFRESH_TOKEN_MISSING.
  'POST /api/auth/refresh': { expect: everyone(401) },
  // AUTH-03: public and idempotent; no cookie → 204.
  'POST /api/auth/logout': { expect: everyone(204) },
  // AUTH-02 / AUTH-05: any session user; deactivated → 401 USER_DEACTIVATED.
  'GET /api/auth/me': { expect: sessionUser },
  'HEAD /api/auth/me': { expect: sessionUser },
  // NFR-06: admin only.
  'GET /api/admin/audit': { expect: adminOnly },
  'HEAD /api/admin/audit': { expect: adminOnly },
};
