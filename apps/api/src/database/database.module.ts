import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/env.schema';
import {
  ConnectionWatcher,
  PROCESS_EXIT,
  type ProcessExit,
} from './connection-watcher';
import { IndexSyncService } from './index-sync.service';

const exit: ProcessExit = (code) => process.exit(code);

@Module({
  imports: [
    MongooseModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        uri: config.MONGO_URL,
        autoIndex: config.NODE_ENV !== 'production',
        serverSelectionTimeoutMS: 10_000,
        // Fail fast (OPS-01): no Nest-level reconnect loop at startup.
        retryAttempts: 0,
      }),
    }),
  ],
  providers: [
    IndexSyncService,
    ConnectionWatcher,
    { provide: PROCESS_EXIT, useValue: exit },
  ],
})
export class DatabaseModule {}
