import { importJWK, type JWK, jwtVerify } from 'jose';
import type { Clock } from '../../common/clock';
import {
  GOOGLE_ISSUERS,
  type GoogleIdentity,
  type GoogleVerifier,
  identityFromPayload,
} from './google-verifier';

/**
 * Public half of the TEST-ONLY key pair whose private half is
 * `packages/shared/test-fixtures/google/fake-google-key.json`. Tests,
 * Playwright and local dev sign ID tokens with it (`makeIdToken`).
 */
export const FAKE_GOOGLE_PUBLIC_JWK: JWK = {
  kty: 'RSA',
  n: '2Iqug8IzghxSLHvh3sfjBiPgb1Rn1ypFZsE9ngaW1itks2PpCvCNiGYBlZJK6raOwnpjLhe8u-igBnJPkRQfBQavjXHnyJFiVlT7gLsHcF0xaWE16BEKYrE6I3vpd2SBky2q-dkw8vZhwrudc4vdDbZwerfVa6FzGH3fNM7x6o9uixTL1B0N9Wsm2qp-8lDShD5qyRFYz6UR34W7nhqQa472d0Q8E_j-fGQz75GBswLGCVSXZamu_xtpU3WCq4iRE34vVO5OY5DI34YygV09kAyap4zrc9Hur7qbZ4tCwVAM69HFERku0Z9Ma_Ja5hrDLobxV0xTAnV5MlQizfVRmw',
  e: 'AQAB',
  kid: 'fake-google-key-1',
  alg: 'RS256',
  use: 'sig',
};

/**
 * AUTH-01 / TST-04 contract mock of Google ID-token verification
 * (`AUTH_GOOGLE_VERIFIER=fake`): same checks as the real verifier (RS256
 * signature, `aud`, Google `iss`, `exp`) against a local test key, no
 * network. Times use the app clock so tests can move it. The config schema
 * refuses `fake` when `NODE_ENV=production`.
 */
export class FakeGoogleVerifier implements GoogleVerifier {
  private readonly key = importJWK(FAKE_GOOGLE_PUBLIC_JWK, 'RS256');

  constructor(
    private readonly audience: string,
    private readonly clock: Clock,
  ) {}

  async verify(idToken: string): Promise<GoogleIdentity> {
    const { payload } = await jwtVerify(idToken, await this.key, {
      algorithms: ['RS256'],
      audience: this.audience,
      issuer: [...GOOGLE_ISSUERS],
      requiredClaims: ['exp', 'iat', 'sub'],
      currentDate: this.clock.now(),
    });
    return identityFromPayload(payload);
  }
}
