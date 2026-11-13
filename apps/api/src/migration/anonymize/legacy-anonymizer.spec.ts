import { mongo, Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import type { LegacyDoc } from '../legacy-mapping';
import {
  anonymizeLegacy,
  compareMigrationFindings,
  findLeaks,
  idLabel,
  LEAVE_KEPT_FIELDS,
  LEAVE_REF_FIELDS,
  legacyEmailCollisions,
  legacyLeaks,
  USER_KEPT_FIELDS,
  USER_PII_FIELDS,
} from './legacy-anonymizer';
import { numericValue, Pseudonymizer } from './pseudonym';

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

describe('numeric values (MIG-02)', () => {
  const src: LegacyDoc[] = [
    {
      _id: oid(1_500_000_101),
      id: new mongo.Int32(7),
      email: 'x@instea.co',
      firstName: 12345,
      phone: new mongo.Double(421_900_123_456),
      personalNo: new mongo.Long(8_001_011_234),
      __v: new mongo.Int32(0),
    },
  ];
  const srcLeaves: LegacyDoc[] = [
    leave(101, {
      requesterId: new mongo.Double(7),
      approverId: undefined,
      numDays: new mongo.Double(3),
      extraCode: 987_654,
    }),
  ];
  const o = anonymizeLegacy(src, srcLeaves, p);

  it('fakes numbers in PII and unknown fields, keeps known numeric fields and references', () => {
    const u = o.users[0]!;
    const l = o.leaves[0]!;
    expect(numericValue(u.phone)).not.toBe(421_900_123_456);
    expect(u.phone).toBeInstanceOf(mongo.Double);
    expect(numericValue(u.personalNo)).not.toBe(8_001_011_234);
    expect(typeof u.firstName).toBe('number');
    expect(u.firstName).not.toBe(12345);
    expect(numericValue(u.id)).not.toBe(7);
    expect(numericValue(l.requesterId)).toBe(numericValue(u.id));
    expect(l.extraCode).not.toBe(987_654);
    expect(u.__v).toEqual(src[0]!.__v);
    expect(l.numDays).toEqual(srcLeaves[0]!.numDays);
    expect(legacyLeaks({ users: src, leaves: srcLeaves }, o)).toEqual([]);
  });

  it('the leak check compares numbers too (paths only)', () => {
    const leaky = copy(o);
    leaky.users[0]!.phone = 421_900_123_456; // promoted type, same value
    leaky.leaves[0]!.extraCode = new mongo.Int32(987_654);
    const leaks = legacyLeaks({ users: src, leaves: srcLeaves }, leaky);
    expect(leaks).toEqual([
      `users[${idLabel(src[0]!._id)}].phone`,
      `leaves[${idLabel(srcLeaves[0]!._id)}].extraCode`,
    ]);
    expect(leaks.join()).not.toMatch(/421|987/);
  });

  it('numbers that also occur in kept fields are not leaks', () => {
    expect(
      findLeaks([], [], [['x', { numDays: 3 }]], {
        forbidden: [3, 5],
        kept: [3],
      }),
    ).toEqual([]);
    expect(
      findLeaks([], [], [['x', { a: [new mongo.Int32(5)] }]], {
        forbidden: [5],
        kept: [],
      }),
    ).toEqual(['x.a[0]']);
  });
});

describe('legacyEmailCollisions', () => {
  it('reports distinct case variants of one email by _id path, never values', () => {
    const collide: LegacyDoc[] = [
      { _id: oid(1_500_000_201), email: 'HANA@instea.co' },
      { _id: oid(1_500_000_202), email: 'Hana@instea.co' },
      { _id: oid(1_500_000_203), email: 'hana@instea.co' },
      { _id: oid(1_500_000_204) },
    ];
    expect(legacyEmailCollisions(collide, p)).toEqual([
      [
        `users[${idLabel(collide[0]!._id)}].email`,
        `users[${idLabel(collide[1]!._id)}].email`,
      ],
    ]);
  });

  it('is empty for the fixture users (dup@ / DUP@ keep distinct pseudonyms)', () => {
    expect(legacyEmailCollisions(users, p)).toEqual([]);
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
