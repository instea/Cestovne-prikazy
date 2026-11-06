import { setTimeout as sleep } from 'node:timers/promises';
import { Logger } from '@nestjs/common';
import { LeaveState, LeaveType } from '@leaves/shared/leaves';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MailService } from '../../src/mail/mail.service';
import { LeaveNotificationsService } from '../../src/notifications/leave-notifications.service';
import { useTestApp } from '../support/app';
import { mailbox, uniqueAddress } from '../support/mailbox';

/**
 * NOT-02 / NOT-03 against the run's Mailpit, calling the notifier directly.
 * TODO(LV-01): `POST /api/leaves` → approver email.
 * TODO(APR-01): approve / reject → requester email, incl. re-approve.
 */

const leave = {
  id: 'leave-int-1',
  startDate: '2026-12-21',
  endDate: '2026-12-23',
  type: LeaveType.ANNUAL,
};
const jana = { firstName: 'Jana', surname: 'Nová' };
const peter = { firstName: 'Peter', surname: 'Admin' };
const requester = (email: string, active = true) => ({
  ...jana,
  email,
  active,
  anonymizedAt: null,
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function settle(app: ReturnType<ReturnType<typeof useTestApp>>['app']) {
  await app.get(MailService).idle();
  await sleep(300); // let Mailpit index anything that did arrive
}

describe('new-leave email (NOT-02)', () => {
  const approver = uniqueAddress('approver');
  const ctx = useTestApp({
    env: {
      APPROVAL_MAIL_RECEIVER: approver,
      BASE_URL: 'https://cestaky.example.test/',
      DEFAULT_TIMEZONE: 'America/New_York',
    },
  });

  it('sends one email to APPROVAL_MAIL_RECEIVER', async () => {
    ctx()
      .app.get(LeaveNotificationsService)
      .leaveCreated(leave, { firstName: 'Jana', surname: "O'Neil <x>" });

    const msg = await mailbox.waitFor({
      to: approver,
      subject: 'New leave notification',
    });
    expect(msg.To.map((a) => a.Address)).toEqual([approver]);
    expect(msg.HTML).toContain('Jana O&#39;Neil &lt;x&gt;');
    // Calendar dates are not shifted by DEFAULT_TIMEZONE.
    expect(msg.HTML).toContain(
      'Monday, Dec 21, 2026 - Wednesday, Dec 23, 2026',
    );
    expect(msg.HTML).toContain('<b>Type: </b>Annual leave<br>');
    expect(msg.HTML).toContain(
      '<a href="https://cestaky.example.test/approval">Approve</a>',
    );
  });

  it('empty receiver: no email and a warn line', async () => {
    const { app, config } = ctx();
    const warn = vi.spyOn(Logger.prototype, 'warn');
    // Env cannot leave it empty (non-prod default, prod required); the
    // service still guards it.
    config.APPROVAL_MAIL_RECEIVER = '';
    try {
      app
        .get(LeaveNotificationsService)
        .leaveCreated({ ...leave, id: 'leave-int-2' }, jana);
      await settle(app);
    } finally {
      config.APPROVAL_MAIL_RECEIVER = approver;
    }
    expect(warn).toHaveBeenCalledWith(
      'Email not sent: APPROVAL_MAIL_RECEIVER is not set (template=leave-created, leaveId=leave-int-2)',
    );
    expect(
      (await mailbox.search({ to: approver })).filter(
        (m) => m.Subject === 'New leave notification',
      ),
    ).toHaveLength(1); // only the one from the first test
  });
});

describe('SMTP not configured (NOT-02 / NOT-03)', () => {
  const approver = uniqueAddress('approver');
  const ctx = useTestApp({
    env: { APPROVAL_MAIL_RECEIVER: approver, SMTP_PASSWORD: '' },
  });

  it('sends nothing and logs the NOT-01 warn line', async () => {
    const { app } = ctx();
    const warn = vi.spyOn(Logger.prototype, 'warn');
    const to = uniqueAddress('requester');
    const notifier = app.get(LeaveNotificationsService);
    notifier.leaveCreated(leave, jana);
    notifier.leaveDecided(
      leave,
      LeaveState.PENDING,
      LeaveState.APPROVED,
      requester(to),
      peter,
    );
    await settle(app);
    expect(warn).toHaveBeenCalledWith(
      'Email not sent: SMTP is not configured (template=leave-created, leaveId=leave-int-1)',
    );
    expect(warn).toHaveBeenCalledWith(
      'Email not sent: SMTP is not configured (template=leave-approved, leaveId=leave-int-1)',
    );
    expect(await mailbox.search({ to: approver })).toEqual([]);
    expect(await mailbox.search({ to })).toEqual([]);
  });
});

describe('decision email (NOT-03)', () => {
  const ctx = useTestApp();

  it('approve PENDING → one approved email to the requester', async () => {
    const to = uniqueAddress('requester');
    ctx()
      .app.get(LeaveNotificationsService)
      .leaveDecided(
        leave,
        LeaveState.PENDING,
        LeaveState.APPROVED,
        requester(to),
        peter,
      );
    const msg = await mailbox.waitFor({
      to,
      subject: 'Your leave was approved',
    });
    expect(msg.HTML).toContain(
      'Monday, Dec 21, 2026 - Wednesday, Dec 23, 2026',
    );
    expect(msg.HTML).toContain('<b>Approved by: </b>Peter Admin<br>');
    expect(msg.HTML).toContain(
      '<a href="https://cestaky.example.test/leaves">Open leaves</a>',
    );
  });

  it('reject PENDING → one rejected email', async () => {
    const to = uniqueAddress('requester');
    ctx()
      .app.get(LeaveNotificationsService)
      .leaveDecided(
        leave,
        LeaveState.PENDING,
        LeaveState.REJECTED,
        requester(to),
        peter,
      );
    const msg = await mailbox.waitFor({
      to,
      subject: 'Your leave was rejected',
    });
    expect(msg.HTML).toContain('<b>Rejected by: </b>Peter Admin<br>');
  });

  it('REJECTED → APPROVED sends; APPROVED → APPROVED sends nothing', async () => {
    const { app } = ctx();
    const to = uniqueAddress('requester');
    const notifier = app.get(LeaveNotificationsService);
    notifier.leaveDecided(
      leave,
      LeaveState.REJECTED,
      LeaveState.APPROVED,
      requester(to),
      peter,
    );
    notifier.leaveDecided(
      leave,
      LeaveState.APPROVED,
      LeaveState.APPROVED,
      requester(to),
      peter,
    );
    await mailbox.waitFor({ to, subject: 'Your leave was approved' });
    await settle(app);
    expect(await mailbox.search({ to })).toHaveLength(1);
  });

  it('deactivated requester → no email, info line', async () => {
    const { app } = ctx();
    const log = vi.spyOn(Logger.prototype, 'log');
    const to = uniqueAddress('requester');
    app
      .get(LeaveNotificationsService)
      .leaveDecided(
        leave,
        LeaveState.PENDING,
        LeaveState.APPROVED,
        requester(to, false),
        peter,
      );
    await settle(app);
    expect(log).toHaveBeenCalledWith(
      'Email not sent: requester inactive (template=leave-approved, leaveId=leave-int-1)',
    );
    expect(await mailbox.search({ to })).toEqual([]);
  });
});
