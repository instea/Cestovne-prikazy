import { expect } from '@playwright/test';
import { MAILPIT_API_URL } from './env';

/**
 * TST-03 Mailpit API helper. Mailpit is never cleared: messages are found
 * by recipient plus a unique word (the persona's surname tag), so tests and
 * retries do not see each other's mail.
 */

export interface MailSummary {
  ID: string;
  To: { Name: string; Address: string }[];
  Subject: string;
  Snippet: string;
}

export interface MailMessage extends MailSummary {
  HTML: string;
  Text: string;
}

export interface MailQuery {
  to: string;
  /** Exact subject. */
  subject?: string;
  /** Free text that must occur in the message (Mailpit search). */
  contains?: string;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(new URL(path, MAILPIT_API_URL));
  if (!res.ok) throw new Error(`Mailpit ${path}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

const quoted = (v: string) => `"${v.replaceAll('"', ' ')}"`;

/** Messages matching `query` (newest first). */
export async function searchMail(query: MailQuery): Promise<MailSummary[]> {
  const terms = [`to:${quoted(query.to)}`];
  if (query.subject) terms.push(`subject:${quoted(query.subject)}`);
  if (query.contains) terms.push(quoted(query.contains));
  const { messages } = await get<{ messages: MailSummary[] }>(
    `/api/v1/search?${new URLSearchParams({ query: terms.join(' ') }).toString()}`,
  );
  const to = query.to.toLowerCase();
  return messages.filter(
    (m) =>
      m.To.some((a) => a.Address.toLowerCase() === to) &&
      (query.subject === undefined || m.Subject === query.subject),
  );
}

/** Waits until exactly one message matches and returns it in full. */
export async function waitForMail(query: MailQuery): Promise<MailMessage> {
  let found: MailSummary[] = [];
  await expect
    .poll(
      async () => {
        found = await searchMail(query);
        return found.length;
      },
      { message: `one email ${JSON.stringify(query)}`, timeout: 15_000 },
    )
    .toBe(1);
  return get<MailMessage>(`/api/v1/message/${found[0]!.ID}`);
}
