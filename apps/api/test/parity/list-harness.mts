/**
 * MIG-03 leave-list parity loop: for each request, sign a session for the
 * viewer on both apps, ask the old app's GraphQL `getLeaves` (the old
 * client's query) and the new `GET /api/leaves`, reduce both answers to the
 * old client model, diff and classify (`leave-list.mts`).
 */
import type { AppResponse, Diff } from './compare.mts';
import { type EntryStatus, statusOf } from './classify.mts';
import { fetchApp, type Summary } from './harness.mts';
import {
  classifyList,
  diffOutcomes,
  type ListContext,
  type ListOutcome,
  type ListRequest,
  OLD_LEAVES_QUERY,
  parseNew,
  parseOld,
} from './leave-list.mts';
import { newAppToken, oldAppToken } from './tokens.mts';

export interface ListRunOptions {
  oldUrl: string;
  newUrl: string;
  requests: readonly ListRequest[];
  /** Old `secrets/key.pem` contents and the new `JWT_ACCESS_SECRET`. */
  keys: { old: string; new: string };
  timeZone: string;
  context: ListContext;
  timeoutMs?: number;
  log?: (line: string) => void;
}

export interface ListEntry {
  request: ListRequest;
  status: EntryStatus;
  old: Summary & { leaves: number | null };
  new: Summary & { leaves: number | null };
  diffs: Diff[];
  error?: string;
}

export interface ListResult {
  entries: ListEntry[];
  passed: boolean;
}

/** Signs with a key neither app knows (forged session). */
const FORGED_KEY = 'parity-forged-key-not-known-to-either-app';

function bearer(
  r: ListRequest,
  key: string,
  sign: (id: string, key: string) => string,
): Record<string, string> {
  if (r.token === 'none' || r.viewer === null) return {};
  const token = sign(r.viewer, r.token === 'bad-signature' ? FORGED_KEY : key);
  return { Authorization: `Bearer ${token}` };
}

export function callOldList(
  oldUrl: string,
  r: ListRequest,
  keyPem: string,
  timeoutMs: number,
): Promise<AppResponse> {
  return fetchApp(
    `${oldUrl}/graphql`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...bearer(r, keyPem, oldAppToken),
      },
      // Apollo's request body for the old client's watchQuery.
      body: JSON.stringify({
        operationName: 'LeavesQuery',
        variables: {},
        query: OLD_LEAVES_QUERY,
      }),
    },
    timeoutMs,
  );
}

export function callNewList(
  newUrl: string,
  r: ListRequest,
  secret: string,
  timeoutMs: number,
): Promise<AppResponse> {
  const query = r.state ? `?state=${r.state}` : '';
  return fetchApp(
    `${newUrl}/api/leaves${query}`,
    {
      headers: bearer(r, secret, (id, key) => newAppToken(id, key)),
    },
    timeoutMs,
  );
}

const summary = (res: AppResponse, out: ListOutcome) => ({
  outcome: res.kind,
  ...(res.kind === 'response' ? { status: res.status } : {}),
  ms: res.ms,
  requests: 0,
  leaves: out.kind === 'list' ? out.leaves.length : null,
});

export async function runLeaveListParity(
  options: ListRunOptions,
): Promise<ListResult> {
  const timeoutMs = options.timeoutMs ?? 120_000;
  const log = options.log ?? (() => undefined);
  const entries: ListEntry[] = [];
  for (const request of options.requests) {
    const [oldRes, newRes] = await Promise.all([
      callOldList(options.oldUrl, request, options.keys.old, timeoutMs),
      callNewList(options.newUrl, request, options.keys.new, timeoutMs),
    ]);
    const oldOut = parseOld(oldRes, options.timeZone, request.state);
    const newOut = parseNew(newRes);
    const diffs = classifyList(
      diffOutcomes(oldOut, newOut),
      oldOut,
      newOut,
      options.context,
      request.expectDenied,
    );
    const error =
      oldRes.kind === 'error' || newRes.kind === 'error'
        ? `app call failed: old ${oldRes.kind}, new ${newRes.kind}`
        : undefined;
    const status: EntryStatus = error ? 'ERROR' : statusOf(diffs);
    entries.push({
      request,
      status,
      old: summary(oldRes, oldOut),
      new: summary(newRes, newOut),
      diffs,
      ...(error ? { error } : {}),
    });
    log(
      `leaves ${request.label}: ${status}${diffs.length ? ` (${diffs.length} diffs)` : ''}${error ? ` ${error}` : ''}`,
    );
  }
  // A run in which no request returned a list on both sides compared no
  // data at all (e.g. every session was refused): it proves nothing.
  const compared = entries.some(
    (e) => e.old.leaves !== null && e.new.leaves !== null,
  );
  if (!compared)
    log('NOTHING COMPARED: no request returned a list on both apps');
  const passed =
    compared &&
    entries.every((e) => e.status === 'EQUAL' || e.status === 'EXPECTED_DIFF');
  return { entries, passed };
}
