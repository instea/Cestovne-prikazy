import { createPrivateKey, randomBytes, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { HOSTED_DOMAIN } from './env';

/**
 * TST-03 personas and fake Google ID tokens.
 *
 * The API's `AUTH_GOOGLE_VERIFIER=fake` (AUTH-01 / TST-04) verifies tokens
 * as Google would (RS256, `aud`, `iss`, `exp`), but against the TEST-ONLY
 * key pair in `packages/shared/test-fixtures/google/`. The suite signs with
 * its private half, so every server rule after verification (hosted domain,
 * registration, deactivated check, session) runs unchanged.
 */

/** TST-03 personas; other names (e.g. `dave`) make extra ad-hoc users. */
export type PersonaRole = string;

export interface Persona {
  role: PersonaRole;
  /** Google `sub` = user id. */
  sub: string;
  email: string;
  /** `hd` claim; `null` omits it. */
  hd: string | null;
  givenName: string;
  familyName: string;
  /** `givenName familyName`, as the leave list shows the requester. */
  name: string;
}

const GIVEN_NAMES: Record<string, string> = {
  admin: 'Adam',
  alice: 'Alice',
  bob: 'Bob',
  carol: 'Carol',
  wrongDomain: 'Wendy',
};

/**
 * A new, unique identity for `role`. Every test gets its own users, so tests
 * never see each other's leaves by name and a retry starts clean.
 */
export function makePersona(role: PersonaRole): Persona {
  const tag = randomBytes(4).toString('hex');
  const givenName =
    GIVEN_NAMES[role] ?? role.charAt(0).toUpperCase() + role.slice(1);
  const familyName = `Tester-${tag}`;
  const domain = role === 'wrongDomain' ? 'other.com' : HOSTED_DOMAIN;
  return {
    role,
    sub: `e2e-${role}-${tag}`,
    email: `${role.toLowerCase()}.${tag}@${domain}`,
    hd: domain,
    givenName,
    familyName,
    name: `${givenName} ${familyName}`,
  };
}

const KEY_FILE = path.resolve(
  import.meta.dirname,
  '../../packages/shared/test-fixtures/google/fake-google-key.json',
);
const privateKey = createPrivateKey({
  key: (JSON.parse(readFileSync(KEY_FILE, 'utf8')) as { privateJwk: object })
    .privateJwk as never,
  format: 'jwk',
});
const KID = 'fake-google-key-1';

const b64url = (value: object): string =>
  Buffer.from(JSON.stringify(value)).toString('base64url');

/** `GOOGLE_CLIENT_ID` of the app under test, read by the global setup. */
function googleClientId(): string {
  const id = process.env.E2E_GOOGLE_CLIENT_ID;
  if (!id) throw new Error('E2E_GOOGLE_CLIENT_ID is not set (global setup)');
  return id;
}

/** A Google-shaped ID token for `persona`, valid for one hour from now. */
export function fakeToken(persona: Persona): string {
  const iat = Math.floor(Date.now() / 1000);
  const payload: Record<string, unknown> = {
    iss: 'https://accounts.google.com',
    aud: googleClientId(),
    sub: persona.sub,
    email: persona.email,
    email_verified: true,
    given_name: persona.givenName,
    family_name: persona.familyName,
    iat,
    exp: iat + 3600,
  };
  if (persona.hd !== null) payload.hd = persona.hd;
  const input = `${b64url({ alg: 'RS256', kid: KID, typ: 'JWT' })}.${b64url(payload)}`;
  const signature = sign('sha256', Buffer.from(input), privateKey);
  return `${input}.${signature.toString('base64url')}`;
}
