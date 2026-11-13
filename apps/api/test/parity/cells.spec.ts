import { describe, expect, it } from 'vitest';
import {
  type CellLeave,
  jsKeyOrder,
  leaveCode,
  oldWalk,
  type SideData,
  simulateCells,
} from './cells.mts';
import { eachDate, type SsoRecord } from './context.mts';

const weekday = (d: string) => {
  const w = new Date(`${d}T12:00:00Z`).getUTCDay();
  return w !== 0 && w !== 6;
};

const leave = (
  requesterId: string,
  start: string,
  end: string,
  over: Partial<CellLeave> = {},
): CellLeave => ({
  requesterId,
  span: [start, end],
  dates: eachDate(start, end),
  type: 'ANNUAL',
  isHalfDay: false,
  state: 'APPROVED',
  ...over,
});

const sso = (
  name: string,
  email: string,
  togglUserId: string | undefined,
  employee = '1',
): SsoRecord => ({ name, email, togglUserId, employee });

const side = (
  leaves: CellLeave[],
  monthOnly: boolean,
  users = [{ id: 'u1', email: 'anna@x' }],
): SideData => ({ users, leaves, isWorkingDay: weekday, monthOnly });

const ANNA = [sso('Anna', 'anna@x', '20')];

describe('attendance leave cells (MIG-03 oracle)', () => {
  it('maps types to codes like the old leaveTypeMap', () => {
    expect(leaveCode('ANNUAL', false)).toBe('D8');
    expect(leaveCode('ANNUAL', true)).toBe('D4');
    expect(leaveCode('SICKNESS', false)).toBe('PN');
    expect(leaveCode('DOCTOR', true)).toBe('L');
    expect(leaveCode('MATERNITY', false)).toBe('I');
    expect(leaveCode(undefined, false)).toBe('I');
  });

  it('old checks the month number only; new checks year and month', () => {
    const long = [leave('u1', '2024-03-04', '2025-03-04')];
    const old = simulateCells(ANNA, side(long, true), 2025, 3)!.get('Anna')!;
    const now = simulateCells(ANNA, side(long, false), 2025, 3)!.get('Anna')!;
    // 2025-03-04 (Tue) and, old only, 2024-03-04 (Mon) on the same index.
    expect(old[3]).toBe('D8, D8');
    expect(now[3]).toBe('D8');
    // 2025-03-05 is after the leave; old writes 2024-03-05 (Tue) there.
    expect(old[4]).toBe('D8');
    expect(now[4]).toBe('');
    // Weekends stay empty (2025-03-01 is a Saturday).
    expect(old[0]).toBe('');
  });

  it('joins several leaves of a day in leave order, APPROVED only', () => {
    const leaves = [
      leave('u1', '2024-03-05', '2024-03-05', { isHalfDay: true }),
      leave('u1', '2024-03-05', '2024-03-05', { type: 'DOCTOR' }),
      leave('u1', '2024-03-05', '2024-03-05', { state: 'PENDING' }),
    ];
    const days = simulateCells(ANNA, side(leaves, true), 2024, 3)!.get('Anna')!;
    expect(days[4]).toBe('D4, L');
  });

  it('writes leaves of employees only, matched by exact email', () => {
    const leaves = [leave('u1', '2024-03-05', '2024-03-05')];
    const notEmployee = [sso('Anna', 'anna@x', '20', '0')];
    const otherCase = [sso('Anna', 'Anna@x', '20')];
    for (const dir of [notEmployee, otherCase])
      expect(
        simulateCells(dir, side(leaves, true), 2024, 3)!.get('Anna')![4],
      ).toBe('');
  });

  it('gives a name collision to the later key in JS key order', () => {
    expect(jsKeyOrder(['9', '5', 'abc', '10'])).toEqual([
      '5',
      '9',
      '10',
      'abc',
    ]);
    const dir = [sso('Eva', 'eva2@x', '9'), sso('Eva', 'eva1@x', '5')];
    const users = [
      { id: 'u1', email: 'eva1@x' },
      { id: 'u2', email: 'eva2@x' },
    ];
    const leaves = [
      leave('u2', '2024-03-05', '2024-03-05', { type: 'DOCTOR' }),
    ];
    const cells = simulateCells(dir, side(leaves, true, users), 2024, 3)!;
    // Key 9 (eva2, with the leave) comes after 5, so it wins "Eva".
    expect(cells.get('Eva')![4]).toBe('L');
  });

  it('cannot predict a month the old app fails on (Feb 29 into a 28-day month)', () => {
    const long = [leave('u1', '2024-02-29', '2025-02-03')];
    expect(simulateCells(ANNA, side(long, true), 2025, 2)).toBeNull();
    expect(simulateCells(ANNA, side(long, false), 2025, 2)).not.toBeNull();
  });

  it('walks old instants like the old loop (end date only if its time is not earlier)', () => {
    const tz = 'Europe/Bratislava';
    expect(
      oldWalk('2024-03-03T23:00:00.000Z', '2024-03-05T23:00:00.000Z', tz),
    ).toEqual(['2024-03-04', '2024-03-05', '2024-03-06']);
    // Start 10:00, end 09:00 local: the end date is not reached.
    expect(
      oldWalk('2024-03-04T09:00:00.000Z', '2024-03-06T08:00:00.000Z', tz),
    ).toEqual(['2024-03-04', '2024-03-05']);
    expect(oldWalk('x', '2024-03-06T08:00:00.000Z', tz)).toEqual([]);
  });
});
