import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { sessionDto } from './fixtures';

export const error = (statusCode: number, code: string, message = code) =>
  HttpResponse.json({ statusCode, code, message }, { status: statusCode });

/** Default: config loads, no refresh cookie (anonymous), nothing pending. */
export const defaultHandlers = [
  http.get('*/api/auth/config', () =>
    HttpResponse.json({
      googleClientId: 'client-id',
      hostedDomain: 'instea.co',
    }),
  ),
  http.post('*/api/auth/refresh', () => error(401, 'REFRESH_TOKEN_MISSING')),
  http.post('*/api/auth/logout', () => new HttpResponse(null, { status: 204 })),
  http.get('*/api/leaves', () => HttpResponse.json([])),
  http.get('*/api/leaves/summary', () => HttpResponse.json({ years: [] })),
];

export const server = setupServer(...defaultHandlers);

/** Refresh succeeds with this session. */
export const loggedIn = (session = sessionDto()) =>
  http.post('*/api/auth/refresh', () => HttpResponse.json(session));
