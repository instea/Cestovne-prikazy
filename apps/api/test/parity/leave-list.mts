/**
 * MIG-03 leave-list parity (Track A, reads): the old GraphQL `getLeaves`
 * against the new `GET /api/leaves`, for the same migrated data, as
 * different users. Pure functions; the runner is `list-harness.mts`.
 *
 * The two APIs have different shapes (GraphQL vs REST, instants vs calendar
 * dates), so both answers are reduced to the model the old Angular client
 * built from the response (`angular/src/app/leaves/leave.ts` `fromGraphQl`
 * at 193b89f) and compared there:
 *
 * - dates: the old instant as a calendar date in the default timezone (the
 *   old client showed `new Date(iso)` in the browser's local time);
 * - `type` missing → `ANNUAL`, `state` missing → `PENDING` (as the old
 *   client did, and as MIG-01 migrates them);
 * - `isHalfDay`: truthy (the old UI only tested it);
 * - requester / approver: `id`, `firstName`, `surname`.
 *
 * Not compared, on purpose: user `email` (old only; the old UI used it only
 * to key the calendar colour, replaced by #21) and the new-only fields
 * `createdAt`, `updatedAt`, `active`, `anonymized` (no old counterpart).
 *
 * `?state=` (new) is compared with the old list filtered on the client, as
 * the old approval screen did (`getPendingLeaves`).
 */
import { diffJson, type AppResponse, type Diff } from './compare.mts';
import { type DiffClass } from './classify.mts';
import { localDate, type MigrationFinding } from './context.mts';

/** The old Angular client's query, verbatim (`leaves.service.ts`). */
export const OLD_LEAVES_QUERY = `
  query LeavesQuery {
    getLeaves {
      id
      startDate
      endDate
      type
      state
      isHalfDay
      numDays
      requester {
        id
        email
        firstName
        surname
      }
      approver {
        id
        email
        firstName
        surname
      }
    }
  }
`;

export const LEAVE_STATES = ['PENDING', 'APPROVED', 'REJECTED'] as const;
export type LeaveStateCode = (typeof LEAVE_STATES)[number];

export interface UserView {
  id: unknown;
  firstName: unknown;
  surname: unknown;
}

/** A leave as the old client modelled it; both answers are reduced to this. */
export interface LeaveView {
  id: string;
  startDate: string | null;
  endDate: string | null;
  type: unknown;
  state: unknown;
  isHalfDay: boolean;
  numDays: unknown;
  requester: UserView | null;
  approver: UserView | null;
}

type Raw = Record<string, unknown>;

const isObject = (v: unknown): v is Raw =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const userView = (u: unknown): UserView | null =>
  isObject(u)
    ? {
        id: u.id ?? null,
        firstName: u.firstName ?? null,
        surname: u.surname ?? null,
      }
    : null;

/** Old GraphQL leave → client model (old `fromGraphQl`). */
export function fromOldLeave(item: Raw, timeZone: string): LeaveView {
  return {
    id: String(item.id),
    startDate: localDate(item.startDate, timeZone),
    endDate: localDate(item.endDate, timeZone),
    type: item.type || 'ANNUAL',
    state: item.state || 'PENDING',
    isHalfDay: Boolean(item.isHalfDay),
    numDays: item.numDays ?? null,
    requester: userView(item.requester),
    approver: userView(item.approver),
  };
}

/** New `LeaveDto` → client model. */
export function fromNewLeave(dto: Raw): LeaveView {
  return {
    id: String(dto.id),
    startDate: typeof dto.startDate === 'string' ? dto.startDate : null,
    endDate: typeof dto.endDate === 'string' ? dto.endDate : null,
    type: dto.type ?? null,
    state: dto.state ?? null,
    isHalfDay: dto.isHalfDay === true,
    numDays: dto.numDays ?? null,
    requester: userView(dto.requester),
    approver: userView(dto.approver),
  };
}

/** One call of the comparison (the same question asked to both apps). */
export interface ListRequest {
  label: string;
  /** User id the session is signed for; `null` = no session. */
  viewer: string | null;
  /** `bad-signature`: signed with a key the app does not know. */
  token: 'valid' | 'bad-signature' | 'none';
  /** New `?state=`; old: client-side filter of the full list. */
  state?: LeaveStateCode;
  /**
   * A refused request: the new app's exact 401 code (old: `getLeaves:
   * null`). Only this code is an expected difference.
   */
  expectDenied?: string;
}

/** The fields an answer carried: union of keys of leaves and of users. */
export interface FieldSet {
  leave: string[];
  user: string[];
}

/** New list order keys (LST-01), parallel to `leaves`, original ids. */
export interface SortKey {
  startDate: string;
  createdAt: string;
  id: string;
}

/** What an answer means, after parsing. */
export type ListOutcome =
  | {
      kind: 'list';
      leaves: LeaveView[];
      fields: FieldSet;
      /** New answers only. */
      sortKeys?: SortKey[];
    }
  /** Old `getLeaves: null` (no user), new 401 with an auth error code. */
  | { kind: 'denied'; detail: string }
  /** Anything else: timeout, network error, unexpected status or body. */
  | { kind: 'other'; detail: string };

export const AUTH_ERROR_CODES = new Set([
  'AUTH_REQUIRED',
  'ACCESS_TOKEN_INVALID',
  'ACCESS_TOKEN_EXPIRED',
  'USER_DEACTIVATED',
]);

const cut = (s: string, n = 300) => (s.length > n ? `${s.slice(0, n)}…` : s);

function parseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false };
  }
}

/** Union of the keys of the raw leaves and of their requester / approver. */
export function fieldSet(leaves: readonly Raw[]): FieldSet {
  const leave = new Set<string>();
  const user = new Set<string>();
  for (const l of leaves) {
    for (const k of Object.keys(l)) leave.add(k);
    for (const u of [l.requester, l.approver])
      if (isObject(u)) for (const k of Object.keys(u)) user.add(k);
  }
  return { leave: [...leave].sort(), user: [...user].sort() };
}

const describe = (r: AppResponse): string =>
  r.kind === 'response'
    ? `${r.status} ${cut(r.body)}`
    : r.kind === 'timeout'
      ? `timeout after ${r.ms} ms`
      : `error: ${r.message}`;

/** Old `POST /graphql` answer → outcome (state filter applied client-side). */
export function parseOld(
  res: AppResponse,
  timeZone: string,
  state?: LeaveStateCode,
): ListOutcome {
  if (res.kind !== 'response' || res.status !== 200)
    return { kind: 'other', detail: describe(res) };
  const json = parseJson(res.body);
  if (!json.ok || !isObject(json.value) || !isObject(json.value.data))
    return { kind: 'other', detail: describe(res) };
  const errors = json.value.errors;
  const leaves = json.value.data.getLeaves;
  if (leaves === null)
    return {
      kind: 'denied',
      detail: `getLeaves: null${errors ? ` ${cut(JSON.stringify(errors))}` : ''}`,
    };
  if (errors !== undefined || !Array.isArray(leaves) || !leaves.every(isObject))
    return { kind: 'other', detail: describe(res) };
  const views = leaves.map((l) => fromOldLeave(l, timeZone));
  return {
    kind: 'list',
    leaves: state ? views.filter((l) => l.state === state) : views,
    fields: fieldSet(leaves),
  };
}

/** New `GET /api/leaves` answer → outcome. */
export function parseNew(res: AppResponse): ListOutcome {
  if (res.kind !== 'response') return { kind: 'other', detail: describe(res) };
  const json = parseJson(res.body);
  if (
    res.status === 200 &&
    json.ok &&
    Array.isArray(json.value) &&
    json.value.every(isObject)
  )
    return {
      kind: 'list',
      leaves: json.value.map(fromNewLeave),
      fields: fieldSet(json.value),
      sortKeys: json.value.map((l) => ({
        startDate: typeof l.startDate === 'string' ? l.startDate : '',
        createdAt: typeof l.createdAt === 'string' ? l.createdAt : '',
        id: String(l.id),
      })),
    };
  if (
    res.status === 401 &&
    json.ok &&
    isObject(json.value) &&
    AUTH_ERROR_CODES.has(String(json.value.code))
  )
    return { kind: 'denied', detail: `401 ${String(json.value.code)}` };
  return { kind: 'other', detail: describe(res) };
}

/** `id`, or `id#2`, `id#3` … for repeated ids (in list order). */
function keyed(leaves: readonly LeaveView[]): Map<string, LeaveView> {
  const out = new Map<string, LeaveView>();
  const seen = new Map<string, number>();
  for (const l of leaves) {
    const n = (seen.get(l.id) ?? 0) + 1;
    seen.set(l.id, n);
    out.set(n === 1 ? l.id : `${l.id}#${n}`, l);
  }
  return out;
}

/**
 * Diff of two outcomes. Lists: per leave id (`leaves.<id>` missing /
 * extra, `leaves.<id>.<field>` values) plus one `order` diff at `$order`
 * when the shared leaves come in a different order. Any other pair of
 * outcomes (denied, other, list vs denied …) is one `outcome` diff at `$`.
 */
export function diffOutcomes(a: ListOutcome, b: ListOutcome): Diff[] {
  if (a.kind !== 'list' || b.kind !== 'list') {
    const show = (o: ListOutcome) =>
      o.kind === 'list'
        ? `list of ${o.leaves.length}`
        : `${o.kind}: ${o.detail}`;
    return [{ kind: 'outcome', path: '$', old: show(a), new: show(b) }];
  }
  const oldBy = keyed(a.leaves);
  const newBy = keyed(b.leaves);
  const out: Diff[] = [];
  for (const [key, view] of oldBy) {
    const other = newBy.get(key);
    if (!other) out.push({ kind: 'missing', path: `leaves.${key}`, old: view });
    else out.push(...diffJson(view, other, `leaves.${key}`));
  }
  for (const [key, view] of newBy)
    if (!oldBy.has(key))
      out.push({ kind: 'extra', path: `leaves.${key}`, new: view });
  // Fields the old answer carried and the new one lacks (only when both
  // carried any leaves / users).
  for (const kind of ['leave', 'user'] as const) {
    if (a.fields[kind].length === 0 || b.fields[kind].length === 0) continue;
    for (const f of a.fields[kind])
      if (!b.fields[kind].includes(f))
        out.push({ kind: 'missing', path: `$fields.${kind}.${f}`, old: f });
  }
  const sharedOld = [...oldBy.keys()].filter((k) => newBy.has(k));
  const sharedNew = [...newBy.keys()].filter((k) => oldBy.has(k));
  if (sharedOld.join('\n') !== sharedNew.join('\n'))
    out.push({ kind: 'order', path: '$order', old: sharedOld, new: sharedNew });
  return out;
}

/** Migration facts the list classifier needs (from the MIG-01 report). */
export interface ListContext {
  /** Leave id → its MIG-01 findings. */
  leaveFindings: ReadonlyMap<string, readonly MigrationFinding[]>;
}

export function listContext(
  findings: readonly MigrationFinding[],
): ListContext {
  const leaveFindings = new Map<string, MigrationFinding[]>();
  for (const f of findings) {
    if (f.collection !== 'leaves' || f.recordId === null) continue;
    leaveFindings.set(f.recordId, [
      ...(leaveFindings.get(f.recordId) ?? []),
      f,
    ]);
  }
  return { leaveFindings };
}

const cmp = (x: string, y: string) => (x < y ? -1 : x > y ? 1 : 0);

/**
 * The new list is exactly in LST-01 order: `startDate` descending, then
 * `createdAt` descending, then `id` ascending.
 */
export function inListOrder(keys: readonly SortKey[]): boolean {
  return keys.every(
    (k, i) =>
      i === 0 ||
      (cmp(k.startDate, keys[i - 1]!.startDate) ||
        cmp(k.createdAt, keys[i - 1]!.createdAt) ||
        cmp(keys[i - 1]!.id, k.id)) < 0,
  );
}

const LEAVE_PATH = /^leaves\.([^.]+)(?:\.(.+))?$/;

/** Class of one list diff, or `null` (unexplained). */
function listClass(
  d: Diff,
  oldOut: ListOutcome,
  newOut: ListOutcome,
  context: ListContext,
  expectDenied: string | undefined,
): DiffClass | null {
  if (d.kind === 'outcome')
    return expectDenied !== undefined &&
      oldOut.kind === 'denied' &&
      newOut.kind === 'denied' &&
      newOut.detail === `401 ${expectDenied}`
      ? 'DENIED_EXPLICIT_ERROR'
      : null;
  if (d.kind === 'order')
    return newOut.kind === 'list' &&
      newOut.sortKeys !== undefined &&
      inListOrder(newOut.sortKeys)
      ? 'LIST_ORDER'
      : null;
  if (d.kind === 'missing' && d.path === '$fields.user.email')
    return 'USER_EMAIL_REMOVED';
  const m = LEAVE_PATH.exec(d.path);
  if (!m) return null;
  const findings = context.leaveFindings.get(m[1]!) ?? [];
  const field = m[2];
  // A leave MIG-01 skipped (and reported) is missing in the new list.
  if (d.kind === 'missing' && field === undefined)
    return findings.some((f) => f.action === 'skipped')
      ? 'MIGRATION_REPORT'
      : null;
  // numDays recomputed by MIG-01 from exactly this old value to this new one.
  if (d.kind === 'value' && field === 'numDays')
    return findings.some(
      (f) =>
        f.code === 'LEAVE_NUMDAYS_CHANGED' &&
        f.details?.old === (d.old ?? null) &&
        f.details?.new === d.new,
    )
      ? 'NUMDAYS_RECOMPUTED'
      : null;
  return null;
}

/** Labels each list diff with its expected class where one applies. */
export function classifyList(
  diffs: readonly Diff[],
  oldOut: ListOutcome,
  newOut: ListOutcome,
  context: ListContext,
  expectDenied?: string,
): Diff[] {
  return diffs.map((d) => {
    const cls = listClass(d, oldOut, newOut, context, expectDenied);
    return cls ? { ...d, class: cls } : d;
  });
}

export interface ViewerUser {
  id?: unknown;
  isAdmin?: unknown;
  approved?: unknown;
}

/**
 * The requests: the full list as every admin, every unapproved user and
 * the first two other users (the list is the same for everyone, the
 * sessions differ); each `?state=` as the first viewer; and the denied
 * cases: no session, a forged signature, an unknown user id and every
 * removed user (MIG-01 placeholder: no user in the old app, deactivated in
 * the new one).
 */
export function listRequests(
  users: readonly ViewerUser[],
  placeholderIds: readonly string[],
): ListRequest[] {
  // Sorted by id: the database returns users in no defined order.
  const real = users
    .filter(
      (u): u is ViewerUser & { id: string } =>
        typeof u.id === 'string' && u.id !== '',
    )
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const admins = real.filter((u) => u.isAdmin === true);
  const unapproved = real.filter(
    (u) => u.isAdmin !== true && u.approved !== true,
  );
  const others = real
    .filter((u) => u.isAdmin !== true && u.approved === true)
    .slice(0, 2);
  const viewers = [
    ...admins.map((u) => ({ id: u.id, role: 'admin' })),
    ...unapproved.map((u) => ({ id: u.id, role: 'unapproved user' })),
    ...others.map((u) => ({ id: u.id, role: 'user' })),
  ];
  const out: ListRequest[] = viewers.map((v) => ({
    label: `list as ${v.role} ${v.id}`,
    viewer: v.id,
    token: 'valid',
  }));
  const first = viewers[0];
  if (first) {
    for (const state of LEAVE_STATES)
      out.push({
        label: `state=${state} as ${first.id}`,
        viewer: first.id,
        token: 'valid',
        state,
      });
    out.push({
      label: `forged signature for ${first.id}`,
      viewer: first.id,
      token: 'bad-signature',
      expectDenied: 'ACCESS_TOKEN_INVALID',
    });
  }
  out.push({
    label: 'no session',
    viewer: null,
    token: 'none',
    expectDenied: 'AUTH_REQUIRED',
  });
  out.push({
    label: 'unknown user parity-unknown-user',
    viewer: 'parity-unknown-user',
    token: 'valid',
    expectDenied: 'ACCESS_TOKEN_INVALID',
  });
  for (const id of placeholderIds)
    out.push({
      label: `removed user ${id}`,
      viewer: id,
      token: 'valid',
      expectDenied: 'USER_DEACTIVATED',
    });
  return out;
}
