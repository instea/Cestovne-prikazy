import type { OAuth2Client } from 'google-auth-library';
import {
  type GoogleIdentity,
  type GoogleVerifier,
  identityFromPayload,
} from './google-verifier';

/**
 * AUTH-01 real verifier: `OAuth2Client.verifyIdToken` checks the signature
 * against Google's certs (fetched and cached by the library), `aud`, `iss`
 * and `exp`.
 */
export class GoogleOAuthVerifier implements GoogleVerifier {
  constructor(
    private readonly client: OAuth2Client,
    private readonly audience: string,
  ) {}

  async verify(idToken: string): Promise<GoogleIdentity> {
    const ticket = await this.client.verifyIdToken({
      idToken,
      audience: this.audience,
    });
    const payload = ticket.getPayload();
    if (!payload) throw new Error('ID token has no payload');
    return identityFromPayload(payload as unknown as Record<string, unknown>);
  }
}
