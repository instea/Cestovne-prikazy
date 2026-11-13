/**
 * MIG-02 tests: a fake "real" SSO meta API and Toggl Reports v3 with
 * realistic personal data and secrets, for the fixture recorder and the
 * pseudonymizer. All values are invented.
 */

export const REAL = {
  ssoUri: 'https://sso-meta.example.test/api/meta/all',
  ssoUsername: 'sso-real-user',
  ssoPassword: 'sso-real-password-7f3a',
  togglBaseUrl: 'https://toggl.example.test/reports/api/v3',
  workspace: '1234567',
  tokenJana: '3f9a1c7e5b2d4f608a1b2c3d4e5f6071',
  tokenPeter: '9e8d7c6b5a49382716051f2e3d4c5b6a',
};

const kv = (keys: Record<string, string>) =>
  Object.entries(keys).map(([key, value]) => ({ key, value }));

/** SSO directory as the real API returns it. */
export const REAL_SSO_BODY = [
  {
    name: 'Jana Nová',
    email: 'Jana.Nova@instea.co',
    keys: kv({
      togglUserId: '20',
      togglWorkspaceId: REAL.workspace,
      togglApiToken: REAL.tokenJana,
      employee: '1',
      contractType: 'TPP',
      phone: '+421 900 111 222',
    }),
  },
  {
    // Employee without togglUserId: the old app asks for user_ids [null].
    name: 'Peter Kráľ',
    email: 'peter.kral@instea.co',
    keys: kv({
      togglWorkspaceId: REAL.workspace,
      togglApiToken: REAL.tokenPeter,
      employee: '1',
    }),
  },
  {
    name: 'Boris Biely',
    email: 'boris.biely@instea.co',
    keys: kv({ togglUserId: '7', employee: '0', contractType: 'Dohoda' }),
  },
  {
    // No token at all: the apps send `undefined:api_token`.
    name: 'Eva Malá',
    email: 'eva.mala@instea.co',
    keys: kv({
      togglUserId: '9',
      togglWorkspaceId: REAL.workspace,
      employee: '1',
    }),
  },
];

export interface SeenRequest {
  method: string;
  url: string;
  authorization: string | null;
  body: unknown;
}

const json = (
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });

/** Rows for one user; two pages for user 20 (X-Next-Row-Number 3). */
function rows(userId: unknown, startDate: string, first: unknown) {
  const row = (n: number, seconds: number) => ({
    user_id: userId,
    username: userId === 20 ? 'Jana Nová' : 'Eva Malá',
    description: `Client call ${n} with Jana.Nova@instea.co`,
    project_id: 555,
    billable: false,
    currency: 'EUR',
    tag_ids: [1, 2],
    row_number: n,
    time_entries: [
      {
        id: 1000 + n,
        seconds,
        start: `${startDate}T08:00:00+01:00`,
        stop: `${startDate}T09:00:00+01:00`,
        at: `${startDate}T09:00:01+00:00`,
      },
    ],
  });
  if (userId === 20 && first === undefined)
    return { body: [row(1, 3600), row(2, 1800)], next: '3' };
  if (userId === 20) return { body: [row(3, 900)], next: null };
  return { body: [row(1, 7200)], next: null };
}

/** `fetch` stand-in answering like the real services; records requests. */
export function fakeRealServices(seen: SeenRequest[] = []) {
  return async (url: URL, init: RequestInit): Promise<Response> => {
    const headers = new Headers(init.headers);
    const body =
      typeof init.body === 'string'
        ? (JSON.parse(init.body) as unknown)
        : undefined;
    seen.push({
      method: init.method ?? 'GET',
      url: url.toString(),
      authorization: headers.get('authorization'),
      body,
    });
    await Promise.resolve();
    if (url.toString() === REAL.ssoUri) {
      const expected = `Basic ${Buffer.from(`${REAL.ssoUsername}:${REAL.ssoPassword}`).toString('base64')}`;
      if (headers.get('authorization') !== expected)
        return new Response('', { status: 401 });
      return json(200, REAL_SSO_BODY, {
        'Set-Cookie': 'session=real-session-cookie',
      });
    }
    const b = body as {
      start_date: string;
      user_ids: unknown[];
      first_row_number?: number;
    };
    if (b.user_ids[0] === null) return json(400, 'user_ids must be integers');
    if (b.start_date.includes('NaN')) return json(400, 'Invalid start_date');
    const page = rows(b.user_ids[0], b.start_date, b.first_row_number);
    return json(
      200,
      page.body,
      page.next ? { 'X-Next-Row-Number': page.next } : {},
    );
  };
}
