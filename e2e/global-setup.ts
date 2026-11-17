import { assertE2eMongoUrl } from './support/db-guard';
import { BASE_URL, E2E_MONGO_URL } from './support/env';
import { resetDatabase } from './support/db';

/**
 * TST-03 global setup: waits for the stack, reads the app's Google client
 * id (the `aud` of fake tokens) and empties the database once per run.
 * Runs once before all workers, so a reset never races a running test.
 * Fails first, before any request, unless `E2E_MONGO_URL` names the
 * `cestaky-e2e` database (the reset would empty any other one too).
 */
export default async function globalSetup(): Promise<void> {
  assertE2eMongoUrl(E2E_MONGO_URL);

  const deadline = Date.now() + 60_000;
  for (;;) {
    try {
      const res = await fetch(new URL('/health-check', BASE_URL));
      if (res.ok) break;
    } catch {
      // not up yet
    }
    if (Date.now() > deadline) {
      throw new Error(`E2E app not healthy at ${BASE_URL}/health-check`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  const res = await fetch(new URL('/api/auth/config', BASE_URL));
  const config = (await res.json()) as { googleClientId: string };
  // Inherited by the workers (spawned after global setup).
  process.env.E2E_GOOGLE_CLIENT_ID = config.googleClientId;

  await resetDatabase();
}
