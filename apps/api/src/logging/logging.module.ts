import { type DynamicModule, Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import type { DestinationStream } from 'pino';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/env.schema';
import { buildPinoHttpOptions } from './pino-options';

@Module({})
export class LoggingModule {
  /** `destination` lets tests capture log lines; default is stdout. */
  static forRoot(destination?: DestinationStream): DynamicModule {
    return {
      module: LoggingModule,
      imports: [
        LoggerModule.forRootAsync({
          inject: [APP_CONFIG],
          useFactory: (config: AppConfig) => {
            const options = buildPinoHttpOptions(config);
            return {
              pinoHttp: destination
                ? [{ ...options, transport: undefined }, destination]
                : options,
            };
          },
        }),
      ],
    };
  }
}
