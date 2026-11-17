import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import mongoose from 'mongoose';
import { type StartedTestContainer, Wait } from 'testcontainers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  containerNamed,
  findObject,
  loadManifest,
  PodLikeContainer,
  type ConfigMap,
  type Job,
  type StatefulSet,
} from './k8s';

/**
 * OPS-03: runs the committed `mongo8-rs-init` Job command and script against
 * a mongod started like `mongo8-sfset` (same image, args, keyfile init
 * container, security context, emptyDir mounts), twice, then commits a
 * transaction as the app user and restarts the pod.
 */

const ROOT = { user: 'root', password: randomBytes(12).toString('hex') };
const APP = { user: 'cestaky-app', password: randomBytes(12).toString('hex') };

const mongoObjects = loadManifest('mongo8.yml');
const sts = findObject<StatefulSet>(
  mongoObjects,
  'StatefulSet',
  'mongo8-sfset',
);
const stsPod = sts.spec.template.spec;
const mongod = containerNamed(stsPod, 'mongo8');
const [keyfileInit] = stsPod.initContainers ?? [];

const initObjects = loadManifest('mongo8-rs-init.yml');
const job = findObject<Job>(initObjects, 'Job', 'mongo8-rs-init');
const [jobContainer] = job.spec.template.spec.containers;
const initScript = findObject<ConfigMap>(
  initObjects,
  'ConfigMap',
  'mongo8-rs-init-script',
).data['init.js']!;

/** Path where the StatefulSet mounts the raw `mongo8-secrets` keyfile. */
function secretMountPath(): string {
  const volume = stsPod.volumes?.find(
    (v) => v.secret?.secretName === 'mongo8-secrets',
  );
  const mount = keyfileInit?.volumeMounts?.find((m) => m.name === volume?.name);
  if (!mount) throw new Error('keyfile secret mount not found');
  return mount.mountPath;
}

/** Mount paths of the pod's emptyDir volumes (tmpfs in the test). */
function emptyDirMounts(): string[] {
  const names = new Set(
    (stsPod.volumes ?? []).filter((v) => v.emptyDir).map((v) => v.name),
  );
  const paths = [keyfileInit, mongod].flatMap((c) =>
    (c?.volumeMounts ?? [])
      .filter((m) => names.has(m.name))
      .map((m) => m.mountPath),
  );
  return [...new Set(paths)];
}

/** `sh -c` body of a container whose command is `[sh, -c, <body>]`. */
function shellBody(cmd: string[] | undefined): string {
  if (cmd?.[0] !== 'sh' || cmd[1] !== '-c' || cmd.length !== 3) {
    throw new Error(`expected [sh, -c, <script>], got ${JSON.stringify(cmd)}`);
  }
  return cmd[2]!;
}

describe('mongo8-sfset keyfile init container', () => {
  // Kubernetes re-runs init containers when the pod sandbox restarts, and the
  // Memory emptyDir keeps the keyfile from the previous run. The init step
  // must succeed again with only its own capabilities (no DAC_OVERRIDE).
  let container: StartedTestContainer;
  let hostDir: string;

  const keyfileMount = () => {
    const names = new Set(
      (stsPod.volumes ?? []).filter((v) => v.emptyDir).map((v) => v.name),
    );
    const mount = keyfileInit?.volumeMounts?.find((m) => names.has(m.name));
    if (!mount) throw new Error('keyfile emptyDir mount not found');
    return mount.mountPath;
  };

  beforeAll(async () => {
    hostDir = mkdtempSync(join(tmpdir(), 'leaves-keyfile-'));
    writeFileSync(
      join(hostDir, 'keyfile'),
      randomBytes(48).toString('base64'),
      { mode: 0o444 },
    );
    container = await new PodLikeContainer(keyfileInit!.image)
      .withSecurityContext(keyfileInit!.securityContext)
      .withTmpFs({ [keyfileMount()]: 'rw,nosuid' })
      .withBindMounts([
        {
          source: join(hostDir, 'keyfile'),
          target: `${secretMountPath()}/keyfile`,
          mode: 'ro',
        },
      ])
      .withEntrypoint(['sleep', 'infinity'])
      .start();
  }, 120_000);

  afterAll(async () => {
    await container?.stop();
    if (hostDir) rmSync(hostDir, { recursive: true, force: true });
  });

  it('succeeds again on a re-run over the existing keyfile', async () => {
    const runInit = () =>
      container.exec(['sh', '-c', shellBody(keyfileInit?.command)]);
    const first = await runInit();
    expect(first.exitCode, first.output).toBe(0);
    const second = await runInit();
    expect(second.exitCode, second.output).toBe(0);
    const stat = await container.exec([
      'stat',
      '-c',
      '%u:%g %a',
      `${keyfileMount()}/keyfile`,
    ]);
    expect(stat.stdout.trim()).toBe('999:999 400');
  }, 60_000);
});

describe('mongo8-rs-init Job (MongoDB 8 with keyfile auth)', () => {
  let container: StartedTestContainer;
  let hostDir: string;
  const jobEnv = {
    MONGO_INITDB_ROOT_USERNAME: ROOT.user,
    MONGO_INITDB_ROOT_PASSWORD: ROOT.password,
    MONGO_APP_USERNAME: APP.user,
    MONGO_APP_PASSWORD: APP.password,
    // Inside the test container the member is reachable as localhost.
    RS_MEMBER_HOST: 'localhost:27017',
  };

  const runJob = () =>
    container.exec(
      [
        'sh',
        '-c',
        shellBody([
          ...(jobContainer!.command ?? []),
          ...(jobContainer!.args ?? []),
        ]),
      ],
      { env: jobEnv, user: 'mongodb' },
    );

  const rootEval = async (js: string): Promise<string> => {
    const res = await container.exec([
      'mongosh',
      '--quiet',
      '--username',
      ROOT.user,
      '--password',
      ROOT.password,
      '--authenticationDatabase',
      'admin',
      '--eval',
      js,
    ]);
    if (res.exitCode !== 0) throw new Error(res.output);
    return res.stdout.trim();
  };

  beforeAll(async () => {
    // Secret and ConfigMap volumes: bind mounts (the root fs is read-only).
    hostDir = mkdtempSync(join(tmpdir(), 'leaves-mongo8-'));
    writeFileSync(
      join(hostDir, 'keyfile'),
      randomBytes(48).toString('base64'),
      { mode: 0o444 },
    );
    writeFileSync(join(hostDir, 'init.js'), initScript, { mode: 0o444 });
    // The pod: init container copies the keyfile, then the image entrypoint.
    // Both run in one container here; its capabilities cover the init step.
    const startPod = [
      shellBody(keyfileInit?.command),
      `exec docker-entrypoint.sh mongod ${mongod.args!.join(' ')}`,
    ].join(' && ');
    container = await new PodLikeContainer(mongod.image)
      .withSecurityContext(mongod.securityContext)
      .withTmpFs(
        Object.fromEntries(emptyDirMounts().map((p) => [p, 'rw,nosuid'])),
      )
      .withBindMounts([
        {
          source: join(hostDir, 'keyfile'),
          target: `${secretMountPath()}/keyfile`,
          mode: 'ro',
        },
        {
          source: join(hostDir, 'init.js'),
          target: '/scripts/init.js',
          mode: 'ro',
        },
      ])
      .withEnvironment({
        MONGO_INITDB_ROOT_USERNAME: ROOT.user,
        MONGO_INITDB_ROOT_PASSWORD: ROOT.password,
      })
      .withEntrypoint(['sh', '-c', startPod])
      .withExposedPorts(27017)
      // Auth works only on the final mongod (the entrypoint's temporary one
      // has no users yet), and its replica set is not initiated yet.
      .withWaitStrategy(
        Wait.forSuccessfulCommand(
          `mongosh --quiet -u ${ROOT.user} -p ${ROOT.password} --authenticationDatabase admin --eval "try { rs.status() } catch (e) { if (e.codeName !== 'NotYetInitialized') throw e }"`,
        ),
      )
      .withStartupTimeout(120_000)
      .start();
  }, 180_000);

  afterAll(async () => {
    await container?.stop();
    if (hostDir) rmSync(hostDir, { recursive: true, force: true });
  });

  it('initiates rs0 and creates the app user on the first run', async () => {
    const res = await runJob();
    expect(res.exitCode, res.output).toBe(0);
    expect(res.output).toContain('replica set rs0 initiated');
    expect(res.output).toContain(`user ${APP.user} created`);
  }, 120_000);

  it('changes nothing on the second run', async () => {
    const snapshot = () =>
      rootEval(
        `JSON.stringify({ conf: rs.conf().version, user: db.getSiblingDB('cestaky').getUser('${APP.user}', { showCredentials: true }) })`,
      );
    const before = await snapshot();
    const res = await runJob();
    expect(res.exitCode, res.output).toBe(0);
    expect(res.output).toContain('replica set rs0 already initiated');
    expect(res.output).toContain(`user ${APP.user} already exists`);
    expect(res.output).not.toContain('created');
    expect(await snapshot()).toBe(before);
  }, 120_000);

  it('leaves one member in state PRIMARY and the app user with its roles', async () => {
    const members = JSON.parse(
      await rootEval(
        'JSON.stringify(rs.status().members.map((m) => m.stateStr))',
      ),
    ) as string[];
    expect(members).toEqual(['PRIMARY']);
    const roles = JSON.parse(
      await rootEval(
        `JSON.stringify(db.getSiblingDB('cestaky').getUser('${APP.user}').roles)`,
      ),
    ) as { role: string; db: string }[];
    expect(roles).toEqual(
      expect.arrayContaining([
        { role: 'readWrite', db: 'cestaky' },
        { role: 'read', db: 'cestaky_legacy' },
      ]),
    );
    expect(roles).toHaveLength(2);
  });

  it('commits a multi-document transaction as the app user', async () => {
    // Same URL shape as the production MONGO_URL (secrets.example.md), but a
    // direct connection: the member's host name is container-internal.
    const url = `mongodb://${APP.user}:${APP.password}@${container.getHost()}:${container.getMappedPort(27017)}/cestaky?authSource=cestaky&directConnection=true`;
    const conn = await mongoose
      .createConnection(url, { serverSelectionTimeoutMS: 10_000 })
      .asPromise();
    try {
      const db = conn.getClient().db('cestaky');
      // Collections must exist before inserting in a transaction on older
      // servers; create them up front to keep the test independent of that.
      await db.createCollection('ops03_a');
      await db.createCollection('ops03_b');
      const session = conn.getClient().startSession();
      try {
        await session.withTransaction(async () => {
          await db.collection('ops03_a').insertOne({ n: 1 }, { session });
          await db.collection('ops03_b').insertOne({ n: 2 }, { session });
        });
      } finally {
        await session.endSession();
      }
      expect(await db.collection('ops03_a').countDocuments()).toBe(1);
      expect(await db.collection('ops03_b').countDocuments()).toBe(1);
      await expect(
        conn
          .getClient()
          .db('cestaky_legacy')
          .collection('x')
          .insertOne({ n: 1 }),
      ).rejects.toThrow(/not authorized/);
    } finally {
      await conn.close();
    }
  }, 60_000);

  it('stays PRIMARY with the app user after a pod restart', async () => {
    await container.restart();
    const deadline = Date.now() + 60_000;
    let state = '';
    while (Date.now() < deadline) {
      try {
        state = await rootEval('rs.status().members[0].stateStr');
        if (state === 'PRIMARY') break;
      } catch {
        // mongod still starting
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    expect(state).toBe('PRIMARY');
    const res = await runJob();
    expect(res.exitCode, res.output).toBe(0);
    expect(res.output).toContain(`user ${APP.user} already exists`);
  }, 120_000);
});
