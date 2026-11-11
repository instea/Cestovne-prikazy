import { readFileSync } from 'node:fs';
import { ErrorCode } from '@leaves/shared/enums';
import type {
  OpenAPIObject,
  OperationObject,
  ReferenceObject,
  ResponseObject,
} from '@nestjs/swagger';
import { beforeAll, describe, expect, it } from 'vitest';
import { REFRESH_COOKIE } from '../../src/auth/refresh-token';
import { AttendanceParamError } from '../../src/attendance/attendance.errors';
import { API_DOCS_JSON_PATH, API_DOCS_PATH } from '../../src/docs/api-docs';
import { ERROR_EXAMPLE_MESSAGES } from '../../src/docs/api-errors';
import { generateOpenApiDocument, OPENAPI_FILE } from '../../src/docs/generate';
import { serializeOpenApi, TAGS } from '../../src/docs/openapi';
import { listDeclaredRoutes } from '../authz/routes';
import { useHttpFakes } from '../mocks/http-fakes';
import { useTestApp } from '../support/app';
import { m2mAuth } from '../support/m2m';

/**
 * DOC-02: the OpenAPI document served at `/api/docs-json` (development)
 * against the live app: every route of the Express router is documented
 * and every operation is a route; app API errors use `ErrorBody` and are
 * listed in the description; security follows the NFR-01 access level;
 * the attendance operation keeps the old contract. The committed
 * `docs/api/openapi.json` equals the served document and the generator's
 * output (no database). Explorer 200 / 404: test/security/hardening.int-spec.ts.
 */

const METHODS = ['get', 'head', 'post', 'put', 'patch', 'delete'] as const;
type Method = (typeof METHODS)[number];

interface Operation {
  method: Method;
  path: string;
  op: OperationObject;
}

const operationsOf = (doc: OpenAPIObject): Operation[] =>
  Object.entries(doc.paths).flatMap(([path, item]) =>
    METHODS.flatMap((method) => {
      const op = item[method];
      return op ? [{ method, path, op }] : [];
    }),
  );

/** Express `/a/:id` → OpenAPI `/a/{id}`. */
const openApiPath = (path: string) => path.replace(/:(\w+)/g, '{$1}');

const isExplorer = (path: string) =>
  path === `/${API_DOCS_PATH}` ||
  path.startsWith(`/${API_DOCS_PATH}/`) ||
  path === `/${API_DOCS_JSON_PATH}`;

const isRef = (x: unknown): x is ReferenceObject =>
  typeof x === 'object' && x !== null && '$ref' in x;

const ERROR_BODY = '#/components/schemas/ErrorBody';
const ATTENDANCE = '/api/attendence/{year}/{month}';
const NOT_FOUND_ROUTE = '{/*splat}';

interface RouteLayer {
  route?: { path: string; methods: Record<string, boolean> };
}

describe('OpenAPI document (DOC-02)', () => {
  const ctx = useTestApp({ env: { NODE_ENV: 'development' } });
  let doc: OpenAPIObject;

  beforeAll(async () => {
    const res = await ctx().request().get(`/${API_DOCS_JSON_PATH}`);
    expect(res.status).toBe(200);
    doc = res.body as OpenAPIObject;
  });

  it('is OpenAPI 3.1 with the DOC-02 tags', () => {
    expect(doc.openapi).toBe('3.1.0');
    expect(doc.tags?.map((t) => t.name)).toEqual([
      'auth',
      'users',
      'leaves',
      'summary',
      'audit',
      'gdpr',
      'attendance',
      'health',
    ]);
    const tags = new Set<string>(TAGS.map(([name]) => name));
    for (const { method, path, op } of operationsOf(doc)) {
      expect(op.tags, `${method} ${path}`).toHaveLength(1);
      expect(tags.has(op.tags![0]!), `${method} ${path}`).toBe(true);
      expect(op.summary, `${method} ${path}`).toBeTruthy();
    }
  });

  it('equals the committed docs/api/openapi.json (run `pnpm openapi:generate`)', () => {
    expect(serializeOpenApi(doc)).toBe(readFileSync(OPENAPI_FILE, 'utf8'));
  });

  it('documents every route of the Express router, and nothing else', () => {
    const stack = (
      ctx().app.getHttpAdapter().getInstance() as {
        router: { stack: RouteLayer[] };
      }
    ).router.stack;
    const registered = new Set<string>();
    for (const layer of stack) {
      // `{/*splat}`: Nest's not-found handler (all methods → 404), a
      // framework layer (test/security/router-stack.int-spec.ts).
      if (
        !layer.route ||
        isExplorer(layer.route.path) ||
        layer.route.path === NOT_FOUND_ROUTE
      )
        continue;
      for (const [method, on] of Object.entries(layer.route.methods)) {
        if (on && method !== '_all')
          registered.add(`${method} ${openApiPath(layer.route.path)}`);
      }
    }
    // The router list agrees with the controller metadata (same source).
    const declared = listDeclaredRoutes(ctx().app)
      .filter((r) => r.method !== 'HEAD' && !isExplorer(r.path))
      .map((r) => `${r.method.toLowerCase()} ${openApiPath(r.path)}`);
    expect([...registered].sort()).toEqual([...declared].sort());
    expect(registered.size).toBeGreaterThanOrEqual(20);

    const documented = operationsOf(doc).map((o) => `${o.method} ${o.path}`);
    // Route → operation (Express answers HEAD from each GET route; a `head`
    // operation is documented only where HEAD answers differently).
    expect(
      [...registered].filter((r) => !documented.includes(r)),
      'routes missing from the document',
    ).toEqual([]);
    // Operation → route.
    expect(
      documented.filter(
        (o) => !registered.has(o.startsWith('head ') ? `get ${o.slice(5)}` : o),
      ),
      'operations without a route',
    ).toEqual([]);
  });

  it('documents the HEAD that differs: GDPR export → 405 METHOD_NOT_ALLOWED', () => {
    const head = doc.paths['/api/admin/users/{id}/export']!.head!;
    const examples = (head.responses['405'] as ResponseObject).content![
      'application/json'
    ]!.examples!;
    expect(Object.keys(examples)).toEqual([ErrorCode.METHOD_NOT_ALLOWED]);
  });

  it('every non-2xx app API response references ErrorBody (not attendance)', () => {
    let checked = 0;
    for (const { method, path, op } of operationsOf(doc)) {
      if (!path.startsWith('/api/') || path === ATTENDANCE) continue;
      for (const [status, response] of Object.entries(op.responses)) {
        if (/^2/.test(status)) continue;
        const schema = (response as ResponseObject).content?.[
          'application/json'
        ]?.schema;
        expect(
          isRef(schema) && schema.$ref,
          `${method} ${path} ${status}`,
        ).toBe(ERROR_BODY);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(50);
  });

  it('lists every error code of an operation in its description, with an example', () => {
    for (const { method, path, op } of operationsOf(doc)) {
      const codes: string[] = [];
      for (const [status, response] of Object.entries(op.responses)) {
        const media = (response as ResponseObject).content?.[
          'application/json'
        ];
        if (!isRef(media?.schema) || media.schema.$ref !== ERROR_BODY) continue;
        for (const [code, example] of Object.entries(media.examples ?? {})) {
          expect(example).toMatchObject({
            value: { statusCode: Number(status), code },
          });
          codes.push(`- \`${code}\` (${status})`);
        }
      }
      for (const line of codes)
        expect(op.description ?? '', `${method} ${path}`).toContain(line);
      expect(
        (op.description ?? '').match(/^- `[A-Z_]+` \(\d+\)$/gm) ?? [],
        `${method} ${path}: description lists other codes`,
      ).toHaveLength(codes.length);
    }
  });

  it('documents 403 PAYLOAD_TOO_LARGE everywhere, 500 INTERNAL_ERROR on the app API', () => {
    for (const { method, path, op } of operationsOf(doc)) {
      const label = `${method} ${path}`;
      // Body limit: before routing, so on every route (also attendance).
      expect(op.description, label).toContain('`PAYLOAD_TOO_LARGE` (403)');
      const schema = (op.responses['403'] as ResponseObject).content?.[
        'application/json'
      ]?.schema;
      expect(isRef(schema) && schema.$ref, label).toBe(ERROR_BODY);
      expect(op.description?.includes('`INTERNAL_ERROR` (500)'), label).toBe(
        path.startsWith('/api/') && path !== ATTENDANCE,
      );
    }
  });

  it('security follows the access level (NFR-01) and its errors are listed', () => {
    const access = new Map(
      listDeclaredRoutes(ctx().app).map((r) => [
        `${r.method.toLowerCase()} ${openApiPath(r.path)}`,
        r.access,
      ]),
    );
    for (const { method, path, op } of operationsOf(doc)) {
      const level = access.get(`${method} ${path}`);
      const label = `${method} ${path} (${level})`;
      if (level === 'user' || level === 'admin') {
        expect(op.security, label).toEqual([{ bearer: [] }]);
        expect(op.description, label).toContain('`AUTH_REQUIRED` (401)');
        expect(op.description, label).toContain('`USER_DEACTIVATED` (401)');
        expect(op.description?.includes('`FORBIDDEN` (403)'), label).toBe(
          level === 'admin' || path === '/api/leaves/{id}',
        );
      } else if (level === 'm2m') {
        expect(op.security, label).toEqual([{ m2mBasic: [] }]);
      } else {
        expect(level, label).toBe('public');
        const cookie = ['/api/auth/refresh', '/api/auth/logout'].includes(path);
        expect(op.security, label).toEqual(
          path === '/api/auth/logout'
            ? [{ refreshCookie: [] }, {}]
            : cookie
              ? [{ refreshCookie: [] }]
              : [],
        );
      }
    }
  });

  it('defines the bearer, m2mBasic and refresh-cookie security schemes', () => {
    expect(doc.components?.securitySchemes).toMatchObject({
      bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      m2mBasic: { type: 'http', scheme: 'basic' },
      refreshCookie: { type: 'apiKey', in: 'cookie', name: REFRESH_COOKIE },
    });
  });

  it('defines ErrorBody as { statusCode, code, message }', () => {
    expect(doc.components?.schemas?.ErrorBody).toMatchObject({
      type: 'object',
      required: ['statusCode', 'code', 'message'],
      properties: {
        statusCode: { type: 'integer' },
        code: { type: 'string', enum: Object.values(ErrorCode) },
        message: { type: 'string' },
      },
    });
  });

  it('documents the attendance operation with the old contract (ATT-01)', () => {
    const op = doc.paths[ATTENDANCE]!.get!;
    expect(op.security).toEqual([{ m2mBasic: [] }]);
    expect(op.tags).toEqual(['attendance']);
    expect(op.parameters?.map((p) => !isRef(p) && p.name)).toEqual([
      'year',
      'month',
    ]);
    const res = op.responses as Record<string, ResponseObject>;
    expect(Object.keys(res)).toEqual(['200', '400', '401', '403', '500']);
    expect(res['200']!.content!['application/json']!.example).toMatchObject({
      start: '2026-12-01',
      end: '2026-12-31',
    });
    const bad = res['400']!.content!['application/json']!;
    expect(bad.schema).toEqual({
      $ref: '#/components/schemas/AttendanceError',
    });
    expect(
      Object.values(bad.examples ?? {}).map((e) => (e as { value: unknown }).value),
    ).toEqual([
      { message: AttendanceParamError.MONTH },
      { message: AttendanceParamError.YEAR },
    ]);
    // 401: empty body, no WWW-Authenticate.
    expect(res['401']!.content).toBeUndefined();
    expect(res['401']!.description).toContain('WWW-Authenticate');
    expect(res['500']!.content!['application/json']!.schema).toEqual({
      $ref: '#/components/schemas/AttendanceError',
    });
  });

  it('documents the health check (outside /api)', () => {
    const op = doc.paths['/health-check']!.get!;
    expect(op.tags).toEqual(['health']);
    expect(op.security).toEqual([]);
    expect(Object.keys(op.responses)).toEqual(['200', '403', '500']);
  });

  it('the generator builds the same document without a database', async () => {
    // Preview mode: no provider runs, so no MongoDB, SMTP or network.
    expect(serializeOpenApi(await generateOpenApiDocument())).toBe(
      serializeOpenApi(doc),
    );
  });
});

describe('documented answers match the app', () => {
  useHttpFakes();
  const ctx = useTestApp();

  it('attendance: an invalid month is the documented 400 body', async () => {
    const res = await ctx()
      .request()
      .get('/api/attendence/2024/x')
      .set('Authorization', m2mAuth());
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: AttendanceParamError.MONTH });
  });

  it.each([
    ['POST', '/api/auth/logout', {}],
    ['GET', '/api/attendence/2026/12', { Authorization: m2mAuth() }],
    ['GET', '/health-check', {}],
  ] as const)(
    '%s %s with a 200 KB JSON body → the documented 403 PAYLOAD_TOO_LARGE',
    async (method, path, headers) => {
      const agent = ctx().request();
      const res = await (method === 'POST' ? agent.post(path) : agent.get(path))
        .set(headers)
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ x: 'x'.repeat(200 * 1024) }));
      expect(res.status).toBe(403);
      expect(res.body).toEqual({
        statusCode: 403,
        code: ErrorCode.PAYLOAD_TOO_LARGE,
        message: ERROR_EXAMPLE_MESSAGES.PAYLOAD_TOO_LARGE,
      });
    },
  );
});
