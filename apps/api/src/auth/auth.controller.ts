import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { AuthConfigDto, SessionDto, UserDto } from '@leaves/shared/dto';
import { ErrorCode } from '@leaves/shared/enums';
import type { Request, Response } from 'express';
import type { Model } from 'mongoose';
import { AppException } from '../common/app-exception';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/env.schema';
import { toUserDto } from '../users/user.mapper';
import { User } from '../users/user.schema';
import { type AuthUser, CurrentUser } from './auth-user';
import { GoogleLoginDto } from './google-login.dto';
import { LoginService } from './login.service';
import { Authenticated, Public } from './access.decorator';
import {
  clearedRefreshCookie,
  readRefreshCookie,
  refreshCookie,
} from './refresh-token';
import { SessionService } from './session.service';

/**
 * AUTH-01 Google sign-in and runtime config, AUTH-02 session endpoints and
 * AUTH-03 logout.
 */
@Controller('api/auth')
export class AuthController {
  constructor(
    private readonly sessions: SessionService,
    private readonly login: LoginService,
    @InjectModel(User.name) private readonly users: Model<User>,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** AUTH-01: settings the SPA needs before sign-in (one image, any env). */
  @Public()
  @Get('config')
  authConfig(): AuthConfigDto {
    return {
      googleClientId: this.config.GOOGLE_CLIENT_ID,
      hostedDomain: this.config.HOSTED_DOMAIN,
    };
  }

  /**
   * AUTH-01: exchanges a Google ID token for a session (access token in the
   * body, refresh token in the cookie). Registers an unknown account of the
   * hosted domain on first login.
   */
  @Public()
  @Post('google')
  @HttpCode(200)
  async google(
    @Body() body: GoogleLoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionDto> {
    res.set('Cache-Control', 'no-store');
    const { session, refreshToken } = await this.login.loginWithGoogle(
      body.idToken,
    );
    res.append('Set-Cookie', refreshCookie(refreshToken, this.config));
    return session;
  }

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

  /**
   * AUTH-03: cookie-identified, so it works with an expired access token.
   * Revokes this browser's token family, always clears the cookie; 204 even
   * without / with an unknown cookie. Not audited (NFR-06 action list).
   */
  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    res.set('Cache-Control', 'no-store');
    res.append('Set-Cookie', clearedRefreshCookie(this.config));
    await this.sessions.logout(readRefreshCookie(req.headers.cookie));
  }

  @Authenticated()
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
