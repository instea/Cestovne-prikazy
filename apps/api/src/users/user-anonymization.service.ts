import { Inject, Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import type { UserDto } from '@leaves/shared/dto';
import { ErrorCode } from '@leaves/shared/enums';
import type { Connection, Model } from 'mongoose';
import { SsoClient, SsoUnavailableError } from '../attendance/sso/sso.client';
import { userAnonymizedDetails } from '../audit/audit-details';
import { AuditService } from '../audit/audit.service';
import { RevokedReason } from '../auth/refresh-token.schema';
import { SessionService } from '../auth/session.service';
import { AppException } from '../common/app-exception';
import { CLOCK, type Clock } from '../common/clock';
import { withTransaction } from '../database/transaction';
import {
  confirmEmailMatches,
  pickPlaceholderToken,
  placeholderIdentity,
} from './anonymization';
import { toUserDto } from './user.mapper';
import { User } from './user.schema';

const alreadyAnonymized = () =>
  new AppException(
    409,
    ErrorCode.USER_ALREADY_ANONYMIZED,
    'User is already anonymized',
  );

/**
 * NFR-08 GDPR erasure: irreversibly replaces one user's email and names
 * with placeholders, deactivates the account, revokes its refresh tokens
 * and scrubs the names out of the audit entries about the user. Leaves
 * keep `requesterId` / `approverId` (the id is unchanged).
 */
@Injectable()
export class UserAnonymizationService {
  constructor(
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectConnection() private readonly connection: Connection,
    private readonly audit: AuditService,
    private readonly sessions: SessionService,
    private readonly sso: SsoClient,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * Checks in the spec's order after authorization and body validation:
   * 404 `USER_NOT_FOUND`, 409 `USER_ALREADY_ANONYMIZED`, 400
   * `CONFIRM_EMAIL_MISMATCH`, then SSO (503 `SSO_UNAVAILABLE`, 409
   * `SSO_EMPLOYEE_ACTIVE`); SSO is called only when all earlier checks
   * pass. Then, in one transaction: user update, refresh-token revocation
   * (`DEACTIVATED`: the user is inactive, so a refresh answers
   * `USER_DEACTIVATED`), audit scrub and the `USER_ANONYMIZED` entry. Any
   * failure rolls all of it back (500 `INTERNAL_ERROR`).
   */
  async anonymize(
    callerId: string,
    id: string,
    confirmEmail: string,
  ): Promise<UserDto> {
    const user = await this.users.findOne({ id }).lean();
    if (!user) {
      throw new AppException(404, ErrorCode.USER_NOT_FOUND, 'User not found');
    }
    if (user.anonymizedAt != null) throw alreadyAnonymized();
    if (!confirmEmailMatches(confirmEmail, user.email)) {
      throw new AppException(
        400,
        ErrorCode.CONFIRM_EMAIL_MISMATCH,
        'confirmEmail does not match the user email',
      );
    }
    await this.assertNotInSso(user.email);

    return withTransaction(this.connection, async (session) => {
      const doc = await this.users.findOne({ id }, null, { session });
      if (!doc) {
        throw new AppException(404, ErrorCode.USER_NOT_FOUND, 'User not found');
      }
      // Anonymized meanwhile by a concurrent request.
      if (doc.anonymizedAt != null) throw alreadyAnonymized();
      // The checked email must still be the stored one (a login may change
      // it between the SSO check and here).
      if (doc.email !== user.email) {
        throw new AppException(
          400,
          ErrorCode.CONFIRM_EMAIL_MISMATCH,
          'confirmEmail does not match the user email',
        );
      }

      const now = this.clock.now();
      const before = {
        active: doc.active,
        isAdmin: doc.isAdmin,
        deactivatedAt: doc.deactivatedAt,
        anonymizedAt: doc.anonymizedAt,
      };
      const token = await pickPlaceholderToken(async (email) =>
        Boolean(await this.users.exists({ email }).session(session)),
      );
      const identity = placeholderIdentity(token);
      doc.email = identity.email;
      doc.firstName = identity.firstName;
      doc.surname = identity.surname;
      doc.isAdmin = false;
      doc.active = false;
      doc.deactivatedAt ??= now;
      doc.anonymizedAt = now;
      await doc.save({ session });

      await this.sessions.revokeAllForUser(
        id,
        RevokedReason.DEACTIVATED,
        session,
      );
      await this.audit.scrubUserPersonalData(session, id);
      await this.audit.record(session, {
        action: 'USER_ANONYMIZED',
        actorType: 'user',
        actorId: callerId,
        targetType: 'USER',
        targetId: id,
        details: userAnonymizedDetails(before, {
          active: doc.active,
          isAdmin: doc.isAdmin,
          deactivatedAt: doc.deactivatedAt,
          anonymizedAt: doc.anonymizedAt,
        }),
      });
      return toUserDto(doc.toObject());
    });
  }

  /**
   * Attendance joins leaves to SSO employees by email, so a person SSO still
   * lists would lose their leave codes there: blocked (interview: Anonymize).
   */
  private async assertNotInSso(email: string): Promise<void> {
    let listed: boolean;
    try {
      listed = await this.sso.isEmailListed(email);
    } catch (e) {
      if (!(e instanceof SsoUnavailableError)) throw e;
      throw new AppException(
        503,
        ErrorCode.SSO_UNAVAILABLE,
        'The SSO directory is not reachable',
      );
    }
    if (listed) {
      throw new AppException(
        409,
        ErrorCode.SSO_EMPLOYEE_ACTIVE,
        'The SSO directory still lists this user',
      );
    }
  }
}
