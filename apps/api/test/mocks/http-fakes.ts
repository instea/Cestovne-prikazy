import { randomUUID } from 'node:crypto';
import {
  type CryptoKey,
  exportJWK,
  exportSPKI,
  generateKeyPair,
  type JWK,
} from 'jose';
import { http, HttpResponse, type JsonBodyType, passthrough } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { TEST_SSO, TEST_TOGGL } from '../support/env';
import {
  basicAuth,
  isRecord,
  isTogglScript,
  togglBodyProblem,
  type TogglScript,
} from './contract.mts';
import {
  type IdTokenClaims,
  type IdTokenOptions,
  makeIdToken,
} from '../support/google';
import { mailpitEndpoints } from '../support/mailbox';
import { loadContractFixture } from './fixtures';

/**
 * TST-02 / TST-04 contract fakes (MSW node) for the three external
 * integrations, so the real client code paths run unchanged:
 * - SSO meta API on `TEST_SSO.uri`: `GET` with exact Basic auth, else 401.
 * - Toggl Reports v3 `POST .../workspace/:ws/search/time_entries`: exact
 *   Basic auth (else 401), JSON body with exactly `start_date`, `end_date`
 *   (`YYYY-MM-DD`), integer `user_ids` and an optional integer
 *   `first_row_number` (else 400); paged answers with `X-Next-Row-Number`.
 * - Google certs (`https://www.googleapis.com/oauth2/v1|v3/certs`, the
 *   PEM map / JWKS `google-auth-library` fetches) for an RS256 key pair
 *   generated per test file; `google.signIdToken` signs with it.
 * Every request is recorded. Requests to localhost (supertest, Mongo) and
 * to the run's Mailpit host pass through; any other host fails, so no test
 * reaches the network.
 */

export interface RecordedRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  /** Parsed JSON body, raw text if not JSON, `undefined` if empty. */
  body: unknown;
  /** Status the fake answered with. */
  status: number;
}

/** A canned answer used for error injection. */
export interface FakeResponse {
  status: number;
  contentType?: string;
  body?: string;
}

/** A fixture file name (string) or the response body itself. */
type Body = unknown;

const basic = basicAuth;

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]', '::1'];

/** Hosts the catch-all lets through: localhost plus the Mailpit API host. */
export function passthroughHosts(mailpitApiUrl: string): Set<string> {
  return new Set([...LOCAL_HOSTS, new URL(mailpitApiUrl).hostname]);
}

const fixtureOr = (body: Body): unknown =>
  typeof body === 'string' ? loadContractFixture(body) : body;

function canned({ status, contentType, body }: FakeResponse): Response {
  return new HttpResponse(body ?? null, {
    status,
    headers: contentType ? { 'Content-Type': contentType } : {},
  });
}

export type { TogglScript };

export const GOOGLE_PEM_CERTS_URL =
  'https://www.googleapis.com/oauth2/v1/certs';
export const GOOGLE_JWK_CERTS_URL =
  'https://www.googleapis.com/oauth2/v3/certs';

export interface HttpFakes {
  /** Requests received since the last test started. */
  readonly requests: RecordedRequest[];
  sso: {
    /** Serve this fixture file name or body (default `sso.basic.json`). */
    serve(body: Body): void;
    fail(response: FakeResponse): void;
  };
  toggl: {
    /** Serve these pages (fixture names or bodies) in order. */
    servePages(pages: Body[]): void;
    /**
     * Serve a fixture name or body: a plain array is one page, an object
     * with `pages` is a `TogglScript`.
     */
    serve(body: Body): void;
    fail(response: FakeResponse): void;
  };
  google: {
    /** `kid` of this file's generated key (the one the certs list). */
    readonly kid: string;
    /** Signs a Google-shaped ID token with the generated key, `iat` now. */
    signIdToken(
      claims: IdTokenClaims,
      options?: IdTokenOptions,
    ): Promise<string>;
    fail(response: FakeResponse): void;
  };
}

interface GoogleKey {
  kid: string;
  privateKey: CryptoKey;
  pem: string;
  jwk: JWK;
}

async function generateGoogleKey(): Promise<GoogleKey> {
  const kid = `run-${randomUUID()}`;
  const { privateKey, publicKey } = await generateKeyPair('RS256', {
    extractable: true,
  });
  return {
    kid,
    privateKey,
    pem: await exportSPKI(publicKey),
    jwk: { ...(await exportJWK(publicKey)), kid, alg: 'RS256', use: 'sig' },
  };
}

export function useHttpFakes(): HttpFakes {
  const requests: RecordedRequest[] = [];
  let ssoBody: unknown;
  let ssoFailure: FakeResponse | undefined;
  let togglPages: unknown[][] = [];
  let togglScript: TogglScript | undefined;
  let togglCalls = 0;
  let togglFailure: FakeResponse | undefined;
  let googleKey: GoogleKey | undefined;
  let googleFailure: FakeResponse | undefined;

  const reset = () => {
    requests.length = 0;
    ssoBody = loadContractFixture('sso.basic.json');
    ssoFailure = undefined;
    togglPages = [loadContractFixture('toggl.single-page.json') as unknown[]];
    togglScript = undefined;
    togglCalls = 0;
    togglFailure = undefined;
    googleFailure = undefined;
  };
  reset();

  async function record(request: Request, response: Response) {
    const text = await request.clone().text();
    let body: unknown = text === '' ? undefined : text;
    try {
      body = text === '' ? undefined : (JSON.parse(text) as unknown);
    } catch {
      // keep raw text
    }
    requests.push({
      method: request.method,
      url: request.url,
      headers: Object.fromEntries(request.headers),
      body,
      status: response.status,
    });
    return response;
  }

  const ssoHandler = http.all(TEST_SSO.uri, ({ request }) => {
    const auth = request.headers.get('authorization');
    if (
      request.method !== 'GET' ||
      auth !== basic(TEST_SSO.username, TEST_SSO.password)
    )
      return record(request, new HttpResponse(null, { status: 401 }));
    if (ssoFailure) return record(request, canned(ssoFailure));
    return record(request, HttpResponse.json(ssoBody as JsonBodyType));
  });

  const togglHandler = http.post(
    `${TEST_TOGGL.baseUrl}/workspace/:workspaceId/search/time_entries`,
    async ({ request }) => {
      const auth = request.headers.get('authorization');
      if (auth !== basic(TEST_TOGGL.apiToken, 'api_token'))
        return record(request, new HttpResponse(null, { status: 401 }));
      if (togglFailure) return record(request, canned(togglFailure));
      const contentType = request.headers.get('content-type') ?? '';
      let body: unknown;
      try {
        body = await request.clone().json();
      } catch {
        body = undefined;
      }
      const problem = contentType.startsWith('application/json')
        ? togglBodyProblem(body)
        : 'Content-Type is not application/json';
      if (problem)
        return record(request, HttpResponse.text(problem, { status: 400 }));

      if (togglScript) {
        const step = togglScript.pages[togglCalls++];
        if (!step)
          return record(
            request,
            HttpResponse.text('script has no more pages', { status: 400 }),
          );
        const headers: Record<string, string> =
          step.nextRowNumber === null
            ? {}
            : { 'X-Next-Row-Number': step.nextRowNumber };
        return record(
          request,
          HttpResponse.json(step.rows as JsonBodyType, { headers }),
        );
      }

      // Rows are 1-based; page i starts after the rows of pages 0..i-1.
      const first = isRecord(body)
        ? ((body.first_row_number as number | undefined) ?? 1)
        : 1;
      let start = 1;
      for (let i = 0; i < togglPages.length; i++) {
        const page = togglPages[i]!;
        const next = start + page.length;
        if (start === first) {
          const headers: Record<string, string> =
            i < togglPages.length - 1
              ? { 'X-Next-Row-Number': String(next) }
              : {};
          return record(request, HttpResponse.json(page, { headers }));
        }
        start = next;
      }
      return record(
        request,
        HttpResponse.text(`no page starts at row ${first}`, { status: 400 }),
      );
    },
  );

  const googleCerts =
    (format: 'pem' | 'jwk') => async (info: { request: Request }) => {
      if (googleFailure) return record(info.request, canned(googleFailure));
      const key = googleKey!;
      return record(
        info.request,
        HttpResponse.json(
          format === 'pem' ? { [key.kid]: key.pem } : { keys: [key.jwk] },
          { headers: { 'Cache-Control': 'public, max-age=0' } },
        ),
      );
    };
  const googlePemHandler = http.get(GOOGLE_PEM_CERTS_URL, googleCerts('pem'));
  const googleJwkHandler = http.get(GOOGLE_JWK_CERTS_URL, googleCerts('jwk'));

  // Local and Mailpit traffic passes; any other host gets a network error
  // (fetch rejects).
  const allowed = passthroughHosts(mailpitEndpoints().apiUrl);
  const fallback = http.all('*', ({ request }) =>
    allowed.has(new URL(request.url).hostname)
      ? passthrough()
      : HttpResponse.error(),
  );

  const server = setupServer(
    ssoHandler,
    togglHandler,
    googlePemHandler,
    googleJwkHandler,
    fallback,
  );

  beforeAll(async () => {
    googleKey = await generateGoogleKey();
    server.listen({ onUnhandledFrame: 'error' });
  });
  afterEach(reset);
  afterAll(() => server.close());

  return {
    requests,
    sso: {
      serve: (body) => {
        ssoBody = fixtureOr(body);
      },
      fail: (response) => {
        ssoFailure = response;
      },
    },
    toggl: {
      servePages: (pages) => {
        togglScript = undefined;
        togglPages = pages.map((p) => fixtureOr(p) as unknown[]);
      },
      serve: (body) => {
        const value = fixtureOr(body);
        if (isTogglScript(value)) {
          togglScript = value;
          togglCalls = 0;
        } else {
          togglScript = undefined;
          togglPages = [value as unknown[]];
        }
      },
      fail: (response) => {
        togglFailure = response;
      },
    },
    google: {
      get kid() {
        if (!googleKey) throw new Error('google key: used outside a test');
        return googleKey.kid;
      },
      signIdToken: (claims, options = {}) => {
        if (!googleKey) throw new Error('google key: used outside a test');
        return makeIdToken(claims, {
          now: new Date(),
          key: googleKey.privateKey,
          kid: googleKey.kid,
          ...options,
        });
      },
      fail: (response) => {
        googleFailure = response;
      },
    },
  };
}
