import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import type { LeaveDto, LeaveSummaryDto } from '@leaves/shared/dto';
import { ErrorCode } from '@leaves/shared/enums';
import { LeaveState } from '@leaves/shared/leaves';
import { buildLeaveSummary } from '@leaves/shared/summary';
import { leaveWorkDays } from '@leaves/shared/workdays';
import type { Connection, Model } from 'mongoose';
import {
  leaveCreatedDetails,
  leaveDecisionDetails,
  leaveDeletedDetails,
} from '../audit/audit-details';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../auth/auth-user';
import { AppException } from '../common/app-exception';
import { withTransaction } from '../database/transaction';
import type { LeaveDecision } from '../notifications/leave-mail.templates';
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

const leaveNotFound = () =>
  new AppException(404, ErrorCode.LEAVE_NOT_FOUND, 'Leave not found');

/**
 * LV-03: the owner deletes their own leave in any state; an admin deletes
 * any leave. Pure rule (404 is decided before, NFR-01).
 */
export function mayDeleteLeave(
  caller: Pick<AuthUser, 'id' | 'isAdmin'>,
  leave: Pick<LeaveLike, 'requesterId'>,
): boolean {
  return caller.isAdmin || leave.requesterId === caller.id;
}

/**
 * APR-01: the leave after an approve / reject. Every previous state may go
 * to either decision, the same state included (idempotent); `approverId`
 * is always overwritten with the caller. Nothing else changes.
 */
export function applyDecision<T extends LeaveLike>(
  previous: T,
  decision: LeaveDecision,
  approverId: string,
  updatedAt: Date,
): T {
  return { ...previous, state: decision, approverId, updatedAt };
}

/** LV-01 create, LV-03 delete, APR-01 decide, LST-01 list, SUM-01 summary. */
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
   * LV-03: hard delete. Not found (also after an earlier delete) → 404
   * before the ownership check → 403 (NFR-01). The delete and its
   * `LEAVE_DELETED` entry (snapshot of the deleted leave) commit together.
   * No email.
   */
  async remove(caller: AuthUser, id: string): Promise<void> {
    await withTransaction(this.connection, async (session) => {
      const leave = await this.leaves
        .findOne({ id })
        .session(session)
        .lean<LeaveLike>();
      if (!leave) throw leaveNotFound();
      if (!mayDeleteLeave(caller, leave)) {
        throw new AppException(
          403,
          ErrorCode.FORBIDDEN,
          'You can delete only your own leaves',
        );
      }
      const { deletedCount } = await this.leaves.deleteOne({ id }, { session });
      // Unreachable inside the transaction (a concurrent delete is a write
      // conflict, retried), kept so a delete is never audited twice.
      if (deletedCount !== 1) throw leaveNotFound();
      await this.audit.record(session, {
        actorType: 'user',
        actorId: caller.id,
        action: 'LEAVE_DELETED',
        targetType: 'LEAVE',
        targetId: leave.id,
        details: leaveDeletedDetails(leave),
      });
    });
  }

  /**
   * APR-01 approve / reject (the caller is an admin: `@Roles('admin')`).
   * One atomic update returning the previous document (unknown id → 404),
   * its `LEAVE_APPROVED` / `LEAVE_REJECTED` entry (also for same-state
   * calls) and the user reads run in one transaction. The requester email
   * (NOT-03; sent only on a real state change) goes out after the commit
   * and never fails the request. Concurrent calls: last write wins.
   */
  async decide(
    caller: AuthUser,
    id: string,
    decision: LeaveDecision,
  ): Promise<LeaveDto> {
    // Set explicitly (wall clock, like Mongoose timestamps) so the response
    // carries the stored `updatedAt` although the update returns the
    // previous document.
    const updatedAt = new Date();
    const { previous, users } = await withTransaction(
      this.connection,
      async (session) => {
        const before = await this.leaves
          .findOneAndUpdate(
            { id },
            { $set: { state: decision, approverId: caller.id, updatedAt } },
            { returnDocument: 'before', session, timestamps: false },
          )
          .lean<LeaveLike>();
        if (!before) throw leaveNotFound();
        await this.audit.record(session, {
          actorType: 'user',
          actorId: caller.id,
          action:
            decision === LeaveState.APPROVED
              ? 'LEAVE_APPROVED'
              : 'LEAVE_REJECTED',
          targetType: 'LEAVE',
          targetId: before.id,
          details: leaveDecisionDetails(before, decision),
        });
        // Read inside the transaction: nothing can fail after the commit.
        const found = await this.users
          .find({ id: { $in: [before.requesterId, caller.id] } })
          .select({ ...USER_REF_FIELDS, email: 1 })
          .session(session)
          .lean<(UserRefSource & { email: string })[]>();
        return { previous: before, users: found };
      },
    );

    const leave = applyDecision(previous, decision, caller.id, updatedAt);
    const byId = new Map(users.map((u) => [u.id, u]));
    const result = toLeaveDto(leave, byId);
    const requester = byId.get(leave.requesterId);
    const admin = byId.get(caller.id);
    if (requester) {
      this.notifications.leaveDecided(
        leave,
        previous.state,
        decision,
        requester,
        { firstName: admin?.firstName ?? '', surname: admin?.surname ?? '' },
      );
    }
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
