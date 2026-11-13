import { describe, expect, it } from 'vitest';
import type { AppResponse } from './compare.mts';
import type { MigrationFinding } from './context.mts';
import {
  classifyList,
  diffOutcomes,
  fromOldLeave,
  type LeaveView,
  listContext,
  listRequests,
  type ListOutcome,
  parseNew,
  parseOld,
} from './leave-list.mts';

const TZ = 'Europe/Bratislava';

const res = (status: number, body: unknown): AppResponse => ({
  kind: 'response',
  status,
  contentType: 'application/json',
  acao: null,
  body: typeof body === 'string' ? body : JSON.stringify(body),
  ms: 5,
});

const anna = { id: '1001', firstName: 'Anna', surname: 'Nováková' };

/** Old GraphQL leave (instants at local midnight, user with email). */
const oldLeave = (over: Record<string, unknown> = {}) => ({
  id: 'l-1',
  startDate: '2024-03-10T23:00:00.000Z',
  endDate: '2024-03-11T23:00:00.000Z',
  type: 'ANNUAL',
  state: 'APPROVED',
  isHalfDay: null,
  numDays: 2,
  requester: { ...anna, email: 'anna@example.test' },
  approver: { ...anna, email: 'anna@example.test' },
  ...over,
});

/** New LeaveDto. */
const newLeave = (over: Record<string, unknown> = {}) => ({
  id: 'l-1',
  requester: { ...anna, active: true, anonymized: false },
  approver: { ...anna, active: true, anonymized: false },
  startDate: '2024-03-11',
  endDate: '2024-03-12',
  isHalfDay: false,
  type: 'ANNUAL',
  state: 'APPROVED',
  numDays: 2,
  createdAt: '2018-02-09T00:00:00.000Z',
  updatedAt: '2018-02-09T00:00:00.000Z',
  ...over,
});

const oldList = (...leaves: unknown[]) =>
  res(200, { data: { getLeaves: leaves } });

const NO_FIELDS = { leave: [], user: [] };

const list = (...leaves: LeaveView[]): ListOutcome => ({
  kind: 'list',
  leaves,
  fields: NO_FIELDS,
});

/** A new-app list with its LST-01 sort keys (createdAt per leave). */
const newList = (
  leaves: LeaveView[],
  createdAt: string[] = leaves.map(() => '2020-01-01T00:00:00.000Z'),
): ListOutcome => ({
  kind: 'list',
  leaves,
  fields: NO_FIELDS,
  sortKeys: leaves.map((l, i) => ({
    startDate: l.startDate ?? '',
    createdAt: createdAt[i]!,
    id: l.id,
  })),
});

describe('old client model (MIG-03 leave list)', () => {
  it('reduces an old GraphQL leave like the old client did', () => {
    expect(
      fromOldLeave(oldLeave({ type: null, state: null, isHalfDay: true }), TZ),
    ).toEqual({
      id: 'l-1',
      startDate: '2024-03-11',
      endDate: '2024-03-12',
      type: 'ANNUAL',
      state: 'PENDING',
      isHalfDay: true,
      numDays: 2,
      requester: anna,
      approver: anna,
    });
  });

  it('compares an old and a new answer for the same leave as equal, but for the dropped email', () => {
    const a = parseOld(oldList(oldLeave()), TZ);
    const b = parseNew(res(200, [newLeave()]));
    const diffs = classifyList(diffOutcomes(a, b), a, b, listContext([]));
    expect(diffs).toEqual([
      {
        kind: 'missing',
        path: '$fields.user.email',
        old: 'email',
        class: 'USER_EMAIL_REMOVED',
      },
    ]);
  });

  it('reports any other field the new answer lacks, unexplained', () => {
    const a = parseOld(oldList(oldLeave()), TZ);
    const withoutNumDays: Record<string, unknown> = newLeave();
    delete withoutNumDays.numDays;
    const b = parseNew(res(200, [withoutNumDays]));
    const diffs = classifyList(diffOutcomes(a, b), a, b, listContext([]));
    expect(
      diffs
        .filter((d) => d.path.startsWith('$fields'))
        .map((d) => [d.path, d.class]),
    ).toEqual([
      ['$fields.leave.numDays', undefined],
      ['$fields.user.email', 'USER_EMAIL_REMOVED'],
    ]);
  });

  it('keeps a missing approver as null on both sides', () => {
    const a = parseOld(oldList(oldLeave({ approver: null })), TZ);
    const b = parseNew(res(200, [newLeave({ approver: null })]));
    expect(
      diffOutcomes(a, b).filter((d) => !d.path.startsWith('$fields')),
    ).toEqual([]);
  });

  it('filters the old list on the client for ?state=', () => {
    const out = parseOld(
      oldList(oldLeave(), oldLeave({ id: 'l-2', state: null })),
      TZ,
      'PENDING',
    );
    expect(out.kind === 'list' && out.leaves.map((l) => l.id)).toEqual(['l-2']);
  });

  it('reads old getLeaves: null as denied, with or without errors', () => {
    expect(parseOld(res(200, { data: { getLeaves: null } }), TZ)).toEqual({
      kind: 'denied',
      detail: 'getLeaves: null',
    });
    expect(
      parseOld(
        res(200, {
          errors: [{ message: "Cannot read property 'user' of undefined" }],
          data: { getLeaves: null },
        }),
        TZ,
      ).kind,
    ).toBe('denied');
  });

  it('reads a new 401 with an auth code as denied, anything else as other', () => {
    expect(
      parseNew(
        res(401, { statusCode: 401, code: 'AUTH_REQUIRED', message: 'x' }),
      ),
    ).toEqual({ kind: 'denied', detail: '401 AUTH_REQUIRED' });
    expect(parseNew(res(500, { message: 'x' })).kind).toBe('other');
    expect(parseNew({ kind: 'timeout', ms: 1 }).kind).toBe('other');
    expect(
      parseOld(res(200, { errors: [{}], data: { getLeaves: [] } }), TZ).kind,
    ).toBe('other');
  });
});

describe('leave-list diff and classes (MIG-03)', () => {
  const v = (id: string, startDate: string, over: Partial<LeaveView> = {}) =>
    ({
      id,
      startDate,
      endDate: startDate,
      type: 'ANNUAL',
      state: 'APPROVED',
      isHalfDay: false,
      numDays: 1,
      requester: anna,
      approver: anna,
      ...over,
    }) satisfies LeaveView;

  const finding = (over: Partial<MigrationFinding>): MigrationFinding => ({
    code: 'X',
    collection: 'leaves',
    recordId: 'l-1',
    action: 'migrated',
    ...over,
  });

  const orderClass = (a: ListOutcome, b: ListOutcome) =>
    classifyList(diffOutcomes(a, b), a, b, listContext([])).find(
      (d) => d.kind === 'order',
    )?.class;

  it('classifies a reorder into the exact LST-01 order as LIST_ORDER', () => {
    const a = list(v('l-1', '2024-01-01'), v('l-2', '2024-02-01'));
    const b = newList([v('l-2', '2024-02-01'), v('l-1', '2024-01-01')]);
    expect(orderClass(a, b)).toBe('LIST_ORDER');
  });

  it('checks the tie-breakers: createdAt descending, then id ascending', () => {
    const a = list(v('l-1', '2024-01-01'), v('l-2', '2024-01-01'));
    // Same start: the later createdAt first.
    expect(
      orderClass(
        a,
        newList(
          [v('l-2', '2024-01-01'), v('l-1', '2024-01-01')],
          ['2020-01-02T00:00:00.000Z', '2020-01-01T00:00:00.000Z'],
        ),
      ),
    ).toBe('LIST_ORDER');
    // Same start and createdAt: ids ascending, so l-2 before l-1 is wrong.
    expect(
      orderClass(a, newList([v('l-2', '2024-01-01'), v('l-1', '2024-01-01')])),
    ).toBeUndefined();
  });

  it('leaves a reorder into any other order unexplained', () => {
    const a = list(v('l-2', '2024-02-01'), v('l-1', '2024-01-01'));
    const b = newList([v('l-1', '2024-01-01'), v('l-2', '2024-02-01')]);
    expect(orderClass(a, b)).toBeUndefined();
  });

  it('explains a numDays change only by the matching MIG-01 finding', () => {
    const a = list(v('l-1', '2024-01-01', { numDays: 2 }));
    const b = list(v('l-1', '2024-01-01', { numDays: 1 }));
    const ctx = (details: Record<string, unknown>) =>
      listContext([finding({ code: 'LEAVE_NUMDAYS_CHANGED', details })]);
    expect(
      classifyList(diffOutcomes(a, b), a, b, ctx({ old: 2, new: 1 }))[0]!.class,
    ).toBe('NUMDAYS_RECOMPUTED');
    expect(
      classifyList(diffOutcomes(a, b), a, b, ctx({ old: 2, new: 3 }))[0]!.class,
    ).toBeUndefined();
  });

  it('explains a missing leave only when MIG-01 reports it skipped', () => {
    const a = list(v('l-1', '2024-01-01'));
    const b = list();
    const skipped = listContext([
      finding({ code: 'LEAVE_HALF_DAY_MULTIPLE_DAYS', action: 'skipped' }),
    ]);
    expect(classifyList(diffOutcomes(a, b), a, b, skipped)[0]!.class).toBe(
      'MIGRATION_REPORT',
    );
    expect(
      classifyList(diffOutcomes(a, b), a, b, listContext([]))[0]!.class,
    ).toBeUndefined();
    // A leave only in the new list is never expected.
    expect(
      classifyList(diffOutcomes(b, a), b, a, skipped)[0]!.class,
    ).toBeUndefined();
  });

  it('leaves any other field change unexplained, even with findings', () => {
    const a = list(v('l-1', '2024-01-01', { type: 'DOCTOR' }));
    const b = list(v('l-1', '2024-01-01'));
    const ctx = listContext([finding({ code: 'LEAVE_TYPE_DEFAULTED' })]);
    const diffs = classifyList(diffOutcomes(a, b), a, b, ctx);
    expect(diffs.map((d) => [d.path, d.class])).toEqual([
      ['leaves.l-1.type', undefined],
    ]);
  });

  it('classifies old null vs new 401 as DENIED_EXPLICIT_ERROR only with the expected code', () => {
    const denied: ListOutcome = { kind: 'denied', detail: 'getLeaves: null' };
    const denied401: ListOutcome = {
      kind: 'denied',
      detail: '401 AUTH_REQUIRED',
    };
    const cls = (a: ListOutcome, expect?: string) =>
      classifyList(
        diffOutcomes(a, denied401),
        a,
        denied401,
        listContext([]),
        expect,
      )[0]!.class;
    expect(cls(denied, 'AUTH_REQUIRED')).toBe('DENIED_EXPLICIT_ERROR');
    expect(cls(denied, 'USER_DEACTIVATED')).toBeUndefined();
    expect(cls(denied)).toBeUndefined();
    // A list on the old side is never an expected refusal.
    expect(cls(list(v('l-1', '2024-01-01')), 'AUTH_REQUIRED')).toBeUndefined();
  });

  it('keys repeated old ids apart', () => {
    const a = list(v('l-1', '2024-01-01'), v('l-1', '2024-01-01'));
    const b = list(v('l-1', '2024-01-01'));
    expect(diffOutcomes(a, b)).toEqual([
      expect.objectContaining({ kind: 'missing', path: 'leaves.l-1#2' }),
    ]);
  });
});

describe('leave-list requests (MIG-03)', () => {
  it('asks as admins, unapproved users, two others and the denied cases', () => {
    const reqs = listRequests(
      [
        { id: '2', approved: true },
        { id: '1', isAdmin: true, approved: true },
        { id: '3', approved: false },
        { id: '4', approved: true },
        { id: '5', approved: true },
        { id: '' },
      ],
      ['9999'],
    );
    expect(reqs.map((r) => r.label)).toEqual([
      'list as admin 1',
      'list as unapproved user 3',
      'list as user 2',
      'list as user 4',
      'state=PENDING as 1',
      'state=APPROVED as 1',
      'state=REJECTED as 1',
      'forged signature for 1',
      'no session',
      'unknown user parity-unknown-user',
      'removed user 9999',
    ]);
    expect(reqs.find((r) => r.label === 'no session')).toMatchObject({
      viewer: null,
      token: 'none',
    });
  });
});
