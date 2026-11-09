import 'reflect-metadata';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Body, Controller, Get, Module, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { PinoLogger } from 'nestjs-pino';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { IsString } from 'class-validator';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { configureApp } from '../src/app.setup';
import { ConfigModule } from '../src/config/config.module';
import { loadConfig, type AppConfig } from '../src/config/env.schema';
import { LoggingModule } from '../src/logging/logging.module';

class EchoDto {
  @IsString({ message: 'name must be a string' })
  name!: string;
}

@Controller('api/test')
class TestController {
  constructor(private readonly logger: PinoLogger) {}

  @Get('cookie')
  cookie(@Res({ passthrough: true }) res: Response): { ok: true } {
    res.append('Set-Cookie', 'refresh_token=super-secret-set-cookie; HttpOnly');
    return { ok: true };
  }

  /** A log call carrying an ID token at several depths (NFR-02). */
  @Post('id-token')
  idToken(@Body() body: Record<string, unknown>): { ok: true } {
    this.logger.info(
      { idToken: body.idToken, request: { idToken: body.idToken } },
      'login attempt',
    );
    return { ok: true };
  }

  /** An upstream error carrying credentials deep in its fields (NFR-02). */
  @Post('upstream-error')
  upstreamError(@Body() body: Record<string, unknown>): { ok: true } {
    const err = Object.assign(new Error('upstream call failed'), {
      config: {
        headers: { Authorization: `Bearer ${String(body.idToken)}` },
        data: { idToken: body.idToken, refresh_token: body.idToken },
      },
    });
    this.logger.error({ err, togglApiToken: body.idToken }, 'upstream');
    return { ok: true };
  }

  @Post('echo')
  echo(@Body() body: EchoDto): EchoDto {
    return body;
  }

  @Get('boom')
  boom(): never {
    throw new Error('secret internal detail');
  }

  @Get('ok')
  ok(): { ok: true } {
    return { ok: true };
  }
}

interface LogLine {
  req?: { id: string; path: string; headers: Record<string, string> };
  res?: { statusCode: number };
  responseTime?: number;
}

const prodEnv = {
  NODE_ENV: 'production',
  BASE_URL: 'https://cestaky.instea.co',
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
  LOG_LEVEL: 'info',
};

async function createApp(config: AppConfig, staticRoot?: string) {
  const lines: string[] = [];
  const destination = { write: (line: string) => void lines.push(line) };

  @Module({
    imports: [ConfigModule.forRoot(config), LoggingModule.forRoot(destination)],
    controllers: [TestController],
  })
  class TestAppModule {}

  const moduleRef = await Test.createTestingModule({
    imports: [TestAppModule],
  }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({
    bufferLogs: true,
  });
  configureApp(app, config, staticRoot ? { staticRoot } : {});
  await app.init();
  return { app, lines };
}

describe('HTTP pipeline (production config)', () => {
  let app: NestExpressApplication;
  let lines: string[];
  let staticRoot: string;

  beforeAll(async () => {
    staticRoot = mkdtempSync(join(tmpdir(), 'leaves-spa-'));
    mkdirSync(join(staticRoot, 'assets'));
    writeFileSync(
      join(staticRoot, 'index.html'),
      '<!doctype html><title>Leaves</title>',
    );
    writeFileSync(
      join(staticRoot, 'assets', 'index-abc123.js'),
      'console.log(1)',
    );
    ({ app, lines } = await createApp(loadConfig(prodEnv), staticRoot));
  });

  afterAll(async () => {
    await app.close();
    rmSync(staticRoot, { recursive: true, force: true });
  });

  const http = () => request(app.getHttpServer());

  it('returns 400 VALIDATION_FAILED for an unknown property', async () => {
    const res = await http()
      .post('/api/test/echo')
      .send({ name: 'a', extra: 1 });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      statusCode: 400,
      code: 'VALIDATION_FAILED',
      message: 'property extra should not exist',
    });
  });

  it('returns the first constraint message', async () => {
    const res = await http().post('/api/test/echo').send({ name: 5 });
    expect(res.body).toEqual({
      statusCode: 400,
      code: 'VALIDATION_FAILED',
      message: 'name must be a string',
    });
  });

  it('returns 403 PAYLOAD_TOO_LARGE for a JSON body over 100 KB, logged at warn', async () => {
    lines.length = 0;
    const res = await http()
      .post('/api/test/echo')
      .send({ name: 'x'.repeat(200 * 1024) });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      statusCode: 403,
      code: 'PAYLOAD_TOO_LARGE',
      message: 'Request body is too large',
    });
    const parsed = lines.map(
      (l) => JSON.parse(l) as { level: number; msg?: string },
    );
    // pino levels: 40 warn, 50 error.
    expect(parsed.filter((l) => l.level >= 50)).toEqual([]);
    expect(parsed).toContainEqual(
      expect.objectContaining({
        level: 40,
        msg: expect.stringContaining('Request body is too large') as string,
      }),
    );
  });

  it('returns 400 VALIDATION_FAILED for malformed JSON', async () => {
    const res = await http()
      .post('/api/test/echo')
      .set('Content-Type', 'application/json')
      .send('{"name":');
    expect(res.status).toBe(400);
    expect((res.body as { code: string }).code).toBe('VALIDATION_FAILED');
  });

  it('returns 500 INTERNAL_ERROR without internals', async () => {
    const res = await http().get('/api/test/boom');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    });
    expect(res.text).not.toContain('secret internal detail');
  });

  it('returns 404 NOT_FOUND JSON for an unknown API route', async () => {
    for (const path of ['/api/nope', '/api']) {
      const res = await http().get(path).set('Accept', 'text/html');
      expect(res.status).toBe(404);
      expect(res.body).toEqual({
        statusCode: 404,
        code: 'NOT_FOUND',
        message: 'Route not found',
      });
    }
  });

  it('serves index.html for an HTML GET of a client route', async () => {
    const res = await http().get('/leaves/new').set('Accept', 'text/html');
    expect(res.status).toBe(200);
    expect(res.text).toContain('<title>Leaves</title>');
    expect(res.headers['cache-control']).toBe('no-cache');
  });

  it('does not serve index.html for a mixed-case API or health path', async () => {
    // Express routes case-insensitively, so these reach the backend.
    const api = await http().get('/API/Test/ok').set('Accept', '*/*');
    expect(api.headers['content-type']).toMatch(/^application\/json/);
    const health = await http().get('/Health-Check').set('Accept', '*/*');
    expect(health.text).not.toContain('<title>Leaves</title>');
  });

  it('serves hashed assets as immutable', async () => {
    const res = await http().get('/assets/index-abc123.js');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe(
      'public, max-age=31536000, immutable',
    );
  });

  it('does not fall back to index.html for a non-HTML request', async () => {
    const res = await http()
      .get('/assets/missing.js')
      .set('Accept', 'application/javascript');
    expect(res.status).toBe(404);
  });

  it('allows CORS only for the BASE_URL origin', async () => {
    const evil = await http()
      .get('/api/test/ok')
      .set('Origin', 'https://evil.example');
    expect(evil.headers['access-control-allow-origin']).toBeUndefined();

    const own = await http()
      .get('/api/test/ok')
      .set('Origin', 'https://cestaky.instea.co');
    expect(own.headers['access-control-allow-origin']).toBe(
      'https://cestaky.instea.co',
    );
    expect(own.headers['access-control-allow-credentials']).toBe('true');
  });

  it('logs requests without secrets, with path and request id', async () => {
    lines.length = 0;
    await http()
      .get('/api/test/ok?q=private')
      .set('Authorization', 'Bearer super-secret-token')
      .set('Cookie', 'refresh=super-secret-cookie')
      .set('x-request-id', 'req-123');
    const line = lines
      .map((l) => JSON.parse(l) as LogLine)
      .find((l) => l.req?.id === 'req-123');
    expect(line).toBeDefined();
    const raw = JSON.stringify(line);
    expect(raw).not.toContain('super-secret');
    expect(raw).not.toContain('q=private');
    expect(line!.req!.headers.authorization).toBe('[Redacted]');
    expect(line!.req!.headers.cookie).toBe('[Redacted]');
    expect(line!.req!.path).toBe('/api/test/ok');
    expect(line!.res!.statusCode).toBe(200);
    expect(typeof line!.responseTime).toBe('number');
  });

  it('redacts set-cookie in response logs (NFR-02)', async () => {
    lines.length = 0;
    await http().get('/api/test/cookie').set('x-request-id', 'req-cookie');
    const line = lines.find((l) => l.includes('req-cookie'));
    expect(line).toBeDefined();
    expect(line).not.toContain('super-secret-set-cookie');
    const parsed = JSON.parse(line!) as {
      res: { headers: Record<string, unknown> };
    };
    expect(parsed.res.headers['set-cookie']).toBe('[Redacted]');
  });

  it('redacts idToken in logged objects (NFR-02)', async () => {
    lines.length = 0;
    await http()
      .post('/api/test/id-token')
      .send({ idToken: 'super-secret-id-token' });
    const line = lines.find((l) => l.includes('login attempt'));
    expect(line).toBeDefined();
    expect(line).not.toContain('super-secret-id-token');
    expect(JSON.parse(line!)).toMatchObject({
      idToken: '[Redacted]',
      request: { idToken: '[Redacted]' },
    });
    expect(lines.join('\n')).not.toContain('super-secret-id-token');
  });

  it('redacts credential fields at any depth, e.g. err.config.data.idToken (NFR-02)', async () => {
    lines.length = 0;
    await http()
      .post('/api/test/upstream-error')
      .send({ idToken: 'super-secret-nested-token' });
    const line = lines.find((l) => l.includes('"msg":"upstream"'));
    expect(line).toBeDefined();
    expect(lines.join('\n')).not.toContain('super-secret-nested-token');
    expect(JSON.parse(line!)).toMatchObject({
      togglApiToken: '[Redacted]',
      err: {
        type: 'Error',
        message: 'upstream call failed',
        stack: expect.stringContaining('upstream call failed') as string,
        config: {
          headers: { Authorization: '[Redacted]' },
          data: { idToken: '[Redacted]', refresh_token: '[Redacted]' },
        },
      },
    });
  });

  it('echoes or generates x-request-id', async () => {
    const given = await http().get('/api/test/ok').set('x-request-id', 'abc');
    expect(given.headers['x-request-id']).toBe('abc');
    const generated = await http().get('/api/test/ok');
    expect(generated.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('HTTP pipeline (test config)', () => {
  it('sends no CORS headers and serves no SPA', async () => {
    const { app } = await createApp(
      loadConfig({
        HOSTED_DOMAIN: 'x',
        GOOGLE_CLIENT_ID: 'x',
        JWT_ACCESS_SECRET: 'x'.repeat(32),
        NODE_ENV: 'test',
      }),
    );
    const res = await request(app.getHttpServer())
      .get('/leaves')
      .set('Accept', 'text/html')
      .set('Origin', 'http://localhost:5173');
    expect(res.status).toBe(404);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    await app.close();
  });
});
