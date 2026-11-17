import { describe, expect, it } from 'vitest';
import {
  isEmployee,
  isListed,
  SsoClient,
  SsoUnavailableError,
} from '../../src/attendance/sso/sso.client';
import { useHttpFakes } from '../mocks/http-fakes';
import { TEST_SSO } from '../support/env';

/**
 * TST-04 SSO meta API contract: each versioned fixture
 * (`packages/shared/test-fixtures/contracts/sso.*.json`) is served over
 * HTTP and parsed by the real `SsoClient` into the expected flattened
 * records, or rejected with `SsoUnavailableError` (ATT-01: 500 SSO).
 * Documented response schema: array of
 * `{ name: string, email: string, keys: Array<{ key: string, value: string }> }`.
 */
const fakes = useHttpFakes();

const client = (password = TEST_SSO.password) =>
  new SsoClient({
    SSO_URI: TEST_SSO.uri,
    SSO_USERNAME: TEST_SSO.username,
    SSO_PASSWORD: password,
  });

const TOGGL = { togglWorkspaceId: '42', togglApiToken: 'toggl-test-token' };

describe('SSO meta API contract: request', () => {
  it('GET SSO_URI with Basic base64(SSO_USERNAME:SSO_PASSWORD)', async () => {
    await client().fetchDirectory();
    expect(fakes.requests).toHaveLength(1);
    const [req] = fakes.requests;
    expect(req!.method).toBe('GET');
    expect(req!.url).toBe(TEST_SSO.uri);
    expect(req!.headers.authorization).toBe(
      `Basic ${Buffer.from(`${TEST_SSO.username}:${TEST_SSO.password}`).toString('base64')}`,
    );
    expect(req!.body).toBeUndefined();
  });

  it('wrong credentials → the fake answers 401 → SsoUnavailableError', async () => {
    await expect(client('wrong').fetchDirectory()).rejects.toThrow(
      SsoUnavailableError,
    );
    expect(fakes.requests.map((r) => r.status)).toEqual([401]);
  });

  it('a non-GET request is refused by the fake (401)', async () => {
    const res = await fetch(TEST_SSO.uri, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${TEST_SSO.username}:${TEST_SSO.password}`).toString('base64')}`,
      },
    });
    expect(res.status).toBe(401);
  });
});

describe('SSO meta API contract: parsing per fixture', () => {
  it.each([
    [
      'sso.basic.json',
      [
        {
          name: 'Jana Nová',
          email: 'jana.nova@instea.co',
          togglUserId: '1001',
          ...TOGGL,
          employee: '1',
          contractType: 'TPP',
        },
        {
          name: 'Peter Kováč',
          email: 'peter.kovac@instea.co',
          togglUserId: '1002',
          ...TOGGL,
          employee: '0',
          contractType: 'Živnosť',
        },
        {
          name: 'Eva Unlisted',
          email: 'eva.unlisted@instea.co',
          employee: '1',
        },
      ],
    ],
    [
      'sso.duplicate-names.json',
      [
        {
          name: 'Eva Dvořák',
          email: 'eva.dvorak@instea.co',
          togglUserId: '5',
          employee: '1',
          contractType: 'TPP',
          ...TOGGL,
        },
        {
          name: 'Eva Dvořák',
          email: 'eva.dvorak2@instea.co',
          togglUserId: '9',
          employee: '1',
          contractType: 'Živnosť',
          ...TOGGL,
        },
      ],
    ],
    [
      'sso.duplicate-toggl-ids.json',
      [
        {
          name: 'Ján Prvý',
          email: 'jan.prvy@instea.co',
          togglUserId: '7',
          employee: '1',
          contractType: 'TPP',
          ...TOGGL,
        },
        {
          name: 'Ján Druhý',
          email: 'jan.druhy@instea.co',
          togglUserId: '7',
          employee: '0',
          contractType: 'Dohoda',
          ...TOGGL,
        },
      ],
    ],
    [
      'sso.no-contract-type.json',
      [
        {
          name: 'Oto Bez Zmluvy',
          email: 'oto@instea.co',
          togglUserId: '11',
          employee: '1',
          ...TOGGL,
        },
      ],
    ],
    // Old flattening: a `keys` entry named `name` / `email` overrides the
    // top-level value.
    [
      'sso.key-overrides-name.json',
      [
        {
          name: 'Name From Keys',
          email: 'keys@instea.co',
          togglUserId: '12',
          employee: '0',
        },
      ],
    ],
  ])('%s → parsed records', async (fixture, expected) => {
    fakes.sso.serve(fixture);
    const users = await client().fetchDirectory();
    expect(users).toEqual(expected);
    // Key order of the flattened record: name, email, then keys in order.
    expect(Object.keys(users[0]!).slice(0, 2)).toEqual(['name', 'email']);
  });

  it('predicates: listed = truthy togglUserId, employee = "1"', async () => {
    const users = await client().fetchDirectory();
    expect(users.map((u) => [isListed(u), isEmployee(u)])).toEqual([
      [true, true],
      [true, false],
      [false, true],
    ]);
  });

  it.each([
    ['sso.malformed-object-body.json', 'body is not an array'],
    ['sso.malformed-missing-keys.json', 'element keys is not an array'],
    ['sso.malformed-null-element.json', 'element is not an object'],
  ])('%s → SsoUnavailableError (%s)', async (fixture, reason) => {
    fakes.sso.serve(fixture);
    await expect(client().fetchDirectory()).rejects.toMatchObject({
      name: 'SsoUnavailableError',
      message: SsoUnavailableError.MESSAGE,
      reason,
    });
  });

  it.each([
    [
      'text/html body',
      { status: 200, contentType: 'text/html', body: '<html>login</html>' },
      'response is not JSON',
    ],
    [
      'invalid JSON',
      { status: 200, contentType: 'application/json', body: '[{' },
      'invalid JSON',
    ],
    ['HTTP 500', { status: 500 }, 'HTTP 500'],
  ])('%s → SsoUnavailableError', async (_label, response, reason) => {
    fakes.sso.fail(response);
    await expect(client().fetchDirectory()).rejects.toMatchObject({
      name: 'SsoUnavailableError',
      reason,
    });
  });
});
