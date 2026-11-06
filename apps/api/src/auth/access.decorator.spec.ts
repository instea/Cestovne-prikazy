import 'reflect-metadata';
import {
  type CanActivate,
  Controller,
  type ExecutionContext,
  Get,
  Injectable,
} from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { ErrorCode } from '@leaves/shared/enums';
import { describe, expect, it } from 'vitest';
import { AppException } from '../common/app-exception';
import {
  ACCESS,
  Authenticated,
  IS_PUBLIC,
  M2M,
  Public,
  Roles,
} from './access.decorator';
import { RolesGuard } from './roles.guard';

@Injectable()
class BasicGuard implements CanActivate {
  canActivate(): boolean {
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
    expect(meta(IS_PUBLIC, fn)).toBe(true);
  });

  it('@Authenticated() declares user access and keeps the token guard', () => {
    const fn = handler(MixedController, 'user');
    expect(meta(ACCESS, fn)).toBe('user');
    expect(meta(IS_PUBLIC, fn)).toBeUndefined();
  });

  it("@Roles('admin') on a controller declares admin access", () => {
    expect(meta(ACCESS, AdminController)).toBe('admin');
    expect(meta(IS_PUBLIC, AdminController)).toBeUndefined();
  });

  it('@M2M(guard) skips the token guard (Bearer ignored) and runs the Basic guard', () => {
    const fn = handler(MixedController, 'm2m');
    expect(meta(ACCESS, fn)).toBe('m2m');
    expect(meta(IS_PUBLIC, fn)).toBe(true);
    expect(meta(GUARDS_METADATA, fn)).toEqual([BasicGuard]);
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
