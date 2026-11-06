import { Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { LeaveState } from '@leaves/shared/leaves';
import type { Model } from 'mongoose';
import { CLOCK, type Clock } from '../common/clock';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/env.schema';
import { Leave } from '../leaves/leave.schema';
import { User } from '../users/user.schema';
import {
  type AttendanceLeave,
  type AttendancePeriod,
  type AttendanceResponse,
  applyLeaves,
  entryKey,
  initDraft,
  keyByName,
  type MonthRange,
  monthRange,
} from './attendance.assembly';
import { isEmployee, SsoClient, type SsoUser } from './sso/sso.client';
import { addEntry, TogglClient } from './toggl/toggl.client';

/**
 * ATT-04: builds the attendance object for one month from the SSO directory
 * (ATT-02), Toggl (ATT-03) and APPROVED leaves. Throws
 * `SsoUnavailableError` / `TogglUnavailableError` (no partial data); any
 * other error is unexpected. Read-only: no DB writes, no audit.
 * Called by `AttendanceController` (ATT-01).
 */
@Injectable()
export class AttendanceService {
  constructor(
    private readonly sso: SsoClient,
    private readonly toggl: TogglClient,
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(Leave.name) private readonly leaves: Model<Leave>,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async build(period: AttendancePeriod): Promise<AttendanceResponse> {
    const range = monthRange(period.year, period.month);
    const directory = await this.sso.fetchDirectory();
    const draft = initDraft(directory, range.daysInMonth);
    const now = () => this.clock.now();

    // Sequential, in SSO order (old order: Toggl, then leaves, per user).
    for (const user of directory) {
      if (!isEmployee(user)) continue;
      // Hang fix: an employee without togglUserId has no entry; skip it.
      if (!user.togglUserId) continue;
      const { togglWorkspaceId, togglUserId, togglApiToken } = user;
      for await (const entry of this.toggl.timeEntries(
        { togglWorkspaceId, togglUserId, togglApiToken },
        range.startString,
        range.endString,
      )) {
        addEntry(draft.entries, entry, this.config.DEFAULT_TIMEZONE, now);
      }
      if (!period.leaveCodes) continue;
      const leaves = await this.approvedLeaves(user, range);
      const entry = draft.entries[entryKey(user.togglUserId)];
      if (entry) applyLeaves(entry, leaves, range);
    }

    return {
      start: range.startString,
      end: range.endString,
      attendence: keyByName(draft),
    };
  }

  /**
   * APPROVED leaves of the app user whose email equals the SSO email
   * exactly (case-sensitive, like old; active or deactivated), overlapping
   * the range, in `_id` order.
   */
  private async approvedLeaves(
    user: SsoUser,
    range: MonthRange,
  ): Promise<AttendanceLeave[]> {
    if (typeof user.email !== 'string' || user.email === '') return [];
    // The schema lowercases/trims `email` in query filters too, so the exact
    // comparison is repeated on the result.
    const found = await this.users
      .findOne({ email: user.email }, { id: 1, email: 1 })
      .lean();
    if (!found || found.email !== user.email) return [];
    return this.leaves
      .find(
        {
          requesterId: found.id,
          state: LeaveState.APPROVED,
          startDate: { $lte: range.endString },
          endDate: { $gte: range.startString },
        },
        { startDate: 1, endDate: 1, type: 1, isHalfDay: 1 },
      )
      .sort({ _id: 1 })
      .lean();
  }
}
