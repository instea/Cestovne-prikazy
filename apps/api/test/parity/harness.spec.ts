import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { basicAuth } from '../mocks/contract.mts';
import { EMPTY_CONTEXT } from './classify.mts';
import type { FixtureSet } from './fixtures.mts';
import { callApp, runParity } from './harness.mts';
import { type RunningMock, startMockServer } from './mock-server.mts';
import { request } from './months.mts';

/** MIG-03: how an app call that gets no answer is reported. */
describe('callApp outcome', () => {
  let server: Server | undefined;
  afterEach(() => {
    server?.closeAllConnections();
    server?.close();
    server = undefined;
  });

  /** A server that never answers and closes the socket after `closeMs`. */
  async function hangingServer(closeMs: number): Promise<string> {
    server = createServer((req) => {
      setTimeout(() => req.socket.destroy(), closeMs);
    });
    await new Promise<void>((resolve) => server!.listen(0, resolve));
    return `http://localhost:${(server.address() as AddressInfo).port}`;
  }

  it('a client timeout is a timeout', async () => {
    const url = await hangingServer(60_000);
    const r = await callApp(url, { year: '2024', month: '6' }, 'Basic x', 300);
    expect(r.kind).toBe('timeout');
  });

  it('the server closing a hung request near the timeout is a timeout (old Node 12 120 s socket timeout)', async () => {
    const url = await hangingServer(5_200);
    const r = await callApp(
      url,
      { year: '2024', month: '6' },
      'Basic x',
      10_000,
    );
    expect(r.kind).toBe('timeout');
  }, 15_000);

  it('the server closing early without an answer is an error', async () => {
    const url = await hangingServer(50);
    const r = await callApp(
      url,
      { year: '2024', month: '6' },
      'Basic x',
      10_000,
    );
    expect(r.kind).toBe('error');
  });
});

/**
 * MIG-03: a run must not pass having compared nothing. Fake "apps" answer
 * the attendance call after (maybe) calling the mock's SSO, so both apps
 * return the same body and every request would be EQUAL.
 */
describe('runParity guards against comparing nothing', () => {
  const fixtures: FixtureSet = {
    sso: {
      username: 'SSO_USER',
      password: 'SSO_PASSWORD',
      response: { status: 200, body: [] },
    },
    toggl: [],
  };
  let mock: RunningMock;
  const servers: Server[] = [];

  beforeAll(async () => {
    mock = await startMockServer({
      host: '127.0.0.1',
      controlPort: 0,
      apps: [
        { name: 'old', port: 0 },
        { name: 'new', port: 0 },
      ],
      fixtures,
    });
  });
  afterAll(async () => {
    for (const s of servers) {
      s.closeAllConnections();
      s.close();
    }
    await mock.close();
  });

  /** An app that calls SSO with `ssoAuth` (or not at all) and echoes its status. */
  async function fakeApp(
    app: 'old' | 'new',
    ssoAuth: string | null,
  ): Promise<string> {
    const server = createServer((_req, res) => {
      void (async () => {
        let status = 200;
        if (ssoAuth !== null) {
          const sso = await fetch(`http://127.0.0.1:${mock.ports[app]}/sso`, {
            headers: { Authorization: ssoAuth },
          });
          if (!sso.ok) status = 500;
        }
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(status === 200 ? '{}' : '{"message":"Cannot get data"}');
      })();
    });
    servers.push(server);
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }

  const run = async (oldUrl: string, newUrl: string) =>
    runParity({
      oldUrl,
      newUrl,
      mockControlUrl: `http://127.0.0.1:${mock.controlPort}`,
      requests: [request('2024', '3'), request('2024', '4')],
      m2m: { username: 'm2m', password: 'secret' },
      context: EMPTY_CONTEXT,
      timeoutMs: 5_000,
    });

  it('passes when both apps reach the mock with the right credentials', async () => {
    const good = basicAuth('SSO_USER', 'SSO_PASSWORD');
    const result = await run(
      await fakeApp('old', good),
      await fakeApp('new', good),
    );
    expect(result.nothingCompared).toEqual([]);
    expect(result.passed).toBe(true);
  });

  it('fails and names the request when the apps use wrong SSO credentials', async () => {
    const bad = basicAuth('SSO_USER', 'wrong');
    const result = await run(
      await fakeApp('old', bad),
      await fakeApp('new', bad),
    );
    expect(result.passed).toBe(false);
    expect(result.entries.map((e) => e.status)).toEqual(['ERROR', 'ERROR']);
    expect(result.entries[0]!.error).toContain(
      'old GET /sso (SSO credentials do not match the fixture set)',
    );
    expect(result.unmatched).toHaveLength(4);
  });

  it('fails when no backend request of an app got a 2xx answer (nothing compared)', async () => {
    const good = basicAuth('SSO_USER', 'SSO_PASSWORD');
    // "new" never calls the backend: every response is EQUAL, no request is
    // unmatched, but nothing was compared for it.
    const result = await run(
      await fakeApp('old', good),
      await fakeApp('new', null),
    );
    expect(result.unmatched).toEqual([]);
    expect(result.nothingCompared).toEqual(['new']);
    expect(result.passed).toBe(false);
  });
});
