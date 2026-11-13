import { LEAVE_TYPES, LeaveState, LeaveType } from '@leaves/shared/leaves';
import { describe, expect, it } from 'vitest';
import {
  appUrl,
  formatMailDate,
  renderLeaveCreated,
  renderLeaveDecided,
  shouldNotify,
} from './leave-mail.templates';

const BASE = 'https://cestaky.example.test';
const leave = {
  startDate: '2026-12-21',
  endDate: '2026-12-23',
  type: LeaveType.ANNUAL,
};
const jana = { firstName: 'Jana', surname: 'Nová' };
const peter = { firstName: 'Peter', surname: 'Admin' };

const LABELS: Record<LeaveType, string> = {
  ANNUAL: 'Annual leave',
  SICKNESS: 'Sick leave',
  DOCTOR: 'Doctor visit',
  MATERNITY: 'Maternity leave',
  PARENTAL: 'Parental leave',
  CARING: 'Caring for a relative at home',
};

describe('formatMailDate', () => {
  it.each([
    ['2026-12-21', 'Monday, Dec 21, 2026'],
    ['2026-12-23', 'Wednesday, Dec 23, 2026'],
    ['2024-02-29', 'Thursday, Feb 29, 2024'],
    ['2026-03-29', 'Sunday, Mar 29, 2026'],
    ['2026-10-25', 'Sunday, Oct 25, 2026'],
  ])('%s → %s', (date, expected) => {
    expect(formatMailDate(date)).toBe(expected);
  });

  it('rejects a malformed date', () => {
    expect(() => formatMailDate('21.12.2026')).toThrow(RangeError);
  });
});

describe('appUrl', () => {
  it.each([
    [BASE, '/approval', `${BASE}/approval`],
    [`${BASE}/`, '/approval', `${BASE}/approval`],
    [`${BASE}//`, '/leaves', `${BASE}/leaves`],
    ['', '/approval', '/approval'],
  ] as const)('%j + %s', (base, path, expected) => {
    expect(appUrl(base, path)).toBe(expected);
  });
});

describe('renderLeaveCreated (NOT-02)', () => {
  it('renders the exact HTML', () => {
    expect(renderLeaveCreated(leave, jana, BASE)).toEqual({
      subject: 'New leave notification',
      html:
        '<h4>New leave was created and needs to be approved.</h4>\n' +
        '<b>Requester: </b> Jana Nová<br>\n' +
        '<b>Days: </b>Monday, Dec 21, 2026 - Wednesday, Dec 23, 2026<br>\n' +
        '<b>Type: </b>Annual leave<br>\n' +
        '<a href="https://cestaky.example.test/approval">Approve</a>',
    });
  });

  it.each(LEAVE_TYPES)('prints the EN label of %s', (type) => {
    expect(renderLeaveCreated({ ...leave, type }, jana, BASE).html).toContain(
      `<b>Type: </b>${LABELS[type]}<br>`,
    );
  });

  it('renders a half-day leave like a full day', () => {
    const day = { ...leave, endDate: leave.startDate };
    expect(
      renderLeaveCreated({ ...day, isHalfDay: true } as typeof day, jana, BASE),
    ).toEqual(renderLeaveCreated(day, jana, BASE));
  });

  it('escapes names', () => {
    const { html } = renderLeaveCreated(
      leave,
      { firstName: 'Jana', surname: "O'Neil <x>" },
      BASE,
    );
    expect(html).toContain('<b>Requester: </b> Jana O&#39;Neil &lt;x&gt;<br>');
    expect(html).not.toContain('<x>');
  });

  it('joins the link without a double slash', () => {
    expect(renderLeaveCreated(leave, jana, `${BASE}/`).html).toContain(
      `<a href="${BASE}/approval">`,
    );
  });

  it('uses a relative link for an empty BASE_URL', () => {
    expect(renderLeaveCreated(leave, jana, '').html).toContain(
      '<a href="/approval">Approve</a>',
    );
  });
});

describe('renderLeaveDecided (NOT-03)', () => {
  it('renders the exact approved HTML', () => {
    expect(renderLeaveDecided(LeaveState.APPROVED, leave, peter, BASE)).toEqual(
      {
        subject: 'Your leave was approved',
        html:
          '<h4>Your leave was approved.</h4>\n' +
          '<b>Days: </b>Monday, Dec 21, 2026 - Wednesday, Dec 23, 2026<br>\n' +
          '<b>Type: </b>Annual leave<br>\n' +
          '<b>Approved by: </b>Peter Admin<br>\n' +
          '<a href="https://cestaky.example.test/leaves">Open leaves</a>',
      },
    );
  });

  it('renders the exact rejected HTML', () => {
    expect(
      renderLeaveDecided(
        LeaveState.REJECTED,
        { ...leave, type: LeaveType.DOCTOR },
        peter,
        `${BASE}/`,
      ),
    ).toEqual({
      subject: 'Your leave was rejected',
      html:
        '<h4>Your leave was rejected.</h4>\n' +
        '<b>Days: </b>Monday, Dec 21, 2026 - Wednesday, Dec 23, 2026<br>\n' +
        '<b>Type: </b>Doctor visit<br>\n' +
        '<b>Rejected by: </b>Peter Admin<br>\n' +
        '<a href="https://cestaky.example.test/leaves">Open leaves</a>',
    });
  });

  it('escapes the admin name and uses a relative link for empty BASE_URL', () => {
    const { html } = renderLeaveDecided(
      LeaveState.APPROVED,
      leave,
      { firstName: '<b>P</b>', surname: 'A&B' },
      '',
    );
    expect(html).toContain(
      '<b>Approved by: </b>&lt;b&gt;P&lt;/b&gt; A&amp;B<br>',
    );
    expect(html).toContain('<a href="/leaves">Open leaves</a>');
  });
});

describe('shouldNotify (NOT-03)', () => {
  const requesters = {
    active: { active: true, anonymizedAt: null },
    deactivated: { active: false, anonymizedAt: null },
    anonymized: { active: false, anonymizedAt: new Date('2026-11-01') },
    // Defensive: anonymizedAt set although still active.
    anonymizedActive: { active: true, anonymizedAt: new Date('2026-11-01') },
  };
  const { PENDING, APPROVED, REJECTED } = LeaveState;
  const pairs: [LeaveState, LeaveState, boolean][] = [
    [PENDING, PENDING, false],
    [PENDING, APPROVED, true],
    [PENDING, REJECTED, true],
    [APPROVED, PENDING, false],
    [APPROVED, APPROVED, false],
    [APPROVED, REJECTED, true],
    [REJECTED, PENDING, false],
    [REJECTED, APPROVED, true],
    [REJECTED, REJECTED, false],
  ];

  it.each(pairs)('%s → %s, active requester: %s', (prev, next, expected) => {
    expect(shouldNotify(prev, next, requesters.active)).toBe(expected);
  });

  it.each(
    pairs.flatMap(([prev, next]) =>
      (['deactivated', 'anonymized', 'anonymizedActive'] as const).map(
        (who) => [prev, next, who] as const,
      ),
    ),
  )('%s → %s, %s requester: false', (prev, next, who) => {
    expect(shouldNotify(prev, next, requesters[who])).toBe(false);
  });
});
