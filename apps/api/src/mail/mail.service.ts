import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
} from '@nestjs/common';
import type { SendMailOptions, SMTPTransportOptions } from 'nodemailer';
import { APP_CONFIG } from '../config/config.module';
import { type AppConfig, isSmtpConfigured } from '../config/env.schema';

/** Injection token of the transport; `null` when SMTP is not configured. */
export const MAIL_TRANSPORT = Symbol('MAIL_TRANSPORT');

/** The part of a Nodemailer transporter `MailService` uses. */
export interface MailTransport {
  sendMail(options: SendMailOptions): Promise<{ messageId: string }>;
  close(): void;
}

export interface MailMessage {
  to: string;
  subject: string;
  /** Built with the `html` helper so user values are escaped. */
  html: string;
  /** Logged instead of the recipient (PII). */
  context: { template: string; leaveId?: string };
}

/** Longest wait for in-flight sends on shutdown. */
const SHUTDOWN_WAIT_MS = 5_000;

/** Email addresses inside SMTP error texts (e.g. rejected recipients). */
const ADDRESS = /[^\s<>()[\]@,;:"]+@[^\s<>()[\]@,;:"]+/g;

/** SMTP connection options from config (NOT-01). */
export function smtpTransportOptions(config: AppConfig): SMTPTransportOptions {
  return {
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    // `false` = plain connect, STARTTLS when the server offers it.
    secure: config.SMTP_SECURE,
    auth: { user: config.SMTP_USER, pass: config.SMTP_PASSWORD },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  };
}

function describe(context: MailMessage['context']): string {
  return context.leaveId === undefined
    ? `template=${context.template}`
    : `template=${context.template}, leaveId=${context.leaveId}`;
}

function errorText(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err);
  return text.replace(ADDRESS, '[address]');
}

/**
 * NOT-01: fire-and-forget HTML email. `send` returns at once; delivery runs
 * in the background and its outcome is only logged (no retry). Callers
 * (NOT-02, NOT-03) are never delayed or failed by SMTP.
 */
@Injectable()
export class MailService implements OnApplicationShutdown {
  private readonly logger = new Logger(MailService.name);
  private readonly inFlight = new Set<Promise<void>>();

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(MAIL_TRANSPORT) private readonly transport: MailTransport | null,
  ) {}

  isConfigured(): boolean {
    return isSmtpConfigured(this.config);
  }

  send(message: MailMessage): void {
    try {
      if (!this.transport || !this.isConfigured()) {
        this.logger.warn(
          `Email not sent: SMTP is not configured (${describe(message.context)})`,
        );
        return;
      }
      // `deliver` never rejects; the extra catch keeps the background chain
      // from ever becoming an unhandled rejection.
      const job = this.deliver(this.transport, message).catch(() => undefined);
      this.inFlight.add(job);
      void job.finally(() => this.inFlight.delete(job));
    } catch {
      // A logging failure must not reach the business operation either.
    }
  }

  /**
   * Resolves once no send is in flight, including sends started while
   * waiting (tests, shutdown).
   */
  async idle(): Promise<void> {
    while (this.inFlight.size > 0) {
      await Promise.all([...this.inFlight]);
    }
  }

  /**
   * Drains in-flight sends (at most 5 s), then closes the transport. Runs in
   * `onApplicationShutdown`, i.e. after Nest has closed the HTTP server, so a
   * request still running at shutdown cannot start a send after the drain.
   */
  async onApplicationShutdown(): Promise<void> {
    if (!this.transport) return;
    let timer: NodeJS.Timeout | undefined;
    await Promise.race([
      this.idle(),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, SHUTDOWN_WAIT_MS);
      }),
    ]);
    clearTimeout(timer);
    this.transport.close();
  }

  private async deliver(
    transport: MailTransport,
    { to, subject, html, context }: MailMessage,
  ): Promise<void> {
    let messageId: string;
    try {
      ({ messageId } = await transport.sendMail({
        from: this.config.MAIL_SENDER,
        to,
        subject,
        html,
      }));
    } catch (err) {
      this.safeLog(() => {
        this.logger.error(
          `Email failed (${describe(context)}): ${errorText(err)}`,
        );
      });
      return;
    }
    // Outside the send's try: a logging failure is not a send failure.
    this.safeLog(() => {
      this.logger.log(
        `Email sent (${describe(context)}, messageId=${messageId})`,
      );
    });
  }

  /** A logging failure must never surface from a background send. */
  private safeLog(write: () => void): void {
    try {
      write();
    } catch {
      // Nothing left to report to.
    }
  }
}
