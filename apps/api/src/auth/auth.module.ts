import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersModule } from '../users/users.module';
import { AccessTokenGuard } from './access-token.guard';
import { AccessTokenService } from './access-token.service';
import { AuthController } from './auth.controller';
import { RefreshToken, RefreshTokenSchema } from './refresh-token.schema';
import { SessionService } from './session.service';

/**
 * AUTH-02: access JWT, rotating refresh token and the global access-token
 * guard (deny by default, `@Public()` opts out).
 */
@Module({
  imports: [
    UsersModule,
    MongooseModule.forFeature([
      { name: RefreshToken.name, schema: RefreshTokenSchema },
    ]),
  ],
  controllers: [AuthController],
  providers: [
    AccessTokenService,
    SessionService,
    { provide: APP_GUARD, useClass: AccessTokenGuard },
  ],
  exports: [SessionService, AccessTokenService, MongooseModule],
})
export class AuthModule {}
