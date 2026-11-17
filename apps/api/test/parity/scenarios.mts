/**
 * MIG-03 write scenarios (Track A, writes): the same sequence of create /
 * delete / approve / reject actions, by different users, on both apps.
 * After every step three things are compared (`scenario-harness.mts`):
 *
 * 1. the action's answer, reduced to what the old client selected;
 * 2. the emails each app sent during the step (Mailpit per app), field by
 *    field;
 * 3. the whole leave list of both apps afterwards (`leave-list.mts`), with
 *    the leaves created in the scenario matched by alias (each app makes its
 *    own ids).
 *
 * A difference is excused only where an approved change predicts it
 * exactly: a step names the change and the new app's exact answer
 * (`change`); an email difference must be the exact predicted wording or
 * the exact predicted new email. Everything else is still compared.
 * Pure functions.
 */
import {
  type AppResponse,
  type Diff,
  diffJson,
  jsonEqual,
} from './compare.mts';
import type { DiffClass } from './classify.mts';
import type { LeaveView } from './leave-list.mts';

/**
 * English type labels of functional spec §4 (the oracle for emails; kept
 * here, not imported from the app, and checked against the spec table by
 * `scenarios.spec.ts`).
 */
export const TYPE_LABELS_EN = {
  ANNUAL: 'Annual leave',
  SICKNESS: 'Sick leave',
  DOCTOR: 'Doctor visit',
  MATERNITY: 'Maternity leave',
  PARENTAL: 'Parental leave',
  CARING: 'Caring for a relative at home',
} as const;

/** A leave type code as sent on the wire (`ANNUAL`, …). */
export type TypeCode = keyof typeof TYPE_LABELS_EN;

const label = (code: unknown): string | undefined =>
  Object.hasOwn(TYPE_LABELS_EN, String(code))
    ? TYPE_LABELS_EN[code as TypeCode]
    : undefined;

/** Which leave an action targets. */
export type Target =
  /** A leave created earlier in the scenario. */
  | { alias: string }
  /** The first PENDING leave present in both lists (migrated data). */
  | { firstPending: true }
  /** An id neither app has. */
  | { unknown: true };

export type Action =
  | {
      kind: 'create';
      alias: string;
      startDate: string;
      endDate: string;
      type: TypeCode;
      isHalfDay?: boolean;
      /** What the old client computed and sent (`numWorkDays`). */
      oldNumDays: number;
    }
  | { kind: 'delete' | 'approve' | 'reject'; target: Target };

/** A decided change that makes the two answers differ (§10). */
export interface ExpectedChange {
  class: 'DENIED_EXPLICIT_ERROR' | 'VALIDATION_REJECTED' | 'UNKNOWN_ID_404';
  /** The new app's exact answer. */
  status: number;
  code: string;
}

export interface Step {
  label: string;
  /** User id the session is signed for; `null` = no session. */
  actor: string | null;
  action: Action;
  change?: ExpectedChange;
}

/** Users the scenario acts as (ids of migrated users). */
export interface Roles {
  admin: string;
  user: string;
  other: string;
  unapproved?: string;
  /** A removed user (MIG-01 placeholder). */
  removed?: string;
}

const denied = (status: number, code: string): ExpectedChange => ({
  class: 'DENIED_EXPLICIT_ERROR',
  status,
  code,
});
const invalid = (code: string): ExpectedChange => ({
  class: 'VALIDATION_REJECTED',
  status: 400,
  code,
});

/** The scenario. Dates avoid SK holidays (old and new agree on them). */
export function scenario(r: Roles): Step[] {
  const create = (
    alias: string,
    startDate: string,
    endDate: string,
    type: TypeCode,
    oldNumDays: number,
    isHalfDay = false,
  ): Action => ({
    kind: 'create',
    alias,
    startDate,
    endDate,
    type,
    isHalfDay,
    oldNumDays,
  });
  const steps: (Step | false)[] = [
    {
      label: 'user creates a 5-day annual leave',
      actor: r.user,
      action: create('u1', '2026-11-09', '2026-11-13', 'ANNUAL', 5),
    },
    {
      label: 'user creates a half-day leave',
      actor: r.user,
      action: create('u2', '2026-12-01', '2026-12-01', 'ANNUAL', 0.5, true),
    },
    r.unapproved !== undefined && {
      label: 'unapproved user creates a sickness leave',
      actor: r.unapproved,
      action: create('d1', '2026-12-07', '2026-12-08', 'SICKNESS', 2),
    },
    {
      label: 'user creates a leave ending before it starts',
      actor: r.user,
      action: create('bad-order', '2026-11-20', '2026-11-18', 'ANNUAL', 0),
      change: invalid('LEAVE_END_BEFORE_START'),
    },
    {
      label: 'user creates a half-day leave over two days',
      actor: r.user,
      action: create(
        'bad-half',
        '2026-11-23',
        '2026-11-24',
        'ANNUAL',
        1.5,
        true,
      ),
      change: invalid('LEAVE_HALF_DAY_MULTIPLE_DAYS'),
    },
    {
      label: 'user creates a leave longer than 2 years',
      actor: r.user,
      action: create('too-long', '2026-01-05', '2028-06-30', 'ANNUAL', 640),
      change: invalid('LEAVE_TOO_LONG'),
    },
    {
      label: "other user deletes the user's leave",
      actor: r.other,
      action: { kind: 'delete', target: { alias: 'u1' } },
      change: denied(403, 'FORBIDDEN'),
    },
    {
      label: 'user (not admin) approves a leave',
      actor: r.user,
      action: { kind: 'approve', target: { alias: 'u1' } },
      change: denied(403, 'FORBIDDEN'),
    },
    {
      label: 'admin approves the leave',
      actor: r.admin,
      action: { kind: 'approve', target: { alias: 'u1' } },
    },
    {
      label: 'admin approves the same leave again',
      actor: r.admin,
      action: { kind: 'approve', target: { alias: 'u1' } },
    },
    {
      label: 'admin rejects the half-day leave',
      actor: r.admin,
      action: { kind: 'reject', target: { alias: 'u2' } },
    },
    {
      label: 'admin approves an unknown id',
      actor: r.admin,
      action: { kind: 'approve', target: { unknown: true } },
      change: { class: 'UNKNOWN_ID_404', status: 404, code: 'LEAVE_NOT_FOUND' },
    },
    {
      label: 'admin creates an own leave',
      actor: r.admin,
      action: create('a1', '2026-12-14', '2026-12-14', 'DOCTOR', 1),
    },
    {
      label: 'admin approves the own leave',
      actor: r.admin,
      action: { kind: 'approve', target: { alias: 'a1' } },
    },
    {
      label: 'admin approves a migrated PENDING leave',
      actor: r.admin,
      action: { kind: 'approve', target: { firstPending: true } },
    },
    {
      label: 'user deletes the own approved leave',
      actor: r.user,
      action: { kind: 'delete', target: { alias: 'u1' } },
    },
    {
      label: 'user deletes the same leave again',
      actor: r.user,
      action: { kind: 'delete', target: { alias: 'u1' } },
      change: denied(404, 'LEAVE_NOT_FOUND'),
    },
    {
      label: "admin deletes another user's leave",
      actor: r.admin,
      action: { kind: 'delete', target: { alias: 'u2' } },
    },
    r.removed !== undefined && {
      label: 'removed user creates a leave',
      actor: r.removed,
      action: create('r1', '2026-12-15', '2026-12-15', 'ANNUAL', 1),
      change: denied(401, 'USER_DEACTIVATED'),
    },
    {
      label: 'no session creates a leave',
      actor: null,
      action: create('n1', '2026-12-16', '2026-12-16', 'ANNUAL', 1),
      change: denied(401, 'AUTH_REQUIRED'),
    },
    {
      label: 'no session rejects a leave',
      actor: null,
      action: { kind: 'reject', target: { alias: 'a1' } },
      change: denied(401, 'AUTH_REQUIRED'),
    },
  ];
  return steps.filter((s): s is Step => s !== false);
}

// ---------------------------------------------------------------- answers

/** The old client's mutations, verbatim (`leaves.service.ts`). */
export const OLD_MUTATIONS = {
  create: `
  mutation addLeaveMutation($leave: LeaveInput) {
    createLeave(leave: $leave) {
      id
    }
  }
`,
  delete: `
  mutation removeLeaveMutation($id: ID!) {
    removeLeave(id: $id) {
      success
    }
  }
`,
  approve: `
  mutation approveLeaveMutation($id: String!) {
    approveLeave(id: $id) {
      id
      state
      approver {
        id
        email
        firstName
        surname
      }
    }
  }
`,
  reject: `
  mutation rejectLeaveMutation($id: String!) {
    rejectLeave(id: $id) {
      id
      state
      approver {
        id
        email
        firstName
        surname
      }
    }
  }
`,
} as const;

export const OLD_OPERATION = {
  create: { field: 'createLeave', name: 'addLeaveMutation' },
  delete: { field: 'removeLeave', name: 'removeLeaveMutation' },
  approve: { field: 'approveLeave', name: 'approveLeaveMutation' },
  reject: { field: 'rejectLeave', name: 'rejectLeaveMutation' },
} as const;

/** The fields of the answer the old client read. */
export interface ActionResult {
  /** Created / decided leave id (create, approve, reject). */
  id?: string;
  state?: unknown;
  approver?: {
    id: unknown;
    firstName: unknown;
    surname: unknown;
    /** Only when the answer carried it (old). */
    email?: unknown;
  } | null;
}

export type ActionOutcome =
  | { kind: 'ok'; result: ActionResult }
  /** Old `null` result; new 4xx with an error code. */
  | { kind: 'refused'; detail: string }
  /**
   * Old approve / reject of an unknown id: the resolver built an empty
   * leave (§10 #10) that GraphQL could not return (`id` is non-null).
   */
  | { kind: 'phantom'; detail: string }
  | { kind: 'other'; detail: string };

type Raw = Record<string, unknown>;
const isObject = (v: unknown): v is Raw =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const cut = (s: string, n = 300) => (s.length > n ? `${s.slice(0, n)}…` : s);

const describe = (r: AppResponse): string =>
  r.kind === 'response'
    ? `${r.status} ${cut(r.body)}`
    : r.kind === 'timeout'
      ? `timeout after ${r.ms} ms`
      : `error: ${r.message}`;

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
};

const approverView = (a: unknown): ActionResult['approver'] =>
  isObject(a)
    ? {
        id: a.id ?? null,
        firstName: a.firstName ?? null,
        surname: a.surname ?? null,
        ...('email' in a ? { email: a.email } : {}),
      }
    : null;

/** Old GraphQL mutation answer → outcome. */
export function parseOldAction(
  kind: Action['kind'],
  res: AppResponse,
): ActionOutcome {
  if (res.kind !== 'response' || res.status !== 200)
    return { kind: 'other', detail: describe(res) };
  const json = parseJson(res.body);
  if (!isObject(json) || !isObject(json.data))
    return { kind: 'other', detail: describe(res) };
  const value = json.data[OLD_OPERATION[kind].field];
  const errors = Array.isArray(json.errors) ? json.errors : [];
  const messages = errors.map((e) => String(isObject(e) ? e.message : e));
  if (value === null) {
    if (
      (kind === 'approve' || kind === 'reject') &&
      messages.some((m) => m.includes('non-nullable field Leave.id'))
    )
      return { kind: 'phantom', detail: `null (${messages.join('; ')})` };
    if (errors.length === 0) return { kind: 'refused', detail: 'null' };
    return { kind: 'other', detail: describe(res) };
  }
  if (errors.length > 0 || !isObject(value))
    return { kind: 'other', detail: describe(res) };
  if (kind === 'delete')
    return value.success === true
      ? { kind: 'ok', result: {} }
      : { kind: 'other', detail: describe(res) };
  if (kind === 'create')
    return { kind: 'ok', result: { id: String(value.id) } };
  return {
    kind: 'ok',
    result: {
      id: String(value.id),
      state: value.state ?? null,
      approver: approverView(value.approver),
    },
  };
}

const SUCCESS: Record<Action['kind'], number> = {
  create: 201,
  delete: 204,
  approve: 200,
  reject: 200,
};

/** New REST answer → outcome (only the fields the old client read). */
export function parseNewAction(
  kind: Action['kind'],
  res: AppResponse,
): ActionOutcome {
  if (res.kind !== 'response') return { kind: 'other', detail: describe(res) };
  const json = parseJson(res.body);
  if (res.status === SUCCESS[kind]) {
    if (kind === 'delete') return { kind: 'ok', result: {} };
    if (!isObject(json)) return { kind: 'other', detail: describe(res) };
    if (kind === 'create')
      return { kind: 'ok', result: { id: String(json.id) } };
    return {
      kind: 'ok',
      result: {
        id: String(json.id),
        state: json.state ?? null,
        approver: approverView(json.approver),
      },
    };
  }
  if (
    res.status >= 400 &&
    res.status < 500 &&
    isObject(json) &&
    typeof json.code === 'string'
  )
    return { kind: 'refused', detail: `${res.status} ${json.code}` };
  return { kind: 'other', detail: describe(res) };
}

const show = (o: ActionOutcome) =>
  o.kind === 'ok' ? 'ok' : `${o.kind}: ${o.detail}`;

/**
 * Diff of the two answers. Both ok: the fields the old client read (ids as
 * aliases, see `aliasOf`). Otherwise one `outcome` diff at `$result`.
 */
export function diffActions(
  a: ActionOutcome,
  b: ActionOutcome,
  aliasOf: (side: 'old' | 'new', id: string) => string,
): Diff[] {
  if (a.kind !== 'ok' || b.kind !== 'ok')
    return [{ kind: 'outcome', path: '$result', old: show(a), new: show(b) }];
  const norm = (side: 'old' | 'new', r: ActionResult): ActionResult =>
    r.id === undefined ? r : { ...r, id: aliasOf(side, r.id) };
  return diffJson(norm('old', a.result), norm('new', b.result), '$result');
}

/**
 * Class of a field diff of two successful answers: only the approver email
 * the old answer carried and the new one does not (§10 #31).
 */
export function resultFieldClass(d: Diff): DiffClass | null {
  return d.kind === 'missing' && d.path === '$result.approver.email'
    ? 'USER_EMAIL_REMOVED'
    : null;
}

/** Old behavior each change replaces. */
const OLD_SIDE: Record<ExpectedChange['class'], ActionOutcome['kind']> = {
  DENIED_EXPLICIT_ERROR: 'refused',
  VALIDATION_REJECTED: 'ok',
  UNKNOWN_ID_404: 'phantom',
};

/**
 * Class of the `$result` outcome diff: the step's change, only when the old
 * answer shows the old behavior and the new answer is exactly the
 * predicted one.
 */
export function actionClass(
  step: Step,
  a: ActionOutcome,
  b: ActionOutcome,
): DiffClass | null {
  const c = step.change;
  if (!c) return null;
  return a.kind === OLD_SIDE[c.class] &&
    b.kind === 'refused' &&
    b.detail === `${c.status} ${c.code}`
    ? c.class
    : null;
}

// ----------------------------------------------------------------- emails

/** An email reduced to its parts (HTML parsed). */
export interface MailView {
  to: string[];
  subject: string;
  heading: string | null;
  /** `<b>Label: </b>value<br>` pairs. */
  fields: Record<string, string>;
  link: { text: string; href: string } | null;
}

const decode = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');

export function mailView(
  to: string[],
  subject: string,
  html: string,
): MailView {
  const fields: Record<string, string> = {};
  for (const m of html.matchAll(/<b>\s*([^<:]+?)\s*:\s*<\/b>([^<]*)<br>/g))
    fields[decode(m[1]!)] = decode(m[2]!).trim();
  const heading = /<h4>([\s\S]*?)<\/h4>/.exec(html);
  const link = /<a href="([^"]*)">([^<]*)<\/a>/.exec(html);
  return {
    to: to.map((t) => t.toLowerCase()).sort(),
    subject,
    heading: heading ? decode(heading[1]!).trim() : null,
    fields,
    link: link ? { text: decode(link[2]!), href: decode(link[1]!) } : null,
  };
}

const mailKey = (m: MailView) => `${m.subject} → ${m.to.join(', ')}`;

/** Mails matched by subject and recipients; fields diffed at `$mails.<key>`. */
export function diffMails(
  a: readonly MailView[],
  b: readonly MailView[],
): Diff[] {
  const out: Diff[] = [];
  const rest = [...b];
  for (const m of a) {
    const i = rest.findIndex((n) => mailKey(n) === mailKey(m));
    const path = `$mails.${mailKey(m)}`;
    if (i < 0) out.push({ kind: 'missing', path, old: m });
    else out.push(...diffJson(m, rest.splice(i, 1)[0], path));
  }
  for (const n of rest)
    out.push({ kind: 'extra', path: `$mails.${mailKey(n)}`, new: n });
  return out;
}

/** `Monday, Nov 9, 2026` (old `dddd, MMM D, YYYY`), independent of the app code. */
export function mailDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export const OLD_PENDING_HEADING =
  'New leave was created and need to be approved.';
export const NEW_PENDING_HEADING =
  'New leave was created and needs to be approved.';

/**
 * Class of a value diff inside the new-leave email: only the three wording
 * changes of §10 #14, each exactly (heading typo, readable type, link to
 * `/approval` instead of production's `/leaves/approval`).
 */
export function pendingMailClass(d: Diff, baseUrl: string): DiffClass | null {
  if (d.kind !== 'value' || !d.path.startsWith('$mails.New leave notification'))
    return null;
  const field = d.path.slice(d.path.lastIndexOf('.') + 1);
  const ok =
    (field === 'heading' &&
      d.old === OLD_PENDING_HEADING &&
      d.new === NEW_PENDING_HEADING) ||
    (d.path.endsWith('.fields.Type') && d.new === label(d.old)) ||
    (d.path.endsWith('.link.href') &&
      d.old === `${baseUrl}/leaves/approval` &&
      d.new === `${baseUrl}/approval`);
  return ok ? 'NEW_LEAVE_EMAIL_WORDING' : null;
}

/** The requester email the new app must send for a real state change (NOT-03). */
export function decisionMail(input: {
  decision: 'approve' | 'reject';
  leave: Pick<LeaveView, 'startDate' | 'endDate' | 'type'>;
  requesterEmail: string;
  admin: { firstName: string; surname: string };
  baseUrl: string;
}): MailView {
  const word = input.decision === 'approve' ? 'approved' : 'rejected';
  const by = input.decision === 'approve' ? 'Approved by' : 'Rejected by';
  return {
    to: [input.requesterEmail.toLowerCase()],
    subject: `Your leave was ${word}`,
    heading: `Your leave was ${word}.`,
    fields: {
      Days: `${mailDate(String(input.leave.startDate))} - ${mailDate(String(input.leave.endDate))}`,
      Type: label(input.leave.type) ?? String(input.leave.type),
      [by]: `${input.admin.firstName} ${input.admin.surname}`,
    },
    link: { text: 'Open leaves', href: `${input.baseUrl}/leaves` },
  };
}

/** Class of an `extra` new email: the predicted NOT-03 email, exactly. */
export function extraMailClass(
  d: Diff,
  predicted: MailView | null,
): DiffClass | null {
  if (d.kind !== 'extra' || !d.path.startsWith('$mails.') || !predicted)
    return null;
  return jsonEqual(d.new, predicted) ? 'REQUESTER_DECISION_EMAIL' : null;
}

/**
 * Class of a `missing` new-leave email: the step's create was refused as
 * predicted (VALIDATION_REJECTED), so the new app sends no email; only the
 * old email for exactly this leave (requester, date range) is excused.
 */
export function rejectedCreateMailClass(
  d: Diff,
  rejected: { requester: string; startDate: string; endDate: string } | null,
): DiffClass | null {
  if (!rejected || d.kind !== 'missing') return null;
  if (!d.path.startsWith('$mails.New leave notification')) return null;
  const old = d.old as MailView | undefined;
  return old?.fields.Requester === rejected.requester &&
    old.fields.Days ===
      `${mailDate(rejected.startDate)} - ${mailDate(rejected.endDate)}`
    ? 'VALIDATION_REJECTED'
    : null;
}
