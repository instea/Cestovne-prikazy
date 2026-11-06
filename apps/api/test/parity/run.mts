/**
 * MIG-03 attendance parity harness CLI (`pnpm parity`). Runs the OLD app
 * (production image or a build of the old source) and the NEW app image on
 * this machine against the same data and the same SSO / Toggl fixtures,
 * calls `GET /api/attendence/:year/:month` on both for the month set and
 * writes `parity-report/parity-report.{md,json}`. Local / CI only, never in
 * the production cluster.
 *
 * Synthetic (default, CI): committed dataset (`synthetic.mts`), seeded with
 * `mongoimport` into the old MongoDB 3.6 (`cestaky`) and into the new
 * MongoDB 8 (`cestaky_legacy`), migrated with the new image's MIG-01 CLI.
 *
 * Recorded (rehearsal, MIG-02): `--dump <old mongodump --gzip --archive>`
 * restored into both servers the same way, `--fixtures <dir>` with
 * scrubbed `sso.json` + `toggl.json` (refused if they contain real tokens),
 * and `--consumer-confirmed-by "<name, date>"` (the M2M consumer owner's
 * confirmation that it calls the endpoint server-side, recorded in the
 * report).
 *
 * Options: `--report-dir <dir>` (default parity-report), `--timeout <s>`
 * (default 120), `--now YYYY-MM-DD` (defines "current month"), `--keep`
 * (leave the stack and work dir for debugging), `--old-image <ref>` /
 * `PARITY_OLD_IMAGE`, `--old-ref <git ref>` (default 193b89f, used to build
 * the old image when no image is given), `--new-image <ref>` /
 * `PARITY_NEW_IMAGE` (default: build the repo Dockerfile).
 * Exit: 0 passed, 1 diffs / errors / unmatched requests, 2 refused.
 * Requires docker (compose v2), git and openssl.
 */
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isWorkingDay } from '@leaves/shared/workdays';
import mongoose from 'mongoose';
import {
  buildContext,
  eachDate,
  flattenSso,
  type LegacyLeaveDoc,
  type LegacyUserDoc,
  localDate,
  type MigrationFinding,
} from './context.mts';
import type { FixtureSet, TogglFixture } from './fixtures.mts';
import { loadFixtures, runParity } from './harness.mts';
import { daysOf, effectiveMonths, parityRequests } from './months.mts';
import { buildReport, writeReport } from './report.mts';
import { scanFixtureSet } from './secrets.mts';
import {
  legacyDocuments,
  OLD_NON_FINITE_DATE,
  syntheticFixtureSet,
  TIMEZONE,
} from './synthetic.mts';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../../../..');
const COMPOSE_FILE = join(HERE, 'docker-compose.parity.yml');
const OLD_REF_DEFAULT = '193b89f';
const M2M = { username: 'parity-m2m', password: 'parity:secret' };
const PORTS = { mock: 14100, old: 14101, new: 14102, newMongo: 14117 };

export const EXIT_PASSED = 0;
export const EXIT_FAILED = 1;
export const EXIT_REFUSED = 2;

class Refused extends Error {}

interface Args {
  reportDir: string;
  timeoutMs: number;
  now: Date;
  keep: boolean;
  oldImage: string | undefined;
  oldRef: string;
  newImage: string | undefined;
  fixtures: string | undefined;
  dump: string | undefined;
  consumerConfirmedBy: string | undefined;
}

export function parseArgs(argv: readonly string[], env = process.env): Args {
  const args: Args = {
    reportDir: 'parity-report',
    timeoutMs: 120_000,
    now: new Date(),
    keep: false,
    oldImage: env.PARITY_OLD_IMAGE || undefined,
    oldRef: OLD_REF_DEFAULT,
    newImage: env.PARITY_NEW_IMAGE || undefined,
    fixtures: undefined,
    dump: undefined,
    consumerConfirmedBy: undefined,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const value = () => {
      const v = argv[++i];
      if (v === undefined || v.startsWith('--'))
        throw new Refused(`${a} needs a value`);
      return v;
    };
    if (a === '--report-dir') args.reportDir = value();
    else if (a === '--timeout') args.timeoutMs = Number(value()) * 1000;
    else if (a === '--now') args.now = new Date(`${value()}T12:00:00Z`);
    else if (a === '--keep') args.keep = true;
    else if (a === '--old-image') args.oldImage = value();
    else if (a === '--old-ref') args.oldRef = value();
    else if (a === '--new-image') args.newImage = value();
    else if (a === '--fixtures') args.fixtures = value();
    else if (a === '--dump') args.dump = value();
    else if (a === '--consumer-confirmed-by')
      args.consumerConfirmedBy = value();
    else throw new Refused(`Unknown argument: ${a}`);
  }
  if (!Number.isFinite(args.timeoutMs) || args.timeoutMs <= 0)
    throw new Refused('--timeout must be a positive number of seconds');
  if (Number.isNaN(args.now.getTime()))
    throw new Refused('--now must be YYYY-MM-DD');
  if (Boolean(args.fixtures) !== Boolean(args.dump))
    throw new Refused(
      '--fixtures and --dump go together (recorded rehearsal run)',
    );
  if (args.fixtures && !args.consumerConfirmedBy)
    throw new Refused(
      'A rehearsal run needs --consumer-confirmed-by "<name, date>": the M2M consumer owner confirms it calls the endpoint server-side (no CORS on the new route).',
    );
  return args;
}

const log = (line: string) => process.stdout.write(`[parity] ${line}\n`);

interface ShOptions {
  input?: string | Buffer;
  env?: Record<string, string>;
  capture?: boolean;
  cwd?: string;
  /** Collect stderr and print it only in the failure message. */
  quiet?: boolean;
  /** Exit codes that count as success (default `[0]`). */
  ok?: number[];
}

/** Runs a command; resolves with stdout (when captured) and exit code. */
function sh(
  cmd: string,
  args: readonly string[],
  options: ShOptions = {},
): Promise<{ stdout: string; code: number }> {
  return new Promise((done, fail) => {
    const child = spawn(cmd, args, {
      cwd: options.cwd ?? REPO,
      env: { ...process.env, ...options.env },
      stdio: [
        options.input === undefined ? 'ignore' : 'pipe',
        options.capture ? 'pipe' : 'inherit',
        options.quiet ? 'pipe' : 'inherit',
      ],
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (c: Buffer) => (stdout += c.toString('utf8')));
    child.stderr?.on('data', (c: Buffer) => (stderr += c.toString('utf8')));
    child.on('error', fail);
    child.on('close', (code) => {
      const c = code ?? 1;
      if ((options.ok ?? [0]).includes(c)) done({ stdout, code: c });
      else
        fail(
          new Error(
            `${cmd} ${args.join(' ')} exited with ${c}${stderr ? `\n${stderr}` : ''}`,
          ),
        );
    });
    if (options.input !== undefined) child.stdin?.end(options.input);
  });
}

async function imageExists(ref: string): Promise<boolean> {
  const { code } = await sh('docker', ['image', 'inspect', ref], {
    capture: true,
    quiet: true,
    ok: [0, 1],
  });
  return code === 0;
}

/** Old image: given (pulled if missing) or built from the old source. */
async function oldImage(args: Args, work: string): Promise<string> {
  if (args.oldImage) {
    if (!(await imageExists(args.oldImage)))
      await sh('docker', ['pull', args.oldImage]);
    return args.oldImage;
  }
  const tag = `cestaky-old:parity-${args.oldRef.replace(/[^\w.-]/g, '_')}`;
  if (await imageExists(tag)) return tag;
  log(`building the old app image ${tag} from git ${args.oldRef}`);
  const ctx = join(work, 'old-build');
  await mkdir(ctx, { recursive: true });
  // `git archive` output is binary: pipe it straight into tar.
  await sh('sh', [
    '-c',
    `git archive --format=tar ${args.oldRef} package.json yarn.lock server src | tar -x -C "${ctx}"`,
  ]);
  await writeFile(
    join(ctx, 'Dockerfile'),
    await readFile(join(HERE, 'old-app.Dockerfile')),
  );
  await sh('docker', ['build', '-q', '-t', tag, ctx]);
  return tag;
}

async function newImage(args: Args): Promise<string> {
  if (args.newImage) {
    if (!(await imageExists(args.newImage)))
      await sh('docker', ['pull', args.newImage]);
    return args.newImage;
  }
  const tag = 'cestaky-leaves:parity';
  log(`building the new app image ${tag} from the working tree`);
  await sh('docker', [
    'build',
    '-q',
    '--build-arg',
    'APP_VERSION=0.0.0-parity',
    '-t',
    tag,
    REPO,
  ]);
  return tag;
}

/** Harness CA + a certificate for api.track.toggl.com (old app's Toggl). */
async function makeCerts(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
  const o = (...a: string[]) =>
    sh('openssl', a, { cwd: dir, capture: true, quiet: true });
  await o(
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-days',
    '2',
    '-keyout',
    'ca.key',
    '-out',
    'ca.crt',
    '-subj',
    '/CN=Leaves parity harness CA',
    '-addext',
    'basicConstraints=critical,CA:TRUE',
    '-addext',
    'keyUsage=critical,keyCertSign,cRLSign',
  );
  await o(
    'req',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-keyout',
    'server.key',
    '-out',
    'server.csr',
    '-subj',
    '/CN=api.track.toggl.com',
  );
  await writeFile(
    join(dir, 'ext.cnf'),
    'subjectAltName=DNS:api.track.toggl.com\nbasicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n',
  );
  await o(
    'x509',
    '-req',
    '-in',
    'server.csr',
    '-CA',
    'ca.crt',
    '-CAkey',
    'ca.key',
    '-CAcreateserial',
    '-out',
    'server.crt',
    '-days',
    '2',
    '-extfile',
    'ext.cnf',
  );
  await chmod(join(dir, 'server.key'), 0o644);
}

async function loadRecordedFixtures(dir: string): Promise<FixtureSet> {
  const sso = JSON.parse(
    await readFile(join(dir, 'sso.json'), 'utf8'),
  ) as FixtureSet['sso'];
  const toggl = JSON.parse(
    await readFile(join(dir, 'toggl.json'), 'utf8'),
  ) as TogglFixture[];
  const set = { sso, toggl };
  const problems = scanFixtureSet(set);
  if (problems.length > 0)
    throw new Refused(
      `Recorded fixtures contain secrets (scrub them first):\n- ${problems.join('\n- ')}`,
    );
  return set;
}

async function waitFor(
  url: string,
  init: RequestInit,
  ok: (s: number) => boolean,
  what: string,
): Promise<void> {
  const deadline = Date.now() + 180_000;
  for (;;) {
    try {
      const res = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(5000),
      });
      if (ok(res.status)) return;
    } catch {
      // not up yet
    }
    if (Date.now() > deadline)
      throw new Error(`${what} did not become ready (${url})`);
    await new Promise((r) => setTimeout(r, 1000));
  }
}

/** Old app's non-working days (weekend or any date-holidays 1.2.0 SK holiday). */
async function oldNonWorking(
  compose: (a: string[], o?: ShOptions) => ReturnType<typeof sh>,
  from: string,
  to: string,
  tz: string,
): Promise<Set<string>> {
  const script = `
    const moment = require('moment-timezone');
    const Holidays = require('date-holidays');
    const h = new Holidays('SK');
    moment.tz.setDefault(${JSON.stringify(tz)});
    const m = moment.tz(${JSON.stringify(from)}, ${JSON.stringify(tz)});
    const end = moment.tz(${JSON.stringify(to)}, ${JSON.stringify(tz)});
    const out = [];
    while (m <= end) {
      if (m.isoWeekday() >= 6 || h.isHoliday(m.toDate())) out.push(m.format('YYYY-MM-DD'));
      m.add(1, 'day');
    }
    process.stdout.write(JSON.stringify(out));`;
  const { stdout } = await compose(
    ['exec', '-T', 'old-app', 'node', '-e', script],
    { capture: true },
  );
  return new Set(JSON.parse(stdout) as string[]);
}

export async function main(argv: readonly string[]): Promise<number> {
  const startedAt = new Date().toISOString();
  let args: Args;
  try {
    args = parseArgs(argv);
  } catch (e) {
    process.stderr.write(`${(e as Error).message}\n`);
    return EXIT_REFUSED;
  }

  let recorded: FixtureSet | undefined;
  try {
    if (args.fixtures)
      recorded = await loadRecordedFixtures(resolve(args.fixtures));
  } catch (e) {
    process.stderr.write(`${(e as Error).message}\n`);
    return e instanceof Refused ? EXIT_REFUSED : EXIT_FAILED;
  }

  const work = await mkdtemp(join(tmpdir(), 'leaves-parity-'));
  const project = `leaves-parity-${randomBytes(3).toString('hex')}`;
  const timezone = TIMEZONE;
  const env: Record<string, string> = {
    PARITY_WORK_DIR: work,
    PARITY_TIMEZONE: timezone,
    PARITY_MOCK_PORT: String(PORTS.mock),
    PARITY_OLD_PORT: String(PORTS.old),
    PARITY_NEW_PORT: String(PORTS.new),
    PARITY_NEW_MONGO_PORT: String(PORTS.newMongo),
  };
  const compose = (a: string[], o: ShOptions = {}) =>
    sh(
      'docker',
      [
        'compose',
        '-p',
        project,
        '-f',
        COMPOSE_FILE,
        '--profile',
        'parity',
        ...a,
      ],
      { ...o, env: { ...env, ...o.env } },
    );

  let conn: mongoose.Connection | undefined;
  try {
    const [oldTag, newTag] = [await oldImage(args, work), await newImage(args)];
    env.PARITY_OLD_IMAGE = oldTag;
    env.PARITY_NEW_IMAGE = newTag;
    for (const d of ['seed', 'secrets', 'migration-report'])
      await mkdir(join(work, d), { recursive: true });
    await chmod(join(work, 'migration-report'), 0o777);
    await chmod(join(work, 'seed'), 0o755);
    await makeCerts(join(work, 'certs'));
    // The old app reads an HMAC key at boot (unused by attendance).
    await writeFile(
      join(work, 'secrets', 'key.pem'),
      randomBytes(32).toString('hex'),
    );

    log(
      `starting databases and the mock (project ${project}, work dir ${work})`,
    );
    await compose(['up', '-d', '--wait', 'old-mongo', 'new-mongo', 'mock']);

    // Same data into the old server and the new server's legacy database.
    if (args.dump) {
      await sh('cp', [resolve(args.dump), join(work, 'seed', 'dump.gz')]);
      await compose([
        'exec',
        '-T',
        'old-mongo',
        'mongorestore',
        '--quiet',
        '--gzip',
        '--archive=/seed/dump.gz',
      ]);
      await compose([
        'exec',
        '-T',
        'new-mongo',
        'mongorestore',
        '--quiet',
        '--gzip',
        '--archive=/seed/dump.gz',
        '--nsInclude',
        'cestaky.users',
        '--nsInclude',
        'cestaky.leaves',
        '--nsFrom',
        'cestaky.*',
        '--nsTo',
        'cestaky_legacy.*',
        '--noIndexRestore',
      ]);
    } else {
      const docs = legacyDocuments();
      await writeFile(
        join(work, 'seed', 'users.json'),
        JSON.stringify(docs.users),
      );
      await writeFile(
        join(work, 'seed', 'leaves.json'),
        JSON.stringify(docs.leaves),
      );
      for (const [service, db] of [
        ['old-mongo', 'cestaky'],
        ['new-mongo', 'cestaky_legacy'],
      ] as const)
        for (const c of ['users', 'leaves'])
          await compose([
            'exec',
            '-T',
            service,
            'mongoimport',
            '--quiet',
            '--db',
            db,
            '--collection',
            c,
            '--jsonArray',
            '--file',
            `/seed/${c}.json`,
          ]);
    }

    log('migrating the legacy data with the new image (MIG-01)');
    const migration = await compose(
      ['--profile', 'parity-migrate', 'run', '--rm', 'migrate'],
      { ok: [0, 3] },
    );
    log(`migration finished with exit code ${migration.code}`);
    const reportPath = join(work, 'migration-report', 'report.json');
    const migrationReport = JSON.parse(await readFile(reportPath, 'utf8')) as {
      findings: MigrationFinding[];
    };

    log('starting both apps');
    await compose(['up', '-d', '--wait', 'old-app', 'new-app']);
    const oldUrl = `http://127.0.0.1:${PORTS.old}`;
    const newUrl = `http://127.0.0.1:${PORTS.new}`;
    const mockUrl = `http://127.0.0.1:${PORTS.mock}`;
    const auth = {
      Authorization: `Basic ${Buffer.from(`${M2M.username}:${M2M.password}`).toString('base64')}`,
    };
    await waitFor(
      `${oldUrl}/api/attendence/x/x`,
      { headers: auth },
      (s) => s === 400,
      'old app',
    );
    await waitFor(
      `${newUrl}/api/attendence/x/x`,
      { headers: auth },
      (s) => s === 400,
      'new app',
    );

    // Dataset as the old app sees it (legacy collections in the new server).
    conn = await mongoose
      .createConnection(
        `mongodb://127.0.0.1:${PORTS.newMongo}/cestaky_legacy?directConnection=true`,
        { serverSelectionTimeoutMS: 10_000 },
      )
      .asPromise();
    const users = await conn.collection('users').find().toArray();
    const leaves = await conn
      .collection('leaves')
      .find()
      .sort({ _id: 1 })
      .toArray();
    const starts = leaves
      .map((l) => localDate(l.startDate, timezone))
      .filter((d): d is string => d !== null)
      .sort();
    const requests = parityRequests(starts[0] ?? null, args.now);
    const months = effectiveMonths(requests);

    // Fixtures: recorded set, or the synthetic one generated for these months
    // (plus the old app's requests for non-finite params, see synthetic.mts).
    const fixtures =
      recorded ??
      syntheticFixtureSet(months, [
        { startDate: OLD_NON_FINITE_DATE, endDate: OLD_NON_FINITE_DATE },
      ]);
    await loadFixtures(mockUrl, fixtures);

    // Old vs new non-working days over every date the comparison can touch
    // (the requested months and every leave: the old loop walks whole leaves).
    const ends = leaves
      .map((l) => localDate(l.endDate, timezone))
      .filter((d): d is string => d !== null);
    const monthDays = months.flatMap((m) => [
      daysOf(m.year, m.month)[0]!,
      daysOf(m.year, m.month).at(-1)!,
    ]);
    const span = [...starts, ...ends, ...monthDays].sort();
    const from = span[0]!;
    const toEnd = span[span.length - 1]!;
    const dates = eachDate(from, toEnd);
    const oldNW = await oldNonWorking(compose, from, toEnd, timezone);
    const sso = flattenSso(fixtures.sso.response.body);
    const context = buildContext({
      sso,
      users: users as LegacyUserDoc[],
      leaves: leaves as LegacyLeaveDoc[],
      timezone,
      oldNonWorking: oldNW,
      newIsWorkingDay: isWorkingDay,
      dates,
      findings: migrationReport.findings,
    });

    log(
      `comparing ${requests.length} requests (timeout ${args.timeoutMs / 1000} s each)`,
    );
    const result = await runParity({
      oldUrl,
      newUrl,
      mockControlUrl: mockUrl,
      requests,
      m2m: M2M,
      context,
      timeoutMs: args.timeoutMs,
      log,
    });

    const report = buildReport(
      {
        startedAt,
        finishedAt: new Date().toISOString(),
        dataset: recorded ? 'recorded' : 'synthetic',
        oldImage: oldTag,
        newImage: newTag,
        timezone,
        consumerServerSide: {
          confirmed: Boolean(args.consumerConfirmedBy),
          by: args.consumerConfirmedBy ?? null,
        },
        context: {
          holidayMismatch: [...context.holidayMismatch].sort(),
          hangMonths: [...context.hangMonths].sort(),
          longLeaveUsers: [...context.longLeaves.keys()],
          migrationReportedUsers: [...context.migrationReported.keys()],
        },
        migrationReport: reportPath,
      },
      result,
    );
    const reportDir = resolve(args.reportDir);
    await mkdir(reportDir, { recursive: true });
    await writeFile(
      join(reportDir, 'migration-report.json'),
      await readFile(reportPath),
    );
    const files = await writeReport(reportDir, {
      ...report,
      migrationReport: join(reportDir, 'migration-report.json'),
    });
    log(
      `${Object.entries(report.counts)
        .map(([k, v]) => `${k} ${v}`)
        .join(', ')}; unmatched ${result.unmatched.length}`,
    );
    log(`report: ${files.join(', ')}`);
    log(report.passed ? 'PASSED' : 'FAILED');
    return report.passed ? EXIT_PASSED : EXIT_FAILED;
  } catch (e) {
    process.stderr.write(`[parity] ${(e as Error).stack ?? String(e)}\n`);
    return e instanceof Refused ? EXIT_REFUSED : EXIT_FAILED;
  } finally {
    await conn?.close().catch(() => undefined);
    if (args.keep) {
      log(`--keep: stack ${project} and work dir ${work} left running`);
    } else {
      await compose(
        ['--profile', 'parity-migrate', 'down', '-v', '--remove-orphans'],
        { capture: true, ok: [0, 1] },
      ).catch(() => undefined);
      await rm(work, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

if (
  process.argv[1] &&
  import.meta.url === new URL(`file://${resolve(process.argv[1])}`).href
)
  void main(process.argv.slice(2)).then((code) => process.exit(code));
