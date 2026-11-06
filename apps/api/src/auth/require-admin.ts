import { ErrorCode } from '@leaves/shared/enums';
import { AppException } from '../common/app-exception';
import type { AuthUser } from './auth-user';

/**
 * Admin-only check for a handler (NFR-06 `/api/admin/*`). `isAdmin` comes
 * from the DB on each request (AccessTokenGuard).
 * TODO(NFR-01): replace with `@Roles('admin')` + `RolesGuard`.
 */
export function requireAdmin(caller: AuthUser): void {
  if (!caller.isAdmin) {
    throw new AppException(403, ErrorCode.FORBIDDEN, 'Forbidden');
  }
}
