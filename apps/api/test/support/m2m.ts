import { TEST_M2M } from './env';

/**
 * `Authorization` header value for the M2M attendance route (ATT-01):
 * `Basic base64(username:password)`, by default with the test credentials.
 */
export function m2mAuth(credentials = TEST_M2M): string {
  const { username, password } = credentials;
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}
