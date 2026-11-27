import { All, Controller, Get, Module, Post, Put } from '@nestjs/common';
import { ErrorCode } from '@leaves/shared/enums';
import { describe, expect, it } from 'vitest';
import { Authenticated, Public } from '../../src/auth/access.decorator';
import { useHttpFakes } from '../mocks/http-fakes';
import {
  CALLERS,
  type Caller,
  type Expectation,
  PERMISSIONS,
  REMOVED_ENDPOINTS,
} from '../permissions';
import { useTestApp } from '../support/app';
import { loginAs, startSession } from '../support/auth';
import { m2mAuth } from '../support/m2m';
import { type SeedUserOptions, seedLeave, seedUser } from '../support/seed';
import {
  assertAccessDeclared,
  assertMatrixCoversRoutes,
  listDeclaredRoutes,
  listRoutes,
  routeKey,
  send,
  type RouteKey,
} from './routes';

/**
 * NFR-01: the permission matrix (`test/permissions.ts`) run against the
 * real app — every row × caller kind asserts status, error `code` and the
 * error body shape — plus the route-coverage checks.
 */

@Authenticated()
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
  @Public()
  @Get()
  root(): void {}

  // No access declaration: must fail the NFR-01 declaration check.
  @Get('undeclared')
  undeclared(): void {}
}

@Module({ controllers: [NewThingController, RootController] })
class NewThingModule {}

describe('route list (from Nest metadata)', () => {
  const ctx = useTestApp();

  it('lists the routes of the current app', () => {
    expect(listRoutes(ctx().app)).toEqual([
      { method: 'GET', path: '/api/admin/audit' },
      { method: 'HEAD', path: '/api/admin/audit' },
      { method: 'POST', path: '/api/admin/users/:id/anonymize' },
      { method: 'GET', path: '/api/admin/users/:id/export' },
      { method: 'HEAD', path: '/api/admin/users/:id/export' },
      { method: 'GET', path: '/api/attendence/:year/:month' },
      { method: 'HEAD', path: '/api/attendence/:year/:month' },
      { method: 'GET', path: '/api/auth/config' },
      { method: 'HEAD', path: '/api/auth/config' },
      { method: 'POST', path: '/api/auth/google' },
      { method: 'POST', path: '/api/auth/logout' },
      { method: 'GET', path: '/api/auth/me' },
      { method: 'HEAD', path: '/api/auth/me' },
      { method: 'POST', path: '/api/auth/refresh' },
      { method: 'GET', path: '/api/docs' },
      { method: 'HEAD', path: '/api/docs' },
      { method: 'GET', path: '/api/docs-json' },
      { method: 'HEAD', path: '/api/docs-json' },
      { method: 'GET', path: '/api/docs/:asset' },
      { method: 'HEAD', path: '/api/docs/:asset' },
      { method: 'GET', path: '/api/leaves' },
      { method: 'HEAD', path: '/api/leaves' },
      { method: 'POST', path: '/api/leaves' },
      { method: 'DELETE', path: '/api/leaves/:id' },
      { method: 'POST', path: '/api/leaves/:id/approve' },
      { method: 'POST', path: '/api/leaves/:id/reject' },
      { method: 'GET', path: '/api/leaves/summary' },
      { method: 'HEAD', path: '/api/leaves/summary' },
      { method: 'GET', path: '/api/users' },
      { method: 'HEAD', path: '/api/users' },
      { method: 'GET', path: '/api/users/:id' },
      { method: 'HEAD', path: '/api/users/:id' },
      { method: 'PATCH', path: '/api/users/:id' },
      { method: 'POST', path: '/api/users/:id/deactivate' },
      { method: 'PATCH', path: '/api/users/me' },
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
      assertMatrixCoversRoutes(listRoutes(ctx().app), PERMISSIONS),
    ).toThrow('Route GET /api/new-thing/:id missing from authorization matrix');
  });

  it('reads access declarations from the handler, else the controller', () => {
    const access = Object.fromEntries(
      listDeclaredRoutes(ctx().app).map((r) => [routeKey(r), r.access]),
    );
    expect(access['GET /api/new-thing/:id']).toBe('user');
    expect(access['GET /']).toBe('public');
    expect(access['GET /undeclared']).toBeUndefined();
  });

  it('fails the declaration check for a route without @Public/@Authenticated/@Roles/@M2M', () => {
    expect(() =>
      assertAccessDeclared(listDeclaredRoutes(ctx().app), PERMISSIONS),
    ).toThrow('Route GET /undeclared has no access declaration');
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

  it('fails when a declaration differs from the matrix access', () => {
    expect(() =>
      assertAccessDeclared([{ method: 'GET', path: '/a', access: 'user' }], {
        'GET /a': { access: 'admin' },
      }),
    ).toThrow("Route GET /a is declared 'user' but the matrix says 'admin'");
  });
});

describe('permission matrix (NFR-01)', () => {
  // ATT-01 rows call SSO / Toggl: the default fakes answer them.
  useHttpFakes();
  const ctx = useTestApp();

  it('every route has a matrix row and every row a route', () => {
    assertMatrixCoversRoutes(listRoutes(ctx().app), PERMISSIONS);
  });

  it('every route declares its access level, equal to the matrix', () => {
    assertAccessDeclared(listDeclaredRoutes(ctx().app), PERMISSIONS);
  });

  it('an unknown /api route is 404 NOT_FOUND (error body)', async () => {
    const res = await ctx().request().get('/api/no-such-route');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      statusCode: 404,
      code: ErrorCode.NOT_FOUND,
      message: expect.any(String) as string,
    });
  });

  it.each(REMOVED_ENDPOINTS)(
    'removed endpoint %s %s is 404 NOT_FOUND',
    async (method, path) => {
      // As an admin: removed routes are gone for everyone, not just denied.
      const headers = await bearerFor({ isAdmin: true });
      const res = await send(ctx().request(), method, path).set(headers);
      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({
        statusCode: 404,
        code: ErrorCode.NOT_FOUND,
      });
    },
  );

  /**
   * Bearer header for `user` (seeded unless given), obtained through the
   * real `POST /api/auth/google` path (`loginAs`). A deactivated user
   * cannot log in (403), so its token comes straight from AUTH-02
   * `SessionService.startSession`: the session it presented before being
   * deactivated.
   */
  const bearerFor = async (
    options: SeedUserOptions,
    existing?: Awaited<ReturnType<typeof seedUser>>,
  ): Promise<Record<string, string>> => {
    const user = existing ?? (await seedUser(ctx().app, options));
    const { accessToken } =
      options.active === false
        ? await startSession(ctx().app, user)
        : await loginAs(ctx().app, user);
    return { Authorization: `Bearer ${accessToken}` };
  };

  /**
   * The request path and credentials per caller. On a `resource: 'leave'`
   * row, each request gets a fresh leave owned by user A (`owner`); `user`
   * is a different user B, so a non-owner.
   */
  const prepare = async (
    row: (typeof PERMISSIONS)[RouteKey],
    routePath: string,
    caller: Caller,
  ): Promise<{ path: string; headers: Record<string, string> }> => {
    let path = row.path ?? routePath;
    let owner: Awaited<ReturnType<typeof seedUser>> | undefined;
    if (row.resource === 'leave') {
      owner = await seedUser(ctx().app, { firstName: 'Owner', surname: 'A' });
      const leave = await seedLeave(ctx().app, { requester: owner });
      path = path.replace(':id', leave.id);
    }
    const credentials: Record<Caller, () => Promise<Record<string, string>>> = {
      anonymous: () => Promise.resolve({}),
      deactivated: () => bearerFor({ active: false }),
      user: () => bearerFor({}),
      owner: () => {
        if (!owner) throw new Error('owner caller on a row without resource');
        return bearerFor({}, owner);
      },
      admin: () => bearerFor({ isAdmin: true }),
      m2m: () => Promise.resolve({ Authorization: m2mAuth() }),
    };
    const headers = await credentials[caller]();
    return { path, headers };
  };

  for (const [key, row] of Object.entries(PERMISSIONS) as [
    RouteKey,
    (typeof PERMISSIONS)[RouteKey],
  ][]) {
    const [method, routePath] = key.split(' ') as [string, string];
    describe(key, () => {
      for (const caller of CALLERS) {
        const expected = row.expect[caller];
        if (expected === 'n/a') continue;
        const label = `${caller} → ${expected.status}${expected.code ? ` ${expected.code}` : ''}`;
        it(label, async () => {
          const { path, headers } = await prepare(row, routePath, caller);
          const res = await send(ctx().request(), method, path).set(headers);
          expect(res.status).toBe(expected.status);
          // HEAD responses carry no body.
          if (method === 'HEAD' || expected.status < 400) return;
          if (expected.emptyBody) {
            expect(res.text ?? '').toBe('');
            return;
          }
          // Denied: always the error body, never 200 with null / empty.
          expect(res.body).toEqual({
            statusCode: expected.status,
            code: expected.code,
            message: expect.any(String) as string,
          });
        });
      }
      for (const [caller, expected] of Object.entries(
        row.unknownResource ?? {},
      ) as [Caller, Expectation][]) {
        it(`${caller} on an unknown id → ${expected.status} ${expected.code ?? ''}`, async () => {
          const { headers } = await prepare(row, routePath, caller);
          const path = (row.path ?? routePath).replace(':id', 'no-such-leave');
          const res = await send(ctx().request(), method, path).set(headers);
          expect(res.status).toBe(expected.status);
          expect(res.body).toEqual({
            statusCode: expected.status,
            code: expected.code,
            message: expect.any(String) as string,
          });
        });
      }
    });
  }
});
