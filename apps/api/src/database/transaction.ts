import type { ClientSession, Connection } from 'mongoose';

/**
 * NFR-06: run `fn` in one MongoDB transaction (single-member replica set).
 * Commits when `fn` resolves, aborts and rethrows when it rejects, so a
 * domain write and its audit entry are persisted together or not at all.
 * Pass `session` to every write inside. Side effects outside the database
 * (emails, cookies) belong after this returns.
 *
 * Uses Mongoose's `connection.transaction()`, not the driver's
 * `session.withTransaction()`: on a transient error the transaction is
 * re-run, and Mongoose resets the change tracking of documents saved inside
 * it, so a retried `doc.save({ session })` writes its changes again instead
 * of committing only the audit entry. `fn` must still have no side effects
 * outside the session.
 */
export async function withTransaction<T>(
  connection: Connection,
  fn: (session: ClientSession) => Promise<T>,
): Promise<T> {
  let result: T | undefined;
  await connection.transaction(async (session) => {
    result = await fn(session);
  });
  return result as T;
}
