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

/** Fresh database name `test_<32 hex>`. */
export function testDatabaseName(): string {
  return `test_${randomUUID().replaceAll('-', '')}`;
}

/**
 * Own database `test_<random>` per test file, dropped afterwards, so files
 * running in parallel never see each other's data.
 */
export function useTestDatabase(): {
  connection: () => Connection;
  url: () => string;
} {
  const dbName = testDatabaseName();
  let connection: Connection | undefined;

  beforeAll(async () => {
    connection = await mongoose
      .createConnection(databaseUrl(dbName))
      .asPromise();
  });

  afterAll(async () => {
    try {
      await connection?.dropDatabase();
    } finally {
      await connection?.close();
    }
  });

  return {
    connection: () => {
      if (!connection) throw new Error('useTestDatabase: used outside a test');
      return connection;
    },
    url: () => databaseUrl(dbName),
  };
}
