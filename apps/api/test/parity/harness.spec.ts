import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { callApp } from './harness.mts';

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
