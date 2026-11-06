import { readFileSync } from 'node:fs';
import path from 'node:path';
import { exportJWK, importJWK, type JWK, SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import {
  FAKE_GOOGLE_PUBLIC_JWK,
  FakeGoogleVerifier,
} from './fake-google.verifier';
import { identityFromPayload } from './google-verifier';

const fixture = JSON.parse(
  readFileSync(
    path.resolve(
      __dirname,
      '../../../../../packages/shared/test-fixtures/google/fake-google-key.json',
    ),
    'utf8',
  ),
) as { privateJwk: JWK };

const NOW = new Date('2026-12-21T08:00:00Z');
const AUD = 'client.apps.googleusercontent.com';
const verifier = new FakeGoogleVerifier(AUD, { now: () => NOW });

async function sign(payload: Record<string, unknown>, iat = NOW) {
  const key = await importJWK(fixture.privateJwk, 'RS256');
  const s = Math.floor(iat.getTime() / 1000);
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'RS256', kid: 'fake-google-key-1' })
    .setIssuer('accounts.google.com')
    .setAudience(AUD)
    .setIssuedAt(s)
    .setExpirationTime(s + 3600)
    .sign(key);
}

describe('FakeGoogleVerifier', () => {
  it('embeds the public half of the committed test key', async () => {
    const priv = await importJWK(fixture.privateJwk, 'RS256', {
      extractable: true,
    });
    const { n, e } = await exportJWK(priv);
    expect({ n, e }).toEqual({
      n: FAKE_GOOGLE_PUBLIC_JWK.n,
      e: FAKE_GOOGLE_PUBLIC_JWK.e,
    });
  });

  it('verifies a token signed with the test key at the app clock', async () => {
    const token = await sign({
      sub: '1',
      email: 'a@instea.co',
      email_verified: true,
      hd: 'instea.co',
      given_name: 'A',
    });
    await expect(verifier.verify(token)).resolves.toEqual({
      sub: '1',
      email: 'a@instea.co',
      emailVerified: true,
      hostedDomain: 'instea.co',
      givenName: 'A',
      familyName: undefined,
    });
  });

  it('rejects a token expired at the app clock', async () => {
    const token = await sign(
      { sub: '1', email: 'a@instea.co' },
      new Date(NOW.getTime() - 2 * 3600_000),
    );
    await expect(verifier.verify(token)).rejects.toThrow();
  });
});

describe('identityFromPayload', () => {
  it('requires sub and email', () => {
    expect(() => identityFromPayload({ email: 'a@b.c' })).toThrow();
    expect(() => identityFromPayload({ sub: '1' })).toThrow();
  });

  it('email_verified counts only as boolean true', () => {
    expect(
      identityFromPayload({ sub: '1', email: 'a@b.c', email_verified: 'true' })
        .emailVerified,
    ).toBe(false);
  });
});
