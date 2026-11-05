import {
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { SessionDto, UserDto } from '@leaves/shared/dto';
import { ErrorCode } from '@leaves/shared/enums';
import type { Request, Response } from 'express';
import type { Model } from 'mongoose';
import { AppException } from '../common/app-exception';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/env.schema';
import { toUserDto } from '../users/user.mapper';
import { User } from '../users/user.schema';
import { type AuthUser, CurrentUser } from './auth-user';
import { Public } from './public.decorator';
import {
  clearedRefreshCookie,
  readRefreshCookie,
  refreshCookie,
} from './refresh-token';
import { SessionService } from './session.service';

/**
 * AUTH-02 session endpoints. TODO(AUTH-01): `GET /api/auth/config`,
 * `POST /api/auth/google`; TODO(AUTH-03): `POST /api/auth/logout`.
 */
@Controller('api/auth')
export class AuthController {
  constructor(
    private readonly sessions: SessionService,
    @InjectModel(User.name) private readonly users: Model<User>,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Cookie-authenticated; a Bearer token is ignored here (NFR-02). */
  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionDto> {
    res.set('Cache-Control', 'no-store');
    try {
      const { session, refreshToken } = await this.sessions.refresh(
        readRefreshCookie(req.headers.cookie),
      );
      res.append('Set-Cookie', refreshCookie(refreshToken, this.config));
      return session;
    } catch (e) {
      if (
        e instanceof AppException &&
        e.code !== ErrorCode.REFRESH_TOKEN_MISSING
      ) {
        res.append('Set-Cookie', clearedRefreshCookie(this.config));
      }
      throw e;
    }
  }

  @Get('me')
  async me(@CurrentUser() caller: AuthUser): Promise<UserDto> {
    const user = await this.users.findOne({ id: caller.id }).lean();
    // Deleted between the guard's read and this one (users are never
    // hard-deleted by the app, DATA-01).
    if (!user) {
      throw new AppException(
        401,
        ErrorCode.ACCESS_TOKEN_INVALID,
        'Access token is invalid',
      );
    }
    return toUserDto(user);
  }
}
