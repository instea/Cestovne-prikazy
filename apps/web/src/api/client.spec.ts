import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { sessionStore } from '../auth/session';
import { sessionDto } from '../test/fixtures';
import { error, server } from '../test/server';
import { api } from './client';
import { ApiError } from './errors';

function counter() {
  return { n: 0 };
}

describe('api client', () => {
  it('adds the bearer token and returns JSON', async () => {
    sessionStore.start(sessionDto(undefined, 'tok-1'));
    server.use(
      http.get('*/api/things', ({ request }) =>
        HttpResponse.json({ auth: request.headers.get('authorization') }),
      ),
    );
    await expect(api('/things')).resolves.toEqual({ auth: 'Bearer tok-1' });
  });

  it('sends a JSON body', async () => {
    server.use(
      http.post('*/api/things', async ({ request }) =>
        HttpResponse.json({
          type: request.headers.get('content-type'),
          body: (await request.json()) as unknown,
        }),
      ),
    );
    await expect(
      api('/things', { method: 'POST', body: { a: 1 } }),
    ).resolves.toEqual({
      type: 'application/json',
      body: { a: 1 },
    });
  });

  it('returns undefined for 204', async () => {
    server.use(
      http.delete(
        '*/api/things/1',
        () => new HttpResponse(null, { status: 204 }),
      ),
    );
    await expect(
      api('/things/1', { method: 'DELETE' }),
    ).resolves.toBeUndefined();
  });

  it('refreshes once on ACCESS_TOKEN_EXPIRED and retries', async () => {
    sessionStore.start(sessionDto(undefined, 'old'));
    const refreshes = counter();
    server.use(
      http.post('*/api/auth/refresh', () => {
        refreshes.n++;
        return HttpResponse.json(sessionDto(undefined, 'new'));
      }),
      http.get('*/api/things', ({ request }) =>
        request.headers.get('authorization') === 'Bearer new'
          ? HttpResponse.json({ ok: true })
          : error(401, 'ACCESS_TOKEN_EXPIRED'),
      ),
    );
    await expect(api('/things')).resolves.toEqual({ ok: true });
    expect(refreshes.n).toBe(1);
    expect(sessionStore.get().accessToken).toBe('new');
  });

  it('shares one refresh between concurrent 401s', async () => {
    sessionStore.start(sessionDto(undefined, 'old'));
    const refreshes = counter();
    server.use(
      http.post('*/api/auth/refresh', async () => {
        refreshes.n++;
        await new Promise((r) => setTimeout(r, 20));
        return HttpResponse.json(sessionDto(undefined, 'new'));
      }),
      http.get('*/api/things/:id', ({ request }) =>
        request.headers.get('authorization') === 'Bearer new'
          ? HttpResponse.json({ ok: true })
          : error(401, 'ACCESS_TOKEN_EXPIRED'),
      ),
    );
    await Promise.all([api('/things/1'), api('/things/2'), api('/things/3')]);
    expect(refreshes.n).toBe(1);
  });

  it('ends the session when refresh fails', async () => {
    sessionStore.start(sessionDto());
    server.use(
      http.get('*/api/things', () => error(401, 'ACCESS_TOKEN_EXPIRED')),
    );
    await expect(api('/things')).rejects.toMatchObject({
      code: 'ACCESS_TOKEN_EXPIRED',
    });
    expect(sessionStore.get()).toMatchObject({
      status: 'anonymous',
      accessToken: null,
    });
  });

  it.each(['ACCESS_TOKEN_INVALID', 'AUTH_REQUIRED'])(
    'ends the session without refresh on %s',
    async (code) => {
      sessionStore.start(sessionDto());
      const refreshes = counter();
      server.use(
        http.post('*/api/auth/refresh', () => {
          refreshes.n++;
          return HttpResponse.json(sessionDto());
        }),
        http.get('*/api/things', () => error(401, code)),
      );
      await expect(api('/things')).rejects.toMatchObject({ code });
      expect(refreshes.n).toBe(0);
      expect(sessionStore.get()).toMatchObject({
        status: 'anonymous',
        endReason: null,
      });
    },
  );

  it('does not refresh on USER_DEACTIVATED and records the reason', async () => {
    sessionStore.start(sessionDto());
    const refreshes = counter();
    server.use(
      http.post('*/api/auth/refresh', () => {
        refreshes.n++;
        return HttpResponse.json(sessionDto());
      }),
      http.get('*/api/things', () => error(401, 'USER_DEACTIVATED')),
    );
    await expect(api('/things')).rejects.toMatchObject({
      code: 'USER_DEACTIVATED',
    });
    expect(refreshes.n).toBe(0);
    expect(sessionStore.get()).toMatchObject({
      status: 'anonymous',
      endReason: 'USER_DEACTIVATED',
    });
  });

  it('refreshes and retries /auth/me on ACCESS_TOKEN_EXPIRED', async () => {
    sessionStore.start(sessionDto(undefined, 'old'));
    const refreshes = counter();
    server.use(
      http.post('*/api/auth/refresh', () => {
        refreshes.n++;
        return HttpResponse.json(sessionDto(undefined, 'new'));
      }),
      http.get('*/api/auth/me', ({ request }) =>
        request.headers.get('authorization') === 'Bearer new'
          ? HttpResponse.json({ id: 'me' })
          : error(401, 'ACCESS_TOKEN_EXPIRED'),
      ),
    );
    await expect(api('/auth/me')).resolves.toEqual({ id: 'me' });
    expect(refreshes.n).toBe(1);
  });

  it('does not refresh for token-less /auth calls', async () => {
    const refreshes = counter();
    server.use(
      http.post('*/api/auth/refresh', () => {
        refreshes.n++;
        return error(401, 'REFRESH_TOKEN_MISSING');
      }),
      http.post('*/api/auth/google', () => error(401, 'LOGIN_FAILED')),
    );
    await expect(
      api('/auth/google', { method: 'POST', body: {} }),
    ).rejects.toMatchObject({
      code: 'LOGIN_FAILED',
    });
    expect(refreshes.n).toBe(0);
  });

  it('parses the error body into ApiError', async () => {
    server.use(
      http.get('*/api/things', () => error(409, 'LEAVE_OVERLAP', 'Overlaps')),
    );
    const e = await api('/things').catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect(e).toMatchObject({
      statusCode: 409,
      code: 'LEAVE_OVERLAP',
      message: 'Overlaps',
    });
  });

  it('maps an unparseable body to UNKNOWN', async () => {
    server.use(
      http.get(
        '*/api/things',
        () => new HttpResponse('<html>', { status: 502 }),
      ),
    );
    await expect(api('/things')).rejects.toMatchObject({
      statusCode: 502,
      code: 'UNKNOWN',
    });
  });

  it('maps a rejected fetch to NETWORK_ERROR', async () => {
    server.use(http.get('*/api/things', () => HttpResponse.error()));
    await expect(api('/things')).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
    });
  });
});
