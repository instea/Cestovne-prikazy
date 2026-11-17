import type { LeaveDto, UserDto } from '@leaves/shared/dto';

/**
 * LV-03: the viewer may delete their own leaves (any state); an admin any
 * leave. Mirrors the server rule, so the button is hidden exactly where
 * `DELETE /api/leaves/:id` answers 403.
 */
export function canDeleteLeave(
  leave: Pick<LeaveDto, 'requester'>,
  me: Pick<UserDto, 'id' | 'isAdmin'> | null,
): boolean {
  if (!me) return false;
  return me.isAdmin || leave.requester?.id === me.id;
}
