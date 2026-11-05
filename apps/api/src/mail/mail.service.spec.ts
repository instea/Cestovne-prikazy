import { Logger } from '@nestjs/common';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type MockInstance,
  vi,
} from 'vitest';
import { loadConfig } from '../config/env.schema';
import {
  MailService,
  type MailTransport,
  smtpTransportOptions,
} from './mail.service';

const baseEnv = {
  NODE_ENV: 'test',
  HOSTED_DOMAIN: 'instea.co',
  GOOGLE_CLIENT_ID: 'id',
  JWT_ACCESS_SECRET: 'x'.repeat(32),
};
const smtpEnv = {
  ...baseEnv,
  SMTP_HOST: 'smtp.example.test',
  SMTP_PORT: '587',
  SMTP_USER: 'user',
  SMTP_PASSWORD: 'pass',
  MAIL_SENDER: 'leaves@example.test',
};

const message = {
  to: 'jana@example.test',
  subject: 'Subject',
  html: '<p>hi</p>',
  context: { template: 'leave-created', leaveId: 'L1' },
};

function fakeTransport(
  impl: MailTransport['sendMail'] = () =>
    Promise.resolve({ messageId: '<m1@x>' }),
) {
  return { sendMail: vi.fn(impl), close: vi.fn() };
}

describe('smtpTransportOptions', () => {
  it('maps config to SMTP options with the NOT-01 timeouts', () => {
    expect(smtpTransportOptions(loadConfig(smtpEnv))).toEqual({
      host: 'smtp.example.test',
      port: 587,
      secure: false,
      auth: { user: 'user', pass: 'pass' },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  });

  it('uses TLS from connect only when SMTP_SECURE=true', () => {
    expect(
      smtpTransportOptions(loadConfig({ ...smtpEnv, SMTP_SECURE: 'true' }))
        .secure,
    ).toBe(true);
    for (const other of ['false', 'TRUE', '1', 'yes']) {
      expect(
        smtpTransportOptions(loadConfig({ ...smtpEnv, SMTP_SECURE: other }))
          .secure,
      ).toBe(false);
    }
  });
});

describe('MailService', () => {
  let warn: MockInstance<Logger['warn']>;
  let info: MockInstance<Logger['log']>;
  let error: MockInstance<Logger['error']>;

  beforeEach(() => {
    warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    info = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('isConfigured follows the four-var rule', () => {
    expect(new MailService(loadConfig(smtpEnv), null).isConfigured()).toBe(
      true,
    );
    expect(
      new MailService(
        loadConfig({ ...smtpEnv, SMTP_PASSWORD: '' }),
        null,
      ).isConfigured(),
    ).toBe(false);
  });

  it('not configured: sends nothing and logs exactly one warn line', async () => {
    const transport = fakeTransport();
    const service = new MailService(
      loadConfig({ ...smtpEnv, SMTP_PASSWORD: '' }),
      transport,
    );
    expect(service.send(message)).toBeUndefined();
    await service.idle();
    expect(transport.sendMail).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      'Email not sent: SMTP is not configured (template=leave-created, leaveId=L1)',
    );
    expect(info).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it('configured: sends From = MAIL_SENDER with to / subject / html and logs info', async () => {
    const transport = fakeTransport();
    const service = new MailService(loadConfig(smtpEnv), transport);
    service.send(message);
    await service.idle();
    expect(transport.sendMail).toHaveBeenCalledWith({
      from: 'leaves@example.test',
      to: 'jana@example.test',
      subject: 'Subject',
      html: '<p>hi</p>',
    });
    expect(info).toHaveBeenCalledWith(
      'Email sent (template=leave-created, leaveId=L1, messageId=<m1@x>)',
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it('omits leaveId from log lines when the message has none', async () => {
    const service = new MailService(loadConfig(smtpEnv), fakeTransport());
    service.send({ ...message, context: { template: 'test' } });
    await service.idle();
    expect(info).toHaveBeenCalledWith(
      'Email sent (template=test, messageId=<m1@x>)',
    );
  });

  it('returns before the transport resolves (fire-and-forget)', async () => {
    let resolve!: (v: { messageId: string }) => void;
    const transport = fakeTransport(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const service = new MailService(loadConfig(smtpEnv), transport);
    service.send(message);
    expect(info).not.toHaveBeenCalled();
    resolve({ messageId: 'm' });
    await service.idle();
    expect(info).toHaveBeenCalledTimes(1);
  });

  it('a rejected send logs one error line and never rejects to the caller', async () => {
    const transport = fakeTransport(() =>
      Promise.reject(new Error('connect ECONNREFUSED 127.0.0.1:1')),
    );
    const service = new MailService(loadConfig(smtpEnv), transport);
    expect(() => {
      service.send(message);
    }).not.toThrow();
    await service.idle();
    expect(error).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith(
      'Email failed (template=leave-created, leaveId=L1): connect ECONNREFUSED 127.0.0.1:1',
    );
    expect(transport.sendMail).toHaveBeenCalledTimes(1);
  });

  it('a transport that throws synchronously is handled the same way', async () => {
    const transport = fakeTransport(() => {
      throw new Error('boom');
    });
    const service = new MailService(loadConfig(smtpEnv), transport);
    expect(() => {
      service.send(message);
    }).not.toThrow();
    await service.idle();
    expect(error).toHaveBeenCalledWith(
      'Email failed (template=leave-created, leaveId=L1): boom',
    );
  });

  it('never writes recipient addresses to logs', async () => {
    const transport = fakeTransport(() =>
      Promise.reject(
        new Error(
          "Can't send mail - all recipients were rejected: 550 <jana@example.test> unknown user",
        ),
      ),
    );
    const service = new MailService(loadConfig(smtpEnv), transport);
    service.send(message);
    await service.idle();
    const logged = JSON.stringify([
      warn.mock.calls,
      info.mock.calls,
      error.mock.calls,
    ]);
    expect(logged).not.toContain('jana@example.test');
    expect(error).toHaveBeenCalledWith(
      "Email failed (template=leave-created, leaveId=L1): Can't send mail - all recipients were rejected: 550 <[address]> unknown user",
    );
  });

  it('logs non-Error rejections as text', async () => {
    const transport = fakeTransport(() =>
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      Promise.reject('plain failure'),
    );
    const service = new MailService(loadConfig(smtpEnv), transport);
    service.send(message);
    await service.idle();
    expect(error).toHaveBeenCalledWith(
      'Email failed (template=leave-created, leaveId=L1): plain failure',
    );
  });

  it('closes the transport on shutdown after in-flight sends settle', async () => {
    const transport = fakeTransport();
    const service = new MailService(loadConfig(smtpEnv), transport);
    service.send(message);
    await service.onApplicationShutdown();
    expect(info).toHaveBeenCalledTimes(1);
    expect(transport.close).toHaveBeenCalledTimes(1);
  });

  it('shutdown also waits for a send started while draining', async () => {
    const resolvers: ((v: { messageId: string }) => void)[] = [];
    const transport = fakeTransport(
      () =>
        new Promise((r) => {
          resolvers.push(r);
        }),
    );
    const service = new MailService(loadConfig(smtpEnv), transport);
    service.send(message);
    const shutdown = service.onApplicationShutdown();
    service.send(message);
    resolvers[0]!({ messageId: 'a' });
    await Promise.resolve();
    await Promise.resolve();
    expect(transport.close).not.toHaveBeenCalled();
    resolvers[1]!({ messageId: 'b' });
    await shutdown;
    expect(info).toHaveBeenCalledTimes(2);
    expect(transport.close).toHaveBeenCalledTimes(1);
  });

  it('shutdown stops waiting after 5 s and still closes the transport', async () => {
    vi.useFakeTimers();
    try {
      const transport = fakeTransport(() => new Promise(() => {}));
      const service = new MailService(loadConfig(smtpEnv), transport);
      service.send(message);
      const shutdown = service.onApplicationShutdown();
      await vi.advanceTimersByTimeAsync(5_000);
      await shutdown;
      expect(transport.close).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('shutdown without a transport is a no-op', async () => {
    const service = new MailService(loadConfig(baseEnv), null);
    await expect(service.onApplicationShutdown()).resolves.toBeUndefined();
  });

  it('a throwing error logger does not reject the background send', async () => {
    error.mockImplementation(() => {
      throw new Error('logger down');
    });
    const transport = fakeTransport(() => Promise.reject(new Error('smtp')));
    const service = new MailService(loadConfig(smtpEnv), transport);
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      service.send(message);
      await expect(service.idle()).resolves.toBeUndefined();
      await new Promise((r) => setImmediate(r));
      expect(unhandled).not.toHaveBeenCalled();
      expect(error).toHaveBeenCalledTimes(1);
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });

  it('a throwing success logger is not reported as a failed send', async () => {
    info.mockImplementation(() => {
      throw new Error('logger down');
    });
    const service = new MailService(loadConfig(smtpEnv), fakeTransport());
    service.send(message);
    await expect(service.idle()).resolves.toBeUndefined();
    expect(info).toHaveBeenCalledTimes(1);
    expect(error).not.toHaveBeenCalled();
  });
});
