import { MongoClient } from 'mongodb';
import { MONGO_TEST_URL } from './env';

/**
 * TST-03: direct MongoDB access of the E2E stack (`MONGO_TEST_URL`). There
 * is no test-only reset endpoint in the app.
 */
async function withDb<T>(
  fn: (db: ReturnType<MongoClient['db']>) => Promise<T>,
): Promise<T> {
  const client = new MongoClient(MONGO_TEST_URL, {
    serverSelectionTimeoutMS: 10_000,
  });
  try {
    await client.connect();
    return await fn(client.db());
  } finally {
    await client.close();
  }
}

/**
 * Empties every collection. Documents only, not `dropDatabase()`: the app
 * keeps running and built its indexes (unique email / id, refresh-token
 * TTL) at startup; a dropped database would run the suite without them.
 */
export function resetDatabase(): Promise<void> {
  return withDb(async (db) => {
    const collections = await db
      .listCollections({}, { nameOnly: true })
      .toArray();
    for (const { name } of collections) {
      if (!name.startsWith('system.')) await db.collection(name).deleteMany({});
    }
  });
}

/**
 * The AUTH-04 `promote-admin` CLI in one statement: the bootstrap admin
 * the suite needs before any admin exists to promote others via the API.
 */
export function promoteAdmin(userId: string): Promise<void> {
  return withDb(async (db) => {
    const res = await db
      .collection('users')
      .updateOne({ id: userId }, { $set: { isAdmin: true } });
    if (res.matchedCount !== 1)
      throw new Error(`promoteAdmin: no user ${userId}`);
  });
}
