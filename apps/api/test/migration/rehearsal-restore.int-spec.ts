import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { gunzipSync } from 'node:zlib';
import {
  GenericContainer,
  type StartedTestContainer,
  Wait,
} from 'testcontainers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  EXIT_OK,
  runAnonymize,
} from '../../src/migration/anonymize/anonymize-runner';
import type { MigrationReport } from '../../src/migration/report';
import { runMigration } from '../../src/migration/runner';
import { MONGO_TEST_IMAGE } from '../support/global-setup';

/**
 * MIG-02 rehearsal data path end to end, with the real tools:
 * 1. a `mongo:3.6` "production" database (old shapes, plus trips/places)
 *    dumped with `mongodump --gzip --archive` (as `backup.cestaky.sh` does);
 * 2. restored into a throwaway MongoDB 8 with the exact MIG-01 command
 *    (users + leaves only, as `cestaky_legacy`), verifying that path;
 * 3. anonymized into `cestaky` and dumped with `mongodump --db cestaky`;
 * 4. that anonymized dump restores into MongoDB 3.6 (old app in the parity
 *    harness) and, with the MIG-01 command, into MongoDB 8, where MIG-01
 *    reports the same findings by code as on the original.
 */

const run = promisify(execFile);
const SECRET = 'rehearsal-restore-secret-'.padEnd(48, 'x');

/** Old-shaped documents in mongo shell syntax (ObjectId, ISODate, NumberInt). */
const SEED = `
db.users.insertMany([
  { _id: ObjectId("59682f010000000000000001"), id: "110248495921238986420", email: "Jana.Nova@instea.co",
    firstName: "Jana", surname: "Nová", degrees: "Ing.", address: "Hlavná 1", isAdmin: true, approved: true, __v: NumberInt(0) },
  { _id: ObjectId("59682f020000000000000002"), id: "222", email: "peter@instea.co",
    firstName: "Peter", surname: "", degrees: "", address: "", approved: false, __v: NumberInt(0) },
  { _id: ObjectId("59682f030000000000000003"), id: "333", email: "dup@instea.co", __v: NumberInt(0) },
  { _id: ObjectId("59682f040000000000000004"), id: "444", email: "DUP@instea.co", __v: NumberInt(0) }
]);
db.leaves.insertMany([
  { _id: ObjectId("5f5e10090000000000000009"), id: "5f0c1e2d-3b4a-4c5d-8e9f-000000000009", requesterId: "110248495921238986420",
    approverId: "110248495921238986420", startDate: ISODate("2024-03-10T23:00:00Z"), endDate: ISODate("2024-03-12T23:00:00Z"),
    isHalfDay: false, type: "DOCTOR", state: "APPROVED", numDays: 3, __v: NumberInt(0) },
  { _id: ObjectId("5f5e10010000000000000001"), id: "5f0c1e2d-3b4a-4c5d-8e9f-000000000001", requesterId: "gone",
    approverId: "gone-admin", startDate: ISODate("2024-03-10T23:00:00Z"), endDate: ISODate("2024-03-12T23:00:00Z"),
    isHalfDay: false, state: "APPROVED", numDays: 2, __v: NumberInt(0) },
  { _id: ObjectId("5f5e10020000000000000002"), id: "5f0c1e2d-3b4a-4c5d-8e9f-000000000002", requesterId: "333",
    startDate: ISODate("2024-03-11T08:00:00Z"), endDate: ISODate("2024-03-08T23:00:00Z"),
    isHalfDay: false, type: "ANNUAL", __v: NumberInt(0) },
  { _id: ObjectId("5f5e10030000000000000003"), id: "5f0c1e2d-3b4a-4c5d-8e9f-000000000003", requesterId: "222",
    startDate: ISODate("2024-07-14T22:00:00Z"), endDate: ISODate("2024-07-14T22:00:00Z"),
    isHalfDay: true, type: "ANNUAL", state: "PENDING", numDays: 0.5, __v: NumberInt(0) }
]);
db.trips.insertOne({ junk: "Jana's trip" });
db.places.insertOne({ name: "Bratislava" });
`;

async function exec(c: StartedTestContainer, cmd: string[]): Promise<string> {
  const r = await c.exec(cmd);
  if (r.exitCode !== 0)
    throw new Error(`${cmd.join(' ')} → ${r.exitCode}: ${r.output}`);
  return r.output;
}

/** `docker cp` between two containers through the host. */
async function copy(
  from: StartedTestContainer,
  to: StartedTestContainer,
  path: string,
  dir: string,
) {
  const local = join(dir, path.replaceAll('/', '_'));
  await run('docker', ['cp', `${from.getId()}:${path}`, local]);
  await run('docker', ['cp', local, `${to.getId()}:${path}`]);
}

const MIG01_RESTORE = (archive: string, db: string) => [
  'mongorestore',
  '--quiet',
  '--nsInclude',
  'cestaky.users',
  '--nsInclude',
  'cestaky.leaves',
  '--nsFrom',
  'cestaky.*',
  '--nsTo',
  `${db}.*`,
  '--noIndexRestore',
  '--gzip',
  `--archive=${archive}`,
];

describe('rehearsal data path: mongo 3.6 dump → MongoDB 8 → anonymized dump (MIG-02)', () => {
  let old: StartedTestContainer;
  let mongo8: StartedTestContainer;
  let dir: string;
  let url: (db: string) => string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'mig02-restore-'));
    [old, mongo8] = await Promise.all([
      new GenericContainer('mongo:3.6')
        .withWaitStrategy(Wait.forLogMessage(/waiting for connections/))
        .start(),
      new GenericContainer(MONGO_TEST_IMAGE)
        .withExposedPorts(27017)
        .withWaitStrategy(Wait.forLogMessage(/Waiting for connections/))
        .start(),
    ]);
    url = (db) =>
      `mongodb://${mongo8.getHost()}:${mongo8.getMappedPort(27017)}/${db}?directConnection=true`;
    await exec(old, ['mongo', '--quiet', 'cestaky', '--eval', SEED]);
    await exec(old, [
      'mongodump',
      '--quiet',
      '--db',
      'cestaky',
      '--gzip',
      '--archive=/tmp/prod.gz',
    ]);
    await copy(old, mongo8, '/tmp/prod.gz', dir);
  }, 240_000);

  afterAll(async () => {
    await Promise.allSettled([old?.stop(), mongo8?.stop()]);
    await rm(dir, { recursive: true, force: true });
  });

  const count = async (
    c: StartedTestContainer,
    shell: string,
    db: string,
    expr: string,
  ) => (await exec(c, [shell, '--quiet', db, '--eval', expr])).trim();

  it('restores the prod dump into cestaky_legacy with the MIG-01 command (users + leaves only)', async () => {
    await exec(mongo8, MIG01_RESTORE('/tmp/prod.gz', 'cestaky_legacy'));
    const names = await count(
      mongo8,
      'mongosh',
      'cestaky_legacy',
      'db.getCollectionNames().sort().join(",")',
    );
    expect(names).toBe('leaves,users');
    expect(
      await count(
        mongo8,
        'mongosh',
        'cestaky_legacy',
        'db.leaves.countDocuments({numDays: {$type: "double"}})',
      ),
    ).toBe('3');
  });

  it('anonymizes, dumps cestaky, and the dump restores into MongoDB 3.6 and 8', async () => {
    const log: string[] = [];
    expect(
      await runAnonymize({
        secret: SECRET,
        sourceUrl: url('cestaky_legacy'),
        targetUrl: url('cestaky'),
        timezone: 'Europe/Bratislava',
        replace: false,
        allowFindingDrift: false,
        log: (l) => log.push(l),
      }),
    ).toBe(EXIT_OK);
    expect(log).toContain('MIG-01 finding counts by code are unchanged');

    await exec(mongo8, [
      'mongodump',
      '--quiet',
      '--db',
      'cestaky',
      '--gzip',
      '--archive=/tmp/anon.gz',
    ]);
    // Old app side of the parity harness: restore as is into MongoDB 3.6.
    await copy(mongo8, old, '/tmp/anon.gz', dir);
    // BSON keeps strings as UTF-8 bytes: search the decompressed archive.
    const archive = gunzipSync(await readFile(join(dir, '_tmp_anon.gz')));
    for (const pii of [
      'Jana',
      'Nová',
      'Peter',
      'Hlavná',
      'Ing.',
      '110248495921238986420',
      'dup@instea.co',
      'gone-admin',
    ])
      expect(archive.includes(Buffer.from(pii)), pii).toBe(false);
    expect(archive.includes(Buffer.from('@instea.co'))).toBe(true);

    await exec(old, [
      'mongorestore',
      '--quiet',
      '--drop',
      '--gzip',
      '--archive=/tmp/anon.gz',
    ]);
    expect(
      await count(
        old,
        'mongo',
        'cestaky',
        'db.users.count() + "/" + db.leaves.count()',
      ),
    ).toBe('4/4');
    expect(
      await count(
        old,
        'mongo',
        'cestaky',
        'db.users.find({ email: /^(User|user)-[0-9a-f]{12}@instea\\.co$/ }).count()',
      ),
    ).toBe('4');

    // New app side: the MIG-01 restore command into MongoDB 8.
    await exec(mongo8, MIG01_RESTORE('/tmp/anon.gz', 'cestaky_anon_legacy'));
    expect(
      await count(
        mongo8,
        'mongosh',
        'cestaky_anon_legacy',
        'db.users.countDocuments()',
      ),
    ).toBe('4');
  });

  it('MIG-01 finds the same findings by code on the restored anonymized dump', async () => {
    const report = async (db: string) => {
      const reportDir = join(dir, db);
      await runMigration({
        legacyMongoUrl: url(db),
        mongoUrl: url(`${db}_target`),
        timezone: 'Europe/Bratislava',
        dryRun: true,
        replace: false,
        reportDir,
      });
      return JSON.parse(
        await readFile(join(reportDir, 'report.json'), 'utf8'),
      ) as MigrationReport;
    };
    const original = await report('cestaky_legacy');
    const anonymized = await report('cestaky_anon_legacy');
    expect(anonymized.findingsByCode).toEqual(original.findingsByCode);
    expect(anonymized.skipped).toEqual(original.skipped);
    expect(original.findingsByCode.USER_DUPLICATE_EMAIL).toBe(2);
  });
});
