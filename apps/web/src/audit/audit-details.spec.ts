import type { AuditEntryDto } from '@leaves/shared/audit';
import { describe, expect, it } from 'vitest';
import { i18n } from '../i18n';
import { auditDetailLines } from './audit-details';

const lines = (
  action: AuditEntryDto['action'],
  details: AuditEntryDto['details'],
  lang: 'en' | 'sk' = 'en',
) => auditDetailLines({ action, details }, i18n.getFixedT(lang), lang);

const snapshot = {
  id: 'L1',
  requesterId: 'u1',
  approverId: null,
  startDate: '2026-11-04',
  endDate: '2026-11-06',
  isHalfDay: false,
  type: 'ANNUAL',
  state: 'PENDING',
  numDays: 3,
};

describe('audit details formatter (NFR-06)', () => {
  it('shows the state change of approve / reject, translated', () => {
    const details = {
      previousState: 'PENDING',
      newState: 'APPROVED',
      previousApproverId: null,
    };
    expect(lines('LEAVE_APPROVED', details)).toEqual(['Pending → Approved']);
    expect(lines('LEAVE_REJECTED', details, 'sk')).toEqual([
      'Čaká na schválenie → Schválená',
    ]);
  });

  it('shows leave snapshots for create and delete', () => {
    expect(lines('LEAVE_CREATED', { after: snapshot })).toEqual([
      'Nov 4, 2026 – Nov 6, 2026, Annual leave, Pending',
    ]);
    expect(lines('LEAVE_DELETED', { before: snapshot }, 'sk')).toEqual([
      '4. 11. 2026 – 6. 11. 2026, Dovolenka, Čaká na schválenie',
    ]);
  });

  it('shows one line per changed key', () => {
    expect(
      lines('USER_UPDATED', {
        before: { firstName: 'Jana', surname: 'Nová' },
        after: { firstName: 'Janka', surname: 'Nová' },
      }),
    ).toEqual(['firstName: Jana → Janka']);
    expect(
      lines('USER_ROLE_CHANGED', {
        before: { isAdmin: false },
        after: { isAdmin: true },
      }),
    ).toEqual(['isAdmin: No → Yes']);
  });

  it('formats timestamps and nulls', () => {
    expect(
      lines('USER_DEACTIVATED', {
        before: { active: true, deactivatedAt: null },
        after: { active: false, deactivatedAt: '2026-11-04T09:15:00.000Z' },
      }),
    ).toEqual(['active: Yes → No', 'deactivatedAt: – → Nov 4, 2026 10:15']);
  });

  it('lists registration values without a before', () => {
    expect(
      lines('USER_REGISTERED', {
        after: { email: 'a@instea.co', firstName: 'A', isAdmin: false },
      }),
    ).toEqual(['email: a@instea.co', 'firstName: A', 'isAdmin: No']);
  });

  it('shows a dash for data export and missing details', () => {
    expect(lines('USER_DATA_EXPORTED', null)).toEqual(['–']);
    expect(lines('USER_UPDATED', null)).toEqual(['–']);
  });
});
