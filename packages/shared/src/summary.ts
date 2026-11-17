/**
 * SUM-01 leave summary: work days of a user's APPROVED leaves per year and
 * leave type. Used by the API (`GET /api/leaves/summary`); recomputed from
 * the dates with WD-01 (not from the stored `numDays`), so a leave crossing
 * a year boundary counts only its own part in each year.
 */
import type { LeaveSummaryDto, LeaveSummaryYearDto } from './dto.js';
import { LEAVE_TYPES, LeaveState, type LeaveType } from './leaves.js';
import { type IsoDate, leaveWorkDays } from './workdays.js';

export interface SummaryLeave {
  startDate: IsoDate;
  endDate: IsoDate;
  isHalfDay: boolean;
  type: LeaveType;
  state: LeaveState;
}

const yearOf = (date: IsoDate): number => Number(date.slice(0, 4));
const pad = (year: number): string => String(year).padStart(4, '0');

/**
 * 1. Keeps APPROVED leaves only (the caller passes one user's leaves).
 * 2. None → `years: []`.
 * 3. Years from the max end year down to the min start year, including
 *    years without a leave (`byType: []`).
 * 4. Each leave overlapping year Y is clipped to `[Y-01-01, Y-12-31]`.
 * 5. `workDays` = sum of `leaveWorkDays(clipped)` per type (half-day kept).
 * 6. `byType` lists types with at least one leave in the year (also when
 *    they sum to 0), in `LEAVE_TYPES` order.
 */
export function buildLeaveSummary(
  leaves: readonly SummaryLeave[],
): LeaveSummaryDto {
  const approved = leaves.filter((l) => l.state === LeaveState.APPROVED);
  if (approved.length === 0) return { years: [] };

  const minYear = Math.min(...approved.map((l) => yearOf(l.startDate)));
  const maxYear = Math.max(...approved.map((l) => yearOf(l.endDate)));
  const years: LeaveSummaryYearDto[] = [];
  for (let year = maxYear; year >= minYear; year--) {
    const totals = new Map<LeaveType, number>();
    for (const leave of approved) {
      const startYear = yearOf(leave.startDate);
      const endYear = yearOf(leave.endDate);
      if (year < startYear || year > endYear) continue;
      const days = leaveWorkDays({
        startDate: startYear < year ? `${pad(year)}-01-01` : leave.startDate,
        endDate: endYear > year ? `${pad(year)}-12-31` : leave.endDate,
        isHalfDay: leave.isHalfDay,
      });
      totals.set(leave.type, (totals.get(leave.type) ?? 0) + days);
    }
    years.push({
      year,
      byType: LEAVE_TYPES.filter((type) => totals.has(type)).map((type) => ({
        type,
        workDays: totals.get(type)!,
      })),
    });
  }
  return { years };
}
