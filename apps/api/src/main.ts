import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import pino from 'pino';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { loadDotEnv } from './config/dotenv';
import { ConfigError, loadConfig, type AppConfig } from './config/env.schema';
import { EXIT_DB_CONNECT_FAILED, shutdownState } from './database/shutdown';

const bootLog = pino();

function loadConfigOrExit(): AppConfig {
  loadDotEnv();
  try {
    return loadConfig(process.env);
  } catch (e) {
    if (!(e instanceof ConfigError)) throw e;
    for (const problem of e.problems)
      bootLog.fatal(`Invalid configuration: ${problem}`);
    process.exit(1);
  }
}

async function bootstrap(): Promise<void> {
  const config = loadConfigOrExit();

  let app: NestExpressApplication;
  try {
    // Resolves only after MongoDB is connected, so nothing listens before that.
    app = await NestFactory.create<NestExpressApplication>(
      AppModule.forRoot(config),
      {
        bufferLogs: true,
        abortOnError: false,
      },
    );
  } catch (err) {
    bootLog.error({ err }, 'Connect to database failed -> exiting');
    bootLog.flush();
    process.exit(EXIT_DB_CONNECT_FAILED);
  }

  configureApp(app, config);

  // Own handler instead of enableShutdownHooks(): Nest re-raises the signal
  // (exit 143), OPS-01 requires exit 0 after closing HTTP and the DB.
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => {
      shutdownState.begin();
      app
        .close()
        .then(() => process.exit(0))
        .catch((err: unknown) => {
          bootLog.error({ err }, 'Shutdown failed');
          process.exit(1);
        });
    });
  }

  await app.listen(config.PORT);
  app
    .get(Logger)
    .log(
      `Leaves API ${config.APP_VERSION} started (${config.NODE_ENV}) on port ${config.PORT}`,
    );
}

void bootstrap();
