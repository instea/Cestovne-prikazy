import { All, Controller, Get, Module, Post, Put } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { useHttpFakes } from '../mocks/http-fakes';
import { useTestApp } from '../support/app';
import { loginAs, startSession } from '../support/auth';
import { m2mAuth } from '../support/m2m';
import { type SeedUserOptions, seedUser } from '../support/seed';
import { AUTHORIZATION_MATRIX, ROLES, type Role } from './matrix';
import {
  assertMatrixCoversRoutes,
  listRoutes,
  routeKey,
  send,
  type RouteKey,
} from './routes';

@Controller('api/new-thing')
class NewThingController {
  @Get(':id')
  one(): void {}

  @Post()
  create(): void {}

  @Put(['a', '/b/'])
  aliases(): void {}

  @All('any')
  any(): void {}

  helper(): void {}
}

@Controller()
class RootController {
  @Get()
  root(): void {}
}

@Module({ controllers: [NewThingController, RootController] })
class NewThingModule {}

describe('route list (from Nest metadata)', () => {
  const ctx = useTestApp();

  it('lists the routes of the current app', () => {
    expect(listRoutes(ctx().app)).toEqual([
      { method: 'GET', path: '/api/admin/audit' },
      { method: 'HEAD', path: '/api/admin/audit' },
      { method: 'GET', path: '/api/attendence/:year/:month' },
      { method: 'HEAD', path: '/api/attendence/:year/:month' },
      { method: 'GET', path: '/api/auth/config' },
      { method: 'HEAD', path: '/api/auth/config' },
      { method: 'POST', path: '/api/auth/google' },
      { method: 'POST', path: '/api/auth/logout' },
      { method: 'GET', path: '/api/auth/me' },
      { method: 'HEAD', path: '/api/auth/me' },
      { method: 'POST', path: '/api/auth/refresh' },
      { method: 'GET', path: '/health-check' },
      { method: 'HEAD', path: '/health-check' },
    ]);
  });

  it('formats keys as "<METHOD> <path>"', () => {
    expect(routeKey({ method: 'GET', path: '/x' })).toBe('GET /x');
  });
});

describe('route list with an extra controller', () => {
  const ctx = useTestApp({ imports: [NewThingModule] });

  it('lists every decorated handler, path alias and implicit HEAD', () => {
    const keys = listRoutes(ctx().app).map(routeKey);
    expect(keys).toEqual(
      expect.arrayContaining([
        'GET /',
        'HEAD /',
        'GET /api/new-thing/:id',
        'HEAD /api/new-thing/:id',
        'POST /api/new-thing',
        'PUT /api/new-thing/a',
        'PUT /api/new-thing/b',
        'ALL /api/new-thing/any',
      ]),
    );
    expect(keys.filter((k) => k.includes('helper'))).toEqual([]);
  });

  it('fails the coverage check for a new route without a matrix row', () => {
    expect(() =>
      assertMatrixCoversRoutes(listRoutes(ctx().app), AUTHORIZATION_MATRIX),
    ).toThrow('Route GET /api/new-thing/:id missing from authorization matrix');
  });
});

describe('coverage check', () => {
  const row = {
    expect: {
      anonymous: 200,
      deactivated: 200,
      user: 200,
      owner: 'n/a',
      admin: 200,
      m2m: 200,
    },
  } as const;

  it('passes when routes and rows match', () => {
    expect(() =>
      assertMatrixCoversRoutes([{ method: 'GET', path: '/a' }], {
        'GET /a': row,
      }),
    ).not.toThrow();
  });

  it('lists every missing route, one per line', () => {
    expect(() =>
      assertMatrixCoversRoutes(
        [
          { method: 'GET', path: '/a' },
          { method: 'DELETE', path: '/b' },
        ],
        {},
      ),
    ).toThrow(
      'Route GET /a missing from authorization matrix\n' +
        'Route DELETE /b missing from authorization matrix',
    );
  });

  it('fails on a stale row whose route no longer exists', () => {
    expect(() => assertMatrixCoversRoutes([], { 'GET /gone': row })).toThrow(
      'Matrix row GET /gone matches no route',
    );
  });
});

describe('authorization matrix', () => {
  // ATT-01 rows call SSO / Toggl: the default fakes answer them.
  useHttpFakes();
  const ctx = useTestApp();

  it('every route is covered', () => {
    assertMatrixCoversRoutes(listRoutes(ctx().app), AUTHORIZATION_MATRIX);
  });

  /**
   * Bearer header for a freshly seeded user, obtained through the real
   * `POST /api/auth/google` path (`loginAs`). A deactivated user cannot log
   * in (403), so its token comes straight from AUTH-02
   * `SessionService.startSession`: the session it presented before being
   * deactivated.
   */
  const bearerFor = async (
    options: SeedUserOptions,
  ): Promise<Record<string, string>> => {
    const user = await seedUser(ctx().app, options);
    const { accessToken } =
      options.active === false
        ? await startSession(ctx().app, user)
        : await loginAs(ctx().app, user);
    return { Authorization: `Bearer ${accessToken}` };
  };

  /**
   * Request credentials per role. `owner` needs a route with an owned
   * resource (LV-03 and later add rows that use it).
   */
  const authFor: Partial<
    Record<Role, () => Promise<Record<string, string>> | Record<string, string>>
  > = {
    anonymous: () => ({}),
    deactivated: () => bearerFor({ active: false }),
    user: () => bearerFor({}),
    admin: () => bearerFor({ isAdmin: true }),
    m2m: () => ({ Authorization: m2mAuth() }),
  };

  for (const [key, row] of Object.entries(AUTHORIZATION_MATRIX) as [
    RouteKey,
    (typeof AUTHORIZATION_MATRIX)[RouteKey],
  ][]) {
    const [method, routePath] = key.split(' ') as [string, string];
    const path = row.path ?? routePath;
    describe(key, () => {
      for (const role of ROLES) {
        const expected = row.expect[role];
        if (expected === 'n/a') continue;
        const auth = authFor[role];
        if (!auth) {
          it.todo(`${role} → ${expected} (no credentials for this role yet)`);
          continue;
        }
        it(`${role} → ${expected}`, async () => {
          const headers = await auth();
          const res = await send(ctx().request(), method, path).set(headers);
          expect(res.status).toBe(expected);
        });
      }
    });
  }
});
