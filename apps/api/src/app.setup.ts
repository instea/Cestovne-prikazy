import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { createValidationPipe } from './common/validation';
import type { AppConfig } from './config/env.schema';
import { type ApiDocsRegistrar, registerApiDocs } from './docs/api-docs';
import { DEFAULT_STATIC_ROOT, registerSpa } from './web/spa';

export interface SetupOptions {
  /** Serve the SPA from this directory (always in production). */
  staticRoot?: string;
  /** API explorer registrar (tests; default: DOC-02 Swagger), gated by NFR-05. */
  apiDocs?: ApiDocsRegistrar;
}

/**
 * `GET /api/attendence/...` (ATT-01), query string ignored. Case-insensitive
 * like Express routing, which serves `/API/Attendence/...` too.
 */
export function isAttendancePath(url: string | undefined): boolean {
  const path = (url ?? '').split('?')[0]!.toLowerCase();
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

  // NFR-05: only the app's own origin (dev: BASE_URL defaults to the Vite
  // server). Tests run without CORS unless they set NODE_ENV.
  const corsOrigin =
    config.NODE_ENV === 'test' ? undefined : new URL(config.BASE_URL).origin;
  if (corsOrigin) {
    // ATT-01: the M2M attendance route sends no CORS headers at all.
    // NFR-05: neither does a request (or preflight) from another origin.
    app.enableCors(
      (req: { url?: string; headers?: { origin?: string } }, callback) => {
        const allowed =
          !isAttendancePath(req.url) && req.headers?.origin === corsOrigin;
        callback(
          null,
          allowed
            ? { origin: [corsOrigin], credentials: true }
            : { origin: false },
        );
      },
    );
  }

  registerApiDocs(app, config, options.apiDocs);

  const staticRoot =
    options.staticRoot ??
    (config.NODE_ENV === 'production' ? DEFAULT_STATIC_ROOT : undefined);
  if (staticRoot) registerSpa(app, staticRoot);
}
