import {
  isEmployee,
  parseDirectory,
  type SsoUser,
} from '../../attendance/sso/sso.client';
import {
  buildSearchBody,
  nextRowNumber,
  togglAuthorization,
} from '../../attendance/toggl/toggl.client';
import {
  type CannedResponse,
  type FixtureSet,
  type Month,
  monthRange,
  OLD_NON_FINITE_DATE,
  type TogglFixture,
  type TogglKey,
} from './parity-fixtures';

/**
 * MIG-02 recording of the real SSO meta answer and the Toggl Reports v3
 * answers for the parity months, as raw `FixtureSet` (in memory only; the
 * CLI pseudonymizes before anything is written). The Toggl requests are the
 * ones the OLD app sends (a superset of the new app's: it also asks for
 * employees without `togglUserId`, `user_ids: [null]`, and for non-finite
 * years), built with the same body / auth / paging functions as ATT-03.
 */

export type RecordFetch = (url: URL, init: RequestInit) => Promise<Response>;

export interface RecordOptions {
  ssoUri: string;
  ssoUsername: string;
  ssoPassword: string;
  togglBaseUrl: string;
  months: readonly Month[];
  /** Extra ranges asked for every employee (old non-finite requests). */
  extraRanges?: readonly { startDate: string; endDate: string }[];
  fetch?: RecordFetch;
  /** Pause between Toggl requests (Toggl rate limit). */
  delayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  log?: (line: string) => void;
}

const basic = (user: string, pass: string) =>
  `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;

/** Status, replayable headers and body (JSON when JSON, else text). */
async function canned(res: Response): Promise<CannedResponse> {
  const headers: Record<string, string> = {};
  const type = res.headers.get('content-type');
  const next = res.headers.get('x-next-row-number');
  if (type) headers['Content-Type'] = type;
  if (next !== null) headers['X-Next-Row-Number'] = next;
  const text = await res.text();
  let body: unknown = text;
  if (/[/+]json\b/i.test(type ?? '')) {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = text;
    }
  }
  const out: CannedResponse = { status: res.status, headers };
  if (text !== '') out.body = body;
  return out;
}

const keyString = (k: TogglKey) =>
  JSON.stringify([
    k.workspaceId,
    k.userIds,
    k.startDate,
    k.endDate,
    k.firstRowNumber,
    k.token,
  ]);

/** Employees the old app asks Toggl about (`employee === '1'` with a workspace). */
export function togglTargets(directory: readonly SsoUser[]): SsoUser[] {
  return directory.filter((u) => isEmployee(u) && Boolean(u.togglWorkspaceId));
}

export async function recordFixtures(o: RecordOptions): Promise<FixtureSet> {
  const fetchFn: RecordFetch = o.fetch ?? ((url, init) => fetch(url, init));
  const sleep =
    o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const log = o.log ?? (() => undefined);

  const ssoRes = await fetchFn(new URL(o.ssoUri), {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: basic(o.ssoUsername, o.ssoPassword),
    },
  });
  const ssoResponse = await canned(ssoRes);
  if (ssoRes.status !== 200)
    throw new Error(
      `SSO answered HTTP ${ssoRes.status}; check SSO_URI and the credentials`,
    );
  const directory = parseDirectory(ssoResponse.body);
  const targets = togglTargets(directory);
  log(
    `SSO: ${directory.length} records, ${targets.length} employees with a Toggl workspace`,
  );

  const base = o.togglBaseUrl.replace(/\/+$/, '');
  const ranges = [...o.months.map(monthRange), ...(o.extraRanges ?? [])];
  const toggl: TogglFixture[] = [];
  const seen = new Set<string>();
  for (const [i, user] of targets.entries()) {
    log(`Toggl: employee ${i + 1}/${targets.length}`);
    for (const range of ranges) {
      let next: string | null = null;
      do {
        const { togglWorkspaceId, togglUserId, togglApiToken } = user;
        const body = buildSearchBody(
          { togglWorkspaceId, togglUserId, togglApiToken },
          range.startDate,
          range.endDate,
          next,
        );
        // As sent on the wire (NaN → null), which is what the mock keys on.
        const wire = JSON.parse(JSON.stringify(body)) as {
          user_ids: unknown[];
          first_row_number?: number;
        };
        const key: TogglKey = {
          workspaceId: String(user.togglWorkspaceId),
          userIds: wire.user_ids,
          startDate: range.startDate,
          endDate: range.endDate,
          firstRowNumber:
            typeof wire.first_row_number === 'number'
              ? wire.first_row_number
              : null,
          token: String(user.togglApiToken),
        };
        if (seen.has(keyString(key))) break;
        seen.add(keyString(key));
        const url = new URL(
          `${base}/workspace/${encodeURIComponent(key.workspaceId)}/search/time_entries`,
        );
        const res = await fetchFn(url, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: togglAuthorization(user.togglApiToken),
          },
          body: JSON.stringify(body),
        });
        const response = await canned(res);
        toggl.push({ key, response });
        const header = res.headers.get('x-next-row-number');
        next = res.ok ? nextRowNumber(header, next) : null;
        if (o.delayMs) await sleep(o.delayMs);
      } while (next);
    }
  }
  log(`Toggl: ${toggl.length} answers recorded`);

  return {
    sso: {
      username: o.ssoUsername,
      password: o.ssoPassword,
      response: ssoResponse,
    },
    toggl,
  };
}

/** The old app's request range for non-finite years (recorded too). */
export const NON_FINITE_RANGE = {
  startDate: OLD_NON_FINITE_DATE,
  endDate: OLD_NON_FINITE_DATE,
};
