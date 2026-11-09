import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import type { UserDto } from '@leaves/shared/dto';
import { ErrorCode } from '@leaves/shared/enums';
import type { Connection, Model } from 'mongoose';
import { userChangeDrafts } from '../audit/audit-details';
import { AuditService } from '../audit/audit.service';
import { AppException } from '../common/app-exception';
import { withTransaction } from '../database/transaction';
import { toUserDto } from './user.mapper';
import { User } from './user.schema';

/** USR-01 sort: case-insensitive Slovak collation (strength 2 ignores case only). */
const LIST_COLLATION = { locale: 'sk', strength: 2 } as const;

export interface NameChanges {
  firstName?: string;
  surname?: string;
}

/** User administration (USR-01) and own profile (USR-03). */
@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectConnection() private readonly connection: Connection,
    private readonly audit: AuditService,
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
}
