import { generateKeyPair } from 'jose';
import { OAuth2Client } from 'google-auth-library';
import { describe, expect, it } from 'vitest';
import { FakeGoogleVerifier } from '../../src/auth/google/fake-google.verifier';
import { GoogleOAuthVerifier } from '../../src/auth/google/google-oauth.verifier';
import type { GoogleVerifier } from '../../src/auth/google/google-verifier';
import { hostedDomainMatches } from '../../src/auth/login.service';
import { GOOGLE_PEM_CERTS_URL, useHttpFakes } from '../mocks/http-fakes';
import { TEST_ENV } from '../support/env';
import {
  type IdTokenClaims,
  type IdTokenOptions,
  makeIdToken,
} from '../support/google';

/**
 * TST-04 Google ID-token contract. The same cases run through
 * - the REAL verifier (`google-auth-library` `OAuth2Client.verifyIdToken`)
 *   against the certs the fake serves at Google's URL for a key pair
 *   generated per run, and
 * - the `fake` verifier (`AUTH_GOOGLE_VERIFIER=fake`, committed test key).
 * Each case either yields the payload fields AUTH-01 uses or rejects with
 * the reason the verifier gives. `hd` is not checked by the verifiers; the
 * login rejects a missing / other `hd` (`hostedDomainMatches`).
 */
const fakes = useHttpFakes();

const AUD = TEST_ENV.GOOGLE_CLIENT_ID!;
const HOSTED_DOMAIN = TEST_ENV.HOSTED_DOMAIN!;
const HOUR = 3600;

type Sign = (
  claims: IdTokenClaims,
  options?: IdTokenOptions,
) => Promise<string>;

interface Variant {
  name: string;
  /** A fresh verifier (the real client caches certs per instance). */
  verifier: () => GoogleVerifier;
  /** Signs with the key this verifier trusts. */
  sign: Sign;
  /** `kid` of the trusted key (bad-signature case reuses it). */
  kid: () => string;
}

const variants: Variant[] = [
  {
    name: 'real verifier (google-auth-library, mocked certs)',
    verifier: () =>
      new GoogleOAuthVerifier(new OAuth2Client({ clientId: AUD }), AUD),
    sign: (claims, options) => fakes.google.signIdToken(claims, options),
    kid: () => fakes.google.kid,
  },
  {
    name: 'fake verifier (AUTH_GOOGLE_VERIFIER=fake)',
    verifier: () => new FakeGoogleVerifier(AUD, { now: () => new Date() }),
    sign: (claims, options) =>
      makeIdToken(claims, { now: new Date(), ...options }),
    kid: () => 'fake-google-key-1',
  },
];

const CLAIMS: IdTokenClaims = {
  sub: '1098765432',
  email: 'jana.nova@instea.co',
  email_verified: true,
  hd: 'instea.co',
  given_name: 'Jana',
  family_name: 'Nová',
};

const ACCEPTED = {
  sub: '1098765432',
  email: 'jana.nova@instea.co',
  emailVerified: true,
  hostedDomain: 'instea.co',
  givenName: 'Jana',
  familyName: 'Nová',
};

/** A key nobody trusts. */
const strangerKey = async () => (await generateKeyPair('RS256')).privateKey;

describe.each(variants)('Google ID-token contract: $name', (v) => {
  it('valid → the payload fields', async () => {
    const token = await v.sign(CLAIMS);
    await expect(v.verifier().verify(token)).resolves.toEqual(ACCEPTED);
  });

  it('expired → rejected', async () => {
    // Issued 3 h ago, valid for 1 h: past exp and the 5 min clock skew.
    const token = await v.sign(CLAIMS, {
      now: new Date(Date.now() - 3 * HOUR * 1000),
    });
    await expect(v.verifier().verify(token)).rejects.toThrow(
      /too late|"exp" claim/,
    );
  });

  it('wrong aud → rejected', async () => {
    const token = await v.sign({
      ...CLAIMS,
      aud: 'other.apps.googleusercontent.com',
    });
    await expect(v.verifier().verify(token)).rejects.toThrow(
      /Wrong recipient|"aud" claim/,
    );
  });

  it('wrong iss → rejected', async () => {
    const token = await v.sign({ ...CLAIMS, iss: 'https://evil.example' });
    await expect(v.verifier().verify(token)).rejects.toThrow(
      /Invalid issuer|"iss" claim/,
    );
  });

  it('bad signature (other key, trusted kid) → rejected', async () => {
    const token = await v.sign(CLAIMS, {
      key: await strangerKey(),
      kid: v.kid(),
    });
    await expect(v.verifier().verify(token)).rejects.toThrow(
      /Invalid token signature|signature verification failed/,
    );
  });

  it('unknown kid (key nobody publishes) → rejected', async () => {
    const token = await v.sign(CLAIMS, {
      key: await strangerKey(),
      kid: 'unknown-kid',
    });
    await expect(v.verifier().verify(token)).rejects.toThrow(
      /No pem found|signature verification failed/,
    );
  });

  it('hd missing → verified, but the login refuses it (WRONG_DOMAIN)', async () => {
    const token = await v.sign({ ...CLAIMS, hd: null });
    const identity = await v.verifier().verify(token);
    expect(identity).toEqual({ ...ACCEPTED, hostedDomain: undefined });
    expect(hostedDomainMatches(identity.hostedDomain, HOSTED_DOMAIN)).toBe(
      false,
    );
  });

  it('hd different from HOSTED_DOMAIN → verified, but the login refuses it', async () => {
    const token = await v.sign({ ...CLAIMS, hd: 'gmail.com' });
    const identity = await v.verifier().verify(token);
    expect(identity.hostedDomain).toBe('gmail.com');
    expect(hostedDomainMatches(identity.hostedDomain, HOSTED_DOMAIN)).toBe(
      false,
    );
  });
});

describe('Google certs fake', () => {
  it('serves the PEM map google-auth-library fetches, and the real verifier uses it', async () => {
    const token = await fakes.google.signIdToken(CLAIMS);
    await new GoogleOAuthVerifier(
      new OAuth2Client({ clientId: AUD }),
      AUD,
    ).verify(token);
    const certs = fakes.requests.filter((r) =>
      r.url.startsWith('https://www.googleapis.com/'),
    );
    expect(certs.map((r) => r.url)).toEqual([GOOGLE_PEM_CERTS_URL]);
  });

  it('a failing cert fetch rejects verification like real Google', async () => {
    fakes.google.fail({ status: 500 });
    const token = await fakes.google.signIdToken(CLAIMS);
    await expect(
      new GoogleOAuthVerifier(new OAuth2Client({ clientId: AUD }), AUD).verify(
        token,
      ),
    ).rejects.toThrow(/Failed to retrieve verification certificates/);
  });
});
