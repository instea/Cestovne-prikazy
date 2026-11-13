import 'reflect-metadata';
import {
  MongoDBContainer,
  type StartedMongoDBContainer,
} from '@testcontainers/mongodb';
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { User } from '../../src/users/user.schema';
import { createTestApp, useTestApp, type TestApp } from '../support/app';
import { seedUser } from '../support/seed';

describe('GET /health-check (shared MongoDB)', () => {
  const ctx = useTestApp();

  it('returns 200 {"checkMongo":"ok"} with no-store', async () => {
    const res = await ctx().request().get('/health-check');
    expect(res.status).toBe(200);
    expect(res.text).toBe('{"checkMongo":"ok"}');
    expect(res.headers['content-type']).toMatch(/^application\/json/);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('answers HEAD with the same status and no body', async () => {
    const res = await ctx().request().head('/health-check');
    expect(res.status).toBe(200);
    expect(res.text).toBeUndefined();
  });

  it.each(['post', 'put', 'delete'] as const)(
    'answers %s with 404',
    async (method) => {
      const res = await ctx().request()[method]('/health-check');
      expect(res.status).toBe(404);
    },
  );

  it('runs against its own test_<random> database (TST-02 smoke)', async () => {
    expect(ctx().dbName).toMatch(/^test_[0-9a-f]{32}$/);
    const Users = ctx().app.get<Model<User>>(getModelToken(User.name));
    expect(Users.db.name).toBe(ctx().dbName);
    expect(await Users.countDocuments()).toBe(0);
    await seedUser(ctx().app);
    expect(await Users.countDocuments()).toBe(1);
  });

  it('does not answer sub-paths', async () => {
    const res = await ctx().request().get('/health-check/x');
    expect(res.status).toBe(404);
  });
});

describe('database loss (own MongoDB container)', () => {
  let container: StartedMongoDBContainer;
  let app: TestApp;
  const exit = vi.fn();

  beforeAll(async () => {
    container = await new MongoDBContainer('mongo:8.0').start();
    const url = new URL(container.getConnectionString());
    url.pathname = '/health';
    url.searchParams.set('directConnection', 'true');
    app = await createTestApp(url.toString(), { processExit: exit });
  });
  afterAll(async () => {
    await app.close().catch(() => undefined);
  });

  it('returns 500 within 2.5 s and exits 254 after the DB goes away', async () => {
    await container.stop();
    const started = Date.now();
    const res = await app.request().get('/health-check');
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
