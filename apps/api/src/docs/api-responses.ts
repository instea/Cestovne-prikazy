import { ApiResponse } from '@nestjs/swagger';
import type { HeadersObject } from '@nestjs/swagger';
import { REFRESH_COOKIE } from '../auth/refresh-token';
import { ref, type SchemaName } from './schemas';

/**
 * DOC-02 success responses with a body from `schemas.ts` (the response DTOs
 * are interfaces, so `@ApiOkResponse({ type })` cannot infer them).
 */
export function ApiJsonResponse(
  status: number,
  name: SchemaName,
  options: { description: string; isArray?: boolean; headers?: HeadersObject },
) {
  const schema = options.isArray
    ? { type: 'array', items: ref(name) }
    : ref(name);
  return ApiResponse({
    status,
    description: options.description,
    schema,
    ...(options.headers ? { headers: options.headers } : {}),
  });
}

/** `Set-Cookie` header carrying (or clearing) the refresh token. */
export const refreshCookieHeader = (description: string): HeadersObject => ({
  'Set-Cookie': {
    description: `\`${REFRESH_COOKIE}=...; Path=<BASE_URL path>/api/auth; HttpOnly; Secure; SameSite=Strict\`: ${description}`,
    schema: { type: 'string' },
  },
});
