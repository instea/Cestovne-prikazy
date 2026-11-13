import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import {
  Controller,
  type DynamicModule,
  Get,
  Injectable,
  Module,
  Param,
  Req,
  Res,
} from '@nestjs/common';
import { ErrorCode } from '@leaves/shared/enums';
import type { OpenAPIObject } from '@nestjs/swagger';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Public } from '../auth/access.decorator';
import { AppException } from '../common/app-exception';
import type { AppConfig } from '../config/env.schema';
import {
  API_DOCS_JSON_PATH,
  API_DOCS_PATH,
  isApiDocsEnabled,
} from './api-docs.gate';

/**
 * DOC-02 / NFR-05: the API explorer as an ordinary Nest controller (access
 * `@Public()`, NFR-01), never `SwaggerModule.setup` (that mounts Express
 * handlers outside the guards; `test/security/router-stack.int-spec.ts`).
 * Registered only when `isApiDocsEnabled` (not in production), so there
 * the paths fall through to the global 404 `NOT_FOUND`.
 * - `GET /api/docs`: Swagger UI page;
 * - `GET /api/docs-json`: the OpenAPI document;
 * - `GET /api/docs/<asset>`: the Swagger UI files it loads (allowlist).
 * All URLs in the page are relative, so it also works behind a path prefix.
 */

/** The document, built on first use from the running app (`registerSwagger`). */
@Injectable()
export class ApiDocsStore {
  private build: (() => OpenAPIObject) | undefined;
  private document: OpenAPIObject | undefined;

  /** Sets how to build the document (once the app's modules are known). */
  use(build: () => OpenAPIObject): void {
    this.build = build;
    this.document = undefined;
  }

  get(): OpenAPIObject {
    if (!this.build) {
      throw new AppException(404, ErrorCode.NOT_FOUND, 'Route not found');
    }
    return (this.document ??= this.build());
  }
}

const UI_ROOT = dirname(
  createRequire(__filename).resolve('swagger-ui-dist/package.json'),
);

/** Swagger UI files the page loads, with their content type. */
const UI_ASSETS: ReadonlyMap<string, string> = new Map([
  ['swagger-ui.css', 'text/css; charset=utf-8'],
  ['swagger-ui-bundle.js', 'text/javascript; charset=utf-8'],
  ['swagger-ui-standalone-preset.js', 'text/javascript; charset=utf-8'],
  ['favicon-32x32.png', 'image/png'],
  ['favicon-16x16.png', 'image/png'],
]);

/** Our initializer (no inline script): reads the JSON URL from the page. */
const INITIALIZER_FILE = 'swagger-initializer.js';
const INITIALIZER = `window.addEventListener('load', function () {
  var root = document.getElementById('swagger-ui');
  window.ui = SwaggerUIBundle({
    url: root.getAttribute('data-url'),
    dom_id: '#swagger-ui',
    deepLinking: true,
    presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
    layout: 'StandaloneLayout',
  });
});
`;

const DOCS_NAME = API_DOCS_PATH.split('/').pop()!;
const JSON_NAME = API_DOCS_JSON_PATH.split('/').pop()!;

/**
 * The UI page. Asset and JSON URLs are relative to the page URL: from
 * `/api/docs` the assets are `docs/<file>`, from `/api/docs/` `<file>`.
 */
export function swaggerUiPage(trailingSlash: boolean): string {
  const assets = trailingSlash ? '' : `${DOCS_NAME}/`;
  const json = trailingSlash ? `../${JSON_NAME}` : JSON_NAME;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Leaves API</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="stylesheet" href="${assets}swagger-ui.css" />
    <link rel="icon" type="image/png" href="${assets}favicon-32x32.png" sizes="32x32" />
    <link rel="icon" type="image/png" href="${assets}favicon-16x16.png" sizes="16x16" />
  </head>
  <body>
    <div id="swagger-ui" data-url="${json}"></div>
    <script src="${assets}swagger-ui-bundle.js"></script>
    <script src="${assets}swagger-ui-standalone-preset.js"></script>
    <script src="${assets}${INITIALIZER_FILE}"></script>
  </body>
</html>
`;
}

@Public()
@ApiExcludeController()
@Controller('api')
export class ApiDocsController {
  constructor(private readonly store: ApiDocsStore) {}

  @Get(DOCS_NAME)
  ui(@Req() req: Request, @Res() res: Response): void {
    this.store.get(); // 404 until registered
    res
      .status(200)
      .set('Cache-Control', 'no-cache')
      .type('html')
      .send(swaggerUiPage(req.path.endsWith('/')));
  }

  @Get(JSON_NAME)
  json(@Res() res: Response): void {
    res.status(200).set('Cache-Control', 'no-cache').json(this.store.get());
  }

  @Get(`${DOCS_NAME}/:asset`)
  asset(@Param('asset') asset: string, @Res() res: Response): void {
    this.store.get();
    res.set('Cache-Control', 'no-cache');
    if (asset === INITIALIZER_FILE) {
      res.status(200).type('text/javascript; charset=utf-8').send(INITIALIZER);
      return;
    }
    const type = UI_ASSETS.get(asset);
    if (!type) {
      throw new AppException(404, ErrorCode.NOT_FOUND, 'Route not found');
    }
    // `root`: the dot-file check (on by default) sees only `asset`, not
    // the `.pnpm` directory of the install path.
    res.status(200).type(type).sendFile(asset, { root: UI_ROOT });
  }
}

/**
 * The explorer module: the controller only when `isApiDocsEnabled(config)`
 * (the same gate as `registerApiDocs`); the store always (empty when off).
 */
@Module({})
export class ApiDocsModule {
  static forRoot(config: Pick<AppConfig, 'NODE_ENV'>): DynamicModule {
    return {
      module: ApiDocsModule,
      controllers: isApiDocsEnabled(config) ? [ApiDocsController] : [],
      providers: [ApiDocsStore],
    };
  }
}
