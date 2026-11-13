import { connect } from 'node:net';
import { describe, expect, it } from 'vitest';
import { mailbox, mailpitEndpoints, uniqueAddress } from '../support/mailbox';

/** Drop a message into Mailpit through its send API (no SMTP client yet: NOT-01). */
async function deliver(to: string, subject: string, html = '<p>hi</p>') {
  const res = await fetch(new URL('/api/v1/send', mailpitEndpoints().apiUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      From: { Email: 'leaves@example.test' },
      To: [{ Email: to }],
      Subject: subject,
      HTML: html,
    }),
  });
  expect(res.status).toBe(200);
}

describe('Mailpit mailbox helper', () => {
  it('waitFor({ to, subject }) returns the matching message with its HTML', async () => {
    const to = uniqueAddress();
    await deliver(uniqueAddress(), 'New leave notification');
    await deliver(to, 'Other subject');
    const pending = mailbox.waitFor({ to, subject: 'New leave notification' });
    await deliver(to, 'New leave notification', '<b>Jana Nová</b>');
    const msg = await pending;
    expect(msg.Subject).toBe('New leave notification');
    expect(msg.To.map((a) => a.Address)).toEqual([to]);
    expect(msg.From.Address).toBe('leaves@example.test');
    expect(msg.HTML).toContain('<b>Jana Nová</b>');
  });

  it('matches the subject exactly, not as a substring', async () => {
    const to = uniqueAddress();
    await deliver(to, 'Leave approved (reminder)');
    await expect(
      mailbox.waitFor({ to, subject: 'Leave approved' }, { timeoutMs: 600 }),
    ).rejects.toThrow(/No email to .* with subject "Leave approved"/);
  });

  it('search({ to }) lists every message to one address', async () => {
    const to = uniqueAddress();
    await deliver(to, 'one');
    await deliver(to, 'two');
    const found = await mailbox.search({ to });
    expect(found.map((m) => m.Subject).sort()).toEqual(['one', 'two']);
  });

  it('uniqueAddress() never repeats, so parallel files do not collide', () => {
    expect(uniqueAddress()).not.toBe(uniqueAddress());
    expect(uniqueAddress('approver')).toMatch(
      /^approver\.[0-9a-f]+@example\.test$/,
    );
  });

  it('exposes an SMTP endpoint that greets with 220', async () => {
    const { smtpHost, smtpPort } = mailpitEndpoints();
    const banner = await new Promise<string>((resolve, reject) => {
      const socket = connect(smtpPort, smtpHost);
      socket.once('data', (chunk) => {
        socket.end();
        resolve(chunk.toString());
      });
      socket.once('error', reject);
    });
    expect(banner).toMatch(/^220 /);
  });
});
