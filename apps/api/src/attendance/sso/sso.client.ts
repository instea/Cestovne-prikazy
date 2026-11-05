import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { APP_CONFIG } from '../../config/config.module';
import type { AppConfig } from '../../config/env.schema';
import { discard } from '../../common/discard-body';

/** One flattened SSO directory record (ATT-02). Values are kept as delivered. */
export interface SsoUser {
  name: unknown;
  email: unknown;
  /** Known keys: togglUserId, togglWorkspaceId, togglApiToken, employee, contractType. */
  [key: string]: unknown;
}

/** Any SSO failure; ATT-01 maps it to the old 500 message, NFR-08 to 503. */
export class SsoUnavailableError extends Error {
  static readonly MESSAGE = 'Cannot get data from SSO, try again later.';

  constructor(readonly reason: string) {
    super(SsoUnavailableError.MESSAGE);
    this.name = 'SsoUnavailableError';
  }
}

export const SSO_TIMEOUT_MS = 30_000;
const MAX_REDIRECTS = 5;

export type FetchFn = (url: URL, init?: RequestInit) => Promise<Response>;
export const SSO_FETCH = Symbol('SSO_FETCH');

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null;

/** Old flattening: `{ name, email }`, then each `keys[i]` as `key: value`. */
export function parseDirectory(body: unknown): SsoUser[] {
  if (!Array.isArray(body))
    throw new SsoUnavailableError('body is not an array');
  return body.map((user: unknown) => {
    if (!isObject(user))
      throw new SsoUnavailableError('element is not an object');
    if (!Array.isArray(user.keys))
      throw new SsoUnavailableError('element keys is not an array');
    const record: SsoUser = { name: user.name, email: user.email };
    for (const kv of user.keys as unknown[]) {
      if (!isObject(kv))
        throw new SsoUnavailableError('key/value is not an object');
      record[String(kv.key)] = kv.value;
    }
    return record;
  });
}

/** In the attendance output: `togglUserId` truthy (`''` excluded, `'0'` included). */
export const isListed = (u: SsoUser): boolean => Boolean(u.togglUserId);

/** Toggl and leave data only for `employee === '1'` (strict string). */
export const isEmployee = (u: SsoUser): boolean => u.employee === '1';

type SsoConfig = Pick<AppConfig, 'SSO_URI' | 'SSO_USERNAME' | 'SSO_PASSWORD'>;

@Injectable()
export class SsoClient {
  private readonly logger = new Logger(SsoClient.name);
  private readonly fetchFn: FetchFn;

  constructor(
    @Inject(APP_CONFIG) private readonly config: SsoConfig,
    @Optional() @Inject(SSO_FETCH) fetchFn?: FetchFn,
  ) {
    this.fetchFn = fetchFn ?? ((url, init) => fetch(url, init));
  }

  /** `GET SSO_URI` once and parse. Throws `SsoUnavailableError` on any failure. */
  async fetchDirectory(): Promise<SsoUser[]> {
    try {
      return parseDirectory(await this.request());
    } catch (e) {
      const error =
        e instanceof SsoUnavailableError
          ? e
          : new SsoUnavailableError(errorClass(e));
      // Never log headers or body (togglApiToken values are secrets).
      this.logger.warn(`SSO directory unavailable: ${error.reason}`);
      throw error;
    }
  }

  /** NFR-08 guard: any record's string `email` equals `email` (trimmed, lowercased). */
  async isEmailListed(email: string): Promise<boolean> {
    const wanted = email.trim().toLowerCase();
    const users = await this.fetchDirectory();
    return users.some(
      (u) =>
        typeof u.email === 'string' && u.email.trim().toLowerCase() === wanted,
    );
  }

  private async request(): Promise<unknown> {
    const { SSO_URI, SSO_USERNAME = '', SSO_PASSWORD = '' } = this.config;
    if (!SSO_URI) throw new SsoUnavailableError('SSO_URI is not configured');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SSO_TIMEOUT_MS);
    const origin = new URL(SSO_URI).origin;
    const authorization = `Basic ${Buffer.from(`${SSO_USERNAME}:${SSO_PASSWORD}`).toString('base64')}`;
    try {
      let url = new URL(SSO_URI);
      for (let redirects = 0; ; redirects++) {
        const headers: Record<string, string> = { Accept: 'application/json' };
        if (url.origin === origin) headers.Authorization = authorization;
        const res = await this.fetchFn(url, {
          method: 'GET',
          headers,
          redirect: 'manual',
          signal: controller.signal,
        });
        const location = res.headers.get('location');
        if (res.status >= 300 && res.status < 400 && location) {
          await discard(res);
          if (redirects === MAX_REDIRECTS)
            throw new SsoUnavailableError('too many redirects');
          url = new URL(location, url);
          continue;
        }
        if (!res.ok) {
          await discard(res);
          throw new SsoUnavailableError(`HTTP ${res.status}`);
        }
        if (!/[/+]json\b/i.test(res.headers.get('content-type') ?? '')) {
          await discard(res);
          throw new SsoUnavailableError('response is not JSON');
        }
        try {
          return JSON.parse(await res.text()) as unknown;
        } catch {
          throw new SsoUnavailableError('invalid JSON');
        }
      }
    } finally {
      clearTimeout(timer);
    }
  }
}

function errorClass(e: unknown): string {
  return e instanceof Error ? e.name : typeof e;
}
