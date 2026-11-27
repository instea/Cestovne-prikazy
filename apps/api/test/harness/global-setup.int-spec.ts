import { getConnectionToken } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import { describe, expect, inject, it, vi } from 'vitest';
import { createTestApp, dropAndClose } from '../support/app';
import {
  assertMongoServer,
  mongoServerProblem,
  startAllOrStop,
} from '../support/global-setup';
import { databaseUrl, testDatabaseName } from '../support/mongo';

describe('MongoDB check (MONGO_TEST_URL / container)', () => {
  it('accepts a MongoDB 8 replica-set member', () => {
    expect(mongoServerProblem({ setName: 'rs0', version: '8.0.4' })).toBeNull();
    expect(mongoServerProblem({ setName: 'rs', version: '9.1.0' })).toBeNull();
  });

  it('rejects a standalone server', () => {
    expect(mongoServerProblem({ version: '8.0.4' })).toMatch(
      /not a replica-set member/,
    );
  });

  it('rejects MongoDB older than 8', () => {
    expect(mongoServerProblem({ setName: 'rs0', version: '7.0.12' })).toMatch(
      /MongoDB 7\.0\.12, need 8/,
    );
    expect(mongoServerProblem({ setName: 'rs0', version: '' })).toMatch(
      /need 8/,
    );
  });

  it("passes for this run's MongoDB", async () => {
    await expect(
      assertMongoServer(inject('mongoUrl')),
    ).resolves.toBeUndefined();
  });
});

describe('startAllOrStop', () => {
  const container = () => ({ stop: vi.fn(() => Promise.resolve()) });

  it('returns every started service in order', async () => {
    const a = { container: container() };
    const b = {};
    await expect(
      startAllOrStop<[typeof a, typeof b]>([
        Promise.resolve(a),
        Promise.resolve(b),
      ]),
    ).resolves.toEqual([a, b]);
    expect(a.container.stop).not.toHaveBeenCalled();
  });

  it('stops the started containers and rethrows when one start fails', async () => {
    const mongo = { container: container() };
    const boom = new Error('mailpit /readyz timeout');
    await expect(
      startAllOrStop<[typeof mongo, typeof mongo]>([
        Promise.resolve(mongo),
        Promise.reject(boom),
      ]),
    ).rejects.toBe(boom);
    expect(mongo.container.stop).toHaveBeenCalledOnce();
  });
});

describe('dropAndClose', () => {
  it('closes the app even when dropping the database fails', async () => {
    const { app } = await createTestApp(databaseUrl(testDatabaseName()));
    const conn = app.get<Connection>(getConnectionToken());
    vi.spyOn(conn, 'dropDatabase').mockRejectedValueOnce(
      new Error('DB is gone'),
    );
    await expect(dropAndClose(app)).rejects.toThrow('DB is gone');
    expect(conn.readyState).toBe(0); // disconnected
  });
});
