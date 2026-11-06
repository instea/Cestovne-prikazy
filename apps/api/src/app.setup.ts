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

/** `GET /api/attendence/...` (ATT-01), query string ignored. */
export function isAttendancePath(url: string | undefined): boolean {
  const path = (url ?? '').split('?')[0]!;
  return path === '/api/attendence' || path.startsWith('/api/attendence/');
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

  const corsOrigin =
    config.NODE_ENV === 'production'
      ? new URL(config.BASE_URL).origin
      : config.NODE_ENV === 'development'
        ? 'http://localhost:5173'
        : undefined;
  if (corsOrigin) {
    // ATT-01: the M2M attendance route sends no CORS headers at all.
    app.enableCors((req: { url?: string }, callback) => {
      callback(
        null,
        isAttendancePath(req.url)
          ? { origin: false }
          : { origin: [corsOrigin], credentials: true },
      );
    });
  }

  const staticRoot =
    options.staticRoot ??
    (config.NODE_ENV === 'production' ? DEFAULT_STATIC_ROOT : undefined);
  if (staticRoot) registerSpa(app, staticRoot);
}
