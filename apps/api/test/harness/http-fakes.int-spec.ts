import { describe, expect, it } from 'vitest';
import {
  parseDirectory,
  SsoClient,
  SsoUnavailableError,
} from '../../src/attendance/sso/sso.client';
import { TEST_SSO, TEST_TOGGL } from '../support/env';
import { loadContractFixture } from '../mocks/fixtures';
import { passthroughHosts, useHttpFakes } from '../mocks/http-fakes';
import { mailpitEndpoints } from '../support/mailbox';

const fakes = useHttpFakes();

const sso = (over: Partial<Record<string, string>> = {}) =>
  new SsoClient({
    SSO_URI: TEST_SSO.uri,
    SSO_USERNAME: TEST_SSO.username,
    SSO_PASSWORD: TEST_SSO.password,
    ...over,
  });

const basic = (user: string, pass: string) =>
  `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;

const togglUrl = (ws = '42') =>
  `${TEST_TOGGL.baseUrl}/workspace/${ws}/search/time_entries`;

function togglPost(body: unknown, init: RequestInit = {}) {
  return fetch(togglUrl(), {
    method: 'POST',
    headers: {
      Authorization: basic(TEST_TOGGL.apiToken, 'api_token'),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    ...init,
  });
}

const range = { start_date: '2026-12-01', end_date: '2026-12-31' };

describe('contract fixtures', () => {
  it('loads JSON from packages/shared/test-fixtures/contracts', () => {
    const body = loadContractFixture('sso.basic.json');
    expect(Array.isArray(body)).toBe(true);
  });

  it('names the missing fixture', () => {
    expect(() => loadContractFixture('nope.json')).toThrow(/nope\.json/);
  });
});

describe('SSO meta API fake (real SsoClient over HTTP)', () => {
  it('serves sso.basic.json to the right Basic credentials', async () => {
    const users = await sso().fetchDirectory();
    expect(users.length).toBeGreaterThan(0);
    expect(users[0]).toHaveProperty('email');
    expect(fakes.requests).toHaveLength(1);
    expect(fakes.requests[0]).toMatchObject({
      method: 'GET',
      url: TEST_SSO.uri,
    });
  });

  it('answers 401 to wrong credentials', async () => {
    await expect(
      sso({ SSO_PASSWORD: 'wrong' }).fetchDirectory(),
    ).rejects.toThrow(SsoUnavailableError);
    expect(fakes.requests[0]?.status).toBe(401);
  });

  it('serves another fixture or an injected failure', async () => {
    fakes.sso.serve([{ name: 'Only', email: 'only@instea.co', keys: [] }]);
    await expect(sso().fetchDirectory()).resolves.toEqual([
      { name: 'Only', email: 'only@instea.co' },
    ]);
    fakes.sso.fail({ status: 200, contentType: 'text/html', body: '[]' });
    await expect(sso().fetchDirectory()).rejects.toThrow(SsoUnavailableError);
  });

  it('resets to the default fixture between tests', async () => {
    await expect(sso().fetchDirectory()).resolves.toEqual(
      parseDirectory(loadContractFixture('sso.basic.json')),
    );
  });
});

describe('Toggl Reports v3 fake', () => {
  it('serves pages with X-Next-Row-Number and records requests', async () => {
    const page1 = [{ user_id: 1, time_entries: [] }];
    const page2 = [{ user_id: 2, time_entries: [] }];
    fakes.toggl.servePages([page1, page2]);

    const first = await togglPost({ ...range, user_ids: [1, 2] });
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual(page1);
    const next = first.headers.get('X-Next-Row-Number');
    expect(next).toBe('2');

    const second = await togglPost({
      ...range,
      user_ids: [1, 2],
      first_row_number: Number(next),
    });
    expect(await second.json()).toEqual(page2);
    expect(second.headers.get('X-Next-Row-Number')).toBeNull();

    expect(fakes.requests.map((r) => r.body)).toEqual([
      { ...range, user_ids: [1, 2] },
      { ...range, user_ids: [1, 2], first_row_number: 2 },
    ]);
  });

  it('answers 401 to a wrong token', async () => {
    const res = await togglPost(range, {
      headers: {
        Authorization: basic('other', 'api_token'),
        'Content-Type': 'application/json',
      },
    });
    expect(res.status).toBe(401);
  });

  it.each([
    ['an unknown key', { ...range, user_ids: [1], extra: 1 }],
    ['a missing key', { start_date: '2026-12-01', user_ids: [1] }],
    ['a bad date', { ...range, start_date: '2026-12-1', user_ids: [1] }],
    ['string user_ids', { ...range, user_ids: ['1'] }],
    ['null user_ids', { ...range, user_ids: [null] }],
    ['non-array user_ids', { ...range, user_ids: 1 }],
    [
      'a non-integer first_row_number',
      { ...range, user_ids: [1], first_row_number: '2' },
    ],
  ])('answers 400 to a body with %s', async (_, body) => {
    expect((await togglPost(body)).status).toBe(400);
  });

  it('answers 400 without Content-Type: application/json', async () => {
    const res = await togglPost(
      { ...range, user_ids: [1] },
      {
        headers: {
          Authorization: basic(TEST_TOGGL.apiToken, 'api_token'),
          'Content-Type': 'text/plain',
        },
      },
    );
    expect(res.status).toBe(400);
  });

  it.each([401, 402, 429, 500] as const)('injects HTTP %d', async (status) => {
    fakes.toggl.fail({ status });
    expect((await togglPost({ ...range, user_ids: [1] })).status).toBe(status);
  });

  it('injects a non-JSON body', async () => {
    fakes.toggl.fail({ status: 200, contentType: 'text/html', body: '<html>' });
    const res = await togglPost({ ...range, user_ids: [1] });
    expect(await res.text()).toBe('<html>');
  });
});

describe('unhandled requests', () => {
  it('fails a request to an unknown external host', async () => {
    await expect(fetch('https://unknown.fake.test/')).rejects.toThrow();
  });

  it("lets the run's Mailpit API through", async () => {
    const res = await fetch(new URL('/readyz', mailpitEndpoints().apiUrl));
    expect(res.ok).toBe(true);
  });

  it('passes a non-localhost Mailpit host (CI service, remote Docker)', () => {
    const hosts = passthroughHosts('http://mailpit:8025');
    expect(hosts.has('mailpit')).toBe(true);
    expect(hosts.has('localhost')).toBe(true);
    expect(hosts.has('unknown.fake.test')).toBe(false);
  });
});
