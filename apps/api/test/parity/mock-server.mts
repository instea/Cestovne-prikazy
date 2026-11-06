/**
 * MIG-03 contract mock: one process serving SSO and Toggl to both apps.
 * Each app gets its own listener (port → app name), so every recorded
 * request is attributed; the old app additionally reaches its hard-coded
 * `https://api.track.toggl.com` through an HTTPS listener with a
 * harness-CA certificate (network alias in the compose file).
 *
 * - SSO: `GET <ssoPath>` with the fixture's exact Basic credentials (else
 *   401), answered from the fixture set.
 * - Toggl: `POST …/workspace/:ws/search/time_entries`, Basic
 *   `<token>:api_token` (else 401); answered by exact key match, else 599.
 *   TST-04 contract problems of the body are recorded (not enforced: the
 *   old app's known-bad requests, e.g. `user_ids: [null]`, must still be
 *   answerable by a fixture).
 * - Control API (own port): `POST /__fixtures` (FixtureSet), `POST /__reset`
 *   (clears records), `GET /__requests`, `GET /__health`.
 *
 * Node built-ins only: runs as `node mock-server.mts` in a plain node image.
 * Env for the CLI: MOCK_CONTROL_PORT, MOCK_APPS (`old:8001,new:8002`),
 * MOCK_HTTPS (`old:443`), MOCK_TLS_KEY, MOCK_TLS_CERT, MOCK_SSO_PATH.
 */
import { readFileSync } from 'node:fs';
import {
  createServer as createHttpServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import type { AddressInfo } from 'node:net';
import { pathToFileURL } from 'node:url';
import {
  basicAuth,
  decodeBasic,
  TOGGL_SEARCH_PATH,
  togglBodyProblem,
} from '../mocks/contract.mts';
import {
  type CannedResponse,
  type FixtureSet,
  indexToggl,
  togglKeyOf,
  togglKeyString,
} from './fixtures.mts';

export const UNMATCHED_STATUS = 599;

export interface MockRecord {
  seq: number;
  app: string;
  service: 'sso' | 'toggl' | 'other';
  method: string;
  /** Path without the redirect-hop query. */
  path: string;
  auth: string | null;
  body: unknown;
  status: number;
  /** No fixture matched (answered 599). */
  unmatched: boolean;
  /** TIMEOUT_REDIRECT_LIMIT injection applied to this answer. */
  injected?: 'delay' | 'redirect';
  /** TST-04 contract violation of a Toggl body (informational). */
  contractProblem?: string;
}

export interface MockOptions {
  /** 0 = any free port. */
  controlPort: number;
  apps: { name: string; port: number }[];
  https?: { app: string; port: number; key: string; cert: string };
  ssoPath?: string;
  fixtures?: FixtureSet;
  host?: string;
  log?: (line: string) => void;
}

export interface RunningMock {
  controlPort: number;
  /** Actual port per app name (HTTP listeners). */
  ports: Record<string, number>;
  records: MockRecord[];
  setFixtures(set: FixtureSet): void;
  close(): Promise<void>;
}

const readBody = (req: IncomingMessage): Promise<string> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });

function parseJson(text: string): unknown {
  if (text === '') return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function send(res: ServerResponse, r: CannedResponse): void {
  const headers: Record<string, string> = { ...(r.headers ?? {}) };
  let payload = '';
  if (r.body !== undefined) {
    payload = typeof r.body === 'string' ? r.body : JSON.stringify(r.body);
    if (typeof r.body !== 'string' && !hasHeader(headers, 'content-type'))
      headers['Content-Type'] = 'application/json; charset=utf-8';
  }
  res.writeHead(r.status, headers);
  res.end(payload);
}

const hasHeader = (h: Record<string, string>, name: string) =>
  Object.keys(h).some((k) => k.toLowerCase() === name);

const listen = (server: Server, port: number, host: string) =>
  new Promise<number>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () =>
      resolve((server.address() as AddressInfo).port),
    );
  });

const close = (server: Server) =>
  new Promise<void>((resolve) => {
    server.closeAllConnections();
    server.close(() => resolve());
  });

export async function startMockServer(
  options: MockOptions,
): Promise<RunningMock> {
  const host = options.host ?? '0.0.0.0';
  const ssoPath = options.ssoPath ?? '/sso';
  const log = options.log ?? (() => undefined);
  const records: MockRecord[] = [];
  let seq = 0;
  let fixtures: FixtureSet | undefined = options.fixtures;
  let togglIndex: Map<string, CannedResponse> = fixtures
    ? indexToggl(fixtures.toggl)
    : new Map<string, CannedResponse>();

  const setFixtures = (set: FixtureSet) => {
    togglIndex = indexToggl(set.toggl);
    fixtures = set;
  };

  async function answer(
    res: ServerResponse,
    canned: CannedResponse,
    record: MockRecord,
    url: URL,
  ): Promise<void> {
    const hop = Number(url.searchParams.get('__hop') ?? '0');
    if (canned.redirects && hop < canned.redirects) {
      record.injected = 'redirect';
      record.status = 307;
      records.push(record);
      url.searchParams.set('__hop', String(hop + 1));
      res.writeHead(307, { Location: `${url.pathname}${url.search}` });
      res.end();
      return;
    }
    if (canned.delayMs) {
      record.injected = 'delay';
      await new Promise((r) => setTimeout(r, canned.delayMs));
    }
    record.status = canned.status;
    records.push(record);
    if (!res.destroyed) send(res, canned);
  }

  function appHandler(app: string) {
    return (req: IncomingMessage, res: ServerResponse) => {
      void (async () => {
        const text = await readBody(req);
        const url = new URL(req.url ?? '/', 'http://mock');
        const auth = req.headers.authorization ?? null;
        const body = parseJson(text);
        const record: MockRecord = {
          seq: ++seq,
          app,
          service: 'other',
          method: req.method ?? 'GET',
          path: url.pathname,
          auth,
          body,
          status: 0,
          unmatched: false,
        };
        if (!fixtures) {
          record.unmatched = true;
          record.status = UNMATCHED_STATUS;
          records.push(record);
          send(res, {
            status: UNMATCHED_STATUS,
            body: 'no fixture set loaded',
          });
          return;
        }

        if (url.pathname === ssoPath) {
          record.service = 'sso';
          const expected = basicAuth(
            fixtures.sso.username,
            fixtures.sso.password,
          );
          if (req.method !== 'GET' || auth !== expected) {
            record.status = 401;
            records.push(record);
            send(res, { status: 401 });
            return;
          }
          await answer(res, fixtures.sso.response, record, url);
          return;
        }

        const toggl = TOGGL_SEARCH_PATH.exec(url.pathname);
        if (toggl && req.method === 'POST') {
          record.service = 'toggl';
          const problem = togglBodyProblem(body);
          if (problem) record.contractProblem = problem;
          const creds = decodeBasic(auth);
          if (!creds || creds[1] !== 'api_token') {
            record.status = 401;
            records.push(record);
            send(res, { status: 401 });
            return;
          }
          const key = togglKeyOf(decodeURIComponent(toggl[1]!), creds[0], body);
          const canned = key ? togglIndex.get(togglKeyString(key)) : undefined;
          if (!canned) {
            record.unmatched = true;
            record.status = UNMATCHED_STATUS;
            records.push(record);
            log(
              `UNMATCHED ${app} POST ${url.pathname} ${key ? togglKeyString(key) : text}`,
            );
            send(res, {
              status: UNMATCHED_STATUS,
              body: 'no matching fixture',
            });
            return;
          }
          await answer(res, canned, record, url);
          return;
        }

        record.unmatched = true;
        record.status = UNMATCHED_STATUS;
        records.push(record);
        log(`UNMATCHED ${app} ${record.method} ${url.pathname}`);
        send(res, { status: UNMATCHED_STATUS, body: 'unknown route' });
      })().catch((err: unknown) => {
        log(`mock error: ${String(err)}`);
        if (!res.headersSent) send(res, { status: 500, body: 'mock error' });
      });
    };
  }

  const servers: Server[] = [];
  const ports: Record<string, number> = {};
  for (const { name, port } of options.apps) {
    const server = createHttpServer(appHandler(name));
    servers.push(server);
    ports[name] = await listen(server, port, host);
  }
  if (options.https) {
    const server = createHttpsServer(
      { key: options.https.key, cert: options.https.cert },
      appHandler(options.https.app),
    );
    servers.push(server);
    await listen(server, options.https.port, host);
  }

  const control = createHttpServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? '/', 'http://mock');
      const text = await readBody(req);
      if (req.method === 'GET' && url.pathname === '/__health') {
        send(res, { status: 200, body: { ok: true } });
      } else if (req.method === 'POST' && url.pathname === '/__fixtures') {
        setFixtures(JSON.parse(text) as FixtureSet);
        send(res, { status: 204 });
      } else if (req.method === 'POST' && url.pathname === '/__reset') {
        records.length = 0;
        send(res, { status: 204 });
      } else if (req.method === 'GET' && url.pathname === '/__requests') {
        send(res, { status: 200, body: { records } });
      } else {
        send(res, { status: 404 });
      }
    })().catch((err: unknown) => {
      if (!res.headersSent) send(res, { status: 400, body: String(err) });
    });
  });
  servers.push(control);
  const controlPort = await listen(control, options.controlPort, host);

  return {
    controlPort,
    ports,
    records,
    setFixtures,
    close: async () => {
      await Promise.all(servers.map(close));
    },
  };
}

function parseApps(spec: string): { name: string; port: number }[] {
  return spec
    .split(',')
    .filter(Boolean)
    .map((part) => {
      const [name, port] = part.split(':');
      return { name: name!, port: Number(port) };
    });
}

async function main(): Promise<void> {
  const env = process.env;
  const https = env.MOCK_HTTPS ? parseApps(env.MOCK_HTTPS)[0] : undefined;
  const mock = await startMockServer({
    controlPort: Number(env.MOCK_CONTROL_PORT ?? 8000),
    apps: parseApps(env.MOCK_APPS ?? 'old:8001,new:8002'),
    https: https
      ? {
          app: https.name,
          port: https.port,
          key: readFileSync(env.MOCK_TLS_KEY ?? '/certs/server.key', 'utf8'),
          cert: readFileSync(env.MOCK_TLS_CERT ?? '/certs/server.crt', 'utf8'),
        }
      : undefined,
    ssoPath: env.MOCK_SSO_PATH ?? '/sso',
    log: (line) => process.stdout.write(`${line}\n`),
  });
  process.stdout.write(
    `parity mock ready: control ${mock.controlPort}, apps ${JSON.stringify(mock.ports)}\n`,
  );
  const stop = () => {
    void mock.close().then(() => process.exit(0));
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  void main();
