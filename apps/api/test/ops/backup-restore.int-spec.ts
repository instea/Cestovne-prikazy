import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import {
  GenericContainer,
  type StartedTestContainer,
  Wait,
} from 'testcontainers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  containerNamed,
  findObject,
  loadManifest,
  type StatefulSet,
} from './k8s';

/**
 * OPS-02: runs copies of `deploy/backup.sh` and `deploy/restore.sh` with the
 * `KUBECTL` constant replaced by a wrapper that maps `get pod` / `exec` /
 * `cp` to docker on a mongo container started with the root user env (as
 * the `mongo8-sfset` pod gets it from the Secret), and `BACKUPS_DIR`
 * pointed at a temp directory.
 */

const run = promisify(execFile);
const DEPLOY = resolve(__dirname, '../../../../deploy');

const sts = findObject<StatefulSet>(
  loadManifest('mongo8.yml'),
  'StatefulSet',
  'mongo8-sfset',
);
const IMAGE = containerNamed(sts.spec.template.spec, 'mongo8').image;
const ROOT = { user: 'root', password: randomBytes(12).toString('hex') };

/**
 * Fake `kubectl`: `get pod -l app=mongo8 …` prints `$FAKE_POD` (empty =
 * no pod), `exec POD [-c C] -- cmd…` → `docker exec`, `cp [-c C] A B` →
 * `docker cp` (the `pod:` prefix is the container name).
 */
const FAKE_KUBECTL = `#!/usr/bin/env bash
set -euo pipefail
cmd="$1"; shift
case "$cmd" in
  get)
    [ "$*" = "pod -l app=mongo8 -o jsonpath={.items[0].metadata.name}" ] || { echo "unexpected get: $*" >&2; exit 64; }
    [ -n "\${FAKE_POD:-}" ] || { echo "error: array index out of bounds" >&2; exit 1; }
    printf '%s' "$FAKE_POD" ;;
  exec)
    pod="$1"; shift
    [ "$1" = "-c" ] && shift 2
    [ "$1" = "--" ] && shift
    exec docker exec -i "$pod" "$@" ;;
  cp)
    [ "$1" = "-c" ] && shift 2
    exec docker cp -q "$1" "$2" ;;
  *) echo "unexpected kubectl $cmd" >&2; exit 64 ;;
esac
`;

interface Result {
  code: number;
  stdout: string;
  stderr: string;
}

describe('deploy/backup.sh and deploy/restore.sh (OPS-02)', () => {
  let container: StartedTestContainer;
  let work: string;
  let backupsDir: string;
  let backupScript: string;
  let restoreScript: string;

  const mongosh = async (script: string): Promise<string> => {
    const r = await container.exec([
      'mongosh',
      '--quiet',
      '-u',
      ROOT.user,
      '-p',
      ROOT.password,
      '--authenticationDatabase',
      'admin',
      '--eval',
      script,
    ]);
    if (r.exitCode !== 0) throw new Error(r.output);
    return r.stdout.trim();
  };

  const counts = (db: string) =>
    mongosh(
      `const d = db.getSiblingDB('${db}');` +
        `print(JSON.stringify(Object.fromEntries(d.getCollectionNames().sort().map(c => [c, d[c].countDocuments()]))))`,
    ).then((s) => JSON.parse(s) as Record<string, number>);

  const script = async (
    path: string,
    args: string[] = [],
    opts: { pod?: string; input?: string } = {},
  ): Promise<Result> => {
    const env = {
      ...process.env,
      FAKE_POD: opts.pod ?? container.getName().replace(/^\//, ''),
    };
    const child = execFile('bash', [path, ...args], { env, cwd: work });
    child.stdin?.end(opts.input ?? '');
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (d: string) => (stdout += d));
    child.stderr?.on('data', (d: string) => (stderr += d));
    const code = await new Promise<number>((res) =>
      child.on('close', (c) => res(c ?? -1)),
    );
    return { code, stdout, stderr };
  };

  const backups = () =>
    readdirSync(backupsDir).filter((f) => /^cestaky-.*\.gz$/.test(f));

  beforeAll(async () => {
    work = mkdtempSync(join(tmpdir(), 'leaves-backup-'));
    backupsDir = join(work, 'dumps', 'mongo8');

    const kubectl = join(work, 'kubectl');
    writeFileSync(kubectl, FAKE_KUBECTL);
    chmodSync(kubectl, 0o755);

    const copy = (name: string) => {
      const src = readFileSync(join(DEPLOY, name), 'utf8');
      const out = src
        .replace(/^KUBECTL=.*$/m, `KUBECTL="${kubectl}"`)
        .replace(/^BACKUPS_DIR=.*$/m, `BACKUPS_DIR="${backupsDir}"`);
      expect(out).toContain(`KUBECTL="${kubectl}"`);
      const path = join(work, name);
      writeFileSync(path, out);
      return path;
    };
    backupScript = copy('backup.sh');
    restoreScript = copy('restore.sh');

    container = await new GenericContainer(IMAGE)
      .withEnvironment({
        MONGO_INITDB_ROOT_USERNAME: ROOT.user,
        MONGO_INITDB_ROOT_PASSWORD: ROOT.password,
      })
      // The entrypoint's temporary init mongod logs this line too.
      .withWaitStrategy(Wait.forLogMessage(/Waiting for connections/, 2))
      .start();

    await mongosh(`
      const d = db.getSiblingDB('cestaky');
      d.users.insertMany([{ id: 'u1' }, { id: 'u2' }, { id: 'u3' }]);
      d.leaves.insertMany(Array.from({ length: 25 }, (_, i) => ({ id: 'l' + i })));
      d.auditlogs.insertOne({ id: 'a1' });
      db.getSiblingDB('other').things.insertOne({ x: 1 });
    `);
  }, 180_000);

  afterAll(async () => {
    await container?.stop();
    if (work) rmSync(work, { recursive: true, force: true });
  });

  it('contains no credential literals', () => {
    for (const name of ['backup.sh', 'restore.sh']) {
      const src = readFileSync(join(DEPLOY, name), 'utf8');
      expect(src).not.toMatch(/--password\s+[^"\s]/);
      expect(src).not.toMatch(/--username\s+[^"\s]/);
      expect(src).not.toMatch(/PASS(WORD)?=/);
      expect(src).not.toMatch(/set -[a-z]*x/);
    }
  });

  it('backs up to <dir>/cestaky-<timestamp>.gz, valid gzip, and applies retention', async () => {
    mkdirSync(backupsDir, { recursive: true });
    const old = join(backupsDir, 'cestaky-2000-01-01-0000.gz');
    const recent = join(backupsDir, 'cestaky-2000-01-02-0000.gz');
    const keepOther = join(backupsDir, 'notes.txt');
    for (const f of [old, recent, keepOther]) writeFileSync(f, 'x');
    const day = 24 * 3600;
    const now = Date.now() / 1000;
    utimesSync(old, now - 15 * day, now - 15 * day);
    utimesSync(recent, now - 13 * day, now - 13 * day);
    utimesSync(keepOther, now - 30 * day, now - 30 * day);

    const r = await script(backupScript);
    expect(r.code, r.stderr).toBe(0);
    expect(r.stdout + r.stderr).not.toContain(ROOT.password);

    const created = backups().filter(
      (f) =>
        /^cestaky-\d{4}-\d{2}-\d{2}-\d{4}\.gz$/.test(f) &&
        !f.startsWith('cestaky-2000'),
    );
    expect(created).toHaveLength(1);
    const archive = join(backupsDir, created[0]!);
    expect(r.stdout).toContain(archive);
    await expect(run('gzip', ['-t', archive])).resolves.toBeDefined();

    expect(existsSync(old)).toBe(false);
    expect(existsSync(recent)).toBe(true);
    expect(existsSync(keepOther)).toBe(true);
    // No partial files left behind, none in the pod.
    expect(readdirSync(backupsDir).some((f) => f.endsWith('.partial'))).toBe(
      false,
    );
    const inPod = await container.exec(['ls', '/tmp']);
    expect(inPod.stdout).not.toContain('backup.dump.gz');
  }, 120_000);

  it('restores into cestaky-restore with the same collections and counts', async () => {
    const [archive] = backups().filter((f) => !f.startsWith('cestaky-2000'));
    const source = await counts('cestaky');
    expect(source).toEqual({ auditlogs: 1, leaves: 25, users: 3 });

    const r = await script(restoreScript, [join(backupsDir, archive!)]);
    expect(r.code, r.stderr).toBe(0);
    expect(await counts('cestaky-restore')).toEqual(source);
    // Only the cestaky database was in the archive.
    expect(await counts('other-restore')).toEqual({});

    // Insert-only without --drop; --drop replaces.
    await mongosh(
      `db.getSiblingDB('cestaky-restore').users.insertOne({ id: 'extra' })`,
    );
    const again = await script(restoreScript, [
      '--drop',
      join(backupsDir, archive!),
    ]);
    expect(again.code, again.stderr).toBe(0);
    expect(await counts('cestaky-restore')).toEqual(source);
  }, 120_000);

  it('refuses the live database without --force-live', async () => {
    const [archive] = backups().filter((f) => !f.startsWith('cestaky-2000'));
    await mongosh(`db.getSiblingDB('cestaky').users.insertOne({ id: 'u4' })`);
    const r = await script(restoreScript, [
      join(backupsDir, archive!),
      'cestaky',
    ]);
    expect(r.code).not.toBe(0);
    expect(r.stderr).toContain('--force-live');

    const wrong = await script(
      restoreScript,
      ['--force-live', join(backupsDir, archive!), 'cestaky'],
      { input: 'yes\n' },
    );
    expect(wrong.code).not.toBe(0);
    expect(wrong.stderr).toContain('Confirmation did not match');
    expect((await counts('cestaky')).users).toBe(4);

    const ok = await script(
      restoreScript,
      ['--force-live', '--drop', join(backupsDir, archive!), 'cestaky'],
      { input: 'cestaky\n' },
    );
    expect(ok.code, ok.stderr).toBe(0);
    expect((await counts('cestaky')).users).toBe(3);
  }, 120_000);

  it('exits non-zero with a clear message when the pod is not found', async () => {
    const b = await script(backupScript, [], { pod: '' });
    expect(b.code).not.toBe(0);
    expect(b.stderr).toContain('No pod found with label app=mongo8');

    const [archive] = backups();
    const r = await script(restoreScript, [join(backupsDir, archive!)], {
      pod: '',
    });
    expect(r.code).not.toBe(0);
    expect(r.stderr).toContain('No pod found with label app=mongo8');
  });

  it('exits non-zero when mongodump fails (wrong pod)', async () => {
    const r = await script(backupScript, [], {
      pod: 'no-such-container-ops02',
    });
    expect(r.code).not.toBe(0);
  });
});
