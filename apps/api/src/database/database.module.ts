import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/env.schema';
import { IndexSyncService } from './index-sync.service';

@Module({
  imports: [
    MongooseModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        uri: config.MONGO_URL,
        autoIndex: config.NODE_ENV !== 'production',
      }),
    }),
  ],
  providers: [IndexSyncService],
})
export class DatabaseModule {}
