import { describe, expect, it, vi } from 'vitest';
import {
  fakeRealServices,
  REAL,
  type SeenRequest,
} from '../../../test/support/recording-fake';
import { parseDirectory } from '../../attendance/sso/sso.client';
import { anonymizeLegacy } from './legacy-anonymizer';
import {
  fixtureEmailCollisions,
  type FixtureSet,
  fixtureLeaks,
  FixturePseudonymizer,
  monthRange,
  PARITY_SSO_PASSWORD,
  PARITY_SSO_USERNAME,
  parityMonths,
} from './parity-fixtures';
import { NON_FINITE_RANGE, recordFixtures } from './parity-recorder';
import { Pseudonymizer } from './pseudonym';

const SECRET = 'fixtures-secret-'.padEnd(40, 'x');
const p = new Pseudonymizer(SECRET);
const MONTHS = [
  { year: 2024, month: 2 },
  { year: 2024, month: 3 },
];

async function record(
  seen: SeenRequest[] = [],
  sleep = vi.fn(() => Promise.resolve()),
) {
  return recordFixtures({
    ssoUri: REAL.ssoUri,
    ssoUsername: REAL.ssoUsername,
    ssoPassword: REAL.ssoPassword,
    togglBaseUrl: `${REAL.togglBaseUrl}/`,
    months: MONTHS,
    extraRanges: [NON_FINITE_RANGE],
    fetch: fakeRealServices(seen),
    delayMs: 1000,
    sleep,
  });
}

describe('parityMonths / monthRange', () => {
  it('earliest leave month .. now + 1, plus the edge months of the current year', () => {
    const months = parityMonths('2025-11', new Date('2026-02-10T12:00:00Z'));
    expect(months).toEqual([
      { year: 2025, month: 11 },
      { year: 2025, month: 12 },
      { year: 2026, month: 1 },
      { year: 2026, month: 2 },
      { year: 2026, month: 3 },
      { year: 2027, month: 1 },
    ]);
    expect(parityMonths(null, new Date('2026-06-01T12:00:00Z'))).toHaveLength(
      5,
    );
    expect(() => parityMonths('11/2025', new Date())).toThrow('YYYY-MM');
  });

  it('monthRange covers the whole month', () => {
    expect(monthRange({ year: 2024, month: 2 })).toEqual({
      startDate: '2024-02-01',
      endDate: '2024-02-29',
    });
  });
});

describe('recordFixtures (operator, server host)', () => {
  it('records the SSO answer and every Toggl request the old app sends, page by page', async () => {
    const seen: SeenRequest[] = [];
    const sleep = vi.fn(() => Promise.resolve());
    const raw = await record(seen, sleep);

    expect(raw.sso.username).toBe(REAL.ssoUsername);
    expect(raw.sso.response.status).toBe(200);
    // Only replayable headers (no Set-Cookie).
    expect(Object.keys(raw.sso.response.headers ?? {})).toEqual([
      'Content-Type',
    ]);

    const keys = raw.toggl.map((f) => f.key);
    // Jana (2 pages per month), Peter (user_ids [null]), Eva; 2 months + NaN range.
    expect(keys.filter((k) => k.token === REAL.tokenJana)).toHaveLength(
      2 * 2 + 1,
    );
    expect(
      keys
        .filter((k) => k.token === REAL.tokenPeter)
        .every((k) => k.userIds[0] === null),
    ).toBe(true);
    expect(keys.filter((k) => k.token === 'undefined')).toHaveLength(3);
    expect(keys.some((k) => k.firstRowNumber === 3)).toBe(true);
    expect(keys.some((k) => k.startDate === NON_FINITE_RANGE.startDate)).toBe(
      true,
    );
    expect(
      raw.toggl.find(
        (f) => f.key.firstRowNumber === null && f.key.userIds[0] === 20,
      )?.response.headers,
    ).toEqual({
      'Content-Type': 'application/json; charset=utf-8',
      'X-Next-Row-Number': '3',
    });
    // No Boris (not an employee); one pause per Toggl request.
    expect(seen.filter((r) => r.method === 'POST')).toHaveLength(
      raw.toggl.length,
    );
    expect(sleep).toHaveBeenCalledTimes(raw.toggl.length);
    expect(seen[1]!.url).toBe(
      `${REAL.togglBaseUrl}/workspace/${REAL.workspace}/search/time_entries`,
    );
  });

  it('fails on a non-200 SSO answer', async () => {
    await expect(
      recordFixtures({
        ssoUri: REAL.ssoUri,
        ssoUsername: 'wrong',
        ssoPassword: 'wrong',
        togglBaseUrl: REAL.togglBaseUrl,
        months: MONTHS,
        fetch: fakeRealServices(),
      }),
    ).rejects.toThrow('SSO answered HTTP 401');
  });
});

describe('FixturePseudonymizer', () => {
  it('replaces credentials, tokens, workspace ids, names, emails and descriptions', async () => {
    const raw = await record();
    const out = new FixturePseudonymizer(p).fixtureSet(raw);
    expect(out.sso).toMatchObject({
      username: PARITY_SSO_USERNAME,
      password: PARITY_SSO_PASSWORD,
    });
    const directory = parseDirectory(out.sso.response.body);
    const [jana, peter, boris, eva] = directory;
    expect(jana).toMatchObject({
      name: expect.stringMatching(/^Name-[0-9a-f]{12}$/) as string,
      email: expect.stringMatching(/^User-[0-9a-f]{12}@instea\.co$/) as string,
      togglUserId: '20',
      employee: '1',
      contractType: 'TPP',
      togglApiToken: expect.stringMatching(
        /^PARITY_TOGGL_TOKEN_[0-9a-f]{12}$/,
      ) as string,
      togglWorkspaceId: expect.stringMatching(/^9\d{9}$/) as string,
      phone: expect.stringMatching(/^redacted-/) as string,
    });
    expect(peter!.togglApiToken).not.toBe(jana!.togglApiToken);
    expect(peter!.togglWorkspaceId).toBe(jana!.togglWorkspaceId);
    expect(boris).toMatchObject({ togglUserId: '7', employee: '0' });
    expect('togglApiToken' in eva!).toBe(false);

    // Toggl keys line up with the pseudonymized directory.
    for (const f of out.toggl) {
      expect(f.key.workspaceId).toBe(jana!.togglWorkspaceId);
      expect([
        jana!.togglApiToken,
        peter!.togglApiToken,
        'undefined',
      ]).toContain(f.key.token);
    }
    // Hours, dates, user ids and paging kept; descriptions → entry-<n>.
    const page = out.toggl.find(
      (f) => f.key.userIds[0] === 20 && f.key.firstRowNumber === null,
    )!;
    expect(page.response.headers).toEqual({
      'Content-Type': 'application/json; charset=utf-8',
      'X-Next-Row-Number': '3',
    });
    const [row] = page.response.body as Record<string, unknown>[];
    expect(row).toMatchObject({
      user_id: 20,
      username: jana!.name,
      description: expect.stringMatching(/^entry-\d+$/) as string,
      currency: 'EUR',
      tag_ids: [1, 2],
      time_entries: [
        { id: 1001, seconds: 3600, start: '2024-02-01T08:00:00+01:00' },
      ],
    });
    const descriptions = out.toggl.flatMap((f) =>
      Array.isArray(f.response.body)
        ? (f.response.body as { description: string }[]).map(
            (r) => r.description,
          )
        : [],
    );
    expect(descriptions).toEqual(descriptions.map((_, i) => `entry-${i + 1}`));
  });

  it('keeps the email ↔ user mapping of the anonymized dump (same secret)', async () => {
    const raw = await record();
    const out = new FixturePseudonymizer(p).fixtureSet(raw);
    const users = anonymizeLegacy(
      [
        { id: '1', email: 'Jana.Nova@instea.co' },
        { id: '2', email: 'peter.kral@instea.co' },
        { id: '3', email: 'EVA.MALA@instea.co' },
      ],
      [],
      p,
    ).users;
    const sso = parseDirectory(out.sso.response.body);
    // Exact match (old app on raw emails) and lowercased (new app) survive.
    expect(sso[0]!.email).toBe(users[0]!.email);
    expect(sso[1]!.email).toBe(users[1]!.email);
    expect(String(sso[3]!.email).toLowerCase()).toBe(
      String(users[2]!.email).toLowerCase(),
    );
    expect(sso[3]!.email).not.toBe(users[2]!.email);
  });

  it('is deterministic and leaves no original value (self-check)', async () => {
    const raw = await record();
    const out = new FixturePseudonymizer(p).fixtureSet(raw);
    expect(new FixturePseudonymizer(p).fixtureSet(raw)).toEqual(out);
    expect(fixtureLeaks(raw, out)).toEqual([]);
    const text = JSON.stringify(out);
    for (const secret of [
      REAL.tokenJana,
      REAL.tokenPeter,
      REAL.ssoPassword,
      REAL.workspace,
      'Jana',
      'Client call',
      'Kráľ',
      '+421',
    ])
      expect(text).not.toContain(secret);
    // The check itself works: the raw set leaks everywhere.
    expect(fixtureLeaks(raw, raw).length).toBeGreaterThan(10);
  });

  it('flags a leak by path only', async () => {
    const raw = await record();
    const out: FixtureSet = new FixturePseudonymizer(p).fixtureSet(raw);
    out.toggl[0]!.response.body = [
      { description: 'Client call 1 with Jana.Nova@instea.co' },
    ];
    expect(fixtureLeaks(raw, out)).toEqual([
      'toggl[0].response.body[0].description',
    ]);
  });
});

describe('numeric values and email collisions in fixtures (MIG-02)', () => {
  const kv = (key: string, value: unknown) => ({ key, value });
  const raw: FixtureSet = {
    sso: {
      username: 'real-sso-user',
      password: 'real-sso-password',
      response: {
        status: 200,
        body: [
          {
            name: 'Hana Veľká',
            email: 'HANA@instea.co',
            keys: [
              kv('togglUserId', 20),
              kv('togglWorkspaceId', 555_123),
              kv('togglApiToken', 98_765_432_101),
              kv('phone', 421_900_123_456),
              kv('employee', '1'),
            ],
          },
          { name: 'Hana V.', email: 'Hana@instea.co', keys: [] },
          { name: 'Eva', email: 'eva@instea.co', keys: [] },
        ],
      },
    },
    toggl: [
      {
        key: {
          workspaceId: '555123',
          userIds: [20],
          startDate: '2024-02-01',
          endDate: '2024-02-29',
          firstRowNumber: null,
          token: '98765432101',
        },
        response: {
          status: 200,
          body: [{ user_id: 20, seconds: 3600, description: 'x' }],
        },
      },
    ],
  };
  const out = new FixturePseudonymizer(p).fixtureSet(raw);
  const keysOf = (set: FixtureSet) =>
    (set.sso.response.body as { keys: { key: string; value: unknown }[] }[])[0]!
      .keys;

  it('fakes unknown numeric SSO values and a numeric token; Toggl numbers kept', () => {
    const keys = Object.fromEntries(keysOf(out).map((k) => [k.key, k.value]));
    expect(typeof keys.phone).toBe('number');
    expect(keys.phone).not.toBe(421_900_123_456);
    expect(keys.togglApiToken).toMatch(/^PARITY_TOGGL_TOKEN_[0-9a-f]{12}$/);
    expect(keys.togglUserId).toBe(20);
    // The Toggl key the app sends (String(token)) lines up with the fake.
    expect(out.toggl[0]!.key.token).toBe(keys.togglApiToken);
    expect(out.toggl[0]!.key.workspaceId).toBe(String(keys.togglWorkspaceId));
    expect(out.toggl[0]!.response.body).toMatchObject([
      { user_id: 20, seconds: 3600 },
    ]);
    expect(fixtureLeaks(raw, out)).toEqual([]);
  });

  it('the leak check compares numbers (paths only)', () => {
    const leaky = structuredClone(out);
    keysOf(leaky).find((k) => k.key === 'phone')!.value = 421_900_123_456;
    const leaks = fixtureLeaks(raw, leaky);
    expect(leaks).toEqual(['sso.response.body[0].keys[3].value']);
    expect(fixtureLeaks(raw, raw)).toContain(
      'sso.response.body[0].keys[2].value',
    );
  });

  it('reports SSO emails that differ only in case by path', () => {
    expect(fixtureEmailCollisions(raw, p)).toEqual([
      ['sso.body[0].email', 'sso.body[1].email'],
    ]);
    expect(fixtureEmailCollisions(out, p)).toEqual([]);
  });
});
