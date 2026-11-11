import { ErrorCode } from '@leaves/shared/enums';
import { ApiError } from '../api/errors';

/** APR-02: catalog key of the error toast for a failed approve / reject. */
export function decisionErrorKey(
  error: unknown,
): 'approval.notFound' | 'approval.forbidden' | 'approval.failed' {
  if (error instanceof ApiError) {
    if (error.code === ErrorCode.LEAVE_NOT_FOUND) return 'approval.notFound';
    if (error.code === ErrorCode.FORBIDDEN) return 'approval.forbidden';
  }
  return 'approval.failed';
}
