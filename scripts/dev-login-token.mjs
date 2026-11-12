#!/usr/bin/env node
// Local development sign-in without a Google OAuth client (DOC-03).
//
//   pnpm dev:login --email=jana.nova@instea.co [--given=Jana] [--family=Nová]
//
// Prints a Google-shaped ID token signed with the TEST-ONLY key in
// packages/shared/test-fixtures/google/ plus a snippet to paste into the
// browser console on http://localhost:5173. Only an API started with
// AUTH_GOOGLE_VERIFIER=fake accepts the token, and the API refuses to start
// with that setting when NODE_ENV=production (SET-02 / TST-03), so this
// script cannot sign anyone in to a production deployment.
//
// Reads GOOGLE_CLIENT_ID (token audience) and HOSTED_DOMAIN (`hd` claim)
// from the environment, else from the repository's .env.
import { createPrivateKey, randomBytes, sign } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const KEY_FILE = resolve(
  ROOT,
  'packages/shared/test-fixtures/google/fake-google-key.json',
);
const KID = 'fake-google-key-1';

const b64url = (value) =>
  Buffer.from(JSON.stringify(value)).toString('base64url');

/** RS256 ID token as Google issues it, valid for one hour from `now`. */
export function makeDevIdToken({
  email,
  clientId,
  hostedDomain,
  givenName,
  familyName,
  now = new Date(),
}) {
  const { privateJwk } = JSON.parse(readFileSync(KEY_FILE, 'utf8'));
  const iat = Math.floor(now.getTime() / 1000);
  const payload = {
    iss: 'https://accounts.google.com',
    aud: clientId,
    // Stable per email, so signing in again finds the same user.
    sub: `dev-${Buffer.from(email.toLowerCase()).toString('hex')}`,
    email,
    email_verified: true,
    hd: hostedDomain,
    given_name: givenName,
    family_name: familyName,
    iat,
    exp: iat + 3600,
    jti: randomBytes(8).toString('hex'),
  };
  const input = `${b64url({ alg: 'RS256', kid: KID, typ: 'JWT' })}.${b64url(payload)}`;
  const key = createPrivateKey({ key: privateJwk, format: 'jwk' });
  return `${input}.${sign('sha256', Buffer.from(input), key).toString('base64url')}`;
}

/** Browser-console snippet: signs in (refresh cookie) and opens /leaves. */
export function consoleSnippet(idToken) {
  return (
    `fetch('/api/auth/google', { method: 'POST', credentials: 'include', ` +
    `headers: { 'Content-Type': 'application/json' }, ` +
    `body: JSON.stringify({ idToken: '${idToken}' }) })` +
    `.then((r) => r.ok ? location.assign('/leaves') : r.json().then(console.error));`
  );
}

function parseArgs(argv) {
  const args = {};
  for (const arg of argv) {
    const m = /^--(email|given|family)=(.*)$/.exec(arg);
    if (!m) throw new Error(`Unknown argument: ${arg}`);
    args[m[1]] = m[2];
  }
  return args;
}

function main() {
  // The same .env the API loads in development; set variables win.
  const dotEnv = resolve(ROOT, '.env');
  const env = {
    ...(existsSync(dotEnv) ? parseEnv(readFileSync(dotEnv, 'utf8')) : {}),
    ...process.env,
  };
  const usage =
    'Usage: pnpm dev:login --email=<name>@<HOSTED_DOMAIN> [--given=<first>] [--family=<last>]';
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`${err.message}\n${usage}\n`);
    return 2;
  }
  if (!args.email || !env.GOOGLE_CLIENT_ID || !env.HOSTED_DOMAIN) {
    process.stderr.write(
      `${usage}\nGOOGLE_CLIENT_ID and HOSTED_DOMAIN come from the environment or .env.\n`,
    );
    return 2;
  }
  if (env.AUTH_GOOGLE_VERIFIER !== 'fake') {
    process.stderr.write(
      'Warning: AUTH_GOOGLE_VERIFIER is not "fake"; the API will reject this token.\n',
    );
  }
  const local = args.email.split('@')[0];
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const token = makeDevIdToken({
    email: args.email,
    clientId: env.GOOGLE_CLIENT_ID,
    hostedDomain: env.HOSTED_DOMAIN,
    givenName: args.given ?? cap(local.split('.')[0]),
    familyName: args.family ?? cap(local.split('.')[1] ?? 'dev'),
  });
  process.stdout.write(
    `Paste into the browser console on http://localhost:5173 (valid 1 hour):\n\n` +
      `${consoleSnippet(token)}\n`,
  );
  return 0;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exitCode = main();
}
