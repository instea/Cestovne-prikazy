/**
 * MIG-03 comparison of one attendance request answered by the old and the
 * new app (spec order): 1. status, 2. body bytes, 3. structural diff when
 * the bytes differ, 4. the outgoing SSO / Toggl requests of each app.
 * Pure functions; the classifier (`classify.mts`) labels the diffs.
 */

export type AppResponse =
  | {
      kind: 'response';
      status: number;
      contentType: string | null;
      /** `Access-Control-Allow-Origin` (only reported, see CORS_HEADERS). */
      acao: string | null;
      body: string;
      ms: number;
    }
  | { kind: 'timeout'; ms: number }
  | { kind: 'error'; message: string; ms: number };

export type DiffKind =
  /** One app answered, the other timed out or failed. */
  | 'outcome'
  | 'status'
  | 'content-type'
  /** Bodies differ and at least one is not JSON. */
  | 'body-bytes'
  /** Same keys and values, different key order at `path`. */
  | 'order'
  /** Same JSON value and key order, different bytes (number formatting). */
  | 'format'
  | 'value'
  /** Key or array element only in the old body. */
  | 'missing'
  /** Key or array element only in the new body. */
  | 'extra'
  /** Outgoing request only the old app sent. */
  | 'request-old-only'
  /** Outgoing request only the new app sent. */
  | 'request-new-only'
  /** Same outgoing requests, different order. */
  | 'request-order';

export interface Diff {
  kind: DiffKind;
  /** JSON path (`attendence.Anna.days.4.leave`), `$` for the root. */
  path: string;
  old?: unknown;
  new?: unknown;
  /** Expected-diff class, set by the classifier; absent = unexplained. */
  class?: string;
}

/** An outgoing request recorded by the mock, reduced to what is compared. */
export interface OutgoingRequest {
  service: 'sso' | 'toggl' | 'other';
  method: string;
  path: string;
  auth: string | null;
  body: unknown;
}

type Json = unknown;

const isObject = (v: Json): v is Record<string, Json> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const join = (path: string, key: string | number) =>
  path === '$' ? String(key) : `${path}.${key}`;

/** Deep equality of JSON values, ignoring object key order. */
export function jsonEqual(a: Json, b: Json): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((v, i) => jsonEqual(v, b[i]))
    );
  }
  if (isObject(a) || isObject(b)) {
    if (!isObject(a) || !isObject(b)) return false;
    const ka = Object.keys(a);
    if (ka.length !== Object.keys(b).length) return false;
    return ka.every((k) => k in b && jsonEqual(a[k], b[k]));
  }
  return Object.is(a, b);
}

/**
 * Structural diff of two parsed JSON bodies: value, missing and extra
 * entries, plus an `order` entry for every object whose shared keys come in
 * a different order.
 */
export function diffJson(a: Json, b: Json, path = '$'): Diff[] {
  if (Array.isArray(a) && Array.isArray(b)) {
    const out: Diff[] = [];
    const n = Math.max(a.length, b.length);
    for (let i = 0; i < n; i++) {
      const p = join(path, i);
      if (i >= b.length) out.push({ kind: 'missing', path: p, old: a[i] });
      else if (i >= a.length) out.push({ kind: 'extra', path: p, new: b[i] });
      else out.push(...diffJson(a[i], b[i], p));
    }
    return out;
  }
  if (isObject(a) && isObject(b)) {
    const out: Diff[] = [];
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    const shared = ka.filter((k) => k in b);
    const sharedB = kb.filter((k) => k in a);
    if (shared.join('\u0000') !== sharedB.join('\u0000'))
      out.push({ kind: 'order', path, old: ka, new: kb });
    for (const k of ka) {
      const p = join(path, k);
      if (!(k in b)) out.push({ kind: 'missing', path: p, old: a[k] });
      else out.push(...diffJson(a[k], b[k], p));
    }
    for (const k of kb)
      if (!(k in a))
        out.push({ kind: 'extra', path: join(path, k), new: b[k] });
    return out;
  }
  return Object.is(a, b) ? [] : [{ kind: 'value', path, old: a, new: b }];
}

function parse(text: string): { ok: true; value: Json } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) as Json };
  } catch {
    return { ok: false };
  }
}

const TRUNCATE = 2000;
const cut = (s: string) =>
  s.length > TRUNCATE ? `${s.slice(0, TRUNCATE)}… (${s.length} bytes)` : s;

/** Step 2 + 3: `[]` when byte-equal, else the structural diff. */
export function diffBodies(oldBody: string, newBody: string): Diff[] {
  if (oldBody === newBody) return [];
  const a = parse(oldBody);
  const b = parse(newBody);
  if (!a.ok || !b.ok)
    return [
      { kind: 'body-bytes', path: '$', old: cut(oldBody), new: cut(newBody) },
    ];
  const diffs = diffJson(a.value, b.value);
  // Same value, same key order, different bytes: number formatting or
  // whitespace (e.g. `0.83` vs `0.8333333333333334` cannot be this case,
  // those are value diffs; `1.0` vs `1` is).
  if (diffs.length === 0)
    return [
      { kind: 'format', path: '$', old: cut(oldBody), new: cut(newBody) },
    ];
  return diffs;
}

/** True when every diff is a key-order diff ("order-only" in the report). */
export const isOrderOnly = (diffs: readonly Diff[]): boolean =>
  diffs.length > 0 && diffs.every((d) => d.kind === 'order');

/** Stable text form of an outgoing request (body keys in sent order). */
export function requestSignature(r: OutgoingRequest): string {
  return `${r.method} ${r.path} auth=${r.auth ?? '-'} body=${JSON.stringify(r.body) ?? '-'}`;
}

/**
 * Step 4: aligns the two ordered request lists with a longest common
 * subsequence; requests outside it are old-only / new-only. Equal multisets
 * in a different order give a single `request-order` diff.
 */
export function diffRequests(
  oldReqs: readonly OutgoingRequest[],
  newReqs: readonly OutgoingRequest[],
): Diff[] {
  const a = oldReqs.map(requestSignature);
  const b = newReqs.map(requestSignature);
  if (a.join('\n') === b.join('\n')) return [];
  const sortedA = [...a].sort().join('\n');
  const sortedB = [...b].sort().join('\n');
  if (sortedA === sortedB)
    return [{ kind: 'request-order', path: '$requests', old: a, new: b }];

  // LCS table (lists are short: one SSO call plus the Toggl pages).
  const n = a.length;
  const m = b.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0),
  );
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      lcs[i]![j] =
        a[i] === b[j]
          ? lcs[i + 1]![j + 1]! + 1
          : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
  const out: Diff[] = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) {
      i++;
      j++;
    } else if (j >= m || (i < n && lcs[i + 1]![j]! >= lcs[i]![j + 1]!)) {
      out.push({
        kind: 'request-old-only',
        path: `$requests.old.${i}`,
        old: oldReqs[i],
      });
      i++;
    } else {
      out.push({
        kind: 'request-new-only',
        path: `$requests.new.${j}`,
        new: newReqs[j],
      });
      j++;
    }
  }
  return out;
}

/** Steps 1–3 for one request (the request lists are diffed separately). */
export function diffResponses(
  oldRes: AppResponse,
  newRes: AppResponse,
): Diff[] {
  if (oldRes.kind !== 'response' || newRes.kind !== 'response') {
    if (oldRes.kind === newRes.kind && oldRes.kind === 'timeout') return [];
    return [
      {
        kind: 'outcome',
        path: '$',
        old: describeOutcome(oldRes),
        new: describeOutcome(newRes),
      },
    ];
  }
  const out: Diff[] = [];
  if (oldRes.status !== newRes.status)
    out.push({
      kind: 'status',
      path: '$status',
      old: oldRes.status,
      new: newRes.status,
    });
  if (oldRes.contentType !== newRes.contentType)
    out.push({
      kind: 'content-type',
      path: '$header.content-type',
      old: oldRes.contentType,
      new: newRes.contentType,
    });
  out.push(...diffBodies(oldRes.body, newRes.body));
  return out;
}

export function describeOutcome(r: AppResponse): string {
  if (r.kind === 'timeout') return `timeout after ${r.ms} ms`;
  if (r.kind === 'error') return `error: ${r.message}`;
  return `${r.status} ${cut(r.body)}`;
}
