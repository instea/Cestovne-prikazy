# Integrations

Every system the leaves app talks to at runtime: protocol, data, direction,
authentication, owner on the other side, how it is tested, and how it
fails. Configuration values are in
[`deploy/k8s/config.yml`](../deploy/k8s/config.yml) (non-secret) and the
`cestaky-leaves-secrets` Secret ([`deploy/README.md`](../deploy/README.md));
variable meanings are in the
[README](../README.md#environment-variables).

Owners marked `<to confirm>` are not recorded anywhere in the repository.
Fill them in before the cutover: the owner is who you call when the
integration breaks, and who signs off contract changes.

## Contents

- [Overview](#overview)
- [Google Identity (sign-in)](#google-identity-sign-in)
- [SSO meta API (employee directory)](#sso-meta-api-employee-directory)
- [Toggl Track Reports API v3](#toggl-track-reports-api-v3)
- [SMTP (Gmail)](#smtp-gmail)
- [Attendance consumer (M2M)](#attendance-consumer-m2m)
- [Infrastructure dependencies](#infrastructure-dependencies)
- [Removed integrations](#removed-integrations)
- [How integrations are validated](#how-integrations-are-validated)
- [Open items](#open-items)

## Overview

| Integration | Direction | Protocol | Authentication | Used by | Owner on the other side |
| --- | --- | --- | --- | --- | --- |
| [Google Identity](#google-identity-sign-in) | browser → Google; app → Google | OAuth 2.0 / OIDC ID token | OAuth client id (public) | Sign-in (AUTH-01) | Instea Google Workspace admin `<to confirm>` |
| [SSO meta API](#sso-meta-api-employee-directory) | app → SSO | HTTPS JSON, `GET` | HTTP Basic (`SSO_USERNAME` / `SSO_PASSWORD`) | Attendance (ATT-02), GDPR erasure (NFR-08) | Instea SSO maintainer `<to confirm>` |
| [Toggl Reports v3](#toggl-track-reports-api-v3) | app → Toggl | HTTPS JSON, `POST`, paged | HTTP Basic, per-user API token from SSO | Attendance (ATT-03) | Toggl (vendor); Instea Toggl workspace admin `<to confirm>` |
| [SMTP](#smtp-gmail) | app → Gmail | SMTP over TLS (465) | `SMTP_USER` / `SMTP_PASSWORD` | Leave emails (NOT-01..03) | Google (vendor); mailbox `automation@instea.co` owner `<to confirm>` |
| [Attendance consumer](#attendance-consumer-m2m) | consumer → app | HTTPS JSON, `GET` | HTTP Basic (`M2M_USERNAME` / `M2M_PASSWORD`) | `GET /api/attendence/:year/:month` (ATT-01) | `<to confirm>` |

All outgoing calls are made from the app pod; no integration calls back
into the app except the attendance consumer.

## Google Identity (sign-in)

| – | – |
| --- | --- |
| Purpose | The only way to sign in. Restricted to the hosted domain `HOSTED_DOMAIN` (`instea.co`). |
| Flow | The SPA loads Google Identity Services (`accounts.google.com/gsi/client`) with `GOOGLE_CLIENT_ID` and the `hd` hint, gets an ID token and posts it to `POST /api/auth/google`. The API verifies it with `google-auth-library`, which fetches and caches Google's signing certificates. |
| Data in | ID token claims: `sub`, `email`, `email_verified`, `hd`, `given_name`, `family_name`, `aud`, `iss`, `exp`. |
| Data out | Nothing is sent to Google except the certificate fetch. |
| Authentication | `GOOGLE_CLIENT_ID` (public, in the ConfigMap). The token's `aud` must equal it. The production OAuth client must list `https://cestaky.instea.co` as an authorized JavaScript origin ([CUTOVER.md](../deploy/CUTOVER.md) adds and removes a temporary one). |
| Failure | Invalid, expired or foreign token, `email_verified` false, or a failed certificate fetch → `401 LOGIN_FAILED`; wrong or missing `hd` → `403 WRONG_DOMAIN`. No retry. |
| Code | [`apps/api/src/auth/google/`](../apps/api/src/auth/google/google-oauth.verifier.ts), [`apps/web/src/auth/google-identity.ts`](../apps/web/src/auth/google-identity.ts) |
| Test double | `AUTH_GOOGLE_VERIFIER=fake`: verifies tokens signed with a committed test key (dev, E2E, integration tests; refused in production). `pnpm dev:login` mints such tokens. |
| Tests | [`google.contract.int-spec.ts`](../apps/api/test/contract/google.contract.int-spec.ts) (real verifier against served certs), [`google-login.int-spec.ts`](../apps/api/test/auth/google-login.int-spec.ts), E2E [`login.spec.ts`](../e2e/specs/login.spec.ts) |

## SSO meta API (employee directory)

| – | – |
| --- | --- |
| Purpose | List of employees for the attendance output, and the per-user Toggl credentials. Also asked before a GDPR erasure: a user still listed in SSO cannot be anonymized. |
| Endpoint | `GET ${SSO_URI}`, production `https://sso-meta.instea.co/api/meta/all`. No query parameters. |
| Data in | Array of `{ name, email, keys: [{ key, value }] }`; used keys `togglUserId`, `togglWorkspaceId`, `togglApiToken`, `employee`, `contractType`. Flattened in the old key order; later duplicate keys win. |
| Data out | None (no body). |
| Authentication | HTTP Basic `SSO_USERNAME:SSO_PASSWORD` (Secret). The `Authorization` header is dropped on a redirect to another origin. |
| Failure | 30 s timeout, at most 5 redirects; any non-2xx, non-JSON or malformed body, network error or timeout → `SsoUnavailableError`. Attendance answers `500 {"message":"Cannot get data from SSO, try again later."}` (old text); GDPR erasure answers `503 SSO_UNAVAILABLE`. No retry. |
| Code | [`apps/api/src/attendance/sso/sso.client.ts`](../apps/api/src/attendance/sso/sso.client.ts) |
| Test double | HTTP fake serving the versioned fixtures in [`packages/shared/test-fixtures/contracts/`](../packages/shared/test-fixtures/contracts/sso.basic.json) (`sso.*.json`); E2E stack service `sso-mock`. |
| Tests | [`sso.contract.int-spec.ts`](../apps/api/test/contract/sso.contract.int-spec.ts), [`sso.client.spec.ts`](../apps/api/src/attendance/sso/sso.client.spec.ts) (timeout, redirects, malformed bodies), parity harness (recorded production answers in the rehearsal) |

## Toggl Track Reports API v3

| – | – |
| --- | --- |
| Purpose | Hours logged per employee per day for the attendance output. |
| Endpoint | `POST ${TOGGL_REPORTS_BASE_URL}/workspace/{togglWorkspaceId}/search/time_entries`, production base `https://api.track.toggl.com/reports/api/v3`. One call sequence per SSO employee with `employee === '1'` and a `togglWorkspaceId`, employees one after another. |
| Data out | JSON body `{ start_date, end_date, user_ids: [togglUserId] }` in this key order, plus `first_row_number` on later pages. |
| Data in | Array of `{ user_id, time_entries: [{ seconds, start }] }`; paging by the `X-Next-Row-Number` response header. Hours = `seconds / 60 / 60`, summed by the entry's start day in `DEFAULT_TIMEZONE`. |
| Authentication | HTTP Basic `<togglApiToken>:api_token`, the token of each employee from the SSO directory (not app configuration). Never logged; dropped on a cross-origin redirect. |
| Rate limiting | A fixed 500 ms pause after every page (the old behavior). A `429` is not retried. |
| Failure | 30 s timeout per page, at most 5 redirects; any non-2xx (including `401`, `402`, `429`), non-JSON body or a row for an unrequested `user_id` → `TogglUnavailableError` → attendance `500 {"message":"Cannot get data from Toggl, try again later."}` (old text). No partial data. |
| Code | [`apps/api/src/attendance/toggl/toggl.client.ts`](../apps/api/src/attendance/toggl/toggl.client.ts) |
| Test double | HTTP fake with paged fixtures (`toggl.*.json` in [`packages/shared/test-fixtures/contracts/`](../packages/shared/test-fixtures/contracts/toggl.single-page.json)) and error injection. |
| Tests | [`toggl.contract.int-spec.ts`](../apps/api/test/contract/toggl.contract.int-spec.ts), [`toggl.client.spec.ts`](../apps/api/src/attendance/toggl/toggl.client.spec.ts), [`toggl.int-spec.ts`](../apps/api/test/attendance/toggl.int-spec.ts), parity harness |

## SMTP (Gmail)

| – | – |
| --- | --- |
| Purpose | New-leave email to the approver; approved / rejected email to the requester. English only. |
| Endpoint | `SMTP_HOST:SMTP_PORT`, production `smtp.gmail.com:465` with TLS from connect (`SMTP_SECURE=true`). |
| Data out | From `MAIL_SENDER` (`automation@instea.co`) to `APPROVAL_MAIL_RECEIVER` (`pm@instea.co`) or the requester's email; HTML with requester name, dates, type and a link to `${BASE_URL}/approval` (new leave) or `${BASE_URL}/leaves` (decision). |
| Authentication | `SMTP_USER` / `SMTP_PASSWORD` (Secret). |
| Failure | Connection 10 s, greeting 10 s, socket 20 s timeouts. Sending is fire-and-forget: a failure logs one error line and never changes the API response; no retry, no queue. SMTP not configured → nothing sent, one warn line. |
| Code | [`apps/api/src/mail/mail.service.ts`](../apps/api/src/mail/mail.service.ts), [`apps/api/src/notifications/`](../apps/api/src/notifications/leave-notifications.service.ts) |
| Test double | Mailpit (dev compose, E2E stack, integration tests). |
| Tests | [`mail.int-spec.ts`](../apps/api/test/mail/mail.int-spec.ts) (incl. unreachable SMTP), [`leave-notifications.int-spec.ts`](../apps/api/test/notifications/leave-notifications.int-spec.ts), exact-HTML template tests |

## Attendance consumer (M2M)

| – | – |
| --- | --- |
| Purpose | An external attendance system reads the monthly work and leave hours. |
| Endpoint | `GET https://cestaky.instea.co/api/attendence/:year/:month` (path spelling kept). Unchanged URL across the cutover. |
| Data out | `{ start, end, attendence: { <SSO name>: { days: [{ logged_time, leave }], total, contractType } } }`, byte-compatible with the old app; errors `400` / `401` / `500` with the old bodies. Contract: [functional spec §8](functional-spec.md#8-attendance-api), OpenAPI. |
| Authentication | HTTP Basic `M2M_USERNAME:M2M_PASSWORD` (Secret), constant-time compare. Only this route accepts it. |
| Change | **No CORS headers any more** (old: `Access-Control-Allow-Origin: *`, [§10 #27](functional-spec.md#10-changes-vs-the-old-system)). A consumer that calls from a browser breaks at cutover. **Not yet confirmed** that it calls server-side. |
| Latency | One SSO call plus, per employee, at least one Toggl page and a 500 ms pause: several seconds per month. The consumer's timeout must allow it. |
| Code | [`apps/api/src/attendance/`](../apps/api/src/attendance/attendance.controller.ts) |
| Tests | [`attendance.contract.int-spec.ts`](../apps/api/test/contract/attendance.contract.int-spec.ts) (golden files), [`attendance-api.int-spec.ts`](../apps/api/test/attendance/attendance-api.int-spec.ts), the [parity harness](../apps/api/test/parity/README.md) (old vs new on the same data) |

## Infrastructure dependencies

Not integrations with another team's system, listed for completeness:

| Dependency | Used for | Documented in |
| --- | --- | --- |
| MongoDB 8 (in-cluster StatefulSet) | The app database | [`deploy/README.md`](../deploy/README.md) |
| `registry.instea.co` | Image registry (CI pushes, the cluster pulls) | [`deploy/README.md`](../deploy/README.md) |
| Keel | Rolls out a new `latest` image (polls the registry) | [`deploy/README.md`](../deploy/README.md) |
| GitHub Actions | CI, releases | [`deploy/README.md`](../deploy/README.md) |
| Host nginx and the k8s ingress | TLS and routing of `cestaky.instea.co` | [`deploy/CUTOVER.md`](../deploy/CUTOVER.md) |

## Removed integrations

Dropped with the travel-warrant features (rewrite spec §2 "Out of scope"):
openexchangerates (FX rates for foreign diets, key hard-coded in the old
code) and the Bootstrap CDN stylesheet of the old React SPA.

## How integrations are validated

Mapped to the validation methodology:

| Methodology item | Here |
| --- | --- |
| Integration documentation | This file. |
| Contract tests | `test/contract/*.contract.int-spec.ts` pin the requests the app sends and the responses it accepts. The SSO / Toggl fixtures are written from the old client code and the vendor docs, not captured traffic. |
| Contracts recorded from the old app | The [parity harness](../apps/api/test/parity/README.md) records both apps' outgoing SSO and Toggl requests (method, path, body, auth) and fails on any difference. In the rehearsal it replays SSO and Toggl answers recorded from production (`record-parity-fixtures`, pseudonymized). Attendance output: the golden files and the old-vs-new comparison. |
| Test doubles | Google: fake verifier; SSO and Toggl: HTTP fakes on the versioned fixtures; SMTP: Mailpit. No sandbox exists for SSO; Toggl is called for real only by the rehearsal recorder (read-only). |
| Failure handling | Timeouts, redirect limits, non-2xx, malformed bodies and network errors are unit- and contract-tested per client (see each section). No integration retries; this is the old behavior. |

## Open items

| # | Item | Needed by |
| --- | --- | --- |
| 1 | Name the attendance consumer system and its owner; get a written confirmation that it calls the endpoint server-side (the rehearsal parity run requires `--consumer-confirmed-by`). | MIG-02 sign-off |
| 2 | Confirm the consumer's timeout allows several seconds per request. | MIG-02 sign-off |
| 3 | Fill in the `<to confirm>` owners above. | Cutover (MIG-04) |
