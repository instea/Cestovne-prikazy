import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { SessionDto } from '@leaves/shared/dto';
import { ErrorCode } from '@leaves/shared/enums';
import type { ClientSession, Model } from 'mongoose';
import { AppException } from '../common/app-exception';
import { CLOCK, type Clock } from '../common/clock';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/env.schema';
import { toUserDto } from '../users/user.mapper';
import { User } from '../users/user.schema';
import { AccessTokenService } from './access-token.service';
import { generateRefreshToken, hashRefreshToken } from './refresh-token';
import { RefreshToken, RevokedReason } from './refresh-token.schema';

/** A session response plus the raw refresh token for the cookie. */
export interface IssuedSession {
  session: SessionDto;
  /** Raw token: goes only into the `Set-Cookie` header, never logged. */
  refreshToken: string;
}

type SessionUser = Parameters<typeof toUserDto>[0];

const refreshError = (code: ErrorCode, message: string) =>
  new AppException(401, code, message);

/**
 * AUTH-02 sessions: short-lived access JWT + rotating, single-use refresh
 * token stored as a SHA-256 hash. Presenting a rotated token revokes the
 * whole family (reuse detection).
 */
@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  constructor(
    @InjectModel(RefreshToken.name)
    private readonly tokens: Model<RefreshToken>,
    @InjectModel(User.name) private readonly users: Model<User>,
    private readonly accessTokens: AccessTokenService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * New session (new token family) for an already verified, active user.
   * Called by AUTH-01 login, which sets the cookie from `refreshToken`.
   */
  async startSession(user: SessionUser): Promise<IssuedSession> {
    const familyId = randomUUID();
    const refreshToken = await this.insertToken(user.id, familyId);
    return { session: await this.sessionFor(user), refreshToken };
  }

  /**
   * Verifies the raw refresh token against its stored hash and rotates it.
   * Throws 401 with `REFRESH_TOKEN_*` or `USER_DEACTIVATED`.
   */
  async refresh(raw: string | undefined): Promise<IssuedSession> {
    if (!raw) {
      throw refreshError(
        ErrorCode.REFRESH_TOKEN_MISSING,
        'Refresh token missing',
      );
    }
    const now = this.clock.now();
    const current = await this.tokens
      .findOne({ tokenHash: hashRefreshToken(raw) })
      .lean();
    // The TTL index on `expiresAt` deletes a token within ~60 s of expiry
    // (MongoDB TTL monitor). So `REFRESH_TOKEN_EXPIRED` below only shows up
    // until then; afterwards the hash is gone and the answer is
    // `REFRESH_TOKEN_INVALID`, and reuse detection for that (rotated) token
    // ends too. Both rules are in the spec; the SPA treats both codes alike.
    if (!current) {
      throw refreshError(
        ErrorCode.REFRESH_TOKEN_INVALID,
        'Refresh token is invalid',
      );
    }
    if (current.revokedReason === RevokedReason.ROTATED) {
      return this.reuseDetected(current);
    }
    if (current.revokedAt) {
      // AUTH-05 / USR-04: a token revoked by the deactivation of a user who
      // is still deactivated answers USER_DEACTIVATED, so the SPA shows the
      // deactivated message instead of a plain expired session.
      if (
        current.revokedReason === RevokedReason.DEACTIVATED &&
        (await this.users.exists({ id: current.userId, active: false }))
      ) {
        throw refreshError(
          ErrorCode.USER_DEACTIVATED,
          'User account is deactivated',
        );
      }
      throw refreshError(
        ErrorCode.REFRESH_TOKEN_INVALID,
        'Refresh token is invalid',
      );
    }
    if (current.expiresAt.getTime() <= now.getTime()) {
      throw refreshError(
        ErrorCode.REFRESH_TOKEN_EXPIRED,
        'Refresh token has expired',
      );
    }

    const user = await this.users.findOne({ id: current.userId }).lean();
    if (!user) {
      throw refreshError(
        ErrorCode.REFRESH_TOKEN_INVALID,
        'Refresh token is invalid',
      );
    }
    if (!user.active) {
      await this.revokeFamily(current.familyId, RevokedReason.DEACTIVATED);
      throw refreshError(
        ErrorCode.USER_DEACTIVATED,
        'User account is deactivated',
      );
    }

    // Successor first, then the conditional rotation: whoever loses the race
    // revokes the family, and that always includes the winner's successor.
    const successorId = randomUUID();
    const refreshToken = await this.insertToken(
      user.id,
      current.familyId,
      successorId,
    );
    const rotated = await this.tokens.findOneAndUpdate(
      { id: current.id, revokedAt: null },
      {
        $set: {
          revokedAt: now,
          revokedReason: RevokedReason.ROTATED,
          replacedById: successorId,
        },
      },
    );
    if (!rotated) return this.reuseDetected(current);

    return { session: await this.sessionFor(user), refreshToken };
  }

  /**
   * AUTH-03: revokes every non-revoked token of the presented token's family
   * (this browser) with `LOGOUT`. Idempotent: no / unknown token is a no-op.
   * Other families (other browsers) stay logged in.
   */
  async logout(raw: string | undefined): Promise<void> {
    if (!raw) return;
    const token = await this.tokens
      .findOne({ tokenHash: hashRefreshToken(raw) }, { familyId: 1 })
      .lean();
    if (!token) return;
    await this.revokeFamily(token.familyId, RevokedReason.LOGOUT);
  }

  /**
   * AUTH-05: revokes every non-revoked refresh token of `userId` (all
   * browsers) at once. USR-04 deactivation calls it with `DEACTIVATED` so
   * the user cannot refresh again; the access-token guard already rejects
   * the user's live access tokens on the next request. Returns the number
   * of tokens revoked. Idempotent.
   * With `session` the revocation is part of the caller's transaction
   * (USR-04 deactivate, NFR-08 anonymization), so it commits or
   * aborts together with the user change and its audit entry.
   */
  async revokeAllForUser(
    userId: string,
    reason: RevokedReason,
    session?: ClientSession,
  ): Promise<number> {
    const result = await this.tokens.updateMany(
      { userId, revokedAt: null },
      { $set: { revokedAt: this.clock.now(), revokedReason: reason } },
      session ? { session } : {},
    );
    return result.modifiedCount;
  }

  private async reuseDetected(
    token: Pick<RefreshToken, 'userId' | 'familyId'>,
  ): Promise<never> {
    await this.revokeFamily(token.familyId, RevokedReason.REUSE_DETECTED);
    this.logger.warn({
      msg: 'Refresh token reuse detected; token family revoked',
      userId: token.userId,
      familyId: token.familyId,
    });
    throw refreshError(
      ErrorCode.REFRESH_TOKEN_REUSED,
      'Refresh token was already used',
    );
  }

  private async revokeFamily(
    familyId: string,
    reason: RevokedReason,
  ): Promise<void> {
    await this.tokens.updateMany(
      { familyId, revokedAt: null },
      { $set: { revokedAt: this.clock.now(), revokedReason: reason } },
    );
  }

  private async insertToken(
    userId: string,
    familyId: string,
    id: string = randomUUID(),
  ): Promise<string> {
    const raw = generateRefreshToken();
    const expiresAt = new Date(
      this.clock.now().getTime() + this.config.REFRESH_TOKEN_TTL_SECONDS * 1000,
    );
    await this.tokens.create({
      id,
      userId,
      familyId,
      tokenHash: hashRefreshToken(raw),
      expiresAt,
    });
    return raw;
  }

  private async sessionFor(user: SessionUser): Promise<SessionDto> {
    const { token, expiresAt } = await this.accessTokens.sign(user.id);
    return {
      accessToken: token,
      accessTokenExpiresAt: expiresAt.toISOString(),
      user: toUserDto(user),
    };
  }
}
