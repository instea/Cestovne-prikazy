import { Writable } from 'node:stream';
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../config/env.schema';
import { buildPinoHttpOptions } from './pino-options';
import {
  isCredentialKey,
  MAX_DEPTH,
  REDACTED,
  redactCredentials,
  redactLogObject,
} from './redact';

describe('isCredentialKey (NFR-02)', () => {
  it.each([
    'token',
    'accessToken',
    'refreshToken',
    'refresh_token',
    'idToken',
    'apiToken',
    'togglApiToken',
    'TOKEN',
    'password',
    'Password',
    'passwd',
    'SMTP_PASSWORD',
    'secret',
    'clientSecret',
    'JWT_ACCESS_SECRET',
    'authorization',
    'Authorization',
    'proxy-authorization',
    'cookie',
    'set-cookie',
    'Set-Cookie',
    'apikey',
    'apiKey',
    'api_key',
    'x-api-key',
    'credential',
    'credentials',
  ])('%s is credential-like', (key) => {
    expect(isCredentialKey(key)).toBe(true);
  });

  it.each(['id', 'email', 'message', 'stack', 'user', 'data', 'path'])(
    '%s is not',
    (key) => {
      expect(isCredentialKey(key)).toBe(false);
    },
  );
});

describe('redactCredentials (NFR-02)', () => {
  it('redacts at any depth, in arrays, case-insensitively', () => {
    const input = {
      user: 'eva',
      a: { b: { c: { d: { e: { f: { refresh_token: 'r1' } } } } } },
      list: [{ AccessToken: 'a1' }, [{ Password: 'p1' }], 'plain'],
      headers: { Cookie: 'c', 'Set-Cookie': ['s'], 'X-Api-Key': 'k' },
    };
    expect(redactCredentials(input)).toEqual({
      user: 'eva',
      a: { b: { c: { d: { e: { f: { refresh_token: REDACTED } } } } } },
      list: [{ AccessToken: REDACTED }, [{ Password: REDACTED }], 'plain'],
      headers: {
        Cookie: REDACTED,
        'Set-Cookie': REDACTED,
        'X-Api-Key': REDACTED,
      },
    });
  });

  it('redacts a whole object under a credential key', () => {
    expect(
      redactCredentials({ credentials: { user: 'u', pass: 'p' } }),
    ).toEqual({ credentials: REDACTED });
  });

  it('does not mutate the input', () => {
    const input = {
      nested: { idToken: 'secret-id-token' },
      list: [{ token: 't' }],
    };
    const copy = structuredClone(input);
    redactCredentials(input);
    expect(input).toEqual(copy);
  });

  it('survives cycles (and keeps shared, non-cyclic references)', () => {
    const shared = { name: 'shared' };
    const input: Record<string, unknown> = { a: shared, b: shared, token: 'x' };
    input.self = input;
    expect(redactCredentials(input)).toEqual({
      a: { name: 'shared' },
      b: { name: 'shared' },
      token: REDACTED,
      self: '[Circular]',
    });
  });

  it('caps the depth', () => {
    let deep: Record<string, unknown> = { password: 'p' };
    for (let i = 0; i < MAX_DEPTH + 5; i++) deep = { next: deep };
    const out = JSON.stringify(redactCredentials(deep));
    expect(out).toContain('[Truncated]');
    expect(out).not.toContain('"p"');
  });

  it('keeps Error objects useful and redacts their fields (err.config.data.idToken)', () => {
    class UpstreamError extends Error {}
    const cause = Object.assign(new Error('socket'), { token: 'cause-tok' });
    const err = Object.assign(new UpstreamError('request failed', { cause }), {
      code: 'ECONNRESET',
      config: {
        url: 'https://oauth2.example/token',
        headers: { Authorization: 'Bearer leaked' },
        data: { idToken: 'leaked-id-token', grant: 'x' },
      },
    });
    const out = (redactCredentials({ err }) as { err: typeof err }).err;
    expect(out).toBeInstanceOf(UpstreamError);
    expect(out).not.toBe(err);
    expect(out.message).toBe('request failed');
    expect(out.stack).toBe(err.stack);
    expect(out).toMatchObject({
      code: 'ECONNRESET',
      config: {
        url: 'https://oauth2.example/token',
        headers: { Authorization: REDACTED },
        data: { idToken: REDACTED, grant: 'x' },
      },
    });
    expect(out.cause).toMatchObject({ message: 'socket', token: REDACTED });
    // pino's error serializer still gives type, message and stack.
    const logged = pino.stdSerializers.err(out);
    expect(logged).toMatchObject({
      type: 'UpstreamError',
      message: 'request failed: socket', // pino appends the cause message
      config: { data: { idToken: REDACTED } },
    });
    expect(JSON.stringify(logged)).not.toMatch(/leaked|cause-tok/);
    // The original error is untouched.
    expect(err.config.data.idToken).toBe('leaked-id-token');
    expect((err.cause as { token: string }).token).toBe('cause-tok');
  });

  it('serializes like JSON.stringify: toJSON, class instances', () => {
    class Box {
      apiKey = 'k';
      size = 2;
    }
    const date = new Date('2026-01-02T03:04:05Z');
    expect(redactCredentials({ date, box: new Box() })).toEqual({
      date: '2026-01-02T03:04:05.000Z',
      box: { apiKey: REDACTED, size: 2 },
    });
  });
});

describe('redactLogObject', () => {
  it('leaves req/res to their serializers and redacts everything else', () => {
    const req = { headers: { authorization: 'Bearer x' } };
    const out = redactLogObject({ req, msgToken: 't', ctx: { secret: 's' } });
    expect(out.req).toBe(req);
    expect(out).toMatchObject({
      msgToken: REDACTED,
      ctx: { secret: REDACTED },
    });
  });
});

describe('pino options redact credentials in real log lines', () => {
  it('redacts nested credential fields', () => {
    const lines: string[] = [];
    const stream = new Writable({
      write(chunk: Buffer, _enc, done) {
        lines.push(chunk.toString());
        done();
      },
    });
    const options = buildPinoHttpOptions(
      loadConfig({
        NODE_ENV: 'test',
        HOSTED_DOMAIN: 'x',
        GOOGLE_CLIENT_ID: 'x',
        JWT_ACCESS_SECRET: 'x'.repeat(32),
        LOG_LEVEL: 'info',
      }),
    );
    const logger = pino(
      {
        level: 'info',
        redact: options.redact,
        formatters: options.formatters,
      },
      stream,
    );
    logger.info(
      {
        togglApiToken: 'toggl-secret',
        upstream: { request: { body: { client_secret: 'cs', ok: 1 } } },
        err: Object.assign(new Error('boom'), {
          config: { data: { idToken: 'nested-id-token' } },
        }),
      },
      'call failed',
    );
    const line = lines.join('');
    for (const secret of ['toggl-secret', '"cs"', 'nested-id-token'])
      expect(line).not.toContain(secret);
    expect(JSON.parse(line)).toMatchObject({
      msg: 'call failed',
      togglApiToken: REDACTED,
      upstream: { request: { body: { client_secret: REDACTED, ok: 1 } } },
      err: {
        type: 'Error',
        message: 'boom',
        config: { data: { idToken: REDACTED } },
      },
    });
  });
});
