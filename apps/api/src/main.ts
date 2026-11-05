import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import pino from 'pino';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { ConfigError, loadConfig, type AppConfig } from './config/env.schema';

function loadConfigOrExit(): AppConfig {
  try {
    return loadConfig(process.env);
  } catch (e) {
    if (!(e instanceof ConfigError)) throw e;
    const log = pino();
    for (const problem of e.problems)
      log.fatal(`Invalid configuration: ${problem}`);
    process.exit(1);
  }
}

async function bootstrap(): Promise<void> {
  const config = loadConfigOrExit();
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule.forRoot(config),
    { bufferLogs: true },
  );
  configureApp(app, config);
  await app.listen(config.PORT);
  app
    .get(Logger)
    .log(
      `Leaves API ${config.APP_VERSION} started (${config.NODE_ENV}) on port ${config.PORT}`,
    );
}

void bootstrap();
