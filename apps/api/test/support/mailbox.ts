import { randomBytes } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { inject } from 'vitest';

/**
 * TST-02 Mailpit helper. One Mailpit serves the whole run (global setup),
 * so files never clear it: each test sends to its own `uniqueAddress()` and
 * looks messages up by recipient.
 */

export interface MailAddress {
  Name: string;
  Address: string;
}

/** Item of Mailpit `GET /api/v1/search`. */
export interface MailSummary {
  ID: string;
  From: MailAddress;
  To: MailAddress[];
  Subject: string;
}

/** Mailpit `GET /api/v1/message/{ID}` (fields used by tests). */
export interface MailMessage extends MailSummary {
  Cc: MailAddress[] | null;
  HTML: string;
  Text: string;
}

export interface MailQuery {
  to: string;
  /** Exact subject; omitted = any. */
  subject?: string;
}

export function mailpitEndpoints(): {
  apiUrl: string;
  smtpHost: string;
  smtpPort: number;
} {
  return {
    apiUrl: inject('mailpitApiUrl'),
    smtpHost: inject('mailpitSmtpHost'),
    smtpPort: inject('mailpitSmtpPort'),
  };
}

/** Fresh recipient `<prefix>.<random>@example.test`. */
export function uniqueAddress(prefix = 'user'): string {
  return `${prefix}.${randomBytes(6).toString('hex')}@example.test`;
}

async function api<T>(path: string): Promise<T> {
  const res = await fetch(new URL(path, mailpitEndpoints().apiUrl));
  if (!res.ok) throw new Error(`Mailpit ${path}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

const quoted = (v: string) => `"${v.replaceAll('"', ' ')}"`;

async function search({ to, subject }: MailQuery): Promise<MailSummary[]> {
  const query = [`to:${quoted(to)}`];
  if (subject !== undefined) query.push(`subject:${quoted(subject)}`);
  const { messages } = await api<{ messages: MailSummary[] }>(
    `/api/v1/search?${new URLSearchParams({ query: query.join(' ') }).toString()}`,
  );
  const target = to.toLowerCase();
  return messages.filter(
    (m) =>
      m.To.some((a) => a.Address.toLowerCase() === target) &&
      (subject === undefined || m.Subject === subject),
  );
}

async function waitFor(
  query: MailQuery,
  { timeoutMs = 10_000, intervalMs = 100 } = {},
): Promise<MailMessage> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const [hit] = await search(query);
    if (hit) return api<MailMessage>(`/api/v1/message/${hit.ID}`);
    if (Date.now() >= deadline) {
      const subject =
        query.subject === undefined ? '' : ` with subject "${query.subject}"`;
      throw new Error(
        `No email to ${query.to}${subject} within ${timeoutMs} ms`,
      );
    }
    await sleep(intervalMs);
  }
}

export const mailbox = { search, waitFor };
