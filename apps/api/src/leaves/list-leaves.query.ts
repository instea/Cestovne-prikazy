import { LEAVE_STATES, type LeaveState } from '@leaves/shared/leaves';
import { IsIn, IsOptional } from 'class-validator';

/**
 * LST-01 `GET /api/leaves` query. Absent `state` = all states. Unknown
 * parameters are rejected by the global pipe (LST-02 adds its filters here).
 */
export class ListLeavesQuery {
  @IsOptional()
  @IsIn(LEAVE_STATES, {
    message: `state must be one of ${LEAVE_STATES.join(', ')}`,
  })
  state?: LeaveState;
}
