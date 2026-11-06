import type { ClientSession, Connection } from 'mongoose';

/**
 * NFR-06: run `fn` in one MongoDB transaction (single-member replica set).
 * Commits when `fn` resolves, aborts and rethrows when it rejects, so a
 * domain write and its audit entry are persisted together or not at all.
 * Pass `session` to every write inside. Side effects outside the database
 * (emails, cookies) belong after this returns.
 * The driver may re-run `fn` on a transient transaction error, so `fn` must
 * not have side effects outside the session.
 */
export async function withTransaction<T>(
  connection: Connection,
  fn: (session: ClientSession) => Promise<T>,
): Promise<T> {
  const session = await connection.startSession();
  try {
    let result: T | undefined;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result as T;
  } finally {
    await session.endSession();
  }
}
