import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import mongoose, { type Connection, mongo, Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  type AnonymizeOptions,
  EXIT_CHECK_FAILED,
  EXIT_OK,
  EXIT_REFUSED,
  runAnonymize,
} from '../../src/migration/anonymize/anonymize-runner';
import { stringsIn } from '../../src/migration/anonymize/legacy-anonymizer';
import type { MigrationReport } from '../../src/migration/report';
import { runMigration } from '../../src/migration/runner';
import { databaseUrl, testDatabaseName } from '../support/mongo';

/**
 * MIG-02 against real MongoDB 8: a legacy database seeded with old-shaped
 * documents (as restored into `cestaky_legacy`), anonymized into a second
 * database; no original PII remains, references are intact, BSON types and
 * natural order are kept, and MIG-01 finds the same findings by code on the
 * anonymized data as on the original.
 */

const SECRET = 'integration-anonymize-secret-'.padEnd(48, 'x');
const legacyName = testDatabaseName();
const anonName = testDatabaseName();
const anon2Name = testDatabaseName();
let legacy: Connection;
let anon: Connection;
let reportRoot: string;

const oid = (s: number) => Types.ObjectId.createFromTime(s);
const double = (n: number) => new mongo.Double(n);

const PII = {
  ids: ['110248495921238986420', '222', '333', '444', 'gone', 'gone-admin'],
  emails: [
    'Jana.Nova@instea.co',
    'peter@instea.co',
    'dup@instea.co',
    'DUP@instea.co',
  ],
  names: ['Jana', 'Nová', 'Peter', 'Ing.', 'Hlavná 1, Bratislava', 'Mgr.'],
};

const legacyUsers = [
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
    email: 'peter@instea.co',
    firstName: 'Peter',
    surname: '',
    degrees: 'Mgr.',
    address: '',
    approved: false,
    __v: 0,
  },
  { _id: oid(1_500_000_003), id: '333', email: 'dup@instea.co', __v: 0 },
  { _id: oid(1_500_000_004), id: '444', email: 'DUP@instea.co', __v: 0 },
];

const leaveDoc = (n: number, extra: Record<string, unknown> = {}) => ({
  _id: oid(1_600_000_000 + n),
  id: `5f0c1e2d-3b4a-4c5d-8e9f-${String(n).padStart(12, '0')}`,
  requesterId: '110248495921238986420',
  startDate: new Date('2024-03-10T23:00:00.000Z'),
  endDate: new Date('2024-03-12T23:00:00.000Z'),
  isHalfDay: false,
  type: 'ANNUAL',
  state: 'APPROVED',
  numDays: double(3),
  approverId: '110248495921238986420',
  __v: 0,
  ...extra,
});

// Inserted in this order (natural order is kept in the output).
const legacyLeaves = [
  leaveDoc(9, { type: 'DOCTOR' }),
  leaveDoc(1, { requesterId: 'gone', approverId: 'gone-admin' }),
  leaveDoc(2, { requesterId: 'gone', numDays: double(2) }),
  leaveDoc(3, { endDate: new Date('2024-03-08T23:00:00.000Z') }),
  leaveDoc(4, { requesterId: '333' }),
  leaveDoc(5, {
    requesterId: '222',
    state: 'PENDING',
    numDays: double(0.5),
    isHalfDay: true,
  }),
  leaveDoc(6, { startDate: new Date('2024-03-11T08:00:00.000Z') }),
];
delete (legacyLeaves[2] as Record<string, unknown>).type;
delete (legacyLeaves[5] as Record<string, unknown>).approverId;

const options = (over: Partial<AnonymizeOptions> = {}): AnonymizeOptions => ({
  secret: SECRET,
  sourceUrl: databaseUrl(legacyName),
  targetUrl: databaseUrl(anonName),
  timezone: 'Europe/Bratislava',
  replace: false,
  allowFindingDrift: false,
  ...over,
});

const raw = (c: Connection, name: string) =>
  c
    .db!.collection<Record<string, unknown>>(name)
    .find({}, { promoteValues: false })
    .toArray() as Promise<Record<string, unknown>[]>;

async function migrationReport(
  legacyDb: string,
  tag: string,
): Promise<MigrationReport> {
  const reportDir = join(reportRoot, tag);
  await runMigration({
    legacyMongoUrl: databaseUrl(legacyDb),
    mongoUrl: databaseUrl(testDatabaseName()),
    timezone: 'Europe/Bratislava',
    dryRun: true,
    replace: false,
    reportDir,
  });
  return JSON.parse(
    await readFile(join(reportDir, 'report.json'), 'utf8'),
  ) as MigrationReport;
}

beforeAll(async () => {
  legacy = await mongoose.createConnection(databaseUrl(legacyName)).asPromise();
  anon = await mongoose.createConnection(databaseUrl(anonName)).asPromise();
  reportRoot = await mkdtemp(join(tmpdir(), 'mig02-'));
  await legacy.db!.collection('users').insertMany(legacyUsers);
  await legacy.db!.collection('leaves').insertMany(legacyLeaves);
});

afterAll(async () => {
  const other = mongoose.createConnection(databaseUrl(anon2Name));
  await Promise.allSettled([
    legacy.dropDatabase(),
    anon.dropDatabase(),
    other.dropDatabase(),
  ]);
  await Promise.allSettled([legacy.close(), anon.close(), other.close()]);
  await rm(reportRoot, { recursive: true, force: true });
});

describe('anonymize-legacy (MIG-02)', () => {
  const lines: string[] = [];

  beforeAll(async () => {
    expect(await runAnonymize(options({ log: (l) => lines.push(l) }))).toBe(
      EXIT_OK,
    );
  });

  it('writes every user and leave, in natural order, and leaves the source untouched', async () => {
    const [users, leaves] = [
      await raw(anon, 'users'),
      await raw(anon, 'leaves'),
    ];
    expect(users.map((u) => u._id)).toEqual(legacyUsers.map((u) => u._id));
    expect(leaves.map((l) => l._id)).toEqual(legacyLeaves.map((l) => l._id));
    const source = await raw(legacy, 'users');
    expect(source.map((u) => u.email)).toEqual(PII.emails);
    expect(lines).toContain('MIG-01 finding counts by code are unchanged');
  });

  it('leaves no original id, email, name, degrees or address', async () => {
    const docs = [
      ...(await raw(anon, 'users')),
      ...(await raw(anon, 'leaves')),
    ];
    const strings = docs.flatMap((d) =>
      [...stringsIn(d, 'doc')].map(([, s]) => s),
    );
    for (const value of [...PII.ids, ...PII.emails, ...PII.names]) {
      expect(strings, value).not.toContain(value);
      expect(
        strings.some((s) => value.length >= 6 && s.includes(value)),
        value,
      ).toBe(false);
    }
    expect(strings.join(' ')).not.toMatch(/Jana|Peter|Hlavn/);
  });

  it('keeps references, migration-relevant fields and BSON types', async () => {
    const users = await raw(anon, 'users');
    const leaves = await raw(anon, 'leaves');
    const jana = users[0]!;
    expect(jana).toMatchObject({
      id: expect.stringMatching(/^anon-[0-9a-f]{16}$/) as string,
      email: expect.stringMatching(/^User-[0-9a-f]{12}@instea\.co$/) as string,
      degrees: '',
      address: '',
      isAdmin: true,
      approved: true,
    });
    expect(users[1]).toMatchObject({
      surname: '',
      degrees: '',
      address: '',
      approved: false,
    });
    expect('firstName' in users[2]!).toBe(false);
    expect(String(users[2]!.email).toLowerCase()).toBe(
      String(users[3]!.email).toLowerCase(),
    );
    expect(users[2]!.email).not.toBe(users[3]!.email);

    expect(leaves[0]!.requesterId).toBe(jana.id);
    expect(leaves[0]!.approverId).toBe(jana.id);
    expect(leaves[4]!.requesterId).toBe(users[2]!.id);
    expect(leaves[5]!.requesterId).toBe(users[1]!.id);
    expect('approverId' in leaves[5]!).toBe(false);
    expect('type' in leaves[2]!).toBe(false);
    expect(leaves[1]!.requesterId).toBe(leaves[2]!.requesterId);
    expect(users.map((u) => u.id)).not.toContain(leaves[1]!.requesterId);
    legacyLeaves.forEach((l, i) => {
      for (const f of [
        'id',
        'startDate',
        'endDate',
        'state',
        'isHalfDay',
      ] as const)
        expect(leaves[i]![f], f).toEqual((l as Record<string, unknown>)[f]);
    });
    // numDays stays a BSON double (not re-encoded as int32).
    expect(
      await anon
        .db!.collection('leaves')
        .countDocuments({ numDays: { $type: 'double' } }),
    ).toBe(legacyLeaves.length);
  });

  it('gives MIG-01 the same findings by code on the anonymized data as on the original', async () => {
    const original = await migrationReport(legacyName, 'original');
    const anonymized = await migrationReport(anonName, 'anonymized');
    expect(anonymized.findingsByCode).toEqual(original.findingsByCode);
    expect(anonymized.source).toEqual(original.source);
    expect(anonymized.migrated).toEqual(original.migrated);
    expect(anonymized.skipped).toEqual(original.skipped);
    expect(Object.keys(original.findingsByCode)).toEqual(
      expect.arrayContaining([
        'USER_DUPLICATE_EMAIL',
        'USER_PLACEHOLDER_CREATED',
        'LEAVE_USER_SKIPPED',
      ]),
    );
  });

  it('is deterministic: same secret and dump → identical output', async () => {
    expect(
      await runAnonymize(options({ targetUrl: databaseUrl(anon2Name) })),
    ).toBe(EXIT_OK);
    const other = await mongoose
      .createConnection(databaseUrl(anon2Name))
      .asPromise();
    try {
      for (const c of ['users', 'leaves'])
        expect(await raw(other, c)).toEqual(await raw(anon, c));
    } finally {
      await other.close();
    }
  });

  it('refuses a non-empty target without --replace, and the source as target', async () => {
    const log: string[] = [];
    expect(await runAnonymize(options({ log: (l) => log.push(l) }))).toBe(
      EXIT_REFUSED,
    );
    expect(log).toContain(
      'Target collections users/leaves are not empty; use --replace to overwrite',
    );
    expect(
      await runAnonymize(options({ targetUrl: databaseUrl(legacyName) })),
    ).toBe(EXIT_REFUSED);
    expect(await runAnonymize(options({ replace: true }))).toBe(EXIT_OK);
    expect(await anon.db!.collection('users').countDocuments()).toBe(
      legacyUsers.length,
    );
  });
});

describe('anonymize-legacy check failure', () => {
  const driftName = testDatabaseName();
  const outName = testDatabaseName();
  let drift: Connection;
  let out: Connection;

  beforeEach(async () => {
    drift = await mongoose.createConnection(databaseUrl(driftName)).asPromise();
    out = await mongoose.createConnection(databaseUrl(outName)).asPromise();
    await drift.dropDatabase();
    await out.dropDatabase();
    await drift.db!.collection('users').insertMany(legacyUsers);
    // Removed users `gone` / `Gone`: colliding placeholder emails in MIG-01.
    await drift
      .db!.collection('leaves')
      .insertMany([
        leaveDoc(1, { requesterId: 'gone' }),
        leaveDoc(2, { requesterId: 'Gone' }),
      ]);
  });

  afterAll(async () => {
    await Promise.allSettled([drift.dropDatabase(), out.dropDatabase()]);
    await Promise.allSettled([drift.close(), out.close()]);
  });

  it('writes nothing when MIG-01 finding counts would change, unless allowed', async () => {
    const log: string[] = [];
    const opts = options({
      sourceUrl: databaseUrl(driftName),
      targetUrl: databaseUrl(outName),
    });
    expect(await runAnonymize({ ...opts, log: (l) => log.push(l) })).toBe(
      EXIT_CHECK_FAILED,
    );
    expect(log.join('\n')).toMatch(
      /USER_PLACEHOLDER_INVALID: original 2, anonymized 0/,
    );
    expect(await out.db!.collection('users').countDocuments()).toBe(0);
    expect(await runAnonymize({ ...opts, allowFindingDrift: true })).toBe(
      EXIT_OK,
    );
    expect(await out.db!.collection('leaves').countDocuments()).toBe(2);
  });
});
