import {
  type CanActivate,
  Controller,
  Get,
  Injectable,
  Module,
} from '@nestjs/common';
import { ErrorCode } from '@leaves/shared/enums';
import { describe, expect, it } from 'vitest';
import {
  Authenticated,
  M2M,
  Public,
  Roles,
} from '../../src/auth/access.decorator';
import { AppException } from '../../src/common/app-exception';
import { useTestApp } from '../support/app';
import { startSession } from '../support/auth';
import { seedUser } from '../support/seed';

/**
 * NFR-01 (B8): one resolved access level, handler over controller, decides
 * every guard. Throwaway controllers whose handlers override the class.
 */
@Public()
@Controller('api/test/override/public-class')
class PublicClassController {
  @Get('open')
  open(): { ok: true } {
    return { ok: true };
  }

  @Authenticated()
  @Get('user')
  user(): { ok: true } {
    return { ok: true };
  }

  @Roles('admin')
  @Get('admin')
  admin(): { ok: true } {
    return { ok: true };
  }
}

@Injectable()
class DenyBasicGuard implements CanActivate {
  canActivate(): boolean {
    throw new AppException(401, ErrorCode.AUTH_REQUIRED, 'Basic required');
  }
}

@M2M(DenyBasicGuard)
@Controller('api/test/override/m2m-class')
class M2mClassController {
  @Get('m2m')
  m2m(): { ok: true } {
    return { ok: true };
  }

  @Public()
  @Get('open')
  open(): { ok: true } {
    return { ok: true };
  }

  @Authenticated()
  @Get('user')
  user(): { ok: true } {
    return { ok: true };
  }
}

@Module({ controllers: [PublicClassController, M2mClassController] })
class OverrideProbeModule {}

const ctx = useTestApp({ imports: [OverrideProbeModule] });

async function bearer(isAdmin: boolean): Promise<string> {
  const user = await seedUser(ctx().app, { isAdmin });
  return `Bearer ${(await startSession(ctx().app, user)).accessToken}`;
}

const get = (path: string, auth?: string) => {
  const req = ctx().request().get(`/api/test/override${path}`);
  return auth ? req.set('Authorization', auth) : req;
};

describe('handler access overrides the controller (NFR-01)', () => {
  it('class @Public(): an undeclared handler stays public', async () => {
    expect((await get('/public-class/open')).status).toBe(200);
  });

  it('class @Public() + handler @Authenticated() requires a token', async () => {
    const res = await get('/public-class/user');
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ code: ErrorCode.AUTH_REQUIRED });
    expect((await get('/public-class/user', await bearer(false))).status).toBe(
      200,
    );
  });

  it("class @Public() + handler @Roles('admin') requires a token, then admin", async () => {
    expect((await get('/public-class/admin')).status).toBe(401);
    const user = await get('/public-class/admin', await bearer(false));
    expect(user.status).toBe(403);
    expect(user.body).toMatchObject({ code: ErrorCode.FORBIDDEN });
    expect((await get('/public-class/admin', await bearer(true))).status).toBe(
      200,
    );
  });

  it('class @M2M(): the Basic guard runs only where the resolved level is m2m', async () => {
    // m2m: Basic guard runs (and denies), a Bearer token does not help.
    expect((await get('/m2m-class/m2m', await bearer(true))).status).toBe(401);
    // Handler @Public(): neither the Basic guard nor the token guard.
    expect((await get('/m2m-class/open')).status).toBe(200);
    // Handler @Authenticated(): the token guard, not the Basic guard.
    expect((await get('/m2m-class/user')).status).toBe(401);
    expect((await get('/m2m-class/user', await bearer(false))).status).toBe(
      200,
    );
  });
});
