import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import mongoose, { type Connection, Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Leave, LeaveSchema } from '../../src/leaves/leave.schema';
import type { MigrationReport } from '../../src/migration/report';
import { type RunOptions, runMigration } from '../../src/migration/runner';
import { User, UserSchema } from '../../src/users/user.schema';
import { databaseUrl, testDatabaseName } from '../support/mongo';

/**
 * MIG-01 against real MongoDB 8: a legacy database seeded with old-shaped
 * documents (as restored into `cestaky_legacy`), migrated into a target DB.
 *
 * TODO(MIG-02): restore path from a real `mongo:3.6` `mongodump --gzip
 * --archive` fixture into MongoDB 8 (fixture generated during the rehearsal).
 * TODO(LST-01): assert `GET /api/leaves` returns the migrated leaves with the
 * placeholder requester shown as deactivated.
 */

const legacyName = testDatabaseName();
const targetName = testDatabaseName();
let legacy: Connection;
let target: Connection;
let reportRoot: string;

const RUN = new Date('2026-11-06T10:00:00.000Z');

const oid = (s: number) => Types.ObjectId.createFromTime(s);

const legacyUsers = [
  {
    _id: oid(1_500_000_001),
    id: '111',
    email: 'Jana.Nova@instea.co',
    firstName: 'Jana',
    surname: 'Nová',
    degrees: 'Ing.',
    address: 'Hlavná 1',
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
    degrees: '',
    address: '',
    approved: false,
    __v: 0,
  },
  // Duplicate email (case-insensitive) → both skipped.
  { _id: oid(1_500_000_003), id: '333', email: 'dup@instea.co', __v: 0 },
  { _id: oid(1_500_000_004), id: '444', email: 'DUP@instea.co', __v: 0 },
];

const leaveDoc = (n: number, extra: Record<string, unknown> = {}) => ({
  _id: oid(1_600_000_000 + n),
  id: `5f0c1e2d-3b4a-4c5d-8e9f-${String(n).padStart(12, '0')}`,
  requesterId: '111',
  startDate: new Date('2024-03-10T23:00:00.000Z'),
  endDate: new Date('2024-03-12T23:00:00.000Z'),
  isHalfDay: false,
  type: 'ANNUAL',
  state: 'APPROVED',
  numDays: 3,
  approverId: '111',
  __v: 0,
  ...extra,
});

// Inserted in this order; natural order must be kept in the target.
const legacyLeaves = [
  leaveDoc(9, { type: 'DOCTOR' }),
  leaveDoc(1, { requesterId: 'gone', approverId: 'gone-admin' }),
  leaveDoc(2, { requesterId: 'gone', type: undefined, numDays: 2 }),
  leaveDoc(3, { endDate: new Date('2024-03-08T23:00:00.000Z') }), // error
  leaveDoc(4, { requesterId: '333' }), // user skipped → error
  leaveDoc(5, { requesterId: '222', approverId: undefined, state: 'PENDING' }),
];

async function seedLegacy(): Promise<void> {
  const db = legacy.db!;
  await db.dropDatabase();
  await db.collection('users').insertMany(legacyUsers);
  await db.collection('leaves').insertMany(legacyLeaves);
  // Not migrated; must not be read (asserted with the profiler below).
  await db.collection('trips').insertOne({ junk: true });
  await db.collection('places').insertOne({ junk: true });
}

const options = (over: Partial<RunOptions> = {}): RunOptions => ({
  legacyMongoUrl: databaseUrl(legacyName),
  mongoUrl: databaseUrl(targetName),
  timezone: 'Europe/Bratislava',
  dryRun: false,
  replace: false,
  reportDir: undefined,
  now: () => RUN,
  ...over,
});

async function readReport(dir: string): Promise<MigrationReport> {
  return JSON.parse(
    await readFile(join(dir, 'report.json'), 'utf8'),
  ) as MigrationReport;
}

async function targetDocs() {
  const strip = (doc: Record<string, unknown>) => {
    const rest = { ...doc };
    delete rest._id; // new ObjectIds differ per run
    return rest;
  };
  const db = target.db!;
  return {
    users: (await db.collection('users').find().sort({ _id: 1 }).toArray()).map(
      strip,
    ),
    leaves: (
      await db.collection('leaves').find().sort({ _id: 1 }).toArray()
    ).map(strip),
  };
}

beforeAll(async () => {
  legacy = await mongoose.createConnection(databaseUrl(legacyName)).asPromise();
  target = await mongoose.createConnection(databaseUrl(targetName)).asPromise();
  reportRoot = await mkdtemp(join(tmpdir(), 'mig01-'));
});

afterAll(async () => {
  await Promise.allSettled([legacy.dropDatabase(), target.dropDatabase()]);
  await Promise.allSettled([legacy.close(), target.close()]);
  await rm(reportRoot, { recursive: true, force: true });
});

beforeEach(async () => {
  await seedLegacy();
  await target.dropDatabase();
});

describe('migrate-legacy (MIG-01)', () => {
  it('migrates users and leaves and writes the report', async () => {
    const reportDir = join(reportRoot, 'normal');
    const lines: string[] = [];
    const out = await runMigration(
      options({ reportDir, log: (l) => lines.push(l) }),
    );
    expect(out).toEqual({ exitCode: 3, reportDir });

    const { users, leaves } = await targetDocs();
    expect(users.map((u) => [u.id, u.email, u.active, u.isAdmin])).toEqual([
      ['111', 'jana.nova@instea.co', true, true],
      ['222', 'peter@instea.co', true, false],
      ['gone', 'gone@deleted.instea.co', false, false],
      ['gone-admin', 'gone-admin@deleted.instea.co', false, false],
    ]);
    expect(users[0]).toEqual({
      id: '111',
      email: 'jana.nova@instea.co',
      firstName: 'Jana',
      surname: 'Nová',
      isAdmin: true,
      active: true,
      deactivatedAt: null,
      anonymizedAt: null,
      createdAt: new Date(1_500_000_001_000),
      updatedAt: new Date(1_500_000_001_000),
    });
    expect(users[2]).toMatchObject({
      firstName: 'Deleted',
      surname: 'gone',
      deactivatedAt: RUN,
      createdAt: RUN,
    });

    // Source natural order kept (ATT-04 joins by `_id` order).
    expect(leaves.map((l) => (l.id as string).slice(-1))).toEqual([
      '9',
      '1',
      '2',
      '5',
    ]);
    expect(leaves[0]).toEqual({
      id: '5f0c1e2d-3b4a-4c5d-8e9f-000000000009',
      requesterId: '111',
      approverId: '111',
      startDate: '2024-03-11',
      endDate: '2024-03-13',
      isHalfDay: false,
      type: 'DOCTOR',
      state: 'APPROVED',
      numDays: 3,
      createdAt: new Date(1_600_000_009_000),
      updatedAt: new Date(1_600_000_009_000),
    });
    expect(leaves[2]).toMatchObject({ type: 'ANNUAL', numDays: 3 });
    expect(leaves[3]).toMatchObject({ approverId: null, state: 'PENDING' });

    // The app's models read and re-validate the migrated documents.
    const Users = target.model(User.name, UserSchema);
    const Leaves = target.model(Leave.name, LeaveSchema);
    for (const doc of await Users.find()) await doc.validate();
    for (const doc of await Leaves.find()) await doc.validate();
    const indexes = await target.db!.collection('leaves').indexes();
    expect(indexes.some((i) => i.unique && i.key.id === 1)).toBe(true);

    const report = await readReport(reportDir);
    expect(report).toMatchObject({
      startedAt: RUN.toISOString(),
      dryRun: false,
      timezone: 'Europe/Bratislava',
      source: { users: 4, leaves: 6 },
      migrated: { users: 2, placeholderUsers: 2, leaves: 4 },
      skipped: { users: 2, leaves: 2 },
      droppedFields: { degreesNonEmpty: 1, addressNonEmpty: 1 },
      findingsByCode: {
        USER_DUPLICATE_EMAIL: 2,
        USER_EMPTY_NAME: 3,
        USER_ISADMIN_DEFAULTED: 3,
        USER_APPROVED_FALSE_ACTIVATED: 3,
        USER_PLACEHOLDER_CREATED: 2,
        LEAVE_END_BEFORE_START: 1,
        LEAVE_USER_SKIPPED: 1,
        LEAVE_TYPE_DEFAULTED: 1,
        LEAVE_NUMDAYS_CHANGED: 1,
      },
    });
    expect(
      report.findings.find((f) => f.code === 'USER_PLACEHOLDER_CREATED'),
    ).toMatchObject({
      recordId: 'gone',
      details: {
        leaveIds: [
          '5f0c1e2d-3b4a-4c5d-8e9f-000000000001',
          '5f0c1e2d-3b4a-4c5d-8e9f-000000000002',
        ],
      },
    });

    const md = await readFile(join(reportDir, 'report.md'), 'utf8');
    expect(md).not.toMatch(/@/);
    expect(md).not.toContain('Jana');
    const csv = await readFile(join(reportDir, 'decisions.csv'), 'utf8');
    expect(csv.split('\n')[0]).toBe('code,recordId,decision,decidedBy,note');
    expect(csv).toContain('LEAVE_END_BEFORE_START,');

    // No audit entries, source untouched.
    expect(await target.db!.collection('auditlogs').countDocuments()).toBe(0);
    expect(await legacy.db!.collection('users').countDocuments()).toBe(4);
    expect(await legacy.db!.collection('leaves').countDocuments()).toBe(6);
    expect(lines.at(-1)).toMatch(/^Report written to /);
  });

  it('dry run writes only the report', async () => {
    const reportDir = join(reportRoot, 'dry');
    const out = await runMigration(options({ dryRun: true, reportDir }));
    expect(out.exitCode).toBe(3);
    expect(
      (await target.db!.listCollections().toArray()).map((c) => c.name),
    ).toEqual([]);
    expect(await readReport(reportDir)).toMatchObject({
      dryRun: true,
      migrated: { users: 2, placeholderUsers: 2, leaves: 4 },
    });
  });

  it('exits 0 for clean input', async () => {
    await legacy
      .db!.collection('users')
      .deleteMany({ id: { $in: ['333', '444'] } });
    await legacy.db!.collection('leaves').deleteMany({
      id: { $regex: '0000000[34]$' },
    });
    const out = await runMigration(
      options({ reportDir: join(reportRoot, 'clean') }),
    );
    expect(out.exitCode).toBe(0);
  });

  it('refuses a non-empty target without --replace', async () => {
    await target.db!.collection('leaves').insertOne({ id: 'existing' });
    const lines: string[] = [];
    const reportDir = join(reportRoot, 'refused');
    const out = await runMigration(
      options({ reportDir, log: (l) => lines.push(l) }),
    );
    expect(out).toEqual({ exitCode: 2 });
    expect(lines).toContain(
      'Target collections users/leaves are not empty; use --replace to overwrite',
    );
    expect(await target.db!.collection('leaves').countDocuments()).toBe(1);
    expect(await target.db!.collection('users').countDocuments()).toBe(0);
  });

  it('refuses a target whose audit log is not empty', async () => {
    await target.db!.collection('auditlogs').insertOne({ id: 'rehearsal' });
    const lines: string[] = [];
    const out = await runMigration(
      options({
        reportDir: join(reportRoot, 'refused-audit'),
        log: (l) => lines.push(l),
      }),
    );
    expect(out).toEqual({ exitCode: 2 });
    expect(lines).toContain(
      'Target collection auditlogs is not empty; use --replace to overwrite',
    );
  });

  it('never reads trips or places (profiler)', async () => {
    const db = legacy.db!;
    await db.command({ profile: 2 });
    try {
      await runMigration(options({ reportDir: join(reportRoot, 'profiled') }));
    } finally {
      await db.command({ profile: 0 });
    }
    const namespaces = await db
      .collection('system.profile')
      .distinct('ns', { op: { $in: ['query', 'getmore', 'command'] } });
    expect(namespaces).toContain(`${legacyName}.users`);
    expect(namespaces).toContain(`${legacyName}.leaves`);
    expect(namespaces).not.toContain(`${legacyName}.trips`);
    expect(namespaces).not.toContain(`${legacyName}.places`);
  });

  it('--replace twice gives identical documents and clears sessions', async () => {
    await target.db!.collection('refresh_tokens').insertOne({ x: 1 });
    await target.db!.collection('auditlogs').insertOne({ id: 'rehearsal' });
    await target.db!.collection('users').insertOne({ id: 'stale' });

    let clock = RUN.getTime();
    const now = () => new Date((clock += 1000));
    await runMigration(
      options({ replace: true, now, reportDir: join(reportRoot, 'r1') }),
    );
    const first = await targetDocs();
    await runMigration(
      options({ replace: true, now, reportDir: join(reportRoot, 'r2') }),
    );
    const second = await targetDocs();

    expect(await target.db!.collection('refresh_tokens').countDocuments()).toBe(
      0,
    );
    expect(await target.db!.collection('auditlogs').countDocuments()).toBe(0);
    expect(second.users.map((u) => u.id)).not.toContain('stale');
    expect(second.leaves).toEqual(first.leaves);
    // Placeholder timestamps differ by run; everything else is identical.
    const noRunTimes = (u: Record<string, unknown>) =>
      u.active
        ? u
        : { ...u, deactivatedAt: null, createdAt: null, updatedAt: null };
    expect(second.users.map(noRunTimes)).toEqual(first.users.map(noRunTimes));
  });

  it('refuses when source and target are the same database', async () => {
    const out = await runMigration(
      options({ mongoUrl: databaseUrl(legacyName) }),
    );
    expect(out.exitCode).toBe(2);
  });

  it('exits 1 when a database is unreachable', async () => {
    const out = await runMigration(
      options({
        mongoUrl: 'mongodb://127.0.0.1:1/x?serverSelectionTimeoutMS=500',
      }),
    );
    expect(out.exitCode).toBe(1);
  });
});
