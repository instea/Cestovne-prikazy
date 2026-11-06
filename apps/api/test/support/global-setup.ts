import { randomUUID } from 'node:crypto';
import {
  MongoDBContainer,
  type StartedMongoDBContainer,
} from '@testcontainers/mongodb';
import {
  GenericContainer,
  type StartedTestContainer,
  Wait,
} from 'testcontainers';
import type { TestProject } from 'vitest/node';
import mongoose from 'mongoose';

/**
 * NFR-12: the same MongoDB 8 image (by digest) as the k8s StatefulSet
 * (`deploy/k8s/mongo8.yml`; asserted by `test/ops/manifests.int-spec.ts`).
 */
export const MONGO_TEST_IMAGE =
  'mongo:8.0@sha256:b9924c330a8bbc5800fe9c69f04a84e221eca7b28fd049a0354147d9908fa142';

declare module 'vitest' {
  export interface ProvidedContext {
    /** Base URL of a MongoDB 8 replica-set member, without database name. */
    mongoUrl: string;
    /** Mailpit HTTP API base URL (e.g. `http://localhost:8025`). */
    mailpitApiUrl: string;
    mailpitSmtpHost: string;
    mailpitSmtpPort: number;
    /** Random id of this test run (cross-file coordination, e.g. isolation). */
    testRunId: string;
  }
}

/** Same pinned tag as docker-compose.yml (SET-04). */
export const MAILPIT_IMAGE = 'axllent/mailpit:v1.33.0';
/** Mailpit SMTP port, fixed in compose (SET-04) and for `MAILPIT_API_URL`. */
export const MAILPIT_SMTP = 1025;
const MAILPIT_HTTP = 8025;

/** `hello` / `buildInfo` fields the harness needs from MongoDB. */
export interface MongoServerInfo {
  setName?: string;
  version: string;
}

/**
 * `null` when the server is a replica-set member running MongoDB >= 8
 * (TST-02: transactions are tested), else why not.
 */
export function mongoServerProblem(info: MongoServerInfo): string | null {
  if (!info.setName)
    return 'it is not a replica-set member (hello has no setName), so transactions cannot be tested';
  const major = Number.parseInt(info.version, 10);
  if (!(major >= 8)) return `it runs MongoDB ${info.version}, need 8 or newer`;
  return null;
}

/** Connects once and fails fast unless `url` is a MongoDB 8 replica-set member. */
export async function assertMongoServer(url: string): Promise<void> {
  const target = new URL(url);
  target.searchParams.set('directConnection', 'true');
  const conn = await mongoose
    .createConnection(target.toString(), { serverSelectionTimeoutMS: 10_000 })
    .asPromise();
  try {
    const admin = conn.getClient().db('admin');
    const hello = await admin.command({ hello: 1 });
    const build = await admin.command({ buildInfo: 1 });
    const problem = mongoServerProblem({
      setName: hello.setName as string | undefined,
      version: String(build.version),
    });
    if (problem) {
      target.password = target.password ? '***' : '';
      throw new Error(
        `TST-02: MongoDB at ${target.origin}${target.pathname} is unusable: ${problem}`,
      );
    }
  } finally {
    await conn.close();
  }
}

interface Started {
  container?: { stop(): Promise<unknown> };
}

/**
 * Awaits every start. If any failed, stops the containers that did start
 * (Ryuk may be disabled) and rethrows the first failure.
 */
export async function startAllOrStop<T extends readonly Started[]>(starts: {
  [K in keyof T]: Promise<T[K]>;
}): Promise<T> {
  const results = await Promise.allSettled(
    starts as readonly Promise<Started>[],
  );
  const failed = results.find((r) => r.status === 'rejected');
  if (!failed) {
    return results.map(
      (r) => (r as PromiseFulfilledResult<Started>).value,
    ) as unknown as T;
  }
  const stops: Promise<unknown>[] = [];
  for (const r of results) {
    const stop = r.status === 'fulfilled' ? r.value.container?.stop() : null;
    if (stop) stops.push(stop);
  }
  await Promise.allSettled(stops);
  throw failed.reason;
}

async function startMongo(): Promise<{
  url: string;
  container?: StartedMongoDBContainer;
}> {
  const url = process.env.MONGO_TEST_URL;
  if (url) {
    await assertMongoServer(url);
    return { url };
  }
  const container = await new MongoDBContainer(MONGO_TEST_IMAGE).start();
  try {
    await assertMongoServer(container.getConnectionString());
  } catch (err) {
    await container.stop();
    throw err;
  }
  return { url: container.getConnectionString(), container };
}

async function startMailpit(): Promise<{
  apiUrl: string;
  smtpHost: string;
  smtpPort: number;
  container?: StartedTestContainer;
}> {
  const apiUrl = process.env.MAILPIT_API_URL;
  if (apiUrl) {
    // SMTP is the same host on the fixed port (compose, CI service).
    return {
      apiUrl,
      smtpHost: new URL(apiUrl).hostname,
      smtpPort: MAILPIT_SMTP,
    };
  }
  const container = await new GenericContainer(MAILPIT_IMAGE)
    .withExposedPorts(MAILPIT_SMTP, MAILPIT_HTTP)
    .withEnvironment({
      MP_SMTP_AUTH_ACCEPT_ANY: '1',
      MP_SMTP_AUTH_ALLOW_INSECURE: '1',
    })
    .withWaitStrategy(Wait.forHttp('/readyz', MAILPIT_HTTP))
    .start();
  const host = container.getHost();
  return {
    apiUrl: `http://${host}:${container.getMappedPort(MAILPIT_HTTP)}`,
    smtpHost: host,
    smtpPort: container.getMappedPort(MAILPIT_SMTP),
    container,
  };
}

/**
 * TST-02: one MongoDB 8 and one Mailpit per test run.
 * - `MONGO_TEST_URL` (e.g. the SET-04 compose `mongo`) skips the Mongo
 *   container; it must be a replica-set member (checked: `hello.setName`,
 *   version >= 8).
 * - `MAILPIT_API_URL` (e.g. `http://localhost:8025`) skips the Mailpit
 *   container; SMTP is then the API host on port 1025.
 */
export default async function setup(project: TestProject) {
  const [mongo, mailpit] = await startAllOrStop<
    [
      Awaited<ReturnType<typeof startMongo>>,
      Awaited<ReturnType<typeof startMailpit>>,
    ]
  >([startMongo(), startMailpit()]);
  project.provide('mongoUrl', mongo.url);
  project.provide('mailpitApiUrl', mailpit.apiUrl);
  project.provide('mailpitSmtpHost', mailpit.smtpHost);
  project.provide('mailpitSmtpPort', mailpit.smtpPort);
  project.provide('testRunId', randomUUID());
  return async () => {
    await Promise.all([mongo.container?.stop(), mailpit.container?.stop()]);
  };
}
