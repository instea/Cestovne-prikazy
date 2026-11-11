import {
  Body,
  Controller,
  HttpCode,
  Inject,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import type { AnonymizeUserBody, UserDto } from '@leaves/shared/dto';
import { ErrorCode } from '@leaves/shared/enums';
import { ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';
import type { Response } from 'express';
import { Roles } from '../auth/access.decorator';
import { type AuthUser, CurrentUser } from '../auth/auth-user';
import { clearedRefreshCookie } from '../auth/refresh-token';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/env.schema';
import { ApiErrors } from '../docs/api-errors';
import { ApiJsonResponse, refreshCookieHeader } from '../docs/api-responses';
import { UserAnonymizationService } from './user-anonymization.service';

/** NFR-08 body: `confirmEmail` is a non-empty string (else 400 `VALIDATION_FAILED`). */
export class AnonymizeUserDto implements AnonymizeUserBody {
  @ApiProperty({
    description:
      "The target user's email, typed by the admin; compared trimmed and lowercased.",
    minLength: 1,
  })
  @IsString({ message: 'confirmEmail must be a string' })
  @IsNotEmpty({ message: 'confirmEmail must not be empty' })
  confirmEmail!: string;
}

/** NFR-08: admin-only GDPR erasure of one user (self allowed). */
@ApiTags('gdpr')
@Controller('api/admin/users')
export class UserAnonymizationController {
  constructor(
    private readonly anonymization: UserAnonymizationService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Roles('admin')
  @Post(':id/anonymize')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Anonymize a user',
    description:
      'Irreversible GDPR erasure (also of the caller): replaces email and names, ' +
      'deactivates the user and revokes their sessions. Refused while the SSO ' +
      'directory still lists the email. Checks in this order: body, user exists, ' +
      'not anonymized, `confirmEmail` matches, SSO.',
  })
  @ApiJsonResponse(200, 'UserDto', {
    description:
      'The anonymized user. Self-anonymization also clears the refresh cookie.',
    headers: refreshCookieHeader('cleared on self-anonymization only.'),
  })
  @ApiErrors(
    [400, ErrorCode.VALIDATION_FAILED],
    [400, ErrorCode.CONFIRM_EMAIL_MISMATCH],
    [404, ErrorCode.USER_NOT_FOUND],
    [409, ErrorCode.USER_ALREADY_ANONYMIZED],
    [409, ErrorCode.SSO_EMPLOYEE_ACTIVE],
    [503, ErrorCode.SSO_UNAVAILABLE],
  )
  async anonymize(
    @CurrentUser() caller: AuthUser,
    @Param('id') id: string,
    @Body() body: AnonymizeUserDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<UserDto> {
    const user = await this.anonymization.anonymize(
      caller.id,
      id,
      body.confirmEmail,
    );
    // Self-anonymization: the own sessions were revoked in the transaction;
    // clear this browser's cookie too (after commit). The SPA shows /login.
    if (id === caller.id) {
      res.append('Set-Cookie', clearedRefreshCookie(this.config));
    }
    return user;
  }
}
