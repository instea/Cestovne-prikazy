import 'reflect-metadata';
import { Controller, Get, Module, Post } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { Request, Response } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { configureApp } from '../../src/app.setup';
import { ConfigModule } from '../../src/config/config.module';
import { type AppConfig, loadConfig } from '../../src/config/env.schema';
import {
  API_DOCS_JSON_PATH,
  API_DOCS_PATH,
  type ApiDocsRegistrar,
} from '../../src/docs/api-docs';
import { LoggingModule } from '../../src/logging/logging.module';
import { useHttpFakes } from '../mocks/http-fakes';
import { useTestApp } from '../support/app';
import { TEST_M2M, TEST_TOGGL } from '../support/env';
import { m2mAuth } from '../support/m2m';

/**
 * NFR-05 security hardening: API explorer only outside production, CORS
 * limited to the BASE_URL origin (requests and preflights), M2M Basic
 * credential cases. Config validation at boot: `env.schema.spec.ts` and
 * `test/health/process.int-spec.ts`; secrets in manifests:
 * `test/ops/manifests.int-spec.ts`.
 */

const APP_ORIGIN = 'https://cestaky.instea.co';
const EVIL_ORIGIN = 'https://evil.example';

const env = (nodeEnv: 'production' | 'development'): AppConfig =>
  loadConfig({
    NODE_ENV: nodeEnv,
    BASE_URL: `${APP_ORIGIN}/`,
    MONGO_URL: 'mongodb://unused',
    HOSTED_DOMAIN: 'instea.co',
    GOOGLE_CLIENT_ID: 'id',
    JWT_ACCESS_SECRET: 'x'.repeat(32),
    SMTP_HOST: 'h',
    SMTP_PORT: '25',
    SMTP_SECURE: 'false',
    SMTP_USER: 'u',
    SMTP_PASSWORD: 'p',
    MAIL_SENDER: 's@x',
    APPROVAL_MAIL_RECEIVER: 'r@x',
    M2M_USERNAME: 'm',
    M2M_PASSWORD: 'm',
    SSO_URI: 'https://sso.example/api',
    SSO_USERNAME: 's',
    SSO_PASSWORD: 's',
    LOG_LEVEL: 'fatal',
  });

@Controller('api/test')
class ProbeController {
  @Get('ok')
  ok(): { ok: true } {
    return { ok: true };
  }

  @Post('ok')
  post(): { ok: true } {
    return { ok: true };
  }
}

/** Stands in for the DOC-02 Swagger setup: mounts both explorer paths. */
function probeDocs(calls: string[]): ApiDocsRegistrar {
  return (app) => {
    calls.push('registered');
    for (const path of [API_DOCS_PATH, API_DOCS_JSON_PATH])
      app.use(`/${path}`, (_req: Request, res: Response) => {
        res.json({ docs: path });
      });
  };
}

async function createApp(
  config: AppConfig,
  apiDocs?: ApiDocsRegistrar,
): Promise<NestExpressApplication> {
  @Module({
    imports: [
      ConfigModule.forRoot(config),
      LoggingModule.forRoot({ write: () => undefined }),
    ],
    controllers: [ProbeController],
  })
  class ProbeModule {}

  const moduleRef = await Test.createTestingModule({
    imports: [ProbeModule],
  }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({
    bufferLogs: true,
  });
  // No SPA directory in tests; production would add the SPA fallback,
  // which never answers /api paths (test/http.int-spec.ts).
  configureApp(app, config, { staticRoot: '/nonexistent', apiDocs });
  await app.init();
  return app;
}

const NOT_FOUND = {
  statusCode: 404,
  code: 'NOT_FOUND',
  message: 'Route not found',
};

describe('API explorer (NFR-05 target 1)', () => {
  const docPaths = [
    `/${API_DOCS_PATH}`,
    `/${API_DOCS_PATH}/`,
    `/${API_DOCS_JSON_PATH}`,
  ];

  it('uses the DOC-02 paths', () => {
    expect([API_DOCS_PATH, API_DOCS_JSON_PATH]).toEqual([
      'api/docs',
      'api/docs-json',
    ]);
  });

  describe('production', () => {
    const calls: string[] = [];
    let app: NestExpressApplication;
    let appDefault: NestExpressApplication;

    beforeAll(async () => {
      app = await createApp(env('production'), probeDocs(calls));
      appDefault = await createApp(env('production'));
    });

    afterAll(async () => {
      await app.close();
      await appDefault.close();
    });

    it('never runs the registrar', () => {
      expect(calls).toEqual([]);
    });

    it.each(docPaths)('GET %s → 404 NOT_FOUND', async (path) => {
      for (const a of [app, appDefault])
        for (const accept of ['text/html', 'application/json']) {
          const res = await request(a.getHttpServer())
            .get(path)
            .set('Accept', accept);
          expect(res.status).toBe(404);
          expect(res.body).toEqual(NOT_FOUND);
        }
    });
  });

  // The gate opens outside production (registrar stand-in).
  describe('development', () => {
    const calls: string[] = [];
    let app: NestExpressApplication;

    beforeAll(async () => {
      app = await createApp(env('development'), probeDocs(calls));
    });

    afterAll(() => app.close());

    it('runs the registrar once and serves both paths', async () => {
      expect(calls).toEqual(['registered']);
      for (const path of [API_DOCS_PATH, API_DOCS_JSON_PATH]) {
        const res = await request(app.getHttpServer()).get(`/${path}`);
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ docs: path });
      }
    });
  });

  // DOC-02: the real app with the default registrar (explorer controller).
  describe('full app, production', () => {
    const ctx = useTestApp({
      env: { NODE_ENV: 'production', AUTH_GOOGLE_VERIFIER: undefined },
    });

    it.each([...docPaths, `/${API_DOCS_PATH}/swagger-ui.css`])(
      'GET %s → 404 NOT_FOUND (no explorer route)',
      async (path) => {
        const res = await ctx().request().get(path).set('Accept', 'text/html');
        expect(res.status).toBe(404);
        expect(res.body).toEqual(NOT_FOUND);
      },
    );
  });

  describe('full app, development', () => {
    const ctx = useTestApp({ env: { NODE_ENV: 'development' } });

    it.each([`/${API_DOCS_PATH}`, `/${API_DOCS_PATH}/`])(
      'GET %s → 200 Swagger UI page',
      async (path) => {
        const res = await ctx().request().get(path);
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toMatch(/^text\/html/);
        expect(res.text).toContain('<div id="swagger-ui"');
        expect(res.text).toContain('swagger-ui-bundle.js');
      },
    );

    it(`GET /${API_DOCS_JSON_PATH} → 200 OpenAPI 3.1 document`, async () => {
      const res = await ctx().request().get(`/${API_DOCS_JSON_PATH}`);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/^application\/json/);
      expect((res.body as { openapi: string }).openapi).toBe('3.1.0');
    });

    it('serves every asset the page loads, relative to the page URL', async () => {
      for (const [page, base] of [
        [`/${API_DOCS_PATH}`, `/${API_DOCS_PATH}/`],
        [`/${API_DOCS_PATH}/`, `/${API_DOCS_PATH}/`],
      ] as const) {
        const html = (await ctx().request().get(page)).text;
        const urls = [...html.matchAll(/(?:src|href|data-url)="([^"]+)"/g)].map(
          (m) => new URL(m[1]!, `http://x${page}`).pathname,
        );
        expect(urls.length).toBeGreaterThanOrEqual(6);
        for (const url of urls) {
          if (url !== `/${API_DOCS_JSON_PATH}`)
            expect(url.startsWith(base)).toBe(true);
          const res = await ctx().request().get(url);
          expect(res.status, url).toBe(200);
        }
      }
    });

    it('an asset outside the allowlist is 404 NOT_FOUND', async () => {
      for (const name of ['index.html', 'package.json', '..%2Fpackage.json']) {
        const res = await ctx().request().get(`/${API_DOCS_PATH}/${name}`);
        expect(res.status).toBe(404);
        expect(res.body).toEqual(NOT_FOUND);
      }
    });
  });
});

describe('CORS (NFR-05 target 2)', () => {
  let app: NestExpressApplication;
  const http = () => request(app.getHttpServer());
  const corsHeaders = (headers: Record<string, unknown>) =>
    Object.keys(headers).filter((h) => h.startsWith('access-control-'));

  beforeAll(async () => {
    app = await createApp(env('production'));
  });

  afterAll(() => app.close());

  it('echoes the BASE_URL origin with credentials', async () => {
    const res = await http().get('/api/test/ok').set('Origin', APP_ORIGIN);
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe(APP_ORIGIN);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('sends no CORS header to another origin', async () => {
    for (const origin of [
      EVIL_ORIGIN,
      'http://cestaky.instea.co',
      `${APP_ORIGIN}.evil.example`,
      'null',
    ]) {
      const res = await http().get('/api/test/ok').set('Origin', origin);
      expect(res.status).toBe(200);
      expect(corsHeaders(res.headers), origin).toEqual([]);
    }
  });

  it('answers a preflight from the BASE_URL origin', async () => {
    const res = await http()
      .options('/api/test/ok')
      .set('Origin', APP_ORIGIN)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type');
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe(APP_ORIGIN);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
    expect(res.headers['access-control-allow-methods']).toContain('POST');
  });

  it('gives a preflight from another origin no CORS headers', async () => {
    const res = await http()
      .options('/api/test/ok')
      .set('Origin', EVIL_ORIGIN)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type');
    expect(corsHeaders(res.headers)).toEqual([]);
    expect(res.status).not.toBe(204);
  });

  it('sends no CORS header without an Origin (same-origin request)', async () => {
    const res = await http().get('/api/test/ok');
    expect(corsHeaders(res.headers)).toEqual([]);
  });
});

describe('M2M Basic credentials (NFR-05 target 3)', () => {
  const fakes = useHttpFakes();
  const ctx = useTestApp();
  const unsetUser = useTestApp({ env: { M2M_USERNAME: undefined } });
  const unsetPassword = useTestApp({ env: { M2M_PASSWORD: undefined } });

  beforeEach(() => {
    fakes.sso.serve([
      {
        name: 'Ema',
        email: 'ema@instea.co',
        keys: [
          { key: 'togglUserId', value: '5' },
          { key: 'togglWorkspaceId', value: '42' },
          { key: 'togglApiToken', value: TEST_TOGGL.apiToken },
          { key: 'employee', value: '1' },
        ],
      },
    ]);
    fakes.toggl.servePages([[]]);
  });

  const PATH = '/api/attendence/2024/3';
  const sameLength = (s: string) =>
    s.slice(0, -1) + (s.endsWith('x') ? 'y' : 'x');

  async function expect401(
    app: ReturnType<typeof ctx>,
    authorization: string | undefined,
  ): Promise<void> {
    let req = app.request().get(PATH);
    if (authorization) req = req.set('Authorization', authorization);
    const res = await req;
    expect(res.status).toBe(401);
    expect(res.text).toBe('');
    expect(res.headers['www-authenticate']).toBeUndefined();
  }

  it('correct credentials → the request proceeds (200)', async () => {
    const res = await ctx().request().get(PATH).set('Authorization', m2mAuth());
    expect(res.status).toBe(200);
  });

  it.each([
    [
      'wrong password, equal length',
      { ...TEST_M2M, password: sameLength(TEST_M2M.password) },
    ],
    [
      'wrong password, different length',
      { ...TEST_M2M, password: `${TEST_M2M.password}-longer` },
    ],
    [
      'wrong username, equal length',
      { ...TEST_M2M, username: sameLength(TEST_M2M.username) },
    ],
    ['wrong username, different length', { ...TEST_M2M, username: 'u' }],
    ['both empty', { username: '', password: '' }],
  ])('%s → 401', async (_name, credentials) => {
    await expect401(ctx(), m2mAuth(credentials));
  });

  it('Bearer instead of Basic → 401', async () => {
    await expect401(ctx(), `Bearer ${TEST_M2M.password}`);
  });

  it('M2M_USERNAME unset → 401 even for the configured password', async () => {
    await expect401(unsetUser(), m2mAuth());
    await expect401(unsetUser(), m2mAuth({ ...TEST_M2M, username: '' }));
  });

  it('M2M_PASSWORD unset → 401 even for the configured username', async () => {
    await expect401(unsetPassword(), m2mAuth());
    await expect401(unsetPassword(), m2mAuth({ ...TEST_M2M, password: '' }));
  });
});
