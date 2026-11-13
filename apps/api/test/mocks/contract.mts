/**
 * TST-04 / MIG-03: the request side of the SSO and Toggl contracts, shared
 * by the in-process MSW fakes (`http-fakes.ts`) and the standalone parity
 * mock server (`test/parity/mock-server.mts`). Node built-ins only, so the
 * mock container runs it with plain `node` (type stripping, no deps).
 */

export const basicAuth = (user: string, pass: string): string =>
  `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const TOGGL_KEYS: ReadonlySet<string> = new Set([
  'start_date',
  'end_date',
  'user_ids',
  'first_row_number',
]);

export const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** `null` when the Toggl search body follows the contract, else why not. */
export function togglBodyProblem(body: unknown): string | null {
  if (!isRecord(body)) return 'body is not an object';
  for (const key of Object.keys(body))
    if (!TOGGL_KEYS.has(key)) return `unknown key ${key}`;
  for (const key of ['start_date', 'end_date'] as const) {
    const v = body[key];
    if (typeof v !== 'string' || !ISO_DATE.test(v))
      return `${key} is not YYYY-MM-DD`;
  }
  if (
    !Array.isArray(body.user_ids) ||
    !body.user_ids.every((id) => Number.isInteger(id))
  )
    return 'user_ids is not an array of integers';
  if (
    body.first_row_number !== undefined &&
    !Number.isInteger(body.first_row_number)
  )
    return 'first_row_number is not an integer';
  return null;
}

/** `POST {base}/workspace/:ws/search/time_entries` path, base excluded. */
export const TOGGL_SEARCH_PATH = /\/workspace\/([^/]+)\/search\/time_entries$/;

/**
 * A scripted Toggl conversation (`toggl.<case>.json` with `pages`): the
 * n-th request gets `pages[n]`, with `X-Next-Row-Number` set to
 * `nextRowNumber` (omitted when `null`), whatever `first_row_number` says.
 */
export interface TogglScript {
  pages: { nextRowNumber: string | null; rows: unknown[] }[];
}

export const isTogglScript = (v: unknown): v is TogglScript =>
  isRecord(v) && Array.isArray(v.pages);

/**
 * Decodes `Authorization: Basic …` into `[user, pass]` (split at the first
 * `:`), or `null`.
 */
export function decodeBasic(
  header: string | null | undefined,
): [string, string] | null {
  const m = /^basic +([A-Za-z0-9+/._~-]+=*) *$/i.exec(header ?? '');
  if (!m) return null;
  const text = Buffer.from(m[1]!, 'base64').toString('utf8');
  const i = text.indexOf(':');
  return i < 0 ? null : [text.slice(0, i), text.slice(i + 1)];
}
