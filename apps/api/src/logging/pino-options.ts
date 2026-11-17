import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Options } from 'pino-http';
import type { AppConfig } from '../config/env.schema';
import { REDACTED, redactLogObject } from './redact';

/**
 * Header paths of the serialized `req` / `res` censored as `[Redacted]`
 * (SET-02). Every other credential-like field, at any depth, is redacted
 * by `redactLogObject` (`formatters`).
 */
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
];

const REQUEST_ID = /^[\w.-]{1,128}$/;

interface WithUser {
  user?: { id?: string };
}

export function buildPinoHttpOptions(config: AppConfig): Options {
  return {
    level: config.LOG_LEVEL,
    redact: { paths: REDACT_PATHS, censor: REDACTED },
    // NFR-02: credential-like field names at any depth.
    formatters: { log: redactLogObject },
    transport:
      config.NODE_ENV === 'development'
        ? { target: 'pino-pretty', options: { singleLine: true } }
        : undefined,
    // Probe noise (OPS-01): health checks are not request-logged; the
    // health service logs failures at warn.
    autoLogging: {
      ignore: (req: IncomingMessage) =>
        req.url?.startsWith('/health-check') ?? false,
    },
    genReqId(req: IncomingMessage, res: ServerResponse) {
      const header = req.headers['x-request-id'];
      const id =
        typeof header === 'string' && REQUEST_ID.test(header)
          ? header
          : randomUUID();
      res.setHeader('x-request-id', id);
      return id;
    },
    customProps(req: IncomingMessage) {
      const userId = (req as IncomingMessage & WithUser).user?.id;
      return userId === undefined ? {} : { userId };
    },
    customLogLevel(_req, res, err) {
      if (err || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
    serializers: {
      req(req: {
        id: unknown;
        method: string;
        url: string;
        headers: Record<string, unknown>;
      }) {
        return {
          id: req.id,
          method: req.method,
          path: req.url.split('?')[0],
          headers: {
            'user-agent': req.headers['user-agent'],
            authorization: req.headers.authorization,
            cookie: req.headers.cookie,
          },
        };
      },
      res(res: { statusCode: number; headers: Record<string, unknown> }) {
        return {
          statusCode: res.statusCode,
          headers: { 'set-cookie': res.headers['set-cookie'] },
        };
      },
    },
  };
}
