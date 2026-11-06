import {
  applyDecorators,
  type CanActivate,
  SetMetadata,
  type Type,
  UseGuards,
} from '@nestjs/common';

/**
 * NFR-01 access levels. Every route declares exactly one (on the handler or
 * its controller); the route-coverage test (`test/permissions.ts`) fails
 * for a route without one, and checks it against the permission matrix.
 * - `public`: no session (`@Public()`); cookie-authenticated and probe
 *   routes do their own checks.
 * - `user`: any active session user (`@Authenticated()`).
 * - `admin`: an active admin (`@Roles('admin')`, 403 `FORBIDDEN` otherwise).
 * - `m2m`: M2M Basic auth only, Bearer ignored (`@M2M(guard)`).
 *
 * At runtime a route without a declaration is treated as `user` (deny by
 * default: the access-token guard still requires a session).
 */
export const ACCESS = 'auth:access';

/** Set on `public` and `m2m` routes: the access-token guard skips them. */
export const IS_PUBLIC = 'auth:isPublic';

export type AccessLevel = 'public' | 'user' | 'admin' | 'm2m';

export type Role = 'admin';

/**
 * Opts out of the global access-token guard (deny by default). Cookie
 * routes (refresh, logout) and probes are public and do their own checks.
 */
export const Public = () =>
  applyDecorators(
    SetMetadata(IS_PUBLIC, true),
    SetMetadata(ACCESS, 'public' satisfies AccessLevel),
  );

/** Any active session user. */
export const Authenticated = () =>
  SetMetadata(ACCESS, 'user' satisfies AccessLevel);

/** Active session user with the role; `RolesGuard` answers 403 otherwise. */
export const Roles = (role: Role) =>
  SetMetadata(ACCESS, role satisfies AccessLevel);

/**
 * M2M Basic auth only: skips the access-token guard (a Bearer token never
 * authenticates here) and runs `guard` instead.
 */
export const M2M = (guard: Type<CanActivate>) =>
  applyDecorators(
    SetMetadata(IS_PUBLIC, true),
    SetMetadata(ACCESS, 'm2m' satisfies AccessLevel),
    UseGuards(guard),
  );
