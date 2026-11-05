import { http, HttpResponse, type JsonBodyType, passthrough } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { TEST_SSO, TEST_TOGGL } from '../support/env';
import { mailpitEndpoints } from '../support/mailbox';
import { loadContractFixture } from './fixtures';

/**
 * TST-02 HTTP fakes for the SSO meta API and Toggl Reports v3 (MSW node),
 * answering on the fake hosts in `TEST_ENV`. They check the observable
 * contract (method, auth, body) so the real clients run unchanged.
 * Requests to localhost (supertest, Mongo) and to the run's Mailpit host
 * (may be a Testcontainers / CI service host) pass through; any other
 * unhandled host fails the request.
 * TODO(TST-04): full contract cases and fixture set.
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

const basic = (user: string, pass: string) =>
  `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]', '::1'];

/** Hosts the catch-all lets through: localhost plus the Mailpit API host. */
export function passthroughHosts(mailpitApiUrl: string): Set<string> {
  return new Set([...LOCAL_HOSTS, new URL(mailpitApiUrl).hostname]);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TOGGL_KEYS = new Set([
  'start_date',
  'end_date',
  'user_ids',
  'first_row_number',
]);

const fixtureOr = (body: Body): unknown =>
  typeof body === 'string' ? loadContractFixture(body) : body;

function canned({ status, contentType, body }: FakeResponse): Response {
  return new HttpResponse(body ?? null, {
    status,
    headers: contentType ? { 'Content-Type': contentType } : {},
  });
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** `null` when the Toggl search body follows the contract, else why not. */
function togglBodyProblem(body: unknown): string | null {
  if (!isRecord(body)) return 'body is not an object';
  for (const key of Object.keys(body))
    if (!TOGGL_KEYS.has(key)) return `unknown key ${key}`;
  for (const key of ['start_date', 'end_date'] as const) {
    const v = body[key];
    if (typeof v !== 'string' || !ISO_DATE.test(v))
      return `${key} is not YYYY-MM-DD`;
  }
  if (
    !Array.isArray(body.user_ids) ||
    !body.user_ids.every((id) => Number.isInteger(id))
  )
    return 'user_ids is not an array of integers';
  if (
    body.first_row_number !== undefined &&
    !Number.isInteger(body.first_row_number)
  )
    return 'first_row_number is not an integer';
  return null;
}

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
    fail(response: FakeResponse): void;
  };
}

export function useHttpFakes(): HttpFakes {
  const requests: RecordedRequest[] = [];
  let ssoBody: unknown;
  let ssoFailure: FakeResponse | undefined;
  let togglPages: unknown[][] = [];
  let togglFailure: FakeResponse | undefined;

  const reset = () => {
    requests.length = 0;
    ssoBody = loadContractFixture('sso.basic.json');
    ssoFailure = undefined;
    togglPages = [loadContractFixture('toggl.single-page.json') as unknown[]];
    togglFailure = undefined;
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

  // Local and Mailpit traffic passes; any other host gets a network error
  // (fetch rejects).
  const allowed = passthroughHosts(mailpitEndpoints().apiUrl);
  const fallback = http.all('*', ({ request }) =>
    allowed.has(new URL(request.url).hostname)
      ? passthrough()
      : HttpResponse.error(),
  );

  const server = setupServer(ssoHandler, togglHandler, fallback);

  beforeAll(() => {
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
        togglPages = pages.map((p) => fixtureOr(p) as unknown[]);
      },
      fail: (response) => {
        togglFailure = response;
      },
    },
  };
}
