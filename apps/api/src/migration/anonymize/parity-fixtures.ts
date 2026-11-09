import { findLeaks, stringsIn } from './legacy-anonymizer';
import { isOpaqueValue, Pseudonymizer } from './pseudonym';

/**
 * MIG-02 recorded SSO / Toggl fixtures, in the format the MIG-03 parity
 * harness replays (`apps/api/test/parity/fixtures.mts`; kept structurally
 * identical, checked by `test/parity/recorded-fixtures.spec.ts`).
 */

export interface CannedResponse {
  status: number;
  headers?: Record<string, string>;
  body?: unknown;
  delayMs?: number;
  redirects?: number;
}

export interface SsoFixture {
  username: string;
  password: string;
  response: CannedResponse;
}

export interface TogglKey {
  workspaceId: string;
  userIds: unknown[];
  startDate: string;
  endDate: string;
  firstRowNumber: number | null;
  token: string;
}

export interface TogglFixture {
  key: TogglKey;
  response: CannedResponse;
}

export interface FixtureSet {
  sso: SsoFixture;
  toggl: TogglFixture[];
}

/**
 * SSO Basic credentials the parity compose file gives both apps
 * (`docker-compose.parity.yml` `SSO_USERNAME` / `SSO_PASSWORD`): the mock
 * answers 401 to anything else, so recorded sets must carry exactly these.
 */
export const PARITY_SSO_USERNAME = 'PARITY_SSO_USER';
export const PARITY_SSO_PASSWORD = 'PARITY_SSO_PASSWORD';
/** Fake `togglApiToken` values: `PARITY_TOGGL_TOKEN_<12 hex>`. */
export const PARITY_TOGGL_TOKEN_PREFIX = 'PARITY_TOGGL_TOKEN_';

/**
 * What the old app sends as Toggl `start_date` / `end_date` for a
 * non-finite year (`Infinity/1`, `1e20/3`), see `test/parity/synthetic.mts`.
 */
export const OLD_NON_FINITE_DATE = '-0NaN--NaN--NaN';

/** SSO keys whose values are kept (not personal, needed for parity). */
const SSO_KEPT_KEYS = new Set(['togglUserId', 'employee', 'contractType']);
/** Response headers worth replaying (all others are dropped). */
const KEPT_HEADERS = new Set(['content-type', 'x-next-row-number']);
/** Toggl row / entry string fields kept as they are (times, currency). */
const TOGGL_KEPT_STRINGS = new Set(['start', 'stop', 'at', 'currency']);

export interface Month {
  year: number;
  month: number;
}

/** `YYYY-MM-DD` of the first and last day of the month. */
export function monthRange(m: Month): { startDate: string; endDate: string } {
  const ym = `${String(m.year).padStart(4, '0')}-${String(m.month).padStart(2, '0')}`;
  const last = new Date(Date.UTC(m.year, m.month, 0)).getUTCDate();
  return {
    startDate: `${ym}-01`,
    endDate: `${ym}-${String(last).padStart(2, '0')}`,
  };
}

/**
 * The months the MIG-03 harness asks Toggl about for a dataset whose
 * earliest leave starts in `earliest` (`YYYY-MM`) when run with `--now
 * <now>`: earliest month .. current month + 1, plus the months of the edge
 * requests `YYYY/0` (December before), `YYYY/13` (January after) and
 * `YYYY/1.5` (January). Same result as the harness's
 * `effectiveMonths(parityRequests(…))` (cross-checked by a test).
 */
export function parityMonths(earliest: string | null, now: Date): Month[] {
  const year = now.getUTCFullYear();
  const current = year * 12 + now.getUTCMonth();
  let first = current;
  if (earliest) {
    const match = /^(\d{4})-(\d{2})/.exec(earliest);
    if (!match) throw new Error('earliest must be YYYY-MM');
    first = Math.min(first, Number(match[1]) * 12 + Number(match[2]) - 1);
  }
  const indexes = new Set<number>();
  for (let i = first; i <= current + 1; i++) indexes.add(i);
  for (const i of [year * 12 - 1, year * 12 + 12, year * 12]) indexes.add(i);
  return [...indexes].map((i) => ({
    year: Math.floor(i / 12),
    month: (i % 12) + 1,
  }));
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && !isOpaqueValue(v);

function keptHeaders(h: Record<string, string> | undefined) {
  if (!h) return undefined;
  const out = Object.fromEntries(
    Object.entries(h).filter(([k]) => KEPT_HEADERS.has(k.toLowerCase())),
  );
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Pseudonymizes recorded fixtures; same secret as the dump (`anonymize-legacy`). */
export class FixturePseudonymizer {
  private readonly p: Pseudonymizer;
  private entries = 0;

  constructor(p: Pseudonymizer) {
    this.p = p;
  }

  /** Fake token for a real `togglApiToken` (empty / non-string kept). */
  token(value: unknown): unknown {
    if (typeof value !== 'string' || value === '') return value;
    return `${PARITY_TOGGL_TOKEN_PREFIX}${this.p.hex(`toggl-token\0${value}`, 12)}`;
  }

  /** Fake numeric workspace id (`9` + 9 digits), same type as given. */
  workspaceId(value: unknown): unknown {
    if (value === '' || value === null || value === undefined) return value;
    if (typeof value !== 'string' && typeof value !== 'number')
      return this.p.redactDeep(value);
    const digits =
      Number.parseInt(this.p.hex(`toggl-ws\0${String(value)}`, 12), 16) % 1e9;
    const fake = `9${String(digits).padStart(9, '0')}`;
    return typeof value === 'number' ? Number(fake) : fake;
  }

  private ssoValue(key: string, value: unknown): unknown {
    if (SSO_KEPT_KEYS.has(key)) return value;
    if (key === 'togglApiToken') return this.token(value);
    if (key === 'togglWorkspaceId') return this.workspaceId(value);
    if (key === 'email') return this.p.email(value);
    if (key === 'name') return this.p.name(value);
    return this.p.redactDeep(value, `sso.keys.${key}`);
  }

  /** SSO meta answer: `[{ name, email, keys: [{ key, value }] }]`. */
  ssoBody(body: unknown): unknown {
    if (!Array.isArray(body)) return this.p.redactDeep(body, 'sso.body');
    return body.map((user: unknown) => {
      if (!isRecord(user)) return this.p.redactDeep(user, 'sso.body[]');
      const out: Record<string, unknown> = {};
      for (const [field, value] of Object.entries(user)) {
        if (field === 'name') out[field] = this.p.name(value);
        else if (field === 'email') out[field] = this.p.email(value);
        else if (field === 'keys' && Array.isArray(value))
          out[field] = value.map((kv: unknown) => {
            if (!isRecord(kv)) return this.p.redactDeep(kv, 'sso.keys[]');
            const key = String(kv.key);
            const o: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(kv))
              o[k] =
                k === 'key'
                  ? v
                  : k === 'value'
                    ? this.ssoValue(key, v)
                    : this.p.redactDeep(v);
            return o;
          });
        else out[field] = this.p.redactDeep(value, `sso.${field}`);
      }
      return out;
    });
  }

  /** Toggl row / entry fields: descriptions → `entry-<n>`, times and numbers kept. */
  private togglValue(field: string, value: unknown): unknown {
    if (typeof value === 'string') {
      if (field === 'description') return `entry-${++this.entries}`;
      if (field === 'username') return this.p.name(value);
      if (field === 'email') return this.p.email(value);
      return TOGGL_KEPT_STRINGS.has(field) ? value : this.p.text(value);
    }
    if (Array.isArray(value))
      return value.map((v) => this.togglValue(field, v));
    if (isRecord(value))
      return Object.fromEntries(
        Object.entries(value).map(([k, v]) => [k, this.togglValue(k, v)]),
      );
    return value;
  }

  togglBody(body: unknown): unknown {
    return this.togglValue('', body);
  }

  /**
   * The whole set. Toggl keys line up with the pseudonymized SSO directory:
   * a key token is replaced exactly when it is one of the directory's
   * `togglApiToken` strings (what an app sends for a missing token, e.g.
   * `undefined`, is not a secret and stays), workspace ids by the same
   * function on their string form.
   */
  fixtureSet(raw: FixtureSet): FixtureSet {
    this.entries = 0;
    const tokens = ssoTokens(raw.sso.response.body);
    return {
      sso: {
        username: PARITY_SSO_USERNAME,
        password: PARITY_SSO_PASSWORD,
        response: this.response(raw.sso.response, (b) => this.ssoBody(b)),
      },
      toggl: raw.toggl.map((f) => ({
        key: {
          ...f.key,
          workspaceId: String(this.workspaceId(f.key.workspaceId)),
          token: tokens.has(f.key.token)
            ? String(this.token(f.key.token))
            : f.key.token,
        },
        response: this.response(f.response, (b) => this.togglBody(b)),
      })),
    };
  }

  private response(
    r: CannedResponse,
    body: (b: unknown) => unknown,
  ): CannedResponse {
    const out: CannedResponse = { status: r.status };
    const headers = keptHeaders(r.headers);
    if (headers) out.headers = headers;
    if (r.body !== undefined) out.body = body(r.body);
    if (r.delayMs !== undefined) out.delayMs = r.delayMs;
    if (r.redirects !== undefined) out.redirects = r.redirects;
    return out;
  }
}

/** Non-empty string `togglApiToken` values of a raw SSO answer. */
export function ssoTokens(body: unknown): Set<string> {
  const out = new Set<string>();
  if (!Array.isArray(body)) return out;
  for (const user of body as unknown[]) {
    if (!isRecord(user) || !Array.isArray(user.keys)) continue;
    for (const kv of user.keys as unknown[])
      if (
        isRecord(kv) &&
        kv.key === 'togglApiToken' &&
        typeof kv.value === 'string' &&
        kv.value !== ''
      )
        out.add(kv.value);
  }
  return out;
}

/** Original personal / secret strings of a raw recorded set. */
function rawSecrets(raw: FixtureSet): { forbidden: string[]; kept: string[] } {
  const forbidden: string[] = [raw.sso.username, raw.sso.password];
  const kept: string[] = [];
  const body = raw.sso.response.body;
  for (const user of Array.isArray(body) ? body : [body]) {
    if (!isRecord(user)) {
      for (const [, s] of stringsIn(user, 'sso')) forbidden.push(s);
      continue;
    }
    for (const [field, value] of Object.entries(user)) {
      if (field !== 'keys' || !Array.isArray(value)) {
        for (const [, s] of stringsIn(value, field)) {
          forbidden.push(s);
          if (field === 'email') {
            forbidden.push(s.trim().toLowerCase());
            const at = s.trim().indexOf('@');
            if (at >= 0) kept.push(s.trim().slice(at + 1));
          }
        }
        continue;
      }
      for (const kv of value as unknown[]) {
        if (!isRecord(kv)) continue;
        const key = String(kv.key);
        for (const [, s] of stringsIn(kv.value, key))
          (SSO_KEPT_KEYS.has(key) ? kept : forbidden).push(s);
      }
    }
  }
  const tokens = ssoTokens(body);
  for (const f of raw.toggl) {
    forbidden.push(f.key.workspaceId);
    if (tokens.has(f.key.token)) forbidden.push(f.key.token);
    kept.push(f.key.startDate, f.key.endDate);
    collectToggl('', f.response.body, forbidden, kept);
  }
  return { forbidden, kept };
}

function collectToggl(
  field: string,
  v: unknown,
  forbidden: string[],
  kept: string[],
) {
  if (typeof v === 'string')
    (TOGGL_KEPT_STRINGS.has(field) ? kept : forbidden).push(v);
  else if (Array.isArray(v))
    for (const x of v) collectToggl(field, x, forbidden, kept);
  else if (isRecord(v))
    for (const [k, x] of Object.entries(v)) collectToggl(k, x, forbidden, kept);
}

/**
 * Paths (never values) where a real name, email, token, workspace id, SSO
 * attribute or entry description of `raw` survives in `out` (`[]` = clean).
 */
export function fixtureLeaks(raw: FixtureSet, out: FixtureSet): string[] {
  const { forbidden, kept } = rawSecrets(raw);
  return findLeaks(forbidden, kept, [
    ['sso', out.sso],
    ...out.toggl.map((f, i): [string, unknown] => [`toggl[${i}]`, f]),
  ]);
}
