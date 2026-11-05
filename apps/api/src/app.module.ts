import { type DynamicModule, Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import type { AppConfig } from './config/env.schema';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { LoggingModule } from './logging/logging.module';
import { UsersModule } from './users/users.module';

@Module({})
export class AppModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot(config),
        LoggingModule.forRoot(),
        DatabaseModule,
        UsersModule,
        HealthModule,
      ],
    };
  }
}
