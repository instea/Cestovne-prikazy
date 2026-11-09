import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import type { LegacyDoc } from '../legacy-mapping';
import {
  anonymizeLegacy,
  compareMigrationFindings,
  findLeaks,
  LEAVE_KEPT_FIELDS,
  LEAVE_REF_FIELDS,
  legacyLeaks,
  USER_KEPT_FIELDS,
  USER_PII_FIELDS,
} from './legacy-anonymizer';
import { Pseudonymizer } from './pseudonym';

const p = new Pseudonymizer('legacy-anonymizer-secret-'.padEnd(40, 'x'));
const oid = (s: number) => Types.ObjectId.createFromTime(s);
const TZ = 'Europe/Bratislava';

const users: LegacyDoc[] = [
  {
    _id: oid(1_500_000_001),
    id: '110248495921238986420',
    email: 'Jana.Nova@instea.co',
    firstName: 'Jana',
    surname: 'Nová',
    degrees: 'Ing.',
    address: 'Hlavná 1, Bratislava',
    isAdmin: true,
    approved: true,
    __v: 0,
  },
  {
    _id: oid(1_500_000_002),
    id: '222',
    email: 'peter.kral@instea.co',
    firstName: 'Peter',
    surname: '',
    degrees: '',
    address: '',
    approved: false,
    __v: 0,
  },
  // Duplicates by case → both USER_DUPLICATE_EMAIL.
  { _id: oid(1_500_000_003), id: '333', email: 'dup@instea.co', __v: 0 },
  { _id: oid(1_500_000_004), id: '444', email: 'DUP@instea.co', __v: 0 },
  // Invalid email, missing names, blank id.
  { _id: oid(1_500_000_005), id: ' ', email: 'not an email', isAdmin: false },
  // Duplicate id → USER_DUPLICATE_ID on both.
  {
    _id: oid(1_500_000_006),
    id: '666',
    email: 'a.b@instea.co',
    nickname: 'Fero',
  },
  { _id: oid(1_500_000_007), id: '666', email: 'c.d@instea.co' },
];

const leave = (n: number, extra: Record<string, unknown> = {}): LegacyDoc => ({
  _id: oid(1_600_000_000 + n),
  id: `5f0c1e2d-3b4a-4c5d-8e9f-${String(n).padStart(12, '0')}`,
  requesterId: '110248495921238986420',
  startDate: new Date('2024-03-10T23:00:00.000Z'),
  endDate: new Date('2024-03-12T23:00:00.000Z'),
  isHalfDay: false,
  type: 'ANNUAL',
  state: 'APPROVED',
  numDays: 3,
  approverId: '110248495921238986420',
  __v: 0,
  ...extra,
});

const leaves: LegacyDoc[] = [
  leave(1),
  leave(2, { requesterId: 'gone', approverId: 'gone-admin' }),
  leave(3, { requesterId: 'gone', type: undefined, numDays: 2 }),
  leave(4, { endDate: new Date('2024-03-08T23:00:00.000Z') }),
  leave(5, { requesterId: '333' }),
  leave(6, { requesterId: '222', approverId: undefined, state: 'PENDING' }),
  leave(7, {
    startDate: new Date('2024-03-11T08:00:00.000Z'),
    comment: 'Jana sick',
  }),
];
for (const l of leaves) if (l.type === undefined) delete l.type;
delete leaves[5]!.approverId;

const out = anonymizeLegacy(users, leaves, p);
/** Per-document copy (structuredClone would drop the ObjectId class). */
const copy = (a: typeof out) => ({
  users: a.users.map((d) => ({ ...d })),
  leaves: a.leaves.map((d) => ({ ...d })),
});

describe('field coverage (MIG-02)', () => {
  it('classifies every old User and Leave schema field', () => {
    // server/db/schema.js: User and Leave fields + Mongoose _id / __v.
    expect([...USER_KEPT_FIELDS, ...USER_PII_FIELDS].sort()).toEqual(
      [
        '_id',
        '__v',
        'address',
        'approved',
        'degrees',
        'email',
        'firstName',
        'id',
        'isAdmin',
        'surname',
      ].sort(),
    );
    expect([...LEAVE_KEPT_FIELDS, ...LEAVE_REF_FIELDS].sort()).toEqual(
      [
        '_id',
        '__v',
        'approverId',
        'endDate',
        'id',
        'isHalfDay',
        'numDays',
        'requesterId',
        'startDate',
        'state',
        'type',
      ].sort(),
    );
  });

  it('keeps every migration-relevant field identical and the field order', () => {
    users.forEach((u, i) => {
      expect(Object.keys(out.users[i]!)).toEqual(Object.keys(u));
      for (const f of USER_KEPT_FIELDS) expect(out.users[i]![f]).toBe(u[f]);
    });
    leaves.forEach((l, i) => {
      expect(Object.keys(out.leaves[i]!)).toEqual(Object.keys(l));
      for (const f of LEAVE_KEPT_FIELDS) expect(out.leaves[i]![f]).toBe(l[f]);
    });
  });
});

describe('anonymizeLegacy', () => {
  it('maps ids and keeps references (also to missing users)', () => {
    const jana = out.users[0]!;
    expect(jana.id).toBe(p.userId('110248495921238986420'));
    expect(jana.id).toMatch(/^anon-[0-9a-f]{16}$/);
    expect(out.leaves[0]!.requesterId).toBe(jana.id);
    expect(out.leaves[0]!.approverId).toBe(jana.id);
    expect(out.leaves[1]!.requesterId).toBe(p.userId('gone'));
    expect(out.leaves[2]!.requesterId).toBe(out.leaves[1]!.requesterId);
    expect(out.users.some((u) => u.id === p.userId('gone'))).toBe(false);
    expect('approverId' in out.leaves[5]!).toBe(false);
    expect(out.users[5]!.id).toBe(out.users[6]!.id);
  });

  it('names First<n> / Last<n> by the rank of the pseudonymized id, blanks kept', () => {
    const ranked = out.users
      .map((u, i) => ({
        id: typeof u.id === 'string' ? u.id : '',
        oid: users[i]!._id as Types.ObjectId,
        u,
      }))
      .sort(
        (a, b) =>
          a.id.localeCompare(b.id, 'en') ||
          a.oid.toHexString().localeCompare(b.oid.toHexString()),
      );
    ranked.forEach(({ u }, r) => {
      if ('firstName' in u && u.firstName !== '')
        expect(u.firstName).toBe(`First${r + 1}`);
    });
    expect(out.users[0]!.surname).toMatch(/^Last\d+$/);
    expect(out.users[1]!.surname).toBe('');
    expect('firstName' in out.users[2]!).toBe(false);
  });

  it('blanks degrees / address when non-empty, keeps presence', () => {
    expect(out.users[0]).toMatchObject({ degrees: '', address: '' });
    expect(out.users[1]).toMatchObject({ degrees: '', address: '' });
    expect('degrees' in out.users[2]!).toBe(false);
  });

  it('pseudonymizes emails with the case rule and redacts unknown fields', () => {
    expect(out.users[0]!.email).toMatch(/^User-[0-9a-f]{12}@instea\.co$/);
    expect(out.users[2]!.email).toMatch(/^user-[0-9a-f]{12}@instea\.co$/);
    expect(out.users[3]!.email).toMatch(/^User-[0-9a-f]{12}@instea\.co$/);
    expect(out.users[5]!.nickname).toMatch(/^redacted-/);
    expect(out.leaves[6]!.comment).toMatch(/^redacted-/);
  });

  it('is deterministic: same secret and input → identical output', () => {
    expect(anonymizeLegacy(users, leaves, p)).toEqual(out);
    // Source order does not change the pseudonyms (ranks use ids).
    const reversed = anonymizeLegacy([...users].reverse(), leaves, p);
    expect([...reversed.users].reverse()).toEqual(out.users);
  });
});

describe('legacyLeaks (self-check before writing)', () => {
  it('finds no original PII in the anonymized output', () => {
    expect(legacyLeaks({ users, leaves }, out)).toEqual([]);
  });

  it('reports the path, never the value, of a leaked value', () => {
    const leaky = copy(out);
    leaky.users[1]!.extra = 'Peter';
    leaky.leaves[0]!.note = 'mail jana.nova@instea.co now';
    leaky.leaves[1]!.requesterId = 'gone';
    const leaks = legacyLeaks({ users, leaves }, leaky);
    expect(leaks).toEqual([
      `users[${(users[1]!._id as Types.ObjectId).toHexString()}].extra`,
      `leaves[${(leaves[0]!._id as Types.ObjectId).toHexString()}].note`,
      `leaves[${(leaves[1]!._id as Types.ObjectId).toHexString()}].requesterId`,
    ]);
    expect(leaks.join()).not.toMatch(/Peter|jana|gone/i);
  });

  it('flags the untouched source', () => {
    expect(
      legacyLeaks({ users, leaves }, { users, leaves }).length,
    ).toBeGreaterThan(10);
  });

  it('does not flag values that also occur in kept fields', () => {
    expect(
      findLeaks(
        ['APPROVED', 'instea.co', 'Jana'],
        ['APPROVED', 'instea.co'],
        [['x', { a: 'APPROVED', b: 'user-1@instea.co' }]],
      ),
    ).toEqual([]);
    expect(findLeaks(['Jana'], [], [['x', { a: ' Jana ' }]])).toEqual(['x.a']);
  });
});

describe('compareMigrationFindings', () => {
  it('MIG-01 finding counts by code are unchanged by the anonymization', () => {
    const c = compareMigrationFindings({ users, leaves }, out, TZ);
    expect(c.differences).toEqual([]);
    expect(c.anonymized).toEqual(c.original);
    for (const code of [
      'USER_DUPLICATE_EMAIL',
      'USER_DUPLICATE_ID',
      'USER_INVALID_EMAIL',
      'USER_MISSING_ID',
      'USER_EMPTY_NAME',
      'USER_PLACEHOLDER_CREATED',
      'LEAVE_END_BEFORE_START',
      'LEAVE_USER_SKIPPED',
      'LEAVE_DATE_NOT_LOCAL_MIDNIGHT',
    ])
      expect(c.original[code], code).toBeGreaterThan(0);
  });

  it('reports a code whose count differs', () => {
    const changed = copy(out);
    changed.users[2]!.email = 'other@instea.co';
    expect(
      compareMigrationFindings({ users, leaves }, changed, TZ).differences,
    ).toEqual([
      // The leave of user 333 is no longer skipped either.
      { code: 'LEAVE_USER_SKIPPED', original: 1, anonymized: 0 },
      { code: 'USER_DUPLICATE_EMAIL', original: 2, anonymized: 0 },
    ]);
  });

  it('detects the known limit: removed-user ids differing only in case', () => {
    // `gone` / `Gone` give colliding placeholder emails in MIG-01; their
    // pseudonyms do not, so the run refuses unless --allow-finding-drift.
    const more = [...leaves, leave(8, { requesterId: 'Gone' })];
    const c = compareMigrationFindings(
      { users, leaves: more },
      anonymizeLegacy(users, more, p),
      TZ,
    );
    expect(c.differences.map((d) => d.code)).toContain(
      'USER_PLACEHOLDER_INVALID',
    );
  });
});
