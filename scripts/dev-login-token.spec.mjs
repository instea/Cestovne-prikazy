import { spawnSync } from 'node:child_process';
import { createPublicKey, verify } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  consoleSnippet,
  emailDomainError,
  makeDevIdToken,
} from './dev-login-token.mjs';

// DOC-03: the dev sign-in token must pass the API's FakeGoogleVerifier
// checks (RS256 with the test key, Google issuer, audience, exp).
const KEY = JSON.parse(
  readFileSync(
    new URL(
      '../packages/shared/test-fixtures/google/fake-google-key.json',
      import.meta.url,
    ),
    'utf8',
  ),
).privateJwk;

const decode = (part) => JSON.parse(Buffer.from(part, 'base64url').toString());

describe('dev-login-token', () => {
  const now = new Date('2031-01-05T08:00:00Z');
  const token = makeDevIdToken({
    email: 'jana.nova@instea.co',
    clientId: 'dev-client-id',
    hostedDomain: 'instea.co',
    givenName: 'Jana',
    familyName: 'Nová',
    now,
  });
  const [header, payload, signature] = token.split('.');

  it('is signed with the test key (RS256, kid of the fake verifier)', () => {
    expect(decode(header)).toMatchObject({
      alg: 'RS256',
      kid: 'fake-google-key-1',
    });
    const key = createPublicKey({ key: KEY, format: 'jwk' });
    expect(
      verify(
        'sha256',
        Buffer.from(`${header}.${payload}`),
        key,
        Buffer.from(signature, 'base64url'),
      ),
    ).toBe(true);
  });

  it('carries the claims the API checks, valid for one hour', () => {
    const claims = decode(payload);
    expect(claims).toMatchObject({
      iss: 'https://accounts.google.com',
      aud: 'dev-client-id',
      email: 'jana.nova@instea.co',
      email_verified: true,
      hd: 'instea.co',
      given_name: 'Jana',
      family_name: 'Nová',
    });
    expect(claims.exp - claims.iat).toBe(3600);
    expect(claims.iat).toBe(now.getTime() / 1000);
  });

  it('keeps the same sub for the same email (case-insensitive)', () => {
    const again = makeDevIdToken({
      email: 'Jana.Nova@instea.co',
      clientId: 'x',
      hostedDomain: 'instea.co',
      givenName: 'J',
      familyName: 'N',
    });
    expect(decode(again.split('.')[1]).sub).toBe(decode(payload).sub);
  });

  it('builds a console snippet that posts the token and opens /leaves', () => {
    const snippet = consoleSnippet('abc.def.ghi');
    expect(snippet).toContain("fetch('/api/auth/google'");
    expect(snippet).toContain("idToken: 'abc.def.ghi'");
    expect(snippet).toContain("location.assign('/leaves')");
  });

  it('accepts only addresses of HOSTED_DOMAIN (case-insensitive)', () => {
    expect(
      emailDomainError('jana.nova@instea.co', 'instea.co'),
    ).toBeUndefined();
    expect(
      emailDomainError('Jana.Nova@INSTEA.CO', 'instea.co'),
    ).toBeUndefined();
    expect(emailDomainError('jana@instea.co', 'Instea.Co')).toBeUndefined();
    for (const email of [
      'jana@gmail.com',
      'jana@sub.instea.co',
      'jana@instea.co.evil.com',
      'instea.co',
      '@instea.co',
      'jana@',
    ]) {
      expect(emailDomainError(email, 'instea.co')).toMatch(
        /must be an address of HOSTED_DOMAIN \(instea\.co\)/,
      );
    }
  });

  describe('CLI', () => {
    const script = fileURLToPath(
      new URL('./dev-login-token.mjs', import.meta.url),
    );
    const run = (...args) =>
      spawnSync(process.execPath, [script, ...args], {
        encoding: 'utf8',
        env: {
          ...process.env,
          GOOGLE_CLIENT_ID: 'dev-client-id',
          HOSTED_DOMAIN: 'instea.co',
          AUTH_GOOGLE_VERIFIER: 'fake',
        },
      });

    it('exits 2 with a clear message for an email outside HOSTED_DOMAIN', () => {
      const result = run('--email=jana@gmail.com');
      expect(result.status).toBe(2);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain(
        '--email must be an address of HOSTED_DOMAIN (instea.co), got: jana@gmail.com',
      );
      expect(result.stderr).toContain('Usage: pnpm dev:login');
    });

    it('prints the snippet for an address of HOSTED_DOMAIN', () => {
      const result = run('--email=Jana.Nova@Instea.co');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("fetch('/api/auth/google'");
    });
  });
});
