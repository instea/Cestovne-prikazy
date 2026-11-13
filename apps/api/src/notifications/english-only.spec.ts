import { LEAVE_TYPE_LABELS_EN, LeaveType } from '@leaves/shared/leaves';
import { describe, expect, expectTypeOf, it } from 'vitest';
import type { MailMessage, MailService } from '../mail/mail.service';
import {
  formatMailDate,
  renderLeaveCreated,
  renderLeaveDecided,
} from './leave-mail.templates';

/**
 * NFR-14: notification emails are English only. No locale or UI language
 * reaches the templates or the mail service, so the language the sender or
 * recipient uses in the SPA (client-only `lang`) cannot change an email.
 */
describe('NFR-14 English-only emails', () => {
  it('mail service and templates take no locale parameter', () => {
    expectTypeOf<keyof MailMessage>().toEqualTypeOf<
      'to' | 'subject' | 'html' | 'context'
    >();
    expectTypeOf<MailService['send']>().parameters.toEqualTypeOf<
      [MailMessage]
    >();
    expect(renderLeaveCreated.length).toBe(3); // leave, requester, baseUrl
    expect(renderLeaveDecided.length).toBe(4); // decision, leave, admin, baseUrl
    expect(formatMailDate.length).toBe(1);
  });

  it('dates use English month and weekday names', () => {
    expect(formatMailDate('2026-11-04')).toBe('Wednesday, Nov 4, 2026');
  });

  it('every leave type renders its English label', () => {
    for (const type of Object.values(LeaveType)) {
      const { html } = renderLeaveCreated(
        { startDate: '2026-11-04', endDate: '2026-11-04', type },
        { firstName: 'Jana', surname: 'Nová' },
        'https://cestaky.example.test',
      );
      expect(html).toContain(`<b>Type: </b>${LEAVE_TYPE_LABELS_EN[type]}<br>`);
    }
  });
});
