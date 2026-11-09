import { Body, Controller, Get, Patch } from '@nestjs/common';
import type { UserDto } from '@leaves/shared/dto';
import { Authenticated, Roles } from '../auth/access.decorator';
import { type AuthUser, CurrentUser } from '../auth/auth-user';
import { UpdateOwnProfileDto } from './user-edit.dto';
import { UserEditBodyPipe } from './user-edit-body.pipe';
import { type NameChanges, UsersService } from './users.service';

/** USR-03: own profile edit never touches these (403 `FIELD_NOT_EDITABLE`). */
// Exported: `no-useless-assignment` misses its use inside a decorator.
export const OWN_PROFILE_NON_EDITABLE = ['email', 'isAdmin'] as const;

/**
 * `/api/users`. Access is declared per handler (mixed levels: admin list,
 * any user's own profile), never on the class (NFR-01).
 *
 * Express matches routes in registration order, which is the order of the
 * handlers below: the literal `me` routes stay above any `:id` route
 * (USR-02 / USR-04 add `GET`/`PATCH /:id`, `POST /:id/deactivate` after
 * them), so `me` is never parsed as an id.
 */
@Controller('api/users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /** USR-01: all users incl. deactivated / anonymized. */
  @Roles('admin')
  @Get()
  list(): Promise<UserDto[]> {
    return this.users.list();
  }

  /** USR-03: the caller's own first name / surname, also for admins. */
  @Authenticated()
  @Patch('me')
  updateMe(
    @CurrentUser() caller: AuthUser,
    // Typed as a plain interface: the global pipe must not validate the raw
    // body first (see `UserEditBodyPipe`).
    @Body(new UserEditBodyPipe(UpdateOwnProfileDto, OWN_PROFILE_NON_EDITABLE))
    body: NameChanges,
  ): Promise<UserDto> {
    return this.users.updateOwnProfile(caller.id, body);
  }

  // USR-02 / USR-04: `:id` routes go here, below the `me` routes.
}
