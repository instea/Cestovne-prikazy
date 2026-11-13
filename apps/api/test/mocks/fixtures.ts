import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Versioned contract fixtures shared by the HTTP fakes, the TST-04
 * contract tests (`test/contract`) and later the MIG-03 parity harness.
 * A fixture change is a contract change.
 * SSO meta API (array of `{ name, email, keys: [{ key, value }] }`):
 * - `sso.basic.json`: employee, non-employee, user without `togglUserId`.
 * - `sso.duplicate-names.json`, `sso.duplicate-toggl-ids.json`,
 *   `sso.no-contract-type.json`, `sso.key-overrides-name.json`.
 * - `sso.malformed-*.json`: object body, element without `keys`, `null`
 *   element (a `text/html` answer is injected with `sso.fail`).
 * Toggl Reports v3 `search/time_entries` (array of
 * `{ user_id, time_entries: [{ seconds, start }] }`), one page, or a
 * `{ pages: [{ nextRowNumber, rows }] }` script:
 * - `toggl.single-page.json`, `toggl.three-pages.json`,
 *   `toggl.repeated-header.json`, `toggl.dst-boundary.json`,
 *   `toggl.midnight-crossing.json`, `toggl.outside-month-local.json`,
 *   `toggl.unknown-user.json`, `toggl.nan-seconds.json`.
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
