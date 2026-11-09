import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import type { LeaveDto, LeaveSummaryDto } from '@leaves/shared/dto';
import { Authenticated } from '../auth/access.decorator';
import { type AuthUser, CurrentUser } from '../auth/auth-user';
import { CreateLeaveDto } from './create-leave.dto';
import { LeavesService } from './leaves.service';
import { ListLeavesQuery } from './list-leaves.query';

/**
 * `/api/leaves` for any active session user (NFR-01). Admin-only and
 * owner-checked routes (LV-03 delete, APR-01 approve / reject) declare
 * their own access on the handler.
 */
@Authenticated()
@Controller('api/leaves')
export class LeavesController {
  constructor(private readonly leaves: LeavesService) {}

  /**
   * SUM-01: the caller's own summary. Declared before any `/:id` route so
   * that `summary` is never taken for a leave id.
   */
  @Get('summary')
  summary(@CurrentUser() user: AuthUser): Promise<LeaveSummaryDto> {
    return this.leaves.summary(user);
  }

  /** LST-01: all leaves of all users, optional `?state=`. */
  @Get()
  list(@Query() query: ListLeavesQuery): Promise<LeaveDto[]> {
    return this.leaves.list(query);
  }

  /** LV-01: a leave of the caller (201). */
  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body() body: CreateLeaveDto,
  ): Promise<LeaveDto> {
    return this.leaves.create(user, body);
  }
}
