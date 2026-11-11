/**
 * TST-03 test-only environment (SET-02 "Test-only" list). Defaults match
 * `e2e/docker-compose.yml`; `scripts/e2e-stack.sh` sets them from the ports
 * it publishes.
 */
export const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:4100';

/**
 * Direct MongoDB connection of the E2E stack (data reset in global setup).
 * Its own variable, not the integration tests' `MONGO_TEST_URL`, so a URL
 * exported for those can never be emptied by this suite; `support/db.ts`
 * also refuses any database other than `cestaky-e2e` (`support/db-guard.ts`).
 */
export const E2E_MONGO_URL =
  process.env.E2E_MONGO_URL ??
  'mongodb://localhost:27018/cestaky-e2e?directConnection=true';

/** Mailpit HTTP API of the E2E stack. */
export const MAILPIT_API_URL =
  process.env.MAILPIT_API_URL ?? 'http://localhost:8026';

/** `APPROVAL_MAIL_RECEIVER` of the E2E app (NOT-02 recipient). */
export const APPROVER_EMAIL = 'approver@e2e.test';

/** Hosted domain of the E2E app (`HOSTED_DOMAIN`). */
export const HOSTED_DOMAIN = 'instea.co';

/**
 * Fixed future year with known Slovak holidays (TST-03 "Time"), so the real
 * date never changes results: 2031-01-06 (Mon, Epiphany), 2031-04-11 / 14
 * (Good Friday / Easter Monday), 2031-05-01 (Thu, Labour Day).
 */
export const YEAR = 2031;
