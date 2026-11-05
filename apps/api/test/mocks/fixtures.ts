import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Versioned contract fixtures shared by the TST-02 HTTP fakes and the
 * TST-04 contract tests (a fixture change is a contract change).
 * - `sso.basic.json`: employee, non-employee, and a user without
 *   `togglUserId` (not listed).
 * - `toggl.single-page.json`: one `search/time_entries` page.
 * TODO(TST-04): duplicates, malformed bodies, paging and DST fixtures.
 */
export const CONTRACT_FIXTURES_DIR = join(
  __dirname,
  '../../../../packages/shared/test-fixtures/contracts',
);

export function loadContractFixture(name: string): unknown {
  const file = join(CONTRACT_FIXTURES_DIR, name);
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as unknown;
  } catch (e) {
    throw new Error(`Cannot load contract fixture ${name} (${file})`, {
      cause: e,
    });
  }
}
