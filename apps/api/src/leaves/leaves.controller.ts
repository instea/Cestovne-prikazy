import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { LeaveState } from '@leaves/shared/leaves';
import type { LeaveDto, LeaveSummaryDto } from '@leaves/shared/dto';
import { ErrorCode } from '@leaves/shared/enums';
import { ApiNoContentResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Authenticated, Roles } from '../auth/access.decorator';
import { type AuthUser, CurrentUser } from '../auth/auth-user';
import { ApiErrors } from '../docs/api-errors';
import { ApiJsonResponse } from '../docs/api-responses';
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
  @ApiTags('summary')
  @ApiOperation({
    summary: 'Own leave summary',
    description:
      "Work days of the caller's approved leaves per year (descending) and type.",
  })
  @ApiJsonResponse(200, 'LeaveSummaryDto', { description: 'The summary.' })
  summary(@CurrentUser() user: AuthUser): Promise<LeaveSummaryDto> {
    return this.leaves.summary(user);
  }

  /** LST-01: all leaves of all users, optional `?state=`. */
  @Get()
  @ApiTags('leaves')
  @ApiOperation({
    summary: 'List leaves',
    description:
      'All leaves of all users. Unknown query parameters are refused.',
  })
  @ApiJsonResponse(200, 'LeaveDto', { description: 'Leaves.', isArray: true })
  @ApiErrors([400, ErrorCode.VALIDATION_FAILED])
  list(@Query() query: ListLeavesQuery): Promise<LeaveDto[]> {
    return this.leaves.list(query);
  }

  /** LV-01: a leave of the caller (201). */
  @Post()
  @ApiTags('leaves')
  @ApiOperation({
    summary: 'Request a leave',
    description:
      'A PENDING leave of the caller. `numDays`, `state`, requester and ' +
      'approver are set by the server (sending them is 400 ' +
      '`VALIDATION_FAILED`). Field errors win over the date rules.',
  })
  @ApiJsonResponse(201, 'LeaveDto', { description: 'The created leave.' })
  @ApiErrors(
    [400, ErrorCode.VALIDATION_FAILED],
    [400, ErrorCode.LEAVE_END_BEFORE_START],
    [400, ErrorCode.LEAVE_TOO_LONG],
    [400, ErrorCode.LEAVE_HALF_DAY_MULTIPLE_DAYS],
  )
  create(
    @CurrentUser() user: AuthUser,
    @Body() body: CreateLeaveDto,
  ): Promise<LeaveDto> {
    return this.leaves.create(user, body);
  }

  // `/:id` routes below the literal ones (`summary`).

  /** LV-03: owner (any state) or admin (any leave); 204. */
  @Delete(':id')
  @HttpCode(204)
  @ApiTags('leaves')
  @ApiOperation({
    summary: 'Delete a leave',
    description:
      'The owner (any state) or an admin (any leave). The leave is looked up ' +
      'before the ownership check (404 before 403).',
  })
  @ApiNoContentResponse({ description: 'Deleted.' })
  @ApiErrors([403, ErrorCode.FORBIDDEN], [404, ErrorCode.LEAVE_NOT_FOUND])
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<void> {
    return this.leaves.remove(user, id);
  }

  /** APR-01: admin only, any state incl. same and own leave; body ignored. */
  @Roles('admin')
  @Post(':id/approve')
  @HttpCode(200)
  @ApiTags('leaves')
  @ApiOperation({
    summary: 'Approve a leave',
    description:
      'Any state, incl. already approved and own leaves. A request body is ignored.',
  })
  @ApiJsonResponse(200, 'LeaveDto', { description: 'The approved leave.' })
  @ApiErrors([404, ErrorCode.LEAVE_NOT_FOUND])
  approve(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<LeaveDto> {
    return this.leaves.decide(user, id, LeaveState.APPROVED);
  }

  /** APR-01: admin only, any state incl. same and own leave; body ignored. */
  @Roles('admin')
  @Post(':id/reject')
  @HttpCode(200)
  @ApiTags('leaves')
  @ApiOperation({
    summary: 'Reject a leave',
    description:
      'Any state, incl. already rejected and own leaves. A request body is ignored.',
  })
  @ApiJsonResponse(200, 'LeaveDto', { description: 'The rejected leave.' })
  @ApiErrors([404, ErrorCode.LEAVE_NOT_FOUND])
  reject(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<LeaveDto> {
    return this.leaves.decide(user, id, LeaveState.REJECTED);
  }
}
