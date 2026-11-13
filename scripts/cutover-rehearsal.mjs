#!/usr/bin/env node
// Node helpers of the MIG-04 local cutover rehearsal
// (scripts/cutover-rehearsal.sh). Not used in production.
//
//   node scripts/cutover-rehearsal.mjs <command> [args]
//
//   free-port                         a free TCP port on 127.0.0.1
//   seed <dir>                        MIG-03 synthetic users.json / leaves.json
//                                     (mongoimport extended JSON) into <dir>
//   manifest <what>                   prints a piece of deploy/k8s:
//                                     rs-init-js | job-script | mongo-image
//   go-no-go <report.json> [--dry-run-report <file>] [--decisions <csv>]
//                                     MIG-04 step 12 criteria; exit 1 = no-go
//   smoke --base-url <url> --mongo-url <url> --expect-leaves <n>
//         --expect-pending <n> --m2m <user:password>
//                                     MIG-04 step 13 API checks (fake Google
//                                     verifier; NODE_ENV=test app)
//   rollback-check --base-url <url> --key <key.pem> --admin-id <id>
//         --expect-users <n> --expect-leaves <n>
//                                     the OLD app serves the restored data
//
// Exit codes: 0 ok, 1 check failed, 2 usage.
import { createHmac } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { MongoClient } from 'mongodb';
import { makeDevIdToken } from './dev-login-token.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const K8S = join(ROOT, 'deploy', 'k8s');

class UsageError extends Error {}

/** `--name value` pairs (and bare flags) after the command. */
export function parseOptions(argv) {
  const options = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('--'))
        throw new UsageError(`${a} needs a value`);
      options[a.slice(2)] = v;
      i++;
    } else positional.push(a);
  }
  return { options, positional };
}

function need(options, name) {
  const v = options[name];
  if (v === undefined) throw new UsageError(`--${name} is required`);
  return v;
}

/** YAML documents of a deploy/k8s manifest (yaml package of apps/api). */
function loadManifest(file) {
  const require = createRequire(join(ROOT, 'apps', 'api', 'package.json'));
  const { parseAllDocuments } = require('yaml');
  return parseAllDocuments(readFileSync(join(K8S, file), 'utf8')).map((d) =>
    d.toJS(),
  );
}

/** One piece of the committed manifests, so the rehearsal runs the same code. */
export function manifestPiece(what) {
  if (what === 'rs-init-js') {
    const cm = loadManifest('mongo8-rs-init.yml').find(
      (o) => o.kind === 'ConfigMap',
    );
    return cm.data['init.js'];
  }
  if (what === 'job-script') {
    const job = loadManifest('migrate-legacy-job.yml').find(
      (o) => o.kind === 'Job',
    );
    const [c] = job.spec.template.spec.containers;
    if (c.command[0] !== 'sh' || c.command[1] !== '-c')
      throw new Error('migrate-legacy Job: expected command [sh, -c, script]');
    return c.command[2];
  }
  if (what === 'mongo-image') {
    const sts = loadManifest('mongo8.yml').find(
      (o) => o.kind === 'StatefulSet',
    );
    return sts.spec.template.spec.containers[0].image;
  }
  throw new UsageError(`unknown manifest piece: ${what}`);
}

function freePort() {
  return new Promise((done, fail) => {
    const server = createServer();
    server.once('error', fail);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => done(port));
    });
  });
}

async function seed(dir) {
  const synthetic = await import(
    pathToFileURL(join(ROOT, 'apps/api/test/parity/synthetic.mts')).href
  );
  const docs = synthetic.legacyDocuments();
  writeFileSync(join(dir, 'users.json'), JSON.stringify(docs.users));
  writeFileSync(join(dir, 'leaves.json'), JSON.stringify(docs.leaves));
  // Ignored collections (MIG-01 reads only users and leaves).
  writeFileSync(
    join(dir, 'trips.json'),
    JSON.stringify([{ purpose: 'not migrated' }]),
  );
  return `${docs.users.length} users, ${docs.leaves.length} leaves`;
}

/** Warning codes decided in a MIG-02 decisions.csv (`code,recordId,decision,…`). */
export function decidedCodes(csv) {
  const decided = new Set();
  const lines = csv.split(/\r?\n/).filter((l) => l.trim() !== '');
  for (const line of lines.slice(1)) {
    const [code, , decision] = line.split(',');
    if (code && decision && decision.trim() !== '') decided.add(code.trim());
  }
  return decided;
}

/**
 * MIG-04 step 12 go/no-go: exit code 0, no error findings, migrated + skipped
 * = source for users and leaves, every warning code decided (when a
 * decisions file is given), same finding codes as the dry run.
 */
export function goNoGo(report, { exitCode, dryRun, decided } = {}) {
  const checks = [];
  const check = (name, ok, detail) => checks.push({ name, ok, detail });
  if (exitCode !== undefined)
    check('migration exit code 0', exitCode === 0, `exit ${exitCode}`);
  check(
    'not a dry-run report',
    report.dryRun === false,
    `dryRun ${report.dryRun}`,
  );
  const errors = report.findings.filter((f) => f.severity === 'error');
  check(
    '0 error findings',
    errors.length === 0,
    errors.length === 0
      ? '0'
      : `${errors.length}: ${[...new Set(errors.map((e) => e.code))].join(', ')}`,
  );
  for (const c of ['users', 'leaves']) {
    const sum = report.migrated[c] + report.skipped[c];
    check(
      `${c}: migrated + skipped = source`,
      sum === report.source[c],
      `${report.migrated[c]} + ${report.skipped[c]} = ${sum}, source ${report.source[c]}`,
    );
  }
  const warningCodes = [
    ...new Set(
      report.findings
        .filter((f) => f.severity === 'warning')
        .map((f) => f.code),
    ),
  ].sort();
  if (decided) {
    const open = warningCodes.filter((c) => !decided.has(c));
    check(
      'every warning code decided (decisions.csv)',
      open.length === 0,
      open.length === 0
        ? warningCodes.join(', ') || 'none'
        : `undecided: ${open.join(', ')}`,
    );
  } else {
    check(
      'warning codes (decide each in MIG-02)',
      true,
      warningCodes.join(', ') || 'none',
    );
  }
  if (dryRun) {
    const codes = (r) => Object.keys(r.findingsByCode).sort().join(',');
    check(
      'same finding codes as the dry run',
      codes(dryRun) === codes(report),
      `dry run [${codes(dryRun)}], run [${codes(report)}]`,
    );
  }
  return { ok: checks.every((c) => c.ok), checks };
}

function printChecks(checks) {
  for (const c of checks)
    process.stdout.write(
      `  ${c.ok ? 'PASS' : 'FAIL'}  ${c.name}: ${c.detail}\n`,
    );
}

async function http(base, method, path, { token, body, basic } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (basic)
    headers.Authorization = `Basic ${Buffer.from(basic).toString('base64')}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(new URL(path, base), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = undefined;
  }
  return { status: res.status, json, text };
}

async function login(base, clientId, user) {
  const idToken = makeDevIdToken({
    sub: user.id,
    email: user.email,
    clientId,
    hostedDomain: user.email.split('@')[1],
    givenName: user.firstName || 'Rehearsal',
    familyName: user.surname || 'User',
  });
  const res = await http(base, 'POST', '/api/auth/google', {
    body: { idToken },
  });
  if (res.status !== 200)
    throw new Error(`login as ${user.id} → ${res.status} ${res.text}`);
  return res.json.accessToken;
}

async function smoke(options) {
  const base = need(options, 'base-url');
  const expectLeaves = Number(need(options, 'expect-leaves'));
  const expectPending = Number(need(options, 'expect-pending'));
  const m2m = need(options, 'm2m');
  const checks = [];
  const check = (name, ok, detail) => checks.push({ name, ok, detail });

  const client = await MongoClient.connect(need(options, 'mongo-url'));
  try {
    const users = client.db().collection('users');
    const hd = (await http(base, 'GET', '/api/auth/config')).json;
    const domain = new RegExp(
      `@${hd.hostedDomain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
      'i',
    );
    const admin = await users.findOne(
      { isAdmin: true, active: true, email: domain },
      { sort: { _id: 1 } },
    );
    const user = await users.findOne(
      { isAdmin: false, active: true, email: domain },
      { sort: { _id: 1 } },
    );
    if (!admin || !user)
      throw new Error(
        'need an active admin and an active user in the migrated data',
      );

    const health = await http(base, 'GET', '/health-check');
    check(
      'GET /health-check',
      health.status === 200,
      `${health.status} ${health.text}`,
    );

    const adminToken = await login(base, hd.googleClientId, admin);
    check('login as a migrated admin (fake Google token)', true, admin.id);
    const userToken = await login(base, hd.googleClientId, user);
    check('login as a migrated user (fake Google token)', true, user.id);

    const all = await http(base, 'GET', '/api/leaves', { token: userToken });
    check(
      '/leaves shows the migrated leave count',
      all.status === 200 && all.json.length === expectLeaves,
      `${all.status}, ${all.json?.length} leaves, expected ${expectLeaves}`,
    );
    const pending = await http(base, 'GET', '/api/leaves?state=PENDING', {
      token: adminToken,
    });
    check(
      '/approval lists the source PENDING count',
      pending.status === 200 && pending.json.length === expectPending,
      `${pending.status}, ${pending.json?.length} pending, expected ${expectPending}`,
    );

    const created = await http(base, 'POST', '/api/leaves', {
      token: userToken,
      body: { startDate: '2031-06-02', endDate: '2031-06-03', type: 'ANNUAL' },
    });
    check(
      'create a leave',
      created.status === 201 && created.json.numDays === 2,
      `${created.status} numDays ${created.json?.numDays}`,
    );
    const id = created.json?.id;
    const deleted = await http(base, 'DELETE', `/api/leaves/${id}`, {
      token: userToken,
    });
    check('delete it', deleted.status === 204, String(deleted.status));
    const after = await http(base, 'GET', '/api/leaves', { token: userToken });
    check(
      'leave count back to the migrated count',
      after.json?.length === expectLeaves,
      `${after.json?.length}`,
    );
    const audit = await http(
      base,
      'GET',
      `/api/admin/audit?targetId=${encodeURIComponent(id)}`,
      { token: adminToken },
    );
    const actions = (audit.json?.items ?? []).map((e) => e.action).sort();
    check(
      'its audit entries stay',
      audit.status === 200 && actions.length >= 2,
      `${audit.status} ${actions.join(', ')}`,
    );

    const bad = await http(base, 'GET', '/api/attendence/x/x', { basic: m2m });
    check(
      'attendance API accepts the M2M credentials',
      bad.status === 400,
      `${bad.status} for /api/attendence/x/x`,
    );
    const denied = await http(base, 'GET', '/api/attendence/2031/1', {
      basic: 'wrong:wrong',
    });
    check(
      'attendance API refuses wrong credentials',
      denied.status === 401,
      String(denied.status),
    );
  } finally {
    await client.close();
  }
  printChecks(checks);
  return checks.every((c) => c.ok) ? 0 : 1;
}

/** HS256 JWT as the old app's express-jwt accepts it (`server/auth/setup.js`). */
export function oldAppJwt(sub, key, now = Date.now()) {
  const b64 = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
  const iat = Math.floor(now / 1000);
  const input = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub, iat, exp: iat + 600 })}`;
  return `${input}.${createHmac('sha256', key).update(input).digest('base64url')}`;
}

/**
 * The OLD app (rollback) serves the restored data. Counts and the admin id
 * come from the mongo 3.6 shell: the Node driver no longer talks to 3.6.
 */
async function rollbackCheck(options) {
  const base = need(options, 'base-url');
  const key = readFileSync(need(options, 'key'));
  const adminId = need(options, 'admin-id');
  const users = Number(need(options, 'expect-users'));
  const leaves = Number(need(options, 'expect-leaves'));
  const checks = [];
  const check = (name, ok, detail) => checks.push({ name, ok, detail });
  const health = await http(base, 'GET', '/health-check');
  check(
    'old app GET /health-check',
    health.status === 200,
    `${health.status} ${health.text}`,
  );
  const res = await fetch(new URL('/graphql', base), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${oldAppJwt(adminId, key)}`,
    },
    body: JSON.stringify({
      query: '{ getUserInfo { isAdmin } getLeaves { id } getUsers { email } }',
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const json = await res.json();
  check(
    'signed in as the restored admin',
    json.data?.getUserInfo?.isAdmin === true,
    adminId,
  );
  check(
    'old app serves every restored leave (GraphQL getLeaves)',
    json.data?.getLeaves?.length === leaves,
    `${json.data?.getLeaves?.length} of ${leaves}`,
  );
  check(
    'old app serves every restored user (GraphQL getUsers)',
    json.data?.getUsers?.length === users,
    `${json.data?.getUsers?.length} of ${users}`,
  );
  printChecks(checks);
  return checks.every((c) => c.ok) ? 0 : 1;
}

export async function main(argv) {
  const [command, ...rest] = argv;
  try {
    const { options, positional } = parseOptions(rest);
    switch (command) {
      case 'free-port':
        process.stdout.write(`${await freePort()}\n`);
        return 0;
      case 'seed':
        if (!positional[0]) throw new UsageError('seed <dir>');
        process.stdout.write(`${await seed(positional[0])}\n`);
        return 0;
      case 'manifest':
        process.stdout.write(manifestPiece(positional[0]));
        return 0;
      case 'go-no-go': {
        if (!positional[0]) throw new UsageError('go-no-go <report.json>');
        const read = (f) => JSON.parse(readFileSync(f, 'utf8'));
        const result = goNoGo(read(positional[0]), {
          exitCode:
            options['exit-code'] === undefined
              ? undefined
              : Number(options['exit-code']),
          dryRun: options['dry-run-report']
            ? read(options['dry-run-report'])
            : undefined,
          decided: options.decisions
            ? decidedCodes(readFileSync(options.decisions, 'utf8'))
            : undefined,
        });
        printChecks(result.checks);
        process.stdout.write(result.ok ? '  => GO\n' : '  => NO-GO\n');
        return result.ok ? 0 : 1;
      }
      case 'smoke':
        return await smoke(options);
      case 'rollback-check':
        return await rollbackCheck(options);
      default:
        throw new UsageError(`unknown command: ${command ?? '(none)'}`);
    }
  } catch (err) {
    process.stderr.write(
      `${err instanceof Error ? err.message : String(err)}\n`,
    );
    return err instanceof UsageError ? 2 : 1;
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exitCode = await main(process.argv.slice(2));
}
