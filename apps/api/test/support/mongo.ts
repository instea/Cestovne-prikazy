import { randomUUID } from 'node:crypto';
import mongoose, { type Connection } from 'mongoose';
import { afterAll, beforeAll, inject } from 'vitest';

/** `mongoUrl` with database `dbName` and `directConnection=true`. */
export function databaseUrl(dbName: string): string {
  const url = new URL(inject('mongoUrl'));
  url.pathname = `/${dbName}`;
  url.searchParams.set('directConnection', 'true');
  return url.toString();
}

/**
 * Own database `test_<random>` per test file, dropped afterwards, so files
 * running in parallel never see each other's data.
 */
export function useTestDatabase(): {
  connection: () => Connection;
  url: () => string;
} {
  const dbName = `test_${randomUUID().replaceAll('-', '')}`;
  let connection: Connection | undefined;

  beforeAll(async () => {
    connection = await mongoose
      .createConnection(databaseUrl(dbName))
      .asPromise();
  });

  afterAll(async () => {
    await connection?.dropDatabase();
    await connection?.close();
  });

  return {
    connection: () => {
      if (!connection) throw new Error('useTestDatabase: used outside a test');
      return connection;
    },
    url: () => databaseUrl(dbName),
  };
}
