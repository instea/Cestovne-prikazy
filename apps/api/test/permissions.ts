import { ErrorCode } from '@leaves/shared/enums';
import type { AccessLevel } from '../src/auth/access.decorator';
import type { RouteKey } from './authz/routes';

/**
 * NFR-01 permission matrix: the single source of truth for who may call
 * which route. One row per registered route (`<METHOD> <path>`); the
 * route-coverage test fails when a route has no row, a row has no route, or
 * the route's access declaration (`@Public` / `@Authenticated` /
 * `@Roles('admin')` / `@M2M`) differs from the row's `access`.
 *
 * Callers:
 * - `anonymous`: no credentials.
 * - `deactivated`: a user with `active: false` presenting a valid token.
 * - `user`: an active non-admin session user (a non-owner where the route
 *   has an owned resource).
 * - `owner`: a `user` acting on their own resource; `'n/a'` when the route
 *   has none.
 * - `admin`: an active admin session user.
 * - `m2m`: valid M2M Basic credentials (accepted only by `@M2M` routes).
 *
 * A denied call returns the error body `{ statusCode, code, message }` with
 * the listed `code`, except the M2M attendance route (old contract: 401 with
 * an empty body, `emptyBody`).
 */

export const CALLERS = [
  'anonymous',
  'deactivated',
  'user',
  'owner',
  'admin',
  'm2m',
] as const;

export type Caller = (typeof CALLERS)[number];

export interface Expectation {
  status: number;
  /** `code` of the error body; required for every status ≥ 400 with a body. */
  code?: string;
  /** Attendance (ATT-01): denied with an empty body, no error body. */
  emptyBody?: true;
}

export interface PermissionRow {
  access: AccessLevel;
  /** Concrete request path when the route has params (default: route path). */
  path?: string;
  expect: Readonly<Record<Caller, Expectation | 'n/a'>>;
}

const ok = (status = 200): Expectation => ({ status });
const denied = (status: number, code: string): Expectation => ({
  status,
  code,
});

const AUTH_REQUIRED = denied(401, ErrorCode.AUTH_REQUIRED);
const DEACTIVATED = denied(401, ErrorCode.USER_DEACTIVATED);
const FORBIDDEN = denied(403, ErrorCode.FORBIDDEN);

/** Same answer for every caller (public routes). */
const everyone = (e: Expectation): PermissionRow['expect'] => ({
  anonymous: e,
  deactivated: e,
  user: e,
  owner: 'n/a',
  admin: e,
  m2m: e,
});

/** `@Authenticated()`: any active session user. M2M Basic is no session. */
const sessionUser = (success = ok()): PermissionRow['expect'] => ({
  anonymous: AUTH_REQUIRED,
  deactivated: DEACTIVATED,
  user: success,
  owner: 'n/a',
  admin: success,
  m2m: AUTH_REQUIRED,
});

/** `@Roles('admin')`. */
const adminOnly = (success = ok()): PermissionRow['expect'] => ({
  anonymous: AUTH_REQUIRED,
  deactivated: DEACTIVATED,
  user: FORBIDDEN,
  owner: 'n/a',
  admin: success,
  m2m: AUTH_REQUIRED,
});

/** `@M2M()`: Basic only; a Bearer session (any role) never opens it. */
const m2mOnly = (): PermissionRow['expect'] => {
  const no: Expectation = { status: 401, emptyBody: true };
  return {
    anonymous: no,
    deactivated: no,
    user: no,
    owner: 'n/a',
    admin: no,
    m2m: ok(),
  };
};

export const PERMISSIONS: Readonly<Record<RouteKey, PermissionRow>> = {
  // OPS-01 readiness probe.
  'GET /health-check': { access: 'public', expect: everyone(ok()) },
  'HEAD /health-check': { access: 'public', expect: everyone(ok()) },
  // AUTH-01. The Google login gets no body here → 400 VALIDATION_FAILED for
  // everyone (credentials are never consulted).
  'GET /api/auth/config': { access: 'public', expect: everyone(ok()) },
  'HEAD /api/auth/config': { access: 'public', expect: everyone(ok()) },
  'POST /api/auth/google': {
    access: 'public',
    expect: everyone(denied(400, ErrorCode.VALIDATION_FAILED)),
  },
  // AUTH-02: cookie-authenticated; these requests carry no refresh cookie
  // (a Bearer token is never accepted here) → 401 REFRESH_TOKEN_MISSING.
  'POST /api/auth/refresh': {
    access: 'public',
    expect: everyone(denied(401, ErrorCode.REFRESH_TOKEN_MISSING)),
  },
  // AUTH-03: public and idempotent; no cookie → 204.
  'POST /api/auth/logout': { access: 'public', expect: everyone(ok(204)) },
  // AUTH-02 / AUTH-05.
  'GET /api/auth/me': { access: 'user', expect: sessionUser() },
  'HEAD /api/auth/me': { access: 'user', expect: sessionUser() },
  // NFR-06.
  'GET /api/admin/audit': { access: 'admin', expect: adminOnly() },
  'HEAD /api/admin/audit': { access: 'admin', expect: adminOnly() },
  // ATT-01. The month matches the default SSO / Toggl fakes (Dec 2026).
  'GET /api/attendence/:year/:month': {
    access: 'm2m',
    path: '/api/attendence/2026/12',
    expect: m2mOnly(),
  },
  'HEAD /api/attendence/:year/:month': {
    access: 'm2m',
    path: '/api/attendence/2026/12',
    expect: m2mOnly(),
  },
};

/**
 * Matrix lines of the spec whose routes do not exist yet. Each task adds
 * its rows to `PERMISSIONS` (and removes the line here) together with the
 * route; the coverage test then checks them.
 */
export const PLANNED: readonly string[] = [
  'GET /api/docs, GET /api/docs-json — public, non-production only (DOC-02)',
  'GET /api/users — admin (USR-01)',
  'GET /api/users/:id — admin, 404 USER_NOT_FOUND (USR-02)',
  'PATCH /api/users/me — user, name only, 403 FIELD_NOT_EDITABLE (USR-03)',
  'PATCH /api/users/:id — admin, 409 USER_ANONYMIZED (USR-02)',
  'POST /api/users/:id/deactivate — admin (USR-04)',
  'GET /api/leaves — user (LST-01)',
  'POST /api/leaves — user, requester forced to caller (LV-01)',
  'DELETE /api/leaves/:id — owner any state / admin any leave (LV-03)',
  'POST /api/leaves/:id/approve — admin (APR-01)',
  'POST /api/leaves/:id/reject — admin (APR-01)',
  'GET /api/leaves/summary — user, self only (SUM-01)',
  'GET /api/admin/users/:id/export — admin (NFR-07)',
  'POST /api/admin/users/:id/anonymize — admin (NFR-08)',
];

/**
 * Old endpoints removed by the rewrite: they must answer 404 `NOT_FOUND`
 * (error body), never the SPA fallback or a silent empty result.
 */
export const REMOVED_ENDPOINTS: readonly (readonly [string, string])[] = [
  ['DELETE', '/api/users/some-id'],
  ['GET', '/api/leaves/pending'],
  ['GET', '/api/summary'],
  ['GET', '/api/admin/audit-log'],
];
