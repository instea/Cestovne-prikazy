import { type INestApplication, SetMetadata } from '@nestjs/common';
import { METHOD_METADATA } from '@nestjs/common/constants';
import { MetadataScanner, ModulesContainer, Reflector } from '@nestjs/core';
import { ErrorCode } from '@leaves/shared/enums';
import {
  DocumentBuilder,
  type OpenAPIObject,
  type OperationObject,
  type PathItemObject,
  type ResponseObject,
  SwaggerModule,
} from '@nestjs/swagger';
import { type AccessLevel, resolveAccess } from '../auth/access.decorator';
import { REFRESH_COOKIE } from '../auth/refresh-token';
import {
  ADMIN_ERRORS,
  API_ERRORS,
  type ApiError,
  BODY_LIMIT_ERRORS,
  INTERNAL_ERRORS,
  ERROR_EXAMPLE_MESSAGES,
  SESSION_ERRORS,
} from './api-errors';
import { ref, SCHEMAS } from './schemas';

/**
 * DOC-02: the OpenAPI 3.1 document of the app API and the M2M attendance
 * API, built from the controllers' decorators (`@nestjs/swagger`) and then
 * completed from the app's own metadata, so it cannot drift from what runs:
 * - `security` from the route's resolved NFR-01 access level (`bearer` for
 *   `user` / `admin`, `m2mBasic` for `m2m`, none or the refresh cookie for
 *   `public`);
 * - error responses (`ErrorBody`) from the access level, `@ApiErrors(...)`
 *   and the errors shared by every route (`api-errors.ts`), listed in the
 *   description;
 * - the response component schemas (`schemas.ts`).
 * The result has a stable key order (`normalizeDocument`), so the committed
 * `docs/api/openapi.json` only changes with the API.
 */

/** Version of the API contract (not the app release version). */
export const API_DOC_VERSION = '1.0.0';

export const SECURITY = {
  bearer: 'bearer',
  m2mBasic: 'm2mBasic',
  refreshCookie: 'refreshCookie',
} as const;

export const TAGS = [
  ['auth', 'Google sign-in, session refresh and logout (AUTH-01..05).'],
  ['users', 'User administration and own profile (USR-01..04).'],
  ['leaves', 'Create, list, delete, approve and reject leaves.'],
  ['summary', "The caller's leave summary (SUM-01)."],
  ['audit', 'Audit log (NFR-06), admins only.'],
  ['gdpr', 'GDPR export and erasure of one user (NFR-07, NFR-08).'],
  [
    'attendance',
    'Monthly attendance for the M2M client (ATT-01, old contract).',
  ],
  ['health', 'Readiness probe (OPS-01), outside `/api`.'],
] as const;

export type Tag = (typeof TAGS)[number][0];

/** Extra `head` operation (only where HEAD differs from the GET answer). */
export interface HeadOperation {
  summary: string;
  description: string;
  errors: readonly ApiError[];
}

const API_HEAD = 'docs:head';

/**
 * Documents the HEAD request Express routes to this GET handler, when it
 * answers differently (e.g. 405); other GET routes answer HEAD like GET.
 */
export const ApiHeadOperation = (head: HeadOperation) =>
  SetMetadata(API_HEAD, head);

interface HandlerDocs {
  access: AccessLevel | undefined;
  errors: readonly ApiError[];
  head: HeadOperation | undefined;
}

/** Operation id: `<Controller class>_<handler method>` (Nest default). */
const operationId = (controller: string, method: string) =>
  `${controller}_${method}`;

/** Per operation id: what the controllers declare beyond swagger metadata. */
function handlerDocs(app: INestApplication): Map<string, HandlerDocs> {
  const scanner = new MetadataScanner();
  const reflector = new Reflector();
  const docs = new Map<string, HandlerDocs>();
  for (const module of app.get(ModulesContainer).values()) {
    for (const wrapper of module.controllers.values()) {
      const controller = wrapper.metatype as
        (abstract new () => unknown) | null;
      if (!controller) continue;
      const prototype = controller.prototype as Record<string, unknown>;
      for (const name of scanner.getAllMethodNames(prototype)) {
        const handler = prototype[name];
        if (typeof handler !== 'function') continue;
        if (Reflect.getMetadata(METHOD_METADATA, handler) === undefined)
          continue;
        docs.set(operationId(controller.name, name), {
          access: resolveAccess(reflector, handler, controller),
          errors:
            (Reflect.getMetadata(API_ERRORS, handler) as
              readonly ApiError[] | undefined) ?? [],
          head: Reflect.getMetadata(API_HEAD, handler) as
            HeadOperation | undefined,
        });
      }
    }
  }
  return docs;
}

function documentConfig() {
  const builder = new DocumentBuilder()
    .setOpenAPIVersion('3.1.0')
    .setTitle('Leaves API')
    .setDescription(
      [
        'REST API of the Leaves app (app API under `/api`), the M2M attendance API ' +
          '(`/api/attendence/...`, old contract) and the readiness probe.',
        '',
        'App API errors answer with `ErrorBody` `{ statusCode, code, message }`; ' +
          'each operation lists its possible `code` values. Every route (also ' +
          'attendance and the health check) answers 403 `PAYLOAD_TOO_LARGE` with ' +
          '`ErrorBody` to a JSON body over 100 KB, before authentication; app API ' +
          'routes answer 500 `INTERNAL_ERROR` to an unexpected failure. An unknown ' +
          '`/api` route is 404 `NOT_FOUND`.',
        '',
        'Paths are relative to the app URL (`BASE_URL`). The interactive explorer ' +
          '(`/api/docs`, `/api/docs-json`) exists only outside production.',
      ].join('\n'),
    )
    .setVersion(API_DOC_VERSION)
    .addServer('/', 'The app itself (same origin)')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description:
          'Access token from `POST /api/auth/google` or `POST /api/auth/refresh` (AUTH-02).',
      },
      SECURITY.bearer,
    )
    .addBasicAuth(
      {
        type: 'http',
        scheme: 'basic',
        description:
          'M2M credentials (`M2M_USERNAME` / `M2M_PASSWORD`); attendance only. ' +
          'A failure is 401 with an empty body and no `WWW-Authenticate`.',
      },
      SECURITY.m2mBasic,
    )
    .addCookieAuth(
      REFRESH_COOKIE,
      {
        type: 'apiKey',
        in: 'cookie',
        name: REFRESH_COOKIE,
        description:
          'Rotating refresh token (AUTH-02): HttpOnly, Secure, SameSite=Strict, ' +
          'path `<BASE_URL path>/api/auth`. Set by the login and every refresh.',
      },
      SECURITY.refreshCookie,
    );
  for (const [name, description] of TAGS) builder.addTag(name, description);
  return builder.build();
}

const isApiPath = (path: string) => path === '/api' || path.startsWith('/api/');

const OPERATION_METHODS = [
  'get',
  'head',
  'post',
  'put',
  'patch',
  'delete',
  'options',
] as const;

/**
 * Errors of one operation: access level, declared, shared; deduplicated and
 * ordered by status (stable, so the declared order stays within a status).
 */
function operationErrors(
  path: string,
  access: AccessLevel | undefined,
  declared: readonly ApiError[],
): ApiError[] {
  const fromAccess =
    access === 'admin' ? ADMIN_ERRORS : access === 'user' ? SESSION_ERRORS : [];
  const internal = isApiPath(path) && access !== 'm2m' ? INTERNAL_ERRORS : [];
  const seen = new Set<string>();
  return [...fromAccess, ...declared, ...BODY_LIMIT_ERRORS, ...internal]
    .filter(([status, code]) => {
      const key = `${status} ${code}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort(([a], [b]) => a - b);
}

function errorResponses(
  errors: readonly ApiError[],
): Record<string, ResponseObject> {
  const byStatus = new Map<number, ErrorCode[]>();
  for (const [status, code] of errors)
    byStatus.set(status, [...(byStatus.get(status) ?? []), code]);
  const responses: Record<string, ResponseObject> = {};
  for (const [status, codes] of byStatus) {
    responses[String(status)] = {
      description: codes.map((c) => `\`${c}\``).join(', '),
      content: {
        'application/json': {
          schema: ref('ErrorBody'),
          examples: Object.fromEntries(
            codes.map((code) => [
              code,
              {
                summary: code,
                value: {
                  statusCode: status,
                  code,
                  message: ERROR_EXAMPLE_MESSAGES[code],
                },
              },
            ]),
          ),
        },
      },
    };
  }
  return responses;
}

function describeErrors(
  description: string | undefined,
  errors: readonly ApiError[],
): string | undefined {
  if (errors.length === 0) return description;
  const list = errors.map(([status, code]) => `- \`${code}\` (${status})`);
  const intro = description ? `${description}\n\n` : '';
  return `${intro}**Error codes**:\n\n${list.join('\n')}`;
}

/** Adds security, error responses and descriptions to one operation. */
function completeOperation(
  path: string,
  op: OperationObject,
  docs: HandlerDocs,
  errors: readonly ApiError[],
): void {
  switch (docs.access) {
    case 'user':
    case 'admin':
      op.security = [{ [SECURITY.bearer]: [] }];
      break;
    case 'm2m':
      op.security = [{ [SECURITY.m2mBasic]: [] }];
      break;
    default:
      // `public`: no credentials, unless declared (the refresh cookie).
      op.security ??= [];
  }
  const all = operationErrors(path, docs.access, errors);
  for (const [status, response] of Object.entries(errorResponses(all))) {
    if (op.responses[status]) {
      throw new Error(
        `OpenAPI: ${op.operationId} declares response ${status} and error codes for it; use @ApiErrors only`,
      );
    }
    op.responses[status] = response;
  }
  const description = describeErrors(op.description, all);
  if (description !== undefined) op.description = description;
}

/** The documented HEAD of a GET operation (`@ApiHeadOperation`). */
function headOperation(
  get: OperationObject,
  head: HeadOperation,
): OperationObject {
  return {
    operationId: `${get.operationId}_head`,
    summary: head.summary,
    description: head.description,
    ...(get.parameters ? { parameters: get.parameters } : {}),
    ...(get.tags ? { tags: get.tags } : {}),
    responses: {},
  };
}

function completeDocument(
  document: OpenAPIObject,
  docs: ReadonlyMap<string, HandlerDocs>,
): OpenAPIObject {
  for (const [path, item] of Object.entries(document.paths)) {
    // Snapshot: the loop adds `head` operations.
    const operations = OPERATION_METHODS.flatMap((method) => {
      const op = item[method];
      return op ? [[method, op] as const] : [];
    });
    for (const [method, op] of operations) {
      const handler = docs.get(op.operationId ?? '');
      if (!handler) {
        throw new Error(`OpenAPI: no handler for operation ${op.operationId}`);
      }
      completeOperation(path, op, handler, handler.errors);
      if (handler.head && method === 'get') {
        const head = headOperation(op, handler.head);
        completeOperation(path, head, handler, handler.head.errors);
        item.head = head;
      }
    }
  }
  const schemas = (document.components ??= {}).schemas ?? {};
  // The request DTO schemas (from `@ApiProperty`): the global validation
  // pipe refuses unknown properties (400 `VALIDATION_FAILED`).
  for (const schema of Object.values(schemas)) {
    if ('type' in schema && schema.type === 'object')
      schema.additionalProperties ??= false;
  }
  for (const [name, schema] of Object.entries(SCHEMAS)) {
    // Enum schemas the DTOs name (`enumName`) must equal ours.
    if (
      name in schemas &&
      JSON.stringify(schemas[name]) !== JSON.stringify(schema)
    ) {
      throw new Error(
        `OpenAPI: schema ${name} defined twice, differently: ${JSON.stringify(schemas[name])}`,
      );
    }
    schemas[name] = schema;
  }
  document.components.schemas = schemas;
  return document;
}

const sortedEntries = <T>(record: Record<string, T>) =>
  Object.entries(record).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

const sortKeys = <T>(record: Record<string, T> | undefined) =>
  record && Object.fromEntries(sortedEntries(record));

/**
 * Stable key order: paths, schemas, security schemes and responses sorted;
 * operations in `OPERATION_METHODS` order. Everything else keeps the
 * (deterministic) order of the decorators and `schemas.ts`.
 */
export function normalizeDocument(document: OpenAPIObject): OpenAPIObject {
  const paths: Record<string, PathItemObject> = {};
  for (const [path, item] of sortedEntries(document.paths)) {
    const ordered: PathItemObject = {};
    for (const [key, value] of Object.entries(item)) {
      if (!(OPERATION_METHODS as readonly string[]).includes(key))
        (ordered as Record<string, unknown>)[key] = value;
    }
    for (const method of OPERATION_METHODS) {
      const op = item[method];
      if (op) ordered[method] = { ...op, responses: sortKeys(op.responses)! };
    }
    paths[path] = ordered;
  }
  const components = document.components ?? {};
  return {
    openapi: document.openapi,
    // DocumentBuilder's empty `contact` dropped.
    info: { ...document.info, contact: undefined },
    servers: document.servers,
    tags: document.tags,
    paths,
    components: {
      ...components,
      securitySchemes: sortKeys(components.securitySchemes),
      schemas: sortKeys(components.schemas),
    },
  };
}

/** The finished document of `app` (no routes are served by this). */
export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const document = SwaggerModule.createDocument(app, documentConfig(), {
    operationIdFactory: operationId,
    autoTagControllers: false,
  });
  return normalizeDocument(completeDocument(document, handlerDocs(app)));
}

/** The committed file's bytes: 2-space JSON and a final newline. */
export const serializeOpenApi = (document: OpenAPIObject): string =>
  `${JSON.stringify(document, null, 2)}\n`;
