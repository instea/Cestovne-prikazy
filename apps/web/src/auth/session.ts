import type { SessionDto, UserDto } from '@leaves/shared/dto';
import { parseApiError } from '../api/errors';

/**
 * In-memory session (SET-03 / AUTH-02). The access token never touches
 * storage; a reload restores the session through the HttpOnly refresh cookie.
 */
export type SessionStatus = 'unknown' | 'authenticated' | 'anonymous';

export interface SessionState {
  status: SessionStatus;
  accessToken: string | null;
  user: UserDto | null;
  /** Why the last session ended, e.g. `USER_DEACTIVATED` (shown on /login). */
  endReason: string | null;
}

const initial: SessionState = {
  status: 'unknown',
  accessToken: null,
  user: null,
  endReason: null,
};

let state: SessionState = initial;
const listeners = new Set<() => void>();

function setState(next: SessionState): void {
  state = next;
  for (const listener of listeners) listener();
}

export const sessionStore = {
  get: (): SessionState => state,
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  start(session: SessionDto): void {
    setState({
      status: 'authenticated',
      accessToken: session.accessToken,
      user: session.user,
      endReason: null,
    });
  },
  end(reason: string | null = null): void {
    setState({ ...initial, status: 'anonymous', endReason: reason });
  },
  /** Test helper: back to the boot state. */
  reset(): void {
    inflight = null;
    setState(initial);
  },
};

let inflight: Promise<boolean> | null = null;

/**
 * `POST /api/auth/refresh`, single-flight: concurrent callers share one call.
 * Resolves `true` when a new session is active, `false` when it ended.
 */
export function refreshSession(): Promise<boolean> {
  inflight ??= (async () => {
    try {
      const res = await fetch(
        new URL('/api/auth/refresh', window.location.origin),
        {
          method: 'POST',
          credentials: 'same-origin',
        },
      );
      if (res.ok) {
        sessionStore.start((await res.json()) as SessionDto);
        return true;
      }
      const error = await parseApiError(res);
      sessionStore.end(error.code === 'USER_DEACTIVATED' ? error.code : null);
      return false;
    } catch {
      sessionStore.end();
      return false;
    }
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}
