import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { createValidationPipe } from './common/validation';
import type { AppConfig } from './config/env.schema';
import { DEFAULT_STATIC_ROOT, registerSpa } from './web/spa';

export interface SetupOptions {
  /** Serve the SPA from this directory (always in production). */
  staticRoot?: string;
}

/** Cross-cutting HTTP setup shared by `main.ts` and the integration tests. */
export function configureApp(
  app: NestExpressApplication,
  config: AppConfig,
  options: SetupOptions = {},
): void {
  app.useLogger(app.get(Logger));
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new AllExceptionsFilter());

  if (config.NODE_ENV === 'production') {
    app.enableCors({
      origin: [new URL(config.BASE_URL).origin],
      credentials: true,
    });
  } else if (config.NODE_ENV === 'development') {
    app.enableCors({ origin: ['http://localhost:5173'], credentials: true });
  }

  const staticRoot =
    options.staticRoot ??
    (config.NODE_ENV === 'production' ? DEFAULT_STATIC_ROOT : undefined);
  if (staticRoot) registerSpa(app, staticRoot);
}
