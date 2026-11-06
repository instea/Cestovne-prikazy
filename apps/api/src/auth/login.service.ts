import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ErrorCode } from '@leaves/shared/enums';
import type { Connection, Model } from 'mongoose';
import { userRegisteredDetails } from '../audit/audit-details';
import { AuditService } from '../audit/audit.service';
import { AppException } from '../common/app-exception';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/env.schema';
import { withTransaction } from '../database/transaction';
import { User } from '../users/user.schema';
import {
  GOOGLE_VERIFIER,
  type GoogleIdentity,
  type GoogleVerifier,
} from './google/google-verifier';
import { type IssuedSession, SessionService } from './session.service';

/** `hd` equals `HOSTED_DOMAIN` (exact, case-insensitive); missing → false. */
export function hostedDomainMatches(
  hd: string | undefined,
  hostedDomain: string,
): boolean {
  return (
    typeof hd === 'string' && hd.toLowerCase() === hostedDomain.toLowerCase()
  );
}

/** DATA-01 fields of a user created by the first Google login. */
export function newUserFromIdentity(identity: GoogleIdentity) {
  return {
    id: identity.sub,
    email: normalizeEmail(identity.email),
    firstName: identity.givenName ?? '',
    surname: identity.familyName ?? '',
    isAdmin: false,
    active: true,
    deactivatedAt: null,
    anonymizedAt: null,
  };
}

export const normalizeEmail = (email: string): string =>
  email.trim().toLowerCase();

const loginFailed = (status: 401 | 409, message: string) =>
  new AppException(status, ErrorCode.LOGIN_FAILED, message);

function isDuplicateKey(e: unknown): boolean {
  return (
    typeof e === 'object' &&
    e !== null &&
    (e as { code?: unknown }).code === 11000
  );
}

/** Error text without the token (some library messages embed it). */
function reason(e: unknown, idToken: string): string {
  const text = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  return text.split(idToken).join('[token]');
}

type StoredUser = User;

/**
 * AUTH-01: Google sign-in. Verifies the ID token, enforces the hosted
 * domain, registers an unknown account on first login (with a
 * `USER_REGISTERED` audit entry in the same transaction) and starts an
 * AUTH-02 session. No approval step exists.
 */
@Injectable()
export class LoginService {
  private readonly logger = new Logger(LoginService.name);

  constructor(
    @Inject(GOOGLE_VERIFIER) private readonly verifier: GoogleVerifier,
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectConnection() private readonly connection: Connection,
    private readonly audit: AuditService,
    private readonly sessions: SessionService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async loginWithGoogle(idToken: string): Promise<IssuedSession> {
    let identity: GoogleIdentity;
    try {
      identity = await this.verifier.verify(idToken);
    } catch (e) {
      this.logger.warn(
        `Google ID token verification failed: ${reason(e, idToken)}`,
      );
      throw loginFailed(401, 'Google ID token is invalid');
    }
    if (!identity.emailVerified) {
      throw loginFailed(401, 'Google email is not verified');
    }
    if (
      !hostedDomainMatches(identity.hostedDomain, this.config.HOSTED_DOMAIN)
    ) {
      throw new AppException(
        403,
        ErrorCode.WRONG_DOMAIN,
        'Email does not belong to the hosted domain',
      );
    }

    const user =
      (await this.users.findOne({ id: identity.sub }).lean()) ??
      (await this.register(identity));
    if (!user.active) {
      throw new AppException(
        403,
        ErrorCode.USER_DEACTIVATED,
        'User account is deactivated',
      );
    }
    const current = await this.syncEmail(user, identity);
    return this.sessions.startSession(current);
  }

  /** First login of an unknown `sub`; a parallel first login re-reads. */
  private async register(identity: GoogleIdentity): Promise<StoredUser> {
    const fields = newUserFromIdentity(identity);
    await this.assertEmailFree(fields.email, identity.sub);
    try {
      await withTransaction(this.connection, async (session) => {
        await this.users.create([fields], { session });
        await this.audit.record(session, {
          actorType: 'user',
          actorId: fields.id,
          action: 'USER_REGISTERED',
          targetType: 'USER',
          targetId: fields.id,
          details: userRegisteredDetails(fields),
        });
      });
    } catch (e) {
      if (!isDuplicateKey(e)) throw e;
      // Lost the race to a parallel first login of the same `sub` (that one
      // wrote the only audit entry), or the email was taken meanwhile.
      const winner = await this.users.findOne({ id: identity.sub }).lean();
      if (winner) return winner;
      await this.assertEmailFree(fields.email, identity.sub);
      throw e;
    }
    const created = await this.users.findOne({ id: identity.sub }).lean();
    if (!created) throw new Error(`User ${identity.sub} vanished after insert`);
    this.logger.log({ msg: 'User registered', userId: identity.sub });
    return created;
  }

  /** The token email (lowercased) replaces a changed stored email. */
  private async syncEmail(
    user: StoredUser,
    identity: GoogleIdentity,
  ): Promise<StoredUser> {
    const email = normalizeEmail(identity.email);
    if (email === user.email) return user;
    await this.assertEmailFree(email, user.id);
    try {
      const updated = await this.users
        .findOneAndUpdate(
          { id: user.id },
          { $set: { email } },
          { new: true, runValidators: true },
        )
        .lean();
      if (!updated) throw new Error(`User ${user.id} vanished during login`);
      return updated;
    } catch (e) {
      if (!isDuplicateKey(e)) throw e;
      await this.assertEmailFree(email, user.id);
      throw e;
    }
  }

  /** 409 `LOGIN_FAILED` when `email` belongs to a user other than `id`. */
  private async assertEmailFree(email: string, id: string): Promise<void> {
    const other = await this.users
      .findOne({ email, id: { $ne: id } }, { id: 1 })
      .lean();
    if (!other) return;
    this.logger.error({
      msg: 'Google login rejected: email belongs to another user',
      googleSub: id,
      existingUserId: other.id,
    });
    throw loginFailed(409, 'Email belongs to another user');
  }
}
