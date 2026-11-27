import { Inject, Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ErrorCode } from '@leaves/shared/enums';
import type { Connection, Model } from 'mongoose';
import { AuditLog } from '../audit/audit-log.schema';
import { AuditService } from '../audit/audit.service';
import { AppException } from '../common/app-exception';
import { CLOCK, type Clock } from '../common/clock';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/env.schema';
import { withTransaction } from '../database/transaction';
import { Leave } from '../leaves/leave.schema';
import { toUserDto } from './user.mapper';
import { User } from './user.schema';
import {
  compareExportLeaves,
  EXPORT_FORMAT_VERSION,
  exportedEntriesFilter,
  exportFileName,
  selectExportEntries,
  toExportLeave,
  type UserExportFile,
} from './user-export';

export interface UserExport {
  fileName: string;
  file: UserExportFile;
}

/**
 * NFR-07 GDPR access request: everything the app stores about one user
 * (user record, own leaves, leaves they decided, audit entries about them
 * or by them), any user incl. deactivated / anonymized ones. Refresh tokens
 * are never read.
 */
@Injectable()
export class UserExportService {
  constructor(
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(Leave.name) private readonly leaves: Model<Leave>,
    @InjectModel(AuditLog.name) private readonly entries: Model<AuditLog>,
    @InjectConnection() private readonly connection: Connection,
    private readonly audit: AuditService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /**
   * Builds the file, then writes `USER_DATA_EXPORTED` (actor = admin,
   * target = user; not part of the file). A failed audit write rejects, so
   * no file is returned (500 `INTERNAL_ERROR`).
   */
  async export(callerId: string, userId: string): Promise<UserExport> {
    const user = await this.users.findOne({ id: userId }).lean();
    if (!user) {
      throw new AppException(404, ErrorCode.USER_NOT_FOUND, 'User not found');
    }

    const [asRequester, asApprover] = await Promise.all([
      this.leaves.find({ requesterId: userId }).lean(),
      this.leaves
        .find({ approverId: userId, requesterId: { $ne: userId } })
        .lean(),
    ]);
    const ownLeaveIds = new Set(asRequester.map((l) => l.id));
    const entries = await this.entries
      .find(exportedEntriesFilter(userId, ownLeaveIds))
      .lean();

    const now = this.clock.now();
    const file: UserExportFile = {
      formatVersion: EXPORT_FORMAT_VERSION,
      exportedAt: now.toISOString(),
      exportedBy: callerId,
      user: toUserDto(user),
      leavesAsRequester: asRequester
        .map(toExportLeave)
        .sort(compareExportLeaves),
      leavesAsApprover: asApprover.map(toExportLeave).sort(compareExportLeaves),
      auditEntries: selectExportEntries(entries, userId, ownLeaveIds),
    };

    await withTransaction(this.connection, (session) =>
      this.audit.record(session, {
        action: 'USER_DATA_EXPORTED',
        actorType: 'user',
        actorId: callerId,
        targetType: 'USER',
        targetId: userId,
        details: null,
      }),
    );

    return {
      fileName: exportFileName(userId, now, this.config.DEFAULT_TIMEZONE),
      file,
    };
  }
}
