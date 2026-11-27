import 'reflect-metadata';
import { createServer } from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';
import { Body, Controller, Module, Post } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { IsString } from 'class-validator';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { configureApp } from '../../src/app.setup';
import { ConfigModule } from '../../src/config/config.module';
import { loadConfig } from '../../src/config/env.schema';
import { LoggingModule } from '../../src/logging/logging.module';
import { html } from '../../src/mail/html';
import { MailModule } from '../../src/mail/mail.module';
import { MailService } from '../../src/mail/mail.service';
import { useTestApp } from '../support/app';
import { TEST_ENV } from '../support/env';
import { mailbox, mailpitEndpoints, uniqueAddress } from '../support/mailbox';

/**
 * NOT-01 against the run's Mailpit (TST-02). A probe "leave action" endpoint
 * stands in for LV-01 / APR-01, which call `send` the same way.
 */

class ProbeDto {
  @IsString()
  to!: string;
  @IsString()
  firstName!: string;
}

@Controller('api/test/mail')
class ProbeController {
  constructor(private readonly mail: MailService) {}

  @Post()
  act(@Body() body: ProbeDto): { ok: true } {
    this.mail.send({
      to: body.to,
      subject: 'Probe notification',
      html: html`<p>Requester: ${body.firstName}</p>`.toString(),
      context: { template: 'probe', leaveId: 'leave-1' },
    });
    return { ok: true };
  }
}

interface LogLine {
  level: number;
  msg: string;
  context?: string;
}

const WARN = 40;
const INFO = 30;
const ERROR = 50;

/**
 * nestjs-pino keeps one root logger per process, bound to the destination of
 * the first app, so every probe app in this file shares this one.
 */
const raw: string[] = [];
const destination = { write: (line: string) => void raw.push(line) };

let open: NestExpressApplication | undefined;

afterEach(async () => {
  await open?.close();
  open = undefined;
});

async function startProbe(env: Record<string, string>) {
  const { smtpHost, smtpPort } = mailpitEndpoints();
  const config = loadConfig({
    ...TEST_ENV,
    SMTP_HOST: smtpHost,
    SMTP_PORT: String(smtpPort),
    LOG_LEVEL: 'info',
    ...env,
  });
  raw.length = 0;

  @Module({
    imports: [
      ConfigModule.forRoot(config),
      LoggingModule.forRoot(destination),
      MailModule,
    ],
    controllers: [ProbeController],
  })
  class ProbeModule {}

  const moduleRef = await Test.createTestingModule({
    imports: [ProbeModule],
  }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({
    bufferLogs: true,
  });
  configureApp(app, config);
  await app.init();
  open = app;

  const mailLines = () =>
    raw
      .map((l) => JSON.parse(l) as LogLine)
      .filter((l) => l.context === 'MailService');
  const waitForLine = async (level: number) => {
    const deadline = Date.now() + 4_000;
    for (;;) {
      const hit = mailLines().find((l) => l.level === level);
      if (hit) return hit;
      if (Date.now() > deadline) {
        throw new Error(`no level ${level} MailService line: ${raw.join('')}`);
      }
      await sleep(50);
    }
  };
  return { app, config, mailLines, waitForLine };
}

/** A local port with nothing listening on it. */
async function closedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as { port: number };
  await new Promise((r) => server.close(r));
  return port;
}

describe('MailService (Mailpit)', () => {
  it('delivers From = MAIL_SENDER with the given To, subject and HTML', async () => {
    const probe = await startProbe({});
    const to = uniqueAddress('requester');
    const res = await request(probe.app.getHttpServer())
      .post('/api/test/mail')
      .send({ to, firstName: 'Jana' });
    expect(res.status).toBe(201);

    const msg = await mailbox.waitFor({ to, subject: 'Probe notification' });
    expect(msg.From.Address).toBe(probe.config.MAIL_SENDER);
    expect(msg.To.map((a) => a.Address)).toEqual([to]);
    expect(msg.HTML).toContain('<p>Requester: Jana</p>');

    const sent = await probe.waitForLine(INFO);
    expect(sent.msg).toMatch(
      /^Email sent \(template=probe, leaveId=leave-1, messageId=<.+>\)$/,
    );
    expect(raw.join('')).not.toContain(to);
  });

  it('shows an HTML-looking first name as literal text', async () => {
    await startProbe({});
    const to = uniqueAddress('requester');
    await request(open!.getHttpServer())
      .post('/api/test/mail')
      .send({ to, firstName: '<b>x</b>' })
      .expect(201);

    const msg = await mailbox.waitFor({ to, subject: 'Probe notification' });
    expect(msg.HTML).toContain('Requester: &lt;b&gt;x&lt;/b&gt;');
    expect(msg.HTML).not.toContain('<b>x</b>');
    expect(msg.Text).toContain('<b>x</b>');
  });

  it('unreachable SMTP: the HTTP response is unaffected and an error line is logged', async () => {
    const probe = await startProbe({
      SMTP_HOST: '127.0.0.1',
      SMTP_PORT: String(await closedPort()),
    });
    const to = uniqueAddress('requester');
    const started = Date.now();
    const res = await request(probe.app.getHttpServer())
      .post('/api/test/mail')
      .send({ to, firstName: 'Jana' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ ok: true });
    expect(Date.now() - started).toBeLessThan(2_000);

    const failed = await probe.waitForLine(ERROR);
    expect(failed.msg).toMatch(
      /^Email failed \(template=probe, leaveId=leave-1\): .*ECONNREFUSED/,
    );
    expect(raw.join('')).not.toContain(to);
  });

  it('not configured: logs one warn line and Mailpit receives nothing', async () => {
    const probe = await startProbe({ SMTP_PASSWORD: '' });
    expect(probe.app.get(MailService).isConfigured()).toBe(false);
    const to = uniqueAddress('requester');
    await request(probe.app.getHttpServer())
      .post('/api/test/mail')
      .send({ to, firstName: 'Jana' })
      .expect(201);

    const warn = await probe.waitForLine(WARN);
    expect(warn.msg).toBe(
      'Email not sent: SMTP is not configured (template=probe, leaveId=leave-1)',
    );
    await probe.app.get(MailService).idle();
    await sleep(300);
    expect(probe.mailLines()).toHaveLength(1);
    expect(await mailbox.search({ to })).toEqual([]);
  });
});

describe('MailService in AppModule', () => {
  const ctx = useTestApp();

  it('is wired into the app and points at Mailpit', () => {
    expect(ctx().app.get(MailService).isConfigured()).toBe(true);
  });
});
