import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import { OAuth2Client } from 'google-auth-library';
import { AuditModule } from '../audit/audit.module';
import { CLOCK, type Clock } from '../common/clock';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/env.schema';
import { UsersModule } from '../users/users.module';
import { AccessTokenGuard } from './access-token.guard';
import { AccessTokenService } from './access-token.service';
import { AuthController } from './auth.controller';
import { FakeGoogleVerifier } from './google/fake-google.verifier';
import { GoogleOAuthVerifier } from './google/google-oauth.verifier';
import { GOOGLE_VERIFIER, type GoogleVerifier } from './google/google-verifier';
import { LoginService } from './login.service';
import { RefreshToken, RefreshTokenSchema } from './refresh-token.schema';
import { SessionService } from './session.service';

/**
 * AUTH-01 Google sign-in, AUTH-02 access JWT, rotating refresh token and the
 * global access-token guard (deny by default, `@Public()` opts out).
 */
@Module({
  imports: [
    UsersModule,
    AuditModule,
    MongooseModule.forFeature([
      { name: RefreshToken.name, schema: RefreshTokenSchema },
    ]),
  ],
  controllers: [AuthController],
  providers: [
    AccessTokenService,
    SessionService,
    LoginService,
    {
      // `fake` is refused in production by the config schema.
      provide: GOOGLE_VERIFIER,
      inject: [APP_CONFIG, CLOCK],
      useFactory: (config: AppConfig, clock: Clock): GoogleVerifier =>
        config.AUTH_GOOGLE_VERIFIER === 'fake'
          ? new FakeGoogleVerifier(config.GOOGLE_CLIENT_ID, clock)
          : new GoogleOAuthVerifier(
              new OAuth2Client({ clientId: config.GOOGLE_CLIENT_ID }),
              config.GOOGLE_CLIENT_ID,
            ),
    },
    { provide: APP_GUARD, useClass: AccessTokenGuard },
  ],
  exports: [SessionService, AccessTokenService, MongooseModule],
})
export class AuthModule {}
