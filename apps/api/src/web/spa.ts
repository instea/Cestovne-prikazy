import { join, sep } from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import express, {
  type NextFunction,
  type Request,
  type Response,
} from 'express';

/** Image path of the built SPA (OPS-03). */
export const DEFAULT_STATIC_ROOT = '/opt/app/public';

const IMMUTABLE = 'public, max-age=31536000, immutable';

function isBackendPath(path: string): boolean {
  return (
    path === '/api' || path.startsWith('/api/') || path === '/health-check'
  );
}

/**
 * Serve the built SPA: files from `root`, hashed `assets/` cached forever,
 * and `index.html` (no-cache) for any other HTML GET outside the API.
 */
export function registerSpa(app: NestExpressApplication, root: string): void {
  const assetsDir = `${sep}assets${sep}`;
  const indexHtml = join(root, 'index.html');

  app.use(
    express.static(root, {
      index: false,
      setHeaders(res, filePath) {
        res.setHeader(
          'Cache-Control',
          filePath.includes(assetsDir) ? IMMUTABLE : 'no-cache',
        );
      },
    }),
  );

  app.use((req: Request, res: Response, next: NextFunction) => {
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
  });
}
