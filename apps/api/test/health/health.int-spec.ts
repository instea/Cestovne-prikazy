import 'reflect-metadata';
import {
  MongoDBContainer,
  type StartedMongoDBContainer,
} from '@testcontainers/mongodb';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { loadConfig } from '../../src/config/env.schema';
import { PROCESS_EXIT } from '../../src/database/connection-watcher';
import { useTestDatabase } from '../support/mongo';

const baseEnv = {
  NODE_ENV: 'test',
  HOSTED_DOMAIN: 'instea.co',
  GOOGLE_CLIENT_ID: 'client-id',
  JWT_ACCESS_SECRET: 'x'.repeat(32),
  LOG_LEVEL: 'fatal',
};

async function createApp(mongoUrl: string, exit = vi.fn()) {
  const config = loadConfig({ ...baseEnv, MONGO_URL: mongoUrl });
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.forRoot(config)],
  })
    .overrideProvider(PROCESS_EXIT)
    .useValue(exit)
    .compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({
    bufferLogs: true,
  });
  configureApp(app, config);
  await app.init();
  return app;
}

describe('GET /health-check (shared MongoDB)', () => {
  const db = useTestDatabase();
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createApp(db.url());
  });
  afterAll(async () => {
    await app.close();
  });

  it('returns 200 {"checkMongo":"ok"} with no-store', async () => {
    const res = await request(app.getHttpServer()).get('/health-check');
    expect(res.status).toBe(200);
    expect(res.text).toBe('{"checkMongo":"ok"}');
    expect(res.headers['content-type']).toMatch(/^application\/json/);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('answers HEAD with the same status and no body', async () => {
    const res = await request(app.getHttpServer()).head('/health-check');
    expect(res.status).toBe(200);
    expect(res.text).toBeUndefined();
  });

  it.each(['post', 'put', 'delete'] as const)(
    'answers %s with 404',
    async (method) => {
      const res = await request(app.getHttpServer())[method]('/health-check');
      expect(res.status).toBe(404);
    },
  );

  it('does not answer sub-paths', async () => {
    const res = await request(app.getHttpServer()).get('/health-check/x');
    expect(res.status).toBe(404);
  });
});

describe('database loss (own MongoDB container)', () => {
  let container: StartedMongoDBContainer;
  let app: NestExpressApplication;
  const exit = vi.fn();

  beforeAll(async () => {
    container = await new MongoDBContainer('mongo:8.0').start();
    const url = new URL(container.getConnectionString());
    url.pathname = '/health';
    url.searchParams.set('directConnection', 'true');
    app = await createApp(url.toString(), exit);
  });
  afterAll(async () => {
    await app.close().catch(() => undefined);
  });

  it('returns 500 within 2.5 s and exits 254 after the DB goes away', async () => {
    await container.stop();
    const started = Date.now();
    const res = await request(app.getHttpServer()).get('/health-check');
    expect(Date.now() - started).toBeLessThan(2500);
    expect(res.status).toBe(500);
    expect(typeof (res.body as { checkMongo: unknown }).checkMongo).toBe(
      'string',
    );
    expect((res.body as { checkMongo: string }).checkMongo).not.toBe('ok');
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(254), {
      timeout: 30_000,
    });
  }, 60_000);
});
