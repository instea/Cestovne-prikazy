import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectModel } from '@nestjs/mongoose';
import { ErrorCode } from '@leaves/shared/enums';
import type { Model } from 'mongoose';
import { AppException } from '../common/app-exception';
import { User } from '../users/user.schema';
import { AccessTokenService } from './access-token.service';
import type { AuthenticatedRequest } from './auth-user';
import { IS_PUBLIC } from './public.decorator';

const BEARER = /^Bearer +(\S+)$/i;

/**
 * Global guard (AUTH-02, NFR-01): every route needs a valid access token
 * unless marked `@Public()`. `isAdmin` and `active` come from the DB on each
 * request, so admin and deactivation changes apply on the next call.
 * TODO(NFR-01): `@Roles('admin')` + `RolesGuard`. The M2M attendance route
 * (ATT-01) is `@Public()` behind its own Basic-auth guard.
 */
@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: AccessTokenService,
    @InjectModel(User.name) private readonly users: Model<User>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(
      IS_PUBLIC,
      [context.getHandler(), context.getClass()],
    );
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const match = BEARER.exec(request.headers.authorization ?? '');
    if (!match) {
      throw new AppException(
        401,
        ErrorCode.AUTH_REQUIRED,
        'Authentication required',
      );
    }

    const userId = await this.tokens.verify(match[1]!);
    const user = await this.users
      .findOne({ id: userId }, { id: 1, isAdmin: 1, active: 1 })
      .lean();
    if (!user) {
      throw new AppException(
        401,
        ErrorCode.ACCESS_TOKEN_INVALID,
        'Access token is invalid',
      );
    }
    if (!user.active) {
      throw new AppException(
        401,
        ErrorCode.USER_DEACTIVATED,
        'User account is deactivated',
      );
    }
    request.user = { id: user.id, isAdmin: user.isAdmin, active: user.active };
    return true;
  }
}
