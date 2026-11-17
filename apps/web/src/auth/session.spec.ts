import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sessionDto } from '../test/fixtures';
import {
  REFRESH_LOCK,
  RENEW_BEFORE_MS,
  RETRY_DELAYS_MS,
  refreshSession,
  removeLegacyToken,
  sessionStore,
} from './session';

const NOW = new Date('2026-12-21T09:00:00.000Z').getTime();
const MINUTE = 60_000;

function sessionExpiringIn(ms: number, token = 'access-1') {
  return {
    ...sessionDto(undefined, token),
    accessTokenExpiresAt: new Date(Date.now() + ms).toISOString(),
  };
}

function b64url(value: unknown): string {
  return btoa(JSON.stringify(value))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** Unsigned access JWT shape `{ iat, exp }` in server time (seconds). */
function jwt(iatMs: number, ttlMs: number): string {
  const iat = Math.floor(iatMs / 1000);
  return `${b64url({ alg: 'HS256' })}.${b64url({ sub: 'u', typ: 'access', iat, exp: iat + ttlMs / 1000 })}.sig`;
}

function refreshError(status: number, code: string) {
  return Response.json({ statusCode: status, code, message: code }, { status });
}

/** `fetch` stub answering refresh with a fresh 15-min session each call. */
function stubRefresh() {
  let n = 0;
  return vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
    n++;
    return Promise.resolve(
      Response.json(sessionExpiringIn(15 * MINUTE, `access-${n + 1}`)),
    );
  });
}

describe('proactive renewal', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: NOW });
  });

  afterEach(() => {
    sessionStore.reset();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('refreshes at accessTokenExpiresAt − 60 s', async () => {
    const fetch = stubRefresh();
    sessionStore.start(sessionExpiringIn(15 * MINUTE));
    expect(RENEW_BEFORE_MS).toBe(MINUTE);

    await vi.advanceTimersByTimeAsync(14 * MINUTE - 1);
    expect(fetch).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0]!;
    expect((url as URL).pathname).toBe('/api/auth/refresh');
    expect(init).toMatchObject({ method: 'POST' });
    expect(sessionStore.get().accessToken).toBe('access-2');
  });

  it('keeps renewing every ~14 min while the app is open', async () => {
    const fetch = stubRefresh();
    sessionStore.start(sessionExpiringIn(15 * MINUTE));
    await vi.advanceTimersByTimeAsync(14 * MINUTE);
    await vi.advanceTimersByTimeAsync(14 * MINUTE);
    await vi.advanceTimersByTimeAsync(14 * MINUTE);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(sessionStore.get().accessToken).toBe('access-4');
  });

  it('replaces the timer when a new session starts', async () => {
    const fetch = stubRefresh();
    sessionStore.start(sessionExpiringIn(15 * MINUTE));
    await vi.advanceTimersByTimeAsync(5 * MINUTE);
    sessionStore.start(sessionExpiringIn(15 * MINUTE));
    await vi.advanceTimersByTimeAsync(9 * MINUTE);
    expect(fetch).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5 * MINUTE);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('stops when the session ends', async () => {
    const fetch = stubRefresh();
    sessionStore.start(sessionExpiringIn(15 * MINUTE));
    sessionStore.end();
    await vi.advanceTimersByTimeAsync(60 * MINUTE);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not fire at once for an expiry beyond the timer range', async () => {
    const fetch = stubRefresh();
    sessionStore.start(sessionExpiringIn(4 * 365 * 24 * 60 * MINUTE));
    await vi.advanceTimersByTimeAsync(MINUTE);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('waits a short minimum for an already-due expiry (clock skew)', async () => {
    const fetch = stubRefresh();
    sessionStore.start(sessionExpiringIn(-5 * MINUTE));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(fetch).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('renews every ~14 min even when the client clock runs 15 min ahead', async () => {
    const SKEW = 15 * MINUTE;
    // Server time = local time − 15 min; expiresAt is server time.
    const serverSession = () => {
      const serverNow = Date.now() - SKEW;
      return {
        ...sessionDto(),
        accessToken: jwt(serverNow, 15 * MINUTE),
        accessTokenExpiresAt: new Date(serverNow + 15 * MINUTE).toISOString(),
      };
    };
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() =>
        Promise.resolve(Response.json(serverSession())),
      );
    sessionStore.start(serverSession());

    await vi.advanceTimersByTimeAsync(14 * MINUTE - 1);
    expect(fetch).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(28 * MINUTE);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(sessionStore.get().status).toBe('authenticated');
  });

  it('keeps the session and retries when the proactive refresh hits a network error', async () => {
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValue(
        Response.json(sessionExpiringIn(15 * MINUTE, 'access-2')),
      );
    sessionStore.start(sessionExpiringIn(15 * MINUTE));

    await vi.advanceTimersByTimeAsync(14 * MINUTE);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(sessionStore.get()).toMatchObject({
      status: 'authenticated',
      accessToken: 'access-1',
    });
    await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[0]);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(sessionStore.get().status).toBe('authenticated');
    await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[1]);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(sessionStore.get().accessToken).toBe('access-2');
  });

  it('stops retrying a failing proactive refresh once the access token expires', async () => {
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => Promise.resolve(refreshError(503, 'UNKNOWN')));
    sessionStore.start(sessionExpiringIn(15 * MINUTE));

    await vi.advanceTimersByTimeAsync(15 * MINUTE);
    const calls = fetch.mock.calls.length;
    // 14:00, +5 s, +10 s, +20 s, then capped at the 15:00 expiry.
    expect(calls).toBe(5);
    await vi.advanceTimersByTimeAsync(60 * MINUTE);
    expect(fetch).toHaveBeenCalledTimes(calls);
    // The reactive path decides from here; the session is not ended.
    expect(sessionStore.get().status).toBe('authenticated');
  });

  it('ends the session when the proactive refresh fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json(
        {
          statusCode: 401,
          code: 'REFRESH_TOKEN_EXPIRED',
          message: 'Refresh token has expired',
        },
        { status: 401 },
      ),
    );
    sessionStore.start(sessionExpiringIn(15 * MINUTE));
    await vi.advanceTimersByTimeAsync(14 * MINUTE);
    expect(sessionStore.get()).toMatchObject({
      status: 'anonymous',
      accessToken: null,
      endReason: null,
    });
  });
});

describe('refresh single-flight', () => {
  afterEach(() => {
    sessionStore.reset();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('shares one request between concurrent callers in a tab', async () => {
    const fetch = stubRefresh();
    const results = await Promise.all([
      refreshSession(),
      refreshSession(),
      refreshSession(),
    ]);
    expect(results).toEqual([true, true, true]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('runs the refresh inside the cross-tab lock and waits for another tab', async () => {
    const fetch = stubRefresh();
    // A LockManager shared by "two tabs": exclusive, FIFO.
    let tail: Promise<unknown> = Promise.resolve();
    const names: string[] = [];
    const locks = {
      request: (name: string, callback: () => Promise<unknown>) => {
        names.push(name);
        const run = tail.then(callback);
        tail = run.catch(() => undefined);
        return run;
      },
    };
    vi.stubGlobal('navigator', { ...navigator, locks });

    // The other tab holds the lock while it refreshes.
    let release!: () => void;
    void locks.request(
      REFRESH_LOCK,
      () => new Promise<void>((r) => (release = r)),
    );

    const pending = refreshSession();
    await new Promise((r) => setTimeout(r, 10));
    expect(fetch).not.toHaveBeenCalled();

    release();
    await expect(pending).resolves.toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(names).toEqual([REFRESH_LOCK, REFRESH_LOCK]);
    expect(REFRESH_LOCK).toBe('cestaky-auth-refresh');
  });

  it('ends the session on a network error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('offline'));
    await expect(refreshSession()).resolves.toBe(false);
    expect(sessionStore.get().status).toBe('anonymous');
  });

  it('ends an on-demand refresh (boot, reactive) on a 5xx', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      refreshError(502, 'UNKNOWN'),
    );
    await expect(refreshSession()).resolves.toBe(false);
    expect(sessionStore.get().status).toBe('anonymous');
  });

  it('records USER_DEACTIVATED from a 401 refresh', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      refreshError(401, 'USER_DEACTIVATED'),
    );
    await expect(refreshSession()).resolves.toBe(false);
    expect(sessionStore.get()).toMatchObject({
      status: 'anonymous',
      endReason: 'USER_DEACTIVATED',
    });
  });

  it('does not log the user back in when the session ends mid-refresh', async () => {
    let respond!: (res: Response) => void;
    vi.spyOn(globalThis, 'fetch').mockReturnValue(
      new Promise<Response>((r) => (respond = r)),
    );
    sessionStore.start(sessionDto(undefined, 'access-1'));
    const pending = refreshSession();
    await Promise.resolve();

    sessionStore.end(); // e.g. "Log out" clicked
    respond(Response.json(sessionDto(undefined, 'late')));

    await expect(pending).resolves.toBe(false);
    expect(sessionStore.get()).toMatchObject({
      status: 'anonymous',
      accessToken: null,
    });
  });

  it('drops a late network error after the session ended', async () => {
    let fail!: (e: Error) => void;
    vi.spyOn(globalThis, 'fetch').mockReturnValue(
      new Promise<Response>((_, r) => (fail = r)),
    );
    sessionStore.start(sessionDto());
    const pending = refreshSession();
    await Promise.resolve();
    sessionStore.end('USER_DEACTIVATED');
    fail(new TypeError('offline'));
    await expect(pending).resolves.toBe(false);
    expect(sessionStore.get().endReason).toBe('USER_DEACTIVATED');
  });

  it('skips the call when the session ended while waiting for the lock', async () => {
    const fetch = stubRefresh();
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    vi.stubGlobal('navigator', {
      ...navigator,
      locks: {
        request: (_: string, callback: () => Promise<unknown>) =>
          held.then(callback),
      },
    });
    sessionStore.start(sessionDto());
    const pending = refreshSession();
    sessionStore.end();
    release();
    await expect(pending).resolves.toBe(false);
    expect(fetch).not.toHaveBeenCalled();
    expect(sessionStore.get().status).toBe('anonymous');
  });
});

describe('token storage', () => {
  afterEach(() => {
    sessionStore.reset();
    vi.restoreAllMocks();
  });

  it('removes the old localStorage jwt on boot', () => {
    localStorage.setItem('jwt', 'old-token');
    localStorage.setItem('other', 'kept');
    removeLegacyToken();
    expect(localStorage.getItem('jwt')).toBeNull();
    expect(localStorage.getItem('other')).toBe('kept');
  });

  it('survives unavailable storage', () => {
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    expect(() => removeLegacyToken()).not.toThrow();
  });

  it('keeps the access token out of web storage', async () => {
    stubRefresh();
    await refreshSession();
    expect(sessionStore.get().accessToken).toBe('access-2');
    const stored = JSON.stringify({ ...localStorage, ...sessionStorage });
    expect(stored).not.toContain('access-');
  });
});
