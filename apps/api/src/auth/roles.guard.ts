import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorCode } from '@leaves/shared/enums';
import { AppException } from '../common/app-exception';
import { ACCESS, type AccessLevel } from './access.decorator';
import type { AuthenticatedRequest } from './auth-user';

/**
 * NFR-01: global guard registered after `AccessTokenGuard`. A route declared
 * `@Roles('admin')` needs `isAdmin` (read from the DB by `AccessTokenGuard`
 * on this request) → else 403 `FORBIDDEN`.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const access = this.reflector.getAllAndOverride<AccessLevel | undefined>(
      ACCESS,
      [context.getHandler(), context.getClass()],
    );
    if (access !== 'admin') return true;
    const { user } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (user?.isAdmin === true) return true;
    throw new AppException(403, ErrorCode.FORBIDDEN, 'Forbidden');
  }
}
