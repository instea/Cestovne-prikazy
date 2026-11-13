/**
 * TST-02: fixed test credentials and fake upstream URLs. The HTTP fakes
 * (`test/mocks/http-fakes.ts`) answer on these hosts; nothing real is called.
 */
export const TEST_M2M = { username: 'm2m-test', password: 'm2m:secret' };

export const TEST_SSO = {
  uri: 'https://sso.fake.test/api/meta/all',
  username: 'sso-test',
  password: 'sso:secret',
};

export const TEST_TOGGL = {
  baseUrl: 'https://toggl.fake.test/reports/api/v3',
  /** `togglApiToken` the fake accepts (SSO fixtures carry the same value). */
  apiToken: 'toggl-test-token',
};

/** Env for `loadConfig` in integration tests; `createTestApp` adds DB/SMTP. */
export const TEST_ENV: Record<string, string> = {
  NODE_ENV: 'test',
  HOSTED_DOMAIN: 'instea.co',
  GOOGLE_CLIENT_ID: 'test-client-id.apps.googleusercontent.com',
  JWT_ACCESS_SECRET: 'test-access-secret-'.padEnd(48, 'x'),
  AUTH_GOOGLE_VERIFIER: 'fake',
  SMTP_SECURE: 'false',
  SMTP_USER: 'test',
  SMTP_PASSWORD: 'test',
  MAIL_SENDER: 'leaves@example.test',
  APPROVAL_MAIL_RECEIVER: 'approver@example.test',
  BASE_URL: 'https://cestaky.example.test',
  DEFAULT_TIMEZONE: 'Europe/Bratislava',
  M2M_USERNAME: TEST_M2M.username,
  M2M_PASSWORD: TEST_M2M.password,
  SSO_URI: TEST_SSO.uri,
  SSO_USERNAME: TEST_SSO.username,
  SSO_PASSWORD: TEST_SSO.password,
  TOGGL_REPORTS_BASE_URL: TEST_TOGGL.baseUrl,
  LOG_LEVEL: 'fatal',
};
