/**
 * MIG-03 write-scenario loop (`scenarios.mts`): for each step, empty both
 * mailboxes, run the action on both apps as the step's user, then compare
 * the answers, the emails sent and the whole leave list afterwards.
 */
import type { AppResponse, Diff } from './compare.mts';
import { type EntryStatus, statusOf } from './classify.mts';
import { fetchApp } from './harness.mts';
import {
  classifyList,
  diffOutcomes,
  type LeaveView,
  type ListContext,
  type ListOutcome,
  parseNew,
  parseOld,
} from './leave-list.mts';
import { callNewList, callOldList } from './list-harness.mts';
import {
  type Action,
  actionClass,
  type ActionOutcome,
  decisionMail,
  diffActions,
  diffMails,
  extraMailClass,
  mailView,
  type MailView,
  OLD_MUTATIONS,
  OLD_OPERATION,
  parseNewAction,
  parseOldAction,
  pendingMailClass,
  rejectedCreateMailClass,
  resultFieldClass,
  type Step,
} from './scenarios.mts';
import { localMidnight } from './synthetic.mts';
import { newAppToken, oldAppToken } from './tokens.mts';

export interface ScenarioUser {
  email: string;
  firstName: string;
  surname: string;
}

export interface ScenarioRunOptions {
  oldUrl: string;
  newUrl: string;
  /** Mailpit API base URL per app. */
  mail: { old: string; new: string };
  /** `BASE_URL` of both apps (the same value). */
  baseUrl: string;
  keys: { old: string; new: string };
  timeZone: string;
  steps: readonly Step[];
  /** Admin whose session reads the lists after each step. */
  observer: string;
  /** Migrated real users by id (placeholders excluded). */
  users: ReadonlyMap<string, ScenarioUser>;
  context: ListContext;
  timeoutMs?: number;
  log?: (line: string) => void;
}

export interface ScenarioEntry {
  step: string;
  actor: string | null;
  status: EntryStatus;
  old: string;
  new: string;
  mails: { old: number; new: number };
  diffs: Diff[];
  error?: string;
}

export interface ScenarioResult {
  entries: ScenarioEntry[];
  passed: boolean;
}

const UNKNOWN_ID = 'parity-unknown-leave';
/** Target alias that app never created (its create was refused). */
const MISSING_ID = 'parity-not-created-leave';

// ------------------------------------------------------------ app calls

function oldAction(
  o: ScenarioRunOptions,
  step: Step,
  id: string | null,
  timeoutMs: number,
): Promise<AppResponse> {
  const a = step.action;
  const variables =
    a.kind === 'create'
      ? {
          leave: {
            startDate: localMidnight(a.startDate),
            endDate: localMidnight(a.endDate),
            type: a.type,
            isHalfDay: a.isHalfDay ?? false,
            numDays: a.oldNumDays,
          },
        }
      : { id };
  return fetchApp(
    `${o.oldUrl}/graphql`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(step.actor === null
          ? {}
          : { Authorization: `Bearer ${oldAppToken(step.actor, o.keys.old)}` }),
      },
      body: JSON.stringify({
        operationName: OLD_OPERATION[a.kind].name,
        variables,
        query: OLD_MUTATIONS[a.kind],
      }),
    },
    timeoutMs,
  );
}

function newAction(
  o: ScenarioRunOptions,
  step: Step,
  id: string | null,
  timeoutMs: number,
): Promise<AppResponse> {
  const a = step.action;
  const auth: Record<string, string> =
    step.actor === null
      ? {}
      : { Authorization: `Bearer ${newAppToken(step.actor, o.keys.new)}` };
  if (a.kind === 'create')
    return fetchApp(
      `${o.newUrl}/api/leaves`,
      {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDate: a.startDate,
          endDate: a.endDate,
          type: a.type,
          isHalfDay: a.isHalfDay ?? false,
        }),
      },
      timeoutMs,
    );
  const path = `${o.newUrl}/api/leaves/${encodeURIComponent(id ?? '')}`;
  if (a.kind === 'delete')
    return fetchApp(path, { method: 'DELETE', headers: auth }, timeoutMs);
  return fetchApp(
    `${path}/${a.kind}`,
    { method: 'POST', headers: auth },
    timeoutMs,
  );
}

// -------------------------------------------------------------- mailboxes

async function mailpit<T>(base: string, path: string, init?: RequestInit) {
  const res = await fetch(`${base}${path}`, init);
  if (!res.ok) throw new Error(`mailpit ${path}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

const clearMailbox = (base: string) =>
  fetch(`${base}/api/v1/messages`, { method: 'DELETE' }).then((r) => {
    if (!r.ok) throw new Error(`mailpit clear: HTTP ${r.status}`);
  });

const mailCount = async (base: string) =>
  (await mailpit<{ total: number }>(base, '/api/v1/messages?limit=1')).total;

/** Waits until neither mailbox changes for 1 s (emails are sent async). */
async function settleMail(bases: readonly string[]): Promise<void> {
  const deadline = Date.now() + 10_000;
  let last = '';
  let stableSince = Date.now();
  for (;;) {
    const now = (await Promise.all(bases.map(mailCount))).join(',');
    if (now !== last) {
      last = now;
      stableSince = Date.now();
    } else if (Date.now() - stableSince >= 1_000) return;
    if (Date.now() > deadline) return;
    await new Promise((r) => setTimeout(r, 200));
  }
}

async function readMails(base: string): Promise<MailView[]> {
  const list = await mailpit<{ messages: { ID: string }[] }>(
    base,
    '/api/v1/messages?limit=100',
  );
  const out: MailView[] = [];
  for (const { ID } of list.messages) {
    const m = await mailpit<{
      To: { Address: string }[];
      Subject: string;
      HTML: string;
    }>(base, `/api/v1/message/${ID}`);
    out.push(
      mailView(
        m.To.map((t) => t.Address),
        m.Subject,
        m.HTML,
      ),
    );
  }
  return out;
}

// ------------------------------------------------------------------ loop

interface Ids {
  old?: string;
  new?: string;
}

export async function runScenarios(
  o: ScenarioRunOptions,
): Promise<ScenarioResult> {
  const timeoutMs = o.timeoutMs ?? 120_000;
  const log = o.log ?? (() => undefined);
  const aliases = new Map<string, Ids>();
  /** Aliases whose create the new app refused as predicted (§10 #1, #3). */
  const rejected = new Set<string>();

  const aliasOf = (side: 'old' | 'new', id: string): string => {
    for (const [alias, ids] of aliases)
      if (ids[side] === id) return `@${alias}`;
    return id;
  };
  const withAliases = (side: 'old' | 'new', out: ListOutcome): ListOutcome =>
    out.kind === 'list'
      ? {
          ...out,
          leaves: out.leaves.map((l) => ({ ...l, id: aliasOf(side, l.id) })),
        }
      : out;

  const readState = async () => {
    const req = { label: 'state', viewer: o.observer, token: 'valid' } as const;
    const [a, b] = await Promise.all([
      callOldList(o.oldUrl, req, o.keys.old, timeoutMs),
      callNewList(o.newUrl, req, o.keys.new, timeoutMs),
    ]);
    return {
      old: withAliases('old', parseOld(a, o.timeZone)),
      new: withAliases('new', parseNew(b)),
    };
  };

  let state = await readState();
  const entries: ScenarioEntry[] = [];

  for (const step of o.steps) {
    const a: Action = step.action;
    try {
      // Target ids per app.
      let ids: Ids = {};
      if (a.kind !== 'create') {
        if ('alias' in a.target) ids = aliases.get(a.target.alias) ?? {};
        else if ('unknown' in a.target)
          ids = { old: UNKNOWN_ID, new: UNKNOWN_ID };
        else ids = firstPending(state.old, state.new);
      }
      const before =
        state.new.kind === 'list'
          ? state.new.leaves.find(
              (l) => ids.new !== undefined && l.id === aliasOf('new', ids.new),
            )
          : undefined;

      await Promise.all([clearMailbox(o.mail.old), clearMailbox(o.mail.new)]);
      const [oldRes, newRes] = await Promise.all([
        oldAction(o, step, ids.old ?? MISSING_ID, timeoutMs),
        newAction(o, step, ids.new ?? MISSING_ID, timeoutMs),
      ]);
      const oldOut: ActionOutcome = parseOldAction(a.kind, oldRes);
      const newOut: ActionOutcome = parseNewAction(a.kind, newRes);
      if (a.kind === 'create') {
        const created: Ids = {};
        if (oldOut.kind === 'ok') created.old = oldOut.result.id;
        if (newOut.kind === 'ok') created.new = newOut.result.id;
        aliases.set(a.alias, created);
      }

      // 1. The answers.
      const actionDiffs = diffActions(oldOut, newOut, aliasOf).map((d) => {
        const cls =
          d.kind === 'outcome'
            ? actionClass(step, oldOut, newOut)
            : resultFieldClass(d);
        return cls ? { ...d, class: cls } : d;
      });
      if (
        a.kind === 'create' &&
        actionDiffs.some((d) => d.class === 'VALIDATION_REJECTED')
      )
        rejected.add(a.alias);

      // 2. The emails.
      await settleMail([o.mail.old, o.mail.new]);
      const [oldMails, newMails] = await Promise.all([
        readMails(o.mail.old),
        readMails(o.mail.new),
      ]);
      const predicted =
        (a.kind === 'approve' || a.kind === 'reject') &&
        newOut.kind === 'ok' &&
        step.actor !== null
          ? predictDecisionMail(o, a.kind, before, step.actor)
          : null;
      const actor = step.actor === null ? undefined : o.users.get(step.actor);
      const refusedCreate =
        a.kind === 'create' && rejected.has(a.alias) && actor
          ? {
              requester: `${actor.firstName} ${actor.surname}`,
              startDate: a.startDate,
              endDate: a.endDate,
            }
          : null;
      const mailDiffs = diffMails(oldMails, newMails).map((d) => {
        const cls =
          pendingMailClass(d, o.baseUrl) ??
          extraMailClass(d, predicted) ??
          rejectedCreateMailClass(d, refusedCreate);
        return cls ? { ...d, class: cls } : d;
      });

      // 3. The leave list afterwards.
      state = await readState();
      const stateDiffs = classifyList(
        diffOutcomes(state.old, state.new),
        state.old,
        state.new,
        o.context,
      ).map((d) => {
        const m = /^leaves\.@([^.]+)$/.exec(d.path);
        return !d.class && d.kind === 'missing' && m && rejected.has(m[1]!)
          ? { ...d, class: 'VALIDATION_REJECTED' }
          : d;
      });

      const diffs = [...actionDiffs, ...mailDiffs, ...stateDiffs];
      const error =
        oldRes.kind === 'error' || newRes.kind === 'error'
          ? `app call failed: old ${oldRes.kind}, new ${newRes.kind}`
          : state.old.kind !== 'list' || state.new.kind !== 'list'
            ? 'could not read the leave list after the step'
            : undefined;
      const status: EntryStatus = error ? 'ERROR' : statusOf(diffs);
      const show = (x: ActionOutcome) =>
        x.kind === 'ok' ? 'ok' : `${x.kind}: ${x.detail}`;
      entries.push({
        step: step.label,
        actor: step.actor,
        status,
        old: show(oldOut),
        new: show(newOut),
        mails: { old: oldMails.length, new: newMails.length },
        diffs,
        ...(error ? { error } : {}),
      });
      log(
        `scenario ${step.label}: ${status}${diffs.length ? ` (${diffs.length} diffs)` : ''}${error ? ` ${error}` : ''}`,
      );
    } catch (err) {
      entries.push({
        step: step.label,
        actor: step.actor,
        status: 'ERROR',
        old: '–',
        new: '–',
        mails: { old: 0, new: 0 },
        diffs: [],
        error: String(err),
      });
      log(`scenario ${step.label}: ERROR ${String(err)}`);
    }
  }
  const passed =
    entries.length > 0 &&
    entries.every((e) => e.status === 'EQUAL' || e.status === 'EXPECTED_DIFF');
  return { entries, passed };
}

/** First leave that is PENDING in both lists (migrated, not an alias). */
function firstPending(a: ListOutcome, b: ListOutcome): Ids {
  if (a.kind !== 'list' || b.kind !== 'list') return {};
  const inNew = new Map(b.leaves.map((l) => [l.id, l]));
  const hit = a.leaves.find(
    (l) =>
      !l.id.startsWith('@') &&
      l.state === 'PENDING' &&
      inNew.get(l.id)?.state === 'PENDING',
  );
  return hit ? { old: hit.id, new: hit.id } : {};
}

/**
 * NOT-03: the new app emails the requester when the state really changes
 * and the requester is a real (active) user; `null` = no email expected.
 */
function predictDecisionMail(
  o: ScenarioRunOptions,
  kind: 'approve' | 'reject',
  before: LeaveView | undefined,
  actor: string,
): MailView | null {
  if (!before) return null;
  const decision = kind === 'approve' ? 'APPROVED' : 'REJECTED';
  if (before.state === decision) return null;
  const requester = o.users.get(String(before.requester?.id));
  const admin = o.users.get(actor);
  if (!requester || !admin) return null;
  return decisionMail({
    decision: kind,
    leave: before,
    requesterEmail: requester.email,
    admin,
    baseUrl: o.baseUrl,
  });
}
