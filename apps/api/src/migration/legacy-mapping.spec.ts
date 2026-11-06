import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import {
  actionFor,
  type Finding,
  type LegacyDoc,
  mapUsers,
  migrateLegacy,
  placeholderUser,
  toCalendarDate,
} from './legacy-mapping';

const TZ = 'Europe/Bratislava';
const RUN = new Date('2026-11-06T10:00:00.000Z');
const opts = { timezone: TZ, runStartedAt: RUN };

const oid = (seconds: number) =>
  Types.ObjectId.createFromTime(seconds) as unknown;

const user = (n: number, extra: Partial<LegacyDoc> = {}): LegacyDoc => ({
  _id: oid(1_500_000_000 + n),
  id: `g-${n}`,
  email: `user${n}@instea.co`,
  firstName: 'Jana',
  surname: 'Nová',
  degrees: '',
  address: '',
  isAdmin: false,
  approved: true,
  __v: 0,
  ...extra,
});

const leave = (n: number, extra: Partial<LegacyDoc> = {}): LegacyDoc => ({
  _id: oid(1_600_000_000 + n),
  id: `0b7e8f3a-1c2d-4e5f-8a9b-${String(n).padStart(12, '0')}`,
  requesterId: 'g-1',
  startDate: new Date('2024-03-10T23:00:00.000Z'),
  endDate: new Date('2024-03-12T23:00:00.000Z'),
  isHalfDay: false,
  type: 'ANNUAL',
  state: 'PENDING',
  numDays: 3,
  __v: 0,
  ...extra,
});

const codes = (findings: Finding[], recordId?: string) =>
  findings
    .filter((f) => recordId === undefined || f.recordId === recordId)
    .map((f) => f.code)
    .sort();

describe('toCalendarDate', () => {
  it.each([
    // CET (UTC+1) and CEST (UTC+2) local midnights.
    ['2024-03-10T23:00:00.000Z', '2024-03-11', true],
    ['2024-07-14T22:00:00.000Z', '2024-07-15', true],
    // DST switch days: midnight is still before the switch.
    ['2024-03-30T23:00:00.000Z', '2024-03-31', true],
    ['2024-10-26T22:00:00.000Z', '2024-10-27', true],
    // Day after each switch uses the new offset.
    ['2024-03-31T22:00:00.000Z', '2024-04-01', true],
    ['2024-10-27T23:00:00.000Z', '2024-10-28', true],
    // Not local midnight (UTC midnight = 01:00 Bratislava).
    ['2024-03-11T00:00:00.000Z', '2024-03-11', false],
    ['2024-03-10T23:00:00.001Z', '2024-03-11', false],
  ])('%s → %s (midnight %s)', (iso, date, localMidnight) => {
    expect(toCalendarDate(new Date(iso), TZ)).toEqual({ date, localMidnight });
  });

  it.each([undefined, null, '2024-03-11', 0, new Date('nope')])(
    'rejects %s',
    (v) => {
      expect(toCalendarDate(v, TZ)).toBeNull();
    },
  );

  it('uses the given timezone', () => {
    expect(
      toCalendarDate(new Date('2024-03-11T04:00:00.000Z'), 'America/New_York'),
    ).toEqual({ date: '2024-03-11', localMidnight: true });
  });
});

describe('actionFor', () => {
  it.each([
    ['error', 'LEAVE_INVALID_TYPE', false, 'skipped'],
    ['info', 'USER_ISADMIN_DEFAULTED', true, 'skipped'],
    ['warning', 'USER_EMPTY_NAME', false, 'migrated-with-default'],
    ['info', 'USER_ISADMIN_DEFAULTED', false, 'migrated-with-default'],
    ['info', 'LEAVE_TYPE_DEFAULTED', false, 'migrated-with-default'],
    ['warning', 'LEAVE_STATE_DEFAULTED', false, 'migrated-with-default'],
    ['warning', 'USER_PLACEHOLDER_CREATED', false, 'placeholder-created'],
    ['info', 'LEAVE_NUMDAYS_CHANGED', false, 'migrated'],
    ['warning', 'LEAVE_DATE_NOT_LOCAL_MIDNIGHT', false, 'migrated'],
  ] as const)('%s %s (skipped=%s) → %s', (sev, code, skipped, action) => {
    expect(actionFor(sev, code, skipped)).toBe(action);
  });
});

describe('mapUsers', () => {
  it('maps a clean user, dropping legacy fields', () => {
    const src = user(1, { email: '  User1@Instea.CO ', firstName: ' Jana ' });
    const { users, findings } = mapUsers([src], opts);
    expect(findings).toEqual([]);
    expect(users).toEqual([
      {
        id: 'g-1',
        email: 'user1@instea.co',
        firstName: 'Jana',
        surname: 'Nová',
        isAdmin: false,
        active: true,
        deactivatedAt: null,
        anonymizedAt: null,
        createdAt: new Date(1_500_000_001_000),
        updatedAt: new Date(1_500_000_001_000),
      },
    ]);
  });

  it('activates unapproved users and defaults isAdmin', () => {
    const b = user(2, { approved: false });
    delete b.isAdmin;
    const { users, findings } = mapUsers([user(1), b], opts);
    expect(users.map((u) => [u.id, u.active, u.isAdmin])).toEqual([
      ['g-1', true, false],
      ['g-2', true, false],
    ]);
    expect(codes(findings, 'g-2')).toEqual([
      'USER_APPROVED_FALSE_ACTIVATED',
      'USER_ISADMIN_DEFAULTED',
    ]);
    expect(
      findings.find((f) => f.code === 'USER_ISADMIN_DEFAULTED')?.action,
    ).toBe('migrated-with-default');
  });

  it('keeps isAdmin only when boolean true', () => {
    const { users } = mapUsers(
      [user(1, { isAdmin: true }), user(2, { isAdmin: 'true' })],
      opts,
    );
    expect(users.map((u) => u.isAdmin)).toEqual([true, false]);
  });

  it('migrates empty names with one warning listing the fields', () => {
    const src = user(1, { firstName: '  ' });
    delete src.surname;
    const { users, findings } = mapUsers([src], opts);
    expect(users[0]).toMatchObject({ firstName: '', surname: '' });
    expect(findings).toEqual([
      expect.objectContaining({
        code: 'USER_EMPTY_NAME',
        severity: 'warning',
        details: { fields: ['firstName', 'surname'] },
      }),
    ]);
  });

  it.each([undefined, '', '   '])('rejects missing id %j', (id) => {
    const { users, findings, skipped } = mapUsers([user(1, { id })], opts);
    expect(users).toEqual([]);
    expect(skipped).toBe(1);
    expect(codes(findings)).toEqual(['USER_MISSING_ID']);
    expect(findings[0]).toMatchObject({ recordId: null, action: 'skipped' });
  });

  it.each([undefined, '', 'not-an-email', 'a b@x.co'])(
    'rejects invalid email %j',
    (email) => {
      const { users, findings, skippedIds } = mapUsers(
        [user(1, { email })],
        opts,
      );
      expect(users).toEqual([]);
      expect(codes(findings)).toEqual(['USER_INVALID_EMAIL']);
      expect(skippedIds.has('g-1')).toBe(true);
    },
  );

  it('rejects all users sharing an email case-insensitively', () => {
    const { users, findings, skippedIds } = mapUsers(
      [
        user(1, { email: 'A@instea.co' }),
        user(2, { email: 'a@instea.co' }),
        user(3),
      ],
      opts,
    );
    expect(users.map((u) => u.id)).toEqual(['g-3']);
    expect(codes(findings)).toEqual([
      'USER_DUPLICATE_EMAIL',
      'USER_DUPLICATE_EMAIL',
    ]);
    expect([...skippedIds]).toEqual(['g-1', 'g-2']);
  });

  it('rejects all users sharing an id', () => {
    const { users, findings } = mapUsers(
      [user(1), user(2, { id: 'g-1' })],
      opts,
    );
    expect(users).toEqual([]);
    expect(codes(findings)).toEqual(['USER_DUPLICATE_ID', 'USER_DUPLICATE_ID']);
  });

  it('reports other schema failures', () => {
    const { findings } = mapUsers(
      [user(1, { surname: 'x'.repeat(101) })],
      opts,
    );
    expect(codes(findings)).toEqual(['USER_SCHEMA_INVALID']);
  });

  it('falls back to the run time without an ObjectId', () => {
    const { users } = mapUsers([user(1, { _id: 'legacy' })], opts);
    expect(users[0]!.createdAt).toEqual(RUN);
  });
});

describe('placeholderUser', () => {
  it('matches the old deleted-user shape, deactivated', () => {
    expect(placeholderUser('X9', RUN)).toEqual({
      id: 'X9',
      email: 'x9@deleted.instea.co',
      firstName: 'Deleted',
      surname: 'X9',
      isAdmin: false,
      active: false,
      deactivatedAt: RUN,
      anonymizedAt: null,
      createdAt: RUN,
      updatedAt: RUN,
    });
  });
});

describe('migrateLegacy leaves', () => {
  const run = (leaves: LegacyDoc[], users: LegacyDoc[] = [user(1)]) =>
    migrateLegacy(users, leaves, opts);

  it('converts dates and recomputes numDays', () => {
    const r = run([leave(1)]);
    expect(r.findings).toEqual([]);
    expect(r.leaves).toEqual([
      {
        id: '0b7e8f3a-1c2d-4e5f-8a9b-000000000001',
        requesterId: 'g-1',
        approverId: null,
        startDate: '2024-03-11',
        endDate: '2024-03-13',
        isHalfDay: false,
        type: 'ANNUAL',
        state: 'PENDING',
        numDays: 3,
        createdAt: new Date(1_600_000_001_000),
        updatedAt: new Date(1_600_000_001_000),
      },
    ]);
  });

  it('reports a changed numDays with old and new', () => {
    const r = run([
      leave(1, { numDays: 2, isHalfDay: true, endDate: leave(1).startDate }),
    ]);
    expect(r.leaves[0]!.numDays).toBe(0.5);
    expect(r.findings).toEqual([
      expect.objectContaining({
        code: 'LEAVE_NUMDAYS_CHANGED',
        severity: 'info',
        details: { old: 2, new: 0.5 },
        action: 'migrated',
      }),
    ]);
  });

  it('reports a missing source numDays as null', () => {
    const src = leave(1);
    delete src.numDays;
    expect(run([src]).findings[0]!.details).toEqual({ old: null, new: 3 });
  });

  it('flags zero-work-day leaves but migrates them', () => {
    // 2024-03-16/17 is a weekend.
    const r = run([
      leave(1, {
        startDate: new Date('2024-03-15T23:00:00.000Z'),
        endDate: new Date('2024-03-16T23:00:00.000Z'),
        numDays: 0,
      }),
    ]);
    expect(r.leaves).toHaveLength(1);
    expect(codes(r.findings)).toEqual(['LEAVE_ZERO_WORK_DAYS']);
  });

  it('warns on a non-midnight instant and migrates the local date', () => {
    const r = run([
      leave(1, {
        startDate: new Date('2024-03-11T00:00:00.000Z'),
        endDate: new Date('2024-03-11T00:00:00.000Z'),
        numDays: 1,
      }),
    ]);
    expect(r.leaves[0]).toMatchObject({
      startDate: '2024-03-11',
      endDate: '2024-03-11',
    });
    expect(r.findings).toEqual([
      expect.objectContaining({
        code: 'LEAVE_DATE_NOT_LOCAL_MIDNIGHT',
        severity: 'warning',
        details: {
          source: {
            startDate: '2024-03-11T00:00:00.000Z',
            endDate: '2024-03-11T00:00:00.000Z',
          },
          converted: { startDate: '2024-03-11', endDate: '2024-03-11' },
        },
      }),
    ]);
  });

  it.each([
    [{ startDate: undefined }, 'LEAVE_INVALID_DATE'],
    [{ endDate: 'yesterday' }, 'LEAVE_INVALID_DATE'],
    [
      { endDate: new Date('2024-03-08T23:00:00.000Z') },
      'LEAVE_END_BEFORE_START',
    ],
    [{ isHalfDay: true }, 'LEAVE_HALF_DAY_MULTIPLE_DAYS'],
    [{ type: 'VACATION' }, 'LEAVE_INVALID_TYPE'],
    [{ state: 'CANCELLED' }, 'LEAVE_INVALID_STATE'],
    [{ id: undefined }, 'LEAVE_MISSING_ID'],
    [{ requesterId: '' }, 'LEAVE_MISSING_REQUESTER'],
  ])('skips %j with %s', (extra, code) => {
    const r = run([leave(1, extra)]);
    expect(r.leaves).toEqual([]);
    expect(r.skipped.leaves).toBe(1);
    expect(codes(r.findings)).toEqual([code]);
    expect(r.findings[0]!.action).toBe('skipped');
  });

  it('defaults a missing type (info) and state (warning)', () => {
    const src = leave(1);
    delete src.type;
    src.state = null;
    const r = run([src]);
    expect(r.leaves[0]).toMatchObject({ type: 'ANNUAL', state: 'PENDING' });
    expect(
      r.findings.map((f) => [f.code, f.severity, f.action]).sort(),
    ).toEqual([
      ['LEAVE_STATE_DEFAULTED', 'warning', 'migrated-with-default'],
      ['LEAVE_TYPE_DEFAULTED', 'info', 'migrated-with-default'],
    ]);
  });

  it('keeps isHalfDay only when boolean true', () => {
    const r = run([leave(1, { isHalfDay: 'yes' })]);
    expect(r.leaves[0]!.isHalfDay).toBe(false);
  });

  it('keeps a non-uuid id with a warning', () => {
    const r = run([leave(1, { id: 'legacy-1' })]);
    expect(r.leaves[0]!.id).toBe('legacy-1');
    expect(codes(r.findings)).toEqual(['LEAVE_ID_NOT_UUID']);
  });

  it('skips all leaves sharing an id', () => {
    const r = run([leave(1), leave(2, { id: leave(1).id })]);
    expect(r.leaves).toEqual([]);
    expect(codes(r.findings)).toEqual([
      'LEAVE_DUPLICATE_ID',
      'LEAVE_DUPLICATE_ID',
    ]);
  });

  it('creates one placeholder per removed user, for requester and approver', () => {
    const r = run([
      leave(1, { requesterId: 'X', approverId: 'Y' }),
      leave(2, { requesterId: 'X', approverId: 'g-1', state: 'APPROVED' }),
    ]);
    expect(r.leaves.map((l) => [l.requesterId, l.approverId])).toEqual([
      ['X', 'Y'],
      ['X', 'g-1'],
    ]);
    expect(r.placeholderUserIds).toEqual(['X', 'Y']);
    expect(r.users.map((u) => [u.id, u.active])).toEqual([
      ['g-1', true],
      ['X', false],
      ['Y', false],
    ]);
    const placeholders = r.findings.filter(
      (f) => f.code === 'USER_PLACEHOLDER_CREATED',
    );
    expect(placeholders).toEqual([
      expect.objectContaining({
        recordId: 'X',
        severity: 'warning',
        collection: 'users',
        action: 'placeholder-created',
        details: { leaveIds: [leave(1).id, leave(2).id] },
      }),
      expect.objectContaining({
        recordId: 'Y',
        details: { leaveIds: [leave(1).id] },
      }),
    ]);
  });

  it('maps an empty approverId to null', () => {
    expect(run([leave(1, { approverId: '' })]).leaves[0]!.approverId).toBe(
      null,
    );
  });

  it('skips leaves of a user skipped for an error, without a placeholder', () => {
    const r = run(
      [leave(1, { requesterId: 'g-1' }), leave(2, { approverId: 'g-2' })],
      [user(1, { email: 'A@instea.co' }), user(2, { email: 'a@instea.co' })],
    );
    expect(r.leaves).toEqual([]);
    expect(r.placeholderUserIds).toEqual([]);
    expect(codes(r.findings).filter((c) => c.startsWith('LEAVE'))).toEqual([
      'LEAVE_USER_SKIPPED',
      'LEAVE_USER_SKIPPED',
      'LEAVE_USER_SKIPPED', // leave 2: requester g-1 and approver g-2
    ]);
  });

  it('creates no placeholder for a leave that is skipped', () => {
    const r = run([leave(1, { requesterId: 'X', type: 'VACATION' })]);
    expect(r.placeholderUserIds).toEqual([]);
  });

  it('keeps the source order and counts dropped fields', () => {
    const r = migrateLegacy(
      [
        user(1, { degrees: 'Ing.', address: 'Main 1' }),
        user(2, { degrees: 'Mgr.' }),
      ],
      [leave(3), leave(1), leave(2)],
      opts,
    );
    expect(r.leaves.map((l) => l.id.slice(-1))).toEqual(['3', '1', '2']);
    expect(r.droppedFields).toEqual({ degreesNonEmpty: 2, addressNonEmpty: 1 });
    expect(r.source).toEqual({ users: 2, leaves: 3 });
  });
});
