import 'reflect-metadata';
import {
  type CanActivate,
  Controller,
  type ExecutionContext,
  Get,
  Injectable,
  type Type,
} from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { ErrorCode } from '@leaves/shared/enums';
import { describe, expect, it } from 'vitest';
import { AppException } from '../common/app-exception';
import {
  ACCESS,
  Authenticated,
  M2M,
  m2mOnly,
  Public,
  resolveAccess,
  Roles,
  skipsAccessToken,
} from './access.decorator';
import { AccessTokenGuard } from './access-token.guard';
import type { AccessTokenService } from './access-token.service';
import { RolesGuard } from './roles.guard';

const basicGuardCalls: string[] = [];

@Injectable()
class BasicGuard implements CanActivate {
  canActivate(): boolean {
    basicGuardCalls.push('called');
    return true;
  }
}

@Roles('admin')
@Controller('admin-things')
class AdminController {
  @Get()
  list(): void {}

  @Public()
  @Get('open')
  open(): void {}
}

@Controller('mixed')
class MixedController {
  @Authenticated()
  @Get('user')
  user(): void {}

  @M2M(BasicGuard)
  @Get('m2m')
  m2m(): void {}

  @Get('undeclared')
  undeclared(): void {}
}

const meta = (key: string, target: object) =>
  Reflect.getMetadata(key, target) as unknown;

/** The decorated handler function (what Nest reads metadata from). */
function handler(
  controller: abstract new () => unknown,
  name: string,
): (...args: never[]) => unknown {
  const descriptor = Object.getOwnPropertyDescriptor(
    controller.prototype,
    name,
  );
  return descriptor!.value as (...args: never[]) => unknown;
}

describe('NFR-01 access decorators', () => {
  it('@Public() marks the route public and skips the token guard', () => {
    const fn = handler(AdminController, 'open');
    expect(meta(ACCESS, fn)).toBe('public');
    expect(skipsAccessToken('public')).toBe(true);
  });

  it('@Authenticated() declares user access and keeps the token guard', () => {
    const fn = handler(MixedController, 'user');
    expect(meta(ACCESS, fn)).toBe('user');
    expect(skipsAccessToken('user')).toBe(false);
  });

  it("@Roles('admin') on a controller declares admin access", () => {
    expect(meta(ACCESS, AdminController)).toBe('admin');
    expect(skipsAccessToken('admin')).toBe(false);
  });

  it('@M2M(guard) skips the token guard (Bearer ignored) and runs the Basic guard', () => {
    const fn = handler(MixedController, 'm2m');
    expect(meta(ACCESS, fn)).toBe('m2m');
    expect(skipsAccessToken('m2m')).toBe(true);
    expect(meta(GUARDS_METADATA, fn)).toEqual([m2mOnly(BasicGuard)]);
    expect(m2mOnly(BasicGuard)).toBe(m2mOnly(BasicGuard));
    expect(Object.getPrototypeOf(m2mOnly(BasicGuard))).toBe(BasicGuard);
  });

  it('a route without a declaration has no access metadata', () => {
    expect(
      meta(ACCESS, handler(MixedController, 'undeclared')),
    ).toBeUndefined();
  });
});

describe('RolesGuard', () => {
  const guard = new RolesGuard(new Reflector());
  const contextFor = (
    controller: abstract new () => unknown,
    fn: (...args: never[]) => unknown,
    user?: { isAdmin: boolean },
  ) =>
    ({
      getClass: () => controller,
      getHandler: () => fn,
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    }) as unknown as ExecutionContext;

  it('lets an admin through an admin route', () => {
    expect(
      guard.canActivate(
        contextFor(AdminController, handler(AdminController, 'list'), {
          isAdmin: true,
        }),
      ),
    ).toBe(true);
  });

  it.each([
    ['a non-admin', { isAdmin: false }],
    ['no caller', undefined],
  ])('answers 403 FORBIDDEN to %s on an admin route', (_label, user) => {
    try {
      guard.canActivate(
        contextFor(AdminController, handler(AdminController, 'list'), user),
      );
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(AppException);
      expect((e as AppException).getStatus()).toBe(403);
      expect((e as AppException).code).toBe(ErrorCode.FORBIDDEN);
    }
  });

  it('a handler-level @Public() overrides a controller-level @Roles', () => {
    expect(
      guard.canActivate(
        contextFor(AdminController, handler(AdminController, 'open')),
      ),
    ).toBe(true);
  });

  it.each([
    ['user', handler(MixedController, 'user')],
    ['m2m', handler(MixedController, 'm2m')],
    ['undeclared', handler(MixedController, 'undeclared')],
  ])('does not restrict %s routes', (_label, fn) => {
    expect(
      guard.canActivate(contextFor(MixedController, fn, { isAdmin: false })),
    ).toBe(true);
  });
});

/**
 * B8: one resolved access level (handler overrides controller) decides the
 * access-token guard, the roles guard, the M2M guard and what the coverage
 * test reports, for every class/handler combination.
 */
describe('resolved access level decides every guard', () => {
  const LEVELS = [undefined, 'public', 'user', 'admin', 'm2m'] as const;
  type Level = (typeof LEVELS)[number];

  const decoratorFor = (level: Exclude<Level, undefined>) =>
    ({
      public: Public(),
      user: Authenticated(),
      admin: Roles('admin'),
      m2m: M2M(BasicGuard),
    })[level];

  /** A controller with `classLevel` on the class and `handlerLevel` on `route`. */
  function build(classLevel: Level, handlerLevel: Level) {
    class Ctl {
      route(): void {}
    }
    const descriptor = Object.getOwnPropertyDescriptor(Ctl.prototype, 'route')!;
    if (handlerLevel)
      (decoratorFor(handlerLevel) as MethodDecorator)(
        Ctl.prototype,
        'route',
        descriptor,
      );
    if (classLevel) (decoratorFor(classLevel) as ClassDecorator)(Ctl);
    return { controller: Ctl, fn: handler(Ctl, 'route') };
  }

  const contextFor = (
    controller: abstract new () => unknown,
    fn: (...args: never[]) => unknown,
    request: Record<string, unknown>,
  ) =>
    ({
      getClass: () => controller,
      getHandler: () => fn,
      switchToHttp: () => ({ getRequest: () => request }),
    }) as unknown as ExecutionContext;

  const tokenGuard = new AccessTokenGuard(
    new Reflector(),
    {
      verify: () => Promise.reject(new Error('not reached')),
    } as unknown as AccessTokenService,
    {} as never,
  );
  const rolesGuard = new RolesGuard(new Reflector());

  /** Does the access-token guard let a request without a token through? */
  async function tokenGuardSkips(ctx: ExecutionContext): Promise<boolean> {
    try {
      return await tokenGuard.canActivate(ctx);
    } catch (e) {
      expect((e as AppException).code).toBe(ErrorCode.AUTH_REQUIRED);
      return false;
    }
  }

  function rolesGuardAllowsNonAdmin(ctx: ExecutionContext): boolean {
    try {
      return rolesGuard.canActivate(ctx);
    } catch (e) {
      expect((e as AppException).code).toBe(ErrorCode.FORBIDDEN);
      return false;
    }
  }

  /** Runs every M2M guard declared on the class or handler. */
  function m2mGuardRuns(
    controller: abstract new () => unknown,
    fn: (...args: never[]) => unknown,
  ): boolean {
    basicGuardCalls.length = 0;
    const guards = [
      ...((meta(GUARDS_METADATA, controller) as Type<CanActivate>[]) ?? []),
      ...((meta(GUARDS_METADATA, fn) as Type<CanActivate>[]) ?? []),
    ];
    for (const G of guards)
      void new G().canActivate(contextFor(controller, fn, {}));
    return basicGuardCalls.length > 0;
  }

  const cases = LEVELS.flatMap((c) =>
    LEVELS.map((h) => [c ?? 'none', h ?? 'none', h ?? c] as const),
  );

  it.each(cases)(
    'class %s + handler %s resolves to %s and every guard follows it',
    async (classLevel, handlerLevel, expected) => {
      const { controller, fn } = build(
        classLevel === 'none' ? undefined : classLevel,
        handlerLevel === 'none' ? undefined : handlerLevel,
      );
      const resolved = resolveAccess(new Reflector(), fn, controller);
      expect(resolved).toBe(expected);

      const noToken = contextFor(controller, fn, { headers: {} });
      expect(await tokenGuardSkips(noToken)).toBe(
        expected === 'public' || expected === 'm2m',
      );
      const nonAdmin = contextFor(controller, fn, {
        headers: {},
        user: { isAdmin: false },
      });
      expect(rolesGuardAllowsNonAdmin(nonAdmin)).toBe(expected !== 'admin');
      expect(m2mGuardRuns(controller, fn)).toBe(expected === 'm2m');
    },
  );

  it('class @Public() + handler @Authenticated() requires a token (was skipped)', async () => {
    const { controller, fn } = build('public', 'user');
    expect(
      await tokenGuardSkips(contextFor(controller, fn, { headers: {} })),
    ).toBe(false);
  });

  it("class @Public() + handler @Roles('admin') requires a token, then admin (was 403 for everyone)", async () => {
    const { controller, fn } = build('public', 'admin');
    expect(
      await tokenGuardSkips(contextFor(controller, fn, { headers: {} })),
    ).toBe(false);
    expect(
      rolesGuard.canActivate(
        contextFor(controller, fn, { user: { isAdmin: true } }),
      ),
    ).toBe(true);
  });
});
