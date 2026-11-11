import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isEmployee,
  isListed,
  listsEmail,
  parseDirectory,
  SSO_TIMEOUT_MS,
  SsoClient,
  SsoUnavailableError,
  type FetchFn,
} from './sso.client';

const SSO_URI = 'https://sso-meta.example/api/meta/all';
const example = [
  {
    name: 'Jan Novák',
    email: 'jan@instea.co',
    keys: [
      { key: 'togglUserId', value: '123' },
      { key: 'employee', value: '1' },
      { key: 'contractType', value: 'TPP' },
    ],
  },
  { name: 'Eva', email: 'Eva@Instea.co', keys: [] },
];

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    ...init,
  });

function client(
  fetchFn: FetchFn,
  config: Partial<Record<string, string>> = {},
) {
  return new SsoClient(
    { SSO_URI, SSO_USERNAME: 'sso-user', SSO_PASSWORD: 'p@ss:word', ...config },
    fetchFn,
  );
}

describe('parseDirectory', () => {
  it('flattens keys in order (spec example)', () => {
    expect(parseDirectory(example)).toEqual([
      {
        name: 'Jan Novák',
        email: 'jan@instea.co',
        togglUserId: '123',
        employee: '1',
        contractType: 'TPP',
      },
      { name: 'Eva', email: 'Eva@Instea.co' },
    ]);
  });

  it('lets keys override name/email, and later duplicates win', () => {
    const [u] = parseDirectory([
      {
        name: 'A',
        email: 'a@x',
        keys: [
          { key: 'name', value: 'X' },
          { key: 'employee', value: '0' },
          { key: 'employee', value: '1' },
        ],
      },
    ]);
    expect(u).toEqual({ name: 'X', email: 'a@x', employee: '1' });
  });

  it('preserves value types and coerces a missing key to "undefined"', () => {
    const [u] = parseDirectory([
      { name: 1, keys: [{ key: 'employee', value: 1 }, { value: 'v' }] },
    ]);
    expect(u).toEqual({
      name: 1,
      email: undefined,
      employee: 1,
      undefined: 'v',
    });
  });

  it.each([
    ['an object', {}],
    ['null', null],
    ['a null element', [null]],
    ['a non-object element', ['x']],
    ['an element without keys', [{ name: 'a' }]],
    ['keys not an array', [{ keys: {} }]],
    ['a kv that is not an object', [{ keys: [null] }]],
  ])('rejects %s', (_, body) => {
    expect(() => parseDirectory(body)).toThrow(SsoUnavailableError);
  });
});

describe('predicates', () => {
  it.each([
    ['123', true],
    ['0', true],
    ['', false],
    [undefined, false],
  ])('isListed(togglUserId=%j) = %s', (togglUserId, expected) => {
    expect(isListed({ name: 'a', email: 'a', togglUserId })).toBe(expected);
  });

  it.each([
    ['1', true],
    ['0', false],
    [undefined, false],
    [1, false],
  ])('isEmployee(employee=%j) = %s', (employee, expected) => {
    expect(isEmployee({ name: 'a', email: 'a', employee })).toBe(expected);
  });
});

describe('SsoClient.fetchDirectory', () => {
  afterEach(() => vi.useRealTimers());

  it('sends GET with Basic auth to exactly SSO_URI', async () => {
    const fetchFn = vi.fn<FetchFn>(() => Promise.resolve(json(example)));
    const users = await client(fetchFn).fetchDirectory();
    expect(users).toHaveLength(2);
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(String(url)).toBe(SSO_URI);
    expect(init?.method).toBe('GET');
    const headers = new Headers(init?.headers);
    expect(headers.get('authorization')).toBe(
      `Basic ${Buffer.from('sso-user:p@ss:word').toString('base64')}`,
    );
    expect(headers.get('accept')).toBe('application/json');
    expect(init?.redirect).toBe('manual');
  });

  it.each([401, 500])('throws on HTTP %d', async (status) => {
    await expect(
      client(() => Promise.resolve(json({}, { status }))).fetchDirectory(),
    ).rejects.toThrow(SsoUnavailableError);
  });

  it('throws on a text/html body', async () => {
    const html = new Response('[]', {
      headers: { 'Content-Type': 'text/html' },
    });
    await expect(
      client(() => Promise.resolve(html)).fetchDirectory(),
    ).rejects.toThrow(SsoUnavailableError);
  });

  it('cancels the unread body on redirects and failed responses', async () => {
    const responses = [
      new Response('moved', { status: 302, headers: { Location: '/a' } }),
      new Response('down', { status: 500 }),
    ];
    const html = new Response('<html>', {
      headers: { 'Content-Type': 'text/html' },
    });
    const cancels = [...responses, html].map((r) =>
      vi.spyOn(r.body!, 'cancel'),
    );
    const fetchFn = vi.fn<FetchFn>();
    for (const r of responses) fetchFn.mockResolvedValueOnce(r);
    await expect(client(fetchFn).fetchDirectory()).rejects.toThrow(
      SsoUnavailableError,
    );
    await expect(
      client(() => Promise.resolve(html)).fetchDirectory(),
    ).rejects.toThrow(SsoUnavailableError);
    for (const cancel of cancels) expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('throws on invalid JSON', async () => {
    const bad = new Response('{', {
      headers: { 'Content-Type': 'application/json' },
    });
    await expect(
      client(() => Promise.resolve(bad)).fetchDirectory(),
    ).rejects.toThrow(SsoUnavailableError);
  });

  it('throws on a network error', async () => {
    await expect(
      client(() =>
        Promise.reject(new TypeError('fetch failed')),
      ).fetchDirectory(),
    ).rejects.toThrow(SsoUnavailableError);
  });

  it('throws when SSO_URI is not configured', async () => {
    await expect(
      client(vi.fn(), { SSO_URI: undefined }).fetchDirectory(),
    ).rejects.toThrow(SsoUnavailableError);
  });

  it('times out after 30 s', async () => {
    vi.useFakeTimers();
    const hanging: FetchFn = (_url, init) =>
      new Promise((_, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new Error('aborted')),
        );
      });
    const pending = client(hanging).fetchDirectory();
    const assertion = expect(pending).rejects.toThrow(SsoUnavailableError);
    await vi.advanceTimersByTimeAsync(SSO_TIMEOUT_MS);
    await assertion;
  });

  it('follows up to 5 redirects', async () => {
    let n = 0;
    const fetchFn = vi.fn<FetchFn>(() =>
      Promise.resolve(
        n++ < 5
          ? new Response(null, {
              status: 302,
              headers: { Location: `/hop/${n}` },
            })
          : json(example),
      ),
    );
    await expect(client(fetchFn).fetchDirectory()).resolves.toHaveLength(2);
    expect(fetchFn).toHaveBeenCalledTimes(6);
    expect(String(fetchFn.mock.calls[5]![0])).toBe(
      'https://sso-meta.example/hop/5',
    );
  });

  it('throws on the 6th redirect', async () => {
    const fetchFn = vi.fn<FetchFn>(() =>
      Promise.resolve(
        new Response(null, { status: 301, headers: { Location: '/again' } }),
      ),
    );
    await expect(client(fetchFn).fetchDirectory()).rejects.toThrow(
      SsoUnavailableError,
    );
    expect(fetchFn).toHaveBeenCalledTimes(6);
  });

  it('drops Authorization on a redirect to another origin', async () => {
    const fetchFn = vi
      .fn<FetchFn>()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { Location: 'https://other.example/x' },
        }),
      )
      .mockResolvedValueOnce(json(example));
    await client(fetchFn).fetchDirectory();
    expect(
      new Headers(fetchFn.mock.calls[1]![1]?.headers).get('authorization'),
    ).toBeNull();
  });
});

describe('listsEmail (NFR-08)', () => {
  const users = parseDirectory(example);

  it('ignores togglUserId / employee: any record counts', () => {
    expect(listsEmail(users, 'Eva@Instea.co')).toBe(true);
  });

  it('is exact and case-sensitive', () => {
    expect(listsEmail(users, 'jan@instea.co')).toBe(true);
    expect(listsEmail(users, 'Jan@instea.co')).toBe(false);
    expect(listsEmail(users, 'eva@instea.co')).toBe(false);
    expect(listsEmail(users, 'jan@instea.co ')).toBe(false);
  });

  it('is false for an empty directory', () => {
    expect(listsEmail([], 'jan@instea.co')).toBe(false);
  });
});

describe('SsoClient.isEmailListed', () => {
  const ok = () => Promise.resolve(json(example));

  it('matches exactly and case-sensitively (NFR-08)', async () => {
    await expect(client(ok).isEmailListed('jan@instea.co')).resolves.toBe(true);
    await expect(client(ok).isEmailListed('Eva@Instea.co')).resolves.toBe(true);
    // SSO lists `Eva@Instea.co`: the stored lowercase email is not listed.
    await expect(client(ok).isEmailListed('eva@instea.co')).resolves.toBe(
      false,
    );
    await expect(client(ok).isEmailListed('JAN@instea.co')).resolves.toBe(
      false,
    );
    await expect(client(ok).isEmailListed(' jan@instea.co')).resolves.toBe(
      false,
    );
  });

  it('returns false when no record has the email', async () => {
    await expect(client(ok).isEmailListed('nobody@instea.co')).resolves.toBe(
      false,
    );
  });

  it('ignores records without a string email', async () => {
    const fetchFn = () =>
      Promise.resolve(json([{ name: 'a', email: 5, keys: [] }]));
    await expect(client(fetchFn).isEmailListed('5')).resolves.toBe(false);
  });

  it('throws SsoUnavailableError on failure', async () => {
    const fail = () => Promise.resolve(json({}, { status: 500 }));
    await expect(client(fail).isEmailListed('jan@instea.co')).rejects.toThrow(
      SsoUnavailableError,
    );
  });
});
