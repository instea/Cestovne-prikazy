import { Inject, Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import type { UserDto } from '@leaves/shared/dto';
import { ErrorCode } from '@leaves/shared/enums';
import type { Connection, Model } from 'mongoose';
import {
  userChangeDrafts,
  userDeactivatedDetails,
} from '../audit/audit-details';
import { AuditService } from '../audit/audit.service';
import { RevokedReason } from '../auth/refresh-token.schema';
import { SessionService } from '../auth/session.service';
import { AppException } from '../common/app-exception';
import { CLOCK, type Clock } from '../common/clock';
import { withTransaction } from '../database/transaction';
import { toUserDto } from './user.mapper';
import { User } from './user.schema';

/** USR-01 sort: case-insensitive Slovak collation (strength 2 ignores case only). */
const LIST_COLLATION = { locale: 'sk', strength: 2 } as const;

export interface NameChanges {
  firstName?: string;
  surname?: string;
}

/** USR-02 admin edit: names plus the admin flag. */
export interface AdminUserChanges extends NameChanges {
  isAdmin?: boolean;
}

/**
 * User administration (USR-01 list, USR-02 edit, USR-04 deactivate) and own
 * profile (USR-03).
 */
@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectConnection() private readonly connection: Connection,
    private readonly audit: AuditService,
    private readonly sessions: SessionService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * USR-01: every user, including deactivated and anonymized ones, sorted by
   * surname, then first name, then email.
   */
  async list(): Promise<UserDto[]> {
    const docs = await this.users
      .find()
      .collation(LIST_COLLATION)
      .sort({ surname: 1, firstName: 1, email: 1 })
      .lean();
    return docs.map(toUserDto);
  }

  /**
   * USR-03: the caller changes their own first name / surname (already
   * validated and trimmed). Writes `USER_UPDATED` (changed fields only) in
   * the same transaction; an unchanged value writes nothing and keeps
   * `updatedAt`.
   */
  async updateOwnProfile(
    callerId: string,
    changes: NameChanges,
  ): Promise<UserDto> {
    return withTransaction(this.connection, async (session) => {
      const user = await this.users.findOne({ id: callerId }, null, {
        session,
      });
      // Gone between the guard's read and this one (never by the app).
      if (!user) {
        throw new AppException(
          401,
          ErrorCode.ACCESS_TOKEN_INVALID,
          'Access token is invalid',
        );
      }
      const drafts = userChangeDrafts(
        {
          firstName: user.firstName,
          surname: user.surname,
          isAdmin: user.isAdmin,
        },
        changes,
      );
      if (drafts.length === 0) return toUserDto(user.toObject());

      if (changes.firstName !== undefined) user.firstName = changes.firstName;
      if (changes.surname !== undefined) user.surname = changes.surname;
      await user.save({ session });
      await this.audit.record(
        session,
        drafts.map((d) => ({
          ...d,
          actorType: 'user' as const,
          actorId: callerId,
          targetType: 'USER' as const,
          targetId: callerId,
        })),
      );
      return toUserDto(user.toObject());
    });
  }

  /** USR-02 `GET /api/users/:id`: any user, incl. deactivated / anonymized. */
  async getById(id: string): Promise<UserDto> {
    const user = await this.users.findOne({ id }).lean();
    if (!user) throw userNotFound();
    return toUserDto(user);
  }

  /**
   * USR-02: an admin changes a user's first name / surname / admin flag
   * (already validated and trimmed). No guards on self-demotion or on the
   * last admin (recovery: AUTH-04 CLI). Writes `USER_UPDATED` and / or
   * `USER_ROLE_CHANGED` (only for real changes) in the same transaction.
   * The new role applies on the target's next request: the access-token
   * guard reads `isAdmin` from the database every time.
   */
  async adminUpdate(
    callerId: string,
    id: string,
    changes: AdminUserChanges,
  ): Promise<UserDto> {
    return withTransaction(this.connection, async (session) => {
      const user = await this.users.findOne({ id }, null, { session });
      if (!user) throw userNotFound();
      if (user.anonymizedAt != null) {
        throw new AppException(
          409,
          ErrorCode.USER_ANONYMIZED,
          'An anonymized user cannot be changed',
        );
      }
      const drafts = userChangeDrafts(
        {
          firstName: user.firstName,
          surname: user.surname,
          isAdmin: user.isAdmin,
        },
        changes,
      );
      if (drafts.length === 0) return toUserDto(user.toObject());

      if (changes.firstName !== undefined) user.firstName = changes.firstName;
      if (changes.surname !== undefined) user.surname = changes.surname;
      if (changes.isAdmin !== undefined) user.isAdmin = changes.isAdmin;
      await user.save({ session });
      await this.audit.record(
        session,
        drafts.map((d) => ({
          ...d,
          actorType: 'user' as const,
          actorId: callerId,
          targetType: 'USER' as const,
          targetId: id,
        })),
      );
      return toUserDto(user.toObject());
    });
  }

  /**
   * USR-04 soft delete: `active=false`, `deactivatedAt=now`, every refresh
   * token of the user revoked (`DEACTIVATED`) and `USER_DEACTIVATED`
   * written, all in one transaction. `isAdmin` and the user's leaves stay
   * as they are. Self-deactivation is allowed (the caller's own sessions
   * end too). Already deactivated → 409.
   */
  async deactivate(callerId: string, id: string): Promise<UserDto> {
    return withTransaction(this.connection, async (session) => {
      const user = await this.users.findOne({ id }, null, { session });
      if (!user) throw userNotFound();
      if (!user.active) {
        throw new AppException(
          409,
          ErrorCode.USER_ALREADY_DEACTIVATED,
          'User is already deactivated',
        );
      }
      const before = { active: user.active, deactivatedAt: user.deactivatedAt };
      user.active = false;
      user.deactivatedAt = this.clock.now();
      await user.save({ session });
      await this.sessions.revokeAllForUser(
        id,
        RevokedReason.DEACTIVATED,
        session,
      );
      await this.audit.record(session, {
        action: 'USER_DEACTIVATED',
        actorType: 'user',
        actorId: callerId,
        targetType: 'USER',
        targetId: id,
        details: userDeactivatedDetails(before, {
          active: user.active,
          deactivatedAt: user.deactivatedAt,
        }),
      });
      return toUserDto(user.toObject());
    });
  }
}

const userNotFound = () =>
  new AppException(404, ErrorCode.USER_NOT_FOUND, 'User not found');
