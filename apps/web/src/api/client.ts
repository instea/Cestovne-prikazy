import { refreshSession, sessionStore } from '../auth/session';
import { ApiError, parseApiError } from './errors';

/** 401 codes that trigger one refresh + retry (AUTH-02); any other 401 ends the session. */
const REFRESHABLE = new Set(['ACCESS_TOKEN_EXPIRED']);

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

async function send(path: string, options: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  const token = sessionStore.get().accessToken;
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    return await fetch(new URL(`/api${path}`, window.location.origin), {
      method: options.method ?? 'GET',
      headers,
      credentials: 'same-origin',
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal ?? null,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new ApiError(0, 'NETWORK_ERROR', 'Network error');
  }
}

/**
 * Typed fetch wrapper for `/api`. Adds the bearer token, refreshes once on a
 * refreshable 401 and retries once; throws `ApiError` on any failure.
 */
export async function api<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  let res = await send(path, options);

  if (res.status === 401 && !path.startsWith('/auth/')) {
    const error = await parseApiError(res);
    if (error.code === 'USER_DEACTIVATED') {
      sessionStore.end(error.code);
      throw error;
    }
    if (!REFRESHABLE.has(error.code) || !(await refreshSession())) {
      if (sessionStore.get().status !== 'anonymous') sessionStore.end();
      throw error;
    }
    res = await send(path, options);
  }

  if (!res.ok) throw await parseApiError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
