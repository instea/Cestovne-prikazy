import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import type { UserDto } from '@leaves/shared/dto';
import { ErrorCode } from '@leaves/shared/enums';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Authenticated, Roles } from '../auth/access.decorator';
import { type AuthUser, CurrentUser } from '../auth/auth-user';
import { ApiErrors } from '../docs/api-errors';
import { ApiJsonResponse } from '../docs/api-responses';
import { AdminUpdateUserDto, UpdateOwnProfileDto } from './user-edit.dto';
import { UserEditBodyPipe } from './user-edit-body.pipe';
import {
  type AdminUserChanges,
  type NameChanges,
  UsersService,
} from './users.service';

/** USR-03: own profile edit never touches these (403 `FIELD_NOT_EDITABLE`). */
// Exported: `no-useless-assignment` misses its use inside a decorator.
export const OWN_PROFILE_NON_EDITABLE = ['email', 'isAdmin'] as const;

/** USR-02: email is read-only for everyone (403 `FIELD_NOT_EDITABLE`). */
export const ADMIN_EDIT_NON_EDITABLE = ['email'] as const;

/**
 * `/api/users`. Access is declared per handler (mixed levels: admin list,
 * any user's own profile), never on the class (NFR-01).
 *
 * Express matches routes in registration order, which is the order of the
 * handlers below: the literal `me` routes stay above every `:id` route, so
 * `me` is never parsed as an id.
 *
 * No `DELETE /:id` (users are never hard-deleted) and no `/:id/reactivate`
 * (USR-04): both answer 404 `NOT_FOUND`.
 */
@ApiTags('users')
@Controller('api/users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /** USR-01: all users incl. deactivated / anonymized. */
  @Roles('admin')
  @Get()
  @ApiOperation({
    summary: 'List users',
    description: 'All users, incl. deactivated and anonymized ones.',
  })
  @ApiJsonResponse(200, 'UserDto', { description: 'Users.', isArray: true })
  list(): Promise<UserDto[]> {
    return this.users.list();
  }

  /** USR-03: the caller's own first name / surname, also for admins. */
  @Authenticated()
  @Patch('me')
  @ApiOperation({
    summary: 'Edit own profile',
    description:
      "The caller's first name and / or surname (at least one). `email` and " +
      '`isAdmin` are refused with 403 `FIELD_NOT_EDITABLE`, before any other check.',
  })
  @ApiBody({ type: UpdateOwnProfileDto })
  @ApiJsonResponse(200, 'UserDto', { description: 'The updated caller.' })
  @ApiErrors(
    [400, ErrorCode.VALIDATION_FAILED],
    [403, ErrorCode.FIELD_NOT_EDITABLE],
  )
  updateMe(
    @CurrentUser() caller: AuthUser,
    // Typed as a plain interface: the global pipe must not validate the raw
    // body first (see `UserEditBodyPipe`).
    @Body(new UserEditBodyPipe(UpdateOwnProfileDto, OWN_PROFILE_NON_EDITABLE))
    body: NameChanges,
  ): Promise<UserDto> {
    return this.users.updateOwnProfile(caller.id, body);
  }

  // `:id` routes: below the `me` routes.

  /** USR-02: one user for the edit form. */
  @Roles('admin')
  @Get(':id')
  @ApiOperation({ summary: 'Get a user' })
  @ApiJsonResponse(200, 'UserDto', { description: 'The user.' })
  @ApiErrors([404, ErrorCode.USER_NOT_FOUND])
  getOne(@Param('id') id: string): Promise<UserDto> {
    return this.users.getById(id);
  }

  /** USR-02: names and admin flag of any user (incl. the caller). */
  @Roles('admin')
  @Patch(':id')
  @ApiOperation({
    summary: 'Edit a user',
    description:
      'Names and admin flag of any user, incl. the caller (at least one field). ' +
      '`email` is refused with 403 `FIELD_NOT_EDITABLE`; the body is checked ' +
      'before the user is looked up.',
  })
  @ApiBody({ type: AdminUpdateUserDto })
  @ApiJsonResponse(200, 'UserDto', { description: 'The updated user.' })
  @ApiErrors(
    [400, ErrorCode.VALIDATION_FAILED],
    [403, ErrorCode.FIELD_NOT_EDITABLE],
    [404, ErrorCode.USER_NOT_FOUND],
    [409, ErrorCode.USER_ANONYMIZED],
  )
  update(
    @CurrentUser() caller: AuthUser,
    @Param('id') id: string,
    // Plain interface type, as for `updateMe`.
    @Body(new UserEditBodyPipe(AdminUpdateUserDto, ADMIN_EDIT_NON_EDITABLE))
    body: AdminUserChanges,
  ): Promise<UserDto> {
    return this.users.adminUpdate(caller.id, id, body);
  }

  /** USR-04: soft delete, incl. the caller themselves. No body. */
  @Roles('admin')
  @Post(':id/deactivate')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Deactivate a user',
    description:
      'Soft delete (also the caller); revokes their sessions. No request body.',
  })
  @ApiJsonResponse(200, 'UserDto', { description: 'The deactivated user.' })
  @ApiErrors(
    [404, ErrorCode.USER_NOT_FOUND],
    [409, ErrorCode.USER_ALREADY_DEACTIVATED],
  )
  deactivate(
    @CurrentUser() caller: AuthUser,
    @Param('id') id: string,
  ): Promise<UserDto> {
    return this.users.deactivate(caller.id, id);
  }
}
