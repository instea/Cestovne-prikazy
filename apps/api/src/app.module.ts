import { type DynamicModule, Module } from '@nestjs/common';
import { AttendanceModule } from './attendance/attendance.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { ClockModule } from './common/clock.module';
import { ConfigModule } from './config/config.module';
import type { AppConfig } from './config/env.schema';
import { DatabaseModule } from './database/database.module';
import { ApiDocsModule } from './docs/api-docs.controller';
import { HealthModule } from './health/health.module';
import { LeavesModule } from './leaves/leaves.module';
import { LoggingModule } from './logging/logging.module';
import { MailModule } from './mail/mail.module';
import { NotificationsModule } from './notifications/notifications.module';
import { UsersApiModule } from './users/users-api.module';
import { UsersModule } from './users/users.module';

@Module({})
export class AppModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot(config),
        ClockModule,
        LoggingModule.forRoot(),
        DatabaseModule,
        MailModule,
        NotificationsModule,
        UsersModule,
        UsersApiModule,
        AuthModule,
        AuditModule,
        LeavesModule,
        AttendanceModule,
        HealthModule,
        // DOC-02: the API explorer, only outside production (NFR-05).
        ApiDocsModule.forRoot(config),
      ],
    };
  }
}
