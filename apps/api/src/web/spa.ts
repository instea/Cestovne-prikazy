import { existsSync } from 'node:fs';
import { join, sep } from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import express, {
  type NextFunction,
  type Request,
  type Response,
} from 'express';

/** Image path of the built SPA (OPS-03). */
export const DEFAULT_STATIC_ROOT = '/opt/app/public';

/**
 * Where the SPA is served from without an explicit root: always the image
 * path in production; with `NODE_ENV=test` only when that path exists, i.e.
 * when the production image runs for the Playwright suite (TST-03); never
 * in development (Vite serves the SPA) or in tests outside the image.
 */
export function defaultStaticRoot(
  nodeEnv: 'production' | 'development' | 'test',
  exists: (path: string) => boolean = existsSync,
): string | undefined {
  if (nodeEnv === 'production') return DEFAULT_STATIC_ROOT;
  if (nodeEnv === 'test' && exists(DEFAULT_STATIC_ROOT)) {
    return DEFAULT_STATIC_ROOT;
  }
  return undefined;
}

const IMMUTABLE = 'public, max-age=31536000, immutable';

/** Case-insensitive like Express routing (`/API/...` reaches the API). */
export function isBackendPath(path: string): boolean {
  const p = path.toLowerCase();
  return p === '/api' || p.startsWith('/api/') || p === '/health-check';
}

/**
 * The middleware `registerSpa` mounted. NFR-01 / B9: these are the only
 * request handlers outside Nest controllers the route test
 * (`test/security/router-stack.int-spec.ts`) accepts; they serve static
 * files and `index.html` only, never API data.
 */
export const SPA_MIDDLEWARE: WeakSet<object> = new WeakSet();

/**
 * Serve the built SPA: files from `root`, hashed `assets/` cached forever,
 * and `index.html` (no-cache) for any other HTML GET outside the API.
 */
export function registerSpa(app: NestExpressApplication, root: string): void {
  const assetsDir = `${sep}assets${sep}`;
  const indexHtml = join(root, 'index.html');

  const files = express.static(root, {
    index: false,
    setHeaders(res, filePath) {
      res.setHeader(
        'Cache-Control',
        filePath.includes(assetsDir) ? IMMUTABLE : 'no-cache',
      );
    },
  });
  SPA_MIDDLEWARE.add(files);
  app.use(files);

  function spaFallback(req: Request, res: Response, next: NextFunction) {
    if (
      req.method !== 'GET' ||
      isBackendPath(req.path) ||
      !req.accepts('html')
    ) {
      next();
      return;
    }
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(indexHtml, (err) => {
      if (err) next(err);
    });
  }
  SPA_MIDDLEWARE.add(spaFallback);
  app.use(spaFallback);
}
