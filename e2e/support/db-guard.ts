/**
 * TST-03 safety guard: the suite empties every collection of the database
 * it connects to, so it refuses any database other than the E2E stack's.
 * Checked on the connection string before connecting, and again on the
 * name the MongoDB driver resolved, before any read or write.
 */
export const E2E_DB_NAME = 'cestaky-e2e';

/**
 * Database name in the path of a `mongodb://` / `mongodb+srv://` URL, or
 * `null` when there is none (the driver would then use `test`).
 */
export function mongoUrlDbName(url: string): string | null {
  const match = /^mongodb(?:\+srv)?:\/\/([^/?#]*)(\/[^?#]*)?/.exec(url.trim());
  if (!match) {
    throw new Error(
      `E2E_MONGO_URL is not a MongoDB connection string: ${redact(url)}`,
    );
  }
  const path = match[2]?.slice(1) ?? '';
  return path === '' ? null : decodeURIComponent(path);
}

/** Throws unless `dbName` is exactly the E2E database. */
export function assertE2eDbName(dbName: string | null, source: string): void {
  if (dbName !== E2E_DB_NAME) {
    throw new Error(
      `Refusing to touch MongoDB database ${JSON.stringify(dbName ?? '(none)')} ` +
        `from ${source}: the E2E suite empties its database and only runs ` +
        `against "${E2E_DB_NAME}". Point E2E_MONGO_URL at the E2E stack ` +
        `(scripts/e2e-stack.sh sets it).`,
    );
  }
}

/** Throws unless `url` names the E2E database; returns `url`. */
export function assertE2eMongoUrl(url: string): string {
  assertE2eDbName(mongoUrlDbName(url), `E2E_MONGO_URL ${redact(url)}`);
  return url;
}

/** Hides credentials in error messages. */
function redact(url: string): string {
  return url.replace(/\/\/[^@/]*@/, '//***@');
}
