import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import type { LeaveDto, LeaveSummaryDto } from '@leaves/shared/dto';
import { LeaveState } from '@leaves/shared/leaves';
import { buildLeaveSummary } from '@leaves/shared/summary';
import { leaveWorkDays } from '@leaves/shared/workdays';
import type { Connection, Model } from 'mongoose';
import { leaveCreatedDetails } from '../audit/audit-details';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../auth/auth-user';
import { withTransaction } from '../database/transaction';
import { LeaveNotificationsService } from '../notifications/leave-notifications.service';
import { User } from '../users/user.schema';
import { assertLeaveDateRules, type CreateLeaveDto } from './create-leave.dto';
import { compareLeavesForList } from './leave-order';
import {
  type LeaveLike,
  loadLeaveDtos,
  toLeaveDto,
  type UserRefSource,
} from './leave.mapper';
import { Leave } from './leave.schema';
import type { ListLeavesQuery } from './list-leaves.query';

const USER_REF_FIELDS = {
  id: 1,
  firstName: 1,
  surname: 1,
  active: 1,
  anonymizedAt: 1,
} as const;

/** LV-01 create, LST-01 list and SUM-01 summary. */
@Injectable()
export class LeavesService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Leave.name) private readonly leaves: Model<Leave>,
    @InjectModel(User.name) private readonly users: Model<User>,
    private readonly audit: AuditService,
    private readonly notifications: LeaveNotificationsService,
  ) {}

  /**
   * LV-01: a PENDING leave of the caller with the server-computed
   * `numDays`. The insert, its `LEAVE_CREATED` entry and the requester
   * read run in one transaction (nothing fallible after the commit); the
   * new-leave email (NOT-02) is sent only after the commit and never
   * fails the request.
   */
  async create(caller: AuthUser, dto: CreateLeaveDto): Promise<LeaveDto> {
    const input = assertLeaveDateRules(dto);
    const numDays = leaveWorkDays(input);

    const { leave, requester } = await withTransaction(
      this.connection,
      async (session) => {
        const [doc] = await this.leaves.create(
          [
            {
              ...input,
              numDays,
              requesterId: caller.id,
              approverId: null,
              state: LeaveState.PENDING,
            },
          ],
          { session },
        );
        const created = doc!.toObject<LeaveLike>();
        await this.audit.record(session, {
          actorType: 'user',
          actorId: caller.id,
          action: 'LEAVE_CREATED',
          targetType: 'LEAVE',
          targetId: created.id,
          details: leaveCreatedDetails(created),
        });
        // Read inside the transaction: once it commits, nothing can fail
        // the request any more, so a committed leave always answers 201 and
        // a client retry cannot duplicate it. The guard loaded the caller,
        // so the user exists (a concurrent deletion would only give the
        // `Deleted <id>` placeholder).
        const user = await this.users
          .findOne({ id: caller.id })
          .select(USER_REF_FIELDS)
          .session(session)
          .lean<UserRefSource>();
        return { leave: created, requester: user };
      },
    );

    const result = toLeaveDto(
      leave,
      new Map(requester ? [[requester.id, requester]] : []),
    );
    this.notifications.leaveCreated(leave, {
      firstName: requester?.firstName ?? '',
      surname: requester?.surname ?? '',
    });
    return result;
  }

  /**
   * LST-01: every leave of every user (company-wide visibility), optionally
   * one state; users resolved with one batched query.
   */
  async list(query: ListLeavesQuery): Promise<LeaveDto[]> {
    const filter = query.state ? { state: query.state } : {};
    const docs = await this.leaves.find(filter).lean<LeaveLike[]>();
    docs.sort(compareLeavesForList);
    return loadLeaveDtos(docs, this.users);
  }

  /** SUM-01: the caller's own APPROVED leaves per year and type. */
  async summary(caller: AuthUser): Promise<LeaveSummaryDto> {
    const docs = await this.leaves
      .find({ requesterId: caller.id, state: LeaveState.APPROVED })
      .select({ startDate: 1, endDate: 1, isHalfDay: 1, type: 1, state: 1 })
      .lean();
    return buildLeaveSummary(docs);
  }
}
