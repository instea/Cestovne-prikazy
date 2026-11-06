import type { SessionDto, UserDto } from '@leaves/shared/dto';
import { ErrorCode } from '@leaves/shared/enums';
import { parseApiError } from '../api/errors';

/**
 * In-memory session (SET-03 / AUTH-02). The access token never touches
 * storage; a reload restores the session through the HttpOnly refresh cookie.
 */
/** `endReason` of a user-initiated logout (AUTH-03): /login without returnTo. */
export const LOGOUT_REASON = 'LOGOUT';

export type SessionStatus = 'unknown' | 'authenticated' | 'anonymous';

export interface SessionState {
  status: SessionStatus;
  accessToken: string | null;
  user: UserDto | null;
  /** Why the last session ended, e.g. `USER_DEACTIVATED` (shown on /login). */
  endReason: string | null;
}

/** Proactive renewal runs this long before the access token expires. */
export const RENEW_BEFORE_MS = 60_000;
/** Floor for the renewal delay (very short token lifetimes). */
const MIN_RENEW_DELAY_MS = 10_000;
/** Backoff for a proactive renewal that could not reach the server. */
export const RETRY_DELAYS_MS = [5_000, 10_000, 20_000, 30_000] as const;
/** `setTimeout` fires at once above 2^31−1 ms; cap the delay there. */
const MAX_TIMER_MS = 2 ** 31 - 1;
/** Web Locks name: tabs never present the same refresh token at once. */
export const REFRESH_LOCK = 'cestaky-auth-refresh';

const initial: SessionState = {
  status: 'unknown',
  accessToken: null,
  user: null,
  endReason: null,
};

let state: SessionState = initial;
const listeners = new Set<() => void>();
let renewTimer: ReturnType<typeof setTimeout> | undefined;
/** Local `Date.now()` at which the current access token expires. */
let accessDeadline = 0;
let retryAttempt = 0;
/**
 * Bumped whenever the session ends or resets. A refresh that started in an
 * older epoch neither starts nor ends the session (e.g. logout while a
 * renewal is in flight must not log the user back in).
 */
let epoch = 0;

function setState(next: SessionState): void {
  state = next;
  for (const listener of listeners) listener();
}

function cancelRenewal(): void {
  clearTimeout(renewTimer);
  renewTimer = undefined;
}

function clampDelay(ms: number): number {
  return Math.min(Math.max(ms, 0), MAX_TIMER_MS);
}

/** `exp − iat` of the access JWT in ms, or `null` if it cannot be read. */
function jwtLifetimeMs(token: string): number | null {
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const claims = JSON.parse(json) as { iat?: unknown; exp?: unknown };
    const { iat, exp } = claims;
    if (typeof iat !== 'number' || typeof exp !== 'number' || exp <= iat) {
      return null;
    }
    return (exp - iat) * 1000;
  } catch {
    return null;
  }
}

/**
 * Token lifetime counted from local receipt. The JWT's `exp − iat` is
 * server time on both sides, so a skewed client clock cannot make a fresh
 * token look already due (which would rotate the refresh token in a loop).
 * Falls back to the absolute `accessTokenExpiresAt` only for a token whose
 * claims cannot be read.
 */
function lifetimeMs(session: SessionDto): number {
  const fromJwt = jwtLifetimeMs(session.accessToken);
  if (fromJwt !== null) return fromJwt;
  const left = new Date(session.accessTokenExpiresAt).getTime() - Date.now();
  return Number.isNaN(left) ? 0 : left;
}

function scheduleRenewal(session: SessionDto): void {
  cancelRenewal();
  const lifetime = lifetimeMs(session);
  accessDeadline = Date.now() + lifetime;
  retryAttempt = 0;
  const delay = Math.max(lifetime - RENEW_BEFORE_MS, MIN_RENEW_DELAY_MS);
  renewTimer = setTimeout(() => void renewFromTimer(), clampDelay(delay));
}

/**
 * Network error or 5xx during proactive renewal: the refresh cookie may
 * still be valid, so keep the session and retry until the access token
 * expires. After that the reactive path (401 ACCESS_TOKEN_EXPIRED → refresh)
 * decides.
 */
function scheduleRetry(): void {
  const left = accessDeadline - Date.now();
  if (left <= 0) return;
  const backoff =
    RETRY_DELAYS_MS[Math.min(retryAttempt, RETRY_DELAYS_MS.length - 1)] ??
    RETRY_DELAYS_MS[0];
  retryAttempt++;
  renewTimer = setTimeout(
    () => void renewFromTimer(),
    clampDelay(Math.min(backoff, left)),
  );
}

export const sessionStore = {
  get: (): SessionState => state,
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  start(session: SessionDto): void {
    scheduleRenewal(session);
    setState({
      status: 'authenticated',
      accessToken: session.accessToken,
      user: session.user,
      endReason: null,
    });
  },
  end(reason: string | null = null): void {
    epoch++;
    cancelRenewal();
    setState({ ...initial, status: 'anonymous', endReason: reason });
  },
  /** Test helper: back to the boot state. */
  reset(): void {
    epoch++;
    cancelRenewal();
    inflight = null;
    setState(initial);
  },
};

/** The old app kept its JWT in `localStorage['jwt']` (same origin); drop it. */
export function removeLegacyToken(): void {
  try {
    localStorage.removeItem('jwt');
  } catch {
    // storage unavailable
  }
}

/** Runs `fn` under the cross-tab Web Lock when the browser has one. */
function withRefreshLock<T>(fn: () => Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && 'locks' in navigator) {
    return navigator.locks.request(REFRESH_LOCK, fn);
  }
  return fn();
}

/**
 * `ok`: new session started. `rejected`: the server refused the refresh
 * token (401), session ended. `unavailable`: network error or non-401
 * failure, session untouched. `stale`: the session ended or reset while the
 * call was in flight, result dropped.
 */
type RefreshOutcome = 'ok' | 'rejected' | 'unavailable' | 'stale';

async function callRefresh(): Promise<RefreshOutcome> {
  const started = epoch;
  let res: Response | null;
  try {
    res = await withRefreshLock(() =>
      // Skip the call when the session ended while we waited for the lock.
      started === epoch
        ? fetch(new URL('/api/auth/refresh', window.location.origin), {
            method: 'POST',
            credentials: 'same-origin',
          })
        : Promise.resolve(null),
    );
  } catch {
    return started === epoch ? 'unavailable' : 'stale';
  }
  if (!res || started !== epoch) return 'stale';
  if (res.ok) {
    let session: SessionDto;
    try {
      session = (await res.json()) as SessionDto;
    } catch {
      return started === epoch ? 'unavailable' : 'stale';
    }
    if (started !== epoch) return 'stale';
    sessionStore.start(session);
    return 'ok';
  }
  if (res.status !== 401) return 'unavailable';
  const error = await parseApiError(res);
  if (started !== epoch) return 'stale';
  sessionStore.end(
    error.code === ErrorCode.USER_DEACTIVATED ? error.code : null,
  );
  return 'rejected';
}

let inflight: Promise<RefreshOutcome> | null = null;

/** Single-flight: concurrent callers in a tab share one call. */
function sharedRefresh(): Promise<RefreshOutcome> {
  inflight ??= callRefresh().finally(() => {
    inflight = null;
  });
  return inflight;
}

async function renewFromTimer(): Promise<void> {
  const started = epoch;
  const outcome = await sharedRefresh();
  if (
    outcome === 'unavailable' &&
    started === epoch &&
    state.status === 'authenticated'
  ) {
    scheduleRetry();
  }
}

/**
 * `POST /api/auth/refresh` on demand (boot, reactive renewal), single-flight
 * in a tab and serialised across tabs through the Web Lock (AUTH-02).
 * Resolves `true` when a new session is active. On `false` the session has
 * ended, except when it already ended or reset while the call ran.
 */
export async function refreshSession(): Promise<boolean> {
  const started = epoch;
  const outcome = await sharedRefresh();
  if (outcome === 'unavailable' && started === epoch) sessionStore.end();
  return outcome === 'ok';
}
