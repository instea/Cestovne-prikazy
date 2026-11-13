import {
  addDays,
  colorForUser,
  LEAVE_TYPE_LETTERS,
  leaveColor,
  toCalendarEvent,
  toCalendarEvents,
  USER_COLORS,
} from '@leaves/shared/calendar';
import type { LeaveDto, UserRefDto } from '@leaves/shared/dto';
import { LEAVE_TYPES, LeaveState, LeaveType } from '@leaves/shared/leaves';
import {
  colorIndex,
  missingUserRef,
  USER_COLOR_COUNT,
} from '@leaves/shared/users';
import { describe, expect, it } from 'vitest';

const jana: UserRefDto = {
  id: 'user-2',
  firstName: 'Jana',
  surname: 'Nová',
  active: true,
  anonymized: false,
};

const leave = (over: Partial<LeaveDto> = {}): LeaveDto => ({
  id: 'leave-1',
  requester: jana,
  approver: null,
  startDate: '2026-12-21',
  endDate: '2026-12-23',
  isHalfDay: false,
  type: LeaveType.ANNUAL,
  state: LeaveState.APPROVED,
  numDays: 3,
  createdAt: '2026-11-04T09:12:00.000Z',
  updatedAt: '2026-11-04T09:12:00.000Z',
  ...over,
});

describe('colorForUser (LST-03)', () => {
  it('matches the spec test vectors (FNV-1a 32-bit mod 15)', () => {
    const vectors: [string, number, number][] = [
      ['', 2166136261, 1],
      ['a', 3826002220, 10],
      ['user-1', 4115888500, 10],
      ['user-2', 4166221357, 7],
      ['106548781234567890123', 3697677917, 2],
    ];
    for (const [id, hash, index] of vectors) {
      expect(hash % 15).toBe(index);
      expect(colorIndex(id)).toBe(index);
      expect(colorForUser(id)).toEqual(USER_COLORS[index]);
    }
  });

  it('user-2 is rgb(210,198,190)', () => {
    expect(colorForUser('user-2')).toEqual({ r: 210, g: 198, b: 190 });
  });

  it('keeps the old 15-colour palette', () => {
    expect(USER_COLORS).toHaveLength(USER_COLOR_COUNT);
    const hex = USER_COLORS.map(
      ({ r, g, b }) =>
        `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`,
    );
    expect(hex).toEqual([
      '#86b6c9',
      '#cf9f90',
      '#adc26d',
      '#43add4',
      '#d193da',
      '#fecd8f',
      '#a7e278',
      '#d2c6be',
      '#1fc0bf',
      '#f7c3d2',
      '#ff8732',
      '#c5b7ab',
      '#a7dd98',
      '#e2f3ca',
      '#85eaf5',
    ]);
  });

  it('always lands within the palette (index 0–14)', () => {
    for (let i = 0; i < 500; i++) {
      const index = colorIndex(`id-${i}`);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThanOrEqual(14);
      expect(USER_COLORS).toContainEqual(colorForUser(`id-${i}`));
    }
  });

  it('returns a copy (the palette cannot be changed through it)', () => {
    const c = colorForUser('user-2');
    c.r = 0;
    expect(colorForUser('user-2').r).toBe(210);
  });
});

describe('leaveColor', () => {
  const c = { r: 210, g: 198, b: 190 };
  it('is opaque rgb for APPROVED', () => {
    expect(leaveColor(c, LeaveState.APPROVED)).toBe('rgb(210,198,190)');
  });
  it('has alpha 0.5 for PENDING', () => {
    expect(leaveColor(c, LeaveState.PENDING)).toBe('rgba(210,198,190,0.5)');
  });
});

describe('addDays', () => {
  it('adds calendar days across month, year and leap-day boundaries', () => {
    expect(addDays('2026-12-23', 1)).toBe('2026-12-24');
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01');
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30'); // EU DST change
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });
});

describe('toCalendarEvent', () => {
  it('maps an APPROVED range to an all-day event with exclusive end', () => {
    expect(toCalendarEvent(leave())).toEqual({
      id: 'leave-1',
      title: 'Jana Nová (A)',
      allDay: true,
      start: '2026-12-21',
      end: '2026-12-24',
      color: 'rgb(210,198,190)',
    });
  });

  it('single day: end is the next day', () => {
    const e = toCalendarEvent(
      leave({ startDate: '2026-12-21', endDate: '2026-12-21' }),
    );
    expect([e.start, e.end]).toEqual(['2026-12-21', '2026-12-22']);
  });

  it('end crosses the year boundary', () => {
    const e = toCalendarEvent(
      leave({ startDate: '2026-12-30', endDate: '2026-12-31' }),
    );
    expect(e.end).toBe('2027-01-01');
  });

  it('PENDING half-day DOCTOR: `1/2 (D)` and alpha 0.5', () => {
    const e = toCalendarEvent(
      leave({
        startDate: '2026-12-10',
        endDate: '2026-12-10',
        isHalfDay: true,
        type: LeaveType.DOCTOR,
        state: LeaveState.PENDING,
      }),
    );
    expect(e.title).toBe('Jana Nová 1/2 (D)');
    expect(e.color).toBe('rgba(210,198,190,0.5)');
  });

  it('uses the letter of every type', () => {
    const expected: Record<LeaveType, string> = {
      ANNUAL: 'A',
      SICKNESS: 'S',
      DOCTOR: 'D',
      MATERNITY: 'M',
      PARENTAL: 'P',
      CARING: 'C',
    };
    expect(LEAVE_TYPE_LETTERS).toEqual(expected);
    for (const type of LEAVE_TYPES) {
      expect(toCalendarEvent(leave({ type })).title).toBe(
        `Jana Nová (${expected[type]})`,
      );
    }
  });

  it('appends the deactivated suffix (translatable)', () => {
    const peter = {
      ...jana,
      id: 'p',
      firstName: 'Peter',
      surname: 'Starý',
      active: false,
    };
    const l = leave({ requester: peter, type: LeaveType.SICKNESS });
    expect(toCalendarEvent(l).title).toBe('Peter Starý (deactivated) (S)');
    expect(
      toCalendarEvent(l, { deactivatedSuffix: '(deaktivovaný)' }).title,
    ).toBe('Peter Starý (deaktivovaný) (S)');
  });

  it('uses the half-day marker option', () => {
    const l = leave({ endDate: '2026-12-21', isHalfDay: true });
    expect(toCalendarEvent(l, { halfDay: '½' }).title).toBe('Jana Nová ½ (A)');
  });

  it('shows `Deleted <id>` for a missing user and a null requester', () => {
    expect(
      toCalendarEvent(leave({ requester: missingUserRef('42') })).title,
    ).toBe('Deleted 42 (A)');
    const e = toCalendarEvent(leave({ requester: null }));
    expect(e.title).toBe('Deleted (A)');
    expect(e.color).toBe(leaveColor(colorForUser(''), LeaveState.APPROVED));
  });

  it('colour depends only on the requester id', () => {
    const a = toCalendarEvent(leave({ id: 'x', type: LeaveType.CARING }));
    const b = toCalendarEvent(
      leave({ id: 'y', startDate: '2020-01-01', endDate: '2020-01-01' }),
    );
    expect(a.color).toBe(b.color);
  });
});

describe('toCalendarEvents', () => {
  it('drops REJECTED leaves and keeps PENDING and APPROVED in order', () => {
    const events = toCalendarEvents([
      leave({ id: 'a', state: LeaveState.APPROVED }),
      leave({ id: 'r', state: LeaveState.REJECTED }),
      leave({ id: 'p', state: LeaveState.PENDING }),
    ]);
    expect(events.map((e) => e.id)).toEqual(['a', 'p']);
  });

  it('is empty for no leaves or only REJECTED ones', () => {
    expect(toCalendarEvents([])).toEqual([]);
    expect(toCalendarEvents([leave({ state: LeaveState.REJECTED })])).toEqual(
      [],
    );
  });
});
