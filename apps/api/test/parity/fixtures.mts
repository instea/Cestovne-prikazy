/**
 * MIG-03 fixture set served by the parity mock to both apps. One SSO
 * answer, and Toggl answers keyed exactly by (`workspaceId`, `user_ids`,
 * `start_date`, `end_date`, `first_row_number`, token). A request without a
 * matching entry gets 599 and fails the run (`unmatched`).
 *
 * The synthetic set is generated (`synthetic.mts`); a recorded set is two
 * files in a directory: `sso.json` (`SsoFixture`) and `toggl.json`
 * (`TogglFixture[]`), tokens scrubbed to placeholders (`secrets.mts`).
 */

export interface CannedResponse {
  status: number;
  headers?: Record<string, string>;
  /** JSON body; a string is sent as-is (non-JSON injection). */
  body?: unknown;
  /** Injected latency (TIMEOUT_REDIRECT_LIMIT tests). */
  delayMs?: number;
  /** Injected redirect hops before the answer. */
  redirects?: number;
}

export interface SsoFixture {
  /** Basic credentials the mock requires (wrong → 401). */
  username: string;
  password: string;
  response: CannedResponse;
}

export interface TogglKey {
  workspaceId: string;
  /** As sent, e.g. `[20]`, or `[null]` from the old app's `parseInt(undefined)`. */
  userIds: unknown[];
  startDate: string;
  endDate: string;
  firstRowNumber: number | null;
  /** `togglApiToken` from the Basic user (password is `api_token`). */
  token: string;
}

export interface TogglFixture {
  key: TogglKey;
  response: CannedResponse;
}

export interface FixtureSet {
  sso: SsoFixture;
  toggl: TogglFixture[];
  /**
   * SSO answer for one app instead of `sso.response` (same credentials).
   * The harness uses it for the old baseline app (`base`), which sees the
   * directory without the employees that make the old app fail.
   */
  ssoByApp?: Record<string, CannedResponse>;
}

export const togglKeyString = (k: TogglKey): string =>
  JSON.stringify([
    k.workspaceId,
    k.userIds,
    k.startDate,
    k.endDate,
    k.firstRowNumber,
    k.token,
  ]);

/** Key of a received Toggl request, or `null` if it cannot be keyed. */
export function togglKeyOf(
  workspaceId: string,
  token: string | null,
  body: unknown,
): TogglKey | null {
  if (token === null || typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;
  if (!Array.isArray(b.user_ids)) return null;
  return {
    workspaceId,
    userIds: b.user_ids as unknown[],
    startDate: String(b.start_date),
    endDate: String(b.end_date),
    firstRowNumber:
      typeof b.first_row_number === 'number' ? b.first_row_number : null,
    token,
  };
}

export function indexToggl(
  fixtures: readonly TogglFixture[],
): Map<string, CannedResponse> {
  const index = new Map<string, CannedResponse>();
  for (const f of fixtures) {
    const k = togglKeyString(f.key);
    if (index.has(k)) throw new Error(`Duplicate Toggl fixture key ${k}`);
    index.set(k, f.response);
  }
  return index;
}
