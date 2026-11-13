import { Inject, Injectable } from '@nestjs/common';
import { ErrorCode } from '@leaves/shared/enums';
import { errors, jwtVerify, SignJWT } from 'jose';
import { AppException } from '../common/app-exception';
import { CLOCK, type Clock } from '../common/clock';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/env.schema';

const ALG = 'HS256';
const TYP = 'access';

export interface SignedAccessToken {
  token: string;
  expiresAt: Date;
}

const invalid = () =>
  new AppException(
    401,
    ErrorCode.ACCESS_TOKEN_INVALID,
    'Access token is invalid',
  );

/**
 * AUTH-02 access JWT: HS256 with `JWT_ACCESS_SECRET`, claims
 * `{ sub, typ: "access", iat, exp }`. No role claims: the guard reads
 * `isAdmin` / `active` from the DB on every request.
 */
@Injectable()
export class AccessTokenService {
  private readonly key: Uint8Array;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    this.key = new TextEncoder().encode(config.JWT_ACCESS_SECRET);
  }

  async sign(userId: string): Promise<SignedAccessToken> {
    const iat = Math.floor(this.clock.now().getTime() / 1000);
    const exp = iat + this.config.ACCESS_TOKEN_TTL_SECONDS;
    const token = await new SignJWT({ typ: TYP })
      .setProtectedHeader({ alg: ALG, typ: 'JWT' })
      .setSubject(userId)
      .setIssuedAt(iat)
      .setExpirationTime(exp)
      .sign(this.key);
    return { token, expiresAt: new Date(exp * 1000) };
  }

  /**
   * Verifies signature (HS256 only, so `alg: none` and other algorithms
   * fail), then `exp` against the app clock, then `typ` and `sub`.
   * Returns the user id. Throws 401 `ACCESS_TOKEN_EXPIRED` or
   * `ACCESS_TOKEN_INVALID`.
   */
  async verify(token: string): Promise<string> {
    let payload: Record<string, unknown>;
    try {
      ({ payload } = await jwtVerify(token, this.key, {
        algorithms: [ALG],
        currentDate: this.clock.now(),
        requiredClaims: ['sub', 'iat', 'exp'],
      }));
    } catch (e) {
      if (e instanceof errors.JWTExpired) {
        throw new AppException(
          401,
          ErrorCode.ACCESS_TOKEN_EXPIRED,
          'Access token has expired',
        );
      }
      throw invalid();
    }
    if (payload.typ !== TYP || typeof payload.sub !== 'string') throw invalid();
    return payload.sub;
  }
}
