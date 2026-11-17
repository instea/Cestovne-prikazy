import { mkdtempSync, rmSync } from 'node:fs';
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import mongoose from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runMigration } from '../../src/migration/runner';
import { createTestApp, type TestApp } from '../support/app';
import { databaseUrl, testDatabaseName } from '../support/mongo';
import { EMPTY_CONTEXT } from './classify.mts';
import { runParity } from './harness.mts';
import { type RunningMock, startMockServer } from './mock-server.mts';
import {
  effectiveMonths,
  type ParityRequest,
  parityRequests,
} from './months.mts';
import {
  EARLIEST_LEAVE,
  legacyDocuments,
  PLACEHOLDER,
  syntheticFixtureSet,
  TIMEZONE,
} from './synthetic.mts';

/**
 * MIG-03 harness self-tests, without docker apps: two instances of the NEW
 * app (in process, same migrated synthetic data) stand in for "old" and
 * "new" behind the real parity mock. Equal apps must compare EQUAL; a
 * transforming proxy in front of "new" injects the faults the harness must
 * catch (changed leave code, key order); a missing fixture must fail the
 * run naming the request.
 */

const M2M = { username: 'parity-m2m', password: 'parity:secret' };

/** Jan–Jun 2024 plus the edge requests (2024/0, 2024/13, …). */
const REQUESTS: ParityRequest[] = parityRequests(
  EARLIEST_LEAVE,
  new Date('2024-05-15T12:00:00Z'),
);

type Transform = (body: string) => string;

/** Proxy in front of an app that rewrites response bodies. */
async function proxy(
  target: string,
  transform: Transform,
): Promise<{ url: string; server: Server }> {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    void (async () => {
      const upstream = await fetch(`${target}${req.url}`, {
        headers: { authorization: req.headers.authorization ?? '' },
      });
      const body = transform(await upstream.text());
      res.writeHead(upstream.status, {
        'Content-Type': upstream.headers.get('content-type') ?? 'text/plain',
      });
      res.end(body);
    })();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    server,
  };
}

async function listen(app: TestApp): Promise<string> {
  await app.app.listen(0, '127.0.0.1');
  return `http://127.0.0.1:${(app.app.getHttpServer().address() as AddressInfo).port}`;
}

describe('parity harness self-test (MIG-03)', () => {
  const legacyDb = testDatabaseName();
  const targetDb = testDatabaseName();
  const reportDir = mkdtempSync(join(tmpdir(), 'parity-selftest-'));
  let mock: RunningMock;
  let apps: TestApp[] = [];
  let oldUrl: string;
  let newUrl: string;
  const servers: Server[] = [];
  const mockUrl = () => `http://127.0.0.1:${mock.controlPort}`;

  const run = (opts: { newUrl?: string; requests?: ParityRequest[] } = {}) =>
    runParity({
      oldUrl,
      newUrl: opts.newUrl ?? newUrl,
      mockControlUrl: mockUrl(),
      requests: opts.requests ?? REQUESTS,
      m2m: M2M,
      context: EMPTY_CONTEXT,
      timeoutMs: 30_000,
    });

  beforeAll(async () => {
    // Synthetic legacy data → MIG-01 migration → the apps' database.
    const legacy = await mongoose
      .createConnection(databaseUrl(legacyDb))
      .asPromise();
    const { users, leaves } = legacyDocuments();
    const { EJSON } = mongoose.mongo.BSON;
    await legacy
      .collection('users')
      .insertMany(EJSON.deserialize(users, { relaxed: true }) as never);
    await legacy
      .collection('leaves')
      .insertMany(EJSON.deserialize(leaves, { relaxed: true }) as never);
    const migrated = await runMigration({
      dryRun: false,
      replace: false,
      reportDir,
      legacyMongoUrl: databaseUrl(legacyDb),
      mongoUrl: databaseUrl(targetDb),
      timezone: TIMEZONE,
    });
    expect([0, 3]).toContain(migrated.exitCode);
    await legacy.dropDatabase();
    await legacy.close();

    mock = await startMockServer({
      host: '127.0.0.1',
      controlPort: 0,
      apps: [
        { name: 'old', port: 0 },
        { name: 'new', port: 0 },
      ],
    });
    const appFor = (port: number) =>
      createTestApp(databaseUrl(targetDb), {
        env: {
          SSO_URI: `http://127.0.0.1:${port}/sso`,
          SSO_USERNAME: PLACEHOLDER.ssoUsername,
          SSO_PASSWORD: PLACEHOLDER.ssoPassword,
          TOGGL_REPORTS_BASE_URL: `http://127.0.0.1:${port}/reports/api/v3`,
          M2M_USERNAME: M2M.username,
          M2M_PASSWORD: M2M.password,
        },
      });
    apps = [await appFor(mock.ports.old!), await appFor(mock.ports.new!)];
    oldUrl = await listen(apps[0]!);
    newUrl = await listen(apps[1]!);
  }, 120_000);

  afterAll(async () => {
    await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
    await Promise.all(apps.map((a) => a.close()));
    await mock?.close();
    const conn = await mongoose
      .createConnection(databaseUrl(targetDb))
      .asPromise();
    await conn.dropDatabase();
    await conn.close();
    rmSync(reportDir, { recursive: true, force: true });
  });

  it('two equal apps compare EQUAL on every request', async () => {
    await fetch(`${mockUrl()}/__fixtures`, {
      method: 'POST',
      body: JSON.stringify(syntheticFixtureSet(effectiveMonths(REQUESTS))),
    });
    const result = await run();
    expect(result.unmatched).toEqual([]);
    expect(
      result.entries.map((e) => [
        `${e.request.year}/${e.request.month}`,
        e.status,
      ]),
    ).toEqual(REQUESTS.map((r) => [`${r.year}/${r.month}`, 'EQUAL']));
    expect(result.passed).toBe(true);
    // The apps really called the mock (SSO + Toggl pages), each on its own port.
    const april = result.entries.find((e) => e.request.month === '4')!;
    expect(april.old.requests).toBeGreaterThan(5);
    expect(april.new.requests).toBe(april.old.requests);
  }, 120_000);

  it('reports DIFF and fails when the new build writes D7 instead of D8', async () => {
    const p = await proxy(newUrl, (b) => b.replaceAll('"D8"', '"D7"'));
    servers.push(p.server);
    const result = await run({
      newUrl: p.url,
      requests: REQUESTS.filter((r) => r.month === '4'),
    });
    expect(result.passed).toBe(false);
    const [april] = result.entries;
    expect(april!.status).toBe('DIFF');
    expect(april!.diffs).toContainEqual({
      kind: 'value',
      path: 'attendence.Ivan Iný.days.7.leave',
      old: 'D8',
      new: 'D7',
    });
  }, 120_000);

  it('reports an order-only DIFF when the new output changes key order', async () => {
    const p = await proxy(newUrl, (b) => {
      const { start, end, attendence } = JSON.parse(b) as Record<
        string,
        unknown
      >;
      return JSON.stringify({ attendence, start, end });
    });
    servers.push(p.server);
    const result = await run({
      newUrl: p.url,
      requests: REQUESTS.filter((r) => r.month === '3'),
    });
    expect(result.entries[0]).toMatchObject({
      status: 'DIFF',
      orderOnly: true,
    });
    expect(result.passed).toBe(false);
  }, 120_000);

  it('fails and names the request when a Toggl request has no fixture', async () => {
    const months = effectiveMonths(REQUESTS).filter(
      (m) => !(m.year === 2024 && m.month === 2),
    );
    await fetch(`${mockUrl()}/__fixtures`, {
      method: 'POST',
      body: JSON.stringify(syntheticFixtureSet(months)),
    });
    const result = await run({
      requests: REQUESTS.filter((r) => r.month === '2'),
    });
    expect(result.passed).toBe(false);
    expect(result.entries[0]!.status).toBe('ERROR');
    expect(result.entries[0]!.error).toMatch(
      /unmatched mock request\(s\): old POST \/reports\/api\/v3\/workspace\/111\/search\/time_entries \{"start_date":"2024-02-01","end_date":"2024-02-29"/,
    );
    expect(result.unmatched.length).toBeGreaterThan(0);
  }, 120_000);
});
