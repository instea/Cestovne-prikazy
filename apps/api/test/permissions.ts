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
  /**
   * `'leave'`: the route acts on one leave. Each request gets a fresh
   * PENDING leave owned by user A, substituted for `:id`; the `owner`
   * caller is A, `user` is another user B (a non-owner), `admin` acts on
   * A's leave.
   */
  resource?: 'leave';
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

/**
 * `@Authenticated()` route on an owned resource: the owner and admins
 * succeed, any other user gets 403 `FORBIDDEN` (checked in the service).
 */
const ownerOrAdmin = (success = ok()): PermissionRow['expect'] => ({
  anonymous: AUTH_REQUIRED,
  deactivated: DEACTIVATED,
  user: FORBIDDEN,
  owner: success,
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
  // USR-01.
  'GET /api/users': { access: 'admin', expect: adminOnly() },
  'HEAD /api/users': { access: 'admin', expect: adminOnly() },
  // USR-03. Sent without a body: an allowed caller gets past authorization
  // to 400 VALIDATION_FAILED (at least one field); the edit itself and
  // 403 FIELD_NOT_EDITABLE are covered in test/users/users-api.int-spec.ts.
  'PATCH /api/users/me': {
    access: 'user',
    expect: sessionUser(denied(400, ErrorCode.VALIDATION_FAILED)),
  },
  // USR-02 / USR-04 on an unknown id: an admin gets past authorization to
  // 404 USER_NOT_FOUND; the edit (no body here → 400 VALIDATION_FAILED, the
  // body is checked before the lookup) is covered with real targets in
  // test/users/users-api.int-spec.ts, incl. a non-admin on their own id
  // (matrix "owner" ✗ → 403 FORBIDDEN).
  'GET /api/users/:id': {
    access: 'admin',
    path: '/api/users/nobody',
    expect: adminOnly(denied(404, ErrorCode.USER_NOT_FOUND)),
  },
  'HEAD /api/users/:id': {
    access: 'admin',
    path: '/api/users/nobody',
    expect: adminOnly(denied(404, ErrorCode.USER_NOT_FOUND)),
  },
  'PATCH /api/users/:id': {
    access: 'admin',
    path: '/api/users/nobody',
    expect: adminOnly(denied(400, ErrorCode.VALIDATION_FAILED)),
  },
  'POST /api/users/:id/deactivate': {
    access: 'admin',
    path: '/api/users/nobody/deactivate',
    expect: adminOnly(denied(404, ErrorCode.USER_NOT_FOUND)),
  },
  // NFR-07 on an unknown id; the export itself: test/users/user-export.int-spec.ts.
  'GET /api/admin/users/:id/export': {
    access: 'admin',
    path: '/api/admin/users/nobody/export',
    expect: adminOnly(denied(404, ErrorCode.USER_NOT_FOUND)),
  },
  'HEAD /api/admin/users/:id/export': {
    access: 'admin',
    path: '/api/admin/users/nobody/export',
    expect: adminOnly(denied(404, ErrorCode.USER_NOT_FOUND)),
  },
  // NFR-06.
  'GET /api/admin/audit': { access: 'admin', expect: adminOnly() },
  'HEAD /api/admin/audit': { access: 'admin', expect: adminOnly() },
  // LST-01 / LV-01 / SUM-01. The create gets no body here → 400
  // VALIDATION_FAILED once the caller is let in.
  'GET /api/leaves': { access: 'user', expect: sessionUser() },
  'HEAD /api/leaves': { access: 'user', expect: sessionUser() },
  'POST /api/leaves': {
    access: 'user',
    expect: sessionUser(denied(400, ErrorCode.VALIDATION_FAILED)),
  },
  'GET /api/leaves/summary': { access: 'user', expect: sessionUser() },
  'HEAD /api/leaves/summary': { access: 'user', expect: sessionUser() },
  // LV-03: own leave in any state (states: test/leaves/delete-leave.int-spec.ts)
  // or any leave as admin.
  'DELETE /api/leaves/:id': {
    access: 'user',
    resource: 'leave',
    expect: ownerOrAdmin(ok(204)),
  },
  // APR-01: admins only, incl. their own leave (no owner column: an owner
  // who is not an admin is a `user`).
  'POST /api/leaves/:id/approve': {
    access: 'admin',
    resource: 'leave',
    expect: adminOnly(),
  },
  'POST /api/leaves/:id/reject': {
    access: 'admin',
    resource: 'leave',
    expect: adminOnly(),
  },
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
  // DOC-02: served from a controller with @Public() (not SwaggerModule.setup):
  // test/security/router-stack.int-spec.ts rejects handlers outside
  // controllers; then add both rows to PERMISSIONS.
  'GET /api/docs, GET /api/docs-json — public, non-production only (DOC-02)',
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
