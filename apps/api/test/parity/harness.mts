/**
 * MIG-03 core loop, independent of how the apps run (docker in `run.mts`,
 * in-process in the self-tests): for each request, reset the mock, call
 * both apps with the same Basic credentials, collect their outgoing
 * requests, compare (`compare.mts`) and classify (`classify.mts`).
 */
import {
  type AppResponse,
  type Diff,
  diffRequests,
  diffResponses,
  isOrderOnly,
  type OutgoingRequest,
} from './compare.mts';
import {
  type ClassifyContext,
  classify,
  corsNote,
  type EntryStatus,
  statusOf,
} from './classify.mts';
import type { MockRecord } from './mock-server.mts';
import type { ParityRequest } from './months.mts';

export interface Endpoints {
  oldUrl: string;
  newUrl: string;
  mockControlUrl: string;
  /** App names of the mock listeners. */
  oldApp?: string;
  newApp?: string;
}

export interface ParityEntry {
  request: { year: string; month: string; kind: ParityRequest['kind'] };
  status: EntryStatus;
  orderOnly: boolean;
  old: Summary;
  new: Summary;
  diffs: Diff[];
  /** Header notes (CORS_HEADERS); never change `status`. */
  notes: Diff[];
  unmatched: MockRecord[];
  error?: string;
}

export interface Summary {
  outcome: AppResponse['kind'];
  status?: number;
  ms: number;
  requests: number;
}

export interface ParityResult {
  entries: ParityEntry[];
  unmatched: MockRecord[];
  /**
   * Apps for which no request to the mock got a 2xx answer during the whole
   * run: nothing was compared for them (e.g. every SSO call failed), so the
   * run fails even if every request compared EQUAL.
   */
  nothingCompared: string[];
  passed: boolean;
}

export interface RunOptions extends Endpoints {
  requests: readonly ParityRequest[];
  m2m: { username: string; password: string };
  context: ClassifyContext;
  /** Per request and app (spec: 120 s, old Toggl paging is slow). */
  timeoutMs?: number;
  log?: (line: string) => void;
}

const basic = (u: string, p: string) =>
  `Basic ${Buffer.from(`${u}:${p}`).toString('base64')}`;

export async function callApp(
  baseUrl: string,
  r: { year: string; month: string },
  auth: string,
  timeoutMs: number,
): Promise<AppResponse> {
  const started = Date.now();
  const url = `${baseUrl}/api/attendence/${encodeURIComponent(r.year)}/${encodeURIComponent(r.month)}`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: auth },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body = await res.text();
    return {
      kind: 'response',
      status: res.status,
      contentType: res.headers.get('content-type'),
      acao: res.headers.get('access-control-allow-origin'),
      body,
      ms: Date.now() - started,
    };
  } catch (err) {
    const ms = Date.now() - started;
    const e = err as { name?: string; message?: string; cause?: unknown };
    if (e.name === 'TimeoutError' || e.name === 'AbortError')
      return { kind: 'timeout', ms };
    if (
      isPeerClose(e.cause) &&
      ms >= Math.min(timeoutMs - 5_000, HANG_CLOSE_MS)
    )
      return { kind: 'timeout', ms };
    return { kind: 'error', message: e.message ?? String(err), ms };
  }
}

/**
 * The old app (Node 12) closes a socket after its default 120 s server
 * timeout. A hung request therefore ends as "other side closed" just
 * before the client's own 120 s abort; without any response that is the
 * same outcome as a client timeout (no answer), so it counts as one.
 */
export const HANG_CLOSE_MS = 115_000;

function isPeerClose(cause: unknown): boolean {
  const code = (cause as { code?: unknown } | undefined)?.code;
  return code === 'UND_ERR_SOCKET' || code === 'ECONNRESET';
}

async function control<T>(
  base: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${base}${path}`, init);
  if (!res.ok) throw new Error(`mock ${path}: HTTP ${res.status}`);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export const resetMock = (base: string) =>
  control<void>(base, '/__reset', { method: 'POST' });

export const mockRecords = async (base: string) =>
  (await control<{ records: MockRecord[] }>(base, '/__requests')).records;

export const loadFixtures = (base: string, set: unknown) =>
  control<void>(base, '/__fixtures', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(set),
  });

/** `old POST /…/time_entries {"start_date":…}` (names the request). */
export const describeRecord = (r: MockRecord): string =>
  [
    r.app,
    r.method,
    r.path,
    JSON.stringify(r.body),
    r.reason ? `(${r.reason})` : undefined,
  ]
    .filter((p) => p !== undefined)
    .join(' ');

const isSuccess = (r: MockRecord) => r.status >= 200 && r.status < 300;

const outgoing = (r: MockRecord): OutgoingRequest => ({
  service: r.service,
  method: r.method,
  path: r.path,
  auth: r.auth,
  body: r.body,
});

const summary = (r: AppResponse, requests: number): Summary => ({
  outcome: r.kind,
  ...(r.kind === 'response' ? { status: r.status } : {}),
  ms: r.ms,
  requests,
});

export async function runParity(options: RunOptions): Promise<ParityResult> {
  const timeoutMs = options.timeoutMs ?? 120_000;
  const oldApp = options.oldApp ?? 'old';
  const newApp = options.newApp ?? 'new';
  const auth = basic(options.m2m.username, options.m2m.password);
  const log = options.log ?? (() => undefined);
  const entries: ParityEntry[] = [];
  const allUnmatched: MockRecord[] = [];
  const succeeded = new Set<string>();

  for (const request of options.requests) {
    const label = `${request.year}/${request.month}`;
    try {
      await resetMock(options.mockControlUrl);
      const [oldRes, newRes] = await Promise.all([
        callApp(options.oldUrl, request, auth, timeoutMs),
        callApp(options.newUrl, request, auth, timeoutMs),
      ]);
      const records = await mockRecords(options.mockControlUrl);
      const oldRecords = records.filter((r) => r.app === oldApp);
      const newRecords = records.filter((r) => r.app === newApp);
      const unmatched = records.filter((r) => r.unmatched);
      allUnmatched.push(...unmatched);
      for (const r of records) if (isSuccess(r)) succeeded.add(r.app);

      const diffs = classify({
        request,
        oldRes,
        newRes,
        diffs: [
          ...diffResponses(oldRes, newRes),
          ...diffRequests(oldRecords.map(outgoing), newRecords.map(outgoing)),
        ],
        oldRecords,
        newRecords,
        context: options.context,
      });
      const note = corsNote(oldRes, newRes);
      // An unmatched mock request means the fixtures do not cover what an
      // app asked for: the comparison is not trustworthy.
      let error: string | undefined;
      if (unmatched.length > 0)
        error = `unmatched mock request(s): ${unmatched.map(describeRecord).join('; ')}`;
      else if (oldRes.kind === 'error' || newRes.kind === 'error')
        error = `app call failed: old ${oldRes.kind}, new ${newRes.kind}`;
      const status: EntryStatus = error ? 'ERROR' : statusOf(diffs);
      entries.push({
        request: {
          year: request.year,
          month: request.month,
          kind: request.kind,
        },
        status,
        orderOnly: isOrderOnly(diffs),
        old: summary(oldRes, oldRecords.length),
        new: summary(newRes, newRecords.length),
        diffs,
        notes: note ? [note] : [],
        unmatched,
        ...(error ? { error } : {}),
      });
      log(
        `${label}: ${status}${diffs.length ? ` (${diffs.length} diffs)` : ''}${error ? ` ${error}` : ''}`,
      );
    } catch (err) {
      entries.push({
        request: {
          year: request.year,
          month: request.month,
          kind: request.kind,
        },
        status: 'ERROR',
        orderOnly: false,
        old: { outcome: 'error', ms: 0, requests: 0 },
        new: { outcome: 'error', ms: 0, requests: 0 },
        diffs: [],
        notes: [],
        unmatched: [],
        error: String(err),
      });
      log(`${label}: ERROR ${String(err)}`);
    }
  }

  const nothingCompared = [oldApp, newApp].filter((a) => !succeeded.has(a));
  for (const a of nothingCompared)
    log(`NOTHING COMPARED: no mock request of app "${a}" got a 2xx answer`);
  const passed =
    allUnmatched.length === 0 &&
    nothingCompared.length === 0 &&
    entries.every((e) => e.status === 'EQUAL' || e.status === 'EXPECTED_DIFF');
  return { entries, unmatched: allUnmatched, nothingCompared, passed };
}
