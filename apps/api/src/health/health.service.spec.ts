import type { Connection } from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HealthService, PING_TIMEOUT_MS } from './health.service';

function connection(
  readyState: number,
  command: () => Promise<unknown>,
): Connection {
  return {
    readyState,
    db: { admin: () => ({ command }) },
  } as unknown as Connection;
}

describe('HealthService', () => {
  afterEach(() => vi.useRealTimers());

  it('fails immediately when not connected', async () => {
    const command = vi.fn();
    const result = await new HealthService(connection(0, command)).check();
    expect(result).toEqual({
      ok: false,
      message: 'MongoDB not connected (readyState=0)',
    });
    expect(command).not.toHaveBeenCalled();
  });

  it('is ok when ping answers', async () => {
    const command = vi.fn(() => Promise.resolve({ ok: 1 }));
    const result = await new HealthService(connection(1, command)).check();
    expect(result).toEqual({ ok: true, message: 'ok' });
    expect(command).toHaveBeenCalledWith({
      ping: 1,
      maxTimeMS: PING_TIMEOUT_MS,
    });
  });

  it('reports the ping error as a string', async () => {
    const command = () => Promise.reject(new Error('connection reset'));
    const result = await new HealthService(connection(1, command)).check();
    expect(result).toEqual({ ok: false, message: 'Error: connection reset' });
  });

  it('times out a hanging ping after 2000 ms', async () => {
    vi.useFakeTimers();
    const command = () => new Promise<never>(() => undefined);
    const pending = new HealthService(connection(1, command)).check();
    await vi.advanceTimersByTimeAsync(PING_TIMEOUT_MS);
    expect(await pending).toEqual({
      ok: false,
      message: `Error: MongoDB ping timed out after ${PING_TIMEOUT_MS} ms`,
    });
  });
});
