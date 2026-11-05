import { z } from 'zod';

/**
 * Environment configuration (SET-02). Validated once at startup; any problem
 * stops the process before it connects to the database.
 */

const NODE_ENVS = ['production', 'development', 'test'] as const;
const LOG_LEVELS = [
  'fatal',
  'error',
  'warn',
  'info',
  'debug',
  'trace',
] as const;
const VERIFIERS = ['google', 'fake'] as const;

export type NodeEnv = (typeof NODE_ENVS)[number];
export type LogLevel = (typeof LOG_LEVELS)[number];

export interface AppConfig {
  NODE_ENV: NodeEnv;
  PORT: number;
  BASE_URL: string;
  MONGO_URL: string;
  HOSTED_DOMAIN: string;
  GOOGLE_CLIENT_ID: string;
  JWT_ACCESS_SECRET: string;
  ACCESS_TOKEN_TTL_SECONDS: number;
  REFRESH_TOKEN_TTL_SECONDS: number;
  AUTH_GOOGLE_VERIFIER: (typeof VERIFIERS)[number];
  SMTP_HOST: string;
  SMTP_PORT: number;
  SMTP_SECURE: boolean;
  SMTP_USER: string | undefined;
  SMTP_PASSWORD: string | undefined;
  MAIL_SENDER: string;
  APPROVAL_MAIL_RECEIVER: string;
  DEFAULT_TIMEZONE: string;
  M2M_USERNAME: string | undefined;
  M2M_PASSWORD: string | undefined;
  SSO_URI: string | undefined;
  SSO_USERNAME: string | undefined;
  SSO_PASSWORD: string | undefined;
  TOGGL_REPORTS_BASE_URL: string;
  LOG_LEVEL: LogLevel;
  APP_VERSION: string;
  LEGACY_MONGO_URL: string | undefined;
}

export class ConfigError extends Error {
  constructor(readonly problems: string[]) {
    super(`Invalid configuration: ${problems.join('; ')}`);
    this.name = 'ConfigError';
  }
}

type Env = Record<string, string | undefined>;

const emptyToUndefined = (v: unknown): unknown => (v === '' ? undefined : v);

function isAbsoluteUrl(v: string): boolean {
  try {
    new URL(v);
    return true;
  } catch {
    return false;
  }
}

function isTimeZone(v: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: v });
    return true;
  } catch {
    return false;
  }
}

/** A string field; `required` decides whether a missing value is an error. */
function field<T extends z.ZodType<unknown, string>>(
  key: string,
  required: boolean,
  inner: T,
) {
  const base = required
    ? z.string({ error: `${key} is required` }).pipe(inner)
    : z.string().pipe(inner).optional();
  return z.preprocess(emptyToUndefined, base);
}

const text = () => z.string();

const positiveInt = (key: string) =>
  z
    .string()
    .refine((v) => /^\d+$/.test(v) && Number(v) > 0, {
      error: `${key} must be a positive integer`,
    })
    .transform(Number);

const oneOf = <const T extends readonly [string, ...string[]]>(
  key: string,
  values: T,
) => z.enum(values, { error: `${key} must be one of ${values.join(', ')}` });

const url = (key: string) =>
  z.string().refine(isAbsoluteUrl, { error: `${key} must be an absolute URL` });

function schemaFor(nodeEnv: NodeEnv) {
  const prod = nodeEnv === 'production';
  return z
    .object({
      NODE_ENV: field('NODE_ENV', false, oneOf('NODE_ENV', NODE_ENVS)),
      PORT: field('PORT', false, positiveInt('PORT')),
      BASE_URL: field('BASE_URL', prod, url('BASE_URL')),
      MONGO_URL: field('MONGO_URL', prod, text()),
      HOSTED_DOMAIN: field('HOSTED_DOMAIN', true, text()),
      GOOGLE_CLIENT_ID: field('GOOGLE_CLIENT_ID', true, text()),
      JWT_ACCESS_SECRET: field(
        'JWT_ACCESS_SECRET',
        true,
        z.string().refine((v) => Buffer.byteLength(v, 'utf8') >= 32, {
          error: 'JWT_ACCESS_SECRET must be at least 32 bytes',
        }),
      ),
      ACCESS_TOKEN_TTL_SECONDS: field(
        'ACCESS_TOKEN_TTL_SECONDS',
        false,
        positiveInt('ACCESS_TOKEN_TTL_SECONDS'),
      ),
      REFRESH_TOKEN_TTL_SECONDS: field(
        'REFRESH_TOKEN_TTL_SECONDS',
        false,
        positiveInt('REFRESH_TOKEN_TTL_SECONDS'),
      ),
      AUTH_GOOGLE_VERIFIER: field(
        'AUTH_GOOGLE_VERIFIER',
        false,
        oneOf('AUTH_GOOGLE_VERIFIER', VERIFIERS),
      ),
      SMTP_HOST: field('SMTP_HOST', prod, text()),
      SMTP_PORT: field('SMTP_PORT', prod, positiveInt('SMTP_PORT')),
      SMTP_SECURE: field(
        'SMTP_SECURE',
        prod,
        oneOf('SMTP_SECURE', ['true', 'false']).transform((v) => v === 'true'),
      ),
      SMTP_USER: field('SMTP_USER', prod, text()),
      SMTP_PASSWORD: field('SMTP_PASSWORD', prod, text()),
      MAIL_SENDER: field('MAIL_SENDER', prod, text()),
      APPROVAL_MAIL_RECEIVER: field('APPROVAL_MAIL_RECEIVER', prod, text()),
      DEFAULT_TIMEZONE: field(
        'DEFAULT_TIMEZONE',
        false,
        z.string().refine(isTimeZone, {
          error: 'DEFAULT_TIMEZONE must be a valid IANA timezone',
        }),
      ),
      M2M_USERNAME: field('M2M_USERNAME', prod, text()),
      M2M_PASSWORD: field('M2M_PASSWORD', prod, text()),
      SSO_URI: field('SSO_URI', prod, url('SSO_URI')),
      SSO_USERNAME: field('SSO_USERNAME', prod, text()),
      SSO_PASSWORD: field('SSO_PASSWORD', prod, text()),
      TOGGL_REPORTS_BASE_URL: field(
        'TOGGL_REPORTS_BASE_URL',
        false,
        url('TOGGL_REPORTS_BASE_URL'),
      ),
      LOG_LEVEL: field('LOG_LEVEL', false, oneOf('LOG_LEVEL', LOG_LEVELS)),
      APP_VERSION: field('APP_VERSION', false, text()),
      LEGACY_MONGO_URL: field('LEGACY_MONGO_URL', false, text()),
    })
    .superRefine((v, ctx) => {
      if (prod && v.AUTH_GOOGLE_VERIFIER === 'fake') {
        ctx.addIssue({
          code: 'custom',
          message: 'AUTH_GOOGLE_VERIFIER=fake is not allowed in production',
        });
      }
    });
}

/** Validate `env` and apply defaults. Throws `ConfigError` listing every problem. */
export function loadConfig(env: Env): AppConfig {
  const rawNodeEnv = emptyToUndefined(env.NODE_ENV) ?? 'development';
  const nodeEnv: NodeEnv = (NODE_ENVS as readonly unknown[]).includes(
    rawNodeEnv,
  )
    ? (rawNodeEnv as NodeEnv)
    : 'development';

  const result = schemaFor(nodeEnv).safeParse(env);
  if (!result.success) {
    throw new ConfigError(result.error.issues.map((i) => i.message));
  }
  const v = result.data;
  // Required values are guaranteed by the schema; `!` marks those cases.
  return {
    NODE_ENV: nodeEnv,
    PORT: v.PORT ?? 4100,
    BASE_URL: v.BASE_URL ?? 'http://localhost:5173',
    MONGO_URL: v.MONGO_URL ?? 'mongodb://localhost:27017/cestaky',
    HOSTED_DOMAIN: v.HOSTED_DOMAIN!,
    GOOGLE_CLIENT_ID: v.GOOGLE_CLIENT_ID!,
    JWT_ACCESS_SECRET: v.JWT_ACCESS_SECRET!,
    ACCESS_TOKEN_TTL_SECONDS: v.ACCESS_TOKEN_TTL_SECONDS ?? 900,
    REFRESH_TOKEN_TTL_SECONDS: v.REFRESH_TOKEN_TTL_SECONDS ?? 604800,
    AUTH_GOOGLE_VERIFIER: v.AUTH_GOOGLE_VERIFIER ?? 'google',
    SMTP_HOST: v.SMTP_HOST ?? 'localhost',
    SMTP_PORT: v.SMTP_PORT ?? 1025,
    SMTP_SECURE: v.SMTP_SECURE ?? false,
    SMTP_USER: v.SMTP_USER,
    SMTP_PASSWORD: v.SMTP_PASSWORD,
    MAIL_SENDER: v.MAIL_SENDER ?? 'leaves@localhost',
    APPROVAL_MAIL_RECEIVER: v.APPROVAL_MAIL_RECEIVER ?? 'approver@localhost',
    DEFAULT_TIMEZONE: v.DEFAULT_TIMEZONE ?? 'Europe/Bratislava',
    M2M_USERNAME: v.M2M_USERNAME,
    M2M_PASSWORD: v.M2M_PASSWORD,
    SSO_URI: v.SSO_URI,
    SSO_USERNAME: v.SSO_USERNAME,
    SSO_PASSWORD: v.SSO_PASSWORD,
    TOGGL_REPORTS_BASE_URL:
      v.TOGGL_REPORTS_BASE_URL ?? 'https://api.track.toggl.com/reports/api/v3',
    LOG_LEVEL: v.LOG_LEVEL ?? (nodeEnv === 'development' ? 'debug' : 'info'),
    APP_VERSION: v.APP_VERSION ?? '0.0.0-dev',
    LEGACY_MONGO_URL: v.LEGACY_MONGO_URL,
  };
}
