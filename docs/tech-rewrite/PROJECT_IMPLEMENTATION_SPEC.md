# Cestovné príkazy → Leaves app — Project Implementation Specification

## 1. Header

| Item | Value |
|---|---|
| Project | Cestovné príkazy ("cestaky"), rewritten as a single leave-management app |
| Created | 2026-11-05 |
| Source rewrite spec | `docs/tech-rewrite/PROJECT_REWRITE_SPEC.md` (created 2026-11-04) |
| Client answers | `docs/tech-rewrite/PROJECT_REWRITE_SPEC_ANSWERS.md` (exported 2026-11-04) |
| Source technical analysis | `docs/tech-rewrite/PROJECT_INITIAL_ANALYSIS.md` |
| Old codebase | branch `master`, commit `193b89f` (`193b89ffcf87f2a77b182f8c9b116b7e591bb17b`), same as the analysis |
| Interview | Instea, 2026-11-04 / 2026-11-05 — cited as `(interview: <topic>)` |

**Source legend**: `(rewrite spec: <section>)` = rewrite spec line · `(client answer: Q-xx)` = client answers file · `(interview: <topic>)` = answer given while writing this spec · `file:line` = old codebase.

**Overrides of the rewrite spec decided in the interview**

| Rewrite spec / client answer | Override | Source |
|---|---|---|
| Client note "Use latest `node`" | Node 24 LTS kept | (interview: Node version) |
| Q-S5 retention "2 months, but should be configurable" | No retention or auto-purge of leaves, users or audit log | (interview: Retention) |
| NFR "Notification emails in Slovak and English" | Emails in English only | (client answer: Q-S10) |
| "Keep the old app read-only for 2 weeks as rollback; rollback = switch ingress back" and "After 2 weeks, decommission …" | Big-bang cutover with downtime, no side-by-side run; rollback = redeploy old manifests + old image and restore the final dump | (interview: Rollback) |

**Key interview decisions applied across tasks**

- Approve / reject is fully unrestricted, also from the same state. Admins may approve their own leave. Admins get Approve and Reject buttons on every `/leaves` row (the button for the current state is disabled). `/approval` lists PENDING only (interview: Transitions, State pick; client answer: Q-S1, Q-S2).
- Session = access JWT in memory (Bearer, 15 min) + rotating refresh token in an HttpOnly cookie (7 days sliding), stored hashed (interview: Session, Token TTL).
- Same public URL `https://cestaky.instea.co` with the `/cestaky` ingress prefix; no redirects (interview: App URL; client answer: Q-S11).
- User admin has no guards, as in the old app: admins may deactivate themselves and demote the last admin; recovery through the CLI; no reactivation (interview: User admin).
- Anonymization is blocked while the SSO directory still lists the user's email (interview: Anonymize).
- Attendance keeps the 1:1 contract plus the safe fixes listed in ATT-01..04, each an expected parity diff (interview: Attendance).
- Audit log has an admin page `/audit` (interview: Audit UI).

## 2. Target tech stack

Copied from the rewrite spec §1. Layers marked "Not decided" in the rewrite spec are resolved in the last column.

### Platform

| Layer | Current (from analysis) | Target | Source |
|---|---|---|---|
| Hosting | MicroK8s on Contabo VPS, host nginx → ingress class `public` | Same MicroK8s cluster and host nginx | (interview: Target platform) |
| Image registry / rollout | `registry.instea.co`, Keel auto-rollout | Same registry and Keel; new manifests; new image name `registry.instea.co/cestaky-leaves` | (interview: Target platform) |
| Environments | Production only; dev local | Production + local (docker-compose) + CI; no staging | (interview: Environments) |
| Database hosting | Mongo StatefulSet `mongo3`, 2Gi hostpath PVC | MongoDB 8 StatefulSet on same cluster, single-member replica set, limit 1Gi | (interview: API & DB; interview: Infra) |
| Package manager | yarn | pnpm workspaces | (client answer: Other notes) |

### App: Leaves server (API)

| Layer | Current (from analysis) | Target | Source |
|---|---|---|---|
| Runtime | Node 12.22 (runtime), Node 8 (build) | Node 24 LTS | (interview: Target tech stack › Backend; interview: Node version) |
| Language | JavaScript | TypeScript (strict) | (interview: Maintainability) |
| Framework | Express 4.16 | NestJS (current major) | (interview: Target tech stack › Backend) |
| API style | GraphQL + REST | REST with OpenAPI docs | (interview: API & DB) |
| Database / ODM | MongoDB 3.6, Mongoose 4.13 | MongoDB 8, Mongoose 8 | (interview: API & DB) |
| Auth | Google ID token + HS256 JWT via jwt-node / express-jwt | Google ID token (`google-auth-library`) + access JWT (Bearer, in memory) + rotating HttpOnly refresh cookie | (interview: Security, Session) |
| Mail | nodemailer 6.3 over SMTP (Gmail) | **Nodemailer** (current) over SMTP; Mailpit in dev/tests | (client answer: Q-S8) |
| Date / holidays | moment, moment-timezone, date-holidays 1.2.0 | **date-fns** + `@date-fns/tz`; **date-holidays** latest, pinned, public holidays only | (client answer: Q-S8, Q-S9; interview: Holidays) |
| Tests | jest (4 server cases) | **Vitest** unit + integration (real MongoDB 8), contract tests, parity harness | (client answer: Q-S8) |

### App: Leaves web client (replaces React SPA `/` and Angular SPA `/leaves/`)

| Layer | Current (from analysis) | Target | Source |
|---|---|---|---|
| Framework | Angular 4.4.6 + React 16.8 | One React 19 SPA, served by the API container | (interview: Target tech stack › Frontend) |
| Build tool | Angular CLI 1.5 + react-scripts 3.0.1 | Vite | (interview: Target tech stack › Frontend) |
| Language | TypeScript 2.3 + JavaScript | TypeScript (strict) | (interview: Maintainability) |
| State / data fetching | ngrx 2 + apollo-angular; redux + apollo-client 1.x | **TanStack React Query** | (client answer: Q-S7) |
| UI kit | Bootstrap 4 beta / Bootstrap 3 | **Tailwind CSS** | (client answer: Q-S7) |
| Calendar | FullCalendar 3.7 / ng-fullcalendar | **FullCalendar React 7** (`@fullcalendar/react` with its `@fullcalendar/react/daygrid` plugin, peer `temporal-polyfill`) (user decision 2026-11-11) | (client answer: Q-S7; interview: Calendar) |
| i18n | none (English UI) | SK + EN, default EN; **i18next + react-i18next** | (input NFR: Localization; client answer: Q-S10; interview: UI defaults) |
| E2E tests | stale protractor test | **Playwright** | (client answer: Q-S8) |

## 3. Task index

| ID | Title | Area | Type | Depends on |
|---|---|---|---|---|
| AUTH-01 | Google sign-in, hosted domain, auto-registration, login screen | Authentication and accounts | functional | DATA-01, AUTH-02, NFR-06, NFR-13 |
| AUTH-02 | Session: access token + rotating refresh token | Authentication and accounts | functional | DATA-01, SET-02, SET-03 |
| AUTH-03 | Logout | Authentication and accounts | functional | AUTH-02 |
| AUTH-04 | CLI first admin | Authentication and accounts | functional | DATA-01, NFR-06 |
| AUTH-05 | Deactivated users blocked everywhere | Authentication and accounts | functional | DATA-01, AUTH-01, AUTH-02 |
| USR-01 | Admin user list | User administration | functional | DATA-01, NFR-01, NFR-13 |
| USR-02 | Admin edits user | User administration | functional | USR-01, NFR-06 |
| USR-03 | Own profile edit | User administration | functional | DATA-01, NFR-01, NFR-06, NFR-13 |
| USR-04 | Admin deactivates user (soft delete) with confirmation | User administration | functional | USR-01, AUTH-05, NFR-06 |
| LV-01 | Create leave API | Leave requests | functional | DATA-02, WD-01, NFR-01, NFR-06, NOT-02 |
| LV-02 | Add-leave screen | Leave requests | functional | LV-01, LST-01, WD-01, NFR-13 |
| LV-03 | Delete leave (API, button, confirmation) | Leave requests | functional | LST-01, NFR-01, NFR-06 |
| LST-01 | Leave list API + list view | Leave list and calendar | functional | DATA-01, DATA-02, WD-01, NFR-01, NFR-13 |
| LST-02 | Leave list filters | Leave list and calendar | functional | LST-01 |
| LST-03 | Calendar view | Leave list and calendar | functional | LST-01, LST-02 |
| APR-01 | Approve / reject API | Leave approval | functional | DATA-02, LST-01, NFR-01, NFR-06, NOT-03 |
| APR-02 | Approval screen + nav pending badge | Leave approval | functional | APR-01, LST-01 |
| SUM-01 | Leave summary (API + screen) | Leave summary | functional | DATA-02, WD-01, NFR-01, NFR-13 |
| WD-01 | Working-day and leave work-day calculation | Work-day rules | functional | SET-01 |
| NOT-01 | Mail service foundation | Notifications | derived | SET-02, SET-04 |
| NOT-02 | New-leave email to approver | Notifications | functional | NOT-01, DATA-01, DATA-02 |
| NOT-03 | Approved / rejected email to requester | Notifications | functional | NOT-01, DATA-01, DATA-02 |
| ATT-01 | Attendance endpoint, M2M Basic auth and error contract | Attendance API (M2M) | functional | ATT-02, ATT-03, ATT-04 |
| ATT-02 | SSO directory client | Attendance API (M2M) | functional | SET-02 |
| ATT-03 | Toggl Reports v3 client | Attendance API (M2M) | functional | ATT-02 |
| ATT-04 | Attendance assembly: leave codes, timezone, output keys | Attendance API (M2M) | functional | ATT-02, ATT-03, WD-01, DATA-01, DATA-02 |
| OPS-01 | Health check and fail-fast on database loss | Operations | functional | SET-02 |
| OPS-02 | Backup and restore scripts for MongoDB 8 | Operations | functional | OPS-03 |
| OPS-03 | Docker image, k8s manifests, Keel and secrets | Operations | decision | SET-01, SET-02, SET-03, OPS-01 |
| MIG-01 | Migration script: users and leaves with validation report | Data migration and cutover | decision | DATA-01, DATA-02, WD-01, SET-02, OPS-03 |
| MIG-02 | Migration rehearsal on an anonymized production dump | Data migration and cutover | decision | MIG-01, MIG-03, OPS-02, SET-04 |
| MIG-03 | Attendance parity test harness (old vs new) | Data migration and cutover | decision | ATT-01, TST-04, MIG-01 |
| MIG-04 | Cutover runbook | Data migration and cutover | decision | MIG-02, OPS-01, OPS-02, OPS-03, DOC-03 |
| TST-01 | Unit test setup and coverage | Testing | decision | SET-01 |
| TST-02 | Integration tests against a real MongoDB | Testing | decision | SET-02, SET-04 |
| TST-03 | Playwright E2E browser tests | Testing | decision | SET-03, SET-04, AUTH-01, LV-02, LV-03, LST-03, APR-02, SUM-01, USR-02, USR-03, USR-04 |
| TST-04 | Contract mocks and contract tests for Google, SSO meta API and Toggl Reports v3 | Testing | decision | AUTH-01, ATT-01, ATT-02, ATT-03 |
| DOC-01 | Functional spec of the leaves module | Documentation | decision | DATA-02, WD-01, LV-01, APR-01, SUM-01, ATT-04 |
| DOC-02 | OpenAPI documentation for app API and M2M attendance API | Documentation | decision | SET-02, AUTH-01, AUTH-02, AUTH-03, USR-01, USR-02, USR-03, USR-04, LV-01, LV-03, LST-01, APR-01, SUM-01, NFR-06, NFR-07, NFR-08, ATT-01, OPS-01 |
| DOC-03 | Dev and ops README | Documentation | decision | SET-04, OPS-02, OPS-03, NFR-09, NFR-11, MIG-01 |
| NFR-01 | Server-side authorization on every endpoint | Non-functional requirements | NFR | AUTH-02, AUTH-05 |
| NFR-02 | Secure sessions | Non-functional requirements | NFR | AUTH-01, AUTH-02, AUTH-03, AUTH-05 |
| NFR-03 | User data permissions | Non-functional requirements | NFR | NFR-01, USR-01, USR-02, USR-03 |
| NFR-04 | Dependency and image vulnerability scanning in CI | Non-functional requirements | NFR | OPS-03 |
| NFR-05 | Security hardening | Non-functional requirements | NFR | SET-02, AUTH-02, NFR-01 |
| NFR-06 | Audit log of leave and user changes | Non-functional requirements | NFR | DATA-01, DATA-02, SET-02, SET-03, AUTH-02 |
| NFR-07 | GDPR export of one user's data | Non-functional requirements | NFR | DATA-02, USR-01, NFR-06 |
| NFR-08 | GDPR erasure by anonymizing one user | Non-functional requirements | NFR | AUTH-02, USR-01, USR-02, ATT-02, NFR-06 |
| NFR-09 | CI pipeline blocking merge to master | Non-functional requirements | NFR | SET-01, TST-01, TST-02, TST-03, NFR-04, NFR-10, NFR-11 |
| NFR-10 | TypeScript strict, ESLint, Prettier, pre-commit hooks | Non-functional requirements | NFR | SET-01 |
| NFR-11 | Semantic versioning with automated bump and release notes | Non-functional requirements | NFR | NFR-10, OPS-03 |
| NFR-12 | Current, supported runtime and library versions | Non-functional requirements | NFR | SET-01, NFR-04 |
| NFR-13 | UI localization in Slovak and English | Non-functional requirements | NFR | SET-03, DATA-02 |
| NFR-14 | Notification emails in English only | Non-functional requirements | decision | NOT-02, NOT-03 |
| SET-01 | Monorepo and tooling | Project setup (derived) | derived | — |
| SET-02 | API foundation | Project setup (derived) | derived | SET-01 |
| SET-03 | Web foundation | Project setup (derived) | derived | SET-01 |
| SET-04 | Local development environment | Project setup (derived) | derived | SET-01, SET-02 |
| DATA-01 | User entity | Shared entities (derived) | derived | SET-02 |
| DATA-02 | Leave entity, LeaveType / LeaveState enums and labels | Shared entities (derived) | derived | DATA-01 |

### Implementation order

Each step depends only on tasks of earlier steps. Tasks inside one step can run in parallel.

1. SET-01
2. WD-01, TST-01, NFR-10, SET-02, SET-03
3. ATT-02, OPS-01, SET-04, DATA-01
4. AUTH-02, NOT-01, ATT-03, OPS-03, TST-02, DATA-02
5. AUTH-03, NOT-02, NOT-03, ATT-04, OPS-02, MIG-01, NFR-04, NFR-06, NFR-11, NFR-13
6. AUTH-01, AUTH-04, ATT-01, NFR-12, NFR-14
7. AUTH-05, TST-04
8. MIG-03, NFR-01, NFR-02
9. USR-01, USR-03, LV-01, LST-01, SUM-01, MIG-02, NFR-05
10. USR-02, USR-04, LV-02, LV-03, LST-02, APR-01, NFR-07
11. LST-03, APR-02, DOC-01, NFR-03, NFR-08
12. TST-03, DOC-02
13. NFR-09
14. DOC-03
15. MIG-04

## 4. Tasks by area

## Authentication and accounts (AUTH)

### AUTH-01 — Google sign-in, hosted domain, auto-registration, login screen

- **Type**: functional
- **Source**: `(rewrite spec: Features by area › Authentication and accounts)` — "User signs in only with Google; accounts restricted to the hosted domain `instea.co`"; "Unknown Google account from the hosted domain is registered on first login and can use the app immediately, with no admin approval"; "Login shows distinct messages for failure and wrong domain". `(rewrite spec: User decisions › Authentication)` — "No admin approval step: every Google account from the `instea.co` hosted domain is approved automatically on first login; the old pending-user flow and approve-user action are removed". `(rewrite spec: Features by area › User administration)` — "Users are created only by first Google login; no manual create"
- **Depends on**: DATA-01, AUTH-02, NFR-06, NFR-13

**Goal**: The only way to sign in is a Google ID token (Google Identity Services button). The server verifies the token, rejects accounts outside `HOSTED_DOMAIN`, creates an active non-admin user on the first login of an unknown Google account, and starts a session (AUTH-02). There is no pending/approval state. The login screen shows distinct messages for failure, wrong domain and deactivated account.

**Old behavior**:
- Server verifies the ID token with `google-auth-library` `verifyIdToken({idToken, audience: CLIENT_ID})` (`server/graphql/userRelated.js:10-11,22-25`).
- Domain check only when `HOSTED_DOMAIN` is set: `hostedDomain && hostedDomain !== payload.hd` → `WRONG_DOMAIN` (`server/graphql/userRelated.js:12,30-34`). With `HOSTED_DOMAIN` unset, any Google account is accepted. `email_verified` is not checked.
- Existing user is looked up **by email**, not by `sub` (`server/graphql/userRelated.js:35`, `server/service/userService.js:16`). Approved → `SUCCESS` + JWT; not approved → `NEED_APPROVAL` (`userRelated.js:36-46`).
- Unknown email: `findOne` resolves `null`, `user.approved` throws a TypeError, and the `.catch` creates the user (`id: sub, firstName: given_name, surname: family_name, degrees:'', address:'', email, approved:false`, `isAdmin:false`) without awaiting the save, then returns `NEED_APPROVAL` (`userRelated.js:36-61`, `src/data/User.js:3-6`). Any other error in the lookup chain also takes this path.
- Names are never refreshed from Google on later logins (`userRelated.js:35-46`).
- Verification error → `FAILED`, logged as "Problem with login" (`userRelated.js:62-67`).
- Result statuses `SUCCESS | NEED_APPROVAL | WRONG_DOMAIN | FAILED` (`src/data/LoginResults.js:2-7`, `angular/src/app/state/login.result.ts:2-7`).
- UI messages: FAILED red "Login failed. Try again later."; WRONG_DOMAIN red "Used email does not belong to given hosted domain."; NEED_APPROVAL yellow "Account needs to be approved by admin first." (`src/components/LoginResultMessage.js:10-18`, `angular/src/app/login-page/login-page.component.ts:22-37`).
- React button passes `hosted_domain={REACT_APP_HOSTED_DOMAIN}` (`src/containers/auth/LoginForm.js:24`); Angular hardcodes the client id and passes no domain hint (`angular/src/app/login-page/login-page.component.ts:40-46`).
- After React login success: `goBack()` (`src/actions/authActions.js:58-62`). Angular renders the login page in place of every route while logged out (`angular/src/app/app.component.html:3-10`).
- No `createUser` resolver exists although declared (`server/graphql/schema.js:129`), so users are only created by login.

**Constraints**:
- No approval flow, no `approved` field, no `NEED_APPROVAL` status, no approve action (rewrite spec: User decisions › Authentication; brief conventions).
- `HOSTED_DOMAIN` is mandatory in the new app (the spec says accounts are restricted to `instea.co`); the app fails to start without it. Defined change vs old optional check.
- Deactivated users are not re-activated by login (AUTH-05).
- Server reads Google client id from `GOOGLE_CLIENT_ID` (renamed from old `CLIENT_ID`); the SPA gets it at runtime from `GET /api/auth/config` so one image serves all environments (no hardcoded client id, fixes `login-page.component.ts:42`).
- UI strings in EN + SK via i18n keys; EN texts below are final, SK texts are proposals for client review (owned by NFR-13) (interview: UI defaults).
- Login looks up by Google `sub`; email changed in Google updates the stored email; unknown `sub` with an existing email → 409 `LOGIN_FAILED` + log (interview: Remaining).
- Tests and local dev use a fake verifier selected by `AUTH_GOOGLE_VERIFIER=fake`; the API refuses to start with `fake` when `NODE_ENV=production`.

**Data model**: User (owner DATA-01). Written on first login: `id` = token `sub`, `email` = token `email` lowercased, `firstName` = `given_name` or `''`, `surname` = `family_name` or `''`, `isAdmin` = false, `active` = true, `deactivatedAt` = null, `anonymizedAt` = null. Reads: `id`, `email`, `active`.

**API**:

`GET /api/auth/config` — public.
- 200 `{ "googleClientId": "…apps.googleusercontent.com", "hostedDomain": "instea.co" }` (values from `GOOGLE_CLIENT_ID`, `HOSTED_DOMAIN`).

`POST /api/auth/google` — public.
- Body: `{ "idToken": string }` (non-empty, max 4096 chars). Else 400 `VALIDATION_FAILED`.
- Processing order:
  1. `OAuth2Client.verifyIdToken({ idToken, audience: GOOGLE_CLIENT_ID })` (signature, `aud`, `iss`, `exp`). Failure, including Google cert fetch / network failure → 401 `LOGIN_FAILED`, logged at warn level without the token.
  2. `payload.email_verified !== true` → 401 `LOGIN_FAILED`.
  3. `payload.hd !== HOSTED_DOMAIN` (exact, case-insensitive) → 403 `WRONG_DOMAIN`. No user record is created or touched.
  4. Look up User by `id = payload.sub`.
     - Not found and no user with that email → create user (fields above) and write audit entry `USER_REGISTERED` (interview: Remaining). Duplicate-key race on `id` (two parallel first logins) → re-read and continue (only one audit entry).
     - Not found but a user with the same email exists under another `id` → 409 `LOGIN_FAILED` and log error with both ids (interview: Remaining).
     - Found and `active = false` → 403 `USER_DEACTIVATED`; user not modified, no session created (AUTH-05).
     - Found and active → do not overwrite `firstName`/`surname` (user-edited). If the token email (lowercased) differs from the stored email, update the stored email (interview: Remaining); if that email belongs to another user → 409 `LOGIN_FAILED` + log.
  5. Start session per AUTH-02 (new refresh-token family).
- 200 `{ "accessToken": string, "accessTokenExpiresAt": ISO-8601 string, "user": UserDto }` + `Set-Cookie` refresh cookie (AUTH-02). `UserDto` per DATA-01.
- Side effects: may insert a User (writes audit entry `USER_REGISTERED`); may update `email`.

**Screens**:

`/login` — anonymous visitors. Logged-in visitor opening `/login` → redirect to `/leaves`.
- Page title "Sign in". Google Identity Services button rendered with `client_id` = `googleClientId` and `hd` hint = `hostedDomain` from `/api/auth/config`.
- On credential callback → `POST /api/auth/google`; button disabled + spinner while pending.
- Messages (alert above the button; red for all):
  - `LOGIN_FAILED` (401 or 409), `NETWORK_ERROR`, `UNKNOWN`, or GIS error callback: "Login failed. Try again later."
  - `WRONG_DOMAIN`: "Used email does not belong to given hosted domain."
  - `USER_DEACTIVATED`: "Your account has been deactivated. Contact an administrator." (interview: Remaining)
- Config load failure: "Login failed. Try again later." + Retry button.
- After success: navigate to `returnTo` query param if it is a same-app relative path starting with `/` (not `//`), else `/leaves`.
- Route guard: every SPA route except `/login` requires a session; when none, redirect to `/login?returnTo=<current path+query>`.
- The old "Account needs to be approved by admin first." message is removed.

**Permissions**: login endpoints public; see NFR-01 matrix.

**Business rules**:
- Accepted iff token valid AND `email_verified === true` AND `hd` equals `HOSTED_DOMAIN` AND user is not deactivated.
- Lookup key is `sub` (= `User.id`). Old used email (`userService.js:16`); migrated ids are Google `sub` (`userRelated.js:50`), so lookup by `sub` finds every migrated user.
- Example: `sub=111, email=Jan.Novak@instea.co, hd=instea.co`, unknown → user `{id:"111", email:"jan.novak@instea.co", isAdmin:false, active:true}` created, 200 with session.
- Example: `hd=gmail.com` or `hd` missing → 403 `WRONG_DOMAIN`, nothing stored.

**Integrations**: Google Identity (token verification via `google-auth-library`, client via GIS script `https://accounts.google.com/gsi/client`). Env: `GOOGLE_CLIENT_ID`, `HOSTED_DOMAIN`, `AUTH_GOOGLE_VERIFIER` (`google` | `fake`; `fake` refused in production). The `fake` verifier is a contract mock: a local RSA key pair signs test ID tokens with the same claims Google uses (no network).

**Acceptance criteria**:
- Given an unknown Google account with `hd=instea.co`, when it logs in, then a User (`isAdmin=false, active=true`) is created, the response is 200 with an access token and refresh cookie, and the SPA shows `/leaves`.
- Given an unknown Google account, when it logs in, then one audit entry `USER_REGISTERED` exists.
- Given an existing active user, when they log in, then no new user is created and stored names are unchanged even if Google names differ.
- Given an existing user whose Google email changed, when they log in, then the stored email is updated.
- Given an unknown `sub` whose email belongs to another user id, then 409 `LOGIN_FAILED` and nothing is written.
- Given a token with `hd` ≠ `instea.co` or no `hd`, when posted, then 403 `WRONG_DOMAIN`, no user is created, and the UI shows "Used email does not belong to given hosted domain."
- Given an expired, tampered or wrong-audience token, then 401 `LOGIN_FAILED` and the UI shows "Login failed. Try again later."
- Given `email_verified=false`, then 401 `LOGIN_FAILED`.
- Given a deactivated user, when they log in, then 403 `USER_DEACTIVATED`, `active` stays false, no refresh token is stored.
- Given two parallel first logins of the same `sub`, then exactly one User exists and both get 200.
- Given `HOSTED_DOMAIN` unset, when the API starts, then it exits with an error naming `HOSTED_DOMAIN`.
- Given `AUTH_GOOGLE_VERIFIER=fake` and `NODE_ENV=production`, when the API starts, then it exits with an error naming `AUTH_GOOGLE_VERIFIER`.
- Given an anonymous visitor on `/approval`, then they are redirected to `/login?returnTo=%2Fapproval` and return there after login.
- Given no admin approval UI exists, then no "Approve" action or `approved` field appears anywhere.

**Tests**:
- Unit: hd comparison (exact, case-insensitive, missing `hd`); `returnTo` sanitizer (`/leaves` ok, `//evil.com` rejected, `https://evil.com` rejected); name fallback to `''`.
- Integration (real MongoDB, mocked Google certs): each acceptance case above for `POST /api/auth/google`; 400 on missing `idToken`; 401 when cert fetch fails; 409 email conflict; email update on login; `USER_REGISTERED` audit entry; duplicate-key race (two concurrent requests); `GET /api/auth/config` shape.
- E2E (Playwright, mocked Google button that injects a test ID token): first login lands on `/leaves`; wrong domain message; deactivated message; deep link redirect round-trip. Adapted from analysis §2.8 Auth (approval case replaced by auto-approval).

### AUTH-02 — Session: access token + rotating refresh token

- **Type**: functional
- **Source**: `(rewrite spec: Features by area › Authentication and accounts)` — "Session survives page reload; an invalid or expired session shows the user as logged out"; "Session is renewed while the user is active, without the old forgery hole and without losing the renewed token"
- **Depends on**: DATA-01, SET-02, SET-03

**Goal**: A login returns a short-lived signed access JWT kept only in browser memory and sets a long-lived opaque refresh token in an HttpOnly cookie. The SPA renews the access token before expiry through `POST /api/auth/refresh`, which verifies the refresh token against its stored hash, rotates it and detects reuse. A page reload restores the session from the cookie. Any invalid, expired, revoked or deactivated session makes the SPA show the user as logged out.

**Old behavior**:
- JWT HS256 signed with `secrets/key.pem`, claim `sub` = user id, expiry 1 h (`server/auth/operations.js:6-18`).
- **Forgery**: `/refresh-jwt` re-signs `err.parsedBody.sub` when signature verification fails, so any parseable token (forged or expired) yields a valid JWT for any id; it also mints tokens for ids with no user (`server/auth/operations.js:21-34`, `server/auth/setup.js:10-18`). 401 only without a Bearer header (`setup.js:15-17`).
- Request auth: `express-jwt` with `credentialsRequired:false`; user loaded by `sub` without checking approval (`server/auth/setup.js:20-39`). Invalid/expired tokens raise `UnauthorizedError`, which the error handler swallows so the request continues anonymously (`setup.js:40-43`); other errors never get a response (`setup.js:40-44`).
- Storage: `localStorage['jwt']` shared by both SPAs (`src/actions/authActions.js:49`, `angular/src/app/state/auth.ts:4`, `angular/src/app/auth.service.ts:72-77`).
- Refresh every 15 min (`src/core/init.js:10-21`, `angular/src/app/constants.ts:8`). React only starts the timer when a JWT existed at page load (`src/core/init.js:26-30`) and keeps the new JWT only in Redux, not localStorage (`src/reducers/user.js:5-8`), so a reload after 1 h loses the session. Angular persists it (`angular/src/app/state/auth.effects.ts:68-76`, `auth.service.ts:72-77`).
- Reload: JWT in localStorage → fetch user info; null → Angular dispatches logout (`auth.effects.ts:40-45,88-99`); React silently stays logged-out-looking (`src/actions/authActions.js:56-64`).

**Constraints**:
- Brief conventions (Auth): access JWT in memory, `Authorization: Bearer`; refresh token in HttpOnly Secure SameSite=Strict cookie, rotated each refresh, stored hashed; reload restores via cookie; real signature verification.
- TTLs: access 15 min, refresh 7 days sliding, no absolute cap (interview: Session, Token TTL).
- The old `secrets/key.pem` file is replaced by env `JWT_ACCESS_SECRET` from a k8s secret (NFR-05). All old JWTs become invalid at cutover; users log in again.
- The old `localStorage['jwt']` key is removed by the SPA on boot (cleanup; same origin as the old app).

**Data model**:

RefreshToken (collection `refresh_tokens`, owned here):

| field | type | required | default | enum | validation | set by |
|---|---|---|---|---|---|---|
| id | string (uuid v4) | yes | – | – | unique | server |
| userId | string (User.id) | yes | – | – | indexed | server |
| familyId | string (uuid v4) | yes | – | – | indexed; new per login | server |
| tokenHash | string | yes | – | – | unique; hex SHA-256 of the raw token | server |
| expiresAt | Date | yes | now + `REFRESH_TOKEN_TTL_SECONDS` | – | TTL index (`expireAfterSeconds: 0`) | server |
| revokedAt | Date \| null | yes | null | – | – | server |
| revokedReason | string \| null | yes | null | `ROTATED`, `LOGOUT`, `DEACTIVATED`, `REUSE_DETECTED` | – | server |
| replacedById | string \| null | yes | null | – | id of the successor on rotation | server |
| createdAt | Date | yes | now | – | Mongoose timestamps | server |

- Raw token: 32 random bytes (`crypto.randomBytes`), base64url. Never stored or logged in raw form.
- TTL index removes documents after `expiresAt`; these are technical session records, not business data, so the no-retention decision does not apply (interview: Retention).

Access JWT: HS256, key `JWT_ACCESS_SECRET` (≥ 32 bytes), claims `{ sub: User.id, typ: "access", iat, exp }`, `exp = iat + ACCESS_TOKEN_TTL_SECONDS`. No role claims: `isAdmin` and `active` are read from the DB on every request.

Refresh cookie: name `refresh_token`; `HttpOnly; Secure; SameSite=Strict; Path=<BASE_URL pathname without trailing slash>/api/auth; Max-Age=REFRESH_TOKEN_TTL_SECONDS`. Clearing = same attributes with `Max-Age=0`.

**API**:

Access-token guard (global, applies to every `/api/**` route not marked public and not the attendance route — NFR-01):
- No `Authorization` header or not `Bearer <token>` → 401 `AUTH_REQUIRED`.
- Signature invalid, malformed, `alg` ≠ HS256, or `typ` ≠ `access` → 401 `ACCESS_TOKEN_INVALID`.
- `exp` passed → 401 `ACCESS_TOKEN_EXPIRED`.
- `sub` has no User → 401 `ACCESS_TOKEN_INVALID`.
- User `active = false` → 401 `USER_DEACTIVATED` (AUTH-05).
- Else `request.user = { id, isAdmin, active }` from DB.

`POST /api/auth/refresh` — public (cookie-authenticated). Body: none.
- No cookie → 401 `REFRESH_TOKEN_MISSING`.
- Hash not found → 401 `REFRESH_TOKEN_INVALID`; clear cookie.
- Found, `revokedReason = ROTATED` (reuse of an old token) → revoke all non-revoked tokens of the family with `REUSE_DETECTED`; 401 `REFRESH_TOKEN_REUSED`; clear cookie; log warn with `userId`, `familyId`.
- Found, `revokedReason = DEACTIVATED` and the user is still `active = false` → 401 `USER_DEACTIVATED`; clear cookie (USR-04 revokes every token on deactivation, so this is how the SPA learns to show the deactivated message, AUTH-05) `(user decision 2026-11-11)`.
- Found, revoked with another reason → 401 `REFRESH_TOKEN_INVALID`; clear cookie.
- `expiresAt` ≤ now → 401 `REFRESH_TOKEN_EXPIRED`; clear cookie.
- User missing → 401 `REFRESH_TOKEN_INVALID`; user `active=false` → revoke family (`DEACTIVATED`), 401 `USER_DEACTIVATED`; clear cookie.
- Else, in one atomic step (`findOneAndUpdate` with `revokedAt: null` precondition; losing the race is treated as reuse): mark current token `ROTATED`, insert successor in the same family with `expiresAt = now + REFRESH_TOKEN_TTL_SECONDS` (sliding), set new cookie.
- 200 `{ "accessToken", "accessTokenExpiresAt", "user": UserDto }`.

`GET /api/auth/me` — user. 200 `UserDto` of the caller. 401 per guard.

**Screens** (SPA session handling, no own page):
- Boot: remove `localStorage['jwt']`; call `POST /api/auth/refresh` once. 200 → logged in, store access token and user in memory. 401 → logged out → route guard sends protected routes to `/login`. While pending, show a full-page spinner (no flash of the login page).
- Proactive renewal: schedule a refresh at `accessTokenExpiresAt − 60 s` while the app is open.
- Reactive renewal: any API 401 with `ACCESS_TOKEN_EXPIRED` → one refresh, then retry the original request once. A failed refresh, or any other 401 code → clear in-memory session, React Query cache, and redirect to `/login?returnTo=…` with no message (old autologout was silent, `auth.effects.ts:92-97`). `USER_DEACTIVATED` → `/login` showing the deactivated message (AUTH-01).
- Single-flight: concurrent refreshes in one tab share one promise; across tabs the refresh call runs inside `navigator.locks.request('cestaky-auth-refresh', …)` so two tabs never present the same refresh token (prevents false reuse detection on tab restore).

**Permissions**: see NFR-01 matrix.

**Business rules**:
- Session idle limit = refresh TTL: a user inactive (app closed) for longer than 7 days must log in again; while the app is open, it renews every ~14 min.
- Rotation: each refresh token is single-use. Presenting a used token revokes the whole family.
- Example: login at 09:00 → access exp 09:15, refresh exp D+7 09:00. 09:14 proactive refresh → old token ROTATED, new access exp 09:29, new refresh exp D+7 09:14.

**Integrations**: none external. Env: `JWT_ACCESS_SECRET`, `ACCESS_TOKEN_TTL_SECONDS` (default 900), `REFRESH_TOKEN_TTL_SECONDS` (default 604800, sliding), `BASE_URL` (cookie path).

**Acceptance criteria**:
- Given a logged-in user, when the page reloads, then the SPA calls refresh, receives a new access token, and the user stays logged in without seeing `/login`.
- Given a token signed with a different key, or with `alg: none`, or with a modified `sub`, when it calls any protected endpoint, then 401 `ACCESS_TOKEN_INVALID` (old forgery fixed).
- Given a forged or expired access JWT sent to `POST /api/auth/refresh` as Bearer and no cookie, then 401 `REFRESH_TOKEN_MISSING` and no token is issued.
- Given an expired access token, when the SPA calls an API, then it refreshes once and the retried call succeeds.
- Given a refresh token already rotated, when it is presented again, then 401 `REFRESH_TOKEN_REUSED` and the successor token is also rejected afterwards.
- Given a refresh token past `expiresAt`, then 401 `REFRESH_TOKEN_EXPIRED` and the SPA shows `/login`.
- Given two simultaneous refresh requests with the same cookie, then exactly one succeeds (the other is treated as reuse); given two tabs in the browser, then the lock serialises them and both stay logged in.
- Given a successful refresh, then the DB holds only the SHA-256 hash, the cookie has `HttpOnly`, `Secure`, `SameSite=Strict` and the configured `Path`.
- Given an admin removes a user's admin flag, when that user calls an admin endpoint with an unexpired access token, then 403 (role read from DB).

**Tests**:
- Unit: JWT sign/verify (expired, wrong key, `alg:none`, wrong `typ`); cookie attribute builder incl. `BASE_URL` with and without path; token hashing; SPA refresh scheduler (fires at exp − 60 s) and single-flight.
- Integration: every refresh branch above with status + code + cookie cleared; rotation chain of 3; reuse revokes family; concurrent refresh race; deactivated user on refresh; `/api/auth/me`; guard codes `AUTH_REQUIRED` / `ACCESS_TOKEN_INVALID` / `ACCESS_TOKEN_EXPIRED`; forged-token regression test reproducing `server/auth/operations.js:29-31`.
- E2E: login → reload → still logged in; clock-advance (Playwright `page.clock`) past access TTL → API call still works; delete cookie → reload → `/login`.

### AUTH-03 — Logout

- **Type**: functional
- **Source**: `(rewrite spec: Features by area › Authentication and accounts)` — "User can log out"
- **Depends on**: AUTH-02

**Goal**: The user logs out from the header menu. The server revokes the refresh-token family of this browser and clears the cookie; the SPA drops the in-memory access token and cached data and shows `/login`.

**Old behavior**:
- React: "Sign out" in the firstName dropdown (`src/containers/auth/MenuBar.js:14-24`) removes `localStorage['jwt']`, resets the Redux user state and Apollo store, and navigates to `/` (`src/actions/authActions.js:99-108`, `src/reducers/user.js:23-25`).
- Angular: "Logout" in the "firstName surname" dropdown (`angular/src/app/nav-header/nav-header.component.html:29-39`, `nav-header.component.ts:33-35`) removes the JWT and resets Apollo (`angular/src/app/auth.service.ts:79-83`); the login page renders in place (`angular/src/app/app.component.html:3-5`).
- No server call: the JWT stays valid until expiry.

**Constraints**: brief Auth convention (server-side revocation of the stored refresh token).

**API**:

`POST /api/auth/logout` — public (cookie-identified; works even when the access token has expired).
- Cookie present and matches a token → revoke all non-revoked tokens of its family with `LOGOUT`.
- Always clear the cookie. 204, no body. Idempotent: no cookie / unknown token → 204.
- No audit entry (not in the audited action list).

**Screens**:

Header (all logged-in pages; owned here for the user menu, other items referenced):
- Left: "Leaves" → `/leaves`; "Approval" → `/approval` with pending-count badge from `GET /api/leaves?state=PENDING` (admin only, APR-02); "Users" → `/users` (admin only, USR-01); "Audit" → `/audit` (admin only, NFR-06).
- Right: language switch (owned by NFR-13); dropdown labelled "`firstName surname`" (old `nav-header.component.html:32`) with items "Profile" → `/profile` (USR-03), "Summary" → `/summary`, "Log out".
- Removed old items: "Trips", "Places", "Export", "Leaves ↔ Trips" portal links (`MenuBar.js:33-38,74-77`, `nav-header.component.html:9-21`).

"Log out" action: call logout (ignore network errors), clear in-memory session and React Query cache, navigate to `/login` (no `returnTo`). No confirmation.

**Permissions**: any visitor may call logout; menu shown to logged-in users.

**Acceptance criteria**:
- Given a logged-in user, when they click "Log out", then they see `/login`, the cookie is gone, and a reload stays on `/login`.
- Given the old refresh token value was copied before logout, when it is sent to refresh, then 401 `REFRESH_TOKEN_INVALID`.
- Given logout in tab A, when tab B next refreshes, then tab B gets 401 and shows `/login`.
- Given no cookie, when logout is called, then 204.
- Given the logout request fails on network, then the SPA still shows `/login`.

**Tests**:
- Integration: revoke + clear cookie; idempotent 204; token of another family unaffected (other browser stays logged in).
- E2E: log out → `/login`; reload stays logged out; header shows Approval/Users/Audit only for admin.

### AUTH-04 — CLI first admin

- **Type**: functional
- **Source**: `(rewrite spec: Features by area › Authentication and accounts)` — "First admin is promoted by email through a CLI command"
- **Depends on**: DATA-01, NFR-06

**Goal**: An operator promotes an existing user (who has logged in once) to admin by email with a CLI command run inside the API container. It is the bootstrap path for the first admin and the recovery path if no admin is left.

**Old behavior**:
- `node server/index.js --email=<email>` (also `yarn promote-user --email=…`) (`server/index.js:16-21`, `package.json:55`, `README.md:60-69`).
- Sets `approved:true, isAdmin:true` on the user with exactly that email (case-sensitive) (`server/db/promoteUser.js:5`).
- Prints "User with email '%s' promoted to admin and approved." exit 0, or "User with email '%s' not found." exit 1; DB error printed, exit 1 (`server/db/promoteUser.js:7-16`).

**Constraints**: no `approved` field any more (brief). The CLI refuses deactivated users (interview: Remaining). The CLI is also the recovery path when no admin is left, because user admin has no last-admin guard (interview: User admin).

**Data model**: User (DATA-01): reads `email`, `active`, `isAdmin`; writes `isAdmin`, `updatedAt`.

**API** (CLI contract, not HTTP):
- Entry: `node apps/api/dist/cli.js promote-admin --email=<email>`; workspace script `pnpm --filter api cli promote-admin --email=<email>`. In k8s: `kubectl exec deploy/<api deployment> -- node apps/api/dist/cli.js promote-admin --email=<email>`.
- Uses the same `MONGO_URL` config as the API; does not start the HTTP server.
- Email matched after trim + lowercase.
- Outcomes (stdout/stderr, exit code):
  - Missing/empty `--email` → stderr "Usage: promote-admin --email=<email>", exit 2.
  - Not found → stderr "User with email '<email>' not found.", exit 1.
  - Found, `active=false` → stderr "User with email '<email>' is deactivated.", exit 1, no change (interview: Remaining).
  - Found, already admin → stdout "User with email '<email>' is already an admin.", exit 0, no write.
  - Found → set `isAdmin=true`; stdout "User with email '<email>' promoted to admin.", exit 0. Writes audit entry `USER_ROLE_CHANGED` with actorType `cli` (NFR-06; details `from:false, to:true`).
  - DB error → stderr error message, exit 1.

**Acceptance criteria**:
- Given a user `Jan.Novak@instea.co` logged in once, when `promote-admin --email=jan.novak@INSTEA.co` runs, then `isAdmin=true`, exit 0, and an audit entry exists.
- Given an unknown email, then exit 1 with the not-found message.
- Given an existing admin, then exit 0, `updatedAt` unchanged, no audit entry.
- Given a deactivated user, then exit 1 and the user stays deactivated and non-admin.
- Given no `--email`, then exit 2 with usage.

**Tests**:
- Integration (real MongoDB, CLI invoked as a child process or via the exported command handler): all five outcomes and exit codes; audit entry written only on change.
- Docs check: README runbook names the command (owned by the docs task).

### AUTH-05 — Deactivated users blocked everywhere

- **Type**: functional
- **Source**: `(rewrite spec: Features by area › Authentication and accounts)` — "Deactivated users get no access to any endpoint and are not re-activated by logging in again"
- **Depends on**: DATA-01, AUTH-01, AUTH-02

**Goal**: A user with `active=false` is denied at every layer: Google login, refresh, and every access-token request, effective immediately after deactivation (no wait for token expiry). Logging in again never flips `active` back.

**Old behavior**: New — no counterpart in the old system. Old had hard delete only (`server/graphql/userRelated.js:81`); a deleted user's still-valid JWT got anonymous treatment because `context.user` stayed unset (`server/auth/setup.js:29-35`), and the user could log in again and be re-created as pending (`userRelated.js:48-60`). `context.user` was loaded without any approval check (`setup.js:29-35`).

**Constraints**: brief Roles convention. Leaves of the user remain (USR-04).

**Data model**: User `active`, `deactivatedAt` (DATA-01); RefreshToken `revokedReason=DEACTIVATED` (AUTH-02).

**API** (enforcement points, codes):
- `POST /api/auth/google` → 403 `USER_DEACTIVATED` (AUTH-01).
- `POST /api/auth/refresh` → 401 `USER_DEACTIVATED`, family revoked, cookie cleared (AUTH-02).
- Access-token guard on every protected endpoint → 401 `USER_DEACTIVATED` (DB check per request).
- Deactivation (USR-04) revokes all of the user's refresh tokens immediately.
- `GET /api/attendence/...` is M2M (Basic); it does not use user sessions and is not affected.
- `GET /health-check`, `GET /api/auth/config`, static SPA files: public, not affected.

**Screens**: on `USER_DEACTIVATED` from any call, the SPA clears the session and shows `/login` with "Your account has been deactivated. Contact an administrator." (AUTH-01).

**Acceptance criteria**:
- Given an active session of user U, when an admin deactivates U, then U's next API call returns 401 `USER_DEACTIVATED` and U sees `/login` with the deactivated message.
- Given deactivated U, when U logs in with Google, then 403 `USER_DEACTIVATED` and `active` remains false.
- Given deactivated U with a previously valid refresh cookie, when refresh is called, then 401 `USER_DEACTIVATED`.
- Given deactivated U, then every endpoint in the NFR-01 matrix that requires `user` or `admin` returns 401 `USER_DEACTIVATED` for U's valid-signature access token.

**Tests**:
- Integration: table-driven test over the NFR-01 endpoint list with a deactivated user's freshly signed access token → 401 `USER_DEACTIVATED` each; login 403; refresh 401; login does not modify the user document.
- E2E: admin deactivates a second user logged in in another browser context; that context lands on `/login` with the message.

## User administration (USR)

### USR-01 — Admin user list

- **Type**: functional
- **Source**: `(rewrite spec: Features by area › User administration)` — "Admin sees all users: email, name, admin flag, active / deactivated status"
- **Depends on**: DATA-01, NFR-01, NFR-13

**Goal**: Admins open `/users` and see every user, including deactivated ones, with email, name, admin flag and status, plus Edit and Deactivate actions.

**Old behavior**:
- `/users` table: Email · Name (`surname[, firstName][, degrees]`) · Is admin (Yes/No) · Is approved (Yes/No) · Controls: Remove (no confirm), Edit, Approve when unapproved (`src/containers/users/UserList.js:14-46`).
- Non-admins see "You are not authorized to view this page!" (`UserList.js:14,46`, `src/components/Unauthorized.js:6`). Menu item "Users" with lock icon, shown only to admins (`src/containers/auth/MenuBar.js:36,48-57`).
- Data from `getUsers`, which returned **all** users to **any** logged-in user (`server/graphql/userRelated.js:19`). Loading spinner; error "Error while fetching list: {msg}" (`UserList.js:77-81`, `src/components/withProgress.js:16-22`).
- No sort (Mongo natural order).

**Constraints**: approval column/action removed (rewrite spec: User decisions › Authentication). Degrees removed. Endpoint admin-only (NFR-03).

**API**:

`GET /api/users` — admin.
- No query params; returns all users incl. deactivated and anonymized.
- Sort: `surname` asc, then `firstName` asc, then `email` asc (case-insensitive collation `sk`).
- 200 `UserDto[]`. 401 per guard. 403 `FORBIDDEN` for non-admin.


**Screens**:

`/users` — admin. Non-admin: page shows "You are not authorized to view this page!" (old text) and no data request is made.
- Title "Users".
- Table columns: "Email" · "Name" (`surname, firstName`; omit the comma part when a value is empty) · "Admin" ("Yes"/"No") · "Status" ("Active" / "Deactivated" as a badge) · "Actions".
- Actions per row: "Edit" → `/users/:id/edit`; "Deactivate" (USR-04) shown for every active user, including the current admin (interview: User admin).
- Loading: spinner. Error: translated error-code message + "Retry". Empty: "No users." (not reachable in practice).
- Deactivated rows rendered muted.

**Permissions**: admin only on UI and server.

**Acceptance criteria**:
- Given an admin, when they open `/users`, then all users including deactivated ones are listed sorted by surname, with Admin and Status columns and no Approve button or "Is approved" column.
- Given a non-admin, when they call `GET /api/users`, then 403 `FORBIDDEN`; when they open `/users`, then they see the unauthorized message.
- Given anonymous, then 401 `AUTH_REQUIRED`.

**Tests**:
- Integration: admin 200 with sort and DTO shape (no `_id`, `degrees`, `approved`); user 403; anon 401; deactivated caller 401.
- E2E: admin sees list and status badge; non-admin has no "Users" menu item and gets the unauthorized message by URL.

### USR-02 — Admin edits user

- **Type**: functional
- **Source**: `(rewrite spec: Features by area › User administration)` — "Admin edits a user's first name, surname and admin flag"
- **Depends on**: USR-01, NFR-06

**Goal**: An admin edits any user's first name, surname and admin flag on `/users/:id/edit`. Email is read-only for everyone. Changes write audit entries. A role change takes effect on the user's next request.

**Old behavior**:
- `/users/edit/:id` form: Email (disabled), First name, Surname, Degrees, Address, Is approved (disabled), Is admin (admin only); no validation; page header empty (`src/containers/users/UserForm.js:17-47`, `src/containers/users/EditUserForm.js:10-13`).
- Save calls `updateUser` and navigates to `/users` immediately without waiting (`src/actions/userActions.js:43-57`); Cancel → back (`UserForm.js:55`).
- Server `updateUser` `$set`s `firstName, surname, degrees, address, email, approved` (+ `isAdmin` when caller is admin) (`server/graphql/userRelated.js:70-79`, `src/data/User.js:3-6`). `UserInput.isAdmin` is `Boolean!` (`server/graphql/schema.js:13-20,90-92`). Returns `success:true` even if no user matched (`server/graphql/utils.js:1-10`).

**Constraints**: email not editable (rewrite spec: NFR › Security, "non-admins cannot change email or admin flag"; the admin feature line lists only first name, surname, admin flag). Degrees/address/approved removed. No guards, like old: an admin may remove their own admin flag and may demote the last admin; recovery is the CLI (AUTH-04) (interview: User admin). Anonymized users cannot be edited (NFR-08).

**Data model**: User writes `firstName`, `surname`, `isAdmin`, `updatedAt` (DATA-01).

**API**:

`GET /api/users/:id` — admin. 200 `UserDto`; 404 `USER_NOT_FOUND`; 403 `FORBIDDEN`.

`PATCH /api/users/:id` — admin.
- Body (all optional, at least one): `{ "firstName"?: string, "surname"?: string, "isAdmin"?: boolean }`.
- Validation (400 `VALIDATION_FAILED`, message names the field): `firstName`/`surname` trimmed, length 1–100; `isAdmin` boolean; empty body.
- Body contains `email` → 403 `FIELD_NOT_EDITABLE`. Any other unknown property (`approved`, `degrees`, `address`, `id`, `active`) → 400 `VALIDATION_FAILED`.
- 404 `USER_NOT_FOUND`. 403 `FORBIDDEN` for non-admin.
- Target user has `anonymizedAt != null` → 409 `USER_ANONYMIZED`.
- Self-demotion and demoting the last active admin are allowed (no 409).
- 200 updated `UserDto`.
- Side effects: writes audit entry `USER_UPDATED` (changed name fields, old → new) when a name changes; writes audit entry `USER_ROLE_CHANGED` (`from`, `to`) when `isAdmin` changes. No entry when nothing changed.

**Screens**:

`/users/:id/edit` — admin; non-admin sees "You are not authorized to view this page!".
- Title "Edit user".
- Fields (labels as in the NFR-13 inventory, `users.edit.*`): "Email:" (read-only text), "First name:" (text, prefilled), "Surname:" (text, prefilled), "Is admin:" (checkbox, prefilled), "Status:" (read-only "Active"/"Deactivated") `(user decision 2026-11-11)`.
- Validation messages: "First name is required.", "Surname is required.", "Maximum 100 characters."
- Buttons: "Save" (disabled while invalid or saving), "Cancel" → `/users`.
- After success: toast "User saved.", navigate `/users`. Error: inline red alert with the translated `code` message (e.g. `USER_ANONYMIZED`), stay on page.
- Loading: spinner; `USER_NOT_FOUND`: "User not found." with link "Back to users".
- When the admin edits themselves and demotes, after save the SPA refetches `/api/auth/me`; admin menus disappear and navigation goes to `/leaves`.

**Permissions**: admin only, UI and server.

**Acceptance criteria**:
- Given an admin, when they change a user's names and tick Admin and Save, then the user has the new values, two audit entries exist, and `/users` shows them.
- Given a body `{ "email": "x@instea.co" }`, then 403 `FIELD_NOT_EDITABLE` and email unchanged.
- Given `{ "approved": true }` or `{ "degrees": "Ing." }`, then 400 `VALIDATION_FAILED`.
- Given `firstName: "   "`, then 400 and the UI shows "First name is required."
- Given a non-admin calling `PATCH /api/users/<other>`, then 403 `FORBIDDEN` (old silent success fixed).
- Given an unknown id, then 404 `USER_NOT_FOUND` (old `success:true` fixed).
- Given user U demoted while logged in, when U calls an admin endpoint, then 403.
- Given the only admin removes their own admin flag, then 200, no admin remains, and `promote-admin` (AUTH-04) restores one.
- Given an anonymized user, when an admin edits them, then 409 `USER_ANONYMIZED`.

**Tests**:
- Integration: success with audit entries; partial update; each validation and 403/404 case; 409 `USER_ANONYMIZED`; non-admin and owner-on-self via this endpoint → 403; admin demotes self → 200 and next admin call 403; demoting the only admin → 200.
- E2E: admin edits a user and sees the change in the list; validation message shown for empty name.

### USR-03 — Own profile edit

- **Type**: functional
- **Source**: `(rewrite spec: Features by area › User administration)` — "User edits own first name and surname; email and admin flag are read-only for non-admins"
- **Depends on**: DATA-01, NFR-01, NFR-06, NFR-13

**Goal**: Every user edits their own first and last name on `/profile`. Email and admin flag are shown read-only. The server rejects any attempt to change other fields through this endpoint.

**Old behavior**:
- Header dropdown "Profile" → `/users/edit/<own id>` (`src/containers/auth/MenuBar.js:21`). Same form as admin edit; client-side guard `!isAdmin && userId !== ownerId` → Unauthorized (`src/containers/users/UserForm.js:19-21`); Is admin hidden for non-admins (`UserForm.js:35`).
- After Save a non-admin is pushed to `/users` and sees Unauthorized (`src/actions/userActions.js:56`, `src/containers/users/UserList.js:46`).
- Server ownership check is a no-op: `!context.checkUserId` is always false because it is a function (`server/graphql/userRelated.js:70-76`, `server/auth/rootResolverDecorators.js:15-17`). Any user can update any user's `email` and `approved` (`src/data/User.js:3-6`).
- Angular has no profile page.

**Constraints**: spec line above; NFR-03.

**Data model**: User writes `firstName`, `surname`, `updatedAt`.

**API**:

`PATCH /api/users/me` — user (registered before `/:id` so `me` is not parsed as an id).
- Body: `{ "firstName"?: string, "surname"?: string }`, at least one; same validation as USR-02 → 400 `VALIDATION_FAILED`.
- Body contains `email` or `isAdmin` → 403 `FIELD_NOT_EDITABLE` (also for admins; admins change flags via `PATCH /api/users/:id`). Other unknown properties → 400 `VALIDATION_FAILED`.
- 200 updated `UserDto`.
- Side effect: writes audit entry `USER_UPDATED` when a name changes.

Read: `GET /api/auth/me` (AUTH-02).

**Screens**:

`/profile` — any logged-in user.
- Title "My profile".
- Fields: "Email" (read-only), "First name", "Surname", "Admin" (read-only "Yes"/"No").
- Validation messages as USR-02.
- Buttons: "Save" (disabled while invalid/unchanged/saving), "Cancel" (resets the form).
- After success: toast "Profile saved.", stay on `/profile`, header name updates.
- Error: red alert with translated code message.

**Permissions**: self only; no endpoint lets a non-admin edit another user.

**Acceptance criteria**:
- Given a user, when they change their surname on `/profile` and save, then `/api/auth/me` returns the new surname, the header shows it, and an audit entry exists.
- Given a non-admin sending `{ "isAdmin": true }` to `/api/users/me`, then 403 `FIELD_NOT_EDITABLE` and nothing changes.
- Given `{ "email": "boss@instea.co" }`, then 403 `FIELD_NOT_EDITABLE`.
- Given a non-admin sending `PATCH /api/users/<own id>`, then 403 `FORBIDDEN`.
- Given empty first name, then 400 and "First name is required."

**Tests**:
- Integration: success; each forbidden field; unknown field 400; validation; anonymous 401; deactivated 401.
- E2E: user edits own profile; admin flag and email rendered read-only; no Users menu for non-admin.

### USR-04 — Admin deactivates user (soft delete) with confirmation

- **Type**: functional
- **Source**: `(rewrite spec: Features by area › User administration)` — "Admin deactivates a user (soft delete); the user's leaves keep their requester"; "Remove/deactivate actions ask for confirmation". `(rewrite spec: User decisions › User administration)` — "Keep user admin 1:1 except approval (list, edit, admin flag, own profile, CLI first admin)"
- **Depends on**: USR-01, AUTH-05, NFR-06

**Goal**: An admin deactivates a user from `/users` after confirming. The user record stays, `active` becomes false, all their refresh tokens are revoked and every further request is denied. Their leaves keep `requesterId`/`approverId` and still show the name.

**Old behavior**:
- "Remove" button without confirmation (`src/containers/users/UserList.js:36`) → `removeUser` hard delete via `findOneAndRemove` (`server/graphql/userRelated.js:81`, `src/actions/userActions.js:60-68`). Leaves stay orphaned and render as "Deleted <id>" (`server/service/userService.js:3-18`, `server/graphql/leaveRelated.js:58-62`). Errors ignored (no `.then`/`.catch`, `userActions.js:62-66`).
- No reactivation; a removed user logging in again was re-created as pending (`userRelated.js:48-60`).

**Constraints**: soft delete (rewrite spec: User decisions › User administration). No guards, like old: an admin may deactivate themselves; their own sessions are revoked immediately. No reactivation feature (interview: User admin).

**Data model**: User writes `active=false`, `deactivatedAt=now`, `updatedAt`. RefreshToken: all non-revoked tokens of the user → `revokedReason=DEACTIVATED`. Leave: unchanged.

**API**:

`POST /api/users/:id/deactivate` — admin. Body: none.
- 404 `USER_NOT_FOUND`; 403 `FORBIDDEN` for non-admin.
- Already deactivated → 409 `USER_ALREADY_DEACTIVATED`.
- `:id` = caller is allowed: the caller's refresh tokens are revoked too, so the next call returns 401 `USER_DEACTIVATED`.
- 200 updated `UserDto`.
- Side effects: revoke refresh tokens; writes audit entry `USER_DEACTIVATED`. `isAdmin` is left unchanged.

**Screens**:

On `/users`, row action "Deactivate" (red, every active row, including the admin's own):
- Confirmation dialog — title "Deactivate user?"; body "`<full name> (<email>)` will lose access immediately. Their leaves stay in the system."; buttons "Deactivate" (red) and "Cancel". Esc / backdrop = Cancel.
- During the call the "Deactivate" button shows a spinner and both buttons are disabled.
- Focus: starts on "Cancel"; Tab / Shift+Tab cycle only through the dialog's buttons, the page behind is inert; on close focus returns to the row's "Deactivate" button when it is still shown `(user decision 2026-11-11)`.
- Success: dialog closes, toast "User deactivated.", list refetches, row shows "Deactivated". When the admin deactivated themselves, the SPA clears the session and shows `/login` with the deactivated message.
- No "Reactivate" action exists.
- Error: dialog stays open with red text of the translated code message (e.g. `USER_ALREADY_DEACTIVATED` → "This user is already deactivated.") `(user decision 2026-11-11)`.

**Permissions**: admin only.

**Business rules**:
- Deactivated users remain in `/users` and in leave requester/approver names; they cannot log in (AUTH-05).
- Their existing leaves keep state and remain visible, filterable and deletable by admins per the leave tasks.

**Acceptance criteria**:
- Given an admin clicks "Deactivate" and confirms, then the user has `active=false` and `deactivatedAt` set, an audit entry exists, all their refresh tokens are revoked, and their leaves still show their name.
- Given the admin clicks "Cancel", then nothing changes and no request is sent.
- Given a logged-in deactivated user, then their next call returns 401 `USER_DEACTIVATED` (AUTH-05).
- Given an already deactivated user, then 409 `USER_ALREADY_DEACTIVATED`.
- Given an admin deactivates themselves, then 200, their refresh tokens are revoked, their next call returns 401 `USER_DEACTIVATED`, and they see `/login` with the deactivated message.
- Given no reactivation endpoint exists, then `POST /api/users/:id/reactivate` returns 404 `NOT_FOUND`.
- Given a non-admin, then 403 `FORBIDDEN`.
- Given no hard-delete endpoint exists, then `DELETE /api/users/:id` returns 404 `NOT_FOUND` (route not defined).

**Tests**:
- Integration: deactivate success incl. token revocation and leave untouched; 404; 409; 403; anon 401; self-deactivation revokes own tokens.
- E2E: confirm dialog flow, cancel flow, deactivated badge; deactivated user's leave still listed with name.

## Leave requests (LV)

### LV-01 — Create leave API

- **Type**: functional
- **Source**: `(rewrite spec: Features by area › Leave requests)` — "End date must not be before start date; half-day allowed only for a single day; enforced on client and server"; "New leave is always PENDING and its requester is always the caller"; "Work-day count is computed by the server, not trusted from the client"
- **Depends on**: DATA-02, WD-01, NFR-01, NFR-06, NOT-02

**Goal**: An authenticated active user creates a leave for themselves. The server validates date order and the half-day rule, sets `state = PENDING`, `requesterId = caller`, computes `numDays`, stores the leave, writes an audit entry and sends the new-leave email. Email failure never fails the request.

**Old behavior**:
- `createLeave(leave: LeaveInput)` (`server/graphql/schema.js:135`). Input `startDate: String!`, `endDate: String!`, `type`, `isHalfDay`, `numDays: Float` (`server/graphql/schema.js:34-40`).
- Resolver: new uuid, `requesterId = context.user.id`, `state = PENDING`, saves, then fire-and-forget `sendPendingLeaveMail` (`server/graphql/leaveRelated.js:21-31`). `userProtected` returns `null` without a user (`server/auth/rootResolverDecorators.js:1-8`).
- No server validation of date order, half-day or `numDays`. `numDays` comes from the client (`angular/src/app/leaves/leaves-add/leaves-add.component.ts:58-62`) and is stored as sent.
- A leave with 0 work days (e.g. Sat–Sun) is accepted: neither the server nor the client validator checks the count (`leaves-add.component.ts:66-78`). The list then shows `?` for 0 (`angular/src/app/leaves/leaves-list/leaves-list.component.html:38`).
- Mail failures are only logged (`server/service/mailService.js:38-47`).

**Constraints**:
- Known bugs are fixed: server-side validation added; `numDays` no longer accepted from the client `(rewrite spec: User decisions › Known bugs)`.
- New-leave email goes only to `APPROVAL_MAIL_RECEIVER` `(client answer: Q-S13)`; English only `(client answer: Q-S10)`.
- 0-work-day leaves are allowed (old behavior) and shown as `0`, not `?` (LST-01) `(interview: UI defaults)`.
- No past-date or overlap restriction: the old system had none, and the spec adds none.
- Date limits on new leaves `(user decision 2026-11-09)`: `startDate` and `endDate` must be within `2000-01-01`..`2100-12-31`, and a leave must be shorter than 2 years (`endDate` earlier than `startDate` + 2 calendar years; a 29 February start maps to 28 February in a non-leap target year, so `2028-02-29` may end at the latest on `2030-02-27`). The limits bind only leaves created through this API (and the LV-02 form); stored and migrated legacy leaves (MIG-01) are not checked against them. Shared helpers in `packages/shared` (`leaveDateFieldError`, `leaveEndDateLimit`, `newLeaveRuleError`) are used by both LV-01 and LV-02.

**API**:

`POST /api/leaves`
- Guard: authenticated, active user (Bearer session). M2M Basic credentials are accepted only on the attendance route. Admins create leaves only for themselves too.
- Body (`CreateLeaveDto`, JSON):

```json
{ "startDate": "2026-11-09", "endDate": "2026-11-13", "type": "ANNUAL", "isHalfDay": false }
```

| field | type | required | default | validation |
|---|---|---|---|---|
| startDate | string | yes | – | `YYYY-MM-DD`, real calendar date, within `2000-01-01`..`2100-12-31` |
| endDate | string | yes | – | `YYYY-MM-DD`, real calendar date, within `2000-01-01`..`2100-12-31`, `>= startDate`, `< startDate + 2 years` |
| type | LeaveType | no | `ANNUAL` | enum |
| isHalfDay | boolean | no | `false` | `true` only if `startDate === endDate` |

Unknown properties (`numDays`, `state`, `requesterId`, `approverId`, `id`) → 400 `VALIDATION_FAILED` (`forbidNonWhitelisted`), so a client cannot believe it set them.

- 201 → `LeaveDto` (DATA-02) with `state: "PENDING"`, `approver: null`, server `numDays`.
- Errors (body `{ statusCode, code, message }`):

| status | code | message | when |
|---|---|---|---|
| 400 | `VALIDATION_FAILED` | field-specific, e.g. `startDate must be a date in YYYY-MM-DD format`, `endDate must be between 2000-01-01 and 2100-12-31` | missing / malformed / unknown field, bad enum, date outside `2000-01-01`..`2100-12-31` |
| 400 | `LEAVE_END_BEFORE_START` | `Start date must not be greater than end date` | `endDate < startDate` |
| 400 | `LEAVE_TOO_LONG` | `Leave must be shorter than 2 years` | `endDate >= startDate + 2 calendar years` (Feb 29 + 2 years = Feb 28) `(user decision 2026-11-09)` |
| 400 | `LEAVE_HALF_DAY_MULTIPLE_DAYS` | `Half day option is allowed only within single day` | `isHalfDay && startDate !== endDate` |
| 401 | `AUTH_REQUIRED` / `ACCESS_TOKEN_INVALID` / `ACCESS_TOKEN_EXPIRED` | (AUTH-02) | no / invalid / expired session, Basic credentials |
| 401 | `USER_DEACTIVATED` | (AUTH-02) | deactivated caller |

The date-order and half-day messages reuse the old UI strings (`angular/src/app/components/validation-errors/validation-errors.component.ts:4-7`); the `LEAVE_TOO_LONG` message is new. When several checks fail, precedence is `VALIDATION_FAILED` > `LEAVE_END_BEFORE_START` > `LEAVE_TOO_LONG` > `LEAVE_HALF_DAY_MULTIPLE_DAYS`.

- Side effects, in this order after the insert succeeds:
  1. Writes audit entry `LEAVE_CREATED` (NFR-06) with actor = caller, target leave id, and the stored leave fields.
  2. Calls NOT-02 `sendNewLeaveEmail(leave)` without awaiting delivery. Errors are logged, never returned.

**Permissions**:

| action | user | admin | m2m | unauthenticated / deactivated |
|---|---|---|---|---|
| create own leave | ✓ | ✓ | 401 | 401 |
| create for another user | not possible (no field) | not possible | – | – |

**Business rules**:
- `numDays = leaveWorkDays({ startDate, endDate, isHalfDay })` (WD-01) at creation time.
- `id = uuid v4`, `state = PENDING`, `requesterId = caller.id`, `approverId = null`.

**Notifications and jobs**: NOT-02 new-leave email (recipient `APPROVAL_MAIL_RECEIVER`, immediate, fire-and-forget).

**Acceptance criteria**:
- Given an active user, when they POST `2026-11-09`→`2026-11-13` ANNUAL, then 201, `state = PENDING`, `requester.id = caller`, `numDays = 5`, an audit entry `LEAVE_CREATED` exists, and Mailpit receives one email to `APPROVAL_MAIL_RECEIVER`.
- Given `endDate < startDate`, then 400 `LEAVE_END_BEFORE_START` and nothing is stored, audited or mailed.
- Given `isHalfDay = true` and `startDate != endDate`, then 400 `LEAVE_HALF_DAY_MULTIPLE_DAYS`.
- Given `isHalfDay = true` on one working day, then `numDays = 0.5`.
- Given `2026-11-07`→`2026-11-08` (weekend), then 201 and `numDays = 0`.
- Given a body with `numDays: 99` or `state: "APPROVED"`, then 400 `VALIDATION_FAILED`.
- Given no `type`, then the stored type is `ANNUAL`.
- Given `startDate = "2026-02-30"` or `"9.11.2026"`, then 400 `VALIDATION_FAILED`.
- Given SMTP is down, then the response is still 201 and an error is logged.
- Given SMTP is not configured, then 201, no email, and the NOT-02 log line is written.
- Given a 400-day range (2026-01-01 → 2027-02-04), then 201.
- Given `2026-03-01` → `2028-02-29`, then 201; given `2026-03-01` → `2028-03-01`, then 400 `LEAVE_TOO_LONG` (`Leave must be shorter than 2 years`).
- Given `2028-02-29` → `2030-02-27`, then 201; given `2028-02-29` → `2030-02-28`, then 400 `LEAVE_TOO_LONG`.
- Given `isHalfDay = true` and `2026-01-01` → `2029-01-01`, then 400 `LEAVE_TOO_LONG` (precedence over `LEAVE_HALF_DAY_MULTIPLE_DAYS`).
- Given `startDate = "1999-12-31"` or `endDate = "2101-01-01"`, then 400 `VALIDATION_FAILED` with message `startDate must be between 2000-01-01 and 2100-12-31` / `endDate must be between 2000-01-01 and 2100-12-31`; given `2000-01-01` → `2000-01-01` or `2100-12-31` → `2100-12-31`, then 201.
- Given no session, then 401 `AUTH_REQUIRED`. Given a deactivated user's token, then 401 `USER_DEACTIVATED`. Given m2m Basic credentials, then 401 `AUTH_REQUIRED`.

**Tests**:
- Unit: `CreateLeaveDto` validation table (each row above); rule precedence.
- Integration (Nest + MongoDB 8 + Mailpit): every acceptance criterion; the stored document equals the response; audit entry content; email recipient and subject; mail transport mocked to throw → 201.
- E2E: covered by LV-02.

### LV-02 — Add-leave screen

- **Type**: functional
- **Source**: `(rewrite spec: Features by area › Leave requests)` — "User creates a leave with type (default ANNUAL), start date (default today), end date (follows start until edited) and half-day flag"; "Form shows a live count of missed work days"; "Add-leave form submits when input is valid (fixes the always-disabled button)"
- **Depends on**: LV-01, LST-01, WD-01, NFR-13

**Goal**: A logged-in user opens `/leaves/new`, fills type, dates and half-day, sees the live work-day count and submits. Invalid input shows the rule messages and blocks submit. Valid input submits. On success the app goes to `/leaves`.

**Old behavior**:
- Route `list/add` (`angular/src/app/app-routing.module.ts:12`). Heading "Add new leave" (`leaves-add.component.html:2`).
- Defaults: start = end = today at local midnight, type ANNUAL, half-day false (`leaves-add.component.ts:28-37,88-92`).
- End date follows start while the end control is not dirty (`leaves-add.component.ts:41-48`).
- Count field "Number of work days missed", disabled, recomputed on every change detection (`leaves-add.component.html:33-38`).
- Group validator always returns an object, `{}` when valid (`leaves-add.component.ts:66-78`). Messages: "Start date must not be greater than end date", "Half day option is allowed only within single day", fallback "`<key>` failed" (`validation-errors.component.ts:4-7,21-26`).
- Submit "Add leave" with `[disabled]="addGroup.invalid"` (`leaves-add.component.html:44-46`). After the mutation, navigate to `/list` (`angular/src/app/state/leave.effects.ts:28-35`). No error handling.
- Type select shows raw codes (`leaves-add.component.ts:94-98`).
- **Client answer vs code (Q-A5):** the client says the form "is not blocked.....it works fine". The code at commit `193b89f` says the opposite. `@angular/forms` is locked to 4.4.6 (`angular/yarn.lock:125-127`). Its `FormBuilder.group` passes the validator as-is (`angular/node_modules/@angular/forms/bundles/forms.umd.js:5874-5879`, `coerceToValidator` :2309-2311). `updateValueAndValidity` stores the result in `_errors` (:2719). `_calculateStatus` returns `INVALID` for any truthy `_errors`, and `{}` is truthy (:2884-2888). So `addGroup.invalid` is always `true` and the button is always disabled. The empty red alert box always shows too (`leaves-add.component.html:4-6`). The analysis ("likely always disabled") matches the code. The client answer may describe a different deployed build or another creation path. No other path exists in this repo: `createLeave` is called only from `angular/src/app/services/leaves.service.ts:9-15,89-104`. This does not change the rewrite: the new form must submit valid input.

**Constraints**:
- Fix: submit works when valid `(rewrite spec: User decisions › Known bugs)`.
- Readable type labels (DATA-02).
- UI EN default, SK switchable `(client answer: Q-S10)`.
- The live count is a preview from the shared WD-01 function; the server value from LV-01 is authoritative.

**Screens**:

`/leaves/new` — any logged-in active user. Entry: "Add" button on `/leaves` (LST task).
- Title: "Add new leave".
- Fields:

| label (EN) | control | default | notes |
|---|---|---|---|
| Type | select, options in `LEAVE_TYPES` order with translated labels | ANNUAL | – |
| Start date | date input (`YYYY-MM-DD` value) | today | while End date is untouched, changing Start sets End to the same value |
| End date | date input | today | once the user changes it, it no longer follows Start |
| Number of work days missed | read-only output | `leaveWorkDays(form)` | updates on every field change |
| Is half day? | checkbox | unchecked | – |

- Validation (shown under the form, live, only for broken rules; no empty alert):
  - End < Start → "Start date must not be greater than end date".
  - Half day checked and Start ≠ End → "Half day option is allowed only within single day".
  - End not earlier than Start + 2 years → "Leave must be shorter than 2 years" (`errors.LEAVE_TOO_LONG`).
  - Date outside `2000-01-01`..`2100-12-31` → blocks submit (`errors.VALIDATION_FAILED`).
  - Empty date → "Required".
  - The rules and their precedence come from the shared LV-01 helpers (`leaveDateFieldError`, `newLeaveRuleError`), so client and server agree `(user decision 2026-11-09)`.
- Count shown when End < Start: 0 (parity with old loop).
- Actions:
  - "Add leave" (primary): enabled when there is no validation error and no request in flight. Disabled while submitting; label "Saving…".
  - "Cancel": navigates to `/leaves` without saving.
- Success: invalidate React Query keys for the leaves list (incl. `?state=PENDING` used by the badge) and summary; navigate to `/leaves`; show toast "Leave created".
- Server error: show the translated message for `code` (`LEAVE_END_BEFORE_START`, `LEAVE_TOO_LONG`, `LEAVE_HALF_DAY_MULTIPLE_DAYS`, `VALIDATION_FAILED`); `UNKNOWN` or `NETWORK_ERROR` → "Could not save the leave. Try again." The form keeps its values. 401 is handled by the global session handler (AUTH-02).
- "Today" = browser local date `(interview: UI defaults)` (same as old `leaves-add.component.ts:88-92`).

**Acceptance criteria**:
- Given a user opens `/leaves/new`, then Type = ANNUAL (shown as "Annual leave"), Start = End = today, half day unchecked, count = work days of today (1 on a working day, 0 on weekend / holiday).
- Given End untouched, when Start changes to 2026-11-09, then End becomes 2026-11-09.
- Given End was edited, when Start changes, then End keeps its value.
- Given 2026-11-09 → 2026-11-13, then the count shows 5 and "Add leave" is enabled.
- Given End before Start, then the message shows and "Add leave" is disabled.
- Given half day and Start ≠ End, then the half-day message shows and submit is disabled.
- Given half day on one working day, then the count shows 0.5.
- Given 2026-03-01 → 2028-03-01, then "Leave must be shorter than 2 years" shows and submit is disabled; given 2026-03-01 → 2028-02-29, then submit is enabled.
- Given 2017-12-22 → 2017-12-30, then the count shows 4.
- Given valid input, when "Add leave" is clicked, then exactly one POST is sent, the app goes to `/leaves`, and the new leave appears as PENDING.
- Given the server answers 400 `LEAVE_HALF_DAY_MULTIPLE_DAYS`, then that message shows and the form keeps its values.
- Given UI language SK, then labels, type names and messages are Slovak (NFR-13 catalog).

**Tests**:
- Unit (web, Vitest + Testing Library): defaults; end-follows-start until edited; live count for the WD-01 examples; both validation messages; button enabled / disabled states; double-click sends one request; server error mapping.
- E2E (Playwright): create a valid leave → visible in list as PENDING and Mailpit has one email; end-before-start blocks submit; half-day multi-day blocks submit; half-day single day → list shows 0.5 work days.

### LV-03 — Delete leave (API, button, confirmation)

- **Type**: functional
- **Source**: `(rewrite spec: Features by area › Leave requests)` — "User deletes only own leaves; admin deletes any leave; Delete is shown only where allowed and asks for confirmation"
- **Depends on**: LST-01, NFR-01, NFR-06

**Goal**: The requester deletes their own leave in any state; an admin deletes any leave. The server returns explicit errors on denial. The list shows Delete only on rows the viewer may delete, and asks for confirmation first. LV-03 owns only Delete; the admin Approve / Reject buttons on the same rows are owned by APR-02.

**Old behavior**:
- `removeLeave(id: ID!): Result` (`server/graphql/schema.js:136`). `ownerProtected`: admin passes for any requester, a user only for own leaves (`server/auth/rootResolverDecorators.js:10-19`). Not found or not owner → silent `null` (`server/graphql/leaveRelated.js:32-37`). Hard delete via `findOneAndRemove` (`leaveRelated.js:38`). No state check.
- UI: "Delete" button on every row for everyone, no confirmation (`angular/src/app/leaves/leaves-list/leaves-list.component.html:43-45`). The result is only logged, the list refetches (`leaves-list.component.ts:119-123`, `angular/src/app/services/leaves.service.ts:106-115`).

**Constraints**:
- Any state may be deleted, by the owner or an admin `(client answer: Q-S3, Q-A6)`.
- Explicit errors instead of silent null `(rewrite spec: Features by area › Leave approval)` — "Denied actions return an explicit error, never a silent empty result".
- Hard delete kept (old behavior); the audit entry keeps the record.
- No email on delete (old has none; spec adds none).

**API**:

`DELETE /api/leaves/:id`
- Guard: authenticated, active user.
- 204 no body.
- Errors:

| status | code | message | when |
|---|---|---|---|
| 401 | `AUTH_REQUIRED` / `ACCESS_TOKEN_INVALID` / `ACCESS_TOKEN_EXPIRED` / `USER_DEACTIVATED` | (AUTH-02) | no / invalid session, deactivated |
| 403 | `FORBIDDEN` | `You can delete only your own leaves` | non-admin, leave of another user |
| 404 | `LEAVE_NOT_FOUND` | `Leave not found` | no leave with this id (also after a previous delete) |

404 is checked before 403. Leave ids are visible to everyone in the list anyway, so this leaks nothing.
- Side effect: writes audit entry `LEAVE_DELETED` (NFR-06) with actor, leave id and a snapshot of the deleted leave (requesterId, dates, type, state, isHalfDay, numDays).

**Screens**:

`/leaves` list rows (and nowhere else):
- "Delete" (danger) button (in the actions cell, next to APR-02's admin Approve / Reject buttons) shown when `leave.requester.id === me.id || me.isAdmin`. Otherwise no button and no placeholder.
- Click opens a confirm dialog: title "Delete leave?", text "`<formatUserName(requester)>`, `<start> – <end>` (`<type label>`). This cannot be undone.", buttons "Delete" (danger) / "Cancel".
- Dialog focus: starts on "Cancel"; Tab / Shift+Tab cycle only through the dialog's buttons, the page behind is inert; on close focus returns to the row's "Delete" button when it is still shown `(user decision 2026-11-11)`.
- While deleting, the row's button is disabled.
- Success: invalidate the leaves list (incl. `?state=PENDING`) and summary queries; toast "Leave deleted".
- Error: toast with the translated `code` message; 404 also refetches the list.

**Permissions**:

| leave owner / state | owner (user) | other user | admin | unauthenticated |
|---|---|---|---|---|
| own, PENDING / APPROVED / REJECTED | ✓ 204 | 403 | ✓ 204 | 401 |
| someone else's, any state | – | 403 | ✓ 204 | 401 |

UI hides the button exactly where the server returns 403.

**Acceptance criteria**:
- Given a user and their own APPROVED leave, when they confirm Delete, then 204, the row disappears, and an audit entry `LEAVE_DELETED` exists.
- Given own PENDING and own REJECTED leaves, then deletion also succeeds.
- Given a non-admin viewing another user's row, then no Delete button shows; a direct `DELETE` returns 403 `FORBIDDEN` and the leave still exists.
- Given an admin and another user's APPROVED leave, then deletion succeeds.
- Given an unknown id, then 404 `LEAVE_NOT_FOUND`.
- Given the confirm dialog, when the user clicks Cancel, then no request is sent.
- Given the pending badge counted the deleted PENDING leave, then the badge drops after delete.

**Tests**:
- Integration: matrix above (owner × 3 states, other user, admin, unauthenticated, deactivated, unknown id, second delete → 404), audit snapshot, document removed.
- Unit (web): button visibility for owner / other / admin; confirm → mutation; cancel → no call; error toast.
- E2E: user deletes own leave with confirmation; user sees no Delete on a colleague's row; admin deletes a colleague's leave.

## Leave list and calendar (LST)

### LST-01 — Leave list API + list view

- **Type**: functional
- **Source**: `(rewrite spec: Features by area › Leave list and calendar)` — "Every user sees all users' leaves: requester, days (`start - end (n work days)`), type, state, approver"; "Toggle between list and calendar view"; "List, calendar and actions show loading, empty and error states"; `(rewrite spec: User decisions › Scope)` — "Leave visibility stays company-wide, as today"
- **Depends on**: DATA-01, DATA-02, WD-01, NFR-01, NFR-13

**Goal**: Every authenticated, active user opens `/leaves` (default route) and sees all leaves of all users in a table, with requester, date range plus work-day count, readable type, readable state and approver. The same data feeds the calendar view (LST-03); a List / Calendar toggle switches between them. Filters (LST-02) apply to both views. The screen shows explicit loading, empty and error states.

**Old behavior**:
- Server returns every leave, unfiltered and unsorted: `dbSchema.Leave.find({})` (`server/graphql/leaveRelated.js:18-20`). No `sort`, so order is MongoDB natural order (in practice insertion order). No pagination.
- Requester and approver are resolved per leave via `getUserOrDefault` (`server/graphql/leaveRelated.js:58-63`). A missing user becomes a placeholder `{ id, email: "<id>@deleted.instea.co", firstName: "Deleted", surname: "<id>", isAdmin: false, approved: false }` (`server/service/userService.js:3-18`), so the UI shows "Deleted <id>".
- Guard `userProtected`: anonymous call returns `null`, no error (`server/auth/rootResolverDecorators.js:1-8`).
- Angular screen title "Annual / Sick leaves" (`angular/src/app/leaves/leaves-list/leaves-list.component.html:2`). Toolbar: "Add" → `/list/add`, three multiselects, "Clear filter", List / Calendar button group (`:4-20`).
- Table columns Requester · Days · Type · State · Approver · (actions) (`:23-32`). Requester = `firstName + ' ' + surname` (`angular/src/app/login-page/user.ts:7-9`). Days = `{{startDate | date}} - {{endDate | date}} ({{numDays || '?'}} work days)` (`leaves-list.component.html:37-38`): Angular `date` pipe default `mediumDate` (e.g. `Dec 5, 2017`); `numDays` 0 or missing shows `?`. Type and State show raw enum names via pipes (`angular/src/app/pipes/translate-leave-type.pipe.ts:6-8`, `translate-leave-state.pipe.ts:6-8`). Approver = full name or empty (`leaves-list.component.html:42`). Delete button on every row (`:44`).
- View toggle state `'list' | 'calendar'`, default `'list'`, kept in the ngrx store (in memory; survives route changes, lost on reload) (`angular/src/app/state/leaves.ts:20,35-43,52-56`). Calendar receives the already filtered leaves (`leaves-list.component.html:50`).
- No loading, empty or error state; delete result only logged to console (`leaves-list.component.ts:119-123`).

**Constraints**:
- Visibility stays company-wide: every user sees every leave incl. type (`(rewrite spec: User decisions › Scope)`, `(client answer: Q-S4)`).
- Types and states shown with readable labels, not raw codes `(rewrite spec: Features by area › Leave requests)` — "Leave types: ANNUAL, SICKNESS, DOCTOR, MATERNITY, PARENTAL, CARING, shown with readable labels, not raw codes".
- Deactivated users' leaves keep their requester `(rewrite spec: Features by area › User administration)` — "Admin deactivates a user (soft delete); the user's leaves keep their requester".
- `numDays` is server-computed (WD-01), so `0` is a real value: show `0`, not `?` (old `?` for falsy at `leaves-list.component.html:38`) `(interview: UI defaults)`. 0-work-day leaves are allowed `(interview: UI defaults)`.
- List order, deactivated label, missing-user placeholder and singular/plural "work day(s)" follow `(interview: UI defaults)`.
- Denial returns explicit 401/403, never `null` (brief: error body convention).
- Requester email is NOT exposed in the list DTO (old used it only as calendar colour key, `leaves-calendar.component.ts:59`; LST-03 now keys by user id).

**Data model**: reads only. Leave (owner DATA-02): `id`, `requesterId`, `approverId`, `startDate`, `endDate`, `isHalfDay`, `type`, `state`, `numDays`, `createdAt`, `updatedAt`. User (owner DATA-01): `id`, `firstName`, `surname`, `active`, `anonymizedAt`.

**API**:

`GET /api/leaves`
- Auth: access JWT, role `user` or `admin`, user `active`. M2M Basic credentials are not accepted.
- Query: `state` optional, one of `PENDING` | `APPROVED` | `REJECTED`. Absent = all states. (Used by APR-02 with `state=PENDING`.)
- 200 body: JSON array of `LeaveDto` (type in `packages/shared`):
  ```json
  {
    "id": "6f1c…-uuid",
    "requester": { "id": "1065…", "firstName": "Jana", "surname": "Nová", "active": true, "anonymized": false },
    "approver": { "id": "1099…", "firstName": "Peter", "surname": "Admin", "active": true, "anonymized": false },
    "startDate": "2026-12-21",
    "endDate": "2026-12-23",
    "isHalfDay": false,
    "type": "ANNUAL",
    "state": "APPROVED",
    "numDays": 3,
    "createdAt": "2026-11-04T09:12:00.000Z",
    "updatedAt": "2026-11-05T07:00:00.000Z"
  }
  ```
  `approver` is `null` when `approverId` is null. `UserRefDto` = `{ id: string, firstName: string, surname: string, active: boolean, anonymized: boolean }` (`anonymized` = `anonymizedAt != null`). No email.
- Sort: `startDate` descending, then `createdAt` descending, then `id` ascending `(interview: UI defaults)`; old had no defined order.
- No pagination (old none; company-size data).
- Users are resolved with one batched query (`$in` on ids), not per leave.
- Missing user document for a referenced id (should not happen after migration, which turns removed users into deactivated users): server logs a warning with leave id and user id and returns `{ id, firstName: "Deleted", surname: "<id>", active: false, anonymized: false }`, displayed `Deleted <id>` (mirrors `server/service/userService.js:3-13`; `(interview: UI defaults)`).
- Status / error codes: 200; 400 `VALIDATION_FAILED` (message `"state must be one of PENDING, APPROVED, REJECTED"`) for an unknown `state` value; 401 `AUTH_REQUIRED` (no token), `ACCESS_TOKEN_INVALID` / `ACCESS_TOKEN_EXPIRED` (bad token), `USER_DEACTIVATED` (deactivated user); 403 not applicable (all active users may read).
- Side effects: none.

**Screens**:

`/leaves` — all authenticated users (default route; unknown routes redirect here).
- Title: "Annual / Sick leaves" (old text, `leaves-list.component.html:2`).
- Toolbar: "Add" button → `/leaves/new` (LV-01); filters + "Clear filter" (LST-02); view toggle buttons "List" | "Calendar", default "List"; selected view kept in in-memory app state (survives navigation inside the SPA, reset on reload, like old).
- Table columns (EN labels): "Requester" · "Days" · "Type" · "State" · "Approver" · actions column (no header).
  - Requester: display name (rule below).
  - Days: `<start> - <end> (<n> work days)`. Date format EN `MMM d, yyyy` (`Dec 21, 2026`, same as old `mediumDate`), SK `d. M. yyyy` (`21. 12. 2026`). `n` formatted with up to 1 decimal in the UI locale (`2.5` / `2,5`). EN unit: `work day` when n = 1, otherwise `work days`; SK per i18n file.
  - Type: readable label (LV-01 label map).
  - State: EN "Pending" / "Approved" / "Rejected" (SK via i18n).
  - Approver: display name, or empty cell when null.
  - Actions: Delete per LV-03 (shown only when allowed). Admin only: "Approve" and "Reject" on every row (APR-02, `(interview: State pick)`).
- Display name rule (shared helper `formatUserName(UserRefDto)` in `packages/shared`): `firstName + " " + surname`; if `active === false` append ` (deactivated)` (SK `(deaktivovaný)`, SK text is a proposal for client review) `(interview: UI defaults)`. Anonymized users show whatever names the anonymization (NFR GDPR task) stored, with the same suffix.
- States:
  - Loading (first fetch): spinner with text "Loading leaves…"; filters disabled.
  - Error: red alert "Could not load leaves." with button "Retry" (refetch). Background refetch errors keep the last data and show the same alert above the table.
  - Empty, no leaves at all: "No leaves yet."
  - Empty after filtering: "No leaves match the filter." plus "Clear filter" link.
- Data fetching: React Query key `['leaves', { state: undefined }]`; invalidated after create (LV-01), delete (LV-03), approve / reject (APR-01). Default refetch on window focus.

**Permissions**:

| Action | anon | user | admin | m2m |
|---|---|---|---|---|
| `GET /api/leaves` | 401 | 200 all leaves | 200 all leaves | 401 |
| Open `/leaves` | redirect `/login` | ✓ | ✓ | – |

**Business rules**:
- The response includes leaves of deactivated and anonymized requesters.
- `state` filter is exact match.

**Acceptance criteria**:
- Given leaves of users A and B, when user A calls `GET /api/leaves`, then both users' leaves are returned.
- Given no token, when `GET /api/leaves` is called, then 401 with `code: "AUTH_REQUIRED"`.
- Given a deactivated user's valid token, when calling, then 401 `USER_DEACTIVATED`.
- Given `?state=PENDING`, then only PENDING leaves are returned.
- Given `?state=FOO`, then 400 `VALIDATION_FAILED`.
- Given a leave without approver, then `approver` is `null` and the Approver cell is empty.
- Given a leave whose requester is deactivated, then the Requester cell shows `Jana Nová (deactivated)`.
- Given a leave whose `requesterId` has no user document, then the API returns the `Deleted <id>` placeholder and logs a warning.
- Given a leave with `numDays` 0, then Days shows `(0 work days)`.
- Given a half-day leave with `numDays` 0.5, then Days shows `(0.5 work days)` in EN.
- Given three leaves with start dates 2026-01-10, 2026-03-01, 2025-12-30, then the order is 2026-03-01, 2026-01-10, 2025-12-30.
- Given the API fails, then the error alert with "Retry" is shown; clicking Retry refetches.
- Given the user switches to Calendar and navigates to `/summary` and back, then the Calendar view is still selected; after reload, List is selected.
- Given the response is a user DTO, then no `email` field is present.

**Tests**:
- Unit (shared): `formatUserName` (active, deactivated, anonymized); days-cell formatter (EN/SK dates, 0, 0.5, 1 → `work day`, 3).
- Unit (api): sort comparator; placeholder for missing user.
- Integration (api, real MongoDB): 401 `AUTH_REQUIRED` anon; 401 `USER_DEACTIVATED` deactivated; 200 for user and admin returns all users' leaves; `state` filter for each value; 400 invalid state; approver null; missing-user placeholder; sort order; DTO has no email; batched user lookup (≤ 2 queries for N leaves, via Mongoose debug hook or spy).
- E2E (Playwright): list shows seeded leaves of two users with correct columns; loading state (delayed route); error state + Retry (route abort); empty state; view toggle persists across navigation.

### LST-02 — Leave list filters

- **Type**: functional
- **Source**: `(rewrite spec: Features by area › Leave list and calendar)` — "Filters by requester, month and year (multiselect), matched per year segment of a leave; Clear filter"
- **Depends on**: LST-01

**Goal**: The leave list and calendar can be filtered by requester, month and year, each a multiselect. A leave is split into per-year segments and matched per segment, so a leave spanning a year boundary matches the months it covers in each year. "Clear filter" resets all three. The pure filter logic lives in `packages/shared` and is unit-tested with all old spec cases.

**Old behavior**:
- `isMatchingFilter(leave, filter)` (`angular/src/app/leaves/leaveFilter.ts:52-102`):
  - null / undefined filter → match (`:56-58`).
  - Requester: if `requesterIds` non-empty and does not include `leave.requester.id` → no match (`:66-72`).
  - `splitByYear(start, end)` produces one segment per calendar year `{year, startMonth, endMonth}` (months 0–11): first segment starts at start month, last ends at end month, middle segments cover 0–11 (`:29-50`).
  - Year: if `years` non-empty, at least one segment year must be in `years` (`:78-85`).
  - Month: if `months` non-empty, some segment whose year passes the year filter (or any year when no year filter) must have `startMonth ≤ m ≤ endMonth` for some selected `m` (`:88-99`).
- Options:
  - Months: fixed 12 entries `{id: 0..11, name: 'January'..'December'}` (`:6-21,104-106`).
  - Requesters: unique requesters among loaded leaves, by id, in first-appearance order, label full name (`:108-114`).
  - Years: unique `startDate` year and `endDate` year of every leave plus the current year, sorted descending (`:116-133`). Middle years of a multi-year leave are not added.
- Multiselect placeholders "Requester", "Month", "Year"; "Check all" / "Uncheck all" enabled (`angular/src/app/leaves/leaves-list/leaves-list.component.ts:39-55`).
- Filter state `{requesterIds: [], months: [], years: []}` in ngrx store, in memory; "Clear filter" resets it (`angular/src/app/state/leaves.ts:14-18,35-40,57-61`). Same filtered list feeds the calendar (`leaves-list.component.html:50`).
- Filtering is client-side over all leaves (`leaves-list.component.ts:75-79,90-92`).

**Constraints**:
- Logic in `packages/shared` (brief: shared package holds leave filter logic).
- Leave dates are `YYYY-MM-DD` calendar strings (DATA-02); parse them as calendar dates without timezone conversion (old parsed ISO instants in browser local time, `angular/src/app/leaves/leave.ts:33-34`).
- Month labels translated (SK + EN).

**Business rules**:
- Shared types:
  ```ts
  type LeaveListFilter = { requesterIds?: string[]; months?: number[]; years?: number[] } // months 0 = January … 11 = December
  type FilterableLeave = { requesterId: string; startDate: string; endDate: string }
  ```
- `splitByYear(startDate, endDate): {year, startMonth, endMonth}[]` — for each year Y from start year to end year inclusive: `startMonth` = start month if Y = start year else 0; `endMonth` = end month if Y = end year else 11. Empty when start year > end year.
- `isMatchingFilter(leave, filter | null | undefined): boolean` — exactly the old rules above. Empty arrays and missing keys mean "no restriction".
- `makeMonthOptions()` → 12 entries `{ id: 0..11 }`; UI label from i18n (EN January … December).
- `makeRequesterOptions(leaves: LeaveDto[])` → unique requesters by id `{ id, label: formatUserName(requester) }`, sorted by label (locale compare in UI language) `(interview: UI defaults)`; old used first-appearance order.
- `makeYearOptions(leaves, currentYear)` → unique start years and end years of all leaves plus `currentYear`, sorted descending (old rule kept, middle years of multi-year leaves not added, `(interview: UI defaults)`; `currentYear` is a parameter for testability; UI passes the year of the browser local date).
- Filter applies to both list and calendar (calendar additionally hides REJECTED, LST-03).
- Worked examples (from old spec):
  - `{months:[0]}` matches 2017-12-18 → 2018-01-12 (segments 2017 [11..11], 2018 [0..0]).
  - `{months:[12,6], years:[2020]}` matches 2017-12-05 → 2020-12-01 (2020 segment 0..11 contains 6).

**Screens**: `/leaves` toolbar (both views).
- Three multiselect dropdowns with placeholders "Requester", "Month", "Year"; each has "Check all" and "Uncheck all"; button label shows the placeholder when nothing is selected, else the selected count (e.g. "Month (2)").
- Button "Clear filter" resets all three to empty.
- Filter state is in-memory app state shared by list and calendar; survives navigation inside the SPA; reset on reload (old parity).
- Options recompute when leaves data changes; a selected requester or year that is no longer in the options stays selected (no silent drop) — it simply matches nothing.

**Acceptance criteria**:
- Given no selection, then all leaves are shown.
- Given years [2018], then a 2017-12-05 one-day leave is hidden and a 2017-12-05 → 2018-02-05 leave is shown.
- Given months [0] (January), then a 2017-12-18 → 2018-01-12 leave is shown.
- Given requester X and months [6] and years [2026], then only X's leaves covering July 2026 are shown.
- Given a filter, when "Clear filter" is clicked, then all three selections are empty and all leaves show.
- Given a filter in list view, when switching to Calendar, then the calendar shows only matching non-rejected leaves.
- Given leaves only in 2024 and today in 2026, then year options are 2026, 2024.

**Tests**:
- Unit (shared, Vitest) — port every case of `angular/src/app/leaves/leaveFilter.spec.ts:19-94` with leaves as `YYYY-MM-DD` strings:
  - fixtures: oneDay 2017-12-05→2017-12-05 req `1`; oneWeek 2017-12-05→2017-12-12 req `1`; twoMonths 2017-12-05→2018-02-05 req `2`; threeYear 2017-12-05→2020-12-01 req `2`;
  - null filter and `{}` → true (`:42-45`);
  - empty arrays → true (`:47-50`);
  - years [2018]: oneDay false, oneWeek false, twoMonths true, threeYear true (`:52-58`);
  - years [2018, 2017]: oneDay true (`:60-63`);
  - months [1, 6]: oneDay false, twoMonths true, threeYear true (`:65-70`);
  - months [0]: 2017-12-18→2018-01-12 true (`:72-80`);
  - requesterIds ['1','3']: oneDay true, twoMonths false (`:82-86`);
  - months [12, 6] + years [2020]: oneDay false, twoMonths false, threeYear true (`:88-93`).
- Unit (shared) new: `splitByYear` single year, two years, four years, start year > end year → []; months filter combined with years where the matching month is only in a non-selected year → false (e.g. 2017-12-05→2018-01-10, months [11], years [2018] → false); `makeYearOptions` (dedupe, current year added, descending, middle years not added); `makeRequesterOptions` (dedupe, sort); `makeMonthOptions` length 12.
- E2E: select requester + month, rows reduce; Clear filter restores; filter carries to calendar.

### LST-03 — Calendar view

- **Type**: functional
- **Source**: `(rewrite spec: Features by area › Leave list and calendar)` — "Month calendar with prev / next / today; REJECTED hidden, PENDING at 50% opacity"; "Each requester gets a stable colour from a 15-colour palette; event title `<Full Name> [1/2 ](<type letter>)`"
- **Depends on**: LST-01, LST-02

**Goal**: The Calendar view of `/leaves` shows the filtered leaves as all-day events in a FullCalendar month grid with prev / next / today navigation. REJECTED leaves are hidden, PENDING leaves are drawn at 50% opacity. Each requester has a deterministic colour from a fixed 15-colour palette, and each event title shows the requester, a half-day marker and the type letter.

**Old behavior**:
- FullCalendar 3 via ng-fullcalendar, `editable: false`, `eventLimit: false`, header left `prev,next today`, center `title`, right empty (`angular/src/app/leaves/leaves-calendar/leaves-calendar.component.ts:24-36`). Default month view.
- Input = filtered leaves (`leaves-list.component.html:50`); REJECTED removed (`leaves-calendar.component.ts:39-41`).
- Event: `allDay: true`, `start` = startDate `YYYY-MM-DD`, `end` = endDate + 1 day `YYYY-MM-DD` (FullCalendar exclusive end), `backgroundColor` = colour (`:80-87`). No border or text colour set (FullCalendar 3 defaults apply).
- Title: `` `${firstName} ${surname} ${isHalfDay ? '1/2 ' : ''}(${letter})` `` with letter = first character of the enum name (`:69-78`): ANNUAL `A`, SICKNESS `S`, DOCTOR `D`, MATERNITY `M`, PARENTAL `P`, CARING `C`.
- Colour: alpha 1 for APPROVED, 0.5 otherwise (`:57-62`). `ColorService` singleton (`angular/src/app/app.module.ts:87`) assigns palette entries per requester **email** in first-seen order, cycling mod 15 (`angular/src/app/services/color.service.ts:40-59`). So a person's colour depends on the order leaves were first rendered in the session (affected by filters and data order) and can differ between sessions.
- Palette (`color.service.ts:3-19`), format `rgb(r,g,b)` / `rgba(r,g,b,a)` (`:29-33`):

| # | hex | rgb |
|---|---|---|
| 0 | `#86b6c9` | 134,182,201 |
| 1 | `#cf9f90` | 207,159,144 |
| 2 | `#adc26d` | 173,194,109 |
| 3 | `#43add4` | 67,173,212 |
| 4 | `#d193da` | 209,147,218 |
| 5 | `#fecd8f` | 254,205,143 |
| 6 | `#a7e278` | 167,226,120 |
| 7 | `#d2c6be` | 210,198,190 |
| 8 | `#1fc0bf` | 31,192,191 |
| 9 | `#f7c3d2` | 247,195,210 |
| 10 | `#ff8732` | 255,135,50 |
| 11 | `#c5b7ab` | 197,183,171 |
| 12 | `#a7dd98` | 167,221,152 |
| 13 | `#e2f3ca` | 226,243,202 |
| 14 | `#85eaf5` | 133,234,245 |

- No loading, empty or error state.

**Constraints**:
- FullCalendar React 7 (`@fullcalendar/react` with the `@fullcalendar/react/daygrid` plugin, the classic theme `@fullcalendar/react/themes/classic` and the peer `temporal-polyfill`; v7 has no separate `@fullcalendar/core` / `@fullcalendar/daygrid` packages), view `dayGridMonth`, lazy-loaded (brief: tech stack) (user decision 2026-11-11).
- "Stable" colour = deterministic per user across sessions, filters and devices: FNV-1a 32-bit of `User.id` mod 15 `(interview: UI defaults)`. Key = `User.id` (not email, which anonymization may change).
- Read-only: no drag, resize or selection.

**Business rules**:
- Visible events = LST-02 filtered leaves where `state !== 'REJECTED'`.
- Colour index: `colorIndex(userId) = fnv1a32(utf8(userId)) mod 15`, where FNV-1a 32-bit: `h = 2166136261`; for each byte `b`: `h = (h XOR b) * 16777619 mod 2^32`. Lives in `packages/shared` as `colorForUser(userId: string): { r, g, b }`.
  - Test vectors: `""` → hash 2166136261 → index 1; `"a"` → 3826002220 → index 10; `"user-1"` → 4115888500 → index 10; `"user-2"` → 4166221357 → index 7; `"106548781234567890123"` → 3697677917 → index 2.
  - Collisions between users are accepted (same as old cycling once more than 15 requesters).
- Alpha: `APPROVED` → 1 → `rgb(r,g,b)`; `PENDING` → 0.5 → `rgba(r,g,b,0.5)` (old rule "APPROVED 1 else 0.5"; REJECTED never rendered).
- Event mapping:
  - `id` = leave id; `allDay: true`; `start` = `startDate`; `end` = `addDays(endDate, 1)` as `YYYY-MM-DD` (FullCalendar end is exclusive). Example: 2026-12-21 → 2026-12-23 becomes `start: "2026-12-21", end: "2026-12-24"` and covers 21, 22, 23. Single day 2026-12-21 → `end: "2026-12-22"`.
  - `backgroundColor` and `borderColor` = the colour string above.
  - `title` = `` `${formatUserName(requester)} ${isHalfDay ? '1/2 ' : ''}(${letter})` `` with letter map ANNUAL `A`, SICKNESS `S`, DOCTOR `D`, MATERNITY `M`, PARENTAL `P`, CARING `C` (same letters in SK and EN UI, as in the spec title format). Examples: `Jana Nová (A)`, `Jana Nová 1/2 (D)`, `Peter Starý (deactivated) (S)`.
- Weekends and holidays are not styled specially (old none).

**Screens**: `/leaves`, view "Calendar".
- Header toolbar: left `prev,next today`, center `title`, right empty. Button texts from FullCalendar locale (EN `today`; SK locale file `sk`).
- Initial date: today = browser local date `(interview: UI defaults)`.
- First day of week: Monday when UI language is SK, Sunday when EN (`firstDay` 1 / 0) `(interview: UI defaults)`. Switching away and back resets to today (old: component recreated, `leaves-list.component.html:50`).
- `dayMaxEvents: false` (all events shown, cells grow; old `eventLimit: false`).
- Clicking an event does nothing.
- States:
  - Loading: calendar grid rendered with a spinner overlay "Loading leaves…".
  - Error: red alert above the calendar "Could not load leaves." + "Retry".
  - Calendar code (lazy chunk) fails to load: inline red alert "Could not load the calendar." / "Kalendár sa nepodarilo načítať." + "Retry" (imports the chunk again) in place of the calendar; the toolbar, filters and the List button stay usable (no router error page) (user decision 2026-11-11).
  - Empty (no visible events after filter and REJECTED removal): calendar rendered, info line above it "No leaves to show." (navigation still works).

**Acceptance criteria**:
- Given an APPROVED leave of Jana Nová 2026-12-21 → 2026-12-23 type ANNUAL, then the calendar for Dec 2026 shows `Jana Nová (A)` on 21, 22 and 23 and not on 24, with an opaque background.
- Given a PENDING half-day DOCTOR leave on 2026-12-10, then the event title is `Jana Nová 1/2 (D)` and its background alpha is 0.5.
- Given a REJECTED leave, then no event is shown for it, while it still appears in the list view.
- Given the same user on two browsers with different filters, then the user's events have the same colour.
- Given user id `user-2`, then its APPROVED events use `rgb(210,198,190)`.
- Given a requester filter set in list view, when switching to Calendar, then only that requester's events show.
- Given the user clicks "next", then the following month is shown; "today" returns to the current month.
- Given the UI language SK, then toolbar texts are Slovak, weeks start on Monday and titles keep the same type letters.
- Given the UI language EN, then weeks start on Sunday.

**Tests**:
- Unit (shared): `colorForUser` test vectors above and range 0–14; colour string for APPROVED / PENDING; `toCalendarEvent` (exclusive end incl. month and year boundary 2026-12-31 → `end: "2027-01-01"`, title with / without half-day, each type letter, deactivated suffix); REJECTED excluded.
- Unit (web, Vitest + Testing Library): calendar component renders loading, error + retry, empty message.
- E2E: seed leaves → Calendar view shows titles on the right days; PENDING computed background has alpha 0.5; REJECTED absent; prev / next / today navigation; same colour for a user after reload.

## Leave approval (APR)

### APR-01 — Approve / reject API

- **Type**: functional
- **Source**: `(rewrite spec: Features by area › Leave approval)` — "Approve / reject sets the state and records the approving admin"; "Approval screen and actions are admin-only on client and server"; "Denied actions return an explicit error, never a silent empty result"
- **Depends on**: DATA-02, LST-01, NFR-01, NFR-06, NOT-03

**Goal**: An admin approves or rejects any leave. The server sets `state` and `approverId` to the calling admin and returns the updated leave. Non-admins get 403; unknown leave ids get 404. Transitions are unrestricted, including same state, and an admin may approve their own leave. Each action writes an audit entry and triggers the requester notification (NOT-03).

**Old behavior**:
- `approveLeave` / `rejectLeave` (`server/graphql/leaveRelated.js:40-55`): `adminProtected`, `findOneAndUpdate({id}, {$set: {state, approverId: context.user.id}}, {new: true})`. No state check, no ownership check (admin may approve own leave), no email, no audit.
- Non-admin or anonymous → `null`, no error (`server/auth/rootResolverDecorators.js:22-29`).
- Unknown id: `findOneAndUpdate` returns null, then `toGQL(null)` builds a Leave via `Leave.toSerializable(null)`, giving an object without id whose `startDate` / `endDate` are the current time (`server/graphql/leaveRelated.js:46,58-62`, `src/data/Leave.js:4-25`, `src/data/dataUtil.js:3`), instead of an error.
- Client effects use `switchMap` without error handling (`angular/src/app/state/leave.effects.ts:37-45`): a failure ends the effect stream; a second click before the first response cancels the first subscription.

**Constraints**:
- Fully unrestricted transitions, any state → APPROVED / REJECTED, including same state (idempotent) `(client answer: Q-S2 + interview)`.
- Admin may approve / reject own leave `(client answer: Q-S1)`.
- Explicit errors, never null `(rewrite spec: Features by area › Leave approval)`.
- Audit for approve / reject `(rewrite spec: Non-functional requirements › Data privacy and compliance)` — "Audit log of who created, approved, rejected or deleted a leave …".
- `numDays`, dates, type, requester are not changed.

**Data model**: Leave (owner DATA-02) — writes:

| field | type | set by |
|---|---|---|
| `state` | `APPROVED` \| `REJECTED` | this endpoint |
| `approverId` | User.id | caller's id, always overwritten (also on same-state calls) |
| `updatedAt` | Date | Mongoose timestamps |

**API**:

`POST /api/leaves/:id/approve` and `POST /api/leaves/:id/reject`
- Auth: access JWT, active user with `isAdmin = true`.
- Path: `id` (string). No body (any body ignored).
- 200: updated `LeaveDto` (shape from LST-01, approver resolved to the caller).
- Errors:
  - 401 `AUTH_REQUIRED` (no token), `ACCESS_TOKEN_INVALID` / `ACCESS_TOKEN_EXPIRED` (bad token), `USER_DEACTIVATED` (deactivated caller).
  - 403 `FORBIDDEN` — authenticated non-admin (message `"Admin role required"`).
  - 404 `LEAVE_NOT_FOUND` — no leave with this id (message `"Leave not found"`); also for malformed ids.
- Check order: authentication → admin → existence. A non-admin always gets 403, even for unknown ids.
- Update is a single atomic `findOneAndUpdate({ id }, { $set: { state, approverId } }, { returnDocument: 'before' })`; the returned previous document gives `previousState` / `previousApproverId` for the audit and NOT-03, and the response DTO is built from it with the new values applied. Concurrent calls: last write wins.
- Side effects, after the DB write succeeds:
  1. Writes audit entry `LEAVE_APPROVED` / `LEAVE_REJECTED` (NFR-06) on every accepted call, including same-state calls, with actor = caller id, target = leave id, details `{ previousState, newState, previousApproverId }`.
  2. Triggers NOT-03 (requester email), fire-and-forget; mail failure never changes the HTTP result.

**Permissions**:

| Action | anon | user | admin (other's leave) | admin (own leave) | m2m |
|---|---|---|---|---|---|
| approve / reject | 401 | 403 | 200 | 200 | 401 |

UI: buttons only for admins (APR-02). Server enforces independently.

**Business rules**:

| Previous state | approve → | reject → |
|---|---|---|
| PENDING | APPROVED | REJECTED |
| APPROVED | APPROVED (idempotent, approverId = caller) | REJECTED |
| REJECTED | APPROVED | REJECTED (idempotent, approverId = caller) |

- Effect on other features: summary and attendance count APPROVED only, so a REJECTED → APPROVED change makes the leave count; APPROVED → REJECTED removes it.

**Acceptance criteria**:
- Given a PENDING leave and an admin, when POST approve, then 200, `state: "APPROVED"`, `approver.id` = admin id, audit `LEAVE_APPROVED` with `previousState: "PENDING"`.
- Given a PENDING leave, when POST reject, then `state: "REJECTED"`, approver = admin.
- Given a REJECTED leave, when approve, then 200 APPROVED.
- Given an APPROVED leave approved by admin A, when admin B approves again, then 200, state APPROVED, approver = B, audit entry written.
- Given the admin's own PENDING leave, when the admin approves it, then 200.
- Given a non-admin, when POST approve on any leave (existing or not), then 403 `FORBIDDEN` and the leave is unchanged.
- Given no token, then 401 `AUTH_REQUIRED`.
- Given an unknown id and an admin, then 404 `LEAVE_NOT_FOUND`.
- Given SMTP fails, when approving, then the response is still 200.
- Given approve succeeds, then `numDays`, dates, type and requester are unchanged.

**Tests**:
- Unit (api): service transition table (6 cases), approverId overwrite, audit payload builder.
- Integration (real MongoDB): every row of the permission table; every row of the transition table; own leave; 404 unknown and malformed id; non-admin + unknown id → 403; audit entry persisted with previous / new state; NOT-03 mail hook called with previous / new state (spy) and response unaffected when the mail service throws; response DTO shape.
- E2E: covered in APR-02.

### APR-02 — Approval screen + nav pending badge

- **Type**: functional
- **Source**: `(rewrite spec: Features by area › Leave approval)` — "Admin sees pending leaves with Approve / Reject; the row disappears after the action"; "Admin nav shows a badge with the pending count"; "Approval screen and actions are admin-only on client and server"; `(interview: State pick)` — admins get Approve and Reject on every `/leaves` list row
- **Depends on**: APR-01, LST-01

**Goal**: Admins open `/approval` and see all PENDING leaves with Approve and Reject buttons; after a successful action the row disappears and the nav badge count decreases. The nav shows a "Leaves approval" link with a red badge of the pending count, for admins only. Non-admins cannot open the screen. On the `/leaves` list, admins also get Approve and Reject on every row, so they can change a decided leave; the button matching the current state is disabled.

**Old behavior**:
- Route `approval` without guard (`angular/src/app/app-routing.module.ts:11`); nav link only for admins (`angular/src/app/nav-header/nav-header.component.html:22-27`).
- Screen title "Leaves approval"; columns Requester · Days · Type · State · actions; buttons "Approve" (green) and "Reject" (red) (`angular/src/app/leaves/leaves-approval/leaves-approval.component.html:1-33`). Days formatted like the list (`:17-18`).
- Data = all leaves filtered to `state === PENDING` on the client (`angular/src/app/services/leaves.service.ts:81-83,139-141`). The mutation returns `{id, state, approver}` and Apollo's normalized cache updates the leave, so the row disappears and the badge drops (`leaves.service.ts:117-131`, `nav-header.component.ts:27-31`).
- Badge: red `badge-danger` with count, hidden when 0 (`nav-header.component.html:25`). Count fetched for every logged-in user, displayed only for admins (`nav-header.component.ts:27-31`).
- No confirmation, no loading / empty / error state; errors only break the effect (`angular/src/app/state/leave.effects.ts:37-45`).
- Re-approving a REJECTED leave is possible only via the API; no UI shows non-pending leaves with actions.

**Constraints**:
- Admin-only on client and server `(rewrite spec: Features by area › Leave approval)`.
- Admin may act on own pending leave `(client answer: Q-S1)` — own leaves appear in the list like others.
- No confirmation dialog (spec requires confirmation only for remove / deactivate).
- `/approval` lists PENDING only; list-row buttons on `/leaves` for every state; no action returns a leave to PENDING `(interview: State pick)`.
- Transitions unrestricted on the server incl. same state `(interview: Transitions)`; the UI disables only the button for the current state.

**API**: uses `GET /api/leaves?state=PENDING` (LST-01) and `POST /api/leaves/:id/approve|reject` (APR-01). No new endpoint.

**Screens**:

`/approval` — admin only.
- Non-admin opening the URL: shared not-authorized view "You are not authorized to view this page!" (old React text `src/components/Unauthorized.js:6`, owned by the route guard task); no API call.
- Title: "Leaves approval".
- Table columns: "Requester" · "Days" · "Type" · "State" · actions. Formatting identical to LST-01 (display name, `start - end (n work days)`, readable labels).
- Order: same as LST-01 (`startDate` desc, `createdAt` desc, `id`) `(interview: UI defaults)`.
- Row actions: "Approve" (green), "Reject" (red). While a row's request is in flight both its buttons are disabled and only the clicked one shows a spinner (user decision 2026-11-11); other rows stay usable (requests independent, not cancelled).
- On success: invalidate React Query keys `['leaves', …]` (all states); the row disappears when the refetched PENDING list no longer contains it; toast "Leave approved." / "Leave rejected.".
- On error: row stays; red toast mapped from `code`: `LEAVE_NOT_FOUND` → "This leave no longer exists." (and refetch; like on success the buttons stay disabled until the refetched list no longer contains the row, so a second click sends nothing); `FORBIDDEN` → "You are not allowed to do this."; other / network → "Action failed. Try again.".
- Loading: spinner "Loading leaves…". Error: "Could not load leaves." + "Retry". Empty: "No pending leaves."

Nav (admin only):
- Link "Leaves approval" → `/approval`, with a red badge showing the PENDING count; badge hidden when the count is 0.
- Count source: same query `GET /api/leaves?state=PENDING` (key `['leaves', { state: 'PENDING' }]`), length of the array; fetched only when `me.isAdmin` is true. Refreshes after any leave create / delete / approve / reject in this browser (query invalidation) and on every window focus regardless of the 30 s staleTime (`refetchOnWindowFocus: 'always'`); `/approval` refetches on every open (`refetchOnMount: 'always'`) (user decision 2026-11-11). No polling (old none).
- Non-admins: link and badge not rendered, query not executed.

`/leaves` list rows (admin only) `(interview: State pick)`:
- Every row in the list view shows "Approve" (green) and "Reject" (red) next to Delete.
- The button matching the current state is disabled: APPROVED → "Approve" disabled; REJECTED → "Reject" disabled; PENDING → both enabled.
- There is no action that sets a leave back to PENDING.
- In flight: both buttons of that row disabled, a spinner only on the clicked one (user decision 2026-11-11). Success: invalidate `['leaves', …]`, toast "Leave approved." / "Leave rejected."; the row stays and shows the new state and approver. Errors: same toasts as `/approval`.
- Calendar view has no actions (LST-03).

**Permissions**:

| Item | user | admin |
|---|---|---|
| Nav link + badge | hidden | shown |
| Approve / Reject on `/leaves` rows | not rendered | rendered; current-state button disabled |
| `/approval` route | not-authorized view | screen |
| Approve / Reject buttons | never rendered | shown |
| Server calls | 403 (APR-01) | 200 |

**Acceptance criteria**:
- Given an admin and 3 PENDING leaves (one is the admin's own), then `/approval` lists 3 rows and the badge shows 3.
- Given the admin clicks Approve on a row, then after success the row disappears, the badge shows 2 and the list view shows the leave as Approved with the admin as approver.
- Given the admin clicks Reject, then the row disappears and the leave is hidden in the calendar.
- Given 0 pending leaves, then "No pending leaves." is shown and no badge is rendered.
- Given a non-admin, then the nav has no "Leaves approval" link, and opening `/approval` shows "You are not authorized to view this page!"
- Given the leave was deleted by its owner meanwhile, when the admin clicks Approve, then the toast "This leave no longer exists." appears and the row disappears after refetch.
- Given a network error on Approve, then the row stays and "Action failed. Try again." is shown; the buttons are usable again.
- Given a user creates a leave in the same browser as an admin session, then the badge increments without reload.
- Given an admin on `/leaves` and a REJECTED leave, then its "Reject" button is disabled and "Approve" is enabled; clicking Approve sets it APPROVED, the row shows Approved with the admin as approver, and its "Approve" button becomes disabled.
- Given an APPROVED leave, then "Approve" is disabled; clicking Reject sets it REJECTED.
- Given a PENDING leave on `/leaves`, then both buttons are enabled; approving it decrements the badge.
- Given a non-admin on `/leaves`, then no Approve / Reject buttons are rendered.

**Tests**:
- Unit (web): approval table renders states (loading, empty, error); buttons disabled while pending; badge hidden at 0; nav hides link for non-admin; list-row buttons: rendered only for admin, disabled state per current state (3 states).
- Integration: covered by APR-01 and LST-01.
- E2E (Playwright): admin approves → row gone + badge decrements + list shows Approved; admin rejects → calendar hides it; admin approves own leave; non-admin cannot see link and gets not-authorized at `/approval`; error toast on mocked 404; admin re-approves a REJECTED leave from the `/leaves` list row and rejects an APPROVED one.

## Leave summary (SUM)

### SUM-01 — Leave summary (API + screen)

- **Type**: functional
- **Source**: `(rewrite spec: Features by area › Leave summary)` — "User sees own work days per year and per leave type, clipped per year, years descending"; "Summary counts only APPROVED leaves"
- **Depends on**: DATA-02, WD-01, NFR-01, NFR-13

**Goal**: The caller sees, for each year, the sum of work days of their own APPROVED leaves per leave type. A leave crossing a year boundary is split, and each year counts only its own part. The server computes the summary with the shared WD-01 function.

**Old behavior**:
- Client-only: loads all leaves, keeps those with `requester.id === userInfo.id`, any state (`angular/src/app/leaves/summary/summary.component.ts:36-50`).
- Years run from the min start year to the max end year, descending, including years without leaves (`summary.component.ts:52-59`, lodash `rangeRight`).
- Per year: leaves overlapping the year, clipped to 1 Jan / 31 Dec (`summary.component.ts:60-83`). Grouped by type in first-seen order (`:85-95`). Each clipped part counted with `numWorkDays` (half-day rule included) (`:92-94`). Stored `numDays` is not used.
- Screen: per year `<h2>year</h2>`, then "Type: `<CODE>`" and "Count: **n**" (`summary.component.html:1-9`). No empty, loading or error state; no leaves → empty page.
- Nav: dropdown item "Summary" (`angular/src/app/nav-header/nav-header.component.html:35`).
- Old test: 3 leaves of one user, `numWorkDays` mocked to 5 → `[{2018, ANNUAL 10}, {2017, ANNUAL 10}]` (`summary.component.spec.ts:17-42,80-87`).

**Constraints**:
- APPROVED only (fix) `(rewrite spec: User decisions › Leave lifecycle rules; client answer: Q-A6)`.
- Own leaves only. Admins also see only their own summary (no spec line for other users' summaries).
- Recompute from dates (old behavior), not from stored `numDays`, so clipping is correct.
- Types are shown with labels (DATA-02).

**API**:

`GET /api/leaves/summary`
- Guard: authenticated, active user. No parameters (always the caller).
- 200:

```json
{
  "years": [
    { "year": 2018, "byType": [ { "type": "ANNUAL", "workDays": 7 } ] },
    { "year": 2017, "byType": [ { "type": "ANNUAL", "workDays": 7 } ] }
  ]
}
```

- No approved leaves → `{ "years": [] }`.
- 401 `AUTH_REQUIRED` / `ACCESS_TOKEN_INVALID` / `ACCESS_TOKEN_EXPIRED` / `USER_DEACTIVATED` (AUTH-02).

**Business rules** (shared function `buildLeaveSummary(leaves: {startDate,endDate,isHalfDay,type,state}[]): LeaveSummaryDto`, in `packages/shared`):
1. Keep `state === APPROVED`. The API passes only the caller's leaves (`requesterId = caller.id`).
2. If none remain → `years: []`.
3. `minYear` = min start year, `maxYear` = max end year. Years = `maxYear` down to `minYear`, including years with no leave. Such a year has `byType: []` (parity with old `rangeRight`) `(interview: UI defaults)`.
4. For year Y, each leave with `startYear <= Y <= endYear` is clipped to `[max(start, Y-01-01), min(end, Y-12-31)]`.
5. `workDays` = sum of `leaveWorkDays(clipped)` per type. `isHalfDay` is kept (a half-day leave is one day, so clipping never splits it).
6. `byType` holds only types with at least one leave in that year, ordered by `LEAVE_TYPES` enum order (change from old first-seen order) `(interview: UI defaults)`. A type whose leaves sum to 0 work days is still listed with `0`.

Worked example (old spec dates, all APPROVED, one user):
- L1 2017-12-10 → 2017-12-14 ANNUAL: Mon 11 – Thu 14 = 4.
- L2 2017-12-27 → 2018-01-05 ANNUAL: 2017 part 27–31 Dec = 3 (Wed, Thu, Fri); 2018 part 1–5 Jan = 4 (1 Jan holiday).
- L3 2018-01-10 → 2018-01-14 ANNUAL: Wed 10 – Fri 12 = 3.
- Result: `[{2018, [{ANNUAL, 7}]}, {2017, [{ANNUAL, 7}]}]`.
- Same data, L3 REJECTED and L1 PENDING → `[{2018, [{ANNUAL, 4}]}, {2017, [{ANNUAL, 3}]}]`.

**Screens**:

`/summary` — any logged-in active user; nav item "Summary" in the user menu.
- Title: "Leave summary".
- One section per year, descending: heading `<year>`. Table rows: "Type" (translated label) | "Work days" (number, `.5` shown as `2.5`).
- Year with `byType: []`: text "No approved leaves in this year." `(interview: UI defaults)`.
- Empty (`years: []`): "You have no approved leaves yet."
- Loading: spinner. Error: "Could not load the summary. Try again." with a "Retry" button.

**Permissions**: user and admin: own summary only (server reads `requesterId` from the session). Unauthenticated: 401 `AUTH_REQUIRED`; deactivated: 401 `USER_DEACTIVATED`.

**Acceptance criteria**:
- Given the worked-example leaves, then the API returns the listed result.
- Given another user's APPROVED leaves, then they never appear in the caller's summary.
- Given only PENDING / REJECTED own leaves, then `years: []` and the empty text shows.
- Given approved leaves in 2023 and 2025 only, then years are 2025, 2024 (empty), 2023.
- Given ANNUAL and SICKNESS in one year, then ANNUAL is listed before SICKNESS.
- Given an approved half-day on a working day, then it adds 0.5.
- Given a leave approved after the page loaded, when the user reopens `/summary`, then the new value shows (query invalidated by approve / create / delete).

**Tests**:
- Unit (shared): `buildLeaveSummary` with the old spec dataset in real-count form (7 / 7) and the state-filtered variant (4 / 3); empty input; empty year between two years; type order; half-day; a leave spanning 3 years (2024-12-30 → 2026-01-02) is split into 3 parts.
- Integration: endpoint returns only caller's APPROVED leaves; 401 without session.
- E2E: admin approves a leave → requester's `/summary` shows its work days under the right year and type.

## Work-day rules (WD)

### WD-01 — Working-day and leave work-day calculation

- **Type**: functional
- **Source**: `(rewrite spec: Features by area › Work-day rules)` — "A working day is Monday–Friday and not a Slovak public holiday"; "Leave work days = working days in [start, end] inclusive, minus 0.5 for a half-day; existing test examples (3, 4, 2.5) keep passing". `(client answer: Q-S9)` — "old data from 2017 is no longer valid. we need refresh our data"
- **Depends on**: SET-01

**Goal**: One pure TypeScript module in `packages/shared` decides whether a calendar date is a working day and counts a leave's work days. The API (LV-01, SUM-01, ATT-*, MIG-01) and the web form (LV-02) use the same function. Holiday data comes from the latest pinned `date-holidays`, country `SK`, public holidays only.

**Old behavior**:
- Client count: start and end are normalized to 12:00 local, every day in [start, end] inclusive is checked, `count -= 0.5` only when `count > 0 && isHalfDay` (`angular/src/app/services/holiday-count.service.ts:10-18,29-46`).
- Working day = ISO weekday < 6 and `!holidays.isHoliday(date)` for `new Holidays('SK')` (`angular/src/app/services/holiday-count.service.ts:22,48-59`). The server copy uses `new Date(str).getDay()` and the same `isHoliday` (`server/service/tripService.js:4-5,41-45`).
- `isHoliday` matches any rule type, observances included. With date-holidays 1.2.0 (`package.json:19`, `angular/package.json:41`) the only observances (Easter Sunday, Mother's Day) fall on Sundays, so this did not change counts.
- End before start: the loop never runs, result 0 (`holiday-count.service.ts:35`).
- Tests: `holiday-count.service.spec.ts:30-53` (3, 4, 2.5).

**Constraints**:
- Old 2017 holiday data is invalid; refresh `(client answer: Q-S9)`. Pin exactly in `packages/shared/package.json` the `date-holidays` version that is current at implementation time (3.38.0 on 2026-11-04). The year-specific unit tests below guard the SK rules: a version bump that changes them fails CI. The client confirms the 2026 SK public-holiday list as part of the functional spec (DOC-01) `(interview: Holidays)`.
- The current upstream SK data (`date-holidays` repo `data/countries/SK.yaml`) changes these days from public to `observance` (= working day):
  - `09-01` (Constitution Day) since 2024
  - `11-17` (Struggle for Freedom and Democracy Day) since 2025
  - `05-08` (Day of Victory over Fascism) since 2026
  - `09-15` (Our Lady of the Seven Sorrows) since 2026
  
  Because these observances now fall on weekdays, the function MUST count only holidays with `type === 'public'`. Old `isHoliday()` without a type filter would be wrong.
- Calendar-date arithmetic only (strings `YYYY-MM-DD`). No `Date` at local time, no timezone. This removes the old local-time dependence.

**Business rules**:

Public SK holidays per the current upstream data (2026; confirmed by the client in DOC-01 `(interview: Holidays)`):

| date | name | 2026 weekday |
|---|---|---|
| 01-01 | Day of the Establishment of the Slovak Republic | Thu |
| 01-06 | Epiphany | Tue |
| Easter −2 (2026-04-03) | Good Friday | Fri |
| Easter +1 (2026-04-06) | Easter Monday | Mon |
| 05-01 | Labour Day | Fri |
| 07-05 | Saints Cyril and Methodius Day | Sun |
| 08-29 | Slovak National Uprising anniversary | Sat |
| 11-01 | All Saints' Day | Sun |
| 12-24 | Christmas Eve | Thu |
| 12-25 | Christmas Day | Fri |
| 12-26 | St. Stephen's Day | Sat |

Historic years keep their historic rules (e.g. 2017 still has 05-08, 09-01, 09-15, 11-17 as public), so old test examples keep passing.

Exports (`packages/shared/src/workdays.ts`):
- `isWorkingDay(date: IsoDate): boolean` = weekday is Mon–Fri AND `date` is not in `publicHolidays(year)`.
- `publicHolidays(year: number): Set<IsoDate>` = `new Holidays('SK').getHolidays(year)` filtered to `type === 'public'`, mapped to the first 10 chars of `h.date` (`'2026-01-01 00:00:00'` → `'2026-01-01'`). Cache per year.
- `countWorkingDays(start: IsoDate, end: IsoDate): number` = number of `d` with `start <= d <= end` and `isWorkingDay(d)`. Returns 0 when `end < start`.
- `leaveWorkDays({ startDate, endDate, isHalfDay }): number` = `c = countWorkingDays(startDate, endDate)`; return `isHalfDay && c > 0 ? c - 0.5 : c`.
  - The `c > 0` condition is kept: a half-day on a weekend or holiday gives 0, never −0.5.
  - The function does not validate the half-day rule (LV-01 does), so the old multi-day half-day test still gives 2.5.
- Invalid date strings throw `RangeError`.

Worked examples:

| start | end | half | result | why |
|---|---|---|---|---|
| 2017-12-07 | 2017-12-11 | no | 3 | Thu, Fri, Mon (old spec :30-36) |
| 2017-12-22 | 2017-12-30 | no | 4 | 25 + 26 Dec holidays, 23/24/30 weekend (old spec :38-44) |
| 2017-12-11 | 2017-12-13 | yes | 2.5 | 3 − 0.5 (old spec :46-53) |
| 2026-11-04 | 2026-11-04 | yes | 0.5 | Wed |
| 2026-11-07 | 2026-11-07 | yes | 0 | Sat, `c = 0`, no −0.5 |
| 2026-11-10 | 2026-11-09 | no | 0 | end < start |
| 2026-04-02 | 2026-04-07 | no | 2 | Thu 2, Tue 7; Good Friday + Easter Monday |
| 2026-12-21 | 2026-12-31 | no | 7 | 24, 25 Dec holidays; 26, 27 weekend |
| 2026-05-08 | 2026-05-08 | no | 1 | observance since 2026 (Fri) |
| 2025-05-08 | 2025-05-08 | no | 0 | public until 2025 (Thu) |
| 2026-09-15 | 2026-09-15 | no | 1 | observance since 2026 (Tue) |
| 2025-09-15 | 2025-09-15 | no | 0 | public until 2025 (Mon) |
| 2025-11-17 | 2025-11-17 | no | 1 | observance since 2025 (Mon) |
| 2023-11-17 | 2023-11-17 | no | 0 | public until 2024 (Fri) |
| 2025-09-01 | 2025-09-01 | no | 1 | observance since 2024 (Mon) |
| 2023-09-01 | 2023-09-01 | no | 0 | public until 2023 (Fri) |

**Acceptance criteria**:
- Given each row above, then the function returns the listed result.
- Given any date, the result is the same in a process running with `TZ=UTC`, `TZ=Europe/Bratislava` and `TZ=America/Los_Angeles`.
- Given a year in which an observance falls on a weekday, then that day counts as working.

**Tests**:
- Unit (Vitest, shared): every worked example; `publicHolidays(2026)` equals the 11 dates in the table; `publicHolidays(2017)` contains 05-08, 09-01, 09-15, 11-17; TZ independence (run the suite with 3 `TZ` values in CI matrix or via `process.env.TZ` per worker); invalid input `'2026-02-30'` throws `RangeError`; a 10-year range completes in under 50 ms (guards the per-year cache).
- Unit (web): the add-leave form (LV-02) shows the same numbers for the 2017 examples.

## Notifications (NOT)

### NOT-01 — Mail service foundation

- **Type**: derived
- **Source**: `(rewrite spec: Features by area › Notifications)` — "When SMTP is not configured, no email is sent and a log line is written"; `(rewrite spec: User decisions › Integration testability)` — "Local mail catcher for SMTP in dev and tests". Needed by NOT-02 and NOT-03.
- **Depends on**: SET-02, SET-04

**Goal**: A NestJS `MailService` sends HTML email over SMTP with Nodemailer when SMTP is configured, and otherwise skips sending and writes one log line. Sending is fire-and-forget: callers never wait on SMTP and a mail failure never fails the business operation. Dev and tests use Mailpit from docker-compose.

**Old behavior**:
- Config check: `SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASSWORD` all non-empty (`server/service/mailService.js:6`). `SMTP_SECURE === 'true'` → TLS (`:10`). Sender `MAIL_SENDER` (`:33`).
- Not configured: log `Email should be send now, but environmental properties for SMTP are not set.` (`:45-47`).
- Send via callback; error → `console.log(error)`; success → `Message %s sent: %s` (`:38-44`). No retry, no await by caller (`server/graphql/leaveRelated.js:27-29`).
- Env names documented in `README.md:84-97`; prod values in `kubernetes/cestaky.yml:40-60` (`SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_SENDER`, `APPROVAL_MAIL_RECEIVER`, `BASE_URL`, `NODE_ENV`).

**Constraints**:
- Emails only in English `(client answer: Q-S10)`.
- Secrets (`SMTP_USER`, `SMTP_PASSWORD`) from k8s secrets only `(rewrite spec: User decisions › Platform and delivery)`.
- Nodemailer over SMTP; Mailpit in docker-compose (brief: tech stack).

**API**: internal service, no HTTP endpoint.
- `isConfigured(): boolean`
- `send(message: { to: string; subject: string; html: string; context: { template: string; leaveId?: string } }): void` — returns immediately; the send runs in the background; never throws or rejects to the caller.

**Integrations**:
- Env var names: `SMTP_HOST`, `SMTP_PORT` (integer), `SMTP_SECURE` (`"true"` → TLS from connect, anything else → STARTTLS if offered), `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_SENDER` (From address), `BASE_URL` (link base, used by templates), `DEFAULT_TIMEZONE` (default `Europe/Bratislava`).
- Configured = `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` all non-empty (old rule kept, `(interview: Remaining)`).
- Config validation at startup `(interview: Remaining)`: if configured and `MAIL_SENDER` is empty → app fails to start with `"MAIL_SENDER is required when SMTP is configured"`. If `SMTP_PORT` is not an integer → fails to start.
- One Nodemailer transport created at startup; timeouts `connectionTimeout` 10 s, `greetingTimeout` 10 s, `socketTimeout` 20 s.
- Not configured: no transport; each `send` writes one log line at level `warn`: `Email not sent: SMTP is not configured (template=<template>, leaveId=<id>)`.
- Success: log `info` `Email sent (template=<template>, leaveId=<id>, messageId=<id>)`.
- Failure (connection, auth, rejected recipient): log `error` `Email failed (template=<template>, leaveId=<id>): <error message>`; no retry; caller unaffected.
- Recipient addresses are not written to logs (PII).
- All interpolated user values in HTML are HTML-escaped by the template helpers.
- Dev / tests: docker-compose service `mailpit` (image `axllent/mailpit`, pinned tag), SMTP port 1025, web / API port 8025, env `MP_SMTP_AUTH_ACCEPT_ANY=1` and `MP_SMTP_AUTH_ALLOW_INSECURE=1` so the old four-var rule (with dummy user / password) works without TLS. App env in compose: `SMTP_HOST=mailpit`, `SMTP_PORT=1025`, `SMTP_SECURE=false`, dummy `SMTP_USER` / `SMTP_PASSWORD`, `MAIL_SENDER`. Tests read messages via Mailpit API `GET /api/v1/messages` and clear with `DELETE /api/v1/messages` (base URL from test env var `MAILPIT_API_URL`).

**Acceptance criteria**:
- Given all four SMTP vars set and Mailpit running, when `send` is called, then Mailpit receives the message with From = `MAIL_SENDER`, given To, subject and HTML.
- Given `SMTP_PASSWORD` empty, when `send` is called, then nothing is sent and exactly one `warn` line `Email not sent: SMTP is not configured …` is logged.
- Given SMTP configured and `MAIL_SENDER` empty, then the app does not start.
- Given the SMTP server is unreachable, when a leave action triggers `send`, then the HTTP response is unaffected and an `error` log line is written.
- Given a requester first name `<b>x</b>`, then the email shows the literal text, not bold markup.

**Tests**:
- Unit: `isConfigured` for every combination of missing var; config validation errors; HTML escape helper.
- Integration (Mailpit in docker-compose / CI service): send delivers; unreachable host (port with nothing listening) logs error and does not throw; not configured logs warn line and Mailpit stays empty.

### NOT-02 — New-leave email to approver

- **Type**: functional
- **Source**: `(rewrite spec: Features by area › Notifications)` — "New leave sends an email to the configured approver address (`APPROVAL_MAIL_RECEIVER`, prod `pm@instea.co`) with requester, date range in the default timezone, type and an Approve link"; "Approve link in the email points to the real approval screen URL"
- **Depends on**: NOT-01, DATA-01, DATA-02

**Goal**: After a leave is created and saved, the server sends one email to `APPROVAL_MAIL_RECEIVER` with the requester's name, date range, readable type and a link to the approval screen `BASE_URL + /approval`. The email is English only and fire-and-forget.

**Old behavior**:
- Trigger: after `createLeave` save, not awaited (`server/graphql/leaveRelated.js:27-29`).
- Recipient `process.env.APPROVAL_MAIL_RECEIVER` only (`server/service/mailService.js:19`); prod `pm@instea.co` (`kubernetes/cestaky.yml:59-60`).
- Subject `New leave notification` (`mailService.js:19`).
- HTML body (`mailService.js:22-29`), exactly:
  ```html
  <h4>New leave was created and need to be approved.</h4><b>Requester: </b> {firstName} {surname}<br><b>Days: </b>{start} - {end}<br><b>Type: </b>{TYPE_CODE}<br><a href="{approvalUrl}">Approve</a>
  ```
- Dates: moment-timezone `dddd, MMM D, YYYY` in `DEFAULT_TIMEZONE` (default `Europe/Bratislava`) (`mailService.js:50-54`), e.g. `Monday, Dec 4, 2017`.
- Type printed as raw code, e.g. `ANNUAL` (`mailService.js:27`), although the server has labels (`src/data/LeaveType.js:2-9`).
- Link: `BASE_URL + '/leaves/approval'` when `NODE_ENV=production`, else `BASE_URL + '/approval'`; `BASE_URL` default `''` (`server/service/urlService.js:1-8`). Prod `BASE_URL=https://cestaky.instea.co` (`kubernetes/cestaky.yml:41-42`).
- Half-day flag and work-day count are not in the email.
- Requester missing → placeholder `Deleted <id>` (`mailService.js:18`, `server/service/userService.js:3-18`).

**Constraints**:
- Only `APPROVAL_MAIL_RECEIVER` `(client answer: Q-S13)`.
- English only `(client answer: Q-S10)`.
- Readable type label `(rewrite spec: Features by area › Leave requests)`.
- New SPA route is `/approval` at the root of `BASE_URL` (brief: SPA routes; one SPA, no `/leaves/` prefix for the approval screen).

**Notifications and jobs**:
- Trigger: leave created (LV-01), after the DB insert succeeds; fire-and-forget via NOT-01.
- Recipient: value of `APPROVAL_MAIL_RECEIVER`. If empty `(interview: Remaining)`: no email, log `warn` `Email not sent: APPROVAL_MAIL_RECEIVER is not set (template=leave-created, leaveId=<id>)`.
- Subject: `New leave notification`.
- HTML body (old text kept except: typo "need" fixed to "needs" `(interview: UI defaults)`, readable type label, new URL):
  ```html
  <h4>New leave was created and needs to be approved.</h4>
  <b>Requester: </b> {firstName} {surname}<br>
  <b>Days: </b>{startFormatted} - {endFormatted}<br>
  <b>Type: </b>{typeLabelEn}<br>
  <a href="{BASE_URL}/approval">Approve</a>
  ```
  - `{firstName} {surname}` of the requester (HTML-escaped); the requester is the caller, so it always exists.
  - Dates: date-fns format `EEEE, MMM d, yyyy`, locale `en-US`, e.g. `Monday, Dec 21, 2026`. Leave dates are calendar dates (`YYYY-MM-DD`), so they are formatted as-is; `DEFAULT_TIMEZONE` cannot shift them (old shifted instants into the zone).
  - `{typeLabelEn}`: EN label from the shared type label map (LV-01): Annual leave, Sick leave, Doctor visit, Maternity leave, Parental leave, Caring for a relative at home `(interview: UI defaults)`.
  - Link: `BASE_URL` with trailing `/` removed, plus `/approval`; prod `https://cestaky.instea.co/approval`. If `BASE_URL` is empty, the link is `/approval` (old fallback) and a `warn` is logged once at startup `BASE_URL is not set; email links will be relative` `(interview: Remaining)`.
- Template id for logs: `leave-created`.

**Integrations**: env `APPROVAL_MAIL_RECEIVER`, `BASE_URL`, plus NOT-01 vars.

**Acceptance criteria**:
- Given SMTP configured (Mailpit) and `APPROVAL_MAIL_RECEIVER=approver@example.test`, `BASE_URL=https://cestaky.example.test`, when Jana Nová creates an ANNUAL leave 2026-12-21 → 2026-12-23, then one email arrives to `approver@example.test` with subject `New leave notification`, body containing `Jana Nová`, `Monday, Dec 21, 2026 - Wednesday, Dec 23, 2026`, the ANNUAL EN label, and a link `https://cestaky.example.test/approval`.
- Given `BASE_URL=https://cestaky.example.test/`, then the link is `https://cestaky.example.test/approval` (no double slash).
- Given `NODE_ENV=production`, then the link is still `{BASE_URL}/approval` (no `/leaves/approval`).
- Given `APPROVAL_MAIL_RECEIVER` empty, then no email and the warn line is logged; the create still returns success.
- Given SMTP not configured, then no email, NOT-01 warn line, create succeeds.
- Given `DEFAULT_TIMEZONE=America/New_York`, then the email dates are the same calendar dates.
- Given a requester surname `O'Neil <x>`, then the body shows it escaped.
- Given a logged-out admin opens the link, then after login they land on `/approval` (route guard task).

**Tests**:
- Unit: template renderer (exact HTML for a fixture, each type label, half-day leave renders same as full day, escaping, URL join with / without trailing slash, empty `BASE_URL`); date formatter.
- Integration (Mailpit): `POST` create leave → message in Mailpit with expected To / Subject / HTML; receiver unset → no message + warn; SMTP unset → no message.
- E2E: create a leave in the UI → Mailpit API has one message whose link path is `/approval`.

### NOT-03 — Approved / rejected email to requester

- **Type**: functional
- **Source**: `(rewrite spec: User decisions › Notifications)` — "Requester gets an email when their leave is approved or rejected"
- **Depends on**: NOT-01, DATA-01, DATA-02

**Goal**: When an admin approves or rejects a leave, the requester gets an English email with the decision, the leave dates and type, the deciding admin and a link to the leaves page. Sending is fire-and-forget. Text and send rules decided `(interview: Decision mail)`.

**Old behavior**: New — no counterpart in the old system (`approveLeave` / `rejectLeave` send nothing, `server/graphql/leaveRelated.js:40-55`; analysis §2.7 confirms "no notification").

**Constraints**:
- English only `(client answer: Q-S10)`.
- Style mirrors NOT-02 (`server/service/mailService.js:22-29`).

**Notifications and jobs**:
- Trigger: APR-01 approve or reject succeeds. Send only when the state changed (`previousState !== newState`); a same-state re-approve / re-reject sends nothing `(interview: Decision mail)`.
- Recipient: requester's `User.email`. Skip (log `info` `Email not sent: requester inactive (template=<template>, leaveId=<id>)`) when the requester is deactivated (`active=false`) or anonymized (`anonymizedAt` set) `(interview: Decision mail)`.
- Admin acting on own leave: email is sent to the admin like to any requester.
- Template ids: `leave-approved`, `leave-rejected`.
- Subject: `Your leave was approved` / `Your leave was rejected` `(interview: Decision mail)`.
- HTML body (English only, `(client answer: Q-S10)`):
  ```html
  <h4>Your leave was approved.</h4>
  <b>Days: </b>{startFormatted} - {endFormatted}<br>
  <b>Type: </b>{typeLabelEn}<br>
  <b>Approved by: </b>{adminFirstName} {adminSurname}<br>
  <a href="{BASE_URL}/leaves">Open leaves</a>
  ```
  Rejected variant: `<h4>Your leave was rejected.</h4>` and `<b>Rejected by: </b>`; rest identical.
  - Date format and link base rules as NOT-02 (`EEEE, MMM d, yyyy`, en-US; `BASE_URL` trailing slash removed; empty → relative `/leaves`).
  - All names HTML-escaped.

**Integrations**: NOT-01 env vars, `BASE_URL`.

**Acceptance criteria**:
- Given Jana's PENDING ANNUAL leave 2026-12-21 → 2026-12-23 and admin Peter Admin, when Peter approves, then Jana's email receives subject `Your leave was approved`, body with `Monday, Dec 21, 2026 - Wednesday, Dec 23, 2026`, the EN type label, `Approved by: Peter Admin` and link `{BASE_URL}/leaves`.
- When Peter rejects a PENDING leave, then subject `Your leave was rejected` and `Rejected by: Peter Admin`.
- Given a REJECTED leave, when approved, then an approved email is sent.
- Given an APPROVED leave, when approved again, then no email is sent.
- Given the requester is deactivated, when the leave is approved, then no email and an info line is logged; API returns 200.
- Given SMTP not configured, then API returns 200 and NOT-01 warn line is logged.
- Given SMTP fails, then API returns 200 and an error line is logged.

**Tests**:
- Unit: template renderer (approved / rejected exact HTML, escaping); decision function `shouldNotify(previousState, newState, requester)` for all 9 state pairs × active / deactivated / anonymized.
- Integration (Mailpit): approve PENDING → one message to requester; reject → one message; re-approve APPROVED → none; REJECTED → APPROVED → one; deactivated requester → none.
- E2E: admin approves in UI → Mailpit has the requester email.

## Attendance API (M2M) (ATT)

### ATT-01 — Attendance endpoint, M2M Basic auth and error contract

- **Type**: functional
- **Source**: `(rewrite spec: Features by area › Attendance API (M2M))` — "`GET /api/attendence/:year/:month` keeps its path, Basic M2M auth and JSON contract `{start, end, attendence:{<name>:{days:[{logged_time, leave}], total, contractType}}}`"; "Error responses keep their status and text: 400 `Month is not a number.` / `Year is not a number.`, 401, 500 SSO / Toggl messages"; `(rewrite spec: User decisions › Scope)` — "Attendance API stays 1:1, including SSO and Toggl"; `(client answer: Q-S6)` constant-time M2M credential compare.
- **Depends on**: ATT-02, ATT-03, ATT-04

**Goal**: Expose `GET /api/attendence/:year/:month` in `apps/api` with the same path, HTTP Basic M2M authentication and response/error contract as the old Express handler. The controller validates the two path params exactly like the old code, delegates to the attendance assembly (ATT-04), and maps service failures to the old 500 bodies. Credentials are compared in constant time. The endpoint is the only route guarded by Basic auth; it does not use the app's JWT auth or the app error-body convention.

**Old behavior**:
- Wiring: `server/index.js:47` calls `setupAttendenceApi(app)`; `server/api/attendenceApi.js:22` mounts `httpBasicAuthentication` on `'/api/*'` (all `/api/...` paths, not only attendance) and `:23` registers `GET /api/attendence/:year/:month`. Global `cors()` with defaults applies (`server/index.js:37`), so responses carry `Access-Control-Allow-Origin: *`. The JWT middleware mounted before it (`server/auth/setup.js:20-23`, `credentialsRequired: false`) ignores a `Basic` scheme header, so it does not interfere.
- Auth (`server/api/attendenceApi.js:4-19`): parses the header with `basic-auth` 2.0.1 (scheme `Basic`, case-insensitive; credentials split at the first `:`, so passwords may contain `:`). Access is granted only if `M2M_USERNAME` and `M2M_PASSWORD` are both set and non-empty (`:8`, truthiness check), and both match with `===` (`:9-10`, not constant-time). Any failure, including a missing or malformed header, returns `res.status(401).end()` (`:5`): status 401, empty body, no `WWW-Authenticate` header.
- Validation (`server/api/attendenceApi.js:27-39`): month is checked first, then year, using global `isNaN(<string>)` (that is, `Number(param)` is `NaN`). Failure returns status 400 with JSON body `{"message":"Month is not a number."}` or `{"message":"Year is not a number."}` (`res.json`, `Content-Type: application/json; charset=utf-8`). If both are invalid, only the month message is returned. No range or integer check exists.
- Success (`:41-48`): `getAttendenceData(year, month)`; if it returns `error`, status 500 with `{"message": <error>}` (`:43-47`); else status 200 with the assembled object (`:48`).
- 500 texts: `Cannot get data from SSO, try again later.` (`server/service/attendenceService.js:135`) and `Cannot get data from Toggl, try again later.` (`:152`).
- Any other thrown error (DB error, the missing-`togglUserId` TypeError at `:65`) is an unhandled promise rejection in an Express 4 async handler: no response is sent and the request hangs (`server/api/attendenceApi.js:41` has no try/catch).
- Out-of-range numeric params are not rejected. `server/service/attendenceService.js:123-124` builds `moment().year(year).month(month - 1)`; moment 2.19.3 `setMonth` (`node_modules/moment/moment.js:1034-1057`) passes the number to `Date#setMonth`, which overflows: month `13` → January of `year+1`, month `0` → December of `year-1`, month `-1` → November of `year-1`. `start`, `end`, the days array and the Toggl dates follow the shifted month, but no leave codes are written because the leave loop compares `m.month()` with the raw `month - 1` (`:60`, `:159`), which is outside 0–11. Non-integer values (for example `1.5`) are truncated by `Date#setMonth` and also yield no leave codes. `Infinity` yields an invalid moment, `start`/`end` = `Invalid date`, and then whatever SSO/Toggl return.
- Docs: `README.md:106-117` (month 1–12, env vars `M2M_USERNAME`, `M2M_PASSWORD`, `SSO_URI`, `SSO_USERNAME`, `SSO_PASSWORD`).

**Constraints**:
- Path spelling `attendence` and the old error bodies stay (rewrite spec: Known quirks "Attendance contract quirks (path spelling `attendence`, name-keyed output) stay for compatibility"; canonical registry: "Attendance endpoint keeps OLD contract"). The old 400 and 500 bodies are JSON `{"message": "..."}`; the 401 body is empty with no `WWW-Authenticate`. The new endpoint reproduces exactly that.
- Constant-time compare (client answer: Q-S6).
- Env var `TOGGL_REPORTS_BASE_URL` is part of the final env list (canonical registry); see ATT-03.
- Basic auth applies only to this route. Other `/api/...` routes use the JWT session (brief: Auth). Old global `/api/*` Basic guard is not carried over.
- CORS: the app restricts CORS globally to the `BASE_URL` origin (client answer: Q-S6). The attendance route sends no CORS headers; the old wildcard `Access-Control-Allow-Origin: *` is dropped. **Assumption:** the M2M consumer calls the endpoint server-side, not from a browser. MIG-03 / MIG-04 include a pre-cutover check of this with the consumer owner.
- Safe fixes (interview: Attendance), each an expected parity diff in MIG-03: non-finite year/month → 400 with the old text; non-integer values truncated like old; unexpected error → 500 `{"message":"Internal server error"}`; 30 s timeout per SSO/Toggl request (ATT-02, ATT-03); max 5 redirects; leave days checked by year+month (ATT-04); employee without `togglUserId` skipped entirely (ATT-04).
- The hang is fixed (rewrite spec: "An employee without `togglUserId` who has leaves no longer hangs the request"); see ATT-04.
- OpenAPI documents this endpoint with an `http`/`basic` security scheme (rewrite spec: Documentation "API docs: OpenAPI for the app API and the M2M attendance API").

**API**:
- `GET /api/attendence/:year/:month`
  - Auth guard: `M2mBasicAuthGuard` (name is a design choice). Reads `Authorization`. Rules:
    1. If `M2M_USERNAME` or `M2M_PASSWORD` is unset or empty → 401.
    2. If the header is missing, not scheme `Basic` (case-insensitive), or not decodable as `user:pass` (split at first `:`) → 401.
    3. Compare username and password each with `crypto.timingSafeEqual` over SHA-256 digests of the UTF-8 bytes (equal-length buffers, no early exit on length). Evaluate both comparisons, then AND them. Mismatch → 401.
    4. 401 response: status 401, empty body, no `WWW-Authenticate` header, no app error body.
  - Param validation (in this order): if `Number(month)` is `NaN` or not finite → 400 `{"message":"Month is not a number."}`; else if `Number(year)` is `NaN` or not finite → 400 `{"message":"Year is not a number."}`. The non-finite check (`Infinity`, `-Infinity`, `1e400`) is a safe fix (interview: Attendance); old returned 200/500 with `Invalid date`. Note `Number('')`, `Number(' ')` = 0 are valid like old `isNaN`.
  - Year/month normalization (preserved quirk): `y = Math.trunc(Number(year))`, month index `mi = Math.trunc(Number(month) - 1)` (truncation toward zero like old `Date#setFullYear` / `Date#setMonth`; e.g. month `1.5` → January, month `0.5` → `mi` 0 → January); effective year `Y = y + floor(mi / 12)`, effective month `M = mod(mi, 12) + 1`. Response, days and Toggl dates use (Y, M). Leave codes are written only when the raw `Number(month)` is an integer in 1–12 (old comparison against raw `month - 1`); otherwise every `leave` is `''`.
  - 200 body: exactly as ATT-04, `Content-Type: application/json; charset=utf-8`.
  - 500 body: `{"message":"Cannot get data from SSO, try again later."}` or `{"message":"Cannot get data from Toggl, try again later."}`.
  - 500 for any other unexpected error (DB failure, programming error): `{"message":"Internal server error"}` (interview: Attendance); never a hung request. Error is logged without secrets.
  - The NestJS global exception filter that produces `{statusCode, code, message}` must be bypassed for this controller (dedicated exception filter or direct response writing).
  - Other methods on the path: 404 (old fell through to default Express 404); not part of the contract.
  - Trailing slash `/api/attendence/2024/3/` is accepted like Express non-strict routing.
  - Side effects: outbound SSO and Toggl calls (ATT-02, ATT-03). No audit entry, no DB writes.

**Permissions**:

| Caller | Result |
|---|---|
| Valid M2M Basic credentials | 200 / 400 / 500 |
| Missing or wrong Basic credentials | 401 |
| App user with Bearer JWT only (any role) | 401 |
| M2M credentials on any other `/api/...` route | Not accepted (that route's own auth applies) |

**Integrations**: env `M2M_USERNAME`, `M2M_PASSWORD` (from k8s secret). Plus ATT-02 / ATT-03 env vars.

**Acceptance criteria**:
- Given no `Authorization` header, when `GET /api/attendence/2024/3`, then 401 with empty body.
- Given `Authorization: Bearer <valid app JWT>`, then 401.
- Given correct username and wrong password, then 401; given wrong username and correct password, then 401.
- Given `M2M_PASSWORD` unset, when the request carries username and an empty password, then 401.
- Given a password containing `:`, when credentials are correct, then 200.
- Given scheme `basic` (lowercase) with correct credentials, then 200.
- Given valid auth and month `abc`, then 400 `{"message":"Month is not a number."}`.
- Given valid auth and year `abc`, month `3`, then 400 `{"message":"Year is not a number."}`.
- Given valid auth, year `abc` and month `abc`, then 400 with the month message.
- Given valid auth and month `13` for year `2024`, then 200 with `start` `2025-01-01`, `end` `2025-01-31`, 31 days, Toggl dates for January 2025, and every `leave` = `''`.
- Given valid auth and month `0` for year `2024`, then 200 with `start` `2023-12-01`, `end` `2023-12-31`, no leave codes.
- Given SSO fails, then 500 `{"message":"Cannot get data from SSO, try again later."}`.
- Given Toggl fails for any employee, then 500 `{"message":"Cannot get data from Toggl, try again later."}` and no partial data.
- Given the DB is unreachable during leave lookup, then the response is 500 within the request timeout (no hang).
- Given `NODE_ENV=production`, the endpoint is still served and is listed in the OpenAPI document generated at build/test time.

**Tests**:
- Unit: guard (all 401 branches; constant-time compare called for both fields even when username mismatches; unset/empty env); param validation incl. `abc`, `1e1` (=10, valid), `03`, `-1`, `13`, `0`, both invalid; year/month normalization table (`2024/13`→2025-01, `2024/0`→2023-12, `2024/-1`→2023-11, `2024/24`→2025-12, `2024/25`→2026-01).
- Integration (Vitest + real MongoDB 8 + TST-04 mocks): full request through Nest for each acceptance criterion; assert exact status, exact body bytes, `Content-Type`, empty 401 body, absence of `WWW-Authenticate`; assert other `/api/...` routes reject Basic credentials.
- Contract: snapshot of 400/401/500 bodies pinned (TST-04).
- E2E: none (M2M only).

### ATT-02 — SSO directory client

- **Type**: functional
- **Source**: `(rewrite spec: Features by area › Attendance API (M2M))` — "Employees come from the SSO directory; only users with `togglUserId` are listed; Toggl and leave data only when `employee === '1'`"; `(rewrite spec: User decisions › Scope)` — "Attendance API stays 1:1, including SSO and Toggl"; `(interview: Anonymize)` — anonymization blocked while the SSO directory still lists the user's email (consumer: NFR-08).
- **Depends on**: SET-02

**Goal**: Fetch the employee directory from the SSO meta API once per attendance request and flatten each user's key/value attributes into a record, exactly as the old code does. Expose the parsed list to ATT-04 together with two predicates: "listed" (`togglUserId` truthy) and "employee" (`employee === '1'`). Any failure maps to the SSO 500 message. The same client also exposes `isEmailListed(email)` for NFR-08 (anonymization guard).

**Old behavior** (`server/service/attendenceService.js:8-17`):
- Request: `GET ${SSO_URI}` via superagent 3.8.1 with `.auth(SSO_USERNAME, SSO_PASSWORD)` → header `Authorization: Basic base64(SSO_USERNAME:SSO_PASSWORD)` (`:9`). No query params, no timeout, no explicit `Accept`. superagent follows up to 5 redirects and rejects on non-2xx. Production `SSO_URI` = `https://sso-meta.instea.co/api/meta/all` (`kubernetes/cestaky.yml:69-70`).
- Parsing (`:10-16`): `ssoData.body.map(user => …)`; for each element builds `u = { name: user.name, email: user.email }`, then for each `kv` of `user.keys` sets `u[kv.key] = kv.value` (keys applied after name/email, so a key named `name` or `email` overrides them; later duplicate keys win). Values are used as delivered (no type conversion).
- superagent parses the body as JSON only for a JSON content type; otherwise `body` is `{}` and `.map` throws. Any throw inside `getUserDataFromSSO` (network, non-2xx, non-array body, element without `keys` array, `null` element) is caught at `:130-137`, logged with `console.log(err)` and returned as `Cannot get data from SSO, try again later.`
- Attributes read downstream: `name`, `email`, `togglUserId` (`:23`, `:31`, `:159`), `contractType` (`:34`), `employee` (`:143`), `togglWorkspaceId` (`:80`, `:94`), `togglApiToken` (`:96`).
- Predicates: listed = `user.togglUserId` truthy (`:23`; so `''` excluded, `'0'` included); employee = `user.employee !== '1'` skip (`:143`, strict string compare; number `1` is not an employee).
- SSO is called once per request, before any Toggl call (`:129-140`).

**Constraints**:
- 1:1 parsing and predicates (rewrite spec: Scope). SSO contract details not supplied by client (client answer: Q-A7 "Not relevant"), so the shape above, taken from code, is the contract.
- Secrets only from k8s secrets (brief). `togglApiToken` values from SSO are secrets: never log them.

**Integrations**:
- Service: SSO meta API. Operation: `GET ${SSO_URI}`, Basic auth, `Accept: application/json` (added; harmless).
- Env: `SSO_URI`, `SSO_USERNAME`, `SSO_PASSWORD`.
- Parsed record type (shared DTO, `packages/shared` or api-internal): `{ name: unknown; email: unknown; [key: string]: unknown }`; documented known keys `togglUserId`, `togglWorkspaceId`, `togglApiToken`, `employee`, `contractType` (all expected strings).
- Failure handling: non-2xx, network error, timeout (30 s per request, interview: Attendance), body not valid JSON, body not an array, element `null`/not an object, element `keys` not an array, `kv` not an object → throw `SsoUnavailableError` → ATT-01 returns 500 SSO message. Elements whose `kv.key` is missing set key `"undefined"` (JS coercion) like old; harmless.
- Logging: log status code and error class only; never headers or body.
- Redirects: follow at most 5 (like superagent; fetch defaults to 20, so the client enforces the limit; interview: Attendance). A 6th redirect → `SsoUnavailableError`.
- Method `fetchDirectory(): Promise<SsoUser[]>` — used by ATT-04.
- Method `isEmailListed(email: string): Promise<boolean>` — used by NFR-08. New — no counterpart in the old system. Calls `fetchDirectory()` (same request, timeout, redirect limit and parsing rules) and returns `true` if any parsed record (after key flattening, regardless of `togglUserId` or `employee`) has a string `email` exactly equal to the argument (case-sensitive, no trimming, as NFR-08 requires) (user decision 2026-11-11); else `false`. Throws `SsoUnavailableError` on any failure; the caller (NFR-08) maps it to 503 `SSO_UNAVAILABLE`. No caching. The match is the same exact, case-sensitive comparison as the attendance email-to-user match (ATT-04).

**Business rules**:
- Flattening example: input `{"name":"Jan Novák","email":"jan@instea.co","keys":[{"key":"togglUserId","value":"123"},{"key":"employee","value":"1"},{"key":"contractType","value":"TPP"}]}` → `{name:"Jan Novák", email:"jan@instea.co", togglUserId:"123", employee:"1", contractType:"TPP"}`.
- Override example: keys contain `{"key":"name","value":"X"}` → record `name` = `"X"`.
- Listed/employee matrix:

| togglUserId | employee | In output | Toggl + leaves filled |
|---|---|---|---|
| `"123"` | `"1"` | yes | yes |
| `"123"` | `"0"` / absent / `1` (number) | yes (zeros, `''`) | no |
| absent / `""` | `"1"` | no | see ATT-04 (hang fix) |
| absent | other | no | no |

**Acceptance criteria**:
- Given SSO returns 200 with the example array, then the parser returns the flattened records in the same order.
- Given SSO returns 401 / 500, then attendance returns 500 SSO message.
- Given SSO returns `{}` or `text/html`, then 500 SSO message.
- Given an element without `keys`, then 500 SSO message.
- Given `employee` is number `1`, then the user is not treated as employee.
- Given `togglUserId` is `""`, then the user is not listed.
- Given the request, then the outgoing `Authorization` header equals `Basic base64(SSO_USERNAME:SSO_PASSWORD)` and method is `GET` on exactly `SSO_URI`.
- Given SSO lists `jan@instea.co` (any `employee`/`togglUserId` values), when `isEmailListed('jan@instea.co')`, then `true`; given SSO lists `Jan@Instea.co`, when `isEmailListed('jan@instea.co')` or `isEmailListed(' Jan@Instea.co')`, then `false` (exact, case-sensitive) (user decision 2026-11-11).
- Given SSO does not list the email, when `isEmailListed`, then `false`.
- Given SSO returns 500, times out after 30 s or returns a non-array body, when `isEmailListed`, then it throws `SsoUnavailableError`.

**Tests**:
- Unit: parser (flattening, override order, duplicate keys last wins, value types preserved), predicates matrix, every failure branch, `isEmailListed` (exact match; a case or whitespace difference is not a match; no match; record without `email`; every failure branch throws).
- Contract (TST-04): mock SSO server fixture validates the request (method, URL, Basic header) and serves fixtures; pin parsed output snapshot.
- Integration: via ATT-01 endpoint with mocked SSO.

### ATT-03 — Toggl Reports v3 client

- **Type**: functional
- **Source**: `(rewrite spec: Features by area › Attendance API (M2M))` — "Logged hours per day = sum of Toggl entry seconds / 3600 by entry start date, paginated Toggl Reports v3 calls with 500 ms between pages"; `(client answer: Q-A8)` — "Yes it is inclusive." (Toggl `end_date`); brief: "Midnight-crossing entries: keep old attribution (by entry start date)".
- **Depends on**: ATT-02

**Goal**: For one SSO employee, fetch all detailed time entries of the requested month from Toggl Reports API v3 with the employee's own token and workspace, following `X-Next-Row-Number` pagination with a 500 ms pause after every page, and emit the entries in response order to ATT-04 for accumulation. Request shape, auth, paging and stop rules match the old code exactly.

**Old behavior** (`server/service/attendenceService.js:7`, `:75-116`):
- Skipped entirely when `user.togglWorkspaceId` is falsy (`:80`); then nothing is added and no delay happens.
- URL: `POST https://api.track.toggl.com/reports/api/v3/workspace/${togglWorkspaceId}/search/time_entries` (`:7`, `:93-94`). Base URL hard-coded.
- Body (`:82-90`), JSON, key order: `start_date` (month start `YYYY-MM-DD`), `end_date` (month end `YYYY-MM-DD`, inclusive per Q-A8), `user_ids: [parseInt(togglUserId)]`, and on pages after the first `first_row_number: parseInt(<previous X-Next-Row-Number>)`. No `page_size` (Toggl default applies), no other filters. If `togglUserId` is absent, `parseInt` gives `NaN`, serialized as `null`.
- Headers: `Authorization: Basic base64(${togglApiToken}:api_token)` (`:96`, superagent `.auth(user, pass)`), `Accept: application/json` (`:97`), `Content-Type: application/json` (superagent `.send(object)`).
- Response parsing (`:99-107`): body is an array of rows; for each row, for each `row.time_entries[i]`: `hours = seconds / 60 / 60` (two divisions, in that order; `:102`); day = day-of-month of `moment(timeEntry.start)` in the default timezone `DEFAULT_TIMEZONE` (`:103`, `:119-120`); `attendence[row.user_id].days[day - 1].logged_time += hours` then `attendence[row.user_id].total += hours` (`:104-105`). The row is addressed by Toggl's `user_id`, not the SSO user being processed. No rounding anywhere.
- Pagination (`:109-112`): `next = header['x-next-row-number'] === previous ? null : header['x-next-row-number']`; continue while `next` is truthy. So: header absent → stop; header equal to the previous value → stop; header `"0"` (string, truthy) → continue.
- Delay (`:113`): `await 500 ms` after every page, including the last one, before returning.
- Errors (`:147-155`): any throw (non-2xx including 429/402, network, non-JSON → `body` `{}` → `forEach` not a function, row without `time_entries` array, `row.user_id` not a listed key, day index beyond the days array) → `Cannot get data from Toggl, try again later.`; processing of all users stops.
- Users are processed sequentially in SSO order (`:142-161`).

**Constraints**:
- 1:1 (rewrite spec: Scope; client answer: Q-A8). Attribution by entry start date, midnight-crossing entries not split (brief).
- The analysis states "Σ seconds / 3600"; the code computes `seconds / 60 / 60` per entry and sums per entry. The new code must use the same per-entry expression and summation order so floating-point results are bit-identical (**Analysis vs code**).
- Base URL configurable for tests and parity harness: env `TOGGL_REPORTS_BASE_URL`, default `https://api.track.toggl.com/reports/api/v3` (derived, needed by TST-04, MIG-03).
- Delay configurable only for tests (inject a clock/sleeper; production value fixed 500 ms).
- Never log `togglApiToken` or the `Authorization` header.

**Integrations**:
- Service: Toggl Track Reports API v3, operation `search/time_entries`.
- Inputs per call: `togglWorkspaceId`, `togglUserId`, `togglApiToken` (from SSO, ATT-02), `startString`, `endString` (ATT-04).
- Output: async sequence of `{ userId: row.user_id, seconds: entry.seconds, start: entry.start }` in response order, page by page.
- Failure handling: throw `TogglUnavailableError` → ATT-01 500 Toggl message. Timeout 30 s per request and at most 5 redirects (interview: Attendance); either failure → `TogglUnavailableError`.

**Business rules**:
- Per-entry hours `h = seconds / 60 / 60` with JS number semantics: `seconds` `null` → 0; missing/non-numeric → `NaN`, which serializes as `null` in JSON (preserved).
- Day index = `TZDate(entry.start, DEFAULT_TIMEZONE).getDate() - 1` (day-of-month only; month/year of the entry are ignored, like old). If index ≥ days length → Toggl error 500 (old TypeError at `:104`).
- Example: entries `[{seconds:3600,start:"2024-03-04T08:00:00+01:00"},{seconds:5400,start:"2024-03-04T13:00:00+01:00"}]` → day 4 `logged_time` 2.5, `total` 2.5.
- Example midnight-crossing: `{seconds:7200,start:"2024-03-04T23:30:00+01:00"}` → 2 h all on day 4.
- Example timezone: `start:"2024-03-31T22:30:00Z"` with Europe/Bratislava (CEST, +02:00) → local 2024-04-01 00:30 → day index 0 (added to March 1 of a March request; preserved quirk).
- Paging example: page 1 header `X-Next-Row-Number: 51` → page 2 body has `first_row_number: 51`; page 2 header `101` → page 3 `first_row_number: 101`; page 3 header absent → stop. Total waits 3 × 500 ms.

**Acceptance criteria**:
- Given `togglWorkspaceId` absent, then no Toggl call is made and no delay occurs.
- Given one page without `X-Next-Row-Number`, then exactly one call, then a 500 ms wait.
- Given headers `51`, `51`, then exactly two calls (stop on repeat).
- Given header `51` then absent, then two calls; the second body has `first_row_number: 51` (number).
- Given the request, then body key order is `start_date`, `end_date`, `user_ids`(, `first_row_number`) and `user_ids` is `[<integer>]`.
- Given the request, then `Authorization` = `Basic ` + base64(`<token>:api_token`).
- Given Toggl returns 429, 402, 500 or a non-array, then attendance returns 500 Toggl message.
- Given a row whose `user_id` is not a listed `togglUserId`, then 500 Toggl message.
- Given March request, then `start_date` `2024-03-01`, `end_date` `2024-03-31`.

**Tests**:
- Unit (fake sleeper, mocked HTTP): request builder, auth header, pagination state machine (absent, repeated, `"0"`, numeric strings), delay count, hours arithmetic incl. `null`/missing seconds, day-index computation across DST boundaries (last Sunday of March/October) and UTC offsets.
- Contract (TST-04): Toggl mock validates request shape and serves recorded-shape fixtures; pin parsed sequence snapshot.
- Integration: via ATT-01 with two employees, multi-page, assert sequential order and total delays with fake timers.

### ATT-04 — Attendance assembly: leave codes, timezone, output keys

- **Type**: functional
- **Source**: `(rewrite spec: Features by area › Attendance API (M2M))` — "Leave code per working day, APPROVED leaves only: ANNUAL `D8` (half-day `D4`), SICKNESS `PN`, DOCTOR `L`, other `I`; several joined with `", "`"; "Day boundaries use `DEFAULT_TIMEZONE` (default Europe/Bratislava)"; "Output is keyed by SSO name; duplicate names collide — preserved quirk"; "An employee without `togglUserId` who has leaves no longer hangs the request"; `(client answer: Q-S12)` — "keep 1:1".
- **Depends on**: ATT-02, ATT-03, WD-01, DATA-01, DATA-02

**Goal**: Build the attendance object for (Y, M): one entry per listed SSO user with one day record per calendar day of the month, logged Toggl hours (ATT-03) and leave codes from APPROVED leaves on working days. Reproduce the old key order, number values, empty values and name-keyed collisions exactly. Fix the hang for employees without `togglUserId`. No global timezone state.

**Old behavior** (`server/service/attendenceService.js`):
- Timezone: `DEFAULT_TIMEZONE || 'Europe/Bratislava'` set as the global moment default on each call (`:119-120`). Production does not set `DEFAULT_TIMEZONE` (`kubernetes/cestaky.yml` env list has no such entry), so Europe/Bratislava applies.
- Range: `start` = first day 00:00, `end` = last day 23:59:59.999 local (`:123-124`); `startString`/`endString` = `YYYY-MM-DD` (`:126-127`).
- Init (`:19-40`): for each SSO user with truthy `togglUserId`, in SSO order: `attendence[togglUserId] = { days, total: 0, contractType: user.contractType }`, `days` = `end.date()` entries (one per calendar day, index = day-of-month − 1), each `{ logged_time: 0, leave: '' }`. `userIdToNameMap[togglUserId] = user.name`. Two SSO users with the same `togglUserId`: the second re-initializes the same entry and its name wins.
- Per SSO user in SSO order, skipping `employee !== '1'` (`:142-145`): Toggl (ATT-03, `:148`), then leaves (`:157-160`).
- Leave lookup (`server/service/leaveService.js:21-33`): `User.findOne({ email })` with the SSO email, exact case-sensitive match (`server/service/userService.js:16`); no user → `[]`; else `Leave.find({ requesterId: user.id, startDate: { $lte: end }, endDate: { $gte: start } })` with no sort (MongoDB natural order). Then filter `state === 'APPROVED'` (`attendenceService.js:158`, `src/data/LeaveState.js:1-5`).
- Leave writing (`:57-73`): iterate `m` from `moment(leave.startDate)` by +1 day while `m.toDate() <= leave.endDate`; write when `m.month() === month - 1` (month only, year not checked) and `isWorkingDay(m)` (`:51-55`: ISO weekday ≥ 6 or `date-holidays` 1.2.0 `SK` `isHoliday`, any holiday type incl. observances, e.g. Easter Sunday, Mother's Day; `node_modules/date-holidays/data/countries/SK.yaml`). Code: `leaveTypeMap[type] || 'I'` with ANNUAL `D`, SICKNESS `PN`, DOCTOR `L` (`:42-47`); ANNUAL appends `4` if `isHalfDay` else `8` (`:62-64`); half-day flag on non-ANNUAL is ignored; MATERNITY, PARENTAL, CARING → `I`. If the day already has a code, append `', ' + code` (`:65-69`), in leave query order.
- Old dates are `Date` instants; the Angular form sends browser-local start of day (`angular/src/app/leaves/leaves-add/leaves-add.component.ts:28-32`, `:88`), so stored instants are local midnight and the loop includes the end day.
- Hang (`:65`, `:157-160`): employee with no `togglUserId` and an APPROVED leave covering ≥1 working day of the month → `attendence[undefined]` → TypeError outside any try → request hangs (see ATT-01).
- Rename (`:163-166`): `for (userId in attendence) { attendence[name] = attendence[userId]; delete attendence[userId]; }`. JS key order: integer-like keys ascending first, then string keys in insertion order. Resulting order: users ordered by numeric `togglUserId` ascending (for canonical integer strings), then any non-integer-like `togglUserId`s in SSO order; each mapped to its name. Duplicate names: the later user's data (in that iteration order) overwrites the value; the key keeps the position of the first. Name `undefined` → key `"undefined"`.
- Response (`:168-175`): `{ start: startString, end: endString, attendence }`. `contractType` `undefined` is omitted by `JSON.stringify`.

**Constraints**:
- 1:1 output (rewrite spec: Scope; client answer: Q-S12). Name collisions preserved.
- Working-day definition from WD-01 (refreshed `date-holidays`, client answer Q-S9). This intentionally differs from old 2017 data (old SK list still contains `09-01` and `11-17`, `SK.yaml`). Days whose holiday status changed produce different `leave` values; MIG-03 must classify these as expected diffs.
- Leaves are stored as `YYYY-MM-DD` strings (DATA-02); conversion of old instants to calendar dates in `DEFAULT_TIMEZONE` is owned by the migration task.
- No process-global timezone mutation; compute with `@date-fns/tz` (`TZDate`) and `DEFAULT_TIMEZONE`.
- Deactivated users' leaves still count; user existence is the only check, like old (interview: Attendance).
- SSO email match stays exact and case-sensitive, like old (interview: Attendance).
- Several leaves on one day are joined in `_id` ascending order (interview: Attendance); the migration inserts leaves in old natural order so `_id` order matches.
- Safe fixes (interview: Attendance), each an expected parity diff in MIG-03: an employee without `togglUserId` is skipped entirely (no Toggl call, no leave lookup); leave days are checked by year and month, not month only.

**Data model** (read only):

| Entity | Field | Use |
|---|---|---|
| User (DATA-01) | `email`, `id` | Match SSO `email` exactly; take `id` |
| Leave (DATA-02) | `requesterId`, `startDate`, `endDate`, `state`, `type`, `isHalfDay` | Query and codes |

**Business rules**:
1. Effective (Y, M) from ATT-01. `daysInMonth` = number of calendar days of (Y, M). `startString` = `Y-M-01`, `endString` = `Y-M-<daysInMonth>` (zero-padded).
2. Init entries for listed SSO users (ATT-02) as in old, keyed internally by `togglUserId` string, in SSO order; re-init on duplicate `togglUserId`.
3. For each SSO user in SSO order with `employee === '1'`:
   a. If `togglUserId` is falsy, skip this user entirely (no Toggl call, no leave lookup; hang fix). Otherwise Toggl (ATT-03), if `togglWorkspaceId` truthy. For each entry: `entries[String(row.user_id)]` must exist (else Toggl error); `days[idx].logged_time += h`; `total += h`; in response order.
   b. Leaves. Find User by exact, case-sensitive email (active or deactivated); if none, skip. Query `Leave` with `requesterId = user.id`, `state = 'APPROVED'`, `startDate <= endString`, `endDate >= startString`, sorted by `_id` ascending. For each leave, for each date `d` from `max(startDate, startString)` to `min(endDate, endString)` inclusive (year and month both checked): if `1 <= month <= 12` (raw request param) and `isWorkingDay(d)` (WD-01): append code to `days[day(d) - 1].leave`.
   c. Code: ANNUAL → `isHalfDay ? 'D4' : 'D8'`; SICKNESS → `PN`; DOCTOR → `L`; any other → `I`. Join: if `leave` is `''` set it, else `leave + ', ' + code`.
4. Output keys: iterate internal keys in JS object key order (integer-like ascending, then insertion order) and assign to a plain object by `name` (via `String(name)`), later overwrites earlier, first position kept. Implementation must use the same JS object semantics (plain object, not `Map`) so order is identical.
5. Per user value key order: `days`, `total`, `contractType`; omit `contractType` when `undefined`; keep `null` if SSO sends `null`. Day key order: `logged_time`, `leave`.
6. Numbers: `logged_time` and `total` are raw JS doubles serialized by `JSON.stringify` (no rounding, no fixed decimals). Untouched values serialize as `0`. `total` is a running sum in entry order, not the sum of the days.
7. Top-level key order: `start`, `end`, `attendence`.

Worked example (March 2024, Europe/Bratislava; March 2024: 31 days, Fri 1 Mar; Easter Monday 1 Apr):
- SSO: A `{name:"Anna", togglUserId:"20", employee:"1", contractType:"TPP"}`, B `{name:"Boris", togglUserId:"7", employee:"0"}`, C `{name:"Cyril", employee:"1"}`.
- Anna: Toggl 3600 s on 2024-03-04; APPROVED ANNUAL half-day 2024-03-05; APPROVED DOCTOR 2024-03-05; APPROVED SICKNESS 2024-03-08..2024-03-11; PENDING ANNUAL 2024-03-12.
- Output: `{"start":"2024-03-01","end":"2024-03-31","attendence":{"Boris":{"days":[31 × {"logged_time":0,"leave":""}],"total":0},"Anna":{"days":[…day4 {"logged_time":1,"leave":""}, day5 {"logged_time":0,"leave":"D4, L"}, day8 "PN", day9 "", day10 "", day11 "PN", day12 ""…],"total":1,"contractType":"TPP"}}}`. Boris first because `7 < 20`; Boris has no `contractType` key; Cyril absent; days 9–10 are weekend.
- Collision example: SSO D `{name:"Eva", togglUserId:"5"}` and E `{name:"Eva", togglUserId:"9"}` → one key `"Eva"` with E's data, at D's position.

**Acceptance criteria**:
- Given a listed non-employee, then its entry has all-zero days, `leave` `''`, `total` `0`, and no Toggl or DB access for it.
- Given an employee without `togglUserId` with an APPROVED leave on a working day, then 200 and no entry for that employee (no hang).
- Given an APPROVED ANNUAL leave with `isHalfDay` true spanning Thu–Mon, then Thu, Fri, Mon have `D4`, weekend `''`.
- Given an APPROVED leave covering a WD-01 holiday, then that day `leave` is `''`.
- Given REJECTED or PENDING leaves only, then all `leave` = `''`.
- Given two APPROVED leaves on one day (inserted ANNUAL then DOCTOR), then `D8, L`.
- Given a leave from 2024-02-26 to 2024-03-05 queried for March, then only March working days get codes.
- Given SSO email differs in case from the stored email, then no leaves are found (exact match, interview: Attendance).
- Given a deactivated user with an APPROVED leave on a working day, then the code appears.
- Given an employee without `togglUserId` but with `togglWorkspaceId`, then no Toggl request is sent for that employee.
- Given an APPROVED leave from 2024-01-02 to 2025-01-31, when January 2025 is requested, then only January 2025 working days get codes, each once.
- Given `contractType` absent in SSO, then the user value has only `days` and `total`.
- Given duplicate SSO names, then one key with the later (by key order) user's data.
- Given `DEFAULT_TIMEZONE` unset, then Europe/Bratislava is used.
- Given month param `13`, then no leave codes even if APPROVED leaves exist in January of next year.

**Tests**:
- Unit (`packages/shared` or api service with in-memory fakes): code mapping table for all six types × half-day; join order; date clipping; holiday skip (using WD-01 stub); output key-order algorithm (integer-like ids, non-integer ids, duplicates, `undefined` name); `contractType` omission; float accumulation order equals old (`seconds/60/60` summed per entry; example 3 entries of 1000 s give `0.8333333333333333` style results identical to a reference JS computation).
- Integration (MongoDB 8 + TST-04 mocks): worked example above as a golden JSON file compared byte-for-byte; hang-fix case; email exact-match case; deactivated user case.
- Contract: golden response files pinned (TST-04).

## Operations (OPS)

### OPS-01 — Health check and fail-fast on database loss

- **Type**: functional
- **Source**: `(rewrite spec: Features by area › Operations)` — "Health-check endpoint pings the database, returns 200 / 500 and serves as the k8s readiness probe"; "App fails fast when the database is unreachable so k8s restarts it"
- **Depends on**: SET-02

**Goal**: `GET /health-check` answers 200 when MongoDB answers a ping and 500 otherwise, with the old JSON body shape; the k8s readiness probe uses it. The process exits when the initial DB connection fails or the connection is lost, so k8s restarts the pod.

**Old behavior**:
- Mounted with `app.use('/health-check', …)` (`server/health-check/health-check.js:25-27`), so any HTTP method and any sub-path (e.g. `/health-check/x`) is answered. No auth (registered after auth setup but outside `/graphql` and `/api`, `server/index.js:39,47-48`).
- The check is not a ping: it runs `User.findOne({ email: 'dummy@just-to-test.com' })` (`server/health-check/health-check.js:1-5`). If the DB never opened, `dbSchema.User` is undefined (models are defined only on `open`, `server/db/schema.js:7`) and the TypeError counts as failure.
- Body: object keyed by check function name: 200 `{"checkMongo":"ok"}`, 500 `{"checkMongo":"<String(err)>"}` (`server/health-check/health-check.js:9-23`).
- Fail fast: initial connect failure logs `Connect to database failed -> exiting` and `process.exit(-1)` → exit status 255 (`server/db/connect.js:12-19`); `disconnected` event logs `Disconnected from the database -> exiting: ` and `process.exit(-2)` → exit status 254 (`server/db/connect.js:26-32`).
- Readiness probe `httpGet /health-check` port 4100, `initialDelaySeconds: 5`, `periodSeconds: 5`; no liveness probe (`kubernetes/cestaky.yml:34-39`).
- **Analysis vs code:** analysis §2.1 Ops says it "pings Mongo"; the code runs a `findOne` query, not a `ping` (`server/health-check/health-check.js:3-5`). It also answers every method/sub-path, which the analysis does not mention.

**Constraints**: Path stays `/health-check` (brief convention), outside `/api`, no auth, not affected by the global error filter body (keeps old body for compatibility with existing probes/monitoring). New check uses a real `ping` (spec text). Only `GET` and `HEAD` are answered; other methods → 404. The TCP liveness probe and the GET/HEAD-only rule are accepted decisions (final decisions, CANONICAL endpoint list `GET, HEAD /health-check`).

**API**:
- `GET /health-check` — no auth.
  - Check: if Mongoose `connection.readyState !== 1` → fail immediately with message `MongoDB not connected (readyState=<n>)`; else `connection.db.admin().command({ ping: 1 })` with a 2000 ms timeout (`maxTimeMS` + `Promise.race`), error → fail with `String(err)`.
  - 200 `{ "checkMongo": "ok" }`; 500 `{ "checkMongo": "<error string>" }`. `Content-Type: application/json`. `Cache-Control: no-store`.
  - Not logged at info level (probe noise); failures logged at warn.
- `HEAD /health-check` — same status, no body.

**Business rules** (fail fast):
- Startup: connect with `serverSelectionTimeoutMS: 10000`. On failure log (error level) `Connect to database failed -> exiting` with the error, then exit with status 255 (same as old `-1`). The HTTP server does not start listening before the DB is connected.
- Runtime: on Mongoose `disconnected` event after a successful connect, log `Disconnected from the database -> exiting` and exit with status 254 (same as old `-2`), after closing the HTTP server (max 5 s graceful). Not triggered during intentional shutdown (SIGTERM handler sets a flag first).
- SIGTERM/SIGINT: graceful shutdown (`app.enableShutdownHooks()`), close HTTP then DB, exit 0.
- k8s probes (OPS-03): readiness `GET /health-check` port 4100, `initialDelaySeconds: 5`, `periodSeconds: 5`, `timeoutSeconds: 3`, `failureThreshold: 3`. Liveness: `tcpSocket` port 4100, `initialDelaySeconds: 30`, `periodSeconds: 20` (restarts a hung process; DB loss is handled by the exit above, so liveness does not depend on DB).

**Acceptance criteria**:
- Given the DB is up, when `GET /health-check`, then 200 `{"checkMongo":"ok"}`.
- Given the DB stops answering pings (e.g. ping times out), then 500 with `checkMongo` = an error string, within ≤ 2.5 s.
- Given `readyState` is not 1, then 500 without waiting.
- Given `POST /health-check`, then 404.
- Given MongoDB unreachable at startup, then the process exits with status 255 within ~10 s and the log contains `Connect to database failed -> exiting`.
- Given the DB connection is lost while running, then the process exits with status 254 and the log contains `Disconnected from the database -> exiting`.
- Given SIGTERM, then exit status 0 and no `Disconnected … exiting` log line.

**Tests**:
- unit: health service with mocked connection: readyState ≠ 1, ping ok, ping rejects, ping hangs (timeout).
- integration (MongoDB 8 via Testcontainers): 200 body; stop the container → 500; spawn the built app as a child process with an unreachable `MONGO_URL` → exit code 255; start with container, stop container → exit code 254; send SIGTERM → exit 0.
- e2e: none.

### OPS-02 — Backup and restore scripts for MongoDB 8

- **Type**: functional
- **Source**: `(rewrite spec: Features by area › Operations)` — "Manual database backup (gzip dump, 14-day retention) and restore scripts, updated for MongoDB 8"
- **Depends on**: OPS-03

**Goal**: Two shell scripts in `deploy/` back up the new MongoDB 8 database from the k8s pod to the host as a gzip archive with 14-day retention, and restore an archive into a chosen database. Credentials come from the k8s Secret inside the pod, never from the script or repo.

**Old behavior**:
- `kubernetes/backup.cestaky.sh:1-46`: config at top (pod label `mongo3`, DB `cestaky`, inline `DBUSERNAME`/`DBPASSWORD` placeholders, auth DB `admin`, backup dir `/opt/instea/backup/mongo/dumps/$POD_LABEL`, retention `DAYSTORETAINBACKUP="14"`); `mongodump --db … --gzip --archive=/tmp/mongo1.dump.gz` in the pod via `microk8s kubectl exec`; `kubectl cp` to host; rename to `cestaky-<YYYY-MM-DD-HHMM>.gz`; `find … -mtime +14 -exec rm`. Manual run (not scheduled in repo).
- `kubernetes/restore.sh:1-23`: inline credential placeholders; copies `dump.gz` into the pod; `mongorestore --nsFrom "cestaky.*" --nsTo "cestaky-restore.*" --gzip --archive` (insert-only, no `--drop`); uses `microk8s.kubectl`.
- Credentials were in the scripts (placeholders filled by hand) — conflicts with "Secrets come only from k8s secrets".

**Constraints**: Secrets only from k8s secrets `(rewrite spec: User decisions › Platform and delivery)`. Keep: gzip archive format, 14-day retention, host directory pattern, file name pattern, manual trigger.

**Business rules**:
- `deploy/backup.sh`: `set -euo pipefail`. Constants at the top of the script (as old `kubernetes/backup.cestaky.sh:7-24`, without credentials): `KUBECTL="microk8s kubectl"`, `POD_LABEL="mongo8"`, `MONGO_DATABASE="cestaky"`, `BACKUPS_DIR="/opt/instea/backup/mongo/dumps/mongo8"`, `DAYS_TO_RETAIN="14"`. Steps: mkdir backups dir (exit 1 with `Can't create backup directory in <dir>` on failure); find pod by label; `kubectl exec` runs `sh -c 'mongodump --username "$MONGO_INITDB_ROOT_USERNAME" --password "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --db "$0" --gzip --archive=/tmp/backup.dump.gz' <db>` (runs on the single replica-set member, which is primary; single quotes: variables expand inside the pod from the Secret-backed env; password not in host process list); `kubectl cp` to host; remove the temp file in the pod; verify the archive with `gzip -t`; rename to `<db>-<YYYY-MM-DD-HHMM>.gz`; delete files older than retention with `find "$BACKUPS_DIR" -type f -name '*.gz' -mtime +"$DAYS_TO_RETAIN" -delete`; print path and size. Exit non-zero on any failure. No `set -x` (it would echo commands).
- `deploy/restore.sh <archive> [target-db]`: target default `cestaky-restore` (old default). Refuses `target-db` = `cestaky` unless `--force-live` flag given, then asks for typed confirmation `cestaky`. Optional `--drop` (passes `--drop` to mongorestore). Copies archive into pod, runs `mongorestore --nsFrom 'cestaky.*' --nsTo '<target>.*' --gzip --archive` with credentials from pod env, removes temp file.
- Scheduling: manual as today (Q-A15 not relevant); README documents an optional host cron line.
- `deploy/README.md` (DOC-03) gets a backup/restore runbook incl. a quarterly restore test into `cestaky-restore` and a document count compare.

**Acceptance criteria**:
- Given a running `mongo8` pod, when `deploy/backup.sh` runs, then `<BACKUPS_DIR>/cestaky-<timestamp>.gz` exists, passes `gzip -t`, and backups older than 14 days are deleted.
- Given the script, then it contains no username/password literals and the repo `trivy fs` secret scan passes.
- Given an archive, when `deploy/restore.sh <file>` runs, then DB `cestaky-restore` contains the same collections and document counts as the source at backup time.
- Given `deploy/restore.sh <file> cestaky` without `--force-live`, then it exits non-zero without restoring.
- Given the pod is not found, then exit non-zero with a clear message.

**Tests**:
- integration (CI job `ops-scripts`): run copies of the scripts with the `KUBECTL` constant replaced by a small wrapper that maps `exec`/`cp`/`get pod` to `docker exec`/`docker cp` on a `mongo:8` container with root user env; assert archive created, restore counts equal, retention deletes a file touched to 15 days old (`touch -d`).
- static: `shellcheck deploy/*.sh` in the lint job.

### OPS-03 — Docker image, k8s manifests, Keel and secrets

- **Type**: decision
- **Source**: `(rewrite spec: User decisions › Platform and delivery)` — "Deploy to the same MicroK8s cluster with the existing registry and Keel; new k8s manifests"; "Secrets come only from k8s secrets, never from the repo"
- **Depends on**: SET-01, SET-02, SET-03, OPS-01
- **Decisions**: `(interview: Infra)` — app request 256Mi / limit 512Mi; MongoDB 8 limit 1Gi, `--wiredTigerCacheSizeGB 0.25`, single-member replica set (transactions for audit), dedicated app DB user, verify VPS CPU AVX before cutover

**Goal**: One multi-stage Docker image builds the shared package, API and web SPA and runs NestJS serving both. New k8s manifests define the app Deployment, Service, Ingress, ConfigMap, and a MongoDB 8 StatefulSet; Keel rolls out new images automatically. Secret values exist only in k8s Secrets created by hand.

**Old behavior**:
- `Dockerfile:1-42`: `node:8` builder builds Angular then React with build args `REACT_APP_HOSTED_DOMAIN`, `REACT_APP_CLIENT_ID` (defaults baked into the Dockerfile, `Dockerfile:3-4`); runtime `node:12.22-slim` copies all `node_modules` (dev incl.), runs as root, `VOLUME /opt/app/secrets`, `EXPOSE 4100`, `CMD node server/index.js`.
- `kubernetes/cestaky.yml`: Deployment `cestaky-deployment` 1 replica, RollingUpdate maxSurge 1 / maxUnavailable 0, `imagePullSecrets: instea-registry`, image `registry.instea.co/cestovne-prikazy:latest`, `imagePullPolicy: Always`, readiness probe, env inline incl. secret placeholders (`kubernetes/cestaky.yml:40-74`), limits cpu `2` / memory `128Mi` and no requests (`kubernetes/cestaky.yml:75-78`), secret volume `cestaky-secrets` key `server-private-key` → `key.pem` (`kubernetes/cestaky.yml:79-88`); Service `cestaky-service` 80 → 4100; Ingress `cestaky-ingress`, class `public`, path `/cestaky/?(.*)`, `rewrite-target: /$1` (`kubernetes/cestaky.yml:103-122`). Keel annotations `keel.sh/policy: force`, `keel.sh/match-tag: "true"`, `keel.sh/trigger: poll`, `keel.sh/pollSchedule: "@every 10m"` (`kubernetes/cestaky.yml:7-12`).
- `kubernetes/mongo3.yml`: PVC `mongo3-pvc` 2Gi `microk8s-hostpath`; Service `mongo3-service` 27017; StatefulSet `mongo3-sfset` `mongo:3.6`, root credentials as inline env placeholders, limits cpu 1 / memory 512Mi, `serviceName: mongo3-test-service` (no such service defined).
- `kubernetes/cestaky-secrets.yml`: Secret `cestaky-secrets`, key `server-private-key` (template committed to repo, placeholder value).
- Keel installed via Helm with `kubernetes/keel/values.yaml` (Keel 0.22.4, ClusterIP `10.152.183.200:9300`, polling `@every 10m`); registry webhook setup in `kubernetes/README.md:39-81`.

**Constraints**:
- Same cluster, registry `registry.instea.co`, Keel, ingress class `public`, `/cestaky` prefix rewrite, host nginx unchanged, public URL `https://cestaky.instea.co` (brief; `(client answer: Q-S11)`).
- New names differ from the old ones, so the old manifests and image stay usable for Rollback (MIG-04): image `registry.instea.co/cestaky-leaves`; Deployment `cestaky-leaves-deployment`, Service `cestaky-leaves-service`, ConfigMap `cestaky-leaves-config`, Secret `cestaky-leaves-secrets`; Mongo: StatefulSet `mongo8-sfset`, Service `mongo8-service`, PVC `mongo8-pvc`, Secret `mongo8-secrets`. Ingress keeps name `cestaky-ingress` and is switched at cutover (MIG-04 step 14).
- No Secret manifest with data in the repo; only `deploy/k8s/secrets.example.md` listing secret names and keys.

**Data model** (Secret keys, names only):

| Secret | key → env var | used by |
|---|---|---|
| `cestaky-leaves-secrets` | `MONGO_URL` | api |
| | `JWT_ACCESS_SECRET` | api (AUTH-02) |
| | `SMTP_USER`, `SMTP_PASSWORD` | api |
| | `M2M_USERNAME`, `M2M_PASSWORD` | api (attendance) |
| | `SSO_USERNAME`, `SSO_PASSWORD` | api (attendance) |
| `mongo8-secrets` | `MONGO_INITDB_ROOT_USERNAME`, `MONGO_INITDB_ROOT_PASSWORD` | mongo8 (backup/restore scripts use these inside the pod) |
| | `MONGO_APP_USERNAME`, `MONGO_APP_PASSWORD` | `mongo8-rs-init` Job creating the app user (`readWrite` on `cestaky`, `read` on `cestaky_legacy`) |
| | `keyfile` (file, mounted read-only, mode `0400`, at `/etc/mongo/keyfile`) | replica-set internal auth, required when auth and `--replSet` are both on |
| `instea-registry` (existing) | docker registry credentials | imagePullSecrets |

ConfigMap `cestaky-leaves-config` (non-secret, committed): `NODE_ENV=production`, `BASE_URL`, `HOSTED_DOMAIN`, `GOOGLE_CLIENT_ID`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `MAIL_SENDER`, `APPROVAL_MAIL_RECEIVER`, `SSO_URI`, `TOGGL_REPORTS_BASE_URL`, `DEFAULT_TIMEZONE`, `LOG_LEVEL`, `ACCESS_TOKEN_TTL_SECONDS`, `REFRESH_TOKEN_TTL_SECONDS`. Values carried over from `kubernetes/cestaky.yml:41-70` for non-secret entries (`CLIENT_ID` → `GOOGLE_CLIENT_ID`).

**Business rules**:
- Dockerfile (root): stage `deps` `node:24-slim` + Corepack pnpm, `pnpm install --frozen-lockfile`; stage `build` with the only build arg `APP_VERSION` (no environment-specific build args: the SPA loads Google settings from `GET /api/auth/config`, so one image serves all environments), `pnpm -r build`, then `pnpm deploy --filter api --prod /out`; stage `runtime` `node:24-slim`: copy `/out` and `apps/web/dist` to `/opt/app/public`, `ENV NODE_ENV=production`, `USER node`, `EXPOSE 4100`, `CMD ["node","dist/main.js"]`. `.dockerignore` excludes `node_modules`, `.git`, `**/.env*`, test outputs.
- Deployment `cestaky-leaves-deployment`: replicas 1, RollingUpdate maxSurge 1 / maxUnavailable 0; `imagePullSecrets: instea-registry`; image `registry.instea.co/cestaky-leaves:latest`, `imagePullPolicy: Always`; `envFrom` ConfigMap + Secret; readiness and liveness probes per OPS-01; `securityContext`: `runAsNonRoot: true`, `readOnlyRootFilesystem: true` (with `emptyDir` at `/tmp`), `allowPrivilegeEscalation: false`; resources requests cpu `100m` / memory `256Mi`, limits cpu `1` / memory `512Mi` `(interview: Infra)` (old limit 128Mi, `kubernetes/cestaky.yml:75-78`, is too low for NestJS on Node 24); `terminationGracePeriodSeconds: 15`. Keel annotations same as old (`keel.sh/policy: force`, `keel.sh/match-tag: "true"`, `keel.sh/trigger: poll`, `keel.sh/pollSchedule: "@every 10m"`); registry webhook already notifies Keel for all pushes (`kubernetes/README.md:56-81`).
- Service `cestaky-leaves-service`: port 80 → 4100.
- Ingress `cestaky-ingress` (replaces old at cutover): class `public`, annotation `nginx.ingress.kubernetes.io/rewrite-target: /$1`, path `/cestaky/?(.*)`, `pathType: ImplementationSpecific`, backend `cestaky-leaves-service:80`. Add `nginx.ingress.kubernetes.io/proxy-body-size: 1m`.
- MongoDB `(interview: Infra)`: PVC `mongo8-pvc` 2Gi `microk8s-hostpath`; headless Service `mongo8-headless` referenced by `serviceName` (fixes old dangling `mongo3-test-service`, `kubernetes/mongo3.yml:39`) plus ClusterIP `mongo8-service:27017`; StatefulSet `mongo8-sfset`, 1 replica, image `mongo:8.0` (digest pinned), env root user from `mongo8-secrets`, args `--replSet rs0 --keyFile /etc/mongo/keyfile --bind_ip_all --wiredTigerCacheSizeGB 0.25`; readiness `exec mongosh --quiet --eval "db.adminCommand('ping')"`; resources requests memory `512Mi`, limits cpu `1` / memory `1Gi`.
- Replica set init: k8s Job `mongo8-rs-init` (image `mongo:8.0`, idempotent): with root credentials, if `rs.status()` fails with `NotYetInitialized` → `rs.initiate({ _id: 'rs0', members: [{ _id: 0, host: 'mongo8-sfset-0.mongo8-headless.default.svc.cluster.local:27017' }] })`; wait for PRIMARY; create user `MONGO_APP_USERNAME` in DB `cestaky` with roles `readWrite@cestaky`, `read@cestaky_legacy` if missing. Re-running changes nothing.
- App `MONGO_URL` format (in Secret): `mongodb://<app user>:<password>@mongo8-service:27017/cestaky?authSource=cestaky&replicaSet=rs0`. Transactions (audit, NFR-06) work on the single-member replica set.
- AVX check `(interview: Infra)`: MongoDB 5.0+ needs AVX on x86_64. Before cutover run `grep -m1 -o -w avx /proc/cpuinfo` on the VPS host; it must print `avx`. Also run `mongo:8.0` once on the host (`docker run --rm mongo:8.0 mongod --version`); an `Illegal instruction` crash means no AVX and blocks the cutover.
- Manifests in `deploy/k8s/`: `app.yml`, `ingress.yml`, `config.yml`, `mongo8.yml`, `mongo8-rs-init.yml`; Keel `values.yaml` copied from `kubernetes/keel/values.yaml` unchanged. Old `kubernetes/` folder is not copied to the new repo.

**Acceptance criteria**:
- Given `docker build` with the build args, then the image runs as non-root, `GET /` serves the SPA, `GET /health-check` answers, `node_modules` contains no devDependencies.
- Given the manifests, when applied to a cluster with the Secrets created, then the pod becomes Ready and `/health-check` returns 200 through `kubectl port-forward`.
- Given a new image pushed with tag `latest`, then Keel rolls out `cestaky-leaves-deployment` within 10 minutes (webhook: within seconds).
- Given `mongo8-rs-init` runs twice, then the second run changes nothing and `rs.status()` shows one member in state PRIMARY.
- Given the app is connected, then a multi-document transaction (audit write) commits.
- Given `grep` / Trivy secret scan over `deploy/`, then no secret values are found.
- Given the pod under normal load, then memory stays below the limit (check `kubectl top pod` after a week; adjust).

**Tests**:
- CI: `docker build` in `image-scan` job (NFR-04); container smoke test in CI: run image with MongoDB service, assert `/health-check` 200 and `/` returns HTML; `kubeconform` (or `kubectl --dry-run=client`) validates `deploy/k8s/*.yml`; `trivy config deploy/` misconfig scan.

## Data migration and cutover (MIG)

### MIG-01 — Migration script: users and leaves with validation report

- **Type**: decision
- **Source**: `(rewrite spec: User decisions › Data migration)` — "Migrate users and leaves only; trips, places and generated xlsx files are archived offline, not migrated"; "Migration validates every record against the new rules; invalid or orphaned records go to a report for manual decision"; "Migration recomputes leave work days on the server"; "Removed users referenced by leaves become deactivated users"; `(rewrite spec: User decisions › Migration strategy)` — "Migration script moves users and leaves from MongoDB 3.6 to MongoDB 8 and writes a validation report"; `(client answer: Q-S14)` — "yes lets migrate them by setting approved = true"
- **Depends on**: DATA-01, DATA-02, WD-01, SET-02, OPS-03

**Goal**: A CLI script in `apps/api` reads the old `users` and `leaves` collections, converts them to the new User and Leave models, validates every record with the same validators the API uses, recomputes `numDays`, creates deactivated placeholder users for removed users referenced by leaves, and writes a validation report. It supports dry-run, is idempotent, and never modifies the source data.

**Old behavior**:
- Collections: Mongoose models `User` and `Leave` (default collections `users`, `leaves`), plus `Place` and `Trip` which are not migrated (`server/db/schema.js:37,66,105,143`). Every document has a Mongoose `_id` ObjectId; there are no timestamp fields.
- User fields: `id` (Google `sub`), `email`, `firstName`, `surname`, `degrees`, `address`, `isAdmin`, `approved` (`server/db/schema.js:39-62`). The `reqired` typo means nothing is enforced (`server/db/schema.js:42,47,56,60`). New users are stored with `degrees: ''`, `address: ''`, `approved: false` (`server/graphql/userRelated.js:49-57`). Users are hard deleted (`server/graphql/userRelated.js:81`).
- Removed users: when a leave references a missing user, the server builds a placeholder `{ id, email: "<id>@deleted.instea.co", firstName: "Deleted", surname: "<id>", isAdmin: false, approved: false }` (`server/service/userService.js:3-13,17-18`), used for requester and approver (`server/graphql/leaveRelated.js:58-62`).
- Leave fields: `id`, `requesterId`, `approverId`, `startDate` (Date), `endDate` (Date), `state`, `type`, `isHalfDay`, `numDays` (`server/db/schema.js:107-140`). `id` is uuid v4 (`server/graphql/leaveRelated.js:15,23`). `approverId` is unset until approve/reject (`server/graphql/leaveRelated.js:21-26,40-54`).
- Date storage: the Angular form starts with today at local midnight (`angular/src/app/leaves/leaves-add/leaves-add.component.ts:28-33,88-92`) and PrimeNG `p-calendar` date-only pickers (`angular/src/app/leaves/leaves-add/leaves-add.component.html:18,27`). The service sends `startDate.toISOString()` (`angular/src/app/services/leaves.service.ts:89-95`). The server stores `moment(val).toDate()` (`src/data/Leave.js:32-35`, `src/data/dataUtil.js:5`). So a leave picked as 2024-03-11 in Bratislava is stored as `2024-03-10T23:00:00.000Z` (CET) or `…T22:00:00.000Z` (CEST): the instant of local midnight in the requester's browser time zone. Clients read it back as a local date (`angular/src/app/leaves/leave.ts:33-34`), and the client work-day count normalizes to local noon (`angular/src/app/services/holiday-count.service.ts:10-18`).
- `numDays` is computed by the client, half-day subtracts 0.5 only when count > 0 (`angular/src/app/services/holiday-count.service.ts:29-46`, `angular/src/app/leaves/leaves-add/leaves-add.component.ts:55-63`), and stored unvalidated.
- Missing `type` is shown as ANNUAL and missing `state` as PENDING by the Angular client (`angular/src/app/leaves/leave.ts:35-42`).

**Constraints**:
- Only users and leaves are migrated; `trips`, `places` and any other collection are ignored (`(rewrite spec: User decisions › Data migration)`).
- Users with `approved=false` (pending users) are migrated as `active=true` `(client answer: Q-S14)`. `approved`, `degrees`, `address` are dropped (`(rewrite spec: User decisions › User administration)` — "Drop travel-only fields degrees and address"); they remain only in the offline final dump (MIG-04).
- Source access: the Node driver used by Mongoose 8 may not support MongoDB 3.6 servers. The script therefore never connects to the 3.6 server. The operator restores the old dump (only `cestaky.users` and `cestaky.leaves`) into a staging database `cestaky_legacy` on the MongoDB 8 server with `mongorestore --nsInclude 'cestaky.users' --nsInclude 'cestaky.leaves' --nsFrom 'cestaky.*' --nsTo 'cestaky_legacy.*' --noIndexRestore --gzip --archive=<file>`; the script reads from there. Verify this restore path in MIG-02.
- Day conversion timezone: `DEFAULT_TIMEZONE` (default `Europe/Bratislava`), brief convention.
- Validation uses the same DTO/schema validators and work-day function as the API (imported from `packages/shared` / DATA-01 / DATA-02), not a copy.
- Migration writes no AuditLog entries and sends no emails `(interview: Remaining)`.
- Severity policy `(interview: Remaining)`: errors → record skipped and reported; warnings → record migrated and reported.

**Data model**: field mapping.

User (target owner DATA-01):

| new field | source | rule |
|---|---|---|
| `id` | `id` | required non-empty string; else error `USER_MISSING_ID` |
| `email` | `email` | trimmed, lowercased; required, valid email; else error `USER_INVALID_EMAIL`; duplicate after lowercasing → error `USER_DUPLICATE_EMAIL` on all involved records |
| `firstName` | `firstName` | trimmed; empty/missing → `''` + warning `USER_EMPTY_NAME` (migrated) `(interview: Remaining)` |
| `surname` | `surname` | same as `firstName` (one `USER_EMPTY_NAME` finding per user, `details` lists the empty fields) |
| `isAdmin` | `isAdmin` | `true` only if source is boolean `true`; missing → `false` + info `USER_ISADMIN_DEFAULTED` |
| `active` | — | `true` for every source user; source `approved !== true` → info `USER_APPROVED_FALSE_ACTIVATED` |
| `deactivatedAt` | — | `null` |
| `anonymizedAt` | — | `null` |
| `createdAt`, `updatedAt` | `_id` | both = `_id.getTimestamp()` |
| dropped | `approved`, `degrees`, `address`, `_id`, `__v` | counted in report summary (number of non-empty `degrees` / `address`) |

Duplicate `id` among source users → error `USER_DUPLICATE_ID`, none of the duplicates migrated.

Placeholder user for a removed user (created when a leave's `requesterId` or `approverId` has no source user):

| field | value |
|---|---|
| `id` | the referenced id |
| `email` | `<id>@deleted.instea.co` lowercased (same as `server/service/userService.js:7`) |
| `firstName` | `Deleted` |
| `surname` | `<id>` |
| `isAdmin` | `false` |
| `active` | `false` |
| `deactivatedAt` | migration run start time |
| `anonymizedAt` | `null` |
| `createdAt`, `updatedAt` | migration run start time |

Each placeholder → warning `USER_PLACEHOLDER_CREATED` with the referencing leave ids.

Leave (target owner DATA-02):

| new field | source | rule |
|---|---|---|
| `id` | `id` | required uuid (any version accepted for legacy ids; non-uuid → warning `LEAVE_ID_NOT_UUID` and kept); missing → error `LEAVE_MISSING_ID`; duplicate → error `LEAVE_DUPLICATE_ID` (none migrated) |
| `requesterId` | `requesterId` | required; missing → error `LEAVE_MISSING_REQUESTER`; unknown user → placeholder user |
| `approverId` | `approverId` | missing/empty → `null`; unknown user → placeholder user |
| `startDate` | `startDate` | Date → `YYYY-MM-DD` = `formatInTimeZone(startDate, DEFAULT_TIMEZONE, 'yyyy-MM-dd')`; missing/invalid Date → error `LEAVE_INVALID_DATE` |
| `endDate` | `endDate` | same conversion |
| `isHalfDay` | `isHalfDay` | `true` only if boolean `true`; else `false` |
| `type` | `type` | one of ANNUAL, SICKNESS, DOCTOR, MATERNITY, PARENTAL, CARING; missing → `ANNUAL` + info `LEAVE_TYPE_DEFAULTED`; other value → error `LEAVE_INVALID_TYPE` |
| `state` | `state` | one of PENDING, APPROVED, REJECTED; missing → `PENDING` + warning `LEAVE_STATE_DEFAULTED`; other value → error `LEAVE_INVALID_STATE` |
| `numDays` | — | recomputed by the shared work-day function from new `startDate`, `endDate`, `isHalfDay`; if different from source `numDays` (or source missing) → info `LEAVE_NUMDAYS_CHANGED` with old and new |
| `createdAt`, `updatedAt` | `_id` | both = `_id.getTimestamp()` |

**Business rules**:
- Date conversion check: if the source instant is not exactly 00:00:00.000 local time in `DEFAULT_TIMEZONE` → warning `LEAVE_DATE_NOT_LOCAL_MIDNIGHT` (record migrated with the converted date; operator decides). Typical cause: requester's browser in another time zone.
  - Example: `2024-03-10T23:00:00.000Z` → Bratislava 2024-03-11 00:00 → `2024-03-11`, no finding.
  - Example: `2024-07-14T22:00:00.000Z` → Bratislava 2024-07-15 00:00 (CEST) → `2024-07-15`, no finding.
  - Example: `2024-03-11T00:00:00.000Z` → Bratislava 2024-03-11 01:00 → `2024-03-11`, warning.
- Business-rule validation (errors, not migrated): `endDate < startDate` → `LEAVE_END_BEFORE_START`; `isHalfDay` and `startDate ≠ endDate` → `LEAVE_HALF_DAY_MULTIPLE_DAYS`. These are the same `ErrorCode` values the API validators use (DATA-02, `packages/shared`). The LV-01 new-leave limits (date range `2000-01-01`..`2100-12-31`, `LEAVE_TOO_LONG`) are not applied to legacy data `(user decision 2026-11-09)`.
- A leave whose `requesterId` or `approverId` refers to a source user that was skipped for an error → error `LEAVE_USER_SKIPPED`, not written.
- Recomputed `numDays === 0` (only weekend/holiday days) → info `LEAVE_ZERO_WORK_DAYS`; migrated (0-work-day leaves are allowed, `(interview: UI defaults)`).
- Severity semantics `(interview: Remaining)`: `error` = record NOT written; `warning` = written, needs a decision in MIG-02; `info` = written, no decision needed. The report is "clean" when it has 0 errors and 0 undecided warnings.
- Order: load all source users, validate, then load all leaves, resolve references (placeholders), validate, then write users (incl. placeholders) and leaves.

**API** (CLI, not HTTP):
- Command: `pnpm --filter api migrate:legacy [--dry-run] [--replace] [--report-dir <path>]`; inside the image: `node dist/migration/migrate-legacy.js` with the same flags.
- Env: `LEGACY_MONGO_URL` (points to `cestaky_legacy` on the MongoDB 8 server, app DB user with `read` on it; required), `MONGO_URL` (target), `DEFAULT_TIMEZONE`.
- `--dry-run`: reads, validates, writes the report; writes nothing to the target. Default report dir `./migration-report/<UTC timestamp>/`.
- Idempotency: without `--replace`, the script aborts with exit code 2 and message `Target collections users/leaves are not empty; use --replace to overwrite` if either target collection has documents. With `--replace`, it deletes all documents from target `users`, `leaves`, `refreshtokens` (collection of AUTH-02) and then inserts. Same input → identical output (deterministic, placeholder timestamps excepted).
- Writes are bulk inserts; indexes are created by the Mongoose models (`syncIndexes`) before insert.
- Exit codes: `0` success (report may contain warnings); `1` unexpected failure (connection, write error) — target may be partial, rerun with `--replace`; `2` refused (non-empty target without `--replace`, or missing env); `3` finished but report contains errors (records skipped).

**Report format** (files in report dir):
- `report.json`: `{ "startedAt": ISO, "finishedAt": ISO, "dryRun": bool, "timezone": string, "source": { "users": n, "leaves": n }, "migrated": { "users": n, "placeholderUsers": n, "leaves": n }, "skipped": { "users": n, "leaves": n }, "droppedFields": { "degreesNonEmpty": n, "addressNonEmpty": n }, "findingsByCode": { "<CODE>": n }, "findings": [ { "severity": "error|warning|info", "code": "UPPER_SNAKE", "collection": "users|leaves", "sourceObjectId": "<_id hex>", "recordId": "<id or null>", "message": "English text", "details": { ... }, "action": "skipped|migrated|migrated-with-default|placeholder-created" } ] }`.
- `report.md`: human summary: counts table, then findings grouped by code with one row per record (`recordId`, `message`, `details`), errors first. No email addresses or names in `report.md` other than placeholders' ids (only ids; `report.json` may contain emails — store with the dumps offline).
- `decisions.csv` template: `code,recordId,decision,decidedBy,note` pre-filled with every error and warning, for MIG-02.

**Acceptance criteria**:
- Given source users A (approved=true), B (approved=false, isAdmin missing), when migrated, then both are `active=true`, B `isAdmin=false`, findings `USER_APPROVED_FALSE_ACTIVATED` and `USER_ISADMIN_DEFAULTED` for B.
- Given a leave whose `requesterId` X has no user, when migrated, then a user X with `firstName="Deleted"`, `surname=X`, `email="X@deleted.instea.co"`, `active=false`, `deactivatedAt` set exists and the leave keeps `requesterId=X`; one `USER_PLACEHOLDER_CREATED` finding lists the leave id.
- Given two leaves referencing the same missing user, then exactly one placeholder is created.
- Given a leave with `approverId` of a missing user, then a placeholder is created for the approver too.
- Given `startDate=2024-03-10T23:00:00Z`, `endDate=2024-03-12T23:00:00Z`, `isHalfDay=false`, then dates `2024-03-11` / `2024-03-13` and `numDays=3`.
- Given a leave with stored `numDays=2` that recomputes to 1 (holiday data refreshed), then `numDays=1` and info `LEAVE_NUMDAYS_CHANGED` with `{ "old": 2, "new": 1 }`.
- Given `endDate` before `startDate`, then the leave is not written and error `LEAVE_END_BEFORE_START` is reported; exit code 3.
- Given half-day with two different dates, then error `LEAVE_HALF_DAY_MULTIPLE_DAYS`, not written.
- Given missing `type`, then `ANNUAL` and info; given `type: "VACATION"`, then error `LEAVE_INVALID_TYPE`.
- Given two users with emails `A@instea.co` and `a@instea.co`, then both get `USER_DUPLICATE_EMAIL` error and none is written; leaves whose requester or approver was skipped for an error get error `LEAVE_USER_SKIPPED` and are not written (no placeholder is created for a user that exists but failed validation), so the operator fixes the user first.
- Given `--dry-run`, then target collections are unchanged and the report is written.
- Given a non-empty target and no `--replace`, then exit code 2 and nothing written.
- Given the script runs twice with `--replace` on the same input, then target documents are identical except placeholder timestamps.
- Given source collections `trips` and `places`, then they are not read.

**Tests**:
- unit (`apps/api/src/migration/*.spec.ts`): date conversion (CET, CEST, DST switch days 2024-03-31 and 2024-10-27, non-midnight instant, invalid Date); user mapping (each row of the table); leave mapping; placeholder dedupe; duplicate id/email detection; severity → action; report JSON schema; exit-code selection.
- integration (real MongoDB 8, TST-02): seed `cestaky_legacy` with fixture documents mirroring the old shapes (incl. `degrees`, `address`, `approved`, `__v`, missing fields, ObjectId `_id`), run the script in-process for dry-run, normal, refused, `--replace`; assert target documents, counts and report files; assert the migrated data passes the new API: `GET /api/leaves` returns the migrated leaves and a placeholder requester shows as deactivated.
- integration: fixture restored from a real `mongodump --gzip --archive` of a `mongo:3.6` container (generated once by a script and committed as a small binary fixture) proves the `mongorestore` path into MongoDB 8 works.

### MIG-02 — Migration rehearsal on an anonymized production dump

- **Type**: decision
- **Source**: `(rewrite spec: User decisions › Migration strategy)` — "Rehearse the migration locally on an anonymized prod dump until the report is clean or every finding is decided"
- **Depends on**: MIG-01, MIG-03, OPS-02, SET-04

**Goal**: An operator takes a production dump, anonymizes it on the server host before it leaves the cluster, and developers run MIG-01 against it locally repeatedly. Every error and warning gets a recorded decision, and the script or the cutover runbook is adjusted until the report is clean or fully decided.

**Old behavior**: New — no counterpart in the old system. Production dumps are made by `kubernetes/backup.cestaky.sh:37-42` into `/opt/instea/backup/mongo/dumps/mongo3` on the host.

**Constraints**:
- No personal data leaves the server host un-anonymized (data privacy NFR; rehearsal is "anonymized").
- Anonymization must be deterministic and consistent across collections so references and the attendance parity tests (MIG-03) still work: same input email → same pseudonym in `users` and in the SSO mock fixture.
- Keep everything that affects migration results unchanged: `_id`, `id` of leaves, dates, `state`, `type`, `isHalfDay`, `numDays`, `approved`, `isAdmin`, presence/absence of fields, references between leaves and users, email domain and letter case pattern (duplicates-by-case must survive).

**Business rules**:
- Script `apps/api/scripts/anonymize-legacy.ts`, run against a throwaway `mongo:8` container on the server host into which the latest prod dump was restored as `cestaky_legacy` (users + leaves only). Env `ANONYMIZE_SECRET` (random per rehearsal, never stored in repo).
- Users: `id` → `anon-` + first 16 hex of HMAC-SHA256(secret, id); leaves' `requesterId` / `approverId` mapped with the same function (references preserved, missing users stay missing); `email` local part → `user-` + first 12 hex of HMAC(secret, lowercased email), case pattern of the original kept (if original contained uppercase, uppercase the pseudonym's first letter), domain kept; `firstName` → `First<n>`, `surname` → `Last<n>` (n = stable index by sorted pseudonymized id); `degrees`, `address` → `''` if non-empty, missing if missing.
- Output: `mongodump --db cestaky_legacy --gzip --archive=cestaky-anon-<date>.gz`.
- SSO/Toggl fixtures: on the server host, the rehearsal records the real SSO meta response (`SSO_URI`) and the Toggl Reports v3 responses for the rehearsal months, in the format the MIG-03 harness replays. The same HMAC pseudonymizes emails, names and SSO keys; Toggl API tokens and workspace ids are replaced with fake values; Toggl entry descriptions are replaced with `entry-<n>`; hours, dates and the `togglUserId` mapping stay. Output `sso-toggl-fixtures-<date>.json`.
- Parity run: each rehearsal runs the MIG-03 parity harness locally: old app image (`registry.instea.co/cestovne-prikazy:0.1.0`) on `mongo:3.6` with the anonymized dump, new app on `mongo:8.0` with the migrated data, both pointed at the recorded SSO/Toggl fixtures served by the harness mock; outputs compared per month. Diffs other than the expected parity diffs listed in MIG-03 are findings for the decisions file.
- Rehearsal loop: restore anon dump → `migrate:legacy --dry-run` → review `report.md` → fill `decisions.csv` (decision values: `accept`, `fix-in-source-before-cutover`, `fix-in-script`, `drop`) → change script or plan source fixes → repeat. Decisions file is kept in the (private) ops folder, not in the repo, because it contains record ids.
- Source fixes for production (`fix-in-source-before-cutover`) are executed in MIG-04 step 10 as a reviewed `mongosh` script on `cestaky_legacy` (the restored final dump on MongoDB 8), never on the old DB.
- Exit criterion: last rehearsal report has 0 errors, every warning code has a decision, the MIG-03 parity harness shows only expected diffs, and record counts match: `migrated.users + skipped.users = source.users`, same for leaves.

**Acceptance criteria**:
- Given a prod dump, when anonymized, then no original email, first name, surname, degrees, address or user id appears in the output (checked by script by comparing against the source values before writing).
- Given a leave referencing a user, then after anonymization the reference points to the same pseudonymized user.
- Given the same secret and dump, when anonymized twice, then outputs are identical.
- Given the anon dump, when MIG-01 runs, then finding counts by code equal those of a run on the original (operator checks once on the host).
- Given recorded SSO/Toggl fixtures, then no real email, name, Toggl token or entry description remains in them.
- Given the anonymized dump and fixtures, when the MIG-03 harness runs locally, then old and new attendance outputs differ only by the expected parity diffs.
- Given the final rehearsal, then a sign-off note records date, dump date, report counts, parity result and who approved.

**Tests**:
- unit: HMAC mapping deterministic; SSO/Toggl fixture pseudonymization keeps the email ↔ user mapping; case-pattern preservation keeps `A@x` vs `a@x` duplicates distinct but colliding when lowercased; field coverage.
- integration (MongoDB 8): seed legacy fixture, anonymize, assert no original PII values remain, references intact, MIG-01 findings by code unchanged between original and anonymized fixture.

### MIG-03 — Attendance parity test harness (old vs new)

- **Type**: decision
- **Source**: `(rewrite spec: User decisions › Testing)` — "Parity tests: attendance API of old and new system return equal output for the same data"; `(rewrite spec: Migration strategy)` — "Before cutover, run parity tests of the attendance API old vs new on the rehearsed data".
- **Depends on**: ATT-01, TST-04, MIG-01

**Goal**: A repeatable local harness that runs the old app (current production image) and the new app (new image) on one machine against the same data and the same SSO and Toggl fixtures, calls `GET /api/attendence/:year/:month` on both for a defined set of months, and reports per-month equality and structured diffs. It runs in CI on a synthetic dataset and locally during migration rehearsal on the rehearsed (anonymized prod dump) dataset with recorded fixtures. Cutover is big bang with downtime and no side-by-side production run (interview: Rollback), so the rehearsal run is the only old-vs-new comparison on real data. Known, intended differences are classified so that only unexplained diffs fail the run.

**Old behavior**: no parity tooling exists; old tests cover only `server/service/tests/tripService.test.js`. Old runtime facts that shape the harness: image `node:12.22-slim`, `CMD node server/index.js`, port 4100 (`Dockerfile:29-42`, `server/index.js:24`); requires `secrets/key.pem` at boot (`server/auth/setup.js:7`); Toggl base URL hard-coded `https://api.track.toggl.com/reports/api/v3` (`server/service/attendenceService.js:7`); SSO URL from `SSO_URI`.

**Constraints**:
- Old codebase not modified. The old image is used as built (production tag in `registry.instea.co`).
- Same data: old app reads the rehearsal MongoDB 3.6 restore of the anonymized dump; new app reads the MongoDB 8 database produced by the migration from that same dump.
- Same integrations: one mock server serves both apps.
- No real Toggl/SSO calls in CI. Recorded fixtures with real tokens or personal data are not committed.
- Runs only locally (developer machine or CI runner), never in the production cluster (interview: Rollback: no side-by-side run).
- Pre-cutover check (also listed in MIG-04): confirm with the M2M consumer owner that the consumer calls the attendance endpoint server-side, because the new app sends no CORS headers on that route (ATT-01 assumption). Record the confirmation in the rehearsal report.

**Integrations** (harness setup, docker-compose profile `parity`):
- Services: `old-mongo` (mongo:3.6, restored dump), `old-app` (old image; env `MONGO_URL`, `M2M_USERNAME`, `M2M_PASSWORD`, `SSO_URI=<mock>/sso`, `SSO_USERNAME`, `SSO_PASSWORD`, `DEFAULT_TIMEZONE` same as new, `NODE_EXTRA_CA_CERTS=/certs/ca.pem`; volume with a throwaway `key.pem`), `new-mongo` (mongo:8, migrated), `new-app` (env `TOGGL_REPORTS_BASE_URL=<mock>`, same SSO and M2M env), `mock` (contract mock server from TST-04 serving SSO and Toggl over HTTPS with a harness CA).
- Toggl redirect for the old app: container `extra_hosts`/network alias maps `api.track.toggl.com` to `mock`; `mock` serves a certificate for `api.track.toggl.com` signed by the harness CA trusted via `NODE_EXTRA_CA_CERTS`.
- Fixtures: (a) synthetic set committed in repo, covering every edge case listed in Business rules; (b) recorded set, captured by the operator during rehearsal through a recording proxy against real SSO/Toggl for the parity months. Before use, the operator scrubs secrets: `togglApiToken` values and `Authorization` headers replaced by placeholders (the mock matches on the placeholder). The recorded set is stored offline with the rehearsal dump (encrypted company drive) and never committed.
- Mock matching: Toggl responses keyed by (`workspaceId`, `user_ids`, `start_date`, `end_date`, `first_row_number`, token); unmatched request → mock returns 599 and logs it; the harness fails the run on any unmatched request. The mock records every request from both apps.

**Business rules**:
- Month set: every (year, month) from the month of the earliest leave `startDate` in the dataset to the current month + 1, plus edge requests `YYYY/0`, `YYYY/13`, `YYYY/1.5` for the current year, `Infinity/1`, and invalid `abc/1`, `2024/abc`.
- Per request: same Basic credentials; client timeout 120 s (old Toggl paging is slow by design, 500 ms per page per employee).
- Comparison, in order:
  1. Status code equal.
  2. Body byte-equal (key order and number formatting included).
  3. If not byte-equal: parse both, compute a structural diff (path, old value, new value) and classify.
  4. Outgoing requests: per app, the ordered list of SSO and Toggl requests (method, path, body, auth header) must be equal, except for classified differences.
- Expected-diff classes (reported, do not fail when every diff path matches a class). Each safe fix accepted in (interview: Attendance) has its own class:
  - `HOLIDAY_REFRESH`: `leave` differs only on dates where old `date-holidays` 1.2.0 SK (any holiday type) and WD-01 (latest pinned, `type === 'public'` only) disagree on working-day status (harness computes this list for the range).
  - `HANG_FIX`: old request times out and the dataset contains an employee without `togglUserId` with an APPROVED leave on a working day of that month; new returns 200.
  - `MIGRATION_REPORT`: diff limited to users/leaves listed in the migration validation report as excluded or changed.
  - `NO_TOGGL_ID_SKIPPED`: old app sent a Toggl request with `user_ids: [null]` for an employee without `togglUserId` (and may have returned 500 Toggl); new sends none (ATT-04).
  - `LEAVE_YEAR_CHECK`: diff only for leaves spanning more than 11 months (old checked month only; new checks year and month).
  - `NON_FINITE_PARAM`: request with `Infinity`-like year/month; old 200/500 with `Invalid date`, new 400 with the old text (ATT-01).
  - `UNEXPECTED_ERROR_500`: old request hung on an internal error (other than `HANG_FIX`), new returns 500 `{"message":"Internal server error"}` (ATT-01).
  - `TIMEOUT_REDIRECT_LIMIT`: only when fixtures inject a slow (> 30 s) response or more than 5 redirects; old waited or followed, new returns the old SSO/Toggl 500 text (ATT-02, ATT-03).
  - `CORS_HEADERS`: old response has `Access-Control-Allow-Origin: *`, new has none (headers other than `Content-Type` are not compared otherwise).
- Any other diff fails the run.
- Report: Markdown + JSON in `parity-report/` with per-month status (EQUAL / EXPECTED_DIFF / DIFF / ERROR), each diff path with class, unmatched mock requests, timings.

**Acceptance criteria**:
- Given the synthetic dataset in CI, when the harness runs, then every month is EQUAL or EXPECTED_DIFF and the job passes.
- Given a deliberately broken new build (e.g. `D8` changed to `D7`), then the harness reports DIFF for affected months and fails.
- Given a key-order change in the new output, then byte comparison fails and the report shows "order-only" diff.
- Given an unmatched Toggl request, then the run fails and names the request.
- Given the rehearsal dataset and the recorded fixtures, when the operator runs the harness locally during rehearsal, then the report has zero DIFF entries, or each DIFF is decided and recorded in the migration decision log before the go/no-go.
- Given the recorded fixtures, then they contain no real `togglApiToken` or `Authorization` value (harness scans and refuses to run otherwise).
- Given the rehearsal report, then it records the consumer owner's confirmation that the M2M consumer calls server-side.

**Tests**:
- Integration: harness self-test with a fixture where both apps are expected equal; self-test with an injected diff; classifier unit tests per class.
- CI: synthetic parity run on every PR touching `apps/api/src/attendance/**`, `packages/shared/**` (work days), or migration code.
- Manual: local rehearsal run with recorded fixtures, part of the MIG-04 go/no-go checklist.

### MIG-04 — Cutover runbook

- **Type**: decision
- **Source**: `(rewrite spec: User decisions › Migration strategy)` — "Announce the cutover window; freeze writes on the old app"; "Take a final full dump of the old database and an archive of generated files; store offline"; "Run the migration, check record counts and the report, smoke-test login, leaves and the attendance API"; "Switch host nginx / ingress to the new app; the M2M consumer keeps the same attendance URL"; `(interview: Rollback)` — cutover is big bang with downtime, no side-by-side run
- **Depends on**: MIG-02, OPS-01, OPS-02, OPS-03, DOC-03

**Goal**: A step-by-step runbook `deploy/CUTOVER.md` moves production from the old app to the new one in one announced downtime window. The old stack is removed before the new one is deployed; there is no side-by-side run. Rollback is a redeploy of the old manifests and image with the final dump restored.

**Old behavior**:
- Old deployment `cestaky-deployment`, service `cestaky-service`, ingress `cestaky-ingress` with path `/cestaky/?(.*)` → `cestaky-service:80` (`kubernetes/cestaky.yml:1-122`); MongoDB 3.6 StatefulSet `mongo3-sfset`, service `mongo3-service`, PVC `mongo3-pvc` (`kubernetes/mongo3.yml:1-63`); Secret `cestaky-secrets` (`kubernetes/cestaky-secrets.yml`).
- Keel force-updates `cestaky-deployment` on new `registry.instea.co/cestovne-prikazy:latest` images (`kubernetes/cestaky.yml:7-12,32`).
- Generated xlsx files are written to `server/download` inside the container (`server/index.js:26-34`). The deployment mounts only the secret volume (`kubernetes/cestaky.yml:79-88`), so the files exist only in the running container's filesystem and are lost on every restart.
- The old app has no read-only or maintenance mode: every read and write is a GraphQL POST to `/graphql` (`server/index.js:40-45`), so writes cannot be blocked selectively. Writes are frozen by taking the whole app offline.

**Constraints**:
- `(interview: Rollback)` overrides the spec lines "Keep the old app read-only for 2 weeks as rollback; rollback = switch ingress back" and "After 2 weeks, decommission the old deployment and the MongoDB 3.6 StatefulSet". There is no 2-week parallel run; the old stack is removed during the window.
- Same public URL `https://cestaky.instea.co` and `/cestaky` ingress prefix, no redirects `(interview: App URL)`. Attendance URL `GET /api/attendence/:year/:month` and M2M credentials (`M2M_USERNAME`, `M2M_PASSWORD` values) are unchanged.
- New image `registry.instea.co/cestaky-leaves`, so Keel never rolls the new image into old manifests (`kubernetes/cestaky.yml:9-12,32`).
- Final dump and archives are stored on the encrypted company drive with sha256 checksums `(interview: Remaining)`. A maintenance page on host nginx is shown during downtime `(interview: Remaining)`.
- Rollback restores data as of the freeze; data written in the new app after cutover is lost `(interview: Rollback)`.
- Before the window: MIG-02 signed off, MIG-03 parity green on the last rehearsal, VPS CPU AVX check passed (OPS-03), new manifests merged, image `cestaky-leaves:1.0.0` built (NFR-11), the old manifests tagged in git as `legacy-final` and the old image tag `registry.instea.co/cestovne-prikazy:0.1.0` kept in the registry (not deleted).

**Business rules** (runbook steps, in order):
1. Announce (T-5 working days): date, start time, expected duration (from the MIG-02 rehearsal timings), effect "app and attendance API unavailable", to all employees and the M2M consumer owner.
2. Attendance capture (T-1 day, before freeze): call the old `GET /api/attendence/<year>/<month>` for the current and previous month with M2M credentials; save responses (`attendance-capture-<year>-<month>.json`) for step 13. Note that hours logged in Toggl after the capture can differ.
3. Maintenance page: switch host nginx for `cestaky.instea.co` to a static maintenance page (HTTP 503, `Retry-After`, text "Leaves app is being upgraded. Back at <time>."), `nginx -t && systemctl reload nginx`. Attendance callers get 503 during the window.
4. Archive xlsx files from the old pod: `microk8s kubectl cp <old-pod>:/opt/app/server/download ./download-<date>`, then `tar czf cestaky-download-<date>.tar.gz download-<date>`. Only files since the last pod restart exist; record the file count.
5. Freeze: `microk8s kubectl scale deployment cestaky-deployment --replicas=0`; wait until no old app pod runs.
6. Final dump: run old `kubernetes/backup.cestaky.sh` (MongoDB 3.6 tools inside `mongo3` pod) → `cestaky-<timestamp>.gz`. Create `SHA256SUMS` for the dump and the download archive (`sha256sum`). Copy all three files to the encrypted company drive; verify checksums there.
7. Verify the dump restores: restore it with `mongorestore` into a throwaway local `mongo:3.6` container on the ops host; compare document counts of `users` and `leaves` against `db.users.countDocuments()` / `db.leaves.countDocuments()` taken from the `mongo3` pod before step 8. Mismatch → abort (go to Abort).
8. Delete old app and DB objects: `cestaky-deployment`, `cestaky-service`, `mongo3-sfset`, `mongo3-service`, Secret `cestaky-secrets`. Keep PVC `mongo3-pvc` and ingress `cestaky-ingress` for now.
9. Deploy new stack (OPS-03): create Secrets `cestaky-leaves-secrets` and `mongo8-secrets`; apply `mongo8.yml`; run the `mongo8-rs-init` Job (replica set + app user); apply `config.yml`, `app.yml` (Deployment + Service). Check `microk8s kubectl port-forward service/cestaky-leaves-service 10082:80` and `GET /health-check` → 200.
10. Restore legacy data into MongoDB 8: copy the final dump into the `mongo8` pod and run the MIG-01 `mongorestore` command into `cestaky_legacy`. Apply the reviewed `mongosh` fix script for findings decided as `fix-in-source-before-cutover` in MIG-02 on `cestaky_legacy`.
11. Migrate as a k8s Job using the new image: `migrate:legacy --dry-run`; compare the report with the last rehearsal (same finding codes; counts differ only by records created since the rehearsal dump). Then run without `--dry-run`. Save both reports to the encrypted drive.
12. Go/no-go: exit code 0, 0 errors, `migrated + skipped = source` for users and leaves, every warning code already decided in MIG-02. Any failure → Abort or Rollback.
13. Smoke test through port-forward with real data: Google login as an admin and as a normal user; `/leaves` shows the migrated leave count; calendar renders; create a leave and delete it (its audit entries stay); `/approval` lists as many PENDING leaves as the source; `GET /api/attendence/<year>/<month>` with M2M credentials returns 200 and matches the step-2 capture except the expected parity diffs listed in MIG-03 and Toggl hours logged after the capture.
14. Route traffic: apply `deploy/k8s/ingress.yml` (ingress `cestaky-ingress`, backend `cestaky-leaves-service:80`).
15. Remove the maintenance page on host nginx; reload. Check `https://cestaky.instea.co/health-check` → 200, login works, the M2M consumer's next call returns 200. Announce completion.
16. After a successful smoke test and one working day of normal use: delete PVC `mongo3-pvc` (last old object). Drop `cestaky_legacy` from MongoDB 8. The first new backup (OPS-02) is taken the same day.

**Abort** (before step 8): scale `cestaky-deployment` back to 1, remove the maintenance page, announce a new date. No data changed.

**Rollback** (after step 8, decided by the product owner):
1. Show the maintenance page.
2. Scale `cestaky-leaves-deployment` to 0.
3. Redeploy the old stack from git tag `legacy-final`: `kubernetes/mongo3.yml` with a fresh PVC (or the kept `mongo3-pvc` if step 16 has not run yet), re-create Secret `cestaky-secrets`, apply `kubernetes/cestaky.yml` with image pinned to `registry.instea.co/cestovne-prikazy:0.1.0`.
4. If a fresh PVC is used, restore the final dump with old `kubernetes/restore.sh` into `cestaky` (`RESTORE_DB=cestaky`).
5. Point ingress `cestaky-ingress` back to `cestaky-service`, remove the maintenance page, announce.

All data written in the new app after cutover is lost; this is accepted `(interview: Rollback)`.

**Acceptance criteria**:
- Given the runbook, when the final MIG-02 rehearsal executes steps 6–13 with local equivalents (docker containers for `mongo:3.6` and `mongo:8.0`), then all checks pass and step timings are recorded.
- Given step 7 or step 12 fails, then the runbook leads to Abort or Rollback and no ingress change happens.
- Given step 15 is done, when the M2M consumer calls the unchanged URL with the unchanged credentials, then 200.
- Given the window, then the public URL shows the maintenance page from step 3 until step 15.
- Given Rollback, then the old app serves the data as of the freeze, from the git tag and the kept image tag.
- Given the encrypted drive, then the dump, the download archive and `SHA256SUMS` exist and checksums verify.

**Tests**:
- manual: full runbook rehearsal in MIG-02, including one Rollback rehearsal locally (old image + `mongo:3.6` + final-dump restore).
- e2e: the TST-03 smoke subset (list, create/delete, approval list) runs against `E2E_BASE_URL` in the rehearsal; production smoke is manual (real Google login).

## Testing (TST)

### TST-01 — Unit test setup and coverage

- **Type**: decision
- **Source**: `(rewrite spec: User decisions › Testing)` — "Unit tests for all business rules: work days, holidays, half-day, filters, summary, attendance codes"; "AI agents may be used for the rewrite, so every feature ships with tests; test coverage is maximised"
- **Depends on**: SET-01

**Goal**: Vitest runs unit tests for `packages/shared`, `apps/api` and `apps/web` with coverage and enforced thresholds. Business-rule modules have the strictest thresholds.

**Old behavior**: Server jest has 4 cases (`server/service/tests/tripService.test.js`), not run by `bin/test.sh` (analysis §6). React has one dummy test (`src/App.test.js:1-3`). Angular has real logic tests for leave filter (`angular/src/app/leaves/leaveFilter.spec.ts`, 8 cases), holiday count (`angular/src/app/services/holiday-count.service.spec.ts`, 4 cases) and summary (`angular/src/app/leaves/summary/summary.component.spec.ts`, 2 cases) — these cases must be ported by the owning feature tasks. CI runs no tests (`.github/workflows/release.yml`).

**Constraints**: Vitest (brief). Every feature task lists its unit tests; this task only provides infrastructure and gates.

**Business rules** (configuration):
- Vitest workspace projects: `shared` (node env), `api-unit` (node env, `*.spec.ts` under `src/`, excludes `*.int-spec.ts`), `web` (jsdom env, Testing Library, MSW for HTTP).
- Coverage provider `@vitest/coverage-v8`, reporters `text`, `lcov`, `json-summary`; CI fails when below thresholds `(interview: CI gates)`:
  - `packages/shared`: lines 95 %, branches 90 %, functions 95 %.
  - `apps/api` (unit + integration merged, TST-02): lines 85 %, branches 80 %.
  - `apps/web`: lines 75 %, branches 65 %.
- Excluded from coverage: `main.ts`, `*.module.ts`, generated files, `*.d.ts`, test helpers.
- Time-dependent rules use injected clock (`vi.useFakeTimers` / a `Clock` provider) and explicit `DEFAULT_TIMEZONE`; tests run with `TZ=UTC` and again with `TZ=Pacific/Auckland` for `packages/shared` (catches local-time bugs like the old browser-local date handling) — CI matrix on the `shared` project only.
- Holiday data: tests pin expected SK holidays for 2024–2027 to detect `date-holidays` updates.

**Acceptance criteria**:
- Given `pnpm test:unit`, then all three projects run and print coverage.
- Given coverage of `packages/shared` drops below 95 % lines, then CI `unit` job fails.
- Given the shared work-day tests run with `TZ=Pacific/Auckland`, then they pass identically.

**Tests**: self-verifying through CI (NFR-09).

### TST-02 — Integration tests against a real MongoDB

- **Type**: decision
- **Source**: `(rewrite spec: User decisions › Testing)` — "Integration tests for every API endpoint and every authorization rule against a real test database"
- **Depends on**: SET-02, SET-04

**Goal**: An integration test harness boots the full NestJS app against a real MongoDB 8, with contract-based fakes for Google, SSO and Toggl and Mailpit for mail, so every endpoint and every authorization rule is tested over HTTP.

**Old behavior**: None — no API or auth tests exist (analysis §8 Tests).

**Constraints**: Real MongoDB 8 (brief); contract-based mocks for Google token verification, SSO meta API, Toggl Reports v3 `(rewrite spec: User decisions › Integration testability)`; local mail catcher `(same)`.

**Business rules** (harness):
- Files `apps/api/test/**/*.int-spec.ts`, project `api-integration`.
- MongoDB: `@testcontainers/mongodb` starts one `mongo:8.0` container per test run (global setup); `MongoDBContainer` runs a single-member replica set like production `(interview: Infra)`, so transactions (audit) are tested; connection uses `directConnection=true`. Each test file uses its own database `test_<random>`, dropped after the file. If `MONGO_TEST_URL` is set, it is used instead of Testcontainers; it must point to a replica-set member (e.g. the SET-04 compose `mongo`).
- App: `Test.createTestingModule({ imports: [AppModule] })` with overrides: Google verifier → `FakeGoogleVerifier` (same token format as TST-03); clock → controllable `TestClock`; SMTP → Mailpit (Testcontainers `axllent/mailpit`, or the instance at `MAILPIT_API_URL` when set) with helper `mailbox.waitFor({ to, subject })` using Mailpit API `GET /api/v1/search`; SSO and Toggl → HTTP fakes (MSW node or undici `MockAgent`) loaded from JSON fixtures in `packages/shared/test-fixtures/contracts/` that the attendance contract tests also pin.
- Requests via `supertest(app.getHttpServer())`.
- Helpers: `seedUser({ isAdmin?, active? })`, `loginAs(user)` → access token (via `POST /api/auth/google` with fake token, so the real auth path is exercised), `seedLeave(...)`, `m2mAuth()`.
- Authorization matrix test: a table-driven spec lists every route × role (`anonymous`, `deactivated user`, `user`, `owner`, `admin`, `m2m`) with expected status, generated from the Nest route list so a new route without a matrix row fails the test (`every route is covered`).

**Acceptance criteria**:
- Given `pnpm test:integration` on a machine with Docker, then tests run against MongoDB 8 without manual setup.
- Given a new controller route without an entry in the authorization matrix, then the coverage test fails with `Route <METHOD> <path> missing from authorization matrix`.
- Given two test files run in parallel, then they don't see each other's data.

**Tests**: the harness itself has a smoke spec (`health.int-spec.ts`: 200 from `/health-check`, DB isolated per file).

### TST-03 — Playwright E2E browser tests

- **Type**: decision
- **Source**: `(rewrite spec: User decisions › Testing)` — "E2E browser tests for login, create leave, delete, approve / reject, calendar, summary, user admin"
- **Depends on**: SET-03, SET-04, AUTH-01, LV-02, LV-03, LST-03, APR-02, SUM-01, USR-02, USR-03, USR-04

**Goal**: Playwright tests drive the built app in Chromium for the listed flows. Login works without real Google via a test-only verifier that the server refuses to enable in production.

**Old behavior**: One stale Protractor test expecting "Welcome to app!" (`angular/e2e/app.e2e-spec.ts:10-13`); never run in CI.

**Constraints**: Google login cannot be automated against real Google; contract-based mock for Google token verification `(rewrite spec: User decisions › Integration testability)`.

**Business rules**:
- Test-only verifier: `AUTH_GOOGLE_VERIFIER=fake` (SET-02) swaps the `google-auth-library` verifier for `FakeGoogleVerifier`, which accepts ID tokens `fake.<base64url(JSON)>` with payload `{ "sub": string, "email": string, "hd": string, "given_name": string, "family_name": string }` and returns it as the verified payload; all other server logic (hd check, user creation, deactivated check, session issuance) is unchanged. With `NODE_ENV=production` the app refuses to start when `AUTH_GOOGLE_VERIFIER=fake` (exit 1, message `AUTH_GOOGLE_VERIFIER=fake is not allowed in production`).
- Login in tests: fixture `loginAs(page, persona)` calls `page.request.post('/api/auth/google', { data: { idToken: fakeToken(persona) } })` (body field per AUTH-01/AUTH-02), so the refresh cookie lands in the browser context; then `page.goto('/leaves')` restores the session via refresh. One separate test covers the login page itself: the Google script `https://accounts.google.com/gsi/client` is intercepted with `page.route` and a stub that renders a button which calls the app's credential callback with a fake token — verifies the UI path end to end.
- Personas: `admin` (isAdmin), `alice`, `bob` (users), `carol` (deactivated), wrong-domain user (`hd: "other.com"`).
- Environment: app built and run as the production image (`docker compose --profile full`) with `NODE_ENV=test`, `AUTH_GOOGLE_VERIFIER=fake`, MongoDB 8, Mailpit; DB reset per test via a test-only endpoint is NOT added — instead each test seeds via the API with unique data and dates; Playwright `globalSetup` empties every collection (`deleteMany`, indexes kept) via a direct MongoDB connection from `E2E_MONGO_URL`, and refuses any database name other than `cestaky-e2e` (separate from TST-02's `MONGO_TEST_URL`, so integration-test settings can never wipe dev data) `(user decision 2026-11-11)`.
- Time: tests use dates in a fixed future year (e.g. 2031) with known SK holidays, so "today" does not affect results; summary tests choose that year.
- Base URL `E2E_BASE_URL` (default `http://localhost:4100`); browsers: Chromium in CI; traces and video on first retry; `retries: 1` in CI.
- Specs (one file each): `login.spec.ts` (success, wrong domain message (403 `WRONG_DOMAIN`), deactivated user message "Your account has been deactivated. Contact an administrator." (403 `USER_DEACTIVATED`), reload keeps session, logout), `leave-create.spec.ts` (full day, multi-day with weekend and holiday shows correct work days, half-day, validation messages), `leave-delete.spec.ts` (own leave with confirmation; no delete button on others' leaves for user; admin deletes any), `approval.spec.ts` (badge count, approve, reject, row disappears, requester gets email in Mailpit), `calendar.spec.ts` (approved and pending shown, rejected hidden, filters), `summary.spec.ts` (APPROVED only), `user-admin.spec.ts` (list, edit names and admin flag, deactivate, deactivated user cannot log in; non-admin cannot reach `/users`), `i18n.spec.ts` (switch to SK persists).

**Acceptance criteria**:
- Given `pnpm e2e` with the compose stack up, then all specs pass in Chromium.
- Given `NODE_ENV=production` and `AUTH_GOOGLE_VERIFIER=fake`, then the app does not start (covered also by SET-02 unit test).
- Given a failing spec in CI, then the Playwright HTML report and trace are uploaded as artifacts.

**Tests**: this task is the test suite; flakiness gate: CI runs specs once with `retries: 1`; a spec that needs the retry is reported as flaky in the job summary.

### TST-04 — Contract mocks and contract tests for Google, SSO meta API and Toggl Reports v3

- **Type**: decision
- **Source**: `(rewrite spec: User decisions › Integration testability)` — "Contract-based mocks for Google token verification, SSO meta API and Toggl Reports v3 in tests"; "Contract tests pin the attendance JSON format and SSO / Toggl response parsing".
- **Depends on**: AUTH-01, ATT-01, ATT-02, ATT-03

**Goal**: Provide shared, contract-based test doubles for the three external integrations, and contract tests that pin request shapes, response parsing and the attendance JSON format. The same mocks serve Vitest integration tests, Playwright E2E (Google) and the MIG-03 parity harness (SSO, Toggl).

**Old behavior**:
- Google: `new OAuth2Client(CLIENT_ID).verifyIdToken({ idToken: token_id, audience: CLIENT_ID })`, then `ticket.getPayload()` fields `sub`, `hd`, `email`, `given_name`, `family_name` (`server/graphql/userRelated.js:7-11`, `:22-29`, `:51-52`); hosted-domain check `hostedDomain && hostedDomain !== payload.hd` (`:30`). No tests.
- SSO: see ATT-02 (`server/service/attendenceService.js:8-17`). No tests.
- Toggl: see ATT-03 (`server/service/attendenceService.js:75-116`). No tests.
- Attendance JSON: see ATT-04. No tests.

**Constraints**:
- Mocks implement the observable contract (HTTP level for SSO and Toggl, token/JWKS level for Google), not internal function stubs, so real client code paths run.
- Env `GOOGLE_CLIENT_ID`, `HOSTED_DOMAIN`, `AUTH_GOOGLE_VERIFIER`, `SSO_URI`, `SSO_USERNAME`, `SSO_PASSWORD`, `TOGGL_REPORTS_BASE_URL`.

**Integrations** (mock designs; package `packages/test-mocks` or `apps/api/test/mocks`, design choice):
- **Google token verification**:
  - Test key pair (RS256) generated per test run; mock serves its certs in the format `google-auth-library` fetches (`https://www.googleapis.com/oauth2/v1/certs` PEM map, intercepted with MSW/undici MockAgent), or the verifier is constructed with an injected certs source.
  - Token factory `makeIdToken({ sub, email, email_verified, hd, given_name, family_name, aud, iss, exp, iat })`, defaults valid (`iss` `https://accounts.google.com`, `aud` = `GOOGLE_CLIENT_ID`, `exp` now + 1 h).
  - For Playwright and integration tests: `AUTH_GOOGLE_VERIFIER=fake` selects a verifier that accepts tokens signed by the test key (refused in production; owned by AUTH-01; listed here for the mock).
  - Contract cases: valid; expired; wrong `aud`; wrong `iss`; bad signature; unknown `kid`; `hd` missing; `hd` different from `HOSTED_DOMAIN`.
- **SSO meta API**:
  - HTTP mock at `SSO_URI` checks method `GET` and `Authorization: Basic base64(SSO_USERNAME:SSO_PASSWORD)`; wrong auth → 401.
  - Fixtures (JSON, versioned; also used by NFR-08 `isEmailListed` tests): `sso.basic.json` (employees, non-employees, listed/unlisted), `sso.duplicate-names.json`, `sso.duplicate-toggl-ids.json`, `sso.no-contract-type.json`, `sso.key-overrides-name.json`, `sso.malformed-*.json` (object body, missing `keys`, `null` element, `text/html`).
  - Schema (documented contract): array of `{ name: string, email: string, keys: Array<{ key: string, value: string }> }`.
- **Toggl Reports v3**:
  - HTTP mock for `POST {base}/workspace/:ws/search/time_entries`; validates `Authorization` = `Basic base64(<token>:api_token)`, `Content-Type: application/json`, body keys exactly `start_date`, `end_date`, `user_ids`, optional `first_row_number` (integer), dates `YYYY-MM-DD`.
  - Serves paged fixtures; sets `X-Next-Row-Number` per page; supports error injection (401, 402, 429, 500, non-JSON, non-array body).
  - Response schema: array of `{ user_id: number, time_entries: Array<{ seconds: number, start: string /* ISO 8601 with offset */ }> }` (other Toggl fields allowed and ignored).
  - Fixtures: single page; three pages; repeated header; DST boundary entries; midnight-crossing entry; entry outside month in local time; unknown `user_id`.
  - Records all received requests for assertions and for MIG-03.

**Business rules** (contract tests, all in Vitest):
- Attendance JSON format: golden files under `apps/api/test/contract/attendance/*.json` compared byte-for-byte for: worked example (ATT-04), empty SSO list (`{"start":…,"end":…,"attendence":{}}`), month 13, duplicate names, missing `contractType`, NaN seconds → `null`.
- Error bodies: golden 400 month/year, 401 empty, 500 SSO, 500 Toggl.
- SSO parsing: each SSO fixture → expected parsed records or `SsoUnavailableError`.
- Toggl parsing: each Toggl fixture → expected entry sequence, call count, `first_row_number` sequence, sleep count, or `TogglUnavailableError`.
- Google: each case → accepted payload fields (`sub`, `email`, `hd`, `given_name`, `family_name`) or rejection reason.
- Golden files change only with an explicit reviewed update; CI fails on any difference.

**Acceptance criteria**:
- Given CI, when contract tests run, then they need no network access outside the test containers.
- Given a change that alters attendance key order or number formatting, then a contract test fails.
- Given a change to the Toggl request body (extra key, `page_size`, string `user_ids`), then the mock rejects it and a contract test fails.
- Given an ID token signed by an unknown key, then verification fails in the test exactly as with real Google certs.

**Tests**: the contract test suites above (Vitest); the mocks are reused by ATT-01–ATT-04 integration tests, AUTH integration tests, Playwright login, and MIG-03.

## Documentation (DOC)

### DOC-01 — Functional spec of the leaves module

- **Type**: decision
- **Source**: `(rewrite spec: User decisions › Documentation)` — "Functional spec of the leaves module: work-day rules, half-day, states, approval flow, attendance codes"
- **Depends on**: DATA-02, WD-01, LV-01, APR-01, SUM-01, ATT-04

**Goal**: One maintained Markdown document describes the behavior of the new leaves module for developers, testers and the client. It is written from the implemented contracts of the leave tasks, not from the old code. It replaces the analysis document as the reference once the rewrite ships.

**Old behavior**: No functional documentation exists. `angular/README.md` is CLI boilerplate and `README.md:1-179` covers only setup (analysis §8 Stale docs). Business rules live only in code, e.g. work days in `angular/src/app/services/holiday-count.service.ts:29-46` and `server/service/tripService.js:30-56`.

**Constraints**:
- English only. Location `docs/functional-spec.md` in the new repo.
- Every rule cites the `packages/shared` function or API endpoint that implements it and the unit/integration test file that proves it, so drift is visible in review.
- Must reflect decisions: summary counts APPROVED only `(rewrite spec: User decisions › Leave lifecycle rules)`; approve/reject unrestricted from any state incl. same state `(client answer: Q-S2)`; admin may approve own leave `(client answer: Q-S1)`; user deletes own leave in any state `(client answer: Q-S3)`; new-leave email only to `APPROVAL_MAIL_RECEIVER` `(client answer: Q-S13)`; emails in English only `(client answer: Q-S10)`; attendance keyed by SSO name, collisions kept `(client answer: Q-S12)`.

**Business rules** (required sections, in this order):
1. Glossary: leave, work day, half-day, requester, approver, states, types.
2. Leave data: fields from DATA-02, calendar dates as `YYYY-MM-DD`, server-computed `numDays`.
3. Work-day rules: weekend, SK public holidays (`date-holidays` country `SK`, pinned version named), inclusive range, half-day rule (start = end, minus 0.5), at least three worked examples incl. a holiday and a half-day on a holiday/weekend.
4. Leave types: codes and EN + SK labels.
5. States and approval flow: state diagram (Mermaid) PENDING → APPROVED / REJECTED and any-to-any approve/reject, who may do what, email triggers.
6. Delete rules.
7. Visibility and filters (list, calendar, approval, summary).
8. Attendance API: codes per type (`D8`, `D4`, `PN`, `L`, `I`), joining with `", "`, APPROVED only, timezone `DEFAULT_TIMEZONE`.
9. Data migration notes: how old leaves were converted (link to MIG-01 report format).
10. Changes vs old system: list of fixed bugs and defined changes, each with its spec source line.

**Acceptance criteria**:
- Given the document, when a reviewer picks any rule, then it links an implementing function/endpoint and a test file that exist in the repo.
- Given section 3, when the worked examples are run through the shared work-day function, then results match (examples are copied from unit test cases).
- Given a PR that changes a leave rule in `packages/shared/src/` (`leaves.ts`, `workdays.ts`, `summary.ts`, `filters.ts`, `calendar.ts`, `users.ts`) or the attendance module (`apps/api/src/attendance/`), when CI runs, then a PR-template checkbox "functional spec updated or not affected" is required (reviewed, not automated).

**Tests**:
- unit: none new; the worked examples in section 3 and section 8 must be literal copies of existing unit test cases (reviewer checks).
- CI: Markdown lint (`markdownlint-cli2`) and link check of relative links run in the `lint` job (NFR-09).

### DOC-02 — OpenAPI documentation for app API and M2M attendance API

- **Type**: decision
- **Source**: `(rewrite spec: User decisions › Documentation)` — "API docs: OpenAPI for the app API and the M2M attendance API"
- **Depends on**: SET-02, AUTH-01, AUTH-02, AUTH-03, USR-01, USR-02, USR-03, USR-04, LV-01, LV-03, LST-01, APR-01, SUM-01, NFR-06, NFR-07, NFR-08, ATT-01, OPS-01

**Goal**: The API generates an OpenAPI 3.1 document from NestJS decorators. Swagger UI is served at `/api/docs` outside production. A generated `openapi.json` is committed so the docs exist even though production disables the explorer.

**Old behavior**: GraphQL with GraphiQL enabled in production (`server/index.js:40-45`, `graphiql: true` at line 44); no REST docs. The attendance endpoint is documented only in `README.md:106-117`.

**Constraints**:
- Swagger UI at `/api/docs` and JSON at `/api/docs-json`; both return 404 when `NODE_ENV=production` `(client answer: Q-S6)`.
- Committed file `docs/api/openapi.json`, produced by `pnpm --filter api openapi:generate` (boots the Nest app module without listening, no DB connection needed — use `SwaggerModule.createDocument` on a module with DB providers mocked or `@nestjs/mongoose` lazy connection).
- Two security schemes: `bearer` (HTTP bearer, JWT, app API) and `m2mBasic` (HTTP basic, attendance only). Refresh cookie documented as `apiKey` in `cookie` on `/api/auth/refresh` and `/api/auth/logout`; cookie name from AUTH-02.
- Error responses for app API reference one shared schema `ErrorBody` = `{ statusCode: number, code: string, message: string }`; every operation lists its possible error `code` values in the description.
- Attendance operation documents the OLD contract kept by ATT-01: 400 JSON `{ "message": "Month is not a number." }` / `{ "message": "Year is not a number." }`, 500 JSON `{ "message": "..." }`, 401 empty body without `WWW-Authenticate` (`server/api/attendenceApi.js:5,29-47`).
- Tags: `auth`, `users`, `leaves`, `summary`, `audit`, `gdpr`, `attendance`, `health` (health-check documented, though outside `/api`).

**API**:
- `GET /api/docs` — HTML Swagger UI; 200 when `NODE_ENV` ≠ `production`; 404 with `ErrorBody` code `NOT_FOUND` in production. No auth.
- `GET /api/docs-json` — OpenAPI JSON; same rules.

**Acceptance criteria**:
- Given `NODE_ENV=development`, when `GET /api/docs-json`, then 200 and the JSON contains every route registered in the Nest router (checked by test).
- Given `NODE_ENV=production`, when `GET /api/docs` or `/api/docs-json`, then 404.
- Given a PR that changes any controller or DTO, when CI runs `openapi:generate` and `git diff --exit-code docs/api/openapi.json`, then CI fails if the committed file is stale.
- Given the doc, then `GET /api/attendence/{year}/{month}` exists with `m2mBasic` security and old response examples.

**Tests**:
- integration: production mode → 404 for both docs URLs; development mode → 200; every route from Nest's `HttpAdapterHost` route list (excluding static SPA fallback) appears in `paths`; every non-2xx response in `paths` under `/api` (except attendance) references `ErrorBody`.
- CI: stale-file check above; `@redocly/cli lint docs/api/openapi.json` passes with no errors.

### DOC-03 — Dev and ops README

- **Type**: decision
- **Source**: `(rewrite spec: User decisions › Documentation)` — "Dev and ops README: local setup, env var names, deploy, backup / restore runbook"
- **Depends on**: SET-04, OPS-02, OPS-03, NFR-09, NFR-11, MIG-01

**Goal**: The root `README.md` lets a new developer run the app locally in one session and lets an operator deploy, back up, restore and promote the first admin without asking anyone. It lists env var names only, never values of secrets.

**Old behavior**: `README.md:13-179` describes node 8, yarn, mongo 3.6 docker-compose, `secrets/key.pem` generation, `yarn promote-user`, env var names and a manual docker build. `kubernetes/README.md:1-90` describes k8s setup and Keel with TODOs. Stale points listed in analysis §8 Stale docs (`README.md:15`, `README.md:68`, `README.md:154`, `kubernetes/README.md:1-4`).

**Constraints**:
- English. Root `README.md` (dev) + `deploy/README.md` (ops). No secret values, no real client id; placeholders like `<from k8s secret>`.
- All commands use `pnpm` `(client answers: Other notes — "Use \`pnpm\` as a package manager")`.

**Business rules** (required sections):
- Root `README.md`: purpose; prerequisites (Node 24 via `.nvmrc`, pnpm via Corepack, Docker); `pnpm install`; `docker compose up -d` (SET-04); copy `.env.example` → `.env`; `pnpm dev`; URLs (web `http://localhost:5173`, API `http://localhost:4100`, Swagger `http://localhost:4100/api/docs`, Mailpit `http://localhost:8025`); test commands (`pnpm test`, `pnpm test:integration`, `pnpm e2e`); lint/format/typecheck; commit convention (NFR-10/NFR-11); first admin CLI (owned by the user-admin task, documented here); env var table: name, used by (api / migration / k8s Mongo / tests), required in production (yes/no), default, description — exactly the SET-02 list (the web app has no env vars).
- `deploy/README.md`: architecture (host nginx → ingress `public` → `/cestaky` rewrite → service → pod; MongoDB 8 StatefulSet); first-time setup (namespace default, create Secrets with `kubectl create secret generic` listing key names, apply manifests, Keel already installed per `kubernetes/README.md:43-81` content carried over; replica-set init Job and AVX check from OPS-03); release and rollout flow (NFR-11 + Keel); health check and probes (OPS-01); backup and restore runbook (OPS-02) incl. a restore-test procedure; migration and cutover runbook link (MIG-04); troubleshooting (`microk8s kubectl get pods`, `logs`, `port-forward`).

**Acceptance criteria**:
- Given a clean machine with Node 24, pnpm and Docker, when a developer follows the root README, then `pnpm dev` serves the login page and a fake-login test user can create a leave (E2E fake verifier, TST-03) without other help.
- Given the README env table, when compared with the config schema in SET-02, then every variable is listed and no extra one exists (checked by a unit test that parses the README table and the config schema).
- Given `grep` for known secret patterns in CI (Trivy secret scan, NFR-04), then no secrets are found in README files.

**Tests**:
- unit: README env table vs config schema parity test (`apps/api/test/readme-env.spec.ts`).
- manual: one developer not involved in writing it follows the README before cutover; findings fixed.

## Non-functional requirements (NFR)

### NFR-01 — Server-side authorization on every endpoint

- **Type**: NFR
- **Source**: `(rewrite spec: Non-functional requirements › Security)` — "Server enforces role and ownership on every endpoint; denied calls return 401 / 403; each rule has a test". `(rewrite spec: Features by area › Leave approval)` — "Denied actions return an explicit error, never a silent empty result"
- **Depends on**: AUTH-02, AUTH-05

**Goal**: Authorization is deny-by-default on the server. Every route declares its access level; guards return 401/403 with the error body; ownership rules live in services and return 403. This task holds the single permission matrix for the whole app; other tasks must keep their endpoints in sync with it.

**Old behavior**:
- Guards `userProtected`, `ownerProtected`, `adminProtected` return `null` with no error on denial (`server/auth/rootResolverDecorators.js:1-29`).
- `ownerProtected` installs a function, so `updateUser`'s `!context.checkUserId` check never fires (`server/graphql/userRelated.js:70-76`).
- `getUsers` returns all users to any user (`userRelated.js:19`); `/approval` route unguarded in Angular (`angular/src/app/app-routing.module.ts:11`); `removeLeave` returns `null` for non-owners (`server/graphql/leaveRelated.js:32-39`).
- Basic auth is mounted on `/api/*` as a whole (`server/api/attendenceApi.js:21-24`).
- No auth tests (`server/service/tests/tripService.test.js` is the only server test file).

**Constraints**: brief error body and status codes; roles `user`, `admin`, `m2m`; deactivated → 401 everywhere (AUTH-05); attendance keeps its old plain-text/status contract.

**API** (mechanism):
- Global `AccessTokenGuard` (AUTH-02) on all routes; `@Public()` opt-out; `@Roles('admin')` + `RolesGuard` → 403 `FORBIDDEN`; `@M2M()` routes use `BasicAuthGuard` only and ignore Bearer.
- Ownership checks in services → 403 with a specific code (e.g. leave delete by non-owner → 403 `FORBIDDEN`).
- Not found checks before ownership checks (all leaves are company-visible, so 404 leaks nothing).
- A startup check (test) enumerates all registered routes and fails if any route lacks an explicit access declaration listed in the matrix.

**Permissions** — single source of truth. Endpoints match the canonical endpoint registry; removed endpoints (`DELETE /api/users/:id`, `GET /api/leaves/pending`, `GET /api/summary`, `GET /api/admin/audit-log`) return 404 `NOT_FOUND`.

| Endpoint | anon | user | owner | admin | m2m | Denied response |
|---|---|---|---|---|---|---|
| `GET`, `HEAD /health-check` | ✓ | ✓ | – | ✓ | ✓ | – |
| Static SPA (`/`, `/assets/*`, SPA fallback) | ✓ | ✓ | – | ✓ | ✓ | – |
| `GET /api/docs`, `/api/docs-json` (non-production only) | ✓ | ✓ | – | ✓ | ✓ | production: 404 |
| `GET /api/auth/config` | ✓ | ✓ | – | ✓ | – | – |
| `POST /api/auth/google` | ✓ | ✓ | – | ✓ | – | 401/403 per AUTH-01 |
| `POST /api/auth/refresh` (cookie) | cookie | cookie | – | cookie | – | 401 per AUTH-02 |
| `POST /api/auth/logout` (cookie; 204 even if missing) | ✓ | ✓ | – | ✓ | – | – |
| `GET /api/auth/me` | ✗ | ✓ | – | ✓ | ✗ | 401 |
| `GET /api/users` | ✗ | ✗ | – | ✓ | ✗ | 401 / 403 `FORBIDDEN` |
| `GET /api/users/:id` | ✗ | ✗ | – | ✓ | ✗ | 401 / 403 / 404 `USER_NOT_FOUND` |
| `PATCH /api/users/me` | ✗ | ✓ (name only) | ✓ | ✓ (name only) | ✗ | 401 / 403 `FIELD_NOT_EDITABLE` |
| `PATCH /api/users/:id` (incl. own flag, last admin) | ✗ | ✗ | ✗ | ✓ | ✗ | 401 / 403 / 404 / 409 `USER_ANONYMIZED` |
| `POST /api/users/:id/deactivate` (incl. self) | ✗ | ✗ | – | ✓ | ✗ | 401 / 403 / 404 / 409 `USER_ALREADY_DEACTIVATED` |
| `GET /api/leaves` (optional `?state=PENDING\|APPROVED\|REJECTED`; company-wide; LST-01, used by APR-02 and nav badge) | ✗ | ✓ | – | ✓ | ✗ | 401 |
| `POST /api/leaves` (requester forced to caller; LV-01) | ✗ | ✓ | – | ✓ | ✗ | 401 |
| `DELETE /api/leaves/:id` (LV-03) | ✗ | ✗ | ✓ any state | ✓ any leave | ✗ | 401 / 403 `FORBIDDEN` / 404 `LEAVE_NOT_FOUND` |
| `POST /api/leaves/:id/approve` (APR-01) | ✗ | ✗ | – | ✓ incl. own leave, any state incl. same | ✗ | 401 / 403 `FORBIDDEN` / 404 `LEAVE_NOT_FOUND` |
| `POST /api/leaves/:id/reject` (APR-01) | ✗ | ✗ | – | ✓ incl. own leave, any state incl. same | ✗ | 401 / 403 `FORBIDDEN` / 404 `LEAVE_NOT_FOUND` |
| `GET /api/leaves/summary` (caller's own APPROVED leaves only; SUM-01) | ✗ | ✓ self | – | ✓ self | ✗ | 401 |
| `GET /api/admin/audit` (NFR-06) | ✗ | ✗ | – | ✓ | ✗ | 401 / 403 `FORBIDDEN` / 400 `AUDIT_RANGE_INVALID` |
| `GET /api/admin/users/:id/export` (GDPR access; NFR-07) | ✗ | ✗ | – | ✓ | ✗ | 401 / 403 `FORBIDDEN` / 404 `USER_NOT_FOUND` |
| `POST /api/admin/users/:id/anonymize` (GDPR erasure; NFR-08; self allowed) | ✗ | ✗ | – | ✓ | ✗ | 401 / 403 `FORBIDDEN` / 404 `USER_NOT_FOUND` / 400 `CONFIRM_EMAIL_MISMATCH` / 409 `USER_ALREADY_ANONYMIZED` / 409 `SSO_EMPLOYEE_ACTIVE` / 503 `SSO_UNAVAILABLE` |
| `GET /api/attendence/:year/:month` (ATT-01) | ✗ | ✗ (Bearer ignored) | – | ✗ | ✓ Basic (this route only) | 401, empty body, no `WWW-Authenticate` (old contract) |

Notes: "owner" = caller is `requesterId` of the leave / the user itself. Deactivated callers get 401 `USER_DEACTIVATED` on every ✗/✓ row that needs `user`/`admin`. Admin approving own leave (client answer: Q-S1); unrestricted state transitions incl. same state (client answer: Q-S2; interview: Transitions); delete own leave in any state (client answer: Q-S3, Q-A6). Unknown `/api/**` route → 404 `NOT_FOUND` (error body), never the SPA fallback.

UI-side rules (presentation only, server is authoritative): Approval, Users and Audit menu items + routes (`/approval`, `/users`, `/users/:id/edit`, `/audit`) for admins only (non-admin direct URL → "You are not authorized to view this page!", old `src/components/Unauthorized.js:6`); Delete shown only on own leaves for non-admins and on all for admins; admins get Approve and Reject buttons on every `/leaves` list row, with the button matching the current state disabled; `/approval` lists PENDING only (interview: State pick).

**Acceptance criteria**:
- Given each row of the matrix, when called as anon, user, owner/non-owner, admin, deactivated user and m2m, then the response matches the matrix.
- Given any denied call, then the body is `{statusCode, code, message}` (except attendance) and never `200` with `null`/empty.
- Given a new route without an access declaration, then the route-coverage test fails.

**Tests**:
- Integration: one table-driven suite generated from a typed matrix constant in `apps/api/test/permissions.ts` (one row per matrix line × caller kind), run against a real MongoDB with seeded users (admin, user A, user B, deactivated D) and leaves owned by A; asserts status + code.
- Unit: `RolesGuard`, `@Public`, `BasicAuthGuard` (Bearer ignored on attendance).
- Route coverage test: compares Nest's registered routes with the matrix constant.
- E2E: non-admin cannot see Approval/Users/Audit menus or Approve/Reject buttons on `/leaves`; direct URL shows the unauthorized message.

### NFR-02 — Secure sessions

- **Type**: NFR
- **Source**: `(rewrite spec: Non-functional requirements › Security)` — "Secure sessions: short-lived tokens with real signature verification and a safe refresh; Google hosted-domain check kept"
- **Depends on**: AUTH-01, AUTH-02, AUTH-03, AUTH-05

**Goal**: Verifiable security properties of the session design defined in AUTH-01/02/03.

**Old behavior**: forgery via `/refresh-jwt` re-signing unverified tokens (`server/auth/operations.js:21-34`); 1 h JWT in `localStorage` readable by any script (`src/actions/authActions.js:49`); no server-side revocation; HMAC key file `secrets/key.pem` (`server/auth/operations.js:6`); hd check optional (`server/graphql/userRelated.js:30`).

**Constraints**: access 15 min, refresh 7 days sliding, no absolute cap (interview: Session, Token TTL).

**Targets** (measurable):
- Access JWT lifetime ≤ `ACCESS_TOKEN_TTL_SECONDS` (default 900 s); verified with HS256 only, `alg` pinned, `typ=access`; key `JWT_ACCESS_SECRET` ≥ 32 bytes, startup fails if shorter.
- Access token never written to `localStorage`, `sessionStorage`, cookies or URLs.
- Refresh token: ≥ 256 bits entropy; stored only as SHA-256; cookie `HttpOnly; Secure; SameSite=Strict`, path scoped to `/api/auth`; single-use rotation; reuse revokes the family; revoked on logout and deactivation.
- Refresh never accepts an access JWT (old forgery path closed).
- `AUTH_GOOGLE_VERIFIER=fake` refused when `NODE_ENV=production`.
- Google token verified for signature, `aud = GOOGLE_CLIENT_ID`, `iss`, `exp`, `email_verified`, and `hd = HOSTED_DOMAIN` (mandatory).
- Admin flag and active status read from DB per request; changes effective on the next request.
- No token values in logs (log redaction for `authorization`, `cookie`, `set-cookie`, `idToken`).

**Configure**: env `JWT_ACCESS_SECRET`, `ACCESS_TOKEN_TTL_SECONDS`, `REFRESH_TOKEN_TTL_SECONDS`, `GOOGLE_CLIENT_ID`, `HOSTED_DOMAIN`, `AUTH_GOOGLE_VERIFIER`, `BASE_URL`; config validation at boot (NFR-05).

**Acceptance criteria**:
- Given each target above, then a dedicated automated test proves it (list below).

**Tests (verification)**:
- Integration: forged token (wrong key / `alg:none` / edited payload) → 401 on API and refresh; expired access → 401 `ACCESS_TOKEN_EXPIRED`; refresh reuse → family revoked; DB contains no raw refresh token (scan collection for the issued value); cookie attributes; logger redaction test with a captured log stream; boot fails with short secret, missing `HOSTED_DOMAIN`, or `AUTH_GOOGLE_VERIFIER=fake` in production.
- E2E: after login, `localStorage` and `sessionStorage` contain no token; `document.cookie` does not expose `refresh_token`.

### NFR-03 — User data permissions

- **Type**: NFR
- **Source**: `(rewrite spec: Non-functional requirements › Security)` — "User data is visible and editable only per the permission rules; non-admins cannot change email or admin flag"
- **Depends on**: NFR-01, USR-01, USR-02, USR-03

**Goal**: Define who sees which user data. Non-admins never list users; they see only their own full profile and the name/email summaries embedded in leaves. Nobody edits email through the API; only admins change admin flags.

**Old behavior**:
- `getUsers`, `getUser` return full user records (incl. email, isAdmin, approved) to any logged-in user (`server/graphql/userRelated.js:17-19`). Only consumers: admin UserList (`src/containers/users/UserList.js:56-68`), trip/export comboboxes (`src/components/ConnectedComboboxes.js:36-47`, removed features) and the Angular export (`angular/src/app/leaves/leaves-export/leaves-export.component.ts:45`, removed feature).
- Old: leave list requester filter options come from the leaves themselves, not a user list (`angular/src/app/leaves/leaveFilter.ts:108-114`); leaves embed `requester`/`approver` `{id, email, firstName, surname}` (`angular/src/app/services/leaves.service.ts:55-78`).
- `updateUser` lets any user change any user's email/approved (`server/graphql/userRelated.js:70-79`).

**Decision**: non-admins cannot list users (`GET /api/users*` admin-only). Nothing in scope needs it: filters derive from leave data, which carries `UserRefDto` (DATA-01, no email). This is a defined change from old `getUsers` (any user).

**Rules**:

| Data | non-admin | admin |
|---|---|---|
| Own `UserDto` (`/api/auth/me`) | read | read |
| Other users' `UserDto` / list | ✗ 403 | read |
| `UserRefDto` {id, firstName, surname, active, anonymized} inside leaves | read (company-wide leave visibility) | read |
| Own firstName / surname | edit | edit |
| Others' firstName / surname | ✗ 403 | edit |
| email (anyone) | ✗ 403 `FIELD_NOT_EDITABLE` on `PATCH /api/users/me`; on `PATCH /api/users/:id` 403 `FORBIDDEN` first (NFR-01 order: role before body) | ✗ 403 `FIELD_NOT_EDITABLE` |
| isAdmin | ✗ 403 | edit (others and own, no last-admin guard; interview: User admin) |
| active (deactivate) | ✗ 403 | USR-04 |
| GDPR export / anonymize | ✗ 403 | NFR-07 / NFR-08 |

**Acceptance criteria**:
- Given a non-admin, when calling `GET /api/users` or `GET /api/users/:id`, then 403 `FORBIDDEN`.
- Given a non-admin, when listing leaves, then requester/approver objects contain exactly `id, firstName, surname, active, anonymized` (no `email`, `isAdmin` or timestamps).
- Given a caller authorized for a user-edit endpoint (anyone on `PATCH /api/users/me`, an admin on `PATCH /api/users/:id`), when sending `email`, then 403 `FIELD_NOT_EDITABLE`; a non-admin on `PATCH /api/users/:id` gets 403 `FORBIDDEN` first (NFR-01 order).
- Given a non-admin, when sending `isAdmin` to `/api/users/me`, then 403 `FIELD_NOT_EDITABLE`.

**Tests**: integration rows in the NFR-01 suite plus a DTO-shape test on `GET /api/leaves` for non-admins.

### NFR-04 — Dependency and image vulnerability scanning in CI

- **Type**: NFR
- **Source**: `(rewrite spec: Non-functional requirements › Security)` — "Automated dependency and image vulnerability scanning in CI"
- **Depends on**: OPS-03

**Goal**: Every PR and every push to `master` scans npm dependencies and the built Docker image for known vulnerabilities and fails on findings at or above the threshold. Dependency update PRs are opened automatically.

**Old behavior**: None. `release.yml` only builds and pushes (`.github/workflows/release.yml:1-81`). Analysis lists vulnerable/abandoned libraries (analysis §8 Outdated dependencies).

**Constraints**: Tools: `pnpm audit`, GitHub `dependency-review-action`, Trivy (`aquasecurity/trivy-action`), Dependabot. Thresholds: fail on high + critical for production deps and the image, critical only for dev deps `(interview: CI gates)`.

**Business rules** (configuration):
- Job `audit` (NFR-09 workflow): `pnpm audit --prod --audit-level high` → fail on high/critical in production deps. Dev deps: `pnpm audit --audit-level critical`.
- PRs: `actions/dependency-review-action` with `fail-on-severity: high`.
- Job `image-scan`: build the image (no push), `trivy image --severity HIGH,CRITICAL --ignore-unfixed --exit-code 1`; also `trivy fs --scanners secret,misconfig --exit-code 1 .` (secrets in repo, Dockerfile and k8s manifest misconfig).
- Weekly scheduled run (`cron: '0 6 * * 1'`) of `audit` and `image-scan` on `master` to catch new CVEs without code changes; failure notifies via GitHub's failed-workflow email.
- `.github/dependabot.yml`: ecosystems `npm` (root, weekly, grouped minor+patch), `docker` (`/`, weekly), `github-actions` (weekly). Security updates enabled.
- Exceptions: `.trivyignore` and `pnpm.auditConfig.ignoreCves` entries need a comment with CVE, reason, expiry date; reviewed in PR.

**Acceptance criteria**:
- Given a PR adding a dependency with a known high CVE, then `dependency-review` and `audit` fail and merge is blocked (NFR-09 required checks).
- Given the base image has a fixable critical CVE, then `image-scan` fails.
- Given a committed private key or token, then `trivy fs` secret scan fails.
- Given a week passes, then Dependabot opens update PRs.

**Tests**: verification by a throwaway PR adding a known-vulnerable package version (e.g. `lodash@4.17.4`, cited in analysis §8 Outdated dependencies) → checks fail; closed after.

### NFR-05 — Security hardening

- **Type**: NFR
- **Source**: `(client answer: Q-S6)` — "yes those are all required except rate limiting" (question: "disable API explorer in prod, restrict CORS, constant-time M2M credential compare, rate limiting"). `(rewrite spec: User decisions › Platform and delivery)` — "Secrets come only from k8s secrets, never from the repo"
- **Depends on**: SET-02, AUTH-02, NFR-01

**Goal**: Close the hardening items: no API explorer in production, CORS limited to the app origin, timing-safe M2M credential check, all secrets injected from k8s secrets with no values in the repo. Rate limiting is explicitly out of scope.

**Old behavior**:
- GraphiQL enabled in all environments (`server/index.js:40-45`).
- `cors()` with no options = any origin (`server/index.js:36-37`).
- M2M compare with `===` on name and password (`server/api/attendenceApi.js:8-11`); unset `M2M_USERNAME`/`M2M_PASSWORD` → always 401 (`attendenceApi.js:8,11`).
- Secrets: HMAC key file `secrets/key.pem` mounted from k8s secret (`kubernetes/cestaky.yml:80-88`); other secrets as inline env placeholders filled by hand (`kubernetes/cestaky.yml:40-74`).
- Hardcoded Google client id in Angular (`angular/src/app/login-page/login-page.component.ts:42`).

**Constraints**: client answer Q-S6 (no rate limiting); brief platform conventions.

**Targets and configuration**:
1. API explorer: Swagger UI `/api/docs` and JSON `/api/docs-json` registered only when `NODE_ENV !== 'production'`; in production both return 404 `NOT_FOUND`.
2. CORS: `enableCors({ origin: [new URL(BASE_URL).origin], credentials: true })`. Requests with another `Origin` get no `Access-Control-Allow-Origin` header; preflight from another origin gets no CORS headers. Dev uses the Vite proxy (same origin), so no extra dev origin.
3. M2M compare: hash both supplied and expected username and password with SHA-256 and compare with `crypto.timingSafeEqual`; evaluate both comparisons always (no short-circuit). Unset `M2M_USERNAME` or `M2M_PASSWORD` → 401. Response contract unchanged (401, empty body, no `WWW-Authenticate`).
4. Secrets: values only from k8s Secrets (`secretKeyRef`/`envFrom`). Secret env names: `JWT_ACCESS_SECRET`, `MONGO_URL` (contains credentials), `SMTP_PASSWORD`, `M2M_USERNAME`, `M2M_PASSWORD`, `SSO_USERNAME`, `SSO_PASSWORD`; Mongo init `MONGO_INITDB_ROOT_USERNAME`, `MONGO_INITDB_ROOT_PASSWORD`, `MONGO_APP_USERNAME`, `MONGO_APP_PASSWORD`; migration `LEGACY_MONGO_URL`. Non-secret config (`NODE_ENV`, `PORT`, `LOG_LEVEL`, `APP_VERSION`, `GOOGLE_CLIENT_ID`, `HOSTED_DOMAIN`, `AUTH_GOOGLE_VERIFIER`, `BASE_URL`, `ACCESS_TOKEN_TTL_SECONDS`, `REFRESH_TOKEN_TTL_SECONDS`, `DEFAULT_TIMEZONE`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `MAIL_SENDER`, `APPROVAL_MAIL_RECEIVER`, `SSO_URI`, `TOGGL_REPORTS_BASE_URL`) may live in a ConfigMap. Repo holds only `.env.example` with names and empty values; `.env*` except `.env.example` git-ignored; manifests contain no secret values and no `secrets/` directory.
5. Config validation at boot (schema, e.g. zod/class-validator): missing or invalid required var → process exits non-zero with a message naming the variable, never its value.
6. Rate limiting: not implemented (client answer: Q-S6).

**Acceptance criteria**:
- Given `NODE_ENV=production`, when `GET /api/docs` or `/api/docs-json`, then 404; given `NODE_ENV=development`, then 200.
- Given `Origin: https://evil.example`, when calling any API, then no `Access-Control-Allow-Origin` header; given `Origin` = `BASE_URL` origin, then the header echoes it with `Access-Control-Allow-Credentials: true`.
- Given wrong M2M password of equal or different length, then 401; given correct credentials, then the request proceeds; given env unset, then 401.
- Given the repository, when a secret scanner runs in CI, then no findings; given `kubernetes/` manifests, then every secret env above uses `secretKeyRef`.
- Given `JWT_ACCESS_SECRET` missing, then the API exits at boot with "Missing required environment variable JWT_ACCESS_SECRET".

**Tests**:
- Integration: docs 404/200 by `NODE_ENV`; CORS headers for allowed / foreign origin and preflight; M2M guard cases (correct, wrong user, wrong pass, length mismatch, unset env, Bearer instead of Basic).
- Unit: timing-safe compare helper (always runs both comparisons — spy asserts both called); config schema rejects missing vars and never prints values.
- CI: secret scan step (tool chosen with the dependency-scanning task NFR-04); manifest lint asserting `secretKeyRef` for the listed names.

### NFR-06 — Audit log of leave and user changes

- **Type**: NFR
- **Source**: `(rewrite spec: Non-functional requirements › Data privacy and compliance)` — "Audit log of who created, approved, rejected or deleted a leave and who changed a user or role, with timestamp"
- **Depends on**: DATA-01, DATA-02, SET-02, SET-03, AUTH-02

**Goal**: Every leave create / approve / reject / delete and every user change writes one append-only AuditLog entry with actor, action, target, timestamp and details. User changes are registration, name edit, admin-flag change, deactivation, anonymization and data export. The entry is written in the same database transaction as the change, so a change never exists without its entry. Admins read the log on the `/audit` screen and through `GET /api/admin/audit` (filters, pagination). This task owns the AuditLog entity.

**Old behavior**: New — no counterpart in the old system. Checked:
- No audit, history or change-log model. The schema defines only Place, User, Trip, Leave (`server/db/schema.js:9-143`).
- Leave mutations write the leave only. No actor record except `approverId` on approve/reject (`server/graphql/leaveRelated.js:21-55`). Delete is a hard delete with no trace (`server/graphql/leaveRelated.js:38`).
- User mutations write the user only (`server/graphql/userRelated.js:70-84`). Remove is a hard delete (`server/graphql/userRelated.js:81`).
- The CLI promote writes only a console line (`server/db/promoteUser.js:8`).
- The only "history" in the repo is the browser-history router package (`src/singletons/history.js:1-5`). It is not an audit trail.

**Constraints**:
- No retention and no purge. Entries are kept forever, and no `RETENTION_DAYS` setting exists `(interview: Retention)`. This overrides client answer Q-S5 "2 months, but should be configurable" (`PROJECT_REWRITE_SPEC_ANSWERS.md:24`).
- Only admins read the log. `(rewrite spec: Security › "Server enforces role and ownership on every endpoint")`
- Admin screen `/audit` with table, filters and pagination `(interview: Audit UI)`.
- Append-only. The single permitted mutation is the personal-data scrub done by NFR-08 anonymization.
- Transactions on a single-member MongoDB 8 replica set `(interview: Infra)`.
- `USER_REGISTERED` on first login `(interview: Remaining)`. The data migration writes no audit entries; the log starts at cutover.
- Error body convention: `{ statusCode, code, message }`, with codes from the shared `ErrorCode` enum.

**Data model**:

AuditLog (collection `auditlogs`):

| field | type | required | default | enum | validation | set by |
|---|---|---|---|---|---|---|
| `id` | string (uuid v4) | yes | generated | – | unique | server |
| `at` | Date (UTC) | yes | server clock at write | – | – | server |
| `actorType` | string | yes | – | `user`, `cli` | – | server |
| `actorId` | string (User.id) \| null | yes | – | – | non-null if `actorType='user'`; null if `'cli'` | server (authenticated caller) |
| `action` | string | yes | – | see action table | – | server |
| `targetType` | string | yes | – | `LEAVE`, `USER` | – | server |
| `targetId` | string | yes | – | – | Leave.id or User.id | server |
| `details` | object \| null | yes | null | – | shape per action, see table | server |

Indexes: `{ id: 1 }` unique; `{ at: -1, id: -1 }`; `{ actorId: 1, at: -1 }`; `{ targetType: 1, targetId: 1, at: -1 }`; `{ action: 1, at: -1 }`.

Leave snapshot shape (used in `details`): `{ id, requesterId, approverId, startDate, endDate, isHalfDay, type, state, numDays }`. Ids only, no names.

Actions (exact enum) and `details`:

| action | written by (task/operation) | actorType / actorId | targetType | `details` |
|---|---|---|---|---|
| `LEAVE_CREATED` | LV-01 create leave | user / requester | LEAVE | `{ after: <leave snapshot> }` |
| `LEAVE_APPROVED` | APR-01, every accepted approve call, also when already APPROVED `(interview: Transitions)` | user / admin | LEAVE | `{ previousState, newState, previousApproverId }` |
| `LEAVE_REJECTED` | APR-01, every accepted reject call, also when already REJECTED | user / admin | LEAVE | `{ previousState, newState, previousApproverId }` |
| `LEAVE_DELETED` | LV-03 delete leave (owner or admin) | user / caller | LEAVE | `{ before: <leave snapshot> }` |
| `USER_REGISTERED` | AUTH-01 first Google login creates the user | user / the new user | USER | `{ after: { email, firstName, surname, isAdmin, active } }` |
| `USER_UPDATED` | USR-02 admin edit, USR-03 own profile: `firstName` / `surname` change | user / caller | USER | `{ before: {changed fields, old values}, after: {changed fields, new values} }` |
| `USER_ROLE_CHANGED` | USR-02 admin flag change | user / admin | USER | `{ before: { isAdmin }, after: { isAdmin } }` |
| `USER_ROLE_CHANGED` | CLI first-admin promote | cli / null | USER | `{ before: { isAdmin }, after: { isAdmin } }` |
| `USER_DEACTIVATED` | USR-04 deactivate | user / admin | USER | `{ before: { active, deactivatedAt }, after: { active, deactivatedAt } }` |
| `USER_ANONYMIZED` | NFR-08 | user / admin | USER | `{ before: { active, isAdmin, deactivatedAt, anonymizedAt }, after: <same keys> }` |
| `USER_DATA_EXPORTED` | NFR-07 | user / admin | USER | null |

Rules for writing:
- User edit: write `USER_UPDATED` only when `firstName` or `surname` actually changes. Write `USER_ROLE_CHANGED` only when `isAdmin` actually changes. One request that changes both writes two entries with the same `at`. A request with no change writes no entry.
- Approve/reject always writes an entry, even when the state does not change.
- Dates inside `details`: leave dates as `YYYY-MM-DD`; Date fields as ISO 8601 UTC strings.

Write semantics:
- The domain write and the audit insert run in one MongoDB transaction (Mongoose session) on the single-member replica set. Commit both or neither.
- If the audit insert fails, the transaction aborts. The request returns 500 `INTERNAL_ERROR` and the domain change is not persisted.
- Side effects outside the database (emails, cookie changes) run only after commit.
- One shared service `AuditService.record(session, entry)` in `apps/api`. Every writing task calls it with its session.
- The replica set must be in place in the k8s StatefulSet (owned by the infra task), in docker-compose and in the test database (`MONGO_TEST_URL`).

Append-only enforcement:
- No update or delete endpoint exists for AuditLog.
- The Mongoose model registers `pre` hooks that throw on `updateOne`, `updateMany`, `findOneAndUpdate`, `replaceOne`, `deleteOne`, `deleteMany` and `findOneAndDelete`.
- The single exception is `AuditService.scrubUserPersonalData(session, userId)` (NFR-08), on a dedicated code path that bypasses the hooks.

**API**:

`GET /api/admin/audit`
- Auth: access JWT; caller must be active and `isAdmin`.
- Query parameters (all optional):

| param | type | rule |
|---|---|---|
| `action` | string, repeatable or comma-separated | each value in the action enum |
| `actorType` | `user` \| `cli` | – |
| `actorId` | string | exact match |
| `targetType` | `LEAVE` \| `USER` | – |
| `targetId` | string | exact match; allowed without `targetType` |
| `from` | `YYYY-MM-DD` | inclusive, start of day in `DEFAULT_TIMEZONE` |
| `to` | `YYYY-MM-DD` | inclusive, end of day in `DEFAULT_TIMEZONE` |
| `page` | integer | ≥ 1, default 1 |
| `pageSize` | integer | 1–200, default 50 |

- Sort: `at` descending, then `id` descending.
- 200 response:

```json
{
  "items": [
    {
      "id": "6f1c…",
      "at": "2026-11-04T09:15:02.123Z",
      "actorType": "user",
      "actorId": "1098765432",
      "actor": { "id": "1098765432", "firstName": "Jana", "surname": "Nová", "active": true, "anonymized": false },
      "action": "LEAVE_APPROVED",
      "targetType": "LEAVE",
      "targetId": "0b7e…",
      "details": { "previousState": "PENDING", "newState": "APPROVED", "previousApproverId": null }
    }
  ],
  "page": 1,
  "pageSize": 50,
  "total": 1
}
```

- `actor` is a `UserRefDto` (no email). It is null when `actorType='cli'` or when no User with `actorId` exists.
- Errors:
  - 401 `AUTH_REQUIRED`, `ACCESS_TOKEN_INVALID`, `ACCESS_TOKEN_EXPIRED`, `USER_DEACTIVATED`.
  - 403 `FORBIDDEN`: caller is not admin.
  - 400 `VALIDATION_FAILED`: unknown action value, bad `actorType` or `targetType`, malformed date, `page` or `pageSize` out of range.
  - 400 `AUDIT_RANGE_INVALID`: `from` is after `to`.
- No side effects. Reading the log is not itself audited.

**Screens**:

`/audit` — admin only `(interview: Audit UI)`.
- **Nav**: admin-only nav item **"Audit log"** (`nav.audit`). A non-admin opening `/audit` sees the page text "You are not authorized to view this page!" (`common.unauthorized`), and the API returns 403.
- **Title**: "Audit log" (`audit.title`).
- **Filters**, all empty by default, kept in the URL query string so reload and links keep them:
  - **Actor** (`audit.filter.actor`): select with "All" (`audit.filter.all`), "CLI" (`audit.actor.cli`, sends `actorType=cli`), and every user from `GET /api/users`, sorted by display name (`formatUserName`).
  - **Target type** (`audit.filter.targetType`): All / Leave / User (`audit.targetType.LEAVE`, `audit.targetType.USER`).
  - **Target ID** (`audit.filter.targetId`): text, trimmed.
  - **Action** (`audit.filter.action`): multiselect of the 10 actions with labels `audit.action.<ACTION>`.
  - **From** / **To** (`audit.filter.from`, `audit.filter.to`): date inputs.
- **Validation**:
  - The client shows `errors.AUDIT_RANGE_INVALID` under To when From > To, and does not send the request.
  - The server error text is shown if the server returns that code.
- **Buttons**: "Apply" (`audit.filter.apply`) resets to page 1 and fetches. "Clear filter" (`leaves.filter.clear`) empties all filters and fetches page 1.
- **Table columns**:
  - **Time** (`audit.table.time`): `at` formatted in `DEFAULT_TIMEZONE` per locale (NFR-13).
  - **Actor** (`audit.table.actor`): `formatUserName(actor)`; "CLI" for cli; `Deleted <id>` when `actor` is null for a user actor.
  - **Action** (`audit.table.action`): translated label.
  - **Target** (`audit.table.target`): translated target type + `targetId`. For USER targets, also the display name when the user is in the loaded user list.
  - **Details** (`audit.table.details`): one line per changed key as `<key>: <old> → <new>`. Approve/reject show `<previousState> → <newState>` with translated states. Leave snapshots show `<start> – <end>, <type label>, <state label>`. `USER_DATA_EXPORTED` shows "–".
- **Pagination**: page size 50. "Previous" (`audit.pagination.prev`) and "Next" (`audit.pagination.next`) are disabled at the ends. The label reads "Page {{page}} of {{pages}}" (`audit.pagination.pageOf`), with `pages = max(1, ceil(total / pageSize))`.
- **States**:
  - Loading: "Loading…" (`common.loading`).
  - Empty: "No audit entries match the filter." (`audit.empty`).
  - Error: "Error while fetching list: {{message}}" (`common.loadListError`), with the translated error code. The filters stay usable.

**Permissions**:

| action | user | admin | m2m |
|---|---|---|---|
| `/audit` screen and nav item | hidden; direct URL shows unauthorized text | shown | – |
| `GET /api/admin/audit` | 403 | 200 | 401 (Basic auth valid only on attendance) |
| write entries | implicit, through own actions | implicit | never |
| update/delete entries | never | never (only the NFR-08 scrub) | never |

**Business rules**:
- `from=2026-11-01&to=2026-11-01` with `DEFAULT_TIMEZONE=Europe/Bratislava` matches `at` in `[2026-10-31T23:00:00.000Z, 2026-11-01T22:59:59.999Z]`.
- `total` is the count of all matches before pagination. A `page` beyond the last page returns `items: []` with the correct `total`.

**Acceptance criteria**:
- Given a user creates a leave, when the request succeeds, then one `LEAVE_CREATED` entry exists with `actorId` = user id and `details.after` = leave snapshot.
- Given an admin approves an APPROVED leave, then a `LEAVE_APPROVED` entry is written with `details.previousState = details.newState = "APPROVED"`.
- Given a user deletes own leave, then a `LEAVE_DELETED` entry holds the full snapshot in `details.before`, and the leave no longer exists.
- Given an admin changes only a user's surname, then exactly one `USER_UPDATED` entry exists, with `details.before = { surname: old }` and `details.after = { surname: new }`.
- Given an admin sets `isAdmin=true` and changes `firstName` in one request, then one `USER_UPDATED` and one `USER_ROLE_CHANGED` entry exist with the same `at`.
- Given a user saves the profile without changes, then no entry is written.
- Given a first Google login, then one `USER_REGISTERED` entry exists with the new user as actor.
- Given the CLI promotes a user, then a `USER_ROLE_CHANGED` entry with `actorType='cli'` and `actorId=null` exists.
- Given the migration runs, then the AuditLog collection is empty afterwards.
- Given the audit insert fails, when a leave is created, then the response is 500 `INTERNAL_ERROR`, the leave does not exist and no email is sent.
- Given a non-admin calls `GET /api/admin/audit`, then 403 `FORBIDDEN`. Given no token, then 401 `AUTH_REQUIRED`.
- Given `from=2026-11-05&to=2026-11-01`, then 400 `AUDIT_RANGE_INVALID`. Given `pageSize=201`, then 400 `VALIDATION_FAILED`.
- Given 120 entries and `pageSize=50&page=3`, then 20 items and `total=120`.
- Given any code path calls `updateOne` on AuditLog, then it throws.
- Given an admin on `/audit` selects Action "Leave approved" and applies, then only approve entries are listed and the URL contains `action=LEAVE_APPROVED`. After a reload the filter is still set.
- Given no entry matches, then "No audit entries match the filter." is shown.
- Given 51 entries, then page 1 shows 50 rows with "Page 1 of 2", and Next shows 1 row.
- Given a non-admin, then the nav has no "Audit log" item.

**Tests**:
- Unit:
  - `details` builders (changed fields only; empty diff means no entry; approve/reject shape);
  - leave snapshot mapper;
  - `from`/`to` conversion in `Europe/Bratislava`, including the DST day 2026-10-25;
  - query validation;
  - Details-column formatter in the web app;
  - URL ↔ filter state mapping.
- Integration (real MongoDB 8 single-member replica set):
  - one test per action row, asserting the entry fields;
  - transaction rollback when the audit insert is forced to fail (leave and user cases);
  - append-only hooks throw;
  - `GET /api/admin/audit`: each filter alone and combined, sort order, pagination, `total`, the 401/403/400 cases;
  - `actor` null for cli and for a missing user;
  - `actor` contains no `email`.
- E2E (Playwright):
  - admin approves a leave, opens `/audit`, filters by the leave id and sees `Leave created` and `Leave approved` rows;
  - empty state;
  - pagination with seeded 51 entries;
  - a non-admin has no nav item and sees the unauthorized text on `/audit`.

### NFR-07 — GDPR export of one user's data

- **Type**: NFR
- **Source**: `(rewrite spec: Non-functional requirements › Data privacy and compliance)` — "Admin can export all data of one user (GDPR access request)"
- **Depends on**: DATA-02, USR-01, NFR-06

**Goal**: An admin downloads one JSON file with everything the app stores about one user. The file holds the user record, leaves they requested, leaves they approved or rejected, and audit entries about them or by them. The action sits on the `/users` screen. Every export writes a `USER_DATA_EXPORTED` audit entry.

**Old behavior**: New — no counterpart in the old system. The old exports are travel-warrant and monthly detail xlsx files (`server/export/exportTravelWarrant.js`, `server/export/exportDetail.js`, `server/export/exportMiddleware.js`). They are out of scope and are not a GDPR export. `(rewrite spec: Removed features)`

**Constraints**:
- Admin only (spec: "Admin can export").
- Exports include deactivated and anonymized users.
- Other users' personal data is redacted (`redacted: true`), and refresh-token hashes are never exported `(interview: Remaining)`.

**API**:

`GET /api/admin/users/:id/export`
- Auth: access JWT; caller is active and `isAdmin`.
- Path `id`: User.id.
- 200 headers:
  - `Content-Type: application/json; charset=utf-8`
  - `Content-Disposition: attachment; filename="user-export-<id>-<yyyy-MM-dd>.json"` (date in `DEFAULT_TIMEZONE`)
  - `Cache-Control: no-store`
- 200 body:

```json
{
  "formatVersion": 1,
  "exportedAt": "2026-11-04T10:00:00.000Z",
  "exportedBy": "1098765432",
  "user": {
    "id": "1122334455", "email": "peter.kral@instea.co", "firstName": "Peter", "surname": "Kráľ",
    "isAdmin": false, "active": true, "deactivatedAt": null, "anonymizedAt": null,
    "createdAt": "2025-01-10T08:00:00.000Z", "updatedAt": "2026-03-01T12:00:00.000Z"
  },
  "leavesAsRequester": [
    { "id": "…", "requesterId": "1122334455", "approverId": "1098765432", "startDate": "2026-07-01", "endDate": "2026-07-03",
      "isHalfDay": false, "type": "ANNUAL", "state": "APPROVED", "numDays": 3,
      "createdAt": "…", "updatedAt": "…" }
  ],
  "leavesAsApprover": [],
  "auditEntries": [
    { "id": "…", "at": "…", "actorType": "user", "actorId": "1122334455", "action": "LEAVE_CREATED",
      "targetType": "LEAVE", "targetId": "…", "details": { "after": { "…": "…" } }, "redacted": false }
  ]
}
```

- Content rules:
  - `user`: all User fields (DATA-01).
  - `leavesAsRequester`: all leaves with `requesterId = id`, sorted by `startDate` asc, then `id`. Raw entity fields; no embedded `UserRefDto`.
  - `leavesAsApprover`: all leaves with `approverId = id` and `requesterId ≠ id`, same sort.
  - `auditEntries`: union, deduplicated by `id`, sorted by `at` asc, of entries where:
    - `actorId = id`, or
    - `targetType = USER` and `targetId = id`, or
    - `targetType = LEAVE` and (`details.before.requesterId = id` or `details.after.requesterId = id`). This covers deleted and created leaves.
  - For approve/reject entries of the user's own leaves (their `details` has no requesterId), the leave id is matched against the user's current leaves.
  - RefreshToken data (AUTH-02) is not included.
- Errors:
  - 401 `AUTH_REQUIRED`, `ACCESS_TOKEN_INVALID`, `ACCESS_TOKEN_EXPIRED`, `USER_DEACTIVATED`.
  - 403 `FORBIDDEN`: not admin.
  - 404 `USER_NOT_FOUND`.
- `HEAD /api/admin/users/:id/export` (Express would answer it with the GET handler): after the access check (401 / 403 as above), 405 `METHOD_NOT_ALLOWED` with `Allow: GET` and no body; the file is not built and no `USER_DATA_EXPORTED` entry is written `(user decision 2026-11-11)`.
- Side effect: after the file is built, write audit `USER_DATA_EXPORTED` (actor = admin, target = user). It is not included in the file it accompanies. If the audit write fails, return 500 `INTERNAL_ERROR` and no file.

**Screens**:
- `/users` (admin): each row gets an action button **"Export data"** (`users.list.exportData`).
- Click: the SPA calls the endpoint with the in-memory Bearer token and saves the response through a Blob object URL. A plain `<a href>` cannot carry the Bearer header.
- While running: the button is disabled and reads **"Exporting…"** (`users.list.exporting`).
- Error: an inline error alert with the translated `errors.<code>` (NFR-13).
- No navigation after success.
- The button is shown for every user, including deactivated and anonymized ones.

**Permissions**:

| action | user | admin |
|---|---|---|
| see "Export data" button | hidden (no `/users` access) | shown |
| `GET /api/admin/users/:id/export` | 403 | 200 (any user, incl. self) |

**Business rules**:
- Redaction: for an entry where the exported user is only the actor and the target is another USER, set `details` to null and `redacted` to true. Example: the exported admin changed someone else's surname. Keep `id`, `at`, `action`, `targetType`, `targetId`. All other entries carry `redacted: false`.
- Leaves contain only ids of other users, never their names or emails.

**Acceptance criteria**:
- Given user U with 2 own leaves and 1 leave approved by U for another user, when an admin exports U, then `leavesAsRequester` has 2 items and `leavesAsApprover` has 1.
- Given U deleted a leave earlier, then the export contains its `LEAVE_DELETED` entry with the full `details.before` snapshot.
- Given an admin approved U's leave, then the export of U contains that `LEAVE_APPROVED` entry.
- Given admin A edited U's name, then the export of U contains that `USER_UPDATED` entry with values (`redacted: false`).
- Given U is an admin who edited user V's surname, then the export of U contains that entry with `details: null` and `redacted: true`.
- Given an anonymized user, then the export returns the placeholder name and email and the scrubbed audit details.
- Given an unknown id, then 404 `USER_NOT_FOUND`.
- Given a non-admin caller, then 403 `FORBIDDEN`, and no audit entry is written.
- Given a successful export, then one `USER_DATA_EXPORTED` entry exists, and the response has `Content-Disposition: attachment` with the documented file name.
- The file contains no refresh-token field or hash.

**Tests**:
- Unit:
  - entry selection predicate (all conditions, dedup);
  - redaction rule;
  - file-name builder with `DEFAULT_TIMEZONE`: 2026-11-04 22:30 UTC gives `2026-11-04`; 23:30 UTC gives `2026-11-05`.
- Integration:
  - full export fixture with own leaves, approved leaves, a deleted leave, and edits by and of the user;
  - headers;
  - 401/403/404;
  - audit entry written;
  - audit-write failure returns 500;
  - grep of the serialized body finds no `tokenHash` / refresh-token fields.
- E2E: admin clicks "Export data" on `/users`; the Playwright `download` event yields JSON whose `user.id` matches the row.

### NFR-08 — GDPR erasure by anonymizing one user

- **Type**: NFR
- **Source**: `(rewrite spec: Non-functional requirements › Data privacy and compliance)` — "Admin can erase or anonymize one user's personal data (GDPR erasure)"
- **Depends on**: AUTH-02, USR-01, USR-02, ATT-02, NFR-06

**Goal**: An admin irreversibly anonymizes one user who is no longer listed in the SSO directory. Email, first name and surname become placeholders. The account is deactivated and its refresh tokens are revoked. Leaves keep the same `requesterId` / `approverId`, so counts and history survive under the placeholder name. Personal data inside the user's audit details is scrubbed. The admin confirms by typing the user's email.

**Old behavior**: New — no counterpart in the old system.
- The only removal is a hard delete of the user document, with no confirmation (`server/graphql/userRelated.js:81`, `src/containers/users/UserList.js:36`). Leaves keep the dangling `requesterId`.
- The server then shows a dummy user `firstName: 'Deleted'`, `surname: <id>`, `email: <id>@deleted.instea.co` (`server/service/userService.js:3-13`, `:17-18`). This is the closest precedent for a placeholder.

**Constraints**:
- Leaves keep their requester. `(rewrite spec: User administration › "Admin deactivates a user (soft delete); the user's leaves keep their requester")`
- Destructive actions ask for confirmation. `(rewrite spec: User administration › "Remove/deactivate actions ask for confirmation")`
- Blocked while the SSO directory still lists the user's email. If the SSO directory is unreachable, the request fails `(interview: Anonymize)`.
  - Why: attendance joins leaves to SSO employees by email (`server/service/attendenceService.js:157` → `server/service/leaveService.js:21-33`). So a person still in SSO would lose their leave codes in `GET /api/attendence/:year/:month`.
  - Once SSO no longer lists them, attendance does not list them either, so anonymization changes no attendance output.
- Self-anonymization is allowed `(interview: Anonymize)`. It revokes the caller's own sessions in the same transaction.
- Irreversible: no undo endpoint and no reactivation feature `(interview: User admin)`. `PATCH /api/users/:id` on an anonymized user returns 409 `USER_ANONYMIZED` (USR-02); the anonymized user themself calling `PATCH /api/users/me` gets 401 `USER_DEACTIVATED` from the auth guard (an anonymized user is deactivated), not 409.
- Login looks up by Google `sub` `(interview: Remaining)`. An anonymized user who logs in again finds the existing deactivated record and gets 403 `USER_DEACTIVATED`; no new user is created.
- The guard re-checks `active` on every request (AUTH-02), so a still-valid access JWT of the anonymized user gets 401 `USER_DEACTIVATED`.
- Copies outside the app database are not erased by this action. The ops runbook states this:
  - the 14-day backup dumps age out by rotation;
  - stdout logs follow cluster log rotation;
  - past emails and earlier NFR-07 export files are outside the system.

**Data model**: User fields written (owner DATA-01):

| field | new value |
|---|---|
| `email` | `anonymized-<token>@anonymized.invalid` (`<token>` = 8 lowercase hex chars from a CSPRNG; on unique-index collision, regenerate up to 3 times, then 500 `INTERNAL_ERROR`) |
| `firstName` | `Anonymized` |
| `surname` | `User <token>` |
| `isAdmin` | `false` |
| `active` | `false` |
| `deactivatedAt` | unchanged if already set, else now |
| `anonymizedAt` | now |
| `id` | unchanged (Google `sub`; leaves reference it) |

Also changed:
- RefreshToken (AUTH-02): all tokens of the user are revoked or deleted.
- AuditLog (NFR-06): in every entry with `targetType=USER` and `targetId=id`, the values of `email`, `firstName`, `surname` in `details.before` and `details.after` become `"[anonymized]"`. `actorId` stays in all entries.

**API**:

`POST /api/admin/users/:id/anonymize`
- Auth: access JWT; caller is active and `isAdmin`.
- Body: `{ "confirmEmail": "peter.kral@instea.co" }`
- Check order and errors:
  1. 401 `AUTH_REQUIRED` / `ACCESS_TOKEN_INVALID` / `ACCESS_TOKEN_EXPIRED` / `USER_DEACTIVATED`.
  2. 403 `FORBIDDEN`: not admin.
  3. 400 `VALIDATION_FAILED`: `confirmEmail` missing or not a non-empty string.
  4. 404 `USER_NOT_FOUND`.
  5. 409 `USER_ALREADY_ANONYMIZED`: `anonymizedAt` is not null.
  6. 400 `CONFIRM_EMAIL_MISMATCH`: `confirmEmail.trim().toLowerCase()` ≠ stored email.
  7. SSO check via the ATT-02 SSO client (`SSO_URI`, `SSO_USERNAME`, `SSO_PASSWORD`; 30 s timeout):
     - 503 `SSO_UNAVAILABLE` when the request fails, times out or returns non-2xx;
     - 409 `SSO_EMPLOYEE_ACTIVE` when any SSO entry's `email` equals the stored email. The match is exact and case-sensitive, the same as attendance `(interview: Attendance)`, and the `employee` flag is not considered.
- 200 response: the updated User DTO (DATA-01 shape).
- Side effects, in one MongoDB transaction:
  - user update;
  - refresh-token revocation;
  - audit scrub;
  - audit entry `USER_ANONYMIZED`.
- Any failure rolls back everything (500 `INTERNAL_ERROR`).
- For self-anonymization, the response also clears the refresh cookie. The SPA then shows `/login`.

**Screens**:
- `/users` (admin): each row whose user is not anonymized gets a danger action **"Anonymize"** (`users.anonymize.action`). The current admin's own row also has it.
- Dialog:
  - Title: **"Anonymize user"** (`users.anonymize.title`).
  - Text: **"This permanently replaces the name and email of {{email}} with placeholders, deactivates the account and signs it out. Leaves stay in the system under the placeholder name. This cannot be undone."** (`users.anonymize.body`).
  - On the own row, an extra line: **"You are anonymizing your own account. You will be signed out."** (`users.anonymize.selfWarning`).
  - Input label: **"Type the user's email to confirm"** (`users.anonymize.confirmLabel`). Default empty.
  - Buttons: **"Anonymize"** (danger) and **"Cancel"** (`common.cancel`). "Anonymize" is disabled until the trimmed, lowercased input equals the email.
  - While submitting: the button reads **"Anonymizing…"** (`users.anonymize.submitting`) and both buttons are disabled.
  - Error: inline alert with `errors.<code>`. This covers `SSO_EMPLOYEE_ACTIVE` and `SSO_UNAVAILABLE`.
  - Success: close the dialog, refetch the list, and show **"User anonymized."** (`users.anonymize.success`). On self-anonymization, clear the session and navigate to `/login`.
- The status column shows **"Anonymized"** (`users.status.anonymized`) when `anonymizedAt` is set. It takes precedence over "Deactivated". Edit is hidden for anonymized rows.

**Permissions**:

| action | user | admin |
|---|---|---|
| see "Anonymize" | hidden | shown on every non-anonymized user, incl. self |
| `POST /api/admin/users/:id/anonymize` | 403 | 200 |

**Business rules**:
- Personal data covered: `email`, `firstName`, `surname`. Leaves hold only user ids and dates. The leave type is accepted as visible (Q-S4).
- Example: Peter Kráľ (`peter.kral@instea.co`) left the company and is removed from SSO. The token is `3f9a1c2b`.
  - After anonymization the leave list shows requester "Anonymized User 3f9a1c2b (deactivated)", per the UI-defaults rule for deactivated requesters.
  - The audit `USER_UPDATED` entry `details.before: { surname: "Kral" }` becomes `{ surname: "[anonymized]" }`.

**Acceptance criteria**:
- Given an active user P absent from SSO, with leaves, when an admin anonymizes P with the correct email, then:
  - P's email, firstName and surname are placeholders, `active=false`, `isAdmin=false`, and `anonymizedAt` is set;
  - P's leaves still have `requesterId = P.id`;
  - P's refresh tokens are revoked;
  - one `USER_ANONYMIZED` entry exists.
- Given SSO lists P's email, then 409 `SSO_EMPLOYEE_ACTIVE`, and nothing changes.
- Given SSO lists `Peter.Kral@instea.co` while the stored email is `peter.kral@instea.co`, then the check passes (exact, case-sensitive match).
- Given SSO times out or returns 500, then 503 `SSO_UNAVAILABLE`, and nothing changes.
- Given a wrong `confirmEmail`, then 400 `CONFIRM_EMAIL_MISMATCH`, and SSO is not called.
- Given `confirmEmail` in different case with surrounding spaces, then it is accepted.
- Given an already anonymized user, then 409 `USER_ALREADY_ANONYMIZED`.
- Given the admin anonymizes self, then 200, the admin's refresh tokens are revoked, the refresh cookie is cleared, and the next API call returns 401.
- Given P's browser calls `POST /api/auth/refresh`, then 401. Given P logs in with Google again, then 403 `USER_DEACTIVATED`, and the user count is unchanged.
- Given an admin `PATCH`es the anonymized user, then 409 `USER_ANONYMIZED`.
- Given earlier audit entries for P containing names, then afterwards those keys contain `"[anonymized]"`, and `at`, `action` and `actorId` are unchanged.
- Given the audit scrub fails, then the response is 500, and the user is unchanged.
- Given the dialog is open, then "Anonymize" stays disabled until the email is typed.

**Tests**:
- Unit:
  - placeholder generator (format, lowercase, `.invalid` TLD);
  - confirm-email comparison;
  - SSO email match (exact, case-sensitive);
  - scrub function (only the three keys in `details.before` / `details.after`; nulls untouched).
- Integration:
  - Uses the contract-based SSO mock: lists the email / does not list / 500 / timeout.
  - Happy path: user, leaves, refresh tokens, audit scrub, new entry.
  - Every error code in check order; SSO not called on 400/404/409 before step 7.
  - Transaction rollback; self-anonymization.
  - Re-login of an anonymized `sub` gives 403.
  - PATCH gives 409 `USER_ANONYMIZED`.
  - NFR-07 export afterwards shows only placeholders.
- E2E:
  - the admin opens the dialog on `/users`; the button stays disabled with a wrong email;
  - the admin types the email and confirms; the row shows "Anonymized", and the leave list shows the placeholder name;
  - with the SSO mock listing the user, the dialog shows the `SSO_EMPLOYEE_ACTIVE` text.

### NFR-09 — CI pipeline blocking merge to master

- **Type**: NFR
- **Source**: `(rewrite spec: Non-functional requirements › Maintainability)` — "CI runs lint, typecheck and all tests and blocks merge to master on failure"
- **Depends on**: SET-01, TST-01, TST-02, TST-03, NFR-04, NFR-10, NFR-11

**Goal**: GitHub Actions runs lint, typecheck, unit, integration and E2E tests on every PR and push to `master`. Branch protection makes these checks required, so failing PRs cannot be merged. The image build/push and release replace the old `release.yml`.

**Old behavior**: `.github/workflows/release.yml:3-9` triggers on push and PR to `master`; jobs read version, build and push image (push only on push events, `release.yml:54`), and on master delete and recreate the GitHub release `v<version>` (`release.yml:59-81`). No lint or tests run in CI (analysis §6). Local hooks run lint and `bin/test.sh` (`package.json:5-10`, `bin/test.sh:1-15`) but are likely inert (analysis §6).

**Constraints**: Registry login secrets keep their names `DOCKER_REGISTRY_USERNAME`, `DOCKER_REGISTRY_PASSWORD` (`.github/workflows/release.yml:46-47`). The image has no build-time environment config: the SPA reads Google settings from `GET /api/auth/config`, so one image serves every environment. Deploy on every merge to `master` `(interview: CI gates)`.

**Business rules** (workflows):
- `.github/workflows/ci.yml` on `pull_request` and `push` to `master`; concurrency group per ref, cancel in progress for PRs. Setup: `actions/setup-node` with `node-version-file: .nvmrc`, `pnpm/action-setup`, `pnpm install --frozen-lockfile`, pnpm store cache.
  - `lint`: `pnpm lint` + `pnpm format:check` + `pnpm lint:md` + `pnpm lint:links` (DOC-01).
  - `typecheck`: `pnpm typecheck`.
  - `unit`: `pnpm test:unit --coverage` (thresholds TST-01), upload coverage artifact.
  - `integration`: `pnpm test:integration` (MongoDB 8 via Testcontainers, Mailpit service container), TST-02.
  - `e2e`: build, start app + MongoDB 8 + Mailpit, `pnpm e2e` (Playwright, Chromium), upload report + traces on failure. TST-03.
  - `openapi`: DOC-02 stale check.
  - `audit`, `dependency-review` (PR only), `image-scan`: NFR-04.
  - `commitlint`: PR title follows Conventional Commits (NFR-11; squash merge uses PR title) `(interview: CI gates)`.
- `.github/workflows/release.yml` (replaced): on push to `master` after `ci` succeeds (`workflow_run` or as dependent jobs in the same workflow) → build and push image tags `latest` and `sha-<7 char sha>` (Keel deploys every merge) + release-please (NFR-11).
- Branch protection on `master`: require PR, require status checks `lint`, `typecheck`, `unit`, `integration`, `e2e`, `openapi`, `audit`, `image-scan`, `commitlint` (+ `dependency-review` for PRs), require branch up to date, squash merge only, no force push, include administrators.

**Acceptance criteria**:
- Given a PR with a lint error / type error / failing unit / integration / e2e test, then the corresponding job fails and the merge button is blocked.
- Given a green PR merged to `master`, then the image is built and pushed and release-please updates its release PR.
- Given a PR from a fork, then registry secrets are not exposed and no push happens.
- Given the old workflow, then it no longer deletes and recreates releases (NFR-11).

**Tests**: verification PRs with one deliberate failure per job type; screenshot/record of branch protection settings in `deploy/README.md`.

### NFR-10 — TypeScript strict, ESLint, Prettier, pre-commit hooks

- **Type**: NFR
- **Source**: `(rewrite spec: Non-functional requirements › Maintainability)` — "TypeScript strict mode, ESLint and Prettier, pre-commit hooks that run"
- **Depends on**: SET-01

**Goal**: All packages compile with TypeScript strict settings, one ESLint flat config and Prettier format the repo, and git hooks are installed automatically by `pnpm install` so they actually run.

**Old behavior**: Root `.eslintrc` extends `react-app` with `semi`, single quotes, 2-space indent (`.eslintrc:1-8`); `.prettierrc` has `singleQuote: true`, `trailingComma: "es5"` (`.prettierrc:1-4`); husky v3 config in `package.json:5-10` runs eslint on pre-commit and eslint --fix + `bin/test.sh` on pre-push; Angular uses tslint + lint-staged prettier (`angular/package.json:52-54`). Installed husky 9 vs declared 3 means hooks are likely inert (analysis §6).

**Constraints**: `.prettierrc` keeps `singleQuote: true` from `.prettierrc:2`; other options Prettier 3 defaults (trailingComma `all`).

**Business rules** (configuration):
- `tsconfig.base.json`: `strict: true`, `noUncheckedIndexedAccess: true`, `noImplicitOverride: true`, `noFallthroughCasesInSwitch: true`, `exactOptionalPropertyTypes: false` (NestJS DTO compatibility), `forceConsistentCasingInFileNames: true`, `verbatimModuleSyntax` in web/shared. Every package extends it; no package may set `strict: false`.
- `eslint.config.mjs` (flat): `typescript-eslint` `recommendedTypeChecked`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh` (web), `eslint-config-prettier` last. Rules: `@typescript-eslint/no-explicit-any: error`, `@typescript-eslint/no-floating-promises: error` (old bug class: `fix: findOne is async`, git log `3bb57f5`), `no-console: error` in api (use logger).
- Hooks: `husky` with `"prepare": "husky"` in root `package.json`. `pre-commit`: `lint-staged` → `eslint --fix --max-warnings 0` on staged `*.{ts,tsx}`, `prettier --write` on staged `*.{ts,tsx,js,json,md,css,yml,yaml}`. `commit-msg`: `commitlint --edit` (Conventional Commits, NFR-11).
- Scripts (root): `lint` (`eslint . --max-warnings 0`), `format` (`prettier --write .`), `format:check` (`prettier --check .`), `typecheck` (`pnpm -r typecheck`, each package `tsc --noEmit`).

**Acceptance criteria**:
- Given a fresh clone, when `pnpm install` runs, then `.husky` hooks are active (`git config core.hooksPath` = `.husky/_`).
- Given a staged file with a lint error, when committing, then the commit is rejected.
- Given commit message `update stuff`, then `commit-msg` rejects it.
- Given CI, then `lint`, `format:check`, `typecheck` run (NFR-09); hooks are not the only gate.

**Tests**: verification: a scratch commit with an unused variable / bad format / bad message is rejected locally; CI jobs fail on the same changes.

### NFR-11 — Semantic versioning with automated bump and release notes

- **Type**: NFR
- **Source**: `(rewrite spec: Non-functional requirements › Maintainability)` — "Semantic versioning with automated version bump and release notes per release"
- **Depends on**: NFR-10, OPS-03

**Goal**: Versions follow SemVer and are bumped automatically from Conventional Commit messages. Each release gets a git tag `vX.Y.Z`, a GitHub release with notes and a `CHANGELOG.md` entry, and the image is tagged with the version.

**Old behavior**: Version read from `package.json` (`.github/workflows/release.yml:21-23`), fixed at `0.1.0` (`package.json:3`). Every push to master deletes release and tag `v0.1.0` and recreates it with generated notes (`.github/workflows/release.yml:70-81`). Image tags `latest` and `<version>` (`release.yml:55-57`). Recent commits partly use Conventional Commits (`git log`: `ci: initialize release pipeline (#84)`, `feat(toggl): …`, `fix: findOne is async`) and partly not (`Handle properly deleted users from DB (#82)`).

**Constraints**: Decided `(interview: CI gates)`: release-please, deploy on every merge, first version `1.0.0` at cutover, Conventional Commit PR titles enforced. Tool: `googleapis/release-please-action` (manifest mode, single version for the monorepo, `release-type: node`, version in root `package.json`). Commit types via commitlint `@commitlint/config-conventional`, PR titles checked (squash merge).

**Business rules**:
- `feat:` → minor, `fix:`/`perf:` → patch, `!` or `BREAKING CHANGE:` → major; other types no release.
- On push to `master`: release-please opens/updates a "release PR" with version bump + `CHANGELOG.md`. Merging it creates tag `vX.Y.Z` and the GitHub release with the changelog section as notes.
- On release created: build and push image tags `X.Y.Z`, `X.Y`, `latest`.
- Every merge to `master` (not only releases) also pushes `latest` and `sha-<7 char sha>` so Keel deploys on merge as today (`kubernetes/README.md:41`).
- First release `1.0.0` is cut for the cutover (`release-as: 1.0.0` in `release-please-config.json` for the first release, removed afterwards).
- Releases and tags are never deleted or recreated.
- App reports its version: `GET /health-check` does not change (OPS-01); the version is logged at startup and exposed in the web footer/user menu as `vX.Y.Z` (`APP_VERSION` injected at image build from `package.json`).

**Acceptance criteria**:
- Given merges `fix: a` and `feat: b` since `v1.0.0`, then the release PR proposes `v1.1.0` with both entries in the notes.
- Given the release PR is merged, then tag `v1.1.0`, GitHub release and image `registry.instea.co/cestaky-leaves:1.1.0` exist.
- Given a second push to `master`, then no existing release is deleted.

**Tests**: verification on the repo with the first real release; release-please config validated by its dry-run (`release-please release-pr --dry-run`) in a PR.

### NFR-12 — Current, supported runtime and library versions

- **Type**: NFR
- **Source**: `(rewrite spec: Non-functional requirements › Maintainability)` — "Current, supported runtime and library versions"
- **Depends on**: SET-01, NFR-04

**Goal**: At first production release every runtime, framework and library is on a currently supported major version, and automation keeps it that way.

**Old behavior**: Node 8 build / Node 12.22 runtime (`Dockerfile:1,29`), MongoDB 3.6 (`kubernetes/mongo3.yml:47`, `db/docker-compose.yml:4`), mongoose 4 (`package.json:33`, `server/db/connect.js:9` `useMongoClient`), Angular 4 (`angular/package.json:17-25`), react-scripts 3 (`package.json:45`), date-holidays 1.2 (`package.json:19`), all EOL or outdated (analysis §8 Outdated dependencies).

**Constraints**: Brief fixes: Node 24 LTS, NestJS current major, Mongoose 8, MongoDB 8, React 19. Node 24 LTS stays `(interview: Node version)`; this overrides the client note "Use latest `node` version" `(client answers: Other notes)`.

**Business rules** (measurable targets):
- Node: `.nvmrc` = `24`, `engines.node` = `>=24 <25`, Docker base `node:24-slim` (digest pinned, Dependabot updates).
- pnpm: `packageManager` field pins the current pnpm major (exact version), used via Corepack.
- MongoDB server image `mongo:8.0` (or the newest 8.x minor) in k8s, docker-compose and tests — same version everywhere.
- Libraries: latest stable major at project start for NestJS, @nestjs/swagger, Mongoose 8.x, React 19, Vite, Tailwind CSS, TanStack Query, React Router, FullCalendar, date-fns + @date-fns/tz, date-holidays (exact pin), nodemailer, google-auth-library, Vitest, Playwright, TypeScript, ESLint. Exact versions pinned in `pnpm-lock.yaml`.
- No dependency marked deprecated by npm in production deps: CI check `pnpm ls --prod --depth Infinity --json` scanned for `deprecated` (script in `audit` job; warns, fails if a direct dep is deprecated).
- `pnpm outdated` report is attached to each release PR (informational); majors more than one behind are a release blocker reviewed by the team.

**Acceptance criteria**:
- Given the first release, when `pnpm outdated` runs, then no direct dependency is behind by a major version unless documented in `deploy/README.md` with a reason.
- Given the image, then `node --version` prints `v24.*`.
- Given docker-compose, CI and k8s, then all use the same MongoDB major `8`.

**Tests**: CI step asserting `node --version` major in the image (`docker run --rm <image> node -e "process.exit(process.versions.node.split('.')[0]==='24'?0:1)"`).

### NFR-13 — UI localization in Slovak and English

- **Type**: NFR
- **Source**: `(rewrite spec: Non-functional requirements › Localization)` — "Whole UI in Slovak and English: screens, labels, validation messages, leave types; user can switch language"; `(client answer: Q-S10)` — "ENG is default language for UI and emails."; `(interview: UI defaults)` — library, EN labels and old-wording fixes
- **Depends on**: SET-03, DATA-02

**Goal**: Every user-visible string in `apps/web` comes from a translation catalog in English and Slovak. English is the default. The user switches language in the nav and on the login page, and the choice persists in localStorage. Dates, month names, numbers and the FullCalendar view follow the active locale. API errors are shown by translating their `code`. A test guarantees both catalogs have the same keys.

**Old behavior**: No i18n.
- The UI is English only. The analysis says "UI text is English; only placeholders and travel types are Slovak" (`PROJECT_INITIAL_ANALYSIS.md:241`). The Slovak parts are trip/place screens, out of scope.
- The "translate" pipes do not translate. They return the raw enum name (`angular/src/app/pipes/translate-leave-type.pipe.ts:6-8`, `angular/src/app/pipes/translate-leave-state.pipe.ts:6-8`).
- Readable labels exist only server-side, partly: `'Doctor visit'`, `'Caring for a relative at home'`, the rest are raw codes (`src/data/LeaveType.js:2-9`). The Angular form also lists raw codes (`angular/src/app/leaves/leaves-add/leaves-add.component.ts:94-97`).
- Angular dates use the default `date` pipe (en-US `mediumDate`, e.g. "Nov 4, 2026") (`angular/src/app/leaves/leaves-list/leaves-list.component.html:37`). React uses `D. M. YYYY` (`src/components/FormHelpers.js:42-44`).
- Month names are hard-coded English (`angular/src/app/leaves/leaveFilter.ts:6-19`).
- The intl polyfill is commented out (`angular/src/polyfills.ts:72-76`).

**Constraints**:
- Default language `en`, without browser-language detection. `(client answer: Q-S10)`
- Only `en` and `sk`.
- Emails are not localized (NFR-14).
- The API `message` field stays English and is for logs and developers. The UI shows `errors.<code>`.
- Decided `(interview: UI defaults)`:
  - library `i18next` + `react-i18next`;
  - EN leave-type labels: Annual leave, Sick leave, Doctor visit, Maternity leave, Parental leave, Caring for a relative at home;
  - old-wording fixes: singular/plural "work day(s)", "Logout" as the single logout label;
  - 0 work days shown as `0`;
  - week starts Sunday (EN) / Monday (SK).
- All SK texts in this task are proposals. Client review of the SK catalog is a delivery step before release (see Delivery). They do not block implementation.

**Configuration**:
- Library: `i18next` + `react-i18next`, with no backend plugin. Catalogs are bundled.
- Files: `apps/web/src/i18n/locales/en.json`, `apps/web/src/i18n/locales/sk.json`, single namespace `translation`.
- Typing: i18next TypeScript augmentation with `en.json` as the resource type. A missing or misspelled key fails `tsc`.
- Key naming:
  - dot-separated lowerCamel segments by area: `common.*`, `nav.*`, `login.*`, `leaves.list.*`, `leaves.filter.*`, `leaves.table.*`, `leaves.form.*`, `leaves.calendar.*`, `approval.*`, `summary.*`, `users.list.*`, `users.edit.*`, `users.status.*`, `users.deactivate.*`, `users.anonymize.*`, `leaves.delete.*`, `audit.*`, `profile.*`, `validation.*`;
  - enum maps keyed by exact code: `leaveType.<LeaveType>`, `leaveState.<LeaveState>`, `errors.<ERROR_CODE>`.
- Interpolation: `{{name}}`. Plurals: i18next plural suffixes (`_one`, `_few`, `_many`, `_other` for `sk`; `_one`, `_other` for `en`).
- Error translation:
  - `errors.<code>` for every code in the shared `ErrorCode` enum (`packages/shared`);
  - unknown code → `errors.UNKNOWN`: "Something went wrong. Try again later." / SK "Niečo sa pokazilo. Skúste to neskôr.";
  - network failure → `errors.NETWORK_ERROR`: "Cannot reach the server. Check your connection." / SK "Server nie je dostupný. Skontrolujte pripojenie.".
- Persistence:
  - localStorage key `lang`, values `en` | `sk`.
  - Read at startup. A missing or invalid value means `en`.
  - Every localStorage access sits in try/catch; on failure, use `en` in memory.
  - On change, set `<html lang>` and `document.title` (`app.title`).
- Switcher: a select labelled **"Language"** (`nav.language`). Options are shown in their own language in both catalogs: `English`, `Slovenčina`.
  - It sits in the user dropdown of the nav and at the top of `/login`.
  - Switching re-renders without reload and keeps the route and form state.
- Dates (date-fns with `enUS` / `sk` locales):

| use | EN pattern | EN example | SK pattern | SK example |
|---|---|---|---|---|
| leave range in list/approval | `MMM d, yyyy` | Nov 4, 2026 | `d. M. yyyy` | 4. 11. 2026 |
| month names in filter | `LLLL` | November | `LLLL` | november |
| audit/admin timestamps | `MMM d, yyyy HH:mm` | Nov 4, 2026 10:15 | `d. M. yyyy H:mm` | 4. 11. 2026 10:15 |

  - The EN range pattern matches the old Angular display (`leaves-list.component.html:37`). The SK pattern matches the old React pattern (`src/components/FormHelpers.js:43`).
  - Timestamps are shown in `DEFAULT_TIMEZONE` (from `/api/auth/me` or build config). Calendar dates (`YYYY-MM-DD`) are formatted without timezone shifting.
- Numbers: work days via `Intl.NumberFormat(locale, { maximumFractionDigits: 1 })`: EN `2.5`, SK `2,5`.
- FullCalendar: pass `locale` = `en` (built-in default) or the imported `@fullcalendar/react/locales/sk` (FullCalendar 7) (user decision 2026-11-11). This switches button texts ("today" → "Dnes"), the title, weekday names and the first day of week: EN Sunday as in the old calendar, SK Monday `(interview: UI defaults)`. Old header config: `leaves-calendar.component.ts:26-30`.
- Lint: `eslint-plugin-i18next` rule `no-literal-string` (mode `jsx-text-only`) on `apps/web/src/**/*.tsx`, excluding tests.

**String inventory (old → catalog)**: old English is kept unless the spec or `(interview: UI defaults)` changes it. The SK column holds the proposals that go to client review (Delivery). "dropped" = feature out of scope; no key.

Navigation and app shell:

| old file:line | old text | key | EN (new) | SK (proposed) |
|---|---|---|---|---|
| `angular/src/index.html:6` | Annual / Sick Leaves Management | `app.title` | Annual / Sick Leaves Management | Správa dovoleniek a PN |
| `public/index.html:17` | Trips | dropped | – | – |
| `angular/src/app/nav-header/nav-header.component.html:3` | Toggle navigation (aria) | `nav.toggle` | Toggle navigation | Prepnúť navigáciu |
| `nav-header.component.html:13`, `src/containers/auth/MenuBar.js:34` | Trips | dropped | – | – |
| `nav-header.component.html:17`, `MenuBar.js:76` | Leaves | `nav.leaves` | Leaves | Neprítomnosti |
| `nav-header.component.html:20`, `MenuBar.js:37` | Export | dropped | – | – |
| `MenuBar.js:35` | Places | dropped | – | – |
| `nav-header.component.html:24` | Leaves approval | `nav.approval` | Leaves approval | Schvaľovanie neprítomností |
| `nav-header.component.html:25` | `{{count}}` badge | `nav.pendingCount` (aria-label, new) | {{count}} pending | {{count}} na schválenie |
| `MenuBar.js:36` | Users | `nav.users` | Users | Používatelia |
| – (new, NFR-06) | – | `nav.audit` | Audit log | Auditný záznam |
| `nav-header.component.html:35` | Summary | `nav.summary` | Summary | Prehľad |
| `MenuBar.js:21` | Profile | `nav.profile` | Profile | Profil |
| `nav-header.component.html:36` / `MenuBar.js:22` | Logout / Sign out | `nav.logout` | Logout (single label, `(interview: UI defaults)`) | Odhlásiť sa |
| `MenuBar.js:27` | Login | `login.title` | Login | Prihlásenie |
| – (new) | – | `nav.language` | Language | Jazyk |
| – (new) | – | `language.en` / `language.sk` | English / Slovenčina | English / Slovenčina |

Login:

| old file:line | old text | key | EN (new) | SK (proposed) |
|---|---|---|---|---|
| `angular/src/app/login-page/login-page.component.ts:25`, `src/components/LoginResultMessage.js:11` | Login failed. Try again later. | `errors.LOGIN_FAILED` | Login failed. Try again later. | Prihlásenie zlyhalo. Skúste to neskôr. |
| `login-page.component.ts:28`, `LoginResultMessage.js:14` | Used email does not belong to given hosted domain. | `errors.WRONG_DOMAIN` | Used email does not belong to given hosted domain. | Použitý e-mail nepatrí do povolenej domény. |
| `login-page.component.ts:33`, `LoginResultMessage.js:17` | Account needs to be approved by admin first. | dropped (auto-approval) | – | – |
| – (new, AUTH-01) | – | `errors.USER_DEACTIVATED` | Your account has been deactivated. Contact an administrator. | Váš účet bol deaktivovaný. Kontaktujte administrátora. |

Common:

| old file:line | old text | key | EN (new) | SK (proposed) |
|---|---|---|---|---|
| `src/components/Unauthorized.js:6` | You are not authorized to view this page! | `common.unauthorized` | You are not authorized to view this page! | Nemáte oprávnenie zobraziť túto stránku! |
| `src/components/withProgress.js:17` | (spinner, no text) | `common.loading` (new, aria/visible) | Loading… | Načítava sa… |
| `src/containers/users/UserList.js:78` | Error while fetching list: {msg} | `common.loadListError` | Error while fetching list: {{message}} | Chyba pri načítaní zoznamu: {{message}} |
| `UserList.js:32` | Yes / No | `common.yes` / `common.no` | Yes / No | Áno / Nie |
| `src/containers/users/UserForm.js:39` | Save | `common.save` | Save | Uložiť |
| `UserForm.js:40` | Cancel | `common.cancel` | Cancel | Zrušiť |

Leave list, filters and calendar:

| old file:line | old text | key | EN (new) | SK (proposed) |
|---|---|---|---|---|
| `angular/src/app/leaves/leaves-list/leaves-list.component.html:2` | Annual / Sick leaves | `leaves.list.title` | Annual / Sick leaves | Dovolenky / PN |
| `leaves-list.component.html:5` | Add | `leaves.list.add` | Add | Pridať |
| – (new, LST-01) | – | `leaves.list.loading` | Loading leaves… | Načítavajú sa neprítomnosti… |
| – (new, LST-01) | – | `leaves.list.loadError` | Could not load leaves. | Neprítomnosti sa nepodarilo načítať. |
| – (new, LST-01) | – | `leaves.list.empty` | No leaves yet. | Zatiaľ žiadne neprítomnosti. |
| `leaves-list.component.ts:44` | Requester | `leaves.filter.requester` | Requester | Žiadateľ |
| `leaves-list.component.ts:40` | Month | `leaves.filter.month` | Month | Mesiac |
| `leaves-list.component.ts:48` | Year | `leaves.filter.year` | Year | Rok |
| `angular/node_modules/angular-2-dropdown-multiselect/dropdown/dropdown.component.js:70` (lib v1.6.3 default; enabled by `leaves-list.component.ts:52-53`) | Check all | `leaves.filter.checkAll` | Check all | Označiť všetko |
| same file `:71` | Uncheck all | `leaves.filter.uncheckAll` | Uncheck all | Zrušiť označenie |
| same file `:72-73`, `:77` | `<n> checked` / All selected | replaced by `leaves.filter.selectedCount` (button: placeholder + count, LST-02) `(user decision 2026-11-11)` | {{label}} ({{count}}) | {{label}} ({{count}}) |
| – (new, LST-02) | – | `leaves.filter.noMatch` | No leaves match the filter. | Filtru nezodpovedajú žiadne neprítomnosti. |
| `leaves-list.component.html:9` | Clear filter | `leaves.filter.clear` | Clear filter | Zrušiť filter |
| `leaves-list.component.html:13` | List | `leaves.view.list` | List | Zoznam |
| `leaves-list.component.html:16` | Calendar | `leaves.view.calendar` | Calendar | Kalendár |
| `leaves-list.component.html:25` | Requester | `leaves.table.requester` | Requester | Žiadateľ |
| `leaves-list.component.html:26` | Days | `leaves.table.days` | Days | Dni |
| `leaves-list.component.html:27` | Type | `leaves.table.type` | Type | Typ |
| `leaves-list.component.html:28` | State | `leaves.table.state` | State | Stav |
| `leaves-list.component.html:29` | Approver | `leaves.table.approver` | Approver | Schvaľovateľ |
| `leaves-list.component.html:37-38` | `{start} - {end} ({n} work days)` | `leaves.table.daysValue` | `_one`: {{start}} - {{end}} ({{count}} work day); `_other`: {{start}} - {{end}} ({{count}} work days) (singular fix, `(interview: UI defaults)`) | `_one`: {{start}} – {{end}} ({{count}} pracovný deň); `_few`: … ({{count}} pracovné dni); `_many`: … ({{count}} pracovného dňa); `_other`: … ({{count}} pracovných dní) |
| `leaves-list.component.html:44` | Delete | `leaves.table.delete` | Delete | Vymazať |
| – (new, LV-03) | – | `leaves.delete.title` | Delete leave? | Vymazať neprítomnosť? |
| – (new, LV-03) | – | `leaves.delete.text` | {{requester}}, {{start}} – {{end}} ({{type}}). This cannot be undone. | {{requester}}, {{start}} – {{end}} ({{type}}). Túto akciu nie je možné vrátiť späť. |
| – (new, LV-03) | – | `leaves.delete.confirm` | Delete | Vymazať |
| – (new, LV-03) | – | `leaves.delete.deleted` | Leave deleted | Neprítomnosť vymazaná |
| `angular/src/app/leaves/leaveFilter.ts:6-19` | January … December | none (date-fns `LLLL`) | January … December | január … december |
| `angular/src/app/leaves/leaves-calendar/leaves-calendar.component.ts:26-30` | prev / next / today, title (FullCalendar EN defaults) | none (FullCalendar locale) | today | Dnes |
| `leaves-calendar.component.ts:76` | `1/2 ` | `leaves.calendar.halfDay` | 1/2 | 1/2 |
| `leaves-calendar.component.ts:69-71` | first letter of code (A, S, D, M, P, C) | none: calendar letter = first letter of the type code, same in SK and EN (old app, LST-03; `LEAVE_TYPE_LETTERS`) (user decision 2026-11-11) | A, S, D, M, P, C | A, S, D, M, P, C |

Add-leave form and validation:

| old file:line | old text | key | EN (new) | SK (proposed) |
|---|---|---|---|---|
| `angular/src/app/leaves/leaves-add/leaves-add.component.html:2` | Add new leave | `leaves.form.title` | Add new leave | Nová neprítomnosť |
| `leaves-add.component.html:9` | Type | `leaves.form.type` | Type | Typ |
| `leaves-add.component.html:17` | Start date | `leaves.form.startDate` | Start date | Dátum začiatku |
| `leaves-add.component.html:26` | End date | `leaves.form.endDate` | End date | Dátum konca |
| `leaves-add.component.html:35` | Number of work days missed | `leaves.form.numWorkDays` | Number of work days missed | Počet zameškaných pracovných dní |
| `leaves-add.component.html:41` | Is half day? | `leaves.form.isHalfDay` | Is half day? | Poldeň? |
| `leaves-add.component.html:45` | Add leave | `leaves.form.submit` | Add leave | Pridať neprítomnosť |
| – (new, LV-02) | – | `leaves.form.saving` | Saving… | Ukladá sa… |
| – (new, LV-02) | – | `leaves.form.created` | Leave created | Neprítomnosť bola vytvorená |
| – (new, LV-02) | – | `leaves.form.saveError` | Could not save the leave. Try again. | Neprítomnosť sa nepodarilo uložiť. Skúste to znova. |
| – (new, LV-02) | – | `validation.required` | Required | Povinné |
| `angular/src/app/components/validation-errors/validation-errors.component.ts:5` | Start date must not be greater than end date | `validation.dateOrder` (also `errors.LEAVE_END_BEFORE_START`) | Start date must not be greater than end date | Dátum začiatku nesmie byť neskôr ako dátum konca |
| `validation-errors.component.ts:6` | Half day option is allowed only within single day | `validation.halfDaySingleDay` (also `errors.LEAVE_HALF_DAY_MULTIPLE_DAYS`) | Half day option is allowed only within single day | Poldeň je povolený len pre jeden deň |
| – (new, LV-01 / LV-02, `(user decision 2026-11-09)`) | – | `errors.LEAVE_TOO_LONG` | Leave must be shorter than 2 years | Neprítomnosť musí byť kratšia ako 2 roky |
| `validation-errors.component.ts:23` | `<key> failed` | dropped → `errors.UNKNOWN` | Something went wrong. Try again later. | Niečo sa pokazilo. Skúste to neskôr. |

Approval and summary:

| old file:line | old text | key | EN (new) | SK (proposed) |
|---|---|---|---|---|
| `angular/src/app/leaves/leaves-approval/leaves-approval.component.html:2` | Leaves approval | `approval.title` | Leaves approval | Schvaľovanie neprítomností |
| `leaves-approval.component.html:6-9` | Requester / Days / Type / State | reuse `leaves.table.*` | – | – |
| `leaves-approval.component.html:18` | `({n} work days)` | reuse `leaves.table.daysValue` | – | – |
| `leaves-approval.component.html:24` | Approve | `approval.approve` | Approve | Schváliť |
| `leaves-approval.component.html:27` | Reject | `approval.reject` | Reject | Zamietnuť |
| `angular/src/app/leaves/summary/summary.component.html:5` | `Type: {type}` | `summary.type` | Type: {{type}} | Typ: {{type}} |
| `summary.component.html:6` | `Count: {n}` | `summary.count` | Count: {{count}} | Počet: {{count}} |
| – (new, SUM-01) | – | `summary.title` | Leave summary | Prehľad neprítomností |
| – (new, SUM-01) | – | `summary.tableType` | Type | Typ |
| – (new, SUM-01) | – | `summary.tableWorkDays` | Work days | Pracovné dni |
| – (new, SUM-01) | – | `summary.emptyYear` | No approved leaves in this year. | V tomto roku nemáte žiadne schválené neprítomnosti. |
| – (new, SUM-01) | – | `summary.empty` | You have no approved leaves yet. | Zatiaľ nemáte žiadne schválené neprítomnosti. |
| – (new, SUM-01) | – | `summary.loadError` | Could not load the summary. Try again. | Prehľad sa nepodarilo načítať. Skúste to znova. |

User administration and profile:

| old file:line | old text | key | EN (new) | SK (proposed) |
|---|---|---|---|---|
| `src/containers/users/UserList.js:17` | Users | `users.list.title` | Users | Používatelia |
| `UserList.js:21` | Email | `users.list.email` | Email | E-mail |
| `UserList.js:22` | Name (`surname, firstName[, degrees]`, `:31`) | `users.list.name` | Name | Meno |
| `UserList.js:23` | Is admin | `users.list.admin` | Admin (USR-01) | Administrátor |
| `UserList.js:24` | Is approved | dropped (auto-approval) | – | – |
| – (new, USR-01) | – | `users.list.status` | Status | Stav |
| `UserList.js:25` | Controls | `users.list.actions` | Actions (USR-01) | Akcie |
| `UserList.js:36` | Remove | replaced by `users.list.deactivate` (soft delete) | Deactivate | Deaktivovať |
| `UserList.js:37` | Edit | `users.list.edit` | Edit | Upraviť |
| – (new, USR-01) | – | `users.list.editUser` (aria-label of Edit) | Edit {{name}} | Upraviť {{name}} |
| – (new, USR-04) | – | `users.list.deactivateUser` (aria-label of Deactivate) | Deactivate {{name}} | Deaktivovať {{name}} |
| – (new, NFR-07) | – | `users.list.exportUser` (aria-label of Export data) | Export data of {{name}} | Exportovať údaje {{name}} |
| – (new, USR-04) | – | `users.deactivate.title` | Deactivate user? | Deaktivovať používateľa? |
| – (new, USR-04) | – | `users.deactivate.body` | {{user}} will lose access immediately. Their leaves stay in the system. | {{user}} okamžite stratí prístup. Jeho neprítomnosti zostanú v systéme. |
| – (new, USR-04) | – | `users.deactivate.confirm` | Deactivate | Deaktivovať |
| – (new, USR-04) | – | `users.deactivate.success` | User deactivated. | Používateľ bol deaktivovaný. |
| – (new, USR-01) | – | `users.list.empty` | No users. | Žiadni používatelia. |
| – (new, USR-01) | – | `users.status.active` / `users.status.deactivated` | Active / Deactivated | Aktívny / Deaktivovaný |
| `UserList.js:38` | Approve | dropped | – | – |
| `src/containers/users/UserForm.js:29` | Email: | `users.edit.email` | Email: | E-mail: |
| `UserForm.js:30` | First name: | `users.edit.firstName` | First name: | Meno: |
| `UserForm.js:31` | Surname: | `users.edit.surname` | Surname: | Priezvisko: |
| `UserForm.js:32-34` | Degrees: / Address: / Is approved: | dropped | – | – |
| `UserForm.js:35` | Is admin: | `users.edit.isAdmin` | Is admin: | Administrátor: |
| `src/containers/users/EditUserForm.js:11` | (empty page header) | `users.edit.title` (new) | Edit user | Upraviť používateľa |
| `EditUserForm.js:53` | Error while fetching the user: {msg} | `users.edit.loadError` | Error while fetching the user: {{message}} | Chyba pri načítaní používateľa: {{message}} |
| – (new, USR-02) | – | `users.edit.status` | Status: | Stav: |
| – (new, USR-02) | – | `users.edit.saved` | User saved. | Používateľ bol uložený. |
| – (new, USR-02) | – | `users.edit.backToUsers` | Back to users | Späť na používateľov |
| – (NFR-07) | – | `users.list.exportData` / `users.list.exporting` | Export data / Exporting… | Exportovať údaje / Exportuje sa… |
| – (NFR-08) | – | `users.anonymize.action` | Anonymize | Anonymizovať |
| – (NFR-08) | – | `users.anonymize.title` | Anonymize user | Anonymizovať používateľa |
| – (NFR-08) | – | `users.anonymize.body` | This permanently replaces the name and email of {{email}} with placeholders, deactivates the account and signs it out. Leaves stay in the system under the placeholder name. This cannot be undone. | Týmto natrvalo nahradíte meno a e-mail používateľa {{email}} zástupnými hodnotami, deaktivujete účet a odhlásite ho. Neprítomnosti zostanú v systéme pod zástupným menom. Túto akciu nie je možné vrátiť. |
| – (NFR-08) | – | `users.anonymize.selfWarning` | You are anonymizing your own account. You will be signed out. | Anonymizujete vlastný účet. Budete odhlásený. |
| – (NFR-08) | – | `users.anonymize.confirmLabel` | Type the user's email to confirm | Pre potvrdenie zadajte e-mail používateľa |
| – (NFR-08) | – | `users.anonymize.submitting` | Anonymizing… | Anonymizuje sa… |
| – (NFR-08) | – | `users.anonymize.success` | User anonymized. | Používateľ bol anonymizovaný. |
| – (NFR-08) | – | `users.status.anonymized` | Anonymized | Anonymizovaný |
| – (new, USR-02/USR-03) | – | `validation.firstNameRequired` | First name is required. | Meno je povinné. |
| – (new, USR-02/USR-03) | – | `validation.surnameRequired` | Surname is required. | Priezvisko je povinné. |
| – (new, USR-02/USR-03) | – | `validation.maxLength` | Maximum {{max}} characters. | Maximálne {{max}} znakov. |
| – (new, USR-03) | – | `profile.title` | My profile | Môj profil |
| – (new, USR-03) | – | `profile.email` | Email | E-mail |
| – (new, USR-03) | – | `profile.firstName` | First name | Meno |
| – (new, USR-03) | – | `profile.surname` | Surname | Priezvisko |
| – (new, USR-03) | – | `profile.isAdmin` | Admin | Administrátor |
| – (new, USR-03) | – | `profile.saved` | Profile saved. | Profil bol uložený. |

Audit log screen (NFR-06, new):

| key | EN | SK (proposed) |
|---|---|---|
| `audit.title` | Audit log | Auditný záznam |
| `audit.filter.actor` | Actor | Používateľ |
| `audit.filter.all` | All | Všetko |
| `audit.filter.targetType` | Target type | Typ objektu |
| `audit.filter.targetId` | Target ID | ID objektu |
| `audit.filter.action` | Action | Akcia |
| `audit.filter.from` | From | Od |
| `audit.filter.to` | To | Do |
| `audit.filter.apply` | Apply | Použiť |
| `audit.actor.cli` | CLI | CLI |
| `audit.targetType.LEAVE` | Leave | Neprítomnosť |
| `audit.targetType.USER` | User | Používateľ |
| `audit.table.time` | Time | Čas |
| `audit.table.actor` | Actor | Používateľ |
| `audit.table.action` | Action | Akcia |
| `audit.table.target` | Target | Objekt |
| `audit.table.details` | Details | Podrobnosti |
| `audit.action.LEAVE_CREATED` | Leave created | Neprítomnosť vytvorená |
| `audit.action.LEAVE_APPROVED` | Leave approved | Neprítomnosť schválená |
| `audit.action.LEAVE_REJECTED` | Leave rejected | Neprítomnosť zamietnutá |
| `audit.action.LEAVE_DELETED` | Leave deleted | Neprítomnosť vymazaná |
| `audit.action.USER_REGISTERED` | User registered | Používateľ zaregistrovaný |
| `audit.action.USER_UPDATED` | User updated | Používateľ upravený |
| `audit.action.USER_ROLE_CHANGED` | Role changed | Zmena roly |
| `audit.action.USER_DEACTIVATED` | User deactivated | Používateľ deaktivovaný |
| `audit.action.USER_ANONYMIZED` | User anonymized | Používateľ anonymizovaný |
| `audit.action.USER_DATA_EXPORTED` | User data exported | Export údajov používateľa |
| `audit.empty` | No audit entries match the filter. | Filtru nezodpovedajú žiadne záznamy. |
| `audit.pagination.prev` | Previous | Predchádzajúca |
| `audit.pagination.next` | Next | Nasledujúca |
| `audit.pagination.pageOf` | Page {{page}} of {{pages}} | Strana {{page}} z {{pages}} |

Leave types and states (shared enum codes from `src/data/LeaveType.js:3-8`, `src/data/LeaveState.js:9-11`):

| key | old label | EN (new) | SK (proposed) |
|---|---|---|---|
| `leaveType.ANNUAL` | ANNUAL | Annual leave | Dovolenka |
| `leaveType.SICKNESS` | SICKNESS | Sick leave | PN (práceneschopnosť) |
| `leaveType.DOCTOR` | Doctor visit | Doctor visit | Návšteva lekára |
| `leaveType.MATERNITY` | MATERNITY | Maternity leave | Materská dovolenka |
| `leaveType.PARENTAL` | PARENTAL | Parental leave | Rodičovská dovolenka |
| `leaveType.CARING` | Caring for a relative at home | Caring for a relative at home | Ošetrovanie člena rodiny (OČR) |
| `leaveState.PENDING` | PENDING | Pending | Čaká na schválenie |
| `leaveState.APPROVED` | APPROVED | Approved | Schválená |
| `leaveState.REJECTED` | REJECTED | Rejected | Zamietnutá |

Error codes: the full shared `ErrorCode` list from the canonical registry. Every code has a key in both catalogs.

| key | HTTP | EN | SK (proposed) |
|---|---|---|---|
| `errors.VALIDATION_FAILED` | 400 | Some values are not valid. | Niektoré hodnoty nie sú platné. |
| `errors.LEAVE_END_BEFORE_START` | 400 | Start date must not be greater than end date | Dátum začiatku nesmie byť neskôr ako dátum konca |
| `errors.LEAVE_HALF_DAY_MULTIPLE_DAYS` | 400 | Half day option is allowed only within single day | Poldeň je povolený len pre jeden deň |
| `errors.LEAVE_TOO_LONG` | 400 | Leave must be shorter than 2 years | Neprítomnosť musí byť kratšia ako 2 roky |
| `errors.CONFIRM_EMAIL_MISMATCH` | 400 | The email does not match. | E-mail sa nezhoduje. |
| `errors.AUDIT_RANGE_INVALID` | 400 | The start of the date range must not be after its end. | Začiatok obdobia nesmie byť po jeho konci. |
| `errors.AUTH_REQUIRED` | 401 | Please log in. | Prihláste sa. |
| `errors.ACCESS_TOKEN_INVALID` | 401 | Your session is not valid. Log in again. | Vaša relácia nie je platná. Prihláste sa znova. |
| `errors.ACCESS_TOKEN_EXPIRED` | 401 | Your session has expired. Log in again. | Vaša relácia vypršala. Prihláste sa znova. |
| `errors.REFRESH_TOKEN_MISSING` | 401 | Your session has expired. Log in again. | Vaša relácia vypršala. Prihláste sa znova. |
| `errors.REFRESH_TOKEN_INVALID` | 401 | Your session has expired. Log in again. | Vaša relácia vypršala. Prihláste sa znova. |
| `errors.REFRESH_TOKEN_EXPIRED` | 401 | Your session has expired. Log in again. | Vaša relácia vypršala. Prihláste sa znova. |
| `errors.REFRESH_TOKEN_REUSED` | 401 | Your session was ended for security reasons. Log in again. | Vaša relácia bola z bezpečnostných dôvodov ukončená. Prihláste sa znova. |
| `errors.LOGIN_FAILED` | 401 / 409 | Login failed. Try again later. | Prihlásenie zlyhalo. Skúste to neskôr. |
| `errors.USER_DEACTIVATED` | 401 / 403 | Your account has been deactivated. Contact an administrator. | Váš účet bol deaktivovaný. Kontaktujte administrátora. |
| `errors.FORBIDDEN` | 403 | You are not authorized to do this. | Na túto akciu nemáte oprávnenie. |
| `errors.FIELD_NOT_EDITABLE` | 403 | This field cannot be changed. | Toto pole nie je možné zmeniť. |
| `errors.PAYLOAD_TOO_LARGE` | 403 | Request body is too large. | Požiadavka je príliš veľká. (proposal for client review) |
| `errors.WRONG_DOMAIN` | 403 | Used email does not belong to given hosted domain. | Použitý e-mail nepatrí do povolenej domény. |
| `errors.NOT_FOUND` | 404 | Not found. | Nenašlo sa. |
| `errors.USER_NOT_FOUND` | 404 | User not found. | Používateľ sa nenašiel. |
| `errors.LEAVE_NOT_FOUND` | 404 | Leave not found. | Neprítomnosť sa nenašla. |
| `errors.METHOD_NOT_ALLOWED` | 405 | Method not allowed. | Metóda nie je povolená. (`HEAD` on the NFR-07 export, `(user decision 2026-11-11)`) |
| `errors.USER_ALREADY_DEACTIVATED` | 409 | This user is already deactivated. | Tento používateľ je už deaktivovaný. |
| `errors.USER_ALREADY_ANONYMIZED` | 409 | This user is already anonymized. | Tento používateľ je už anonymizovaný. |
| `errors.USER_ANONYMIZED` | 409 | This user is anonymized and cannot be changed. | Tento používateľ je anonymizovaný a nedá sa zmeniť. |
| `errors.SSO_EMPLOYEE_ACTIVE` | 409 | This user is still listed as an employee in the company directory. Remove them there first. | Tento používateľ je stále vedený ako zamestnanec vo firemnom adresári. Najprv ho odstráňte tam. |
| `errors.INTERNAL_ERROR` | 500 | Something went wrong. Try again later. | Niečo sa pokazilo. Skúste to neskôr. |
| `errors.SSO_UNAVAILABLE` | 503 | The company directory is not reachable. Try again later. | Firemný adresár nie je dostupný. Skúste to neskôr. |
| `errors.UNKNOWN` | client | Something went wrong. Try again later. | Niečo sa pokazilo. Skúste to neskôr. |
| `errors.NETWORK_ERROR` | client | Cannot reach the server. Check your connection. | Server nie je dostupný. Skontrolujte pripojenie. |

New strings from other screen tasks (empty/loading/error states, delete/deactivate confirmations) are added to both catalogs by the owning task, with SK texts that go into the same client review.

**Delivery**: before the first release, send the SK catalog (`sk.json`, exported as a two-column EN/SK table) to the client for review. Apply the corrections as catalog-only changes. The parity tests below keep both catalogs complete.

**Acceptance criteria**:
- Given a fresh browser (empty localStorage), when the app loads, then all text is English and `<html lang="en">`.
- Given the user selects "Slovenčina", then all visible text switches to Slovak without a reload, and the route and unsaved form values stay.
- Given SK is selected, when the page reloads, then the UI is Slovak, and localStorage `lang` is `sk`.
- Given localStorage `lang=de` or access throws, then the UI is English.
- Given SK, then leave ranges render `4. 11. 2026 - 6. 11. 2026`, 2.5 days renders `2,5`, the month filter lists `január`…`december`, and the calendar shows "Dnes" with Monday first.
- Given EN, then leave ranges render `Nov 4, 2026 - Nov 6, 2026`, matching the old Angular output.
- Given the API returns `{ code: "CONFIRM_EMAIL_MISMATCH" }`, then the UI shows the text of `errors.CONFIRM_EMAIL_MISMATCH` in the active language.
- Given an unknown code, then `errors.UNKNOWN` is shown.
- Leave types render readable labels in both languages; no raw code appears anywhere. The calendar letter = first letter of the type code, same in SK and EN (old app, LST-03) (user decision 2026-11-11).
- The language switch is available on `/login` before authentication.

**Tests**:
- Unit (Vitest):
  - catalog parity: flatten `en.json` and `sk.json`; the key sets must be equal, apart from plural suffix differences per language rules;
  - no empty string values; interpolation variables are the same set per key;
  - every `LeaveType`, `LeaveState` and `ErrorCode` value from `packages/shared` has `leaveType.*`, `leaveState.*` and `errors.*` keys in both catalogs;
  - date and number formatters per locale (examples above);
  - localStorage persistence helper with a throwing storage;
  - plural selection: EN 1 → "work day", 2.5 → "work days"; SK 1, 2, 2.5, 5 → `_one`, `_few`, `_many`, `_other`.
- Lint: `i18next/no-literal-string` passes in CI.
- E2E (Playwright):
  - default EN on a new context;
  - switch to SK on `/login`, log in, see SK nav;
  - reload keeps SK;
  - the calendar toolbar shows "Dnes";
  - a server validation error shows the SK text.

### NFR-14 — Notification emails in English only

- **Type**: decision
- **Source**: `(rewrite spec: Non-functional requirements › Localization)` — "Notification emails in Slovak and English (input NFR: Localization; interview: Localization)"; overridden by `(client answer: Q-S10)` — "ENG is default language for UI and emails. Lets make emails only in ENG"
- **Depends on**: NOT-02, NOT-03

**Goal**: All notification emails are English only, whatever UI language the sender or recipient uses. The spec line about Slovak emails is overridden by the client answer and is not implemented.

**Old behavior**: Emails are English only and hard-coded. Subject `'New leave notification'` (`server/service/mailService.js:19`). Body "New leave was created and need to be approved.", "Requester:", "Days:", "Type:", "Approve" (`server/service/mailService.js:22-29`). Date format `dddd, MMM D, YYYY` in `DEFAULT_TIMEZONE` (`server/service/mailService.js:50-54`).

**Constraints**:
- No language field on User. No `Accept-Language` or UI-language input reaches the mail service.
- The email templates do not use the web translation catalogs (`apps/web/src/i18n`).
- Email dates use the date-fns `enUS` locale.
- The leave type in emails uses one English label source. That is the same EN wording as `leaveType.*` in NFR-13, exported from `packages/shared` so both stay equal. The NOT-02 and NOT-03 templates import it from there.

**Acceptance criteria**:
- Given the UI language is SK, when a user creates a leave, then the email captured by Mailpit has an English subject and body.
- Given an admin with UI language SK approves or rejects a leave, then the requester's email is English.
- The mail service API has no locale parameter.

**Tests**:
- Unit: email template functions have no locale argument (typecheck); snapshot of each template's subject and body in English with an `enUS` date.
- Integration: create leave with the SPA language set to SK (`lang` is client-only, so the request is identical). Mailpit receives an English email.
- E2E: Playwright with UI in SK creates a leave; the Mailpit API shows the English subject.

## Project setup (derived) (SET)

### SET-01 — Monorepo and tooling

- **Type**: derived
- **Source**: derived; needed by all tasks. Client note `(client answers: Other notes)` — "Use `pnpm` as a package manager"; "Use latest `node` version"
- **Depends on**: —

**Goal**: A pnpm workspace monorepo with `apps/api`, `apps/web`, `packages/shared`, a shared TypeScript base config and uniform root scripts, so every later task has one place to build, test and lint.

**Old behavior**: Two separate yarn projects: root (React SPA + server, `package.json:1-72`, `yarn.lock`) and `angular/` (`angular/package.json:1-80`), built separately (`bin/build.sh:1-6`, `Dockerfile:9-27`); server reuses client code from `src/data` (`Dockerfile:36-37`, `server/db/schema.js:2-5`). Node 8 (`README.md:15`, `bin/test.sh:6`).

**Constraints**: pnpm, Node 24 LTS, TypeScript strict (brief; NFR-10, NFR-12). `packages/shared` replaces the old `src/data` sharing pattern.

**Business rules** (layout):
- `pnpm-workspace.yaml`: `apps/*`, `packages/*`.
- Packages: `@leaves/api` (`apps/api`), `@leaves/web` (`apps/web`), `@leaves/shared` (`packages/shared`; built with `tsc` to ESM + `.d.ts`, consumed via `workspace:*`; exports `enums`, `workdays`, `filters`, `dto`).
- Root files: `.nvmrc` (`24`), `package.json` (`private: true`, `packageManager: pnpm@<exact>`, `engines.node: >=24 <25`), `tsconfig.base.json`, `eslint.config.mjs`, `.prettierrc`, `.prettierignore`, `.editorconfig`, `.gitignore`, `.env.example`, `docker-compose.yml`, `Dockerfile`, `.husky/`, `commitlint.config.mjs`, `release-please-config.json`, `.release-please-manifest.json`, `.github/`.
- Root scripts (each delegates with `pnpm -r` / `--filter`):
  - `dev`: runs api (`nest start --watch`, port 4100) and web (`vite`, port 5173, proxy `/api` and `/health-check` to 4100) in parallel; shared in `tsc --watch`.
  - `build`: shared → api → web.
  - `test`: `test:unit` + `test:integration`.
  - `test:unit`: Vitest unit projects in all packages.
  - `test:integration`: api integration tests (TST-02).
  - `e2e`: Playwright (TST-03).
  - `lint`, `format`, `format:check`, `typecheck` (NFR-10).
  - `migrate:legacy` (MIG-01, api filter), `openapi:generate` (DOC-02).
- Vitest workspace file `vitest.workspace.ts` lists projects `shared`, `api-unit`, `api-integration`, `web`.

**Acceptance criteria**:
- Given a fresh clone and Node 24, when `corepack enable && pnpm install --frozen-lockfile`, then install succeeds and hooks are installed.
- Given `pnpm build`, then `packages/shared/dist`, `apps/api/dist`, `apps/web/dist` exist.
- Given Node 22 is active, when `pnpm install`, then it fails due to `engines` (`engine-strict=true` in `.npmrc`).
- Given web or api imports `@leaves/shared`, then types resolve in `pnpm typecheck` without building first (TS project references or `paths` to source).

**Tests**: CI jobs (NFR-09) exercising each script; a unit test in each package proves the Vitest project runs.

### SET-02 — API foundation

- **Type**: derived
- **Source**: derived; needed by all API tasks (AUTH-*, DATA-01, DATA-02, leave, user, attendance, NFR-06, OPS-01, DOC-02)
- **Depends on**: SET-01

**Goal**: A NestJS app skeleton with validated configuration, Mongoose connection, global validation and error handling that produce the brief's error body, OpenAPI setup, static SPA serving, CORS policy and structured logging. Feature tasks add modules into it.

**Old behavior**: Express app in `server/index.js:1-72`: port 4100 hardcoded (`:24`), CORS open to all (`:37`), GraphQL with GraphiQL (`:40-45`), `/download` static (`:34`), React build at `/` and Angular at `/leaves/` with index fallbacks (`:53-63`). Config read ad hoc from `process.env` across files (`server/db/connect.js:7`, `server/graphql/userRelated.js:10-12`, `server/service/mailService.js:6-15,33,51`, `server/service/urlService.js:1-7`, `server/api/attendenceApi.js:8-10`, `server/service/attendenceService.js:9,119`). JWT key read from `secrets/key.pem` (`server/auth/operations.js:6`). No validation of env.

**Constraints**: CORS restricted to same origin / `BASE_URL` `(client answer: Q-S6)`; API explorer off in production `(client answer: Q-S6)`; error body and status codes per brief; attendance keeps its own contract (attendance task); `/download` not carried over (rewrite spec: Out of scope).

**Data model** (environment variables; validated with a zod (or class-validator) schema at startup; invalid/missing required → log every problem and exit with status 1 before connecting to DB):

| name | required in production | default (non-prod) | notes / old source |
|---|---|---|---|
| `NODE_ENV` | yes | `development` | `production` \| `development` \| `test`; old `server/service/urlService.js:4` |
| `PORT` | no | `4100` | old fixed 4100 `server/index.js:24` |
| `BASE_URL` | yes | `http://localhost:5173` | absolute links in emails, CORS origin; old `server/service/urlService.js:1` |
| `MONGO_URL` | yes | `mongodb://localhost:27017/cestaky` | old default `mongodb://localhost/data` `server/db/connect.js:7` |
| `HOSTED_DOMAIN` | yes | — (required everywhere) | old optional `server/graphql/userRelated.js:12,30`; now required (brief: `hd === HOSTED_DOMAIN`) |
| `GOOGLE_CLIENT_ID` | yes | — | renamed from `CLIENT_ID` `server/graphql/userRelated.js:10` |
| `JWT_ACCESS_SECRET` | yes | — | ≥ 32 bytes; replaces `secrets/key.pem` `server/auth/operations.js:6`; TTL and refresh settings owned by AUTH-02 |
| `ACCESS_TOKEN_TTL_SECONDS` | no | `900` | integer > 0; AUTH-02 `(interview: Token TTL)` |
| `REFRESH_TOKEN_TTL_SECONDS` | no | `604800` | integer > 0; sliding, AUTH-02 `(interview: Token TTL)` |
| `AUTH_GOOGLE_VERIFIER` | no | `google` | `google` \| `fake`; `fake` rejected (exit 1) when `NODE_ENV=production` (TST-03) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD` | yes (all five) | Mailpit `localhost`, `1025`, `false`, unset user/password allowed in non-prod | old `server/service/mailService.js:6-15`: mail silently disabled when any of host/port/user/password unset; new: required in production, so mail never silently off |
| `MAIL_SENDER` | yes | `leaves@localhost` | old `server/service/mailService.js:33` |
| `APPROVAL_MAIL_RECEIVER` | yes | `approver@localhost` | old `server/service/mailService.js:19` |
| `DEFAULT_TIMEZONE` | no | `Europe/Bratislava` | IANA name validated; old `server/service/mailService.js:51`, `server/service/attendenceService.js:119` |
| `M2M_USERNAME`, `M2M_PASSWORD` | yes | — (attendance returns 401 when unset, as old `server/api/attendenceApi.js:8`) | |
| `SSO_URI`, `SSO_USERNAME`, `SSO_PASSWORD` | yes | — | old `server/service/attendenceService.js:9` |
| `TOGGL_REPORTS_BASE_URL` | no | `https://api.track.toggl.com/reports/api/v3` | old hardcoded constant `server/service/attendenceService.js:7`; overridable for contract mocks |
| `LOG_LEVEL` | no | `info` (`debug` in development) | `fatal`…`trace` |
| `APP_VERSION` | no | `0.0.0-dev` | set at image build (NFR-11) |
| `LEGACY_MONGO_URL` | only for `migrate:legacy` | — | MIG-01 |

This is the complete API list. Not used: `CLIENT_ID` (renamed), `VITE_GOOGLE_CLIENT_ID`, `VITE_HOSTED_DOMAIN`, `JWT_ACCESS_TTL`, `REFRESH_TOKEN_TTL`. Test-only: `MONGO_TEST_URL` (TST-02), `E2E_MONGO_URL`, `MAILPIT_API_URL`, `E2E_BASE_URL` (TST-03). k8s Mongo only: `MONGO_INITDB_ROOT_USERNAME`, `MONGO_INITDB_ROOT_PASSWORD`, `MONGO_APP_USERNAME`, `MONGO_APP_PASSWORD` (OPS-03).

The web app has no env vars; it reads `GOOGLE_CLIENT_ID` and `HOSTED_DOMAIN` via `GET /api/auth/config` (AUTH-01).

**API** (cross-cutting):
- Global prefix: none; controllers declare `/api/...`; `/health-check` outside `/api` (OPS-01).
- `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })`. Validation failure → 400 `{ "statusCode": 400, "code": "VALIDATION_FAILED", "message": "<first constraint message in English>" }` unless a feature task maps a specific `code` (e.g. `LEAVE_END_BEFORE_START`) via a custom validator that carries the code.
- Global exception filter for `/api/**` except attendance (old contract, ATT-01) and `/health-check` (OPS-01): `AppException(statusCode, code, message)` → body as is; `code` is always a value of the shared `ErrorCode` enum (`packages/shared`). Bare Nest `HttpException` (no app code) → 400 `VALIDATION_FAILED` (incl. malformed JSON body), 401 `AUTH_REQUIRED`, 403 `FORBIDDEN`, 404 `NOT_FOUND`; any other status or unknown error → 500 `{ "statusCode": 500, "code": "INTERNAL_ERROR", "message": "Internal server error" }` (stack logged, never returned). 409 responses come only from feature tasks with their specific codes; an unmapped Mongo duplicate key (11000) is a 500 `INTERNAL_ERROR`.
- JSON body limit 100 KB: a larger request body → 403 `{ "statusCode": 403, "code": "PAYLOAD_TOO_LARGE", "message": "Request body is too large" }` `(user decision 2026-11-09)`.
- Unknown `/api/**` route → 404 `NOT_FOUND`, message `Route not found`.
- Static SPA: `@nestjs/serve-static` serves `/opt/app/public` (dev: not served, Vite instead) at `/`, excludes `/api/(.*)` and `/health-check`; any other `GET` with `Accept: text/html` that doesn't match a file → `index.html`. Hashed assets `Cache-Control: public, max-age=31536000, immutable`; `index.html` `no-cache`.
- CORS: production → only origin `BASE_URL` allowed, `credentials: true`; development → `http://localhost:5173`; otherwise no CORS headers.
- OpenAPI: DOC-02.
- Logging: `nestjs-pino`; JSON lines in production, pretty in development; per request: method, path (no query), status, duration ms, `userId` if authenticated, request id (`x-request-id` header or generated). Redact `authorization`, `cookie`, `set-cookie`, any field named `password`, `token`, `idToken`. Startup logs version and `NODE_ENV`.
- Mongoose: `MongooseModule.forRootAsync` with `MONGO_URL`, `autoIndex: true` outside production, `syncIndexes()` at startup in production; fail-fast rules OPS-01.
- Graceful shutdown: OPS-01.

**Acceptance criteria**:
- Given `NODE_ENV=production` and `GOOGLE_CLIENT_ID` missing, then the process exits with status 1 and logs `Invalid configuration: GOOGLE_CLIENT_ID is required`.
- Given `CLIENT_ID` set but `GOOGLE_CLIENT_ID` not, then startup fails with the same message (no silent fallback to the old name).
- Given a request body with an unknown property, then 400 `VALIDATION_FAILED`.
- Given a JSON request body larger than 100 KB, then 403 `PAYLOAD_TOO_LARGE`.
- Given a handler throws an unexpected error, then 500 with `INTERNAL_ERROR` body and no stack trace in the response.
- Given `GET /api/nope`, then 404 `NOT_FOUND`.
- Given `GET /leaves/new` in production, then `index.html` is returned with 200.
- Given a request with `Origin: https://evil.example`, then no `Access-Control-Allow-Origin` header.
- Given a logged request with `Authorization`, then the log line contains `[Redacted]`, not the token.

**Tests**:
- unit: config schema (each required var, defaults, `AUTH_GOOGLE_VERIFIER=fake` + production rejected, invalid timezone rejected); exception filter mapping table.
- integration: 404 JSON for unknown API route; SPA fallback; CORS allow/deny; validation 400; 500 body shape; log redaction (capture pino destination).

### SET-03 — Web foundation

- **Type**: derived
- **Source**: derived; needed by all screen tasks
- **Depends on**: SET-01

**Goal**: A Vite React 19 SPA skeleton with Tailwind, React Router routes from the brief, TanStack Query, a typed API client that adds the bearer token and refreshes once on 401, i18n infrastructure (EN default, SK), and the authenticated layout with navigation.

**Old behavior**: Two SPAs. Angular nav: "Trips" link to React app, "Leaves" (`/list`), "Export", "Leaves approval" with red badge of pending count for admins, user dropdown with full name → "Summary", "Logout" (`angular/src/app/nav-header/nav-header.component.html:9-38`). Angular routes `approval`, `list/add`, `list`, `export`, `summary`, default `/list` (`angular/src/app/app-routing.module.ts:10-21`). React app hosts users/profile pages (`src/containers/auth/MenuBar.js`). Token kept in localStorage (analysis §2.1 Auth).

**Constraints**: Routes: `/login`, `/leaves` (default), `/leaves/new`, `/approval` (admin), `/summary`, `/users` (admin), `/users/:id/edit` (admin), `/audit` (admin, `(interview: Audit UI)`), `/profile`; unknown → `/leaves`. "Trips" and "Export" links dropped (rewrite spec: Out of scope). Access token in memory only, refresh via HttpOnly cookie (brief Auth). UI default EN, choice persisted in localStorage `(client answer: Q-S10)`.

**Screens** (shell):
- Router: `createBrowserRouter`; public route `/login`; all others under `<RequireAuth>` (on app start calls `POST /api/auth/refresh`; while pending shows a full-page spinner; on 401 → `/login?returnTo=<path>`); admin routes under `<RequireAdmin>` (non-admin → redirect `/leaves`; server still enforces). `*` → `<Navigate to="/leaves" replace>`; `/` → `/leaves`.
- Layout (authenticated): top nav with app name "Leaves" (links to `/leaves`), links: "Leaves" `/leaves`, "Summary" `/summary`, "Approval" `/approval` + badge with count of PENDING leaves (admin only; hidden when 0; data from `GET /api/leaves?state=PENDING` (LST-01), refetched on window focus and after approve/reject), "Users" `/users` (admin only), "Audit log" `/audit` (admin only, NFR-06, `(interview: Audit UI)`). Right side: user menu labelled with `firstName surname`: "Profile" (`/profile`), language switch "English" / "Slovenčina" (current marked), "Logout" (calls `POST /api/auth/logout`, clears memory token and query cache, goes to `/login`). Responsive: collapsible menu below `md` breakpoint. Footer shows `vX.Y.Z` (NFR-11).
- Global error boundary page: "Something went wrong" + "Reload" button.
- Toast area for mutation errors: message = translation of `code` (`errors.<CODE>` key), fallback to server `message`.

**API** (client):
- `apiClient` (fetch wrapper): base path `/api`; JSON; `credentials: 'same-origin'`; adds `Authorization: Bearer <access token>` when present. On 401 from any call except `/api/auth/*`: performs one `POST /api/auth/refresh` (single-flight: concurrent 401s share one refresh), retries the original request once; if refresh fails → clear session, redirect `/login`. Non-2xx → throws `ApiError { statusCode, code, message }` parsed from the error body (unparseable body → `code: 'UNKNOWN'`; fetch rejected → `code: 'NETWORK_ERROR'`). Refresh is attempted only for 401 `ACCESS_TOKEN_EXPIRED`, `ACCESS_TOKEN_INVALID` or `AUTH_REQUIRED`; 401 `USER_DEACTIVATED` clears the session and goes to `/login`, which shows the deactivated message.
- React Query: `QueryClient` defaults `staleTime: 30_000`, `retry: 1` for queries (no retry on 4xx), `retry: 0` for mutations, `refetchOnWindowFocus: true`.
- i18n: `i18next` + `react-i18next`; resources `apps/web/src/i18n/en.json`, `sk.json`; language from localStorage key `lang` (`en`|`sk`), default `en`; `<html lang>` updated; dates formatted with date-fns locale `enGB`/`sk`. A unit test checks both files have identical key sets.
- Runtime config, no build-time env: at boot the SPA calls `GET /api/auth/config` → `{ "googleClientId": string, "hostedDomain": string }` (AUTH-01) before rendering routes; cached for the session (React Query `staleTime: Infinity`). `googleClientId` initializes Google Identity Services; `hostedDomain` is passed as the `hd` hint (the server check is authoritative). While loading: full-page spinner. On failure: full-page error "Cannot load application configuration." with a "Retry" button. One image serves every environment.
- Dev server: Vite port 5173, proxy `/api` and `/health-check` → `http://localhost:4100`.

**Acceptance criteria**:
- Given no refresh cookie, when opening `/summary`, then redirect to `/login?returnTo=%2Fsummary`, and after login → `/summary`.
- Given a valid refresh cookie, when reloading `/leaves`, then the page loads without showing the login page.
- Given an access token expired, when a query returns 401, then exactly one refresh call happens and the query is retried and succeeds.
- Given refresh returns 401, then the user lands on `/login`.
- Given a non-admin, then "Approval" and "Users" links are not shown, and opening `/users` redirects to `/leaves`.
- Given language switched to SK, when reloading, then UI is SK.
- Given `GET /api/auth/config` fails, then the error page with "Retry" is shown, and Retry reloads the config.
- Given `/whatever`, then redirect to `/leaves`.

**Tests**:
- unit (Vitest + Testing Library + MSW): config bootstrap (loading, success, failure + retry); apiClient refresh single-flight, retry once, error parsing; route guards; nav visibility by role; badge hidden at 0; language persistence; i18n key parity.
- e2e (TST-03): reload keeps session; non-admin cannot see admin links.

### SET-04 — Local development environment

- **Type**: derived
- **Source**: derived; `(rewrite spec: User decisions › Environments)` — "No staging environment; testing relies on local docker-compose and CI"; `(rewrite spec: User decisions › Integration testability)` — "Local mail catcher for SMTP in dev and tests"
- **Depends on**: SET-01, SET-02

**Goal**: One root `docker-compose.yml` starts MongoDB 8 and Mailpit for local development and tests, optionally the whole app as in production. `.env.example` lists every variable with dev-safe values.

**Old behavior**: `db/docker-compose.yml:1-13`: `mongo:3.6`, container `mongodb`, port 27017, no auth, no volume (commented out), `--smallfiles` flag (removed in later MongoDB versions). No mail catcher; mail is skipped when SMTP vars are unset (`server/service/mailService.js:6`). README describes this flow (`README.md:39-47`).

**Constraints**: MongoDB major 8 everywhere (NFR-12). No real secrets in `.env.example`.

**Business rules**:
- Services:
  - `mongo`: `mongo:8.0`, port `27017:27017`, named volume `mongo-data`, no auth (local only), single-member replica set like production `(interview: Infra)`: `command: ["--replSet", "rs0", "--bind_ip_all"]`; the healthcheck initiates it idempotently: `mongosh --quiet --eval "try { rs.status().ok } catch (e) { rs.initiate({ _id: 'rs0', members: [{ _id: 0, host: 'localhost:27017' }] }).ok }"` (interval 5 s). Clients use `directConnection=true`, so member host `localhost` works from the host and from other containers.
  - `mailpit`: `axllent/mailpit` (pinned tag), SMTP `1025:1025`, web UI/API `8025:8025`.
  - `app` (profile `full`): builds the root `Dockerfile`, env from `.env`, `MONGO_URL=mongodb://mongo:27017/cestaky?directConnection=true`, `SMTP_HOST=mailpit`, port `4100:4100`, depends on `mongo` healthy. Used to test the production image locally and by E2E in CI.
- `.env.example`: all SET-02 variables with dev values (`MONGO_URL=mongodb://localhost:27017/cestaky?directConnection=true`, `AUTH_GOOGLE_VERIFIER=google`, `SMTP_HOST=localhost`, `SMTP_PORT=1025`, `SMTP_SECURE=false`, placeholder `<your Google OAuth client id>` for `GOOGLE_CLIENT_ID`, `M2M_USERNAME=m2m`, `M2M_PASSWORD=m2m-dev-only`, `JWT_ACCESS_SECRET=dev-only-change-me-32-bytes-minimum`, `SSO_URI=http://localhost:4010/api/meta/all` pointing to an optional local SSO/Toggl mock server (`pnpm --filter api mock:sso`) from the attendance contract fixtures; `TOGGL_REPORTS_BASE_URL=http://localhost:4010/toggl/reports/api/v3` on the same mock).
- Integration tests do not depend on this compose file (Testcontainers, TST-02); E2E in CI uses `--profile full` or the same services.

**Acceptance criteria**:
- Given Docker, when `docker compose up -d`, then MongoDB 8 is reachable on 27017 as PRIMARY of replica set `rs0` (transactions work) and Mailpit UI on `http://localhost:8025`.
- Given `pnpm dev` with `.env` from the example, when a leave is created, then the notification email appears in Mailpit.
- Given `docker compose --profile full up --build`, then `http://localhost:4100/health-check` returns 200.

**Tests**: CI e2e job uses this compose file (validates it); `docker compose config` in lint job.

## Shared entities (derived) (DATA)

### DATA-01 — User entity

- **Type**: derived
- **Source**: `(rewrite spec: User decisions › User administration)` — "Drop travel-only fields degrees and address"; "Soft delete users instead of hard delete"
- **Depends on**: SET-02
- **Needed by**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, USR-01, USR-02, USR-03, USR-04, NFR-01, NFR-03, NFR-06, NFR-07, NFR-08, DATA-02, MIG-01

**Goal**: Define the User document, its indexes, invariants and the shared DTOs used by API and web.

**Old behavior**:
- Fields `id` (unique), `email` (unique), `firstName`, `surname`, `degrees`, `address`, `isAdmin`, `approved` (`server/db/schema.js:39-62`); indexes on `id`, `email` (`schema.js:63-64`). `required` misspelled `reqired`, so nothing is enforced (`schema.js:42,47,56,60`). No timestamps, no defaults.
- `id` is the Google `sub` (`server/graphql/userRelated.js:50`).
- Hard delete via `removeUser` (`userRelated.js:81`); leaves of a removed user show a placeholder "Deleted <id>" / `<id>@deleted.instea.co` (`server/service/userService.js:3-18`, `server/graphql/leaveRelated.js:58-62`).

**Constraints**: brief Entities convention; degrees/address dropped; `approved` dropped (auto-approval); soft delete via `active` / `deactivatedAt`.

**Data model**: User (collection `users`):

| field | type | required | default | enum | validation | set by |
|---|---|---|---|---|---|---|
| id | string | yes | – | – | Google `sub`; unique; immutable | server at first login (AUTH-01); migration (MIG-01) |
| email | string | yes | – | – | lowercase, trimmed, valid email; unique; not editable via API | server from Google token |
| firstName | string | yes | `''` | – | trimmed; ≤ 100 chars; may be `''` only when Google gave none | AUTH-01, USR-02, USR-03 |
| surname | string | yes | `''` | – | trimmed; ≤ 100 chars; may be `''` only when Google gave none | AUTH-01, USR-02, USR-03 |
| isAdmin | boolean | yes | false | – | – | USR-02, AUTH-04 |
| active | boolean | yes | true | – | – | USR-04 (false); migration |
| deactivatedAt | Date \| null | yes | null | – | non-null iff `active=false` | USR-04; migration |
| anonymizedAt | Date \| null | yes | null | – | set only by NFR-08 | NFR-08 |
| createdAt | Date | yes | now | – | Mongoose timestamps | server |
| updatedAt | Date | yes | now | – | Mongoose timestamps | server |

- Indexes: `{ id: 1 }` unique; `{ email: 1 }` unique.
- Mongo `_id` is internal and never exposed.
- Schema `strict: 'throw'` for writes through the model so unknown fields (e.g. `approved`, `degrees`) are rejected.
- Users are never hard-deleted by the app.

Shared DTOs (`packages/shared`):
- `UserDto` = `{ id, email, firstName, surname, isAdmin, active, deactivatedAt: string|null, anonymizedAt: string|null, createdAt: string, updatedAt: string }` (dates ISO-8601).
- `UserRefDto` = `{ id, firstName, surname, active, anonymized: boolean }` — no email. Embedded as `requester` / `approver` in `LeaveDto` (owned by DATA-02). `anonymized` = `anonymizedAt != null`.
- Display name helper `formatUserName(u)` in `packages/shared`: `trim(firstName + " " + surname)`; deactivated users render as `First Surname (deactivated)`; a reference to a missing user renders as `Deleted <id>` (interview: UI defaults).
- Calendar colour helper `colorForUser(id)` in `packages/shared` = FNV-1a 32-bit hash of `User.id` mod 15 (interview: UI defaults). The old colour came from the requester email (`angular/src/app/leaves/leaves-calendar/leaves-calendar.component.ts:59`); colour by id is a defined change so `UserRefDto` needs no email.

**Business rules**:
- `active=false` ⇔ `deactivatedAt != null` (validated in a pre-save hook and in tests).
- Every `requesterId`/`approverId` should resolve to a real (possibly deactivated) user; migration creates deactivated users for orphans (MIG-01). The old placeholder `Deleted <id>` (`server/service/userService.js:3-18`) stays only as a defensive UI fallback via `formatUserName` (interview: UI defaults).

**Acceptance criteria**:
- Given an insert without `id` or `email`, then validation fails (old `reqired` bug fixed).
- Given two users with emails differing only in case, then the second insert fails on the unique index (emails are lowercased).
- Given an update with `degrees`, `address` or `approved`, then it is rejected.
- Given `active=false` with `deactivatedAt=null`, then validation fails.

**Tests**:
- Integration (real MongoDB): required fields; unique `id`/`email`; lowercase normalisation; strict unknown-field rejection; invariant hook; timestamps set; indexes exist (`listIndexes`).
- Unit: `formatUserName` (normal, deactivated suffix, missing user `Deleted <id>`); `colorForUser` deterministic and in 0–14; `UserRefDto` mapper has no `email`; DTO mapper hides `_id` and `__v`.

### DATA-02 — Leave entity, LeaveType / LeaveState enums and labels

- **Type**: derived
- **Source**: `(rewrite spec: Features by area › Leave requests)` — "Leave types: ANNUAL, SICKNESS, DOCTOR, MATERNITY, PARENTAL, CARING, shown with readable labels, not raw codes". Needed by: WD-01, LV-01, LV-02, LV-03, LST-*, APR-*, SUM-01, ATT-04, NOT-*, MIG-01.
- **Depends on**: DATA-01

**Goal**: Define the single Leave Mongoose model in `apps/api` and the `LeaveType` / `LeaveState` enums, their EN and SK labels and the `LeaveDto` API type in `packages/shared`. All other leave tasks read and write only through this model and these types. Dates are calendar dates (`YYYY-MM-DD` strings), so no timezone conversion happens on storage.

**Old behavior**:
- Mongoose `LeaveSchema` has `id`, `requesterId`, `approverId`, `startDate` (Date), `endDate` (Date), `state` (enum), `type` (enum), `isHalfDay` (Boolean), `numDays` (Number) (`server/db/schema.js:107-141`). Every `required` is misspelled `reqired`, so no field is required (`server/db/schema.js:110,114,118,122,126,131,136`). Index `{id: 1}` is not unique (`server/db/schema.js:141`). There are no timestamps.
- Type codes and labels: ANNUAL "ANNUAL", SICKNESS "SICKNESS", DOCTOR "Doctor visit", MATERNITY "MATERNITY", PARENTAL "PARENTAL", CARING "Caring for a relative at home" (`src/data/LeaveType.js:2-9`). The labels are never displayed: the server uses only `.code` (`server/db/schema.js:135`, `server/graphql/schema.js:62-64`). The Angular pipe prints the enum key, i.e. the raw code (`angular/src/app/pipes/translate-leave-type.pipe.ts:6-8`). The add form also shows raw codes (`angular/src/app/leaves/leaves-add/leaves-add.component.ts:94-98`).
- States PENDING, APPROVED, REJECTED, labels equal to codes (`src/data/LeaveState.js:1-14`). The Angular state pipe prints raw codes (`angular/src/app/pipes/translate-leave-state.pipe.ts:6-8`).
- Stored dates: the Angular form holds local-midnight `Date` objects (`angular/src/app/leaves/leaves-add/leaves-add.component.ts:28-32,88-92`). They are sent with `toISOString()` (`angular/src/app/services/leaves.service.ts:92-93`) and stored as `Date` (`src/data/Leave.js:32-35`, `src/data/dataUtil.js:5`). A leave on 2017-12-11 in Europe/Bratislava is therefore stored as `2017-12-10T23:00:00.000Z` (summer: `22:00Z`). MIG-01 must convert with `Europe/Bratislava`, not by taking the UTC date.
- **Analysis vs code:** analysis §2.2 mismatch 6 says "The server has `LeaveType` labels". The labels live in `src/data/LeaveType.js` (shared React/server folder) and no code path ever renders them.

**Constraints**:
- Field list and types are fixed by the shared conventions (shared conventions › Entities › Leave).
- Leave types are visible to all employees `(client answer: Q-S4)`.
- No retention / auto-purge `(interview: Retention)` (overrides client answer Q-S5).
- Hard delete stays (LV-03); the audit log keeps the history (NFR-06).

**Data model**:

Leave (collection `leaves`, `timestamps: true`)

| field | type | required | default | enum | validation | set by |
|---|---|---|---|---|---|---|
| id | string | yes | uuid v4 | – | uuid v4, unique | server (LV-01) |
| requesterId | string | yes | – | – | references `User.id` (DATA-01) | server = caller (LV-01) |
| approverId | string \| null | yes | null | – | references `User.id` | server, approve/reject (APR-*) |
| startDate | string | yes | – | – | `^\d{4}-\d{2}-\d{2}$` and a real calendar date | client input, validated by server |
| endDate | string | yes | – | – | same as startDate; `endDate >= startDate` (string compare is valid for this format) | client input, validated by server |
| isHalfDay | boolean | yes | false | – | `true` only when `startDate === endDate` | client input, validated by server |
| type | string | yes | `ANNUAL` | `ANNUAL, SICKNESS, DOCTOR, MATERNITY, PARENTAL, CARING` | enum | client input |
| state | string | yes | `PENDING` | `PENDING, APPROVED, REJECTED` | enum | server |
| numDays | number | yes | – | – | `>= 0`, multiple of 0.5; = `leaveWorkDays()` (WD-01) | server (LV-01, MIG-01) |
| createdAt | Date | yes | now | – | – | Mongoose |
| updatedAt | Date | yes | now | – | – | Mongoose |

Indexes:
- `{ id: 1 }` unique.
- `{ requesterId: 1, startDate: 1 }`: summary (SUM-01), attendance per user (ATT-*), GDPR export.
- `{ state: 1, startDate: 1 }`: `GET /api/leaves?state=PENDING` for `/approval` and the nav badge (LST-01, APR-02), attendance APPROVED filter.
- `{ startDate: 1, endDate: 1 }`: overlap queries (`startDate <= to && endDate >= from`) for list filters and attendance.

The Mongo `_id` and `__v` never leave the API.

`packages/shared` exports:
- `enum LeaveType { ANNUAL='ANNUAL', SICKNESS='SICKNESS', DOCTOR='DOCTOR', MATERNITY='MATERNITY', PARENTAL='PARENTAL', CARING='CARING' }` (string enum; the order above is the display order).
- `enum LeaveState { PENDING='PENDING', APPROVED='APPROVED', REJECTED='REJECTED' }`.
- `LEAVE_TYPES: LeaveType[]` and `LEAVE_STATES: LeaveState[]` in the order above.
- `type IsoDate = string` (`YYYY-MM-DD`).
- `LeaveDto` (the response shape of every leave endpoint):

```json
{
  "id": "7a1c…",
  "requester": { "id": "1098…", "firstName": "Jana", "surname": "Nová", "active": true, "anonymized": false },
  "approver": null,
  "startDate": "2026-11-09",
  "endDate": "2026-11-13",
  "isHalfDay": false,
  "type": "ANNUAL",
  "state": "PENDING",
  "numDays": 5,
  "createdAt": "2026-11-04T09:12:00.000Z",
  "updatedAt": "2026-11-04T09:12:00.000Z"
}
```

`requester` / `approver` are `UserRefDto { id, firstName, surname, active, anonymized }` (no email) or `null`. `approver` is `null` before the first approve / reject. The web formats names with the shared `formatUserName` helper: deactivated → `First Surname (deactivated)`, missing user → `Deleted <id>` `(interview: UI defaults)`.

Labels (web i18n keys `leaveType.<CODE>`, `leaveState.<CODE>`):

| code | EN | SK |
|---|---|---|
| ANNUAL | Annual leave | Dovolenka |
| SICKNESS | Sick leave | PN (práceneschopnosť) |
| DOCTOR | Doctor visit | Návšteva lekára |
| MATERNITY | Maternity leave | Materská dovolenka |
| PARENTAL | Parental leave | Rodičovská dovolenka |
| CARING | Caring for a relative at home | Ošetrovanie člena rodiny (OČR) |
| PENDING | Pending | Čaká na schválenie |
| APPROVED | Approved | Schválená |
| REJECTED | Rejected | Zamietnutá |

EN type labels are fixed `(interview: UI defaults)`; DOCTOR and CARING match `src/data/LeaveType.js:5,8`. EN state labels are new. All SK texts are proposals for client review; the SK catalog is owned by NFR-13.

**Business rules**:
- Type labels are UI-only. The API and DB always use codes.
- Emails are English only `(client answer: Q-S10)`; they use the EN label (NOT-*).

**Acceptance criteria**:
- Given a leave saved without `type`, then `type = ANNUAL`, `isHalfDay = false`, `approverId = null`.
- Given two inserts with the same `id`, then the second fails with a duplicate-key error.
- Given `state = "DONE"` or `type = "VACATION"`, then Mongoose validation fails.
- Given UI language EN, when a DOCTOR leave is shown, then the label is "Doctor visit", never "DOCTOR".
- Given UI language SK, then every type and state has a non-empty SK label (NFR-13 catalog).

**Tests**:
- Unit (shared): `LEAVE_TYPES` and `LEAVE_STATES` hold exactly the 6 / 3 codes in order; every code has an EN and SK translation key (test iterates the enums against both locale files).
- Integration (api, real MongoDB 8): required fields enforced; defaults; enum rejection; unique `id` index exists; all 4 indexes exist (`collection.indexes()`); `toDto()` drops `_id` / `__v` and resolves requester / approver.

## 5. Traceability

Every item of the rewrite spec (and every client answer) with the tasks that implement it.

| Spec section | Item | Tasks | Note |
|---|---|---|---|
| Features › Out of scope | Trips, places, travel-warrant export, detail export, /download, Trips nav link — removed | — | Not implemented by design; MIG-01 archives trip/place data offline, MIG-04 archives xlsx files |
| Features › Authentication and accounts | User signs in only with Google; accounts restricted to the hosted domain `instea.co` | AUTH-01 |  |
| Features › Authentication and accounts | Unknown Google account from the hosted domain is registered on first login and can use the app immediately, with no admin approval | AUTH-01 |  |
| Features › Authentication and accounts | Login shows distinct messages for failure and wrong domain | AUTH-01 |  |
| Features › Authentication and accounts | Session survives page reload; an invalid or expired session shows the user as logged out | AUTH-02 |  |
| Features › Authentication and accounts | Session is renewed while the user is active, without the old forgery hole and without losing the renewed token | AUTH-02, NFR-02 |  |
| Features › Authentication and accounts | User can log out | AUTH-03 |  |
| Features › Authentication and accounts | First admin is promoted by email through a CLI command | AUTH-04 |  |
| Features › Authentication and accounts | Deactivated users get no access to any endpoint and are not re-activated by logging in again | AUTH-05 |  |
| Features › User administration | Admin sees all users: email, name, admin flag, active / deactivated status | USR-01 |  |
| Features › User administration | Admin edits a user's first name, surname and admin flag | USR-02 |  |
| Features › User administration | User edits own first name and surname; email and admin flag are read-only for non-admins | USR-03, NFR-03 |  |
| Features › User administration | Admin deactivates a user (soft delete); the user's leaves keep their requester | USR-04 |  |
| Features › User administration | Users are created only by first Google login; no manual create | AUTH-01, DATA-01 |  |
| Features › User administration | Degrees and address fields are removed | DATA-01, MIG-01 |  |
| Features › User administration | Remove/deactivate actions ask for confirmation | USR-04, LV-03 |  |
| Features › Leave requests | User creates a leave with type (default ANNUAL), start date (default today), end date (follows start until edited) and half-day flag | LV-02 |  |
| Features › Leave requests | Leave types: ANNUAL, SICKNESS, DOCTOR, MATERNITY, PARENTAL, CARING, shown with readable labels, not raw codes | DATA-02, NFR-13 |  |
| Features › Leave requests | Form shows a live count of missed work days | LV-02, WD-01 |  |
| Features › Leave requests | End date must not be before start date; half-day allowed only for a single day; enforced on client and server | LV-01, LV-02 |  |
| Features › Leave requests | New leave is always PENDING and its requester is always the caller | LV-01 |  |
| Features › Leave requests | Work-day count is computed by the server, not trusted from the client | LV-01, WD-01 |  |
| Features › Leave requests | Add-leave form submits when input is valid (fixes the always-disabled button) | LV-02 |  |
| Features › Leave requests | User deletes only own leaves; admin deletes any leave; Delete is shown only where allowed and asks for confirmation | LV-03 |  |
| Features › Leave list and calendar | Every user sees all users' leaves: requester, days (`start - end (n work days)`), type, state, approver | LST-01 |  |
| Features › Leave list and calendar | Filters by requester, month and year (multiselect), matched per year segment of a leave; Clear filter | LST-02 |  |
| Features › Leave list and calendar | Toggle between list and calendar view | LST-01, LST-03 |  |
| Features › Leave list and calendar | Month calendar with prev / next / today; REJECTED hidden, PENDING at 50% opacity | LST-03 |  |
| Features › Leave list and calendar | Each requester gets a stable colour from a 15-colour palette; event title `<Full Name> [1/2 ](<type letter>)` | LST-03 |  |
| Features › Leave list and calendar | List, calendar and actions show loading, empty and error states | LST-01, LST-03, SET-03 |  |
| Features › Leave approval | Admin sees pending leaves with Approve / Reject; the row disappears after the action | APR-02 |  |
| Features › Leave approval | Admin nav shows a badge with the pending count | APR-02 |  |
| Features › Leave approval | Approve / reject sets the state and records the approving admin | APR-01 |  |
| Features › Leave approval | Approval screen and actions are admin-only on client and server | APR-01, APR-02, NFR-01 |  |
| Features › Leave approval | Denied actions return an explicit error, never a silent empty result | NFR-01, SET-02 |  |
| Features › Leave summary | User sees own work days per year and per leave type, clipped per year, years descending | SUM-01 |  |
| Features › Leave summary | Summary counts only APPROVED leaves | SUM-01 |  |
| Features › Work-day rules | A working day is Monday–Friday and not a Slovak public holiday | WD-01 |  |
| Features › Work-day rules | Leave work days = working days in [start, end] inclusive, minus 0.5 for a half-day; existing test examples (3, 4, 2.5) keep passing | WD-01 |  |
| Features › Notifications | New leave sends an email to the configured approver address (`APPROVAL_MAIL_RECEIVER`, prod `pm@instea.co`) with requester, date range in the default timezone, type and an Approve link | NOT-02 |  |
| Features › Notifications | Approve link in the email points to the real approval screen URL | NOT-02 |  |
| Features › Notifications | When SMTP is not configured, no email is sent and a log line is written | NOT-01 |  |
| Features › Attendance API (M2M) | `GET /api/attendence/:year/:month` keeps its path, Basic M2M auth and JSON contract | ATT-01 |  |
| Features › Attendance API (M2M) | Error responses keep their status and text: 400 / 401 / 500 SSO / Toggl messages | ATT-01 |  |
| Features › Attendance API (M2M) | Employees come from the SSO directory; only users with `togglUserId` are listed; Toggl and leave data only when `employee === '1'` | ATT-02, ATT-04 |  |
| Features › Attendance API (M2M) | Logged hours per day = sum of Toggl entry seconds / 3600 by entry start date, paginated Toggl Reports v3 calls with 500 ms between pages | ATT-03 |  |
| Features › Attendance API (M2M) | Leave code per working day, APPROVED leaves only: ANNUAL `D8` (half-day `D4`), SICKNESS `PN`, DOCTOR `L`, other `I`; several joined with `", "` | ATT-04 |  |
| Features › Attendance API (M2M) | Day boundaries use `DEFAULT_TIMEZONE` (default Europe/Bratislava) | ATT-04 |  |
| Features › Attendance API (M2M) | Output is keyed by SSO name; duplicate names collide — preserved quirk | ATT-04 |  |
| Features › Attendance API (M2M) | An employee without `togglUserId` who has leaves no longer hangs the request | ATT-04 |  |
| Features › Operations | Health-check endpoint pings the database, returns 200 / 500 and serves as the k8s readiness probe | OPS-01 |  |
| Features › Operations | App fails fast when the database is unreachable so k8s restarts it | OPS-01 |  |
| Features › Operations | Manual database backup (gzip dump, 14-day retention) and restore scripts, updated for MongoDB 8 | OPS-02 |  |
| Decisions › Scope | Only the leaves module, user administration, auth and the attendance API are carried over | SET-01 | Constraint applied to all tasks |
| Decisions › Scope | Attendance API stays 1:1, including SSO and Toggl | ATT-01, ATT-02, ATT-03, ATT-04 | Constraint |
| Decisions › Scope | Monthly detail export is dropped | — | Not implemented by design |
| Decisions › Scope | Leave visibility stays company-wide, as today | LST-01 | Constraint |
| Decisions › Authentication | No admin approval step: auto-approval on first login; pending-user flow and approve-user action removed | AUTH-01, MIG-01 |  |
| Decisions › Known bugs | All known leave-module and auth bugs from the analysis are fixed, not preserved | AUTH-02, LV-01, LV-02, LV-03, APR-01, NFR-01, NFR-03 | Constraint; each fix noted in its task |
| Decisions › Known bugs | Attendance contract quirks (path spelling `attendence`, name-keyed output) stay for compatibility | ATT-01, ATT-04 | Constraint |
| Decisions › Leave lifecycle rules | Summary counts APPROVED leaves only | SUM-01 | Constraint |
| Decisions › Leave lifecycle rules | A user deletes only own leaves; only an admin deletes others' leaves | LV-03 | Constraint |
| Decisions › User administration | Keep user admin 1:1 except approval (list, edit, admin flag, own profile, CLI first admin) | USR-01, USR-02, USR-03, AUTH-04 |  |
| Decisions › User administration | Drop travel-only fields degrees and address | DATA-01, MIG-01 |  |
| Decisions › User administration | Soft delete users instead of hard delete | USR-04, DATA-01 |  |
| Decisions › Notifications | Keep the new-leave email to the approver address | NOT-02 |  |
| Decisions › Notifications | Requester gets an email when their leave is approved or rejected | NOT-03 |  |
| Decisions › Documentation | Functional spec of the leaves module | DOC-01 |  |
| Decisions › Documentation | API docs: OpenAPI for the app API and the M2M attendance API | DOC-02 |  |
| Decisions › Documentation | Dev and ops README: local setup, env var names, deploy, backup / restore runbook | DOC-03 |  |
| Decisions › Testing | Unit tests for all business rules | TST-01 |  |
| Decisions › Testing | Integration tests for every API endpoint and every authorization rule against a real test database | TST-02, NFR-01 |  |
| Decisions › Testing | E2E browser tests for login, create leave, delete, approve / reject, calendar, summary, user admin | TST-03 |  |
| Decisions › Testing | Parity tests: attendance API of old and new system return equal output for the same data | MIG-03 |  |
| Decisions › Testing | Every feature ships with tests; test coverage is maximised | TST-01, NFR-09 |  |
| Decisions › Integration testability | Contract-based mocks for Google token verification, SSO meta API and Toggl Reports v3 in tests | TST-04 |  |
| Decisions › Integration testability | Local mail catcher for SMTP in dev and tests | SET-04, NOT-01 |  |
| Decisions › Integration testability | Contract tests pin the attendance JSON format and SSO / Toggl response parsing | TST-04 |  |
| Decisions › Environments | No staging environment; testing relies on local docker-compose and CI | SET-04, NFR-09 | Constraint |
| Decisions › Data migration | Migrate users and leaves only; trips, places and generated xlsx files are archived offline, not migrated | MIG-01, MIG-04 |  |
| Decisions › Data migration | Migration validates every record; invalid or orphaned records go to a report | MIG-01 |  |
| Decisions › Data migration | Migration recomputes leave work days on the server | MIG-01 |  |
| Decisions › Data migration | Removed users referenced by leaves become deactivated users | MIG-01 |  |
| Decisions › Migration strategy | Migration script moves users and leaves from MongoDB 3.6 to MongoDB 8 and writes a validation report | MIG-01 |  |
| Decisions › Migration strategy | Rehearse the migration locally on an anonymized prod dump | MIG-02 |  |
| Decisions › Migration strategy | Before cutover, run parity tests of the attendance API old vs new on the rehearsed data | MIG-03, MIG-02 |  |
| Decisions › Migration strategy | Announce the cutover window; freeze writes on the old app | MIG-04 |  |
| Decisions › Migration strategy | Take a final full dump of the old database and an archive of generated files; store offline | MIG-04 |  |
| Decisions › Migration strategy | Run the migration, check record counts and the report, smoke-test login, leaves and the attendance API | MIG-04 |  |
| Decisions › Migration strategy | Switch host nginx / ingress to the new app; the M2M consumer keeps the same attendance URL | MIG-04, OPS-03 |  |
| Decisions › Migration strategy | Keep the old app read-only for 2 weeks as rollback; rollback = switch ingress back | MIG-04 | Overridden (interview: Rollback): big bang, no side-by-side; rollback = redeploy old manifests + restore final dump |
| Decisions › Migration strategy | After 2 weeks, decommission the old deployment and the MongoDB 3.6 StatefulSet | MIG-04 | Overridden (interview: Rollback): old stack removed during the cutover window |
| Decisions › Platform and delivery | Deploy to the same MicroK8s cluster with the existing registry and Keel; new k8s manifests | OPS-03 |  |
| Decisions › Platform and delivery | Secrets come only from k8s secrets, never from the repo | OPS-03, NFR-05 |  |
| NFR › Security | Server enforces role and ownership on every endpoint; denied calls return 401 / 403; each rule has a test | NFR-01 |  |
| NFR › Security | Secure sessions: short-lived tokens with real signature verification and a safe refresh; Google hosted-domain check kept | NFR-02, AUTH-02 |  |
| NFR › Security | User data is visible and editable only per the permission rules; non-admins cannot change email or admin flag | NFR-03 |  |
| NFR › Security | Automated dependency and image vulnerability scanning in CI | NFR-04 |  |
| NFR › Data privacy and compliance | Audit log of who created, approved, rejected or deleted a leave and who changed a user or role, with timestamp | NFR-06 |  |
| NFR › Data privacy and compliance | Admin can export all data of one user (GDPR access request) | NFR-07 |  |
| NFR › Data privacy and compliance | Admin can erase or anonymize one user's personal data (GDPR erasure) | NFR-08 |  |
| NFR › Maintainability | CI runs lint, typecheck and all tests and blocks merge to master on failure | NFR-09 |  |
| NFR › Maintainability | TypeScript strict mode, ESLint and Prettier, pre-commit hooks that run | NFR-10 |  |
| NFR › Maintainability | Semantic versioning with automated version bump and release notes per release | NFR-11 |  |
| NFR › Maintainability | Current, supported runtime and library versions | NFR-12 |  |
| NFR › Localization | Whole UI in Slovak and English: screens, labels, validation messages, leave types; user can switch language | NFR-13 |  |
| NFR › Localization | Notification emails in Slovak and English | NFR-14 | Overridden by client answer Q-S10: emails English only |
| Client answers | Q-S1 admin may approve/reject own leave | APR-01 |  |
| Client answers | Q-S2 re-approving from REJECTED possible | APR-01, APR-02 |  |
| Client answers | Q-S3 / Q-A6 user may delete own leave in any state | LV-03 |  |
| Client answers | Q-S4 health-related leave types visible to all | LST-01 |  |
| Client answers | Q-S5 retention 2 months, configurable | — | Overridden (interview: Retention): no retention |
| Client answers | Q-S6 API explorer off in prod, restricted CORS, constant-time M2M compare (no rate limiting) | NFR-05, ATT-01 |  |
| Client answers | Q-S7 Tailwind, React Query, calendar component | SET-03, LST-03 |  |
| Client answers | Q-S8 Vitest, Playwright, date-fns, popular secure mail lib | TST-01, TST-03, WD-01, NOT-01 |  |
| Client answers | Q-S9 refresh SK holiday data | WD-01 |  |
| Client answers | Q-S10 EN default UI; emails EN only | NFR-13, NFR-14 |  |
| Client answers | Q-S11 no redirects | OPS-03 | Constraint |
| Client answers | Q-S12 attendance keyed by SSO name 1:1 | ATT-04 |  |
| Client answers | Q-S13 new-leave email only to receiver | NOT-02 |  |
| Client answers | Q-S14 pending users migrated as active | MIG-01 |  |
| Client answers | Q-A5 old add-leave form works | LV-02 | Code disagrees; see LV-02 |
| Client answers | Q-A8 Toggl end_date inclusive | ATT-03 |  |
| Client answers | Notes: use pnpm; use latest node | SET-01, NFR-12 | pnpm adopted; Node 24 LTS kept (interview: Node version) |
