import {
  applyDecorators,
  type CanActivate,
  type ExecutionContext,
  SetMetadata,
  type Type,
  UseGuards,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

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
 * The handler's declaration overrides the controller's (`resolveAccess`),
 * and that one resolved level decides every check.
 * At runtime a route without a declaration is treated as `user` (deny by
 * default: the access-token guard still requires a session).
 */
export const ACCESS = 'auth:access';

export type AccessLevel = 'public' | 'user' | 'admin' | 'm2m';

export type Role = 'admin';

type Target = Parameters<Reflector['getAllAndOverride']>[1][number];

/**
 * The route's one effective access level: the handler's declaration
 * overrides the controller's. Everything (the access-token guard, the
 * roles guard, the M2M guard, the route-coverage test) decides from this
 * value only, so what the matrix test reports is what runs.
 */
export function resolveAccess(
  reflector: Pick<Reflector, 'getAllAndOverride'>,
  handler: Target,
  controller: Target,
): AccessLevel | undefined {
  return reflector.getAllAndOverride<AccessLevel | undefined>(ACCESS, [
    handler,
    controller,
  ]);
}

/** `public` and `m2m` routes do not need (or accept) an access token. */
export const skipsAccessToken = (access: AccessLevel | undefined): boolean =>
  access === 'public' || access === 'm2m';

/**
 * Opts out of the global access-token guard (deny by default). Cookie
 * routes (refresh, logout) and probes are public and do their own checks.
 */
export const Public = () => SetMetadata(ACCESS, 'public' satisfies AccessLevel);

/** Any active session user. */
export const Authenticated = () =>
  SetMetadata(ACCESS, 'user' satisfies AccessLevel);

/** Active session user with the role; `RolesGuard` answers 403 otherwise. */
export const Roles = (role: Role) =>
  SetMetadata(ACCESS, role satisfies AccessLevel);

const reflector = new Reflector();
const m2mOnlyGuards = new WeakMap<Type<CanActivate>, Type<CanActivate>>();

/**
 * `guard` that only runs where the resolved access is `m2m`: a handler
 * overriding a controller-level `@M2M()` (e.g. with `@Public()`) is not
 * subject to the controller's Basic guard. Same constructor dependencies
 * as `guard` (inherited DI metadata); one class per guard.
 */
export function m2mOnly(guard: Type<CanActivate>): Type<CanActivate> {
  let gated = m2mOnlyGuards.get(guard);
  if (!gated) {
    gated = class extends guard {
      override canActivate(context: ExecutionContext) {
        const access = resolveAccess(
          reflector,
          context.getHandler(),
          context.getClass(),
        );
        return access === 'm2m' ? super.canActivate(context) : true;
      }
    };
    Object.defineProperty(gated, 'name', { value: `M2mOnly(${guard.name})` });
    m2mOnlyGuards.set(guard, gated);
  }
  return gated;
}

/**
 * M2M Basic auth only: skips the access-token guard (a Bearer token never
 * authenticates here) and runs `guard` instead (only while the resolved
 * access is `m2m`).
 */
export const M2M = (guard: Type<CanActivate>) =>
  applyDecorators(
    SetMetadata(ACCESS, 'm2m' satisfies AccessLevel),
    UseGuards(m2mOnly(guard)),
  );
