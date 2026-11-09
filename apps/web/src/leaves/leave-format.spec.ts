import { describe, expect, it } from 'vitest';
import { formatDaysCell, formatUserRefLabel } from './leave-format';

const leave = (
  numDays: number,
  startDate = '2026-11-04',
  endDate = startDate,
) => ({
  startDate,
  endDate,
  numDays,
});

describe('formatDaysCell (LST-01)', () => {
  it('formats EN dates like the old list and the work-day count', () => {
    expect(formatDaysCell(leave(3, '2026-12-21', '2026-12-23'), 'en')).toBe(
      'Dec 21, 2026 - Dec 23, 2026 (3 work days)',
    );
  });

  it('shows 0 (never ?), 0.5 and the singular for 1 in EN', () => {
    expect(formatDaysCell(leave(0), 'en')).toBe(
      'Nov 4, 2026 - Nov 4, 2026 (0 work days)',
    );
    expect(formatDaysCell(leave(0.5), 'en')).toBe(
      'Nov 4, 2026 - Nov 4, 2026 (0.5 work days)',
    );
    expect(formatDaysCell(leave(1), 'en')).toBe(
      'Nov 4, 2026 - Nov 4, 2026 (1 work day)',
    );
  });

  it('formats SK dates, decimal comma and plurals', () => {
    expect(formatDaysCell(leave(0.5), 'sk')).toBe(
      '4. 11. 2026 - 4. 11. 2026 (0,5 pracovného dňa)',
    );
    expect(formatDaysCell(leave(1), 'sk')).toBe(
      '4. 11. 2026 - 4. 11. 2026 (1 pracovný deň)',
    );
    expect(formatDaysCell(leave(3, '2026-12-21', '2026-12-23'), 'sk')).toBe(
      '21. 12. 2026 - 23. 12. 2026 (3 pracovné dni)',
    );
  });
});

describe('formatUserRefLabel (LST-01)', () => {
  const jana = {
    id: 'g-1',
    firstName: 'Jana',
    surname: 'Nová',
    active: true,
    anonymized: false,
  };

  it('formats active, deactivated and missing users per language', () => {
    expect(formatUserRefLabel(jana, 'en')).toBe('Jana Nová');
    expect(formatUserRefLabel({ ...jana, active: false }, 'en')).toBe(
      'Jana Nová (deactivated)',
    );
    expect(formatUserRefLabel({ ...jana, active: false }, 'sk')).toBe(
      'Jana Nová (deaktivovaný)',
    );
    const ghost = {
      id: 'ghost',
      firstName: 'Deleted',
      surname: 'ghost',
      active: false,
      anonymized: false,
    };
    expect(formatUserRefLabel(ghost, 'en')).toBe('Deleted ghost');
    expect(formatUserRefLabel(ghost, 'sk')).toBe('Zmazaný ghost');
  });
});
