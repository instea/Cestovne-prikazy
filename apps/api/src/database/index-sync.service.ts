import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/env.schema';

/** Production builds indexes explicitly (autoIndex is off there). */
@Injectable()
export class IndexSyncService implements OnApplicationBootstrap {
  private readonly logger = new Logger(IndexSyncService.name);

  constructor(
    @InjectConnection() private readonly connection: Connection,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (this.config.NODE_ENV !== 'production') return;
    for (const model of Object.values(this.connection.models)) {
      await model.syncIndexes();
      this.logger.log(`Indexes synced for ${model.modelName}`);
    }
  }
}
