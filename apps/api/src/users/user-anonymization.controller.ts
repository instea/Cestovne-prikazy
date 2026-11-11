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
import { IsNotEmpty, IsString } from 'class-validator';
import type { Response } from 'express';
import { Roles } from '../auth/access.decorator';
import { type AuthUser, CurrentUser } from '../auth/auth-user';
import { clearedRefreshCookie } from '../auth/refresh-token';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/env.schema';
import { UserAnonymizationService } from './user-anonymization.service';

/** NFR-08 body: `confirmEmail` is a non-empty string (else 400 `VALIDATION_FAILED`). */
export class AnonymizeUserDto implements AnonymizeUserBody {
  @IsString({ message: 'confirmEmail must be a string' })
  @IsNotEmpty({ message: 'confirmEmail must not be empty' })
  confirmEmail!: string;
}

/** NFR-08: admin-only GDPR erasure of one user (self allowed). */
@Controller('api/admin/users')
export class UserAnonymizationController {
  constructor(
    private readonly anonymization: UserAnonymizationService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Roles('admin')
  @Post(':id/anonymize')
  @HttpCode(200)
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
