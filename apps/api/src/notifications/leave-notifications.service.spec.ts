import { Logger } from '@nestjs/common';
import { LeaveState, LeaveType } from '@leaves/shared/leaves';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../config/env.schema';
import type { MailService } from '../mail/mail.service';
import { LeaveNotificationsService } from './leave-notifications.service';

const leave = {
  id: 'L1',
  startDate: '2026-12-21',
  endDate: '2026-12-23',
  type: LeaveType.ANNUAL,
};
const requester = {
  firstName: 'Jana',
  surname: 'Nová',
  email: 'jana@example.test',
  active: true,
  anonymizedAt: null,
};
const admin = { firstName: 'Peter', surname: 'Admin' };

function setup(config: Partial<AppConfig> = {}) {
  const send = vi.fn();
  const service = new LeaveNotificationsService(
    {
      BASE_URL: 'https://cestaky.example.test',
      APPROVAL_MAIL_RECEIVER: 'approver@example.test',
      ...config,
    } as AppConfig,
    { send } as unknown as MailService,
  );
  const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
  const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
  const error = vi
    .spyOn(Logger.prototype, 'error')
    .mockImplementation(() => {});
  return { service, send, warn, log, error };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('LeaveNotificationsService.leaveCreated (NOT-02)', () => {
  it('sends one email to APPROVAL_MAIL_RECEIVER', () => {
    const { service, send } = setup();
    service.leaveCreated(leave, requester);
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0]![0]).toMatchObject({
      to: 'approver@example.test',
      subject: 'New leave notification',
      context: { template: 'leave-created', leaveId: 'L1' },
    });
  });

  it('empty receiver: no email, warn line', () => {
    const { service, send, warn } = setup({ APPROVAL_MAIL_RECEIVER: '' });
    service.leaveCreated(leave, requester);
    expect(send).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      'Email not sent: APPROVAL_MAIL_RECEIVER is not set (template=leave-created, leaveId=L1)',
    );
  });

  it('never throws into the caller', () => {
    const { service, error } = setup();
    expect(() =>
      service.leaveCreated({ ...leave, startDate: 'bad' }, requester),
    ).not.toThrow();
    expect(error).toHaveBeenCalledOnce();
  });
});

describe('LeaveNotificationsService.leaveDecided (NOT-03)', () => {
  it('approve PENDING: approved email to the requester', () => {
    const { service, send } = setup();
    service.leaveDecided(
      leave,
      LeaveState.PENDING,
      LeaveState.APPROVED,
      requester,
      admin,
    );
    expect(send.mock.calls[0]![0]).toMatchObject({
      to: 'jana@example.test',
      subject: 'Your leave was approved',
      context: { template: 'leave-approved', leaveId: 'L1' },
    });
  });

  it('reject APPROVED: rejected email', () => {
    const { service, send } = setup();
    service.leaveDecided(
      leave,
      LeaveState.APPROVED,
      LeaveState.REJECTED,
      requester,
      admin,
    );
    expect(send.mock.calls[0]![0]).toMatchObject({
      subject: 'Your leave was rejected',
      context: { template: 'leave-rejected' },
    });
  });

  it('same state: nothing sent, nothing logged', () => {
    const { service, send, log, warn } = setup();
    service.leaveDecided(
      leave,
      LeaveState.APPROVED,
      LeaveState.APPROVED,
      requester,
      admin,
    );
    expect(send).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it.each([
    ['deactivated', { active: false, anonymizedAt: null }],
    ['anonymized', { active: false, anonymizedAt: new Date() }],
  ])('%s requester: nothing sent, info line', (_, state) => {
    const { service, send, log } = setup();
    service.leaveDecided(
      leave,
      LeaveState.PENDING,
      LeaveState.APPROVED,
      { ...requester, ...state },
      admin,
    );
    expect(send).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      'Email not sent: requester inactive (template=leave-approved, leaveId=L1)',
    );
  });
});

describe('startup', () => {
  it('warns once when BASE_URL is empty', () => {
    const { service, warn } = setup({ BASE_URL: '' });
    service.onApplicationBootstrap();
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      'BASE_URL is not set; email links will be relative',
    );
  });

  it('is silent when BASE_URL is set', () => {
    const { service, warn } = setup();
    service.onApplicationBootstrap();
    expect(warn).not.toHaveBeenCalled();
  });
});
