# Cestovné príkazy (Trips & Leaves) — Implementation Specification

|                           |                                                                                                                                                                              |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Project                   | Cestovné príkazy ("Cestaky"): business trips, travel-warrant export, leaves, attendance API                                                                                  |
| Created                   | 2026-10-29                                                                                                                                                                   |
| Source rewrite spec       | `docs/tech-rewrite/PROJECT_REWRITE_SPEC.md` (created 2026-10-29) + client answers `docs/tech-rewrite/PROJECT_REWRITE_SPEC_ANSWERS.md` + Instea interview (2026-10-29)        |
| Source technical analysis | `docs/tech-rewrite/PROJECT_INITIAL_ANALYSIS.md`                                                                                                                              |
| Old codebase              | branch `master`, commit `b94e05064f6db00dd935384def27eb144aa2d2b6` (`b94e050`)                                                                                               |
| Citations                 | `(rewrite spec: …)` spec line · `(client answer: Sx/Ax)` exported answers · `(interview: …)` answer given while writing this spec · `file:line` old code at the commit above |

---

## 1. Target tech stack

Platform: same MicroK8s cluster on the Contabo server (host nginx with TLS → ingress-nginx class `public` → service). Image published to `registry.instea.co`. _(interview: Platform)_

#### Server (NestJS API)

| Layer                                                                       | Current (analysis)                                                                                                                                         | Target                                                            | Source                                  |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------- |
| Runtime                                                                     | Node 8 (build) / Node 12.22-slim (runtime)                                                                                                                 | Node 22 LTS                                                       | (interview: Target tech stack › Server) |
| Language                                                                    | JavaScript                                                                                                                                                 | TypeScript                                                        | (interview: Target tech stack › Server) |
| Framework                                                                   | Express 4.16.2 / 4.17.1                                                                                                                                    | NestJS 11                                                         | (interview: Target tech stack › Server) |
| API                                                                         | express-graphql 0.6.11 / graphql 0.10.5 + REST (`/refresh-jwt`, `/export/*`, `/api/attendence`, `/health-check`)                                           | NestJS GraphQL module + REST, same operations and shapes as today | (interview: API style)                  |
| ODM                                                                         | Mongoose 4.13.5                                                                                                                                            | Mongoose 8                                                        | (interview: Target tech stack › Server) |
| Database                                                                    | MongoDB 3.6                                                                                                                                                | MongoDB 8                                                         | (interview: Database)                   |
| Key libraries (xlsx, mail, Google auth/JWT, dates/holidays, test framework) | exceljs 1.6.0, nodemailer 6.3.0, google-auth-library 4.2.5, express-jwt 5.3.0 / jwt-node 0.1.9, moment / moment-timezone, date-holidays 1.2.0, jest 24.7.1 | Instea picks during implementation (client answer: S3)            | (interview: not asked)                  |

#### Frontend (one React SPA, merges React "Trips" and Angular "Leaves")

| Layer                  | Current (analysis)                                                                                                       | Target                                                 | Source                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ | ----------------------------------------- |
| Apps                   | React SPA at `/` (Trips, Places, Users, Export) + Angular SPA at `/leaves/` (Leaves)                                     | One React SPA covering all screens                     | (interview: Target tech stack › Frontend) |
| Language               | JavaScript (React), TypeScript 2.3.4 (Angular)                                                                           | TypeScript                                             | (interview: Target tech stack › Frontend) |
| Framework / build      | React 16.8.0 + CRA 3.0.1; Angular 4.4.6 + CLI 1.5.5                                                                      | React 19 + Vite                                        | (interview: Target tech stack › Frontend) |
| GraphQL client         | apollo-client 1.9.3 / react-apollo 1.4.16; apollo-angular 1.0.0 / apollo-client 2.0.4                                    | Apollo Client 3                                        | (interview: Target tech stack › Frontend) |
| Routing                | react-router-redux 5.0.0-alpha.8; Angular router 4.4.6                                                                   | React Router 7                                         | (interview: Target tech stack › Frontend) |
| Calendar               | fullcalendar 3.7.0 / ng-fullcalendar 1.1.0                                                                               | FullCalendar 6                                         | (interview: Target tech stack › Frontend) |
| State / forms / UI kit | redux 3.7.2, redux-form 6.8.0, react-bootstrap 0.31.5 + Bootstrap 3.3.2; ngrx 2.x, primeng 4.3.0, Bootstrap 4.0.0-beta.2 | Instea picks during implementation (client answer: S3) | (interview: not asked)                    |
| i18n                   | None (English UI)                                                                                                        | i18n with Slovak + English                             | (interview: Localization)                 |

#### Delivery and operations

| Layer             | Current (analysis)                                                                      | Target                                                                                                                             | Source                       |
| ----------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Hosting           | Unclear in repo: Jenkins `docker-compose`, PM2 notes, k8s hints                         | Same MicroK8s / Contabo                                                                                                            | (interview: Platform)        |
| Artifact          | One Docker image (`node:8` builder, `node:12.22-slim` runtime), server serves both SPAs | Docker image(s) pushed to `registry.instea.co`                                                                                     | (interview: Platform)        |
| CI/CD             | Jenkins: `bin/test.sh` → `docker build` → `docker-compose up -d`; husky hooks           | CI pipeline on every PR: lint, typecheck, tests, coverage gate, image build and push. CI tool picked by Instea (client answer: S3) | (interview: Maintainability) |
| Local environment | `db/docker-compose.yml` with `mongo:3.6` only                                           | docker-compose with the full stack and integration fakes                                                                           | (interview: Environments)    |

---

## 2. Task index

| ID          | Title                                                       | Area                           | Type       | Depends on                                                                                                                                                                                                                                                               |
| ----------- | ----------------------------------------------------------- | ------------------------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AUTH-01     | Google login (`loginUser`)                                  | Auth and session               | functional | SETUP-01, DATA-01, NFR-MNT-02, AUTH-03                                                                                                                                                                                                                                   |
| AUTH-02     | Login page                                                  | Auth and session               | functional | SETUP-02, AUTH-01, AUTH-04, NFR-L10N-01, NFR-MNT-02                                                                                                                                                                                                                      |
| AUTH-03     | Request auth context and guards                             | Auth and session               | functional | SETUP-01, DATA-01, MIG-01                                                                                                                                                                                                                                                |
| AUTH-04     | Client session (storage, auto-login, refresh timer, logout) | Auth and session               | functional | SETUP-02, AUTH-01, AUTH-03, AUTH-05                                                                                                                                                                                                                                      |
| AUTH-05     | `POST /refresh-jwt` endpoint                                | Auth and session               | functional | SETUP-01, AUTH-03                                                                                                                                                                                                                                                        |
| AUTH-06     | CLI promote user                                            | Auth and session               | functional | SETUP-01, DATA-01                                                                                                                                                                                                                                                        |
| AUTH-07     | Client recovers after API errors                            | Auth and session               | functional | SETUP-02, AUTH-04                                                                                                                                                                                                                                                        |
| USR-01      | Users list (admin) and user read visibility                 | Users                          | functional | AUTH-03, DATA-01, SETUP-02, NFR-L10N-01                                                                                                                                                                                                                                  |
| USR-02      | Approve user                                                | Users                          | functional | USR-01, AUTH-01, AUTH-03, NFR-PRV-01                                                                                                                                                                                                                                     |
| USR-03      | Admin edits and removes users; `updateUser` preserved bug   | Users                          | functional | USR-01, AUTH-03, SETUP-01, DATA-01, NFR-PRV-01                                                                                                                                                                                                                           |
| USR-04      | Own profile edit screen                                     | Users                          | functional | USR-01, USR-03, SETUP-02, NFR-L10N-01                                                                                                                                                                                                                                    |
| USR-05      | Deleted-user placeholder                                    | Users                          | functional | DATA-01                                                                                                                                                                                                                                                                  |
| TRIP-01     | Trips list                                                  | Trips                          | functional | SETUP-01, SETUP-02, DATA-01, AUTH-03, USR-05, NFR-L10N-01                                                                                                                                                                                                                |
| TRIP-02     | Add trip                                                    | Trips                          | functional | TRIP-01, SETUP-02, DATA-01, AUTH-03, NFR-MNT-02, NFR-L10N-01                                                                                                                                                                                                             |
| TRIP-03     | Edit trip with owner check                                  | Trips                          | functional | TRIP-01, TRIP-02, DATA-01, AUTH-03, NFR-L10N-01                                                                                                                                                                                                                          |
| TRIP-04     | Remove trip                                                 | Trips                          | functional | TRIP-01, DATA-01, AUTH-03                                                                                                                                                                                                                                                |
| TRIP-05     | Duplicate trip                                              | Trips                          | functional | TRIP-01, TRIP-02, AUTH-03, NFR-L10N-01                                                                                                                                                                                                                                   |
| PLC-01      | Places list                                                 | Places                         | functional | SETUP-01, SETUP-02, DATA-01, AUTH-03, NFR-L10N-01                                                                                                                                                                                                                        |
| PLC-02      | Place CRUD (admin)                                          | Places                         | functional | PLC-01, DATA-01, AUTH-03, NFR-MNT-02, NFR-L10N-01                                                                                                                                                                                                                        |
| TWE-01      | Export screen, `POST /export/trips`, download               | Travel-warrant export          | functional | SETUP-01, SETUP-02, DATA-01, AUTH-03, NFR-SEC-03, NFR-L10N-01, TWE-02, TWE-03                                                                                                                                                                                            |
| TWE-02      | Template choice                                             | Travel-warrant export          | functional | DATA-01                                                                                                                                                                                                                                                                  |
| TWE-03      | Template filling                                            | Travel-warrant export          | functional | DATA-01, TWE-02, TWE-04, NFR-MNT-02                                                                                                                                                                                                                                      |
| TWE-04      | Per-diem                                                    | Travel-warrant export          | functional | NFR-MNT-02, DATA-01, TWE-05                                                                                                                                                                                                                                              |
| TWE-05      | FX conversion for non-EUR tariffs                           | Travel-warrant export          | functional | SETUP-01, NFR-MNT-02, TST-03                                                                                                                                                                                                                                             |
| LV-01       | Leaves list                                                 | Leaves                         | functional | SETUP-01, SETUP-02, DATA-01, AUTH-03, USR-05, NFR-MNT-02, NFR-L10N-01                                                                                                                                                                                                    |
| LV-02       | Leave filter                                                | Leaves                         | functional | LV-01, NFR-L10N-01                                                                                                                                                                                                                                                       |
| LV-03       | Leaves calendar                                             | Leaves                         | functional | LV-01, LV-02, SETUP-02                                                                                                                                                                                                                                                   |
| LV-04       | Add leave screen                                            | Leaves                         | functional | LV-05, LV-06, SETUP-02, NFR-MNT-02, NFR-L10N-01                                                                                                                                                                                                                          |
| LV-05       | Work-day count                                              | Leaves                         | functional | NFR-MNT-02                                                                                                                                                                                                                                                               |
| LV-06       | createLeave                                                 | Leaves                         | functional | SETUP-01, DATA-01, AUTH-03, NFR-MNT-02, NTF-01                                                                                                                                                                                                                           |
| LV-07       | Delete leave                                                | Leaves                         | functional | LV-01, AUTH-03, DATA-01, NFR-PRV-01                                                                                                                                                                                                                                      |
| APR-01      | Leave approval page                                         | Leave approval                 | functional | LV-01, AUTH-03, DATA-01, NFR-PRV-01, SETUP-02                                                                                                                                                                                                                            |
| APR-02      | Pending-leave badge                                         | Leave approval                 | functional | SETUP-02, LV-01, APR-01                                                                                                                                                                                                                                                  |
| SUM-01      | Leave summary                                               | Leave summary                  | functional | LV-01, LV-05, SETUP-02, NFR-MNT-02, NFR-L10N-01                                                                                                                                                                                                                          |
| DET-01      | Detail export screen and `POST /export/detail`              | Detail export (meal vouchers)  | functional | SETUP-01, SETUP-02, DATA-01, AUTH-03, NFR-SEC-03, NFR-MNT-02, NFR-L10N-01, MIG-01, DET-02                                                                                                                                                                                |
| DET-02      | Working days and meal vouchers                              | Detail export (meal vouchers)  | functional | DATA-01, LV-05, NFR-MNT-02, MIG-01                                                                                                                                                                                                                                       |
| ATT-01      | Attendance endpoint, auth, validation, errors               | Attendance API (M2M)           | functional | SETUP-01, MIG-01, ATT-02, ATT-03                                                                                                                                                                                                                                         |
| ATT-02      | SSO users and Toggl hours                                   | Attendance API (M2M)           | functional | SETUP-01, TST-03                                                                                                                                                                                                                                                         |
| ATT-03      | Attendance leave codes                                      | Attendance API (M2M)           | functional | DATA-01, LV-05, NFR-MNT-02, MIG-01                                                                                                                                                                                                                                       |
| NTF-01      | New-leave email                                             | Notifications                  | functional | SETUP-01, DATA-01, USR-05, TST-03                                                                                                                                                                                                                                        |
| OPS-01      | Health check endpoint                                       | Operations                     | functional | SETUP-01, MIG-01                                                                                                                                                                                                                                                         |
| OPS-02      | Exit on Mongo connection loss                               | Operations                     | functional | SETUP-01, MIG-01                                                                                                                                                                                                                                                         |
| OPS-03      | Public GraphQL IDE and open CORS                            | Operations                     | functional | SETUP-01, NFR-SEC-02                                                                                                                                                                                                                                                     |
| DATA-01     | Data model: Place, User, Trip, Leave                        | Data and validation            | functional | SETUP-01, NFR-MNT-02                                                                                                                                                                                                                                                     |
| TST-01      | Test infrastructure and coverage gate                       | Testing                        | decision   | SETUP-01, SETUP-02, TST-03, ENV-01                                                                                                                                                                                                                                       |
| TST-02      | Attendance API contract tests                               | Testing                        | decision   | TST-01, TST-03, ATT-01                                                                                                                                                                                                                                                   |
| TST-03      | Integration fakes                                           | Testing                        | decision   | SETUP-01, DOC-01                                                                                                                                                                                                                                                         |
| ENV-01      | Local docker-compose environment                            | Environments                   | decision   | SETUP-01, SETUP-02, TST-03, MIG-01                                                                                                                                                                                                                                       |
| ENV-02      | Anonymized production copy                                  | Environments                   | decision   | DATA-01, MIG-01, NFR-PRV-01, TST-03                                                                                                                                                                                                                                      |
| DOC-01      | Integration reference document                              | Integrations and documentation | decision   | —                                                                                                                                                                                                                                                                        |
| DOC-02      | Business rules document                                     | Integrations and documentation | decision   | TWE-04, DET-02, LV-05, LV-02, ATT-03, SUM-01                                                                                                                                                                                                                             |
| MIG-01      | Dual-DB data layer and copy tool                            | Migration strategy             | decision   | SETUP-01, DATA-01                                                                                                                                                                                                                                                        |
| MIG-02      | Step 1 cutover: leaves, attendance API, detail export       | Migration strategy             | decision   | MIG-01, MIG-04, SETUP-03, TST-02, ENV-02, NFR-SEC-02, NFR-SEC-03, NFR-PRV-01, NFR-L10N-01, AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, AUTH-07, LV-01, LV-02, LV-03, LV-04, LV-05, LV-06, LV-07, APR-01, APR-02, SUM-01, NTF-01, DET-01, DET-02, ATT-01, ATT-02, ATT-03 |
| MIG-03      | Step 2 cutover: trips, places, users, travel-warrant export | Migration strategy             | decision   | MIG-02, AUTH-06, DOC-02, NFR-PRV-02, NFR-PRV-03, TRIP-01, TRIP-02, TRIP-03, TRIP-04, TRIP-05, PLC-01, PLC-02, USR-01, USR-02, USR-03, USR-04, USR-05, TWE-01, TWE-02, TWE-03, TWE-04, TWE-05                                                                             |
| MIG-04      | Rollback per step                                           | Migration strategy             | decision   | MIG-01                                                                                                                                                                                                                                                                   |
| MIG-05      | Final step: remove old deployment and MongoDB 3.6           | Migration strategy             | decision   | MIG-03, MIG-04                                                                                                                                                                                                                                                           |
| NFR-SEC-01  | Dependency and image vulnerability scanning                 | Security                       | NFR        | NFR-MNT-01, SETUP-03                                                                                                                                                                                                                                                     |
| NFR-SEC-02  | Security headers                                            | Security                       | NFR        | SETUP-01                                                                                                                                                                                                                                                                 |
| NFR-SEC-03  | Export download URLs use the request scheme                 | Security                       | NFR        | SETUP-01                                                                                                                                                                                                                                                                 |
| NFR-PRV-01  | Audit log                                                   | Data privacy and compliance    | NFR        | SETUP-01, SETUP-02, DATA-01, AUTH-03, MIG-01                                                                                                                                                                                                                             |
| NFR-PRV-02  | Admin exports a user's personal data                        | Data privacy and compliance    | NFR        | NFR-PRV-01, DATA-01, AUTH-03, USR-01                                                                                                                                                                                                                                     |
| NFR-PRV-03  | Admin erases a user's personal data                         | Data privacy and compliance    | NFR        | NFR-PRV-01, DATA-01, USR-05, AUTH-03, USR-01                                                                                                                                                                                                                             |
| NFR-PRV-04  | Regular users see only their own data                       | Data privacy and compliance    | NFR        | AUTH-03                                                                                                                                                                                                                                                                  |
| NFR-MNT-01  | CI pipeline                                                 | Maintainability                | NFR        | TST-01, SETUP-03                                                                                                                                                                                                                                                         |
| NFR-MNT-02  | Shared types package                                        | Maintainability                | NFR        | —                                                                                                                                                                                                                                                                        |
| NFR-MNT-03  | Developer documentation and ADRs                            | Maintainability                | NFR        | ENV-01, NFR-MNT-01, SETUP-03                                                                                                                                                                                                                                             |
| NFR-L10N-01 | SPA internationalization (English, Slovak)                  | Localization                   | NFR        | SETUP-02, NFR-MNT-02                                                                                                                                                                                                                                                     |
| SETUP-01    | Server scaffold                                             | Project setup                  | derived    | NFR-MNT-02                                                                                                                                                                                                                                                               |
| SETUP-02    | SPA shell                                                   | Project setup                  | derived    | SETUP-01, NFR-MNT-02                                                                                                                                                                                                                                                     |
| SETUP-03    | Kubernetes deployment                                       | Project setup                  | derived    | SETUP-01, SETUP-02, OPS-01, OPS-02, MIG-01, NFR-SEC-03                                                                                                                                                                                                                   |

### Implementation order

Tasks in one wave depend only on earlier waves and can be built in parallel.

1. **Wave 1**: DOC-01, NFR-MNT-02
2. **Wave 2**: LV-05, SETUP-01
3. **Wave 3**: SETUP-02, TST-03, NFR-SEC-02, NFR-SEC-03, DATA-01
4. **Wave 4**: NFR-L10N-01, AUTH-06, USR-05, TWE-02, TWE-05, ATT-02, OPS-03, MIG-01
5. **Wave 5**: NTF-01, MIG-04, AUTH-03, TWE-04, DET-02, ATT-03, OPS-01, OPS-02, ENV-01
6. **Wave 6**: AUTH-05, USR-01, LV-01, LV-06, NFR-PRV-01, NFR-PRV-04, TRIP-01, PLC-01, AUTH-01, TWE-03, DET-01, ATT-01, SETUP-03, TST-01
7. **Wave 7**: LV-02, SUM-01, NFR-PRV-02, NFR-PRV-03, TRIP-02, TRIP-04, PLC-02, AUTH-04, USR-02, USR-03, LV-04, LV-07, APR-01, TST-02, ENV-02, NFR-MNT-01, TWE-01
8. **Wave 8**: LV-03, DOC-02, TRIP-03, TRIP-05, AUTH-07, USR-04, APR-02, NFR-MNT-03, AUTH-02, NFR-SEC-01
9. **Wave 9**: MIG-02
10. **Wave 10**: MIG-03
11. **Wave 11**: MIG-05

---

## 3. Tasks by area

## Functional areas

### Area: Auth and session

#### AUTH-01 — Google login (`loginUser`)

- **Type**: functional
- **Source**: `(rewrite spec: Features by area › Auth and session)` — "User signs in with Google; server verifies the ID token against `CLIENT_ID`."
- **Source**: `(rewrite spec: Features by area › Auth and session)` — "Login returns WRONG_DOMAIN and creates no user when `HOSTED_DOMAIN` is set and the token domain differs."
- **Source**: `(rewrite spec: Features by area › Auth and session)` — "First login of an unknown email auto-creates an unapproved, non-admin user (id = Google `sub`, names from token) and returns NEED_APPROVAL."
- **Source**: `(rewrite spec: Features by area › Auth and session)` — "Unapproved user gets NEED_APPROVAL; approved user gets SUCCESS and a 1-hour JWT."
- **Source**: `(rewrite spec: Features by area › Auth and session)` — "Failed token verification returns FAILED."
- **Depends on**: SETUP-01, DATA-01, NFR-MNT-02, AUTH-03

**Goal**: The `loginUser` GraphQL mutation takes a Google ID token from the SPA, verifies it with Google, applies the optional hosted-domain restriction, looks the user up by email and returns a `LoginResult`. Approved users get an application JWT (format defined in AUTH-03). Unknown emails are registered as unapproved users and must wait for an admin (USR-02 or AUTH-06).

**Old behavior**:

- Google client is built once with `CLIENT_ID` from env; `HOSTED_DOMAIN` read from env. `server/graphql/userRelated.js:10-12`.
- `loginUser({token_id})` calls `client.verifyIdToken({idToken: token_id, audience: CLIENT_ID})` (google-auth-library). `server/graphql/userRelated.js:21-25`.
- Reads `sub`, `hd`, `email`, `given_name`, `family_name` from the token payload. `server/graphql/userRelated.js:26-29,51-52`.
- If `HOSTED_DOMAIN` is set and differs from `hd` → `{status: 'WRONG_DOMAIN'}`. No DB access. `server/graphql/userRelated.js:30-34`.
- Looks up the user **by email** (`User.findOne({email})`), not by Google `sub`. `server/graphql/userRelated.js:35`, `server/service/userService.js:16`.
- Found and `approved` truthy → `{status: 'SUCCESS', jwt: createJwt(user).compact()}`; JWT `sub` = stored `user.id`. `server/graphql/userRelated.js:37-41`, `server/auth/operations.js:8-19`.
- Found and not approved → `{status: 'NEED_APPROVAL'}`. `server/graphql/userRelated.js:42-46`.
- Not found: `findOne` resolves `null`, `user.approved` throws a TypeError, and the `.catch` branch runs. It builds a new User `{id: sub, firstName: given_name, surname: family_name, degrees: '', address: '', email, approved: false, isAdmin: false}`, calls `.save()` without awaiting it, and returns `{status: 'NEED_APPROVAL'}`. `server/graphql/userRelated.js:47-61`, `src/data/User.js:3-6` (`isAdmin` passed as `false`).
- The same `.catch` branch also runs when the email lookup itself fails (DB error). Save errors (e.g. duplicate unique `id`) are ignored silently.
- Any error from `verifyIdToken` (bad signature, wrong audience, expired, malformed, network failure fetching Google certs) → logs `Problem with login` and returns `{status: 'FAILED'}`. `server/graphql/userRelated.js:62-67`.
- `jwt` is absent (null) for every status except SUCCESS. GraphQL type `LoginResult { status: String, jwt: String }`. `server/graphql/schema.js:49-52,125`.
- No guard: anonymous callers may call it. `server/graphql/userRelated.js:21`.
- `email_verified` is not checked anywhere.
- Status values come from `src/data/LoginResults.js:2-7` (copy in `angular/src/app/state/login.result.ts:2-7`).

**Analysis mismatch**: Analysis §2.1 says only "Unknown email → auto-create user". In code, a DB error during the email lookup also goes to the auto-create branch and returns NEED_APPROVAL, not FAILED (`server/graphql/userRelated.js:35-61`).

**Constraints**:

- 1:1 rewrite; GraphQL operation name, argument name `token_id` and result shape stay the same _(rewrite spec: §1 Target tech stack › Server, "same operations and shapes as today")_.
- `LoginResult` status values come from the shared types package (NFR-MNT-02). Do not redefine them.
- JWT format, signing key and claims are defined in AUTH-03; the JWT must be accepted by the old app during migration _(rewrite spec: User decisions › Migration strategy)_.
- Google token verification library: Instea picks _(client answer: S3)_.
- During migration step 1, the `users` collection still lives in the old database. The new server reads and writes users through the second (old-DB) connection until step 2 _(client answer: S4; interview: S4 follow-up)_. DATA-01 / SETUP-01 own the connection routing.

**Data model**: User (full definition in DATA-01). Fields written on auto-create:

| field     | type    | required | default | enum values | validation                          | set by              |
| --------- | ------- | -------- | ------- | ----------- | ----------------------------------- | ------------------- |
| id        | String  | yes      | —       | —           | Google `sub` from token             | server, first login |
| email     | String  | yes      | —       | —           | token `email`, stored as received   | server, first login |
| firstName | String  | no       | —       | —           | token `given_name` (may be absent)  | server, first login |
| surname   | String  | no       | —       | —           | token `family_name` (may be absent) | server, first login |
| degrees   | String  | no       | `''`    | —           | —                                   | server, first login |
| address   | String  | no       | `''`    | —           | —                                   | server, first login |
| isAdmin   | Boolean | yes      | `false` | —           | —                                   | server, first login |
| approved  | Boolean | yes      | `false` | —           | —                                   | server, first login |

Fields read: `email` (lookup), `approved`, `id` (JWT `sub`).

**API**:

- `mutation loginUser(token_id: String!): LoginResult`
  - Output: `{ status: String, jwt: String }`. `status` ∈ `SUCCESS`, `NEED_APPROVAL`, `WRONG_DOMAIN`, `FAILED`. `jwt` non-null only for `SUCCESS`.
  - Auth guard: none (anonymous allowed). An `Authorization` header, if present, is ignored by this operation.
  - HTTP status: always 200. Errors never surface as GraphQL errors: every failure maps to a status.
  - Algorithm, in order:
    1. Verify `token_id` as a Google ID token with audience = env `CLIENT_ID`. Any verification error → log the error, return `FAILED`.
    2. If env `HOSTED_DOMAIN` is non-empty and `payload.hd !== HOSTED_DOMAIN` (exact, case-sensitive; missing `hd` counts as different) → return `WRONG_DOMAIN`. No DB read or write.
    3. Find User with `email === payload.email` (exact match).
    4. Found and `approved === true` → return `SUCCESS` and a new JWT for `user.id` (AUTH-03, expiry 1 hour).
    5. Found and `approved` not true → return `NEED_APPROVAL`.
    6. Not found, or the lookup failed → insert the new User from the table above, then return `NEED_APPROVAL`. If the insert fails (e.g. unique `id` or `email` conflict), log it and still return `NEED_APPROVAL`.
  - Side effects: may insert one User document.

**Integrations**:

- Google Identity, ID-token verification (signature with Google public keys, issuer, expiry, audience). Env vars: `CLIENT_ID` (required), `HOSTED_DOMAIN` (optional). Failure of any kind (including network failure to fetch Google keys) → `FAILED`.
- In tests, a fake Google token issuer replaces Google _(rewrite spec: User decisions › Testing)_. The verifier's key source must be injectable for that.

**Business rules**:

| Condition                                                   | Result                           | DB effect                         |
| ----------------------------------------------------------- | -------------------------------- | --------------------------------- |
| Token invalid / expired / wrong audience / verify error     | FAILED                           | none                              |
| `HOSTED_DOMAIN` set, `hd` ≠ `HOSTED_DOMAIN` or `hd` missing | WRONG_DOMAIN                     | none                              |
| `HOSTED_DOMAIN` unset or empty                              | domain not checked               | —                                 |
| Email found, `approved = true`                              | SUCCESS + JWT(sub = stored `id`) | none                              |
| Email found, `approved` false/missing                       | NEED_APPROVAL                    | none                              |
| Email not found                                             | NEED_APPROVAL                    | insert unapproved, non-admin user |
| Email lookup throws                                         | NEED_APPROVAL                    | insert attempt (errors ignored)   |

Worked example (preserved consequence of email lookup): user `sub=111` with email `a@x.com` has its email changed to `b@x.com` via `updateUser` (USR-03). Next Google login with `a@x.com` finds no user, tries to insert `id=111` → unique-id conflict → insert fails silently → NEED_APPROVAL on every login.

**Acceptance criteria**:

- Given a valid Google token for a new email in the hosted domain, when `loginUser` is called, then a User `{id: sub, approved: false, isAdmin: false, degrees: '', address: ''}` with names from the token exists and the result is `{status: "NEED_APPROVAL", jwt: null}`.
- Given `HOSTED_DOMAIN=instea.co` and a token with `hd=other.com`, when `loginUser`, then `WRONG_DOMAIN` and the User count is unchanged.
- Given `HOSTED_DOMAIN=instea.co` and a token without `hd` (consumer Gmail), then `WRONG_DOMAIN`.
- Given `HOSTED_DOMAIN` unset and a token from any domain, then the domain is not checked.
- Given an existing approved user, when `loginUser`, then `SUCCESS` and a JWT whose `sub` = the stored user id and `exp` = issue time + 3600 s.
- Given an existing unapproved user, then `NEED_APPROVAL`, `jwt` null, and no second user is created.
- Given a token with a bad signature, wrong audience or past expiry, then `FAILED` and no user is created.
- Given the email lookup fails with a DB error, then `NEED_APPROVAL` (not `FAILED`).
- Given the stored user's `id` differs from the token `sub` (same email), then SUCCESS uses the stored `id` as JWT `sub`.

**Tests**:

- Unit: status mapping table above with a fake verifier (each row); JWT `sub` = stored id; `jwt` null for non-SUCCESS.
- Integration (GraphQL over HTTP, fake Google issuer, real MongoDB): new user creation; existing approved / unapproved; WRONG_DOMAIN with no insert; FAILED for tampered token, wrong `aud`, expired token; insert conflict still returns NEED_APPROVAL; anonymous call allowed; the returned JWT is accepted by AUTH-03 middleware (`getUserInfo` returns the user).
- End-to-end: covered via AUTH-02.
- Old suite: no existing tests for login (only "should create" in `angular/src/app/auth.service.spec.ts:13-15`).

#### AUTH-02 — Login page

- **Type**: functional
- **Source**: `(rewrite spec: Features by area › Auth and session)` — "Login page shows "Login failed. Try again later.", "Used email does not belong to given hosted domain." or "Account needs to be approved by admin first."."
- **Depends on**: SETUP-02, AUTH-01, AUTH-04, NFR-L10N-01, NFR-MNT-02

**Goal**: One login page in the new SPA shows the Google sign-in button, sends the Google credential to `loginUser`, shows the result message and, on SUCCESS, starts the session (AUTH-04) and returns the user to where they were. It replaces both the React `/login` page and the Angular inline login page.

**Old behavior**:

- React route `/login` → `LoginForm`. `src/App.js:38`.
- React page: result message above the Google button. `src/containers/auth/LoginForm.js:18-29`.
- React Google button: `@react-oauth/google` `GoogleLogin`, `hosted_domain` = build var `REACT_APP_HOSTED_DOMAIN` or `''`; provider client ID = build var `REACT_APP_CLIENT_ID`. `src/containers/auth/LoginForm.js:24`, `src/index.js:13`.
- On Google success the credential (`response.credential`) goes to `loginUser`. `src/containers/auth/LoginForm.js:40`, `src/actions/authActions.js:68-97`.
- On Google button error: `console.log` only, no message. `src/containers/auth/LoginForm.js:43`.
- Status mapping: SUCCESS → session start + `goBack()` (back to previous page); NEED_APPROVAL / WRONG_DOMAIN / FAILED → that message; any other status or a request error → FAILED message. `src/actions/authActions.js:74-95`.
- Messages: FAILED "Login failed. Try again later." red; WRONG_DOMAIN "Used email does not belong to given hosted domain." red; NEED_APPROVAL "Account needs to be approved by admin first." yellow; otherwise nothing. `src/components/LoginResultMessage.js:9-21`; red = `alert alert-danger` `src/components/ErrorMessage.js:6`, yellow = `alert alert-warning` `src/components/WarningMessage.js:6`.
- Angular: login page rendered in place of the whole app at any `/leaves/*` URL while no JWT; after login the app renders the same URL. `angular/src/app/app.component.html:3-10`.
- Angular Google button: Google Identity Services script `https://accounts.google.com/gsi/client`, `renderButton` theme `outline`, size `large`; client ID hardcoded in source. `angular/src/index.html:12`, `angular/src/app/login-page/login-page.component.ts:40-46`.
- Angular messages: same three texts and colors. `angular/src/app/login-page/login-page.component.ts:22-37`, `.html:2-7`.
- A new login attempt clears the previous message (Angular). `angular/src/app/state/auth.ts:42-48`.
- React menu shows "Login" (→ `/login`) when logged out. `src/containers/auth/MenuBar.js:26-28,81-83`.

**Constraints**:

- `/login` keeps working _(client answer: S6)_. Routing and the menu are owned by SETUP-02.
- UI copy = exact old English copy; keys translated to Slovak (NFR-L10N-01) _(client answer: A9)_.
- Google client ID and hosted domain become build-time configuration of the SPA. The Angular hardcoded client ID (`login-page.component.ts:42`) is removed. Suggested variable names `VITE_GOOGLE_CLIENT_ID` and `VITE_HOSTED_DOMAIN` (interview: suggested answer accepted). Both must hold the same values as server `CLIENT_ID` / `HOSTED_DOMAIN`.
- Google button library: Instea picks _(client answer: S3)_.

**Screens**:

- **URL** `/login`. Anyone can open it (also when logged in, as in old React).
- **Content**, top to bottom:
  1. Result message area (empty before any attempt).
  2. Google sign-in button. Hosted-domain hint = `VITE_HOSTED_DOMAIN` if set.
- **Messages** (exact copy):

| Last login result                        | Text                                               | Style            |
| ---------------------------------------- | -------------------------------------------------- | ---------------- |
| FAILED, unknown status, or request error | Login failed. Try again later.                     | error (red)      |
| WRONG_DOMAIN                             | Used email does not belong to given hosted domain. | error (red)      |
| NEED_APPROVAL                            | Account needs to be approved by admin first.       | warning (yellow) |
| none / SUCCESS                           | no message                                         | —                |

- **Actions**: Google button success → call `loginUser(token_id: <Google credential>)`. Google button error / popup closed → no message, log to console.
- **Loading**: no spinner in the old app; the button stays usable. A new attempt clears the old message.
- **After SUCCESS**: start the session (AUTH-04: store JWT, reset client cache, load user info, start refresh timer), then navigate to the location the user was on before reaching the login page. If the login page was the first page in the session, navigate to `/trips` (interview: suggested answer accepted — ; old React `goBack()` had no fallback, and `/` redirects to `/trips/` `src/App.js:26,34`).
- **Unauthenticated access to protected pages**: owned by SETUP-02. Requirement from this task: when SETUP-02 sends a logged-out user to the login page from a URL such as `/leaves/approval` (approval email link), SUCCESS must land on that original URL (Angular parity, `angular/src/app/app.component.html:3-10`).

**Permissions**:

| Action           | anon          | pending       | user          | admin         |
| ---------------- | ------------- | ------------- | ------------- | ------------- |
| Open `/login`    | UI allows     | UI allows     | UI allows     | UI allows     |
| Call `loginUser` | server allows | server allows | server allows | server allows |

**Acceptance criteria**:

- Given a logged-out user on `/login`, then the Google button shows and no message.
- Given the fake Google issuer returns a token for an unapproved user, when the user signs in, then "Account needs to be approved by admin first." shows in a yellow warning and the user stays on `/login`.
- Given `WRONG_DOMAIN`, then "Used email does not belong to given hosted domain." shows in red.
- Given `FAILED`, or the GraphQL request fails, then "Login failed. Try again later." shows in red.
- Given a failed attempt, when the user tries again, then the old message disappears until the new result arrives.
- Given an approved user who came from `/places`, when login succeeds, then the app shows `/places` with the logged-in menu.
- Given a logged-out user opening `/leaves/approval` as admin, when login succeeds, then the user lands on `/leaves/approval`.
- Given UI language Slovak, then the three messages show their Slovak translations.

**Tests**:

- Unit: status → message/style mapping (4 statuses + unknown + transport error).
- Integration (component with mocked Apollo): SUCCESS triggers AUTH-04 session start and navigation to previous location; fallback `/trips`.
- End-to-end (fake Google issuer, local stack): approved login → logged-in menu; new user → warning; wrong domain → red message.
- Old suite: `angular/src/app/login-page/login-page.component.spec.ts:7-36` only checks creation with a mocked `window.google`; reuse the idea of mocking the Google button.

#### AUTH-03 — Request auth context and guards

- **Type**: functional
- **Source**: `(rewrite spec: Features by area › Auth and session)` — "**[CHANGE]** Auth middleware never hangs a request on unexpected errors."
- **Source**: `(rewrite spec: Features by area › Auth and session)` — "**[PRESERVED BUG]** Invalid JWT is treated as anonymous; approval is not re-checked per request; denied calls return `null` (HTTP 200), not 401."
- **Source**: `(rewrite spec: User decisions › Migration strategy)` — "Old and new app share one MongoDB and one JWT signing key during the transition, so a session works across both."
- **Depends on**: SETUP-01, DATA-01, MIG-01

**Goal**: Every request to the new server gets an auth context: the logged-in User or anonymous. This task owns the JWT format (so tokens are interchangeable with the old app), the context resolution, and the three guards `userProtected`, `ownerProtected`, `adminProtected`. Denied calls return `null` with HTTP 200. Unexpected errors never leave a request hanging.

**Old behavior**:

- Key: `secrets/key.pem` (an RSA private key PEM, generated with `openssl genrsa -out ./secrets/key.pem 2048`) is read as raw bytes at module load, separately in two modules. `server/auth/operations.js:6`, `server/auth/setup.js:7`, `README.md:55`. The Docker image mounts it as volume `/opt/app/secrets/` `Dockerfile:39`. A missing file crashes the process at start.
- Signing: `jwt-node` 0.1.9 `jwt.create({sub: user.id}, key)` then `setExpiration(now + 1 hour in ms)`; `compact()` gives the token string. `server/auth/operations.js:8-19`, `yarn.lock:7741-7748`.
- Verification: `express-jwt` 5.3.0 with `secret: key` (Buffer) and `credentialsRequired: false`, mounted on path `/` (all routes registered after it). `server/auth/setup.js:20-23`, `server/index.js:39`. express-jwt uses `jsonwebtoken` 7.4.3 `yarn.lock:4963-4971,7665-7673`. With no `algorithms` option and a secret that contains neither `BEGIN CERTIFICATE` nor `BEGIN PUBLIC KEY`, jsonwebtoken 7 accepts only HS256/HS384/HS512 and uses the PEM file bytes as the HMAC secret. Since production logins work, the old tokens must be HMAC-signed with the PEM bytes (exact `alg` from `jwt-node`: HS256, verify before go-live, see Constraints).
- Order of middleware: `/download` static (no auth) → `cors()` → `POST /refresh-jwt` → express-jwt → user loader → error handler → `/graphql` → `/api/*` → `/health-check` → `/export/*` → SPA static. `server/index.js:34-63`.
- User loader: sets `req.context = {}`. If the decoded token has a `sub`, loads `User.findOne({id: sub})`; found → `req.context = {user}`; not found or DB error → stays anonymous. `server/auth/setup.js:24-39`.
- `approved` is not checked; an unapproved user with a valid token is a full user. `server/auth/setup.js:29-34`.
- Error handler: `UnauthorizedError` (missing/invalid/expired/malformed token) → `done()` → continue as anonymous. Any other error → handler never responds and never calls `done` → request hangs. `server/auth/setup.js:40-44`.
- GraphQL context = `req.context`. `server/index.js:40-45`.
- Guards (`server/auth/rootResolverDecorators.js`):
  - `userProtected` (`:1-8`): no `context.user` → return `null`.
  - `ownerProtected` (`:10-20`): no user → `null`; else sets `context.checkUserId = isAdmin ? () => true : (userId) => userId === context.user.id`, then runs the resolver.
  - `adminProtected` (`:22-29`): no user or `!isAdmin` → `null`.
  - Denial is a `null` field value, not a GraphQL error and not 401.
- REST `/export/*` returns 401 when `req.context.user` is missing `server/export/exportMiddleware.js:11` (owned by export tasks; it consumes this context).

**Constraints**:

- **[PRESERVED BUG]** invalid/expired JWT = anonymous; `approved` not re-checked per request; denial = `null` + HTTP 200 _(rewrite spec: Auth and session)_.
- **[CHANGE]** no hanging requests _(rewrite spec: Auth and session)_.
- JWT signing key shared with the old app during migration _(rewrite spec: Migration strategy; brief: resolved decisions)_. Both apps must read the **same key file bytes**. In k8s, mount the same Secret into both deployments. Key path is configuration: suggested env var `JWT_KEY_FILE`, default `secrets/key.pem` relative to the app root (interview: suggested answer accepted — ; SETUP-01 owns config loading). The file content is used byte-for-byte as the HMAC secret (no trimming, no PEM parsing).
- Algorithm: sign with **HS256** (interview: suggested answer accepted; verify before go-live — confirm by decoding the header of any current production token; the verifier side of the old app accepts HS256/HS384/HS512 only). Verify accepting HS256, HS384 and HS512 (parity with jsonwebtoken 7 defaults); reject `none` and asymmetric algorithms.
- JWT library: Instea picks _(client answer: S3)_.
- During migration step 1, `users` lives in the old database; the user loader reads it through the old-DB connection until step 2 _(client answer: S4)_.
- GraphiQL public and CORS all origins are preserved by the Operations tasks; they are not part of this task.

**Data model**: reads User `id`, `isAdmin`, `approved` (DATA-01). No writes.

JWT (owned here):

| part    | field              | type   | value                                         | notes                                                                                                      |
| ------- | ------------------ | ------ | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| header  | alg                | string | `HS256`                                       | (interview: suggested answer accepted; verify before go-live by decoding the header of a production token) |
| header  | typ                | string | `JWT`                                         |                                                                                                            |
| payload | sub                | string | User `id`                                     | may be absent only in tokens from `/refresh-jwt` garbage path (AUTH-05)                                    |
| payload | iat                | number | issue time, seconds                           | old library likely sets it; not relied upon                                                                |
| payload | exp                | number | issue time + 3600, seconds (floor of ms/1000) | required; checked with 0 s tolerance                                                                       |
| payload | other (e.g. `jti`) | any    | —                                             | new verifier must ignore unknown claims in old tokens                                                      |

Interchangeability rules: a token issued by either app must verify in the other. The old verifier checks signature, `exp`, and `nbf` if present; so new tokens must not contain `nbf` in the future, `aud` or `iss` claims are not needed.

**API**: Request auth context (applies to every route after it: `/graphql`, `/export/*`, `/health-check`, `/api/*`, SPA static; not `/download/*`, not `/refresh-jwt`).

- Token extraction: header `Authorization` split on one space into exactly two parts with scheme matching `Bearer` case-insensitively → token. Anything else (no header, `Basic ...` for the attendance API, wrong part count) → anonymous, no error.
- Verification failure (bad signature, disallowed alg, expired, malformed) → anonymous.
- Valid token without `sub` → anonymous.
- Valid token with `sub` → load User `{id: sub}`. Found → `context.user` = the full User (any `approved` value). Not found → anonymous. DB error → anonymous, log the error.
- **[CHANGE]** Any other unexpected error during context resolution → log it and continue as anonymous. The request always proceeds to its handler. No code path may leave the request without a response.
- Never responds 401 itself (REST handlers decide; e.g. export returns 401 for anonymous).

Guards (apply per GraphQL operation; each operation task names its guard):

| Guard            | Denied when                             | Denied result                                   | Extra                                                                                 |
| ---------------- | --------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------- |
| `userProtected`  | no `context.user`                       | field value `null`, HTTP 200, no `errors` entry | —                                                                                     |
| `ownerProtected` | no `context.user`                       | same                                            | exposes `checkUserId(userId)`: admin → always true; else `userId === context.user.id` |
| `adminProtected` | no `context.user` or `isAdmin !== true` | same                                            | —                                                                                     |

For a field whose GraphQL type is non-null, `null` propagates per GraphQL rules (same as old).

**Permissions**:

| Role    | How determined                                                                                                                   |
| ------- | -------------------------------------------------------------------------------------------------------------------------------- |
| anon    | no token, invalid/expired token, token without `sub`, or `sub` not in DB                                                         |
| pending | User with `approved=false`: never gets a JWT from login (AUTH-01) but is a full **user** if it holds a valid JWT (preserved bug) |
| user    | valid JWT whose `sub` matches a User                                                                                             |
| admin   | user with `isAdmin=true`                                                                                                         |

**Acceptance criteria**:

- Given a token signed by the old app (old key file, old library), when sent to the new `/graphql` `getUserInfo`, then the user is returned.
- Given a token signed by the new server, when the old app verifies it, then it is accepted (verified in migration rehearsal on the anonymized copy).
- Given an expired token, when calling `getUsers`, then `{"data":{"getUsers":null}}` with HTTP 200.
- Given a token signed with another key, then anonymous (`null`, HTTP 200).
- Given `Authorization: Basic ...`, then the request continues as anonymous with no error.
- Given a valid token whose user has `approved=false`, when `getUserInfo`, then the user is returned (preserved bug).
- Given a valid token whose user was removed, then anonymous.
- Given the user lookup throws (DB down), then the request completes as anonymous; the response is not delayed beyond the DB error.
- Given an unexpected exception in context resolution, then the request still gets a response.
- Given a non-admin, when calling an `adminProtected` mutation, then `null` with HTTP 200 and no DB change.

**Tests**:

- Unit: token extraction table; guard functions (anon/user/admin × three guards); `checkUserId` for admin and non-admin; JWT sign/verify round trip; `exp` = iat + 3600.
- Integration: compatibility fixture — a token produced with the old algorithm and a test key (HS256 over the PEM bytes) verifies in the new server and vice versa; expired / tampered / wrong-key / `alg: none` tokens → anonymous; DB failure during user load (stub) → anonymous and response returned; injected unexpected error → response returned (timeout assertion); unapproved user with token is treated as user; removed user → anonymous.
- End-to-end: covered by AUTH-04 (session survives reload, expired token → login).
- Old suite: none for auth.

#### AUTH-04 — Client session (storage, auto-login, refresh timer, logout)

- **Type**: functional
- **Source**: `(rewrite spec: Features by area › Auth and session)` — "JWT is kept in browser `localStorage`; app auto-logs-in on reload and logs out if the user info call returns nothing."
- **Source**: `(rewrite spec: Features by area › Auth and session)` — "JWT is refreshed every 15 minutes via `POST /refresh-jwt`." (client side)
- **Source**: `(rewrite spec: Features by area › Auth and session)` — "Logout removes the JWT and resets the client cache."
- **Source**: `(rewrite spec: Features by area › Auth and session)` — "**[CHANGE]** Refreshed JWT is always stored, the refresh timer runs after a fresh login too, and an expired stored JWT sends the user to login."
- **Depends on**: SETUP-02, AUTH-01, AUTH-03, AUTH-05

**Goal**: The SPA keeps the JWT in `localStorage` under key `jwt`, attaches it to every API request, auto-logs-in on reload, refreshes it every 15 minutes, and logs out cleanly. Three old session bugs are fixed.

**Old behavior**:

- Storage key `jwt` in `localStorage`, both SPAs. `src/actions/authActions.js:49`, `angular/src/app/state/auth.ts:4`, `angular/src/app/auth.service.ts:72-77`.
- Request header `Authorization: Bearer <jwt>` added when a JWT is in memory. React `src/singletons/apolloClient.js:7-19`; Angular GraphQL `angular/src/app/app.module.ts:109-117`, Angular HTTP `angular/src/app/services/JwtInterceptor.ts:18-25`.
- React start-up: if `localStorage.jwt` exists → `autologin` (store JWT, reset Apollo store, `getUserInfo`; if result non-null → user info stored) and start the refresh timer. If `getUserInfo` returns null, nothing happens: the JWT stays and the menu shows "Login". `src/core/init.js:24-31`, `src/actions/authActions.js:47-65`.
- React fresh login: `autologin(jwt, true)` but the timer is **not** started (only started in `doInit` at page load). `src/actions/authActions.js:78-79`, `src/core/init.js:27-30`.
- React refresh: every 15 min `POST /refresh-jwt` with `Authorization: Bearer <jwt or ''>`; on success puts the new token in Redux only, **not in `localStorage`**; errors ignored. `src/core/init.js:6-22`, `src/reducers/user.js:5-8`.
- Angular start-up: `AutologinAction` → if `localStorage.jwt` exists → `LoginSuccessfulAction` → store JWT, reset Apollo store, load `getUserInfo` (network-only); null → `LogoutAction`. `angular/src/app/app.module.ts:125`, `angular/src/app/state/auth.effects.ts:40-45,78-99`, `angular/src/app/auth.service.ts:40-50`.
- Angular refresh: after every LOGIN_SUCCESSFUL, every 15 min while a JWT is in memory, `POST /refresh-jwt`; the new token is stored in memory and `localStorage` and the Apollo store is reset. No error handling: one failed refresh ends the refresh stream. `angular/src/app/state/auth.effects.ts:68-76,101-105`, `angular/src/app/constants.ts:5,8`.
- Expired stored JWT: server treats it as anonymous; React stays half-logged-in; Angular logs out via the null `getUserInfo`. (`server/auth/setup.js:40-43`.)
- Logout: React removes `localStorage.jwt`, clears Redux user state, resets Apollo store, navigates to `/`. `src/actions/authActions.js:99-108`, `src/reducers/user.js:23-25`. Angular: removes JWT, resets Apollo store, shows login page. `angular/src/app/auth.service.ts:79-83`, `angular/src/app/state/auth.effects.ts:85-86`.
- Logout entry points: React dropdown "Sign out" `src/containers/auth/MenuBar.js:22`; Angular dropdown "Logout" `angular/src/app/nav-header/nav-header.component.html:36`.

**Constraints**:

- **[CHANGE]** refreshed JWT always stored; timer runs after fresh login; expired stored JWT → login _(rewrite spec: Auth and session)_.
- During migration step 1, the old React app at `/` and the new SPA at `/leaves/` share one origin, so they share `localStorage`. The key name must stay `jwt` and the value must stay the raw compact token string, so a session works across both apps _(rewrite spec: Migration strategy)_.
- Apollo Client 3 _(rewrite spec: §1 Frontend)_. Apollo client setup is owned by SETUP-02; this task defines the auth link behavior.

**Business rules**:

- **Current JWT**: one value held in memory and mirrored in `localStorage.jwt`. Every GraphQL request and every REST call (`/export/*`, `/refresh-jwt`) sends `Authorization: Bearer <current JWT>` when one exists; otherwise no header.
- **Expired**: a JWT is expired when its `exp` claim (decoded without signature check) ≤ current time in seconds, or when it cannot be decoded. (interview: suggested answer accepted — no clock-skew margin suggested.)
- **Start-up** (page load):
  1. No stored JWT → logged out.
  2. Stored JWT expired → remove it, reset client cache, navigate to `/login` keeping the current URL as the return location (AUTH-02).
  3. Otherwise → set as current JWT, reset client cache, call `getUserInfo` with network-only fetch.
     - Non-null → logged in, store user info, start the refresh timer.
     - Null → logout (below), navigate to `/login`.
     - Transport error → keep the JWT, show the shared error component (SETUP-02), retry `getUserInfo` on the next navigation (interview: suggested answer accepted).
- **Fresh login** (AUTH-02 SUCCESS): store JWT in memory and `localStorage`, reset client cache, call `getUserInfo`, start the refresh timer.
- **Refresh timer**: one timer only (restart replaces it). Every 15 minutes (900 000 ms), first tick 15 minutes after start:
  1. Current JWT expired → logout, navigate to `/login`.
  2. `POST /refresh-jwt` with `Authorization: Bearer <current JWT>`, empty body.
  3. HTTP 200 → response body is a JSON string; store it as current JWT in memory **and** `localStorage`. Do not reset the client cache (React parity, `src/reducers/user.js:5-8`).
  4. HTTP 401 → logout, navigate to `/login` (interview: suggested answer accepted).
  5. Network error / 5xx → keep the current JWT, keep the timer running, try again at the next tick.
- **Logout** ("Sign out"): remove `localStorage.jwt`, clear in-memory JWT and user info, stop the refresh timer, reset the Apollo cache (no refetch with the old token), navigate to `/` (React parity; SETUP-02 decides what a logged-out user sees there).

Worked example: login at 10:00 (exp 11:00). Refresh at 10:15 → new token exp 11:15 stored in `localStorage`. User reloads at 10:20 → stored token is valid → auto-login. Laptop sleeps 10:20–12:00; at wake-up the timer fires → token expired → user is sent to `/login`.

**Screens**: no own screen. Menu entries "Sign out" (React) / "Logout" (Angular) are merged by SETUP-02; this task provides the logout action.

**Acceptance criteria**:

- Given an approved user logs in, then `localStorage.jwt` holds the token and the logged-in menu shows.
- Given a fresh login (no reload), when 15 minutes pass, then `POST /refresh-jwt` is called and `localStorage.jwt` holds the new token.
- Given a valid stored JWT, when the page reloads, then the user is logged in without the login page.
- Given a stored JWT whose `exp` is in the past, when the page loads, then the JWT is removed and the login page shows; after login the user returns to the original URL.
- Given a stored JWT for a removed user, when the page loads, then `getUserInfo` returns null, the JWT is removed and the login page shows.
- Given a refresh call fails with a network error, then the session stays and the next tick tries again.
- Given the user clicks Sign out, then `localStorage.jwt` is removed, cached data is cleared, no further refresh calls happen, and the app shows `/`.
- Given the old app logged in at `/trips` in the same browser, when the user opens `/leaves/` (new SPA), then they are logged in (shared `localStorage.jwt`).

**Tests**:

- Unit: expiry check (exp past, exp future, undecodable); timer scheduling with fake timers (fresh login and auto-login both start it; restart replaces; logout stops); refresh outcomes 200 / 401 / network error; storage mirror on refresh.
- Integration (SPA with mocked server): start-up branches (none / expired / valid / null user / transport error); auth header on GraphQL and REST calls.
- End-to-end: login → reload → still logged in; set an expired token in `localStorage` → reload → login page; logout clears storage.
- Old suite: none (only `angular/src/app/auth.service.spec.ts:13-15` "should be created").

#### AUTH-05 — `POST /refresh-jwt` endpoint

- **Type**: functional
- **Source**: `(rewrite spec: Features by area › Auth and session)` — "JWT is refreshed every 15 minutes via `POST /refresh-jwt`." (server side)
- **Source**: `(rewrite spec: Features by area › Auth and session)` — "**[PRESERVED BUG]** `/refresh-jwt` issues a new token for expired or invalid tokens without checking the user or approval."
- **Depends on**: SETUP-01, AUTH-03

**Goal**: REST endpoint that takes the current JWT in the `Authorization` header and returns a new 1-hour JWT for the same `sub`. The old security bug is preserved: the token's signature, expiry, user existence and approval are not enforced.

**Old behavior**:

- Route `POST /refresh-jwt`, registered before the JWT middleware. `server/index.js:39`, `server/auth/setup.js:10-19`.
- Header check: `req.headers.authorization` exists and `split(' ')[0] === 'Bearer'` (case-sensitive) → token = `split(' ')[1]`; else HTTP 401 with empty body. `server/auth/setup.js:12-17`.
- `refreshJwt(token)`: `jwt-node` `verify(token, key, cb)`; `user = {}`; on success `user.id = res.body.sub`; on error with `err.parsedBody` `user.id = err.parsedBody.sub`; always resolves `createJwt(user)`. `server/auth/operations.js:21-35`.
- `createJwt({})` gets a truthy object, so it always signs `{sub: user.id}` with 1-hour expiry; with `user.id` undefined the payload has no `sub`. `server/auth/operations.js:8-18`.
- Response `res.json(jwt.compact())` → HTTP 200, `Content-Type: application/json`, body = JSON string of the token (e.g. `"eyJ..."`). Promise rejection (e.g. a synchronous throw inside `verify`) → 401 empty body. `server/auth/setup.js:14`.
- No DB access: user existence and `approved` are never checked.
- Whether `jwt-node` sets `err.parsedBody` on signature mismatch is unknown statically (analysis open question 1; spec A1 marked "Not relevant" by the client, so the behavior stays as coded).

**Constraints**:

- **[PRESERVED BUG]** kept 1:1 _(rewrite spec: Auth and session; brief: security bugs preserved 1:1)_.
- Token format from AUTH-03.
- Not subject to the request auth context (AUTH-03) and not to CORS restrictions beyond the preserved "all origins".

> Security warning: with the rule below, anyone can turn a self-made token carrying any user's `sub` into a valid signed token for that user. This is a full authentication bypass. It is preserved because the client chose 1:1 preservation of security bugs (A1 "Not relevant").

**API**:

- `POST /refresh-jwt`
  - Input: header `Authorization: Bearer <token>`. Body ignored.
  - Output: HTTP 200, JSON string body = new compact JWT (AUTH-03 format, `exp` = now + 3600 s).
  - Errors: header missing, or first space-separated part not exactly `Bearer` (case-sensitive) → HTTP 401, empty body.
  - Rule for `sub` (interview: suggested answer accepted — , suggested to match the coded path assuming the njwt-style library fills `parsedBody` whenever header and body parse):
    1. Token verifies (signature + not expired) → `sub` from token.
    2. Token is structurally parseable (three dot-separated base64url segments, header and payload are JSON objects) but fails verification for any reason (expired, wrong signature, other key, other alg) → `sub` taken from the unverified payload.
    3. Token not parseable (garbage, empty string, missing second header part) → new token **without** `sub`. HTTP 200. Such a token is anonymous in AUTH-03.
    4. Payload has no `sub` → new token without `sub`.
  - Auth guard: none. No user lookup; no approval check.
  - Side effects: none (no DB, no audit).

**Permissions**:

| Caller                         | UI allows                           | Server enforces          |
| ------------------------------ | ----------------------------------- | ------------------------ |
| any holder of any token string | logged-in SPA calls it every 15 min | no check (preserved bug) |
| no `Bearer` header             | —                                   | 401                      |

**Acceptance criteria**:

- Given a valid token for user U, when `POST /refresh-jwt`, then 200 and a JSON string token with `sub = U.id` and a later `exp`.
- Given a token expired 3 days ago for U, then 200 and a new valid token for U.
- Given a token for U signed with a different key, then 200 and a new token for U signed with the server key (preserved bug).
- Given a valid token for a removed or unapproved user, then 200 and a new token with that `sub`.
- Given `Authorization: Bearer garbage`, then 200 and a token with no `sub`; using it on `getUserInfo` returns `null`.
- Given no `Authorization` header, or `Authorization: bearer x`, or `Authorization: Basic x`, then 401 with empty body.
- Given a token issued by the old app, then the new endpoint refreshes it (shared key).

**Tests**:

- Unit: `sub` extraction rule for each case 1–4.
- Integration (HTTP): every acceptance case above; response `Content-Type` JSON and body is a quoted string; resulting token accepted by AUTH-03 when it has a `sub` of an existing user.
- End-to-end: covered by AUTH-04 refresh flow.

#### AUTH-06 — CLI promote user

- **Type**: functional
- **Source**: `(rewrite spec: Features by area › Auth and session)` — "CLI command promotes a user (by email) to admin and approved."
- **Depends on**: SETUP-01, DATA-01

**Goal**: An operator promotes an existing user to admin and approved from the command line, without starting the HTTP server. This bootstraps the first admin after their first Google login.

**Old behavior**:

- `node server/index.js --email <email>` (minimist; `--email=<email>` also works). If `argv.email` is truthy the script runs `promoteUser` and returns before the HTTP server starts. `server/index.js:16-21`, script `yarn promote-user` = `node server/index.js` `package.json:55`, documented `yarn promote-user --email=<google_email>` `README.md:60-69`.
- The script still loads `server/auth/setup.js` before the argument check, so `secrets/key.pem` must exist even for the CLI. `server/index.js:7,18`, `server/auth/setup.js:7`.
- DB connection from `MONGO_URL` (default `mongodb://localhost/data`); connect failure → `Connect to database failed -> exiting`, exit code -1. `server/db/connect.js:7,12-19`.
- On DB `open`: `User.findOneAndUpdate({email}, {$set: {approved: true, isAdmin: true}})`. Found → prints `User with email '<email>' promoted to admin and approved.`, exit 0. Not found → `User with email '<email>' not found.`, exit 1. Error → prints the error, exit 1. `server/db/promoteUser.js:4-18`.
- Email match is exact (case-sensitive).

**Constraints**:

- Must run inside the k8s pod of the new server image (e.g. `kubectl exec`), using the same config (env vars) as the server. Entry point / command name owned by SETUP-01; the `--email <email>` and `--email=<email>` argument forms must keep working.
- The CLI must not require the JWT key file (the old dependency was accidental).
- During migration, the CLI writes to the database that currently holds the `users` collection (old DB until step 2) _(client answer: S4)_.
- Audit log: not required (spec NFR lists user edit/approve/remove via the app); optional entry with actor `CLI` (interview: suggested answer accepted).

**API** (CLI):

- Input: `--email <email>` (string, required for promote mode).
- Effect: set `approved = true` and `isAdmin = true` on the User with that exact email. Other fields unchanged.
- Output (stdout, exact):
  - found: `User with email '<email>' promoted to admin and approved.` → exit 0
  - not found: `User with email '<email>' not found.` → exit 1
  - DB error: error message → exit 1
  - DB connect failure: exit non-zero (old: -1, i.e. 255)
- Does not start the HTTP server; exits after the operation.

**Acceptance criteria**:

- Given a user `a@instea.co` with `approved=false, isAdmin=false`, when the CLI runs with `--email=a@instea.co`, then both flags are true, the message prints and exit code is 0.
- Given no user with that email, then `User with email 'x@y.z' not found.` and exit code 1, and no document changes.
- Given `A@instea.co` but the stored email is `a@instea.co`, then not found (exact match).
- Given the CLI runs, then no HTTP port is opened.
- Given the promoted user logs in, then `SUCCESS` (AUTH-01).

**Tests**:

- Integration (real MongoDB): found / not found / case mismatch; exit codes; no server started.
- End-to-end: first-admin bootstrap in the local docker-compose: Google fake login → NEED_APPROVAL → CLI → login SUCCESS and "Users" menu visible.

#### AUTH-07 — Client recovers after API errors

- **Type**: functional
- **Source**: `(rewrite spec: Features by area › Auth and session)` — "**[CHANGE]** Client data loading recovers after an API error without a page reload."
- **Depends on**: SETUP-02, AUTH-04

**Goal**: A failed API call (network error, HTTP 5xx, GraphQL error) affects only that call. The user sees an error, and the next action, navigation or refetch makes a new request and works when the server is healthy again. No page reload is needed.

**Old behavior**:

- Angular NgRx effects without error handling: an error inside `switchMap` terminates the effect stream, so later actions of that type do nothing until reload.
  - add / approve / reject leave: `angular/src/app/state/leave.effects.ts:28-45`.
  - login, refresh, load user info: `angular/src/app/state/auth.effects.ts:47-76,88-99`.
  - The detail export effect does catch errors (`angular/src/app/state/leave.effects.ts:47-60`), which shows the intended pattern.
- Angular `UsersService.getUsers` maps `data.getUsers` from a `watchQuery` without error handling `angular/src/app/services/users.service.ts:22-26`.
- React: queries show a red error alert with the message via `withProgress` (`src/components/withProgress.js:14-22`); mutations in `src/actions/userActions.js:43-78` have no error handling (no message).

**Constraints**:

- **[CHANGE]** _(rewrite spec: Auth and session; analysis §8 Risks)_.
- Shared error/loading components and Apollo setup are owned by SETUP-02. Screen-specific error copy stays with each screen task (e.g. "Error while fetching list: <msg>").

**Business rules**:

- Queries: on error, show the screen's error state. Navigating away and back, or a Retry action of the shared error component, issues a new request. A cached error must not block a later successful fetch.
- Mutations: on error, the screen stays usable; the action can be repeated. Where the old screen had no error copy, show the shared error component with the server message (interview: suggested answer accepted — on exact copy).
- Session flows (login, user info, refresh) recover per AUTH-02 and AUTH-04: a failed login shows "Login failed. Try again later." and the next attempt works; a failed refresh does not stop the timer.
- No long-lived client stream or subscription may terminate permanently because of one failed request.

**Acceptance criteria**:

- Given the server returns 500 for one `createLeave`, when the user submits again after the server recovers, then the leave is created without reload.
- Given `getUsers` fails once on `/users`, when the admin navigates away and back (or retries), then the list loads.
- Given one login request fails at network level, when the user signs in again, then the login proceeds normally.
- Given one refresh call fails, then the next refresh 15 minutes later is sent.
- Given approve leave fails once, then a second Approve click sends a new request.

**Tests**:

- Unit: error handling of the client data layer (failed request followed by success).
- Integration (SPA against a fake server that fails the first call then succeeds): one test per area: leave add, leave approve/reject, users list, login, refresh.
- End-to-end: stop the API container briefly, perform an action, restart, repeat the action without reload.

### Area: Users

#### USR-01 — Users list (admin) and user read visibility

- **Type**: functional
- **Source**: `(rewrite spec: Features by area › Users)` — "Admin lists users: Email, Name (`surname[, firstName][, degrees]`), Is admin, Is approved."
- **Source**: `(rewrite spec: Features by area › Users)` — "**[CHANGE]** Regular users can read only their own user record; admin reads all."
- **Depends on**: AUTH-03, DATA-01, SETUP-02, NFR-L10N-01

**Goal**: Admins see all users on `/users` with Remove, Edit and Approve controls. User read operations are restricted: regular users can read only their own record via `getUser` / `getUsers`; admins read all.

**Old behavior**:

- `getUserInfo`: `userProtected`, returns the caller's record (`getUserOrDefault(context.user.id)`). `server/graphql/userRelated.js:15`.
- `getUser(id)`: `userProtected`, any logged-in user reads any id; unknown id → placeholder (USR-05). `server/graphql/userRelated.js:17`, `server/service/userService.js:17-18`.
- `getUsers`: `userProtected`, returns all users, no sort (`User.find({})`). `server/graphql/userRelated.js:19`.
- `Trip.user` resolves through the root `getUser` resolver (so it passes the `userProtected` guard). `server/graphql/tripRelated.js:11`. `Leave.requester` / `Leave.approver` use `getUserOrDefault` directly, without a guard. `server/graphql/leaveRelated.js:60-61`.
- `/users` page: admin only in UI; non-admin sees "You are not authorized to view this page!". `src/containers/users/UserList.js:14,46`, `src/components/Unauthorized.js:6`.
- Header "Users"; table columns Email, Name, Is admin, Is approved, Controls. `src/containers/users/UserList.js:17-27`.
- Name = `surname` + (`, firstName` if non-empty) + (`, degrees` if non-empty). `src/containers/users/UserList.js:31`.
- Is admin / Is approved: `Yes` / `No`. `src/containers/users/UserList.js:32-33`.
- Controls: "Remove" (red), "Edit" (blue) → `/users/edit/<id>`, "Approve" (green, only if not approved). `src/containers/users/UserList.js:35-39,50-54`.
- Query `GetUsers { id, firstName, surname, degrees, isAdmin, approved, email }`. `src/containers/users/UserList.js:56-68`.
- Loading indicator while loading; error "Error while fetching list: <message>". `src/containers/users/UserList.js:77-82`, `src/components/withProgress.js:16-22`.
- Menu "Users" with lock icon, shown only to admins. `src/containers/auth/MenuBar.js:36,48-57`.
- Other consumers of `getUsers`:
  - Trip form "Who:" and travel-warrant export "Who:" use `UserCombobox`; for non-admin it already filters the list to self. `src/components/ConnectedComboboxes.js:34-56`, `src/containers/trips/TripForm.js:32`, `src/containers/export/ExportForm.js:27`.
  - Angular detail export "User" select lists **all** users for everyone; default = the user whose email equals the caller's email. `angular/src/app/services/users.service.ts:7-26`, `angular/src/app/leaves/leaves-export/leaves-export.component.ts:44-56`.

**Analysis mismatch**: Analysis §2.4 lists the React menu as "Trips", "Places", "Export", then "Users". Code order is Trips, Places, Users, Export (`src/containers/auth/MenuBar.js:33-38`). SETUP-02 owns the menu; noted for its order.

**Constraints**:

- **[CHANGE]** regular users read only their own record _(interview: Data visibility; confirmed over A10)_.
- Export endpoints still accept any `userId` _(client answer: S5)_; only the read API changes.
- Shape of `User` type unchanged: `{id: String!, email: String!, approved: Boolean, isAdmin: Boolean!, firstName, surname, degrees, address}` `server/graphql/schema.js:94-99`.
- UI copy exact; translated to Slovak (NFR-L10N-01).

**API**:

- `query getUserInfo: User` — guard `userProtected`. Returns the caller's record. Unchanged.
- `query getUser(id: String!): User` — guard `userProtected`, then:
  - admin: record with that id; unknown id → placeholder (USR-05).
  - non-admin, `id === caller.id`: own record.
  - non-admin, other id: `null`, HTTP 200 (interview: suggested answer accepted — ; suggested to match guard-denial semantics of AUTH-03).
- `query getUsers: [User]` — guard `userProtected`, then:
  - admin: all users, DB natural order (no sort, as old).
  - non-admin: a list with exactly one element, the caller's own record.
- Nested `Trip.user`, `Leave.requester`, `Leave.approver`: keep returning the referenced user (or placeholder) without the visibility filter (interview: suggested answer accepted). Reason: regular users see only their own trips and leaves, but the leave "Approver" column must still show the admin's name; `Trip.user` is non-null (`User!`) and must not become null.

**Screens**:

- **URL** `/users`. Admin only. Non-admin or logged-out: "You are not authorized to view this page!" (shared Unauthorized component, SETUP-02).
- **Header**: "Users".
- **Table** columns (exact labels): `Email`, `Name`, `Is admin`, `Is approved`, `Controls`.
  - Name: `surname`, then `, firstName` if firstName non-empty, then `, degrees` if degrees non-empty. Missing surname renders as empty text (e.g. `, Jan`).
  - Is admin / Is approved: `Yes` / `No`.
  - Controls: `Remove` (danger style, USR-03), `Edit` (info style → `/users/edit/<id>`, USR-04), `Approve` (success style, only when `approved` is false, USR-02).
- **Loading**: shared loading indicator. **Error**: "Error while fetching list: <message>". **Empty**: table header only.
- **Menu**: "Users" with lock icon, visible to admins only (SETUP-02 renders; this task supplies the rule).

**Permissions**:

| Action              | anon             | user                | admin                 |
| ------------------- | ---------------- | ------------------- | --------------------- |
| Open `/users`       | UI: Unauthorized | UI: Unauthorized    | UI allows             |
| `getUserInfo`       | server: null     | server: own         | server: own           |
| `getUser(own id)`   | null             | own record          | own record            |
| `getUser(other id)` | null             | **null** (change)   | record or placeholder |
| `getUsers`          | null             | **[self]** (change) | all                   |

**Acceptance criteria**:

- Given an admin on `/users` and users `{surname: "Novák", firstName: "Ján", degrees: "Ing."}` and `{surname: "Kováč"}`, then names show `Novák, Ján, Ing.` and `Kováč`.
- Given an unapproved user, then its row shows `No` under Is approved and an "Approve" button; approved rows have no Approve button.
- Given a non-admin opens `/users`, then "You are not authorized to view this page!" shows.
- Given a non-admin calls `getUsers`, then the result is a one-element list with their own record.
- Given a non-admin calls `getUser` with another user's id, then `null` with HTTP 200.
- Given an admin calls `getUser` with an unknown id `abc`, then the placeholder (USR-05).
- Given a non-admin on the trip form or travel-warrant export, then the "Who:" picker lists only themselves (unchanged).
- Given a non-admin on the detail export (`/leaves/export`), then the "User" picker lists only themselves (changed; see Gaps).
- Given a non-admin's own leave approved by an admin, then the leave list "Approver" column still shows the admin's name.
- Given `getUsers` fails, then "Error while fetching list: <message>" shows.

**Tests**:

- Unit: name formatting (all combinations of empty firstName/degrees/surname).
- Integration: `getUser` / `getUsers` / `getUserInfo` for anon, user, admin (permission table); nested `Leave.approver` and `Trip.user` for a regular user.
- End-to-end: admin sees list; non-admin sees Unauthorized; non-admin detail-export picker shows only self.

#### USR-02 — Approve user

- **Type**: functional
- **Source**: `(rewrite spec: Features by area › Users)` — "Admin approves an unapproved user, who can then log in."
- **Depends on**: USR-01, AUTH-01, AUTH-03, NFR-PRV-01

**Goal**: An admin clicks "Approve" on an unapproved user in `/users`. The server sets `approved = true`; the user's next login returns SUCCESS.

**Old behavior**:

- `approveUser(id: String!): User`, `adminProtected`; `findOneAndUpdate({id}, {$set: {approved: true}}, {new: true})` → updated User, or `null` if no user has that id. `server/graphql/userRelated.js:82-84`, `server/graphql/schema.js:139`.
- No state precondition (approving an approved user is a no-op success).
- Client: "Approve" (green) only for unapproved rows, no confirmation; mutation selects `{id, approved}`; no refetch. `src/containers/users/UserList.js:38,53`, `src/actions/userActions.js:31-41,70-78`.

**Constraints**:

- Audit log entry required (NFR-PRV-01).

**API**:

- `mutation approveUser(id: String!): User`
  - Guard: `adminProtected` (non-admin/anon → `null`, HTTP 200, no change).
  - Effect: set `approved = true` on the User with that `id`.
  - Output: the updated User; `null` if not found.
  - Side effects: audit-log entry "user approve" with actor, time, target user id (NFR-PRV-01), written only when a user was updated.

**Screens**: `/users` row "Approve" button (USR-01). After success, the row shows `Yes` under Is approved and the Approve button disappears without reload (Apollo cache update from the returned `{id, approved}` or a refetch of `getUsers`).

**Permissions**:

| Action       | user                                    | admin                    |
| ------------ | --------------------------------------- | ------------------------ |
| Approve user | UI: no access to `/users`; server: null | UI allows; server allows |

**Acceptance criteria**:

- Given an admin and an unapproved user U, when "Approve" is clicked, then U's row shows `Yes`, the button disappears, and U's next login returns SUCCESS.
- Given a non-admin calls `approveUser`, then `null`, HTTP 200, U unchanged, no audit entry.
- Given an unknown id, then `null` and no audit entry.
- Given approval, then one audit-log entry records the admin, time and U's id.

**Tests**:

- Integration: admin / non-admin / anon / unknown id; audit entry presence; login after approve returns SUCCESS (fake Google issuer).
- End-to-end: new user login → NEED_APPROVAL; admin approves on `/users`; user logs in.

#### USR-03 — Admin edits and removes users; `updateUser` preserved bug

- **Type**: functional
- **Source**: `(rewrite spec: Features by area › Users)` — "Admin edits and removes users."
- **Source**: `(rewrite spec: Features by area › Users)` — "**[PRESERVED BUG]** Any user can update any user's email, approved flag and names via `updateUser`; only `isAdmin` is protected."
- **Depends on**: USR-01, AUTH-03, SETUP-01, DATA-01, NFR-PRV-01

**Goal**: `updateUser` and `removeUser` keep their old contracts. Admins edit any user (including the admin flag) and remove users. The ownership check in `updateUser` stays broken: any logged-in user can update any user's fields except `isAdmin`.

**Old behavior**:

- `updateUser(id: String!, user: UserInput): Result`, `ownerProtected`. `server/graphql/userRelated.js:70-79`, `server/graphql/schema.js:130`.
  - `if (!context.checkUserId)` tests that the function exists, which is always true after `ownerProtected`, so the "Not authorized" branch is dead. `server/graphql/userRelated.js:71-76`.
  - `userData = pick(user, [id, firstName, surname, degrees, address, email, approved])` plus `isAdmin = !!user.isAdmin` only when the caller is admin. `server/graphql/userRelated.js:77`, `src/data/User.js:3-6`. (`UserInput` has no `id` field, so `id` cannot be set over GraphQL `server/graphql/schema.js:13-20,90-92`.)
  - `findOneAndUpdate({id}, {$set: userData})` → `{success: true}` even if no document matched; DB error → `{success: false, message: err.message}`. `server/graphql/userRelated.js:78`, `server/graphql/utils.js:1-10`.
- `UserInput`: `isAdmin: Boolean!` (required by GraphQL), `approved: Boolean`, `firstName`, `surname`, `degrees`, `address`, `email: String`. `server/graphql/schema.js:13-20`.
- `removeUser(id: String!): Result`, `adminProtected`; `findOneAndRemove({id})`; `{success: true}` even if not found. Trips and leaves of the removed user stay (they show the placeholder, USR-05). `server/graphql/userRelated.js:81`.
- Client remove: "Remove" (red), no confirmation; refetch `GetUsers`. `src/actions/userActions.js:19-29,60-68`.
- Client edit: see USR-04 (`src/actions/userActions.js:7-17,43-58`).

**Constraints**:

- **[PRESERVED BUG]** any logged-in user may update any user's `email`, `approved`, `firstName`, `surname`, `degrees`, `address` _(rewrite spec: Users; brief: security bugs preserved 1:1)_.
- `Result` type `{success, message, payload}` owned by SETUP-01.
- Server enforces no field validation (preserved; spec Data and validation).
- Audit log for edit and remove (NFR-PRV-01).
- Personal data erasure (deleting trips and leaves too) is a separate NFR-PRV task; `removeUser` keeps the old behavior and does not delete trips/leaves _(client answer: S9 applies to erasure only)_.

**API**:

- `mutation updateUser(id: String!, user: UserInput): Result`
  - Guard: `ownerProtected`. Anonymous → `null`. Any logged-in user (admin or not, approved or not) → proceeds for **any** `id` (preserved bug).
  - Fields written (`$set`): each of `firstName`, `surname`, `degrees`, `address`, `email`, `approved` that is present in the input (explicit `null` writes null; omitted fields stay unchanged). `isAdmin` is written only when the caller is admin, as `true`/`false`; for non-admin callers it is ignored.
  - Output: `{success: true}` when the update ran (also when no user has that id); `{success: false, message: <DB error message>}` on DB error (e.g. duplicate email on the unique index).
  - Side effects: audit-log entry "user edit" with actor, time, target id (NFR-PRV-01), when a user document was matched.
- `mutation removeUser(id: String!): Result`
  - Guard: `adminProtected` (else `null`).
  - Effect: delete the User with that `id`. Trips and leaves stay.
  - Output: `{success: true}` (also when not found); `{success: false, message}` on DB error.
  - Side effects: audit-log entry "user remove" (NFR-PRV-01) when a user was deleted. An admin may remove themself.
- `mutation createUser(user: UserInput): User` — in the old SDL with no resolver, always `null` `server/graphql/schema.js:129`. Keep in the schema returning `null` for schema parity (interview: suggested answer accepted — ; dead operation).

**Screens**:

- `/users` "Remove": immediate (no confirmation), then the list refetches.
- `/users` "Edit" → `/users/edit/<id>` (USR-04). Admin sees "Is admin:" checkbox.

**Permissions**:

| Action                                                     | anon | user                                                        | admin                    |
| ---------------------------------------------------------- | ---- | ----------------------------------------------------------- | ------------------------ |
| Update own profile fields                                  | null | UI allows; server allows                                    | UI allows; server allows |
| Update another user's email/approved/names/degrees/address | null | UI blocks (Unauthorized); **server allows** (preserved bug) | UI allows; server allows |
| Change `isAdmin`                                           | null | UI hidden; server ignores                                   | UI allows; server allows |
| Remove user                                                | null | UI blocks; server null                                      | UI allows; server allows |

**Business rules**: Worked examples:

- Non-admin A calls `updateUser(id: B, user: {isAdmin: true, approved: false, email: "x@instea.co"})` → `{success: true}`; B gets `approved=false`, `email="x@instea.co"`; B's `isAdmin` unchanged.
- Admin calls `updateUser(id: B, user: {isAdmin: false})` → B loses admin; other fields unchanged.
- B's email changed → B's next Google login does not find B (AUTH-01 worked example).

**Acceptance criteria**:

- Given an admin edits user B and sets "Is admin", then B is admin after save.
- Given non-admin A calls `updateUser` for B with `approved: false`, then `{success: true}` and B is unapproved (preserved bug).
- Given non-admin A calls `updateUser` for self with `isAdmin: true`, then `{success: true}` and A is still not admin.
- Given anon calls `updateUser`, then `null`.
- Given `updateUser` for an unknown id, then `{success: true}` and nothing changes.
- Given `updateUser` sets an email already used by another user, then `{success: false, message: <duplicate-key message>}`.
- Given an admin removes B, then B is gone, `{success: true}`, B's trips and leaves remain and show the placeholder.
- Given non-admin calls `removeUser`, then `null` and nothing changes.
- Given edit and remove, then audit-log entries exist for each.

**Tests**:

- Integration: full permission table; field-by-field `$set` behavior (present, null, omitted); unknown id; duplicate email; remove keeps trips/leaves; audit entries.
- End-to-end: admin edits a user's admin flag; admin removes a user.

#### USR-04 — Own profile edit screen

- **Type**: functional
- **Source**: `(rewrite spec: Features by area › Users)` — "User edits own profile (first name, surname, degrees, address); email and approved are read-only; "Is admin" is hidden for non-admins."
- **Source**: `(rewrite spec: Features by area › Users)` — "**[PRESERVED BUG]** User edit page has an empty header, and after save a non-admin lands on `/users` and sees "You are not authorized to view this page!"."
- **Depends on**: USR-01, USR-03, SETUP-02, NFR-L10N-01

**Goal**: `/users/edit/:id` shows the user form for the user's own record (any user) or any record (admin). It saves through `updateUser`. The empty header and the post-save redirect to `/users` are preserved.

**Old behavior**:

- Route `/users/edit/:id` → `EditUserForm`. `src/App.js:40`.
- Menu dropdown "Profile" → `/users/edit/<ownId>`. `src/containers/auth/MenuBar.js:21`.
- Loads `getUser(id) { firstName, surname, degrees, address, isAdmin, email, approved }`; loading indicator; error "Error while fetching the user: <message>". `src/containers/users/EditUserForm.js:29-57`.
- Access: if not admin and own id ≠ `:id` → "You are not authorized to view this page!". `src/containers/users/UserForm.js:19-21`.
- Header: `PageHeader` with no `header` prop → empty header. `src/containers/users/UserForm.js:17,26`.
- Fields in order: "Email:" text, disabled; "First name:"; "Surname:"; "Degrees:"; "Address:" textarea; "Is approved:" checkbox, disabled; "Is admin:" checkbox, only for admins. `src/containers/users/UserForm.js:29-35`.
- No client validation. `src/containers/users/UserForm.js:67-69`.
- Buttons: "Save" (primary, submit), "Cancel" (danger, history back). `src/containers/users/UserForm.js:39-40,55`.
- Save sends `updateUser(id: :id, user: {firstName, surname, degrees, address, email, approved, isAdmin})` with the current form values (email/approved unchanged; `isAdmin` = loaded value for non-admin, ignored by server); refetches `GetUsers`, `GetUser`; navigates to `/users` immediately, without waiting for the result. `src/containers/users/EditUserForm.js:21-26`, `src/data/User.js:3-6`, `src/actions/userActions.js:7-17,43-58`.
- On `/users` a non-admin sees "You are not authorized to view this page!" (`src/containers/users/UserList.js:46`).

**Constraints**:

- **[PRESERVED BUG]** empty header; post-save navigation to `/users` for everyone _(rewrite spec: Users)_.
- With USR-01, a non-admin opening another id gets Unauthorized from the UI check first; the API would return `null` anyway.
- UI copy exact; translated to Slovak (NFR-L10N-01). URL `/users/edit/:id` kept _(client answer: S6)_.

**Screens**:

- **URL** `/users/edit/:id`. Who: admin (any id) or the user whose id = `:id`. Others: "You are not authorized to view this page!".
- **Header**: page header element rendered with empty text (preserved).
- **Fields** (labels exact; initial values from `getUser`):

| Label        | Control  | Editable      | Shown to   |
| ------------ | -------- | ------------- | ---------- |
| Email:       | text     | no (disabled) | all        |
| First name:  | text     | yes           | all        |
| Surname:     | text     | yes           | all        |
| Degrees:     | text     | yes           | all        |
| Address:     | textarea | yes           | all        |
| Is approved: | checkbox | no (disabled) | all        |
| Is admin:    | checkbox | yes           | admin only |

- **Validation**: none.
- **Actions**: "Save" → `updateUser` with `{firstName, surname, degrees, address, email, approved, isAdmin}` (isAdmin = checkbox value for admin, loaded value for non-admin), refetch user list and user, navigate to `/users` immediately. "Cancel" → browser history back.
- **States**: loading → shared indicator; load error → "Error while fetching the user: <message>"; unknown id (admin) → form shows placeholder values (USR-05).
- **After save**: admin sees the users list; non-admin sees "You are not authorized to view this page!" (preserved).

**Permissions**:

| Action                     | user (own id)   | user (other id) | admin           |
| -------------------------- | --------------- | --------------- | --------------- |
| Open page                  | UI allows       | UI Unauthorized | UI allows       |
| Edit names/degrees/address | allowed         | — (UI)          | allowed         |
| Edit email / approved      | read-only in UI | —               | read-only in UI |
| Edit isAdmin               | hidden          | —               | allowed         |

**Acceptance criteria**:

- Given a non-admin opens Profile, then `/users/edit/<ownId>` shows Email and Is approved disabled, no "Is admin:", and an empty header.
- Given they change Surname and click Save, then the surname is saved, the app navigates to `/users`, and "You are not authorized to view this page!" shows.
- Given an admin edits another user, then "Is admin:" is visible and editable, and after Save the users list shows the change.
- Given a non-admin opens `/users/edit/<otherId>`, then "You are not authorized to view this page!".
- Given Cancel, then the previous page shows and nothing is saved.
- Given `getUser` fails, then "Error while fetching the user: <message>".

**Tests**:

- Unit: form visibility rules (admin vs non-admin; own vs other id); payload built on save.
- Integration (component + mocked Apollo): save sends the expected variables and navigates to `/users` before the mutation resolves.
- End-to-end: non-admin profile edit flow including the preserved Unauthorized after save; admin edit flow.

#### USR-05 — Deleted-user placeholder

- **Type**: functional
- **Source**: `(rewrite spec: Features by area › Users)` — "Trips and leaves of a deleted user show placeholder "Deleted" / id / `<id>@deleted.instea.co`."
- **Depends on**: DATA-01

**Goal**: Whenever the server resolves a user by id and no User exists, it returns a placeholder user instead of null, so trips, leaves, exports and emails of removed users still render.

**Old behavior**:

- `getUserOrDefault(id)`: `User.findOne({id})`; found → user; not found and `id` truthy → `{id, email: '<id>@deleted.instea.co', firstName: 'Deleted', surname: '<id>', isAdmin: false, approved: false}`; `id` falsy → `undefined` (GraphQL `null`). `server/service/userService.js:3-18`.
- Used by: `getUserInfo`, `getUser` (`server/graphql/userRelated.js:15,17`); `Trip.user` via `getUser` (`server/graphql/tripRelated.js:11`); `Leave.requester`, `Leave.approver` (`server/graphql/leaveRelated.js:60-61`); detail export (`server/export/exportDetail.js:20`); pending-leave email (`server/service/mailService.js:18`).
- Not used by the travel-warrant export, which uses `User.findOne` directly (`server/export/exportTravelWarrant.js:33`); owned by the export task.

**Constraints**: placeholder is not stored in the DB. Shared server service used by Trips, Leaves, exports and mail tasks.

**Data model**: placeholder User (not persisted):

| field     | value                    |
| --------- | ------------------------ |
| id        | the requested id         |
| email     | `<id>@deleted.instea.co` |
| firstName | `Deleted`                |
| surname   | the requested id         |
| degrees   | absent (null)            |
| address   | absent (null)            |
| isAdmin   | `false`                  |
| approved  | `false`                  |

**Business rules**:

- Missing or empty id (e.g. `approverId` of a pending leave) → `null`, not a placeholder.
- Example: trip with `userId = "1057"` and no such user → trips table "Who" shows `1057, Deleted` (Who = `surname, firstName`).

**Acceptance criteria**:

- Given a leave whose requester was removed, when listing leaves, then requester = `{firstName: "Deleted", surname: <id>, email: "<id>@deleted.instea.co"}`.
- Given a pending leave with no approver, then `approver` is `null`.
- Given an admin calls `getUser("abc")` for a non-existent id, then the placeholder for `abc`.
- Given a trip of a removed user, then `Trip.user` is the placeholder (not an error).

**Tests**:

- Unit: `getUserOrDefault` found / not found / empty id.
- Integration: `getLeaves` and `getTrips` after `removeUser`; detail export of a removed user uses placeholder names.

### Area: Trips

#### TRIP-01 — Trips list

- **Type**: functional
- **Source**: `(rewrite spec: Features by area › Trips)` — "User sees the trips table: Who, Destination, When (`D. M. YYYY[ - D. M. YYYY]`), Controls; sorted by departure ascending."
- **Source**: `(rewrite spec: Features by area › Trips)` — "[CHANGE] Regular user sees only own trips; admin sees all."
- **Depends on**: SETUP-01, SETUP-02, DATA-01, AUTH-03, USR-05, NFR-L10N-01

**Goal**: A logged-in user opens `/trips` and sees a table of trips sorted by departure ascending. A regular user sees only trips where `userId` is their own id; an admin sees all trips. Rows owned by the caller (or all rows for an admin) show Remove, Edit and Duplicate controls; an Add button sits in the last row.

**Old behavior**:

- Route `/trips` (exact) → `TripList` (`src/App.js:35`); `/` redirects to `/trips/` (`App.js:34`, owned by SETUP-02).
- Server `getTrips`: `userProtected`, returns ALL trips `find({}).sort({departureTime: 1})` (`server/graphql/tripRelated.js:17-18`).
- Server `getTrip(id)`: `userProtected`, any trip by id (`tripRelated.js:20-21`). Unknown id → resolver builds an object with no `id` → GraphQL error "Cannot return null for non-nullable field Trip.id." and `getTrip: null` (`Trip.js:11-14` picks from `null`).
- Page title "Trips" (`TripList.js:45`). Columns "Who", "Destination", "When", "Controls" (`TripList.js:49-52`).
- Who = `{surname}, {firstName}` (`TripList.js:59`). Destination = `place.destinationName` (`:61`). When = departure date, or `departure - arrival` when the calendar dates differ, both `D. M. YYYY` (`TripList.js:22-30`, `FormHelpers.js:42-44`), in the browser's local time.
- Controls shown when `isAdmin || userId === trip.user.id` (`TripList.js:64`): "Remove" (danger), "Edit" (info), "Duplicate" (info) (`:66-72`).
- Last row: empty cell spanning 3 columns + "Add" (success) button → `/trips/add`, shown to every logged-in user (`TripList.js:78-85,97`).
- Not logged in → "You are not authorized to view this page!" (`TripList.js:90-92`, `Unauthorized.js:6`).
- Loading → loading indicator; error → red alert `Error while fetching list: <error.message>` (`TripList.js:133-138`, `withProgress.js:16-22`).
- Query `GetTrips` fetches `id, place{destinationName}, user{id, firstName, surname}, departureTime, arrivalTime, userId, placeId, purpose, travelType, priceOfTravel` (`TripList.js:102-124`); the extra fields feed duplication (TRIP-05).

**Constraints**:

- **[CHANGE]** Regular users see only own trips; admin sees all _(interview: Data visibility; confirmed over client answer A10)_.
- Denied calls return `null`, HTTP 200 (AUTH-03).
- Operation names, arguments and return types unchanged (DATA-01 SDL).

**API**:

- `getTrips: [Trip]`
  - Guard: logged-in user (`userProtected`, AUTH-03); anonymous → `null`.
  - Admin: all trips. Non-admin: trips with `userId == caller.id`.
  - Sort: `departureTime` ascending.
  - Each Trip resolves `user` via USR-05 (`getUserOrDefault`: deleted user → placeholder `firstName: "Deleted"`, `surname: <id>`, `email: <id>@deleted.instea.co`) and `place` by `placeId`.
  - `Trip.user` resolution must NOT apply the "regular users read only their own user record" filter (USR tasks): the trip itself is already authorized, and `user` is non-null. Otherwise a non-admin who created a trip for another user (TRIP-02 preserved bug) gets a non-null error on `createTrip`.
  - Place missing (removed place): `place` resolves to null → GraphQL non-null error on `Trip.place`; the list item becomes `null` and `errors` is set (same as today since the SDL is unchanged). The SPA then shows the list error.
- `getTrip(id: String!): Trip`
  - Guard: logged-in user; admin any trip; non-admin only if `trip.userId == caller.id`, otherwise `null` (data visibility change).
  - Unknown id: response contains a GraphQL error and `getTrip: null` (same as today). Suggested: return a GraphQL error whose message is "Cannot return null for non-nullable field Trip.id." or any non-empty message; the SPA only displays it (interview: suggested answer accepted; verify before go-live — exact message is not a contract).

**Screens**:

- URL `/trips`. Who: logged-in user. Anonymous: SETUP-02 behaviour; the page itself shows "You are not authorized to view this page!".
- Header "Trips".
- Table (striped, bordered) columns: "Who", "Destination", "When", "Controls".
  - Who: `<surname>, <firstName>` of `trip.user` (deleted user: `<id>, Deleted`, USR-05).
  - Destination: `trip.place.destinationName`.
  - When: format departure and arrival as `D. M. YYYY` in browser local time; if equal show one, else `<departure> - <arrival>`.
  - Controls: if caller is admin or `trip.user.id == caller.id`: buttons "Remove" (TRIP-04), "Edit" (→ `/trips/edit/<id>`, TRIP-03), "Duplicate" (TRIP-05). Otherwise empty cell. For a regular user every listed row is own, so controls appear on every row.
- Last row: empty cells under Who/Destination/When, and "Add" button under Controls → `/trips/add` (TRIP-02), for every logged-in user.
- Empty state: only the Add row.
- Loading: shared loading indicator (SETUP-02). Error: shared red alert `Error while fetching list: <error message>`.
- All copy is i18n keys with Slovak translations (NFR-L10N-01); English text above is the exact old copy.

**Permissions**:

| Action                    | Regular user: UI | Regular user: server | Admin: UI | Admin: server |
| ------------------------- | ---------------- | -------------------- | --------- | ------------- |
| View list                 | own trips        | own trips only       | all       | all           |
| View one trip (`getTrip`) | own              | own, else `null`     | any       | any           |
| See Remove/Edit/Duplicate | own rows         | —                    | all rows  | —             |
| See Add                   | yes              | —                    | yes       | —             |

**Acceptance criteria**:

- Given trips of users A and B, when regular user A opens `/trips`, then only A's trips are listed.
- Given the same data, when an admin opens `/trips`, then all trips are listed.
- Given trips departing 2018-03-05, 2018-03-01, 2018-03-10, then rows are ordered 1, 5, 10 March.
- Given a trip 4. 12. 2017 18:00 → 6. 12. 2017 09:00 (local), then When shows `4. 12. 2017 - 6. 12. 2017`.
- Given a trip 4. 12. 2017 08:00 → 17:00, then When shows `4. 12. 2017`.
- Given a trip whose user was deleted, when an admin opens the list, then Who shows `<userId>, Deleted`.
- Given regular user A, when calling `getTrip` with B's trip id, then the result is `null` with no error.
- Given anonymous caller, when calling `getTrips`, then the result is `null` (HTTP 200).
- Given a trip whose place was removed, when the list loads, then the red alert `Error while fetching list: ...` shows.
- Given no trips, then the table shows only the Add row.
- Given the API fails, then `Error while fetching list: <message>` shows.

**Tests**:

- Unit: When-column formatter (same day, different days, local-time boundary at midnight).
- Integration: `getTrips` as anon (null), regular user (own only, sorted), admin (all, sorted); `getTrip` own / other (null) / admin / unknown id (error); `Trip.user` for deleted user returns placeholder; `Trip.user` for a trip owned by another user (created via forged `userId`) resolves without error.
- E2E: regular user and admin open `/trips` and see the expected rows and controls; Add button visible for both.

#### TRIP-02 — Add trip

- **Type**: functional
- **Source**: `(rewrite spec: Features by area › Trips)` — "User adds a trip: Who, Where, departure, arrival, purpose, travel type (O, R, A, L, DZ, AUS, AUV, MOS, MOV), price; defaults yesterday 08:00–17:00, type O."
- **Source**: `(rewrite spec: Features by area › Trips)` — "[CHANGE] Non-admin can add a trip in the UI."
- **Source**: `(rewrite spec: Features by area › Trips)` — "[PRESERVED BUG] Server accepts any `userId` on trip create (user can create trips for others)."
- **Source**: `(rewrite spec: Features by area › Trips)` — "[PRESERVED BUG] Arrival-after-departure is not validated on client or server."
- **Depends on**: TRIP-01, SETUP-02, DATA-01, AUTH-03, NFR-MNT-02, NFR-L10N-01

**Goal**: Any logged-in user opens `/trips/add`, fills the trip form and saves. The server creates the trip with a new uuid and the given `userId`, without checking that `userId` is the caller. After a successful save the app goes to `/trips`. This task also defines the shared trip form (fields, labels, defaults, validation) reused by TRIP-03.

**Old behavior**:

- Route `/trips/add` → `AddTripForm` (`App.js:36`). Header "Add trip" (`AddTripForm.js:13`).
- Defaults: departure = yesterday 08:00:00, arrival = yesterday 17:00:00 (browser local time), travelType = first TravelType = `O` (`AddTripForm.js:19-25`). Milliseconds are left at the current time's ms (`moment()...seconds(0)`, no `.milliseconds(0)`). No default for Who, Where, purpose, price.
- Form (`TripForm.js:32-43`):
  - "Who:" user combobox (autocomplete text input), options `<surname>, <firstName>`, value = user id; source `getUsers`; for non-admin the list is filtered to the caller only (`ConnectedComboboxes.js:28,34-56`). Load error: `Problem loading users: <message>` (`:45`).
  - "Where:" place combobox, options `<destinationName> (<name>)`, value = place id; source `getPlaces` (`ConnectedComboboxes.js:60-82`). Load error: `Problem loading places: <message>` (`:77`).
  - "Time of departure:" / "Time of arrival:" date-time picker, date format `D. M. YYYY`, time format `H:mm` (`FormHelpers.js:46-48`).
  - "Purpose:" text input, placeholder `Example: konzultácie`.
  - "Type of travel:" select; options in order with labels: O "Osobný vlak", R "Rýchlik", A "Autobus", L "Lietadlo", DZ "Doprava zabezpečená", AUS "Auto služobné", AUV "Auto vlastné", MOS "Motocykel služobný", MOV "Motocykel vlastný" (`src/data/TravelType.js:1-11`).
  - "Price of travel:" `<input type="number">` with no `step` attribute (browser default step 1) (`TripForm.js:43`).
  - Buttons "Save" (primary, submit) and "Cancel" (danger → browser history back) (`TripForm.js:47-48,79`).
- Validation: "Required" on userId, placeId, departureTime, arrivalTime, purpose, priceOfTravel; value `0` counts as filled (`TripForm.js:70-73`, `src/core/validation.js:13-15`). Message shown under the field only after the field is touched; submit touches all fields (`FormHelpers.js:11,17`).
- The "Must be after the start" check compares fields `from`/`to`, which do not exist, so it never fires (`TripForm.js:60-68`).
- Access: the form renders "You are not authorized to view this page!" when `!isAdmin && ownerId !== userId`; Add passes no `ownerId`, so non-admins cannot add (`TripForm.js:23-25`, `AddTripForm.js:13`).
- Save: `createTrip(trip)` with `Trip.toSerializable` (dates → ISO UTC) and refetch of the list; on resolve → navigate `/trips` (`tripActions.js:53-67`). On rejection nothing happens (no catch): the user stays on the form with no message.
- Server `createTrip`: `userProtected`; saves `Trip.toMongo({...trip, id: uuid.v4()})` with no owner check; returns the Trip (`tripRelated.js:23-25`).

**Analysis mismatch**: none for this task beyond DATA-01.

**Constraints**:

- **[CHANGE]** Non-admin can add a trip in the UI _(interview: Rewrite goal › Functional bugs › Trip permissions)_.
- **[PRESERVED BUG]** Server accepts any `userId` on create _(client answer: S5; interview: Rewrite goal › Security bugs)_.
- **[PRESERVED BUG]** No arrival-after-departure validation on client or server _(interview: Rewrite goal › Other bugs)_. Do not implement the dead "Must be after the start" message.
- Regular users can read only their own user record _(interview: Data visibility)_, so `getUsers` returns only the caller for a non-admin (USR tasks). The "Who" picker for a non-admin therefore lists only the caller, which is also what the old UI filter did (`ConnectedComboboxes.js:51-55`).
- TravelType codes and labels come from NFR-MNT-02.

**API**:

- `createTrip(trip: TripInput): Trip` (argument nullable as today; the SPA sends `$trip: TripInput!`).
  - Guard: logged-in user; anonymous → `null`.
  - Server sets `id = uuid v4`, stores all TripInput fields (DATA-01), does not check `userId`, `placeId` existence or date order.
  - Returns the created Trip (with `user`, `place` resolvable).
  - Invalid ISO date string → Mongoose cast error → GraphQL error, `createTrip: null`.
  - Invalid enum → GraphQL validation error (HTTP 200 per the GraphQL module behaviour of SETUP-01).
  - Missing `trip` argument: old code throws a TypeError (`Object.assign(undefined, ...)`), returned as a GraphQL error. New: return a GraphQL error, no document created.

**Screens**:

- URL `/trips/add`. Who: any logged-in user (admin or regular). Anonymous: SETUP-02.
- Header "Add trip".
- Layout: shared form helper (label column xs4/sm3/md2 with md offset 2, input column xs8/sm9/md6; one field per row) (`FormHelpers.js:8-22`). The visual grid is a guideline for the chosen UI kit.
- Fields, in order:

| Label              | Control                                                                                                                                                                                               | Default           | Validation               |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ------------------------ |
| Who:               | searchable picker; option text `<surname>, <firstName>`; value user id. Admin: all users from `getUsers`. Regular user: only self (the only record `getUsers` returns; the SPA also filters to self). | empty             | Required                 |
| Where:             | searchable picker; option text `<destinationName> (<name>)`; value place id; from `getPlaces`                                                                                                         | empty             | Required                 |
| Time of departure: | date + time picker, display `D. M. YYYY H:mm`, local time                                                                                                                                             | yesterday 08:00   | Required                 |
| Time of arrival:   | date + time picker, display `D. M. YYYY H:mm`, local time                                                                                                                                             | yesterday 17:00   | Required; NO order check |
| Purpose:           | text, placeholder `Example: konzultácie`                                                                                                                                                              | empty             | Required                 |
| Type of travel:    | select with the 9 codes and Slovak labels above, in that order                                                                                                                                        | `O` (Osobný vlak) | —                        |
| Price of travel:   | number input; old browser default step 1 blocks decimals like `12.5` at submit. Suggested: keep whole numbers only (step 1) (interview: suggested answer accepted)                                    | empty             | Required; `0` is valid   |

- Defaults: "yesterday" = today − 1 calendar day in the browser's local time, seconds 0. Suggested: milliseconds 0 (old code keeps current ms, invisible in UI) (interview: suggested answer accepted).
- Picker loading: shared loading indicator inside the field. Picker error: `Problem loading users: <message>` / `Problem loading places: <message>` (red alert in place of the picker).
- "Required" shows under a field after it is touched, and on all empty required fields after Save is clicked.
- Invalid typed date text: suggested to treat as empty → "Required" (old behaviour with free text in `react-datetime` is undefined) (interview: suggested answer accepted).
- Buttons: "Save" (primary, submits), "Cancel" (danger, browser history back).
- On Save: send `createTrip` with dates as ISO UTC strings and `priceOfTravel` as a JSON number. Refetch the trips list. On success (non-null result) → navigate `/trips`.
- On failure (GraphQL/network error or `null` result): stay on the form, keep the entered values, show a red alert. Suggested text: `Problem saving trip: <error message>`; for a `null` result `You are not authorized to edit this trip!` (same messages as TRIP-03; old add form showed nothing) (interview: suggested answer accepted).
- Loading during save: Save button disabled until the mutation finishes (suggested; old had no indicator) (interview: suggested answer accepted).
- Copy via i18n keys with Slovak translations (NFR-L10N-01). Travel-type labels are Slovak in the old UI; suggested to keep the Slovak labels in both languages (interview: suggested answer accepted).

**Permissions**:

| Action               | Regular user: UI | Regular user: server                  | Admin: UI | Admin: server |
| -------------------- | ---------------- | ------------------------------------- | --------- | ------------- |
| Open `/trips/add`    | yes              | —                                     | yes       | —             |
| Choose Who           | self only        | any `userId` accepted (preserved bug) | any user  | any           |
| createTrip           | yes              | yes                                   | yes       | yes           |
| Anonymous createTrip | —                | `null`                                | —         | —             |

**Business rules**:

- Defaults example: today is 2026-10-29 (local) → departure `28. 10. 2026 8:00`, arrival `28. 10. 2026 17:00`, type `O`.
- Required predicate: value present OR value equals 0 (`validation.js:13`). So price `0` passes; empty string fails.

**Acceptance criteria**:

- Given a regular user, when opening `/trips/add`, then the form shows (no "You are not authorized to view this page!").
- Given `/trips/add`, then departure = yesterday 08:00, arrival = yesterday 17:00, Type of travel = "Osobný vlak".
- Given a regular user, when opening the Who picker, then it lists only the user.
- Given an admin, when opening the Who picker, then it lists all users as `<surname>, <firstName>`.
- Given all fields empty except defaults, when Save, then "Required" shows under Who, Where, Purpose, Price of travel, and no request is sent.
- Given price `0`, then it is accepted.
- Given arrival before departure, when Save, then the trip is created.
- Given valid input, when Save, then `createTrip` is called, the app navigates to `/trips`, and the new trip is listed.
- Given a regular user calling `createTrip` via API with another user's `userId`, then the trip is created with that `userId` (preserved bug).
- Given anonymous `createTrip`, then the result is `null`.
- Given `createTrip` with `departureTime: "not a date"`, then a GraphQL error is returned and no trip is stored.
- Given the save fails, then the user stays on the form with values kept and a red error alert.
- Given Cancel, then the browser goes back to the previous page.

**Tests**:

- Unit: default-values function (yesterday 08:00/17:00, local time, DST day); required validator (0 valid, empty invalid); payload mapper (dates → ISO UTC, price as number, only TripInput fields).
- Integration: `createTrip` as regular user for self, for another user (succeeds), as admin, as anon (null); invalid date (error); arrival < departure (succeeds); empty purpose (succeeds); stored document matches DATA-01.
- E2E: regular user adds a trip and sees it in the list; admin adds a trip for another user; required messages on empty submit.

#### TRIP-03 — Edit trip with owner check

- **Type**: functional
- **Source**: `(rewrite spec: Features by area › Trips)` — "[CHANGE] Trip owner or admin can edit and remove a trip; the server checks the trip owner."
- **Source**: `(rewrite spec: Features by area › Trips)` — "[CHANGE] UI shows an error when a trip save is denied, instead of navigating as if saved."
- **Depends on**: TRIP-01, TRIP-02, DATA-01, AUTH-03, NFR-L10N-01

**Goal**: The trip owner or an admin opens `/trips/edit/:id`, changes fields and saves. The server allows `updateTrip` only when the caller is admin or the stored trip's `userId` equals the caller's id. The UI waits for the result: on success it navigates to `/trips`; on denial or error it stays on the form and shows an error.

**Old behavior**:

- Route `/trips/edit/:id` → `EditTripForm` (`App.js:37`). Header "Edit trip" (`EditTripForm.js:12`).
- Loads `getTrip(id)` fields `userId, placeId, departureTime, arrivalTime, purpose, travelType, priceOfTravel` (`EditTripForm.js:25-43`). Loading indicator; error → `Error while fetching the trip: <message>` (`:48-53`).
- Same form as TRIP-02 (`TripForm.js`). Non-admin whose id ≠ `trip.userId` sees "You are not authorized to view this page!" (`TripForm.js:23-25`, `EditTripForm.js:17`).
- Save: calls `updateTrip(id, trip)` and navigates to `/trips` immediately, without waiting for the result (`tripActions.js:73-88`); refetches `GetTrips`, `GetTrip`.
- Server `updateTrip`: `ownerProtected`, but calls `context.checkUserId(id)` with the TRIP id instead of the owner id, so only admins pass; non-admin owners get `null` (`tripRelated.js:27-33`, `rootResolverDecorators.js:10-20`). Admin: `findOneAndUpdate({id}, {$set: Trip.toMongo(trip)})` → `{success: true}` even if no trip matched; DB error → `{success: false, message}` (`utils.js:1-10`).
- Missing `trip` argument: `Trip.toMongo(undefined)` yields `departureTime`/`arrivalTime` = now, which are then written (`Trip.js:21-24`, `dataUtil.js:5`).

**Constraints**:

- **[CHANGE]** Server checks the stored trip owner _(interview: Rewrite goal › Functional bugs › Trip permissions)_.
- **[CHANGE]** UI shows an error when save is denied _(same source)_.
- **[CHANGE]** Regular users read only own trips (`getTrip` returns `null` for others, TRIP-01).
- Guard semantics: denial → `null`, HTTP 200 (AUTH-03, `ownerProtected` with `checkUserId(trip.userId)`).
- No arrival-after-departure check (TRIP-02 preserved bug).

**API**:

- `updateTrip(id: String!, trip: TripInput): Result`
  - Guard: anonymous → `null`.
  - Load trip by `id`.
    - Admin: if not found → `{success: true}` (old "success even if no document matched"). If found → update.
    - Non-admin: if not found → `null` (same pattern as `removeLeave`, `leaveRelated.js:34-36`) (interview: suggested answer accepted). If `trip.userId != caller.id` → `null`. Else update.
  - Update: `$set` of all TripInput fields (dates parsed as in DATA-01). Returns `{success: true}`; DB/cast error → `{success: false, message: <error message>}`.
  - Input `userId` is not checked: an owner could reassign the trip to another user id. Suggested: keep unchecked, consistent with the preserved `createTrip` bug; the UI offers only self to non-admins (interview: suggested answer accepted).
  - Missing `trip` argument: suggested to return a GraphQL error and change nothing, instead of writing "now" dates (interview: suggested answer accepted).

**Screens**:

- URL `/trips/edit/:id`. Who: admin, or the trip owner.
- Loading: shared indicator. Load error: red alert `Error while fetching the trip: <message>`.
- If `getTrip` returns `null` for a non-admin (other user's trip): "You are not authorized to view this page!". If non-admin and loaded `trip.userId != self`: same message.
- Header "Edit trip". Fields and validation identical to TRIP-02, initial values from the loaded trip (dates converted to local time). Who picker: admin all users; regular user only self.
- On Save:
  - Disable Save until the mutation finishes (interview: suggested answer accepted, same as TRIP-02).
  - Result `{success: true}` → refetch list and trip, navigate `/trips`.
  - Result `null` (denied) → stay on the form, keep values, red alert. Suggested text: `You are not authorized to edit this trip!` (interview: suggested answer accepted).
  - Result `{success: false, message}` → stay, red alert `Problem saving trip: <message>` (interview: suggested answer accepted).
  - GraphQL/network error → stay, red alert `Problem saving trip: <error message>` (interview: suggested answer accepted).
- Cancel → browser history back.
- Copy via i18n (NFR-L10N-01).

**Permissions**:

| Action         | Owner (regular): UI | Owner (regular): server | Other regular user: UI | Other regular user: server | Admin: UI | Admin: server |
| -------------- | ------------------- | ----------------------- | ---------------------- | -------------------------- | --------- | ------------- |
| Open edit page | form                | `getTrip` returns trip  | Unauthorized message   | `getTrip` → `null`         | form      | trip          |
| updateTrip     | Save                | allowed                 | —                      | `null`                     | Save      | allowed       |

**Acceptance criteria**:

- Given a regular user who owns trip T, when editing purpose and saving, then `updateTrip` returns `{success: true}`, the change is stored, and the app navigates to `/trips`.
- Given a regular user, when calling `updateTrip` on another user's trip, then the result is `null` and the trip is unchanged.
- Given an admin, when editing any trip, then it is saved.
- Given an admin and an unknown id, then `updateTrip` returns `{success: true}`.
- Given a regular user and an unknown id, then `updateTrip` returns `null`.
- Given a denied save (server returns `null`), then the form stays open with values kept and the denial alert shows; no navigation.
- Given a regular user opening `/trips/edit/<other user's trip id>`, then "You are not authorized to view this page!" shows.
- Given `updateTrip` with `departureTime: "x"`, then the result is `{success: false, message: <cast error>}`.
- Given arrival before departure, then the save succeeds.

**Tests**:

- Unit: save-result handler (success → navigate; null → denial alert; success false → message alert; thrown error → message alert).
- Integration: `updateTrip` matrix: anon (null), owner (success), non-owner (null), admin (success), admin unknown id (success true), non-admin unknown id (null), invalid date (success false); stored fields after update.
- E2E: owner edits own trip; simulated denial (e.g. trip reassigned by admin in between) shows the alert and stays on the page.

#### TRIP-04 — Remove trip

- **Type**: functional
- **Source**: `(rewrite spec: Features by area › Trips)` — "Owner or admin removes a trip without confirmation."
- **Source**: `(rewrite spec: Features by area › Trips)` — "[CHANGE] Trip owner or admin can edit and remove a trip; the server checks the trip owner."
- **Depends on**: TRIP-01, DATA-01, AUTH-03

**Goal**: In the trips list, the owner or an admin clicks "Remove" and the trip is deleted immediately, with no confirmation dialog. The server deletes only if the caller is admin or the stored trip's owner. The list refreshes.

**Old behavior**:

- "Remove" (danger) button per row, shown to admin or owner (`TripList.js:64-68`); click → `removeTrip(id)` with no confirmation, refetch `GetTrips`, result ignored (`tripActions.js:90-98`, `TripList.js:99`).
- Server `removeTrip`: `ownerProtected`, `checkUserId(id)` with trip id → admin only (`tripRelated.js:35-40`). Admin: `findOneAndRemove({id})` → `{success: true}` even if nothing matched.

**Constraints**:

- **[CHANGE]** Server checks the stored trip owner _(interview: Rewrite goal › Functional bugs › Trip permissions)_.
- No confirmation dialog (old behaviour).
- No cascade: nothing else references trips.

**API**:

- `removeTrip(id: String!): Result`
  - Guard: anonymous → `null`.
  - Admin: delete by id; not found → `{success: true}`.
  - Non-admin: load trip; not found → `null` (interview: suggested answer accepted, same as TRIP-03); `userId != caller.id` → `null`; else delete → `{success: true}`.
  - DB error → `{success: false, message}`.

**Screens**:

- `/trips` row button "Remove" (danger style), visible as in TRIP-01.
- Click → call `removeTrip`, then refetch the list. No confirmation, no success message.
- Result `null` or `{success: false}`: old shows nothing; keep no message (the spec's error change covers saves only). The refetched list still shows the trip.

**Permissions**:

| Action          | Owner | Other regular user   | Admin |
| --------------- | ----- | -------------------- | ----- |
| UI shows Remove | yes   | no (row not visible) | yes   |
| Server removes  | yes   | `null`               | yes   |

**Acceptance criteria**:

- Given owner on `/trips`, when clicking "Remove" on own trip, then the trip disappears without a confirmation dialog.
- Given admin, when removing any trip, then it is deleted.
- Given a regular user calling `removeTrip` with another user's trip id, then the result is `null` and the trip remains.
- Given admin and unknown id, then `{success: true}`.

**Tests**:

- Integration: `removeTrip` matrix (anon, owner, non-owner, admin, admin unknown id, non-admin unknown id).
- E2E: owner removes a trip; row disappears; no dialog appears.

#### TRIP-05 — Duplicate trip

- **Type**: functional
- **Source**: `(rewrite spec: Features by area › Trips)` — "Owner or admin duplicates a trip: new departure, arrival keeps the original duration, other fields copied."
- **Depends on**: TRIP-01, TRIP-02, AUTH-03, NFR-L10N-01

**Goal**: On a trip row the owner or an admin clicks "Duplicate". A modal asks for a new departure time (default = original departure). On "Duplicate", a new trip is created with that departure, arrival = new departure + original duration, and all other fields copied from the original.

**Old behavior**:

- "Duplicate" (info) button per row for admin/owner (`TripList.js:64,72`, `DuplicateTripButton.js:37-48`).
- Modal header "Duplicate trip"; one field "Time of departure:" (date-time picker, `D. M. YYYY` / `H:mm`), default = original departure (`DuplicateTripButton.js:17-35,63-67`); footer "Cancel" (closes) and "Duplicate" (primary).
- On Duplicate: `duration = arrival − departure` in ms; `arrival' = departure' + duration`; payload = original trip minus `id`, with new times (`DuplicateTripButton.js:69-79`). `duplicateTrip` → `addTrip` → `createTrip` with only TripInput fields (`userId, placeId, purpose, travelType, priceOfTravel` copied), refetch list, then navigate `/trips` (`tripActions.js:53-71`).
- No validation in the modal; mutation errors are not handled.
- Whether the modal closes after a successful duplicate is not explicit in code (`isOpen` is not reset in `onSubmit`, `DuplicateTripButton.js:59-80`).

**Constraints**:

- Server operation is `createTrip` (TRIP-02); the copied `userId` is the original owner, so an admin duplicating another user's trip creates it for that user.
- Duration is exact milliseconds, not calendar days (DST-crossing behaviour follows absolute time).

**API**: `createTrip(trip: TripInput): Trip` as in TRIP-02.

**Screens**:

- Trigger: "Duplicate" button on `/trips` rows where controls are visible (TRIP-01).
- Modal: title "Duplicate trip"; field "Time of departure:" date + time picker (display `D. M. YYYY H:mm`, local time), default = original departure; buttons "Cancel", "Duplicate" (primary).
- Cancel: close modal, nothing created.
- Duplicate: compute arrival; call `createTrip`; refetch list. Suggested: on success close the modal and stay on `/trips` with the refreshed list (interview: suggested answer accepted). Suggested: if the departure field is empty or invalid, disable "Duplicate" (old: no validation, would crash) (interview: suggested answer accepted). Suggested: on error keep the modal open with red alert `Problem saving trip: <error message>` (interview: suggested answer accepted, same as TRIP-02).

**Business rules**:

- `newArrival = newDeparture + (originalArrival − originalDeparture)`.
- Example: original 2018-03-05 08:00 → 17:00 (9 h); new departure 2018-03-12 08:00 → new arrival 2018-03-12 17:00.
- Example: original 4. 12. 2017 18:00 → 6. 12. 2017 09:00 (39 h); new departure 10. 12. 2017 18:00 → arrival 12. 12. 2017 09:00.
- Copied fields: `userId`, `placeId`, `purpose`, `travelType`, `priceOfTravel`. New `id` from server.

**Permissions**:

| Action                | Owner | Other regular user                | Admin |
| --------------------- | ----- | --------------------------------- | ----- |
| UI shows Duplicate    | yes   | no                                | yes   |
| Server (`createTrip`) | yes   | yes (any `userId`, preserved bug) | yes   |

**Acceptance criteria**:

- Given a trip 08:00–17:00, when duplicated at day D 08:00, then a new trip D 08:00 → D 17:00 with the same user, place, purpose, type and price exists, and the original is unchanged. _(analysis §2.8 Trips)_
- Given the modal opens, then "Time of departure:" equals the original departure.
- Given Cancel, then no trip is created.
- Given an admin duplicates user B's trip, then the new trip's `userId` is B.

**Tests**:

- Unit: duplicate payload builder (duration preserved, multi-day, DST change week, fields copied, no `id`).
- Integration: covered by `createTrip` tests (TRIP-02).
- E2E: owner duplicates a trip; new row appears with the expected When value.

### Area: Places

#### PLC-01 — Places list

- **Type**: functional
- **Source**: `(rewrite spec: Features by area › Places)` — "User lists places: Name, Destination name, Origin name, Travel duration (`2h 30m`)."
- **Source**: `(rewrite spec: Features by area › Places)` — "Non-admin sees a read-only list; add/edit pages show \"You are not authorized to view this page!\"."
- **Depends on**: SETUP-01, SETUP-02, DATA-01, AUTH-03, NFR-L10N-01

**Goal**: Any logged-in user opens `/places` and sees all places with name, destination name, origin name and travel duration. Admins also see Remove/Edit buttons per row and an Add button; regular users see the same table without controls.

**Old behavior**:

- Route `/places` (exact) → `PlaceList` (`App.js:41`). Header "Places" (`PlaceList.js:27`).
- Server `getPlaces`: `userProtected`, `Place.find({})`, no sort (natural order) (`placeRelated.js:7`). `getPlace(id)`: `userProtected`, `findOne({id})`, unknown → `null` (`placeRelated.js:9`).
- Columns "Name", "Destination name", "Origin name", "Travel duration", "Controls" (`PlaceList.js:31-35`). Country is not shown.
- Travel duration display `H[h] mm[m]` built from the duration's `hours()` and `minutes()` components (`FormHelpers.js:54-59`): 150 min → `2h 30m`, 15 min → `0h 15m`, 0 → `0h 00m`, 1440 min (`PT24H`) → `0h 00m` (hours component wraps at 24).
- Admin controls per row: "Remove" (danger), "Edit" (info) (`PlaceList.js:45-50`). Last row: empty cell spanning 4 columns, then "Add" (success) for admin only (`:53-58`).
- Not logged in → "You are not authorized to view this page!" (`PlaceList.js:18-20`).
- Error → `Error while fetching list: <message>` (`PlaceList.js:93-98`).

**Constraints**:

- Places are shared reference data; the data-visibility change does not apply to them (spec lists only trips, leaves, user record).

**API**:

- `getPlaces: [Place]` — guard logged-in user; anon → `null`. Returns all places. Old has no sort; suggested: sort by `_id` ascending to keep insertion order after the data copy (interview: suggested answer accepted).
- `getPlace(id: String!): Place` — guard logged-in user; unknown id → `null` (no error).

**Screens**:

- URL `/places`. Who: logged-in user.
- Header "Places". Table columns: "Name", "Destination name", "Origin name", "Travel duration", "Controls".
- Travel duration: parse ISO duration, show `<hours component>h <minutes component, 2 digits>m` (examples above, including the `PT24H` → `0h 00m` quirk).
- Controls: admin → "Remove" (PLC-02), "Edit" (→ `/places/edit/<id>`); regular user → empty.
- Last row: admin → "Add" (→ `/places/add`); regular user → empty.
- Empty: only the last row. Loading: shared indicator. Error: `Error while fetching list: <message>`.
- Copy via i18n (NFR-L10N-01).

**Business rules**:

| Stored    | Displayed |
| --------- | --------- |
| `PT2H30M` | `2h 30m`  |
| `PT15M`   | `0h 15m`  |
| `PT1H`    | `1h 00m`  |
| `P0D`     | `0h 00m`  |
| `PT24H`   | `0h 00m`  |

**Permissions**:

| Action               | Regular user: UI | Regular user: server | Admin: UI | Admin: server |
| -------------------- | ---------------- | -------------------- | --------- | ------------- |
| View list / getPlace | yes              | yes                  | yes       | yes           |
| See Remove/Edit/Add  | no               | —                    | yes       | —             |

**Acceptance criteria**:

- Given a regular user, when opening `/places`, then all places are listed and no Remove/Edit/Add buttons are shown. _(analysis §2.8 Places)_
- Given an admin, then each row has Remove and Edit, and an Add button is shown.
- Given a place with `travelDuration: "PT2H30M"`, then Travel duration shows `2h 30m`.
- Given `PT24H`, then `0h 00m`.
- Given anonymous `getPlaces`, then `null`.
- Given `getPlace` with unknown id, then `null` with no error.

**Tests**:

- Unit: duration formatter (table above).
- Integration: `getPlaces`/`getPlace` as anon, user, admin; unknown id.
- E2E: regular user sees read-only list; admin sees controls.

#### PLC-02 — Place CRUD (admin)

- **Type**: functional
- **Source**: `(rewrite spec: Features by area › Places)` — "Admin adds, edits and removes places: name, destination name, origin name, travel duration (slider 0–1440 min, step 15, stored as ISO-8601), country (243 ISO codes, default SK)."
- **Source**: `(rewrite spec: Features by area › Places)` — "Non-admin sees a read-only list; add/edit pages show \"You are not authorized to view this page!\"."
- **Depends on**: PLC-01, DATA-01, AUTH-03, NFR-MNT-02, NFR-L10N-01

**Goal**: An admin adds a place at `/places/add`, edits one at `/places/edit/:id`, and removes one from the list. Non-admins opening the add/edit URLs see "You are not authorized to view this page!", and the server returns `null` for their place mutations.

**Old behavior**:

- Routes `/places/add` → `AddPlaceForm`, `/places/edit/:id` → `EditPlaceForm` (`App.js:42-43`). Headers "Add place" / "Edit place" (`AddPlaceForm.js:11`, `EditPlaceForm.js:15`).
- Non-admin → "You are not authorized to view this page!" (`PlaceForm.js:31-33`).
- Fields (`PlaceForm.js:40-48`):
  - "Name:" text, placeholder `Example: Viedeň, AT`.
  - "Destination name:" text, placeholder `Example: Viedeň`.
  - "Origin name:" text, placeholder `Example: Hranica SK-AT / Bratislava`.
  - "Travel duration:" text showing `H[h] mm[m]` above a range slider min 0, max 1440, step 15 (minutes) (`FormHelpers.js:67-75`). Value is a duration; slider position = `asMinutes()` or 0.
  - "Country" (no colon) autocomplete combobox of 243 countries; option text = country name, value = ISO code (`PlaceForm.js:17-23,48`, `src/data/Countries.js`).
- Defaults: add → `country: 'SK'` only (`AddPlaceForm.js:11`). travelDuration has NO initial value: the slider shows `0h 00m` at 0, but the field is empty until the slider changes or loses focus (blur sets 0) (`FormHelpers.js:61-73`).
- Validation "Required": name, destinationName, originName, travelDuration (`PlaceForm.js:65-67`). Country optional.
- Edit loads `getPlace(id)` fields `name, destinationName, originName, travelDuration, country`; loading indicator; error `Error while fetching the place: <message>` (`EditPlaceForm.js:25-53`). travelDuration converted with `moment.duration(iso)` (`Place.js:14-16`). Unknown id → `null` → empty form with 0 duration.
- Save add: `createPlace(place)` with `travelDuration` = `duration.toISOString()` (`Place.js:10-12`, `placeActions.js:48-62`), refetch list, on resolve navigate `/places`; errors ignored.
- Save edit: `updatePlace(id, place)` and navigate `/places` immediately without waiting (`placeActions.js:64-79`).
- Remove: "Remove" in list → `removePlace(id)`, no confirmation, refetch, result ignored (`PlaceList.js:47,71`, `placeActions.js:81-89`).
- Cancel → history back (`PlaceForm.js:72-74`).
- Server: `createPlace` `adminProtected`, saves `{...place, id: uuid.v4()}`, returns Place (`placeRelated.js:11-13`); `updatePlace` `adminProtected`, `$set: place` → Result (`:15`); `removePlace` `adminProtected`, `findOneAndRemove` → Result (`:17`). No reference check against trips.

**Analysis mismatch**: The analysis (§2.2) gives travelDuration default "client 0". In code there is no initial value (`AddPlaceForm.js:11` sets only `country`); the slider only renders 0. Submitting without touching the slider shows "Required" under "Travel duration:".

**Constraints**:

- Edit navigates to `/places` immediately without waiting for the result (old behaviour; the save-error change in the spec covers trips only).
- Removing a place does not check trips that reference it; those trips then fail to load in the list (TRIP-01 edge case). Keep (no cascade, no guard).
- Country codes from NFR-MNT-02.

**API**:

- `createPlace(place: PlaceInput): Place` — guard admin; non-admin/anon → `null`. Sets `id = uuid v4`, stores PlaceInput fields, returns Place. Invalid enum → GraphQL validation error.
- `updatePlace(id: String!, place: PlaceInput): Result` — guard admin; `$set` of the PlaceInput fields given (an omitted `country` leaves the stored value; explicit `null` stores null). `{success: true}` also when no place matched; DB error → `{success: false, message}`.
- `removePlace(id: String!): Result` — guard admin; `{success: true}` also when nothing matched.

**Screens**:

- URLs `/places/add`, `/places/edit/:id`. Admin only; non-admin → "You are not authorized to view this page!" (shared component, SETUP-02).
- Headers "Add place" / "Edit place".

| Label             | Control                                                     | Default (add)                      | Validation                                            |
| ----------------- | ----------------------------------------------------------- | ---------------------------------- | ----------------------------------------------------- |
| Name:             | text, placeholder `Example: Viedeň, AT`                     | empty                              | Required                                              |
| Destination name: | text, placeholder `Example: Viedeň`                         | empty                              | Required                                              |
| Origin name:      | text, placeholder `Example: Hranica SK-AT / Bratislava`     | empty                              | Required                                              |
| Travel duration:  | label text `<H>h <mm>m` + slider 0–1440 min, step 15        | unset (slider at 0, text `0h 00m`) | Required (unset until the slider is moved or blurred) |
| Country           | searchable picker; option text country name; value ISO code | `SK` (Slovakia)                    | optional                                              |

- Edit: initial values from `getPlace`; duration slider = stored duration in minutes. Loading: shared indicator. Error: `Error while fetching the place: <message>`.
- Save (add): `createPlace` with `travelDuration` as ISO-8601 duration (`PT2H30M`, `P0D` for zero, `PT24H` for 1440). On success → `/places`, list refetched. On error: old does nothing; keep (stay on form, no message).
- Save (edit): send `updatePlace` and navigate to `/places` immediately; list refetched.
- Cancel: history back.
- Remove (list): `removePlace`, no confirmation, list refetched.
- Copy via i18n (NFR-L10N-01).

**Business rules**:

- Slider minutes → ISO: 0 → `P0D`; 15 → `PT15M`; 60 → `PT1H`; 150 → `PT2H30M`; 1440 → `PT24H`.
- Label text uses hour/minute components: 150 → `2h 30m`; 1440 → `0h 00m`.

**Permissions**:

| Action                                  | Regular user: UI     | Regular user: server | Admin: UI | Admin: server |
| --------------------------------------- | -------------------- | -------------------- | --------- | ------------- |
| Open add/edit page                      | Unauthorized message | —                    | form      | —             |
| createPlace / updatePlace / removePlace | no buttons           | `null`               | yes       | yes           |

**Acceptance criteria**:

- Given a non-admin, when opening `/places/add` or `/places/edit/<id>`, then "You are not authorized to view this page!" shows. _(analysis §2.8 Places)_
- Given admin on `/places/add`, then Country = Slovakia and the duration text shows `0h 00m`.
- Given admin submits without moving the slider, then "Required" shows under Travel duration.
- Given admin sets the slider to 150 and saves, then the place is stored with `travelDuration: "PT2H30M"` and the list shows `2h 30m`.
- Given admin edits a place, then the form shows stored values and saving navigates to `/places`.
- Given admin clicks Remove, then the place is deleted without confirmation.
- Given a non-admin calling `createPlace`/`updatePlace`/`removePlace`, then the result is `null` and nothing changes.
- Given a place used by a trip is removed, then the trip remains in the DB.

**Tests**:

- Unit: minutes ↔ ISO duration converter (0, 15, 60, 150, 1440); slider "unset vs 0" handling.
- Integration: `createPlace`/`updatePlace`/`removePlace` as anon, user (null), admin; update of unknown id (success true); omitted country keeps value; invalid country enum (error).
- E2E: admin adds, edits, removes a place; non-admin sees the unauthorized message on add/edit URLs.

### Area: Travel-warrant export

#### TWE-01 — Export screen, `POST /export/trips`, download

- **Type**: functional
- **Source**:
  - `(rewrite spec: Features by area › Travel-warrant export)` — "User picks a person and a month (years 2017..current) and generates a travel-warrant xlsx, then downloads it."
  - `(rewrite spec: Features by area › Travel-warrant export)` — "Non-admin person picker shows only the user."
  - `(rewrite spec: Features by area › Travel-warrant export)` — "**[PRESERVED BUG]** Server accepts any `userId` for export; generated files are public under `/download` with random names and never deleted." Kept as is _(client answer: S5)_.
  - `(rewrite spec: NFR › Security)` — "Export download URLs use the request scheme (HTTPS), not hardcoded `http://`."
- **Depends on**: SETUP-01, SETUP-02, DATA-01, AUTH-03, NFR-SEC-03, NFR-L10N-01, TWE-02, TWE-03

**Goal**: A logged-in user opens `/export`, picks a person and a month, and clicks "Generate". The server builds a travel-warrant xlsx for that person's trips departing in that month (TWE-02, TWE-03), writes it to a local download folder, and returns its URL as a JSON string. The screen then shows a "Download" button that navigates the browser to the file. Files stay public and are never deleted.

**Old behavior**:

- Route `/export` has no guard `src/App.js:44`; the menu item "Export" is shown to logged-in users `src/containers/auth/MenuBar.js:37`.
- Form fields: "Who:" user combobox `src/containers/export/ExportForm.js:27`; "Month:" month picker with years 2017..current year `ExportForm.js:28-31`. Initial values: `userId` = logged-in user's id, `month` = `moment()` (now) `ExportForm.js:59-62`. Both required, message "Required" `ExportForm.js:51-53`, `src/core/validation.js:13-15`, shown only after the field is touched `src/components/FormHelpers.js:11,17`.
- User combobox: label `<surname>, <firstName>`, value = user id `src/components/ConnectedComboboxes.js:28`; loads `getUsers { id, firstName, surname }` `ConnectedComboboxes.js:35-43`; load error text "Problem loading users: <message>" `ConnectedComboboxes.js:45`; non-admins see only their own user (client-side filter) `ConnectedComboboxes.js:51-55`.
- Month picker: input text shows `MMM YYYY` (e.g. "Oct 2026") `src/components/MonthPicker.js:20`; month names are short English month names `MonthPicker.js:7-10`; a selection sets the value to `YYYY-MM` `MonthPicker.js:22,31-32`. Any month of the allowed years can be picked, including future months of the current year.
- Buttons: "Generate" (primary, submit) `ExportForm.js:35`; loading indicator while the request runs `ExportForm.js:36`; "Download" (success style) shown when a URL is present, click → `window.location.assign(url)` `ExportForm.js:37-39`. Error banner (red alert) "Problem preparing file" above the form `ExportForm.js:25`, `src/components/ErrorMessage.js:6`. Generate is not disabled while loading.
- State: on Generate → loading on, URL and error cleared; on failure → loading off, error on; on success → loading off, URL set `src/reducers/export.js:6-14`. State resets whenever the router enters a path starting with `/export` `src/reducers/export.js:15-17`.
- Request: `POST /export/trips`, JSON body = form values, header `Authorization: Bearer <jwt>` (empty token if none) `src/actions/exportActions.js:17-22`. Any error or non-2xx → failure `exportActions.js:23-28`; success → URL = response body `exportActions.js:30-33`.
- Quirk: if the user never touches the month picker, `month` is the `moment()` object, so JSON sends an ISO-8601 UTC timestamp (e.g. `"2026-10-29T09:12:00.000Z"`), not `YYYY-MM` `ExportForm.js:61`. The server parses it non-strictly with format `YYYY-MM` and takes the first year-month `server/export/exportTravelWarrant.js:34`. Near midnight on the 1st, the UTC month can differ from the local month.
- Server wiring: `bodyParser.json()` + `POST /export/*` → `exportMiddleware` `server/index.js:50-51`. No user in request context → HTTP 401, empty body `server/export/exportMiddleware.js:11-13`. The request context user is loaded from the JWT `sub` `server/auth/setup.js:24-37`. Exporter is picked by exact path (`/export/trips` → travel warrant) `exportMiddleware.js:5-8,16-19`. The body (`{userId, month}`) is passed unchecked, so any `userId` works `exportMiddleware.js:20`. Success → HTTP 200 with a JSON string `'http://' + Host header + '/' + path.relative(server/export, file)` = `http://<host>/../download/cestovny-prikaz-<N>.xlsx` `exportMiddleware.js:21-23`. Any thrown error → logged, HTTP 500, empty body `exportMiddleware.js:24-27`.
- File: written to `server/download/cestovny-prikaz-<N>.xlsx`, `N = Math.round(Math.random() * 90000000 + 10000000)` (integer 10000000..100000000, so 8 digits, very rarely 9) `exportTravelWarrant.js:176-181`. No collision check: an equal N overwrites an older file.
- Download: folder `server/download` created at startup (exists → ignored) `server/index.js:26-33`; served statically at `/download` with no auth `server/index.js:34`. Missing file → 404. Files are never deleted (no code removes them). The detail export writes into the same folder.

**Constraints**:

- **[PRESERVED BUG]** Server accepts any `userId` in the body; it does not check that the caller is that user or an admin. Generated files are public under `/download`, have random names and are never deleted _(rewrite spec: Travel-warrant export; client answer: S5)_.
- Download URL uses the request scheme, built by the NFR-SEC-03 URL builder. Do not hardcode `http://`. The returned value is still a JSON string URL (same shape as today).
- UI copy below is the exact old English copy; keys get Slovak translations via NFR-L10N-01. The xlsx itself stays template text (TWE-03) _(client answer: S7)_.
- Old URL `/export` must keep working _(client answer: S6)_; SETUP-02 owns routing.
- Regular users see only their own user record _(interview: Data visibility)_, so the "Who:" list for non-admins holds only the caller. The new SPA must still filter to the caller for non-admins, so the UI does not depend on the server filter.
- The new SPA always sends `month` as `YYYY-MM` (local month of the picker). The server must still accept any string whose first 7 characters are `YYYY-MM` (e.g. an ISO timestamp), as the old non-strict parse did.
- Deployment: files live on the local disk of the pod that generated them. `GET /download/...` must reach the same pod. Suggested: run the app with a single replica (as the old single container did) and keep the folder on the container filesystem, or mount a shared volume at the download folder if more than one replica is ever used `(interview: suggested answer accepted)`. Files are lost when the pod restarts, as in the old app.

**API**:

`POST /export/trips` (REST)

- Request: `Content-Type: application/json`; `Authorization: Bearer <jwt>` (AUTH-03 builds the request context).
- Body:

| Field    | Type   | Required | Notes                                                        |
| -------- | ------ | -------- | ------------------------------------------------------------ |
| `userId` | string | yes      | User `id` (DATA-01). Any id accepted (preserved bug).        |
| `month`  | string | yes      | `YYYY-MM`; longer strings parsed by their leading `YYYY-MM`. |

- Response 200: JSON string, absolute URL of the file, e.g. `"https://<host>/download/cestovny-prikaz-48213907.xlsx"` (scheme and host from NFR-SEC-03 builder; path `/download/<filename>`).
- 401, empty body: no authenticated user in the request context (missing, invalid or expired JWT, or JWT user not in DB).
- 500, empty body: any error. Includes: 16 or more trips (TWE-02); `userId` not found (user is `null`, header template fails, `exportTravelWarrant.js:33,72-79`); a trip whose `placeId` has no Place (`trip.place.country` throws, `exportTravelWarrant.js:55,61`); FX failure (TWE-05); unparseable `month` (invalid date → Mongo query cast error). Error is logged server-side.
- Missing `userId` or `month`: old behavior unverified (no validation, `exportMiddleware.js:20`). Suggested: respond 500 like any other error `(interview: suggested answer accepted; verify before go-live)`.
- Side effects: writes one xlsx file to the download folder; may call the FX provider (TWE-05).
- No GraphQL counterpart (old app has none).

`GET /download/<filename>` (REST, static)

- No auth (preserved bug).
- 200: file bytes, content type for `.xlsx` (`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`). 404: no such file.
- Must be registered before the SPA fallback route so it is not swallowed by the SPA.

**Screens**:

`/export` — "Export" menu item, logged-in users.

- Field "Who:" — user combobox, option label `<surname>, <firstName>`, value user id. Default: logged-in user. Admin: all users. Non-admin: only self. Load error: "Problem loading users: <message>".
- Field "Month:" — month picker, display `MMM YYYY`, value `YYYY-MM`, years 2017..current year, default current month.
- Validation: both required, message "Required", shown after the field is touched (or on submit attempt).
- Action "Generate" (primary): sends `POST /export/trips`; shows a loading indicator; clears previous URL and error.
- On success: show "Download" button (success style) next to Generate; click navigates the browser to the URL (file download).
- On failure (any non-2xx or network error): red alert "Problem preparing file" above the form; no Download button.
- Navigating to `/export` (again) resets loading, URL and error.
- Not logged in: old route has no guard and the server answers 401 → "Problem preparing file". Suggested: use the SETUP-02 logged-out handling (login redirect) `(interview: suggested answer accepted)`.

**Permissions**:

| Action                         | Regular user                                               | Admin                     |
| ------------------------------ | ---------------------------------------------------------- | ------------------------- |
| Open `/export`                 | UI allows                                                  | UI allows                 |
| Pick another person            | UI: no (only self listed) / server: allows (preserved bug) | UI allows / server allows |
| `POST /export/trips`           | server: any authenticated user, any `userId`               | same                      |
| `GET /download/*`              | public, no auth                                            | public, no auth           |
| Anonymous `POST /export/trips` | 401                                                        | —                         |

**Acceptance criteria**:

- Given a logged-in regular user on `/export`, then "Who:" lists only that user and is preselected, and "Month:" shows the current month.
- Given an admin on `/export`, then "Who:" lists all users as `surname, firstName`.
- Given the month picker, then years 2017 to the current year are offered.
- Given 3 trips of user U departing in 2018-03, when Generate for U and 2018-03, then the response is 200 with a URL `<request scheme>://<host>/download/cestovny-prikaz-<digits>.xlsx` and the "Download" button appears.
- Given the Download button, when clicked, then the browser downloads the xlsx without sending a JWT, and the file opens.
- Given the request is served over HTTPS, then the returned URL starts with `https://`.
- Given a regular user, when they POST `{userId: <other user id>}`, then the export succeeds (preserved bug).
- Given no JWT, when POST `/export/trips`, then 401 and the screen shows "Problem preparing file".
- Given 16 trips in the month, when Generate, then 500 and "Problem preparing file".
- Given an unknown `userId`, when Generate, then 500.
- Given a generated file, when 1 day passes, then it is still downloadable (no cleanup).
- Given a URL and error on screen, when the user navigates away and back to `/export`, then both are cleared.
- Given the "Month:" field emptied, when submit, then "Required" is shown and no request is sent.

**Tests**:

- Unit: filename pattern `cestovny-prikaz-\d{8,9}\.xlsx`; month parsing (`2018-03`, `2018-03-15T10:00:00.000Z` → March 2018; `abc` → error); URL builder use (via NFR-SEC-03 mock: `https` → `https://`); SPA export state (Generate clears URL/error; failure sets error; success sets URL; route entry resets).
- Integration (server + MongoDB 8): 401 without JWT; 200 + file exists on disk and is served by `GET /download/<name>` with xlsx content type; 404 for unknown file; any `userId` accepted; unknown `userId` → 500; 16 trips → 500; trip with deleted place → 500.
- End-to-end: regular user generates and downloads own export for a month with trips; admin picks another user; error banner on server failure.

#### TWE-02 — Template choice

- **Type**: functional
- **Source**:
  - `(rewrite spec: Features by area › Travel-warrant export)` — "Template is chosen by trips departing in the month: 0–9 → `upto19`, 10–15 → `upto31`."
  - `(rewrite spec: Features by area › Travel-warrant export)` — "**[PRESERVED BUG]** 16 or more trips in a month fail with HTTP 500 / "Problem preparing file"."
  - `(rewrite spec: Migration and rollout)` — "Export over 15 trips and leave validation/state bugs are preserved 1:1."
- **Depends on**: DATA-01

**Goal**: The server selects the trips of the chosen user whose departure lies in the chosen month and picks a template by their count. Up to 9 trips use `cestovny-prikaz-upto19.xlsx`, 10 to 15 use `cestovny-prikaz-upto31.xlsx`, and 16 or more fail.

**Old behavior**:

- Month range: `start = moment(month, 'YYYY-MM')` (00:00 of the 1st, server-process local timezone), `end = start + 1 month` `server/export/exportTravelWarrant.js:34-35`.
- Trips: `Trip.find({userId, departureTime: {$gte: start, $lt: end}}).sort({departureTime: 1})` `exportTravelWarrant.js:37-43`. Only `departureTime` decides; a trip departing on 31 March and arriving 2 April is in March only.
- Template list `[{maxNumber: 9, upto19}, {maxNumber: 15, upto31}]`; first template with `maxNumber >= count` wins `exportTravelWarrant.js:8-18`.
- 16+ trips → no file path (`undefined`) → `readFile` throws → HTTP 500 `exportTravelWarrant.js:68`, `exportMiddleware.js:24-27`.
- Code comments: `upto19` is "Optimized for two A4 papers, saved in Excel"; `upto31` "Exceeding two A4 papers, saved in LibreOffice" `exportTravelWarrant.js:9-13`.
- Meaning of the names (from the template files): "19"/"31" is the number of 2-row Odchod/Príchod pairs on the right side (`upto19`: rows 7–44 = 19 pairs; `upto31`: rows 7–68 = 31 pairs). Each trip uses 2 pairs, so 9 and 15 trips fit.

**Constraints**:

- **[PRESERVED BUG]** 16 or more trips in a month → HTTP 500 → "Problem preparing file" _(rewrite spec; A5 Not relevant)_. Do not add a third template or pagination.
- Month boundaries use the timezone set in TWE-03 › Business rules (suggested `Europe/Bratislava` `(interview: suggested answer accepted)`).

**Business rules**:

| Trips with `departureTime` in [month start, next month start) | Template file                 |
| ------------------------------------------------------------- | ----------------------------- |
| 0–9                                                           | `cestovny-prikaz-upto19.xlsx` |
| 10–15                                                         | `cestovny-prikaz-upto31.xlsx` |
| ≥ 16                                                          | none → error → HTTP 500       |

Examples: 0 trips → `upto19` with only the header filled; 9 → `upto19`; 10 → `upto31`; 15 → `upto31`; 16 → 500. A trip departing `2018-03-31 23:30` (local) counts for March; one departing `2018-04-01 00:00` counts for April.

**Acceptance criteria**:

- Given 3 trips departing in 2018-03, when exporting 2018-03, then `upto19` is used.
- Given 9 trips, then `upto19`; given 10, then `upto31`; given 12, then `upto31`; given 15, then `upto31`.
- Given 16 trips, then HTTP 500 and "Problem preparing file".
- Given 0 trips, then a file is produced from `upto19` with header filled and empty trip rows.
- Given trips of other users in the month, then they are not counted.
- Given a trip departing in February and arriving in March, then it is not in the March export.

**Tests**:

- Unit: count → template mapping for 0, 1, 9, 10, 15, 16, 30.
- Integration: month range query at both month edges; other users' trips excluded; ordering by `departureTime` ascending.
- End-to-end: covered by TWE-01 (16 trips → error banner).

#### TWE-03 — Template filling

- **Type**: functional
- **Source**:
  - `(rewrite spec: Features by area › Travel-warrant export)` — "Template is filled with name/degrees/address and per-trip left rows and right 4-row blocks (dates, origin/destination, times ± travel duration, travel type, price, diet)."
  - `(rewrite spec: Features by area › Travel-warrant export)` — "Cached formula values are stripped so Excel recalculates totals."
  - `(rewrite spec: Features by area › Travel-warrant export)` — "**[PRESERVED BUG]** Origin "Bratislava" is hardcoded; `upto31` totals sum only `R7:R44`; approver name is static template text."
- **Depends on**: DATA-01, TWE-02, TWE-04, NFR-MNT-02

**Goal**: The server opens the chosen template, fills the header with the user's name, degrees and address, writes one left-side row and one right-side 4-row block per trip (in departure order), strips cached formula results so the spreadsheet app recalculates totals on open, and saves the result as a new file. Template static text (Slovak labels, approver name, formulas) stays as is.

**Old behavior**:

- Template files: `server/templates/cestovny-prikaz-upto19.xlsx` and `server/templates/cestovny-prikaz-upto31.xlsx`, single worksheet (sheet 1) `exportTravelWarrant.js:8-14,68-69`. Placeholders are lodash templates stored as cell text (`${...}` interpolation, `<% print(...) %>` with `moment` imported) `exportTravelWarrant.js:72-93,135-143`.
- Header: every cell in rows 1–4 is run through the template with `{user}` `exportTravelWarrant.js:72-79`. Only `C3` and `B4` contain placeholders. Lodash prints `null`/`undefined` as empty text.
- Left part: template cells `A8`, `C8`, `F8`, `H8` are read, then cleared to `''`; trip _i_ (0-based) is written to row `8 + i`, columns A, C, F, H `exportTravelWarrant.js:81-111`.
- Right part: 13 template cells of block 0 are read and cleared; trip _i_ is written to the same cells shifted down by `4 × i` rows `exportTravelWarrant.js:113-160`. Cell list (block 0): `J7, J9, L7, L8, L9, L10, M7, M8, M9, M10, N7, R7, S7` `exportTravelWarrant.js:114-129`.
- Value typing (`setCellValue`) `exportTravelWarrant.js:20-30`:
  - Text matching `^-?([0-9]+)(\.[0-9]+)?$` → stored as number, number format `0.00`.
  - Text matching `^[0-9]{1,2}\/[0-9]{1,2}\/[0-9]{2,4}$` → stored as the text itself, number format `dd/mm/yyyy` (it stays text, not a date serial).
  - Anything else → stored as text (including `''`).
  - This applies to every filled cell, so a purpose or place name made only of digits (e.g. `2019`) becomes a number `2019.00`.
- Diet value: `computeDiet(place.country, hours)` per trip, hours = `|arrival − departure|` `exportTravelWarrant.js:53-65` (TWE-04).
- Formula cache: every formula cell gets its cached `result` removed `exportTravelWarrant.js:162-169`.
- Column 5 (E) width set to `15.56` (template: 10) to force the page break the code cannot keep, because the xlsx library drops the template's column break `exportTravelWarrant.js:171-174`. (`upto19` has a manual column break after column I.)
- Dates/times use plain `moment` without timezone setup, i.e. the Node process local timezone `exportTravelWarrant.js:3`. The Dockerfile sets no `TZ` (`Dockerfile:29-44`), so production most likely formats in UTC. `DEFAULT_TIMEZONE` (default `Europe/Bratislava`) is applied only by `moment-timezone` in mail and attendance code `server/service/mailService.js:51`, `server/service/attendenceService.js:119-120`; `package.json` / `yarn.lock` resolve `moment` 2.19.3 for the app and a separate `moment` for `moment-timezone`, so that default most likely does not reach the export (unverified: `node_modules` absent).
- **Analysis mismatch**: analysis §2.6 says "`upto31` totals still sum only `R7:R44`". In the file, the first total row `R69:X69` sums `R7:R68` … `X7:X68` correctly; the second "Spolu" row `R75:V75` and `X75` sum only rows 7–44 (`SUM(R7:R44)` … `SUM(V7:V44)`, `SUM(X7:X44)`).
- **Analysis mismatch**: analysis §2.6 lists the J7 departure date as `D.M.YYYY`-style; the template prints `DD/MM/YYYY` for J7/J9 (left-side A/H use `D.M.YYYY`). The analysis also omits that numeric-looking text becomes a number.

**Constraints**:

- **[PRESERVED BUG]** Origin "Bratislava" is hardcoded in left cells A and H (template text, not `place.originName`) _(rewrite spec)_.
- **[PRESERVED BUG]** `upto31` second total row sums only rows 7–44 (`R75:V75`, `X75`); `upto19` totals are not changed _(rewrite spec; A5 Not relevant)_.
- **[PRESERVED BUG]** Approver name is static template text: `F45` = "Ján Švantner" next to `A45` "So spôsobom vykonania súhlasí", in both templates _(rewrite spec)_.
- xlsx stays as the template text (Slovak labels) with no translation _(client answer: S7)_.
- Template files ship verbatim: copy `server/templates/cestovny-prikaz-upto19.xlsx` and `server/templates/cestovny-prikaz-upto31.xlsx` byte-for-byte from the old repo (commit `b94e050`) into the new server's assets, and include them in the server Docker image. Do not re-save them in Excel or LibreOffice. Templates are read from disk on each export and never modified.
- xlsx library: Instea picks _(client answer: S3)_. It must load these files, keep styles, merged cells, print area and formulas, and write output that opens in Excel and LibreOffice without a repair prompt. The old code notes that resaving the LibreOffice-made `upto31` with ExcelJS made "slightly corrupt" files `exportTravelWarrant.js:11-12`, which is why it is used only for 10–15 trips.
- The implementer may fill cells directly by address (table below) instead of evaluating the lodash placeholders, as long as the output cell values and formats match. Placeholder cells not filled must end up empty (`''`), not with `${...}` text.
- Timezone for month range (TWE-02) and all date/time formatting: suggested `DEFAULT_TIMEZONE` (default `Europe/Bratislava`, SETUP-01 config) `(interview: suggested answer accepted)`; old code used the process timezone.

**Business rules**:

Inputs (DATA-01): User `surname`, `firstName`, `degrees`, `address`; Trip `departureTime`, `arrivalTime`, `purpose`, `travelType`, `priceOfTravel`, `placeId`; Place `name`, `originName`, `destinationName`, `travelDuration` (ISO-8601 duration string, e.g. `PT2H30M`, `src/data/Place.js:11,15`), `country`.

Header cell map (both templates):

| Cell | Value                                                                           | Format |
| ---- | ------------------------------------------------------------------------------- | ------ |
| `C3` | `<surname>, <firstName>, <degrees>` (missing part → empty, e.g. `Novák, Ján, `) | text   |
| `B4` | `<address>` (missing → empty)                                                   | text   |

Left part, trip _i_ (0-based), row `r = 8 + i` (both templates):

| Cell   | Value                                                               | Format                             |
| ------ | ------------------------------------------------------------------- | ---------------------------------- |
| `A{r}` | `Bratislava, ` + departure `D.M.YYYY` (e.g. `Bratislava, 5.3.2018`) | text                               |
| `C{r}` | `place.name`                                                        | text (number `0.00` if all digits) |
| `F{r}` | `purpose`                                                           | text (number `0.00` if all digits) |
| `H{r}` | `Bratislava, ` + arrival `D.M.YYYY`                                 | text                               |

Rows used: `upto19` 8–16 (max 9 trips); `upto31` 8–22 (max 15 trips). With 0 trips, `A8`, `C8`, `F8`, `H8` are empty.

Right part, trip _i_, block start `b = 7 + 4 × i` (both templates):

| Cell     | Value                                                                            | Format                                |
| -------- | -------------------------------------------------------------------------------- | ------------------------------------- |
| `J{b}`   | departure date `DD/MM/YYYY` (e.g. `05/03/2018`)                                  | text, numFmt `dd/mm/yyyy`             |
| `J{b+2}` | arrival date `DD/MM/YYYY` only if it differs from the departure date, else empty | text, numFmt `dd/mm/yyyy` when filled |
| `L{b}`   | `place.originName`                                                               | text                                  |
| `L{b+1}` | `place.destinationName`                                                          | text                                  |
| `L{b+2}` | `place.destinationName`                                                          | text                                  |
| `L{b+3}` | `place.originName`                                                               | text                                  |
| `M{b}`   | departure `H:mm` (e.g. `8:00`)                                                   | text                                  |
| `M{b+1}` | (departure + travelDuration) `H:mm`                                              | text                                  |
| `M{b+2}` | (arrival − travelDuration) `H:mm`                                                | text                                  |
| `M{b+3}` | arrival `H:mm`                                                                   | text                                  |
| `N{b}`   | `travelType` code (e.g. `AUS`)                                                   | text                                  |
| `R{b}`   | `priceOfTravel` (Cestovné)                                                       | number, `0.00`                        |
| `S{b}`   | diet tariff in EUR, unrounded (Stravné, TWE-04)                                  | number, `0.00`                        |

Blocks used: `upto19` rows 7–42 (9 blocks); `upto31` rows 7–66 (15 blocks). Static labels `K{b}`/`K{b+2}` = "Odchod", `K{b+1}`/`K{b+3}` = "Príchod" are already in the template. Columns O (km), P, Q, T, U, V, X are never filled.

Trips beyond capacity cannot occur: 16+ trips fail before filling (TWE-02).

Template formulas (kept; cached results removed so they recalculate on open):

| Template | Cells                                      | Formula                                                               |
| -------- | ------------------------------------------ | --------------------------------------------------------------------- |
| both     | `W7, W9, …` every odd row of the trip area | `SUM(R{n}:V{n+1})` (upto19 n = 7..43; upto31 n = 7..67)               |
| upto19   | `R45:X45` ("Spolu")                        | `SUM(R7:R44)` … `SUM(X7:X44)`                                         |
| upto19   | `M47`, `W47`                               | `=M49`, `=Q47*M47` (`Q47` = 0.183 €/km)                               |
| upto19   | `M49`, `U49`, `W49`                        | `SUM(O7:O43)`, `T49*0.66+T50*0.34`, `(M49/100)*P49*U49`               |
| upto19   | `R51:V51`, `W51`, `X51`                    | `SUM(R7:R44)`…`SUM(V7:V44)`, `W49+W47+W45`, `SUM(X7:X44)`             |
| upto19   | `W53` / `W55`                              | value 0 (Preddavok) / `W51-W53`                                       |
| upto31   | `R69:X69` ("Spolu")                        | `SUM(R7:R68)` … `SUM(X7:X68)`                                         |
| upto31   | `M71`, `W71`                               | `=M73`, `=Q71*M71` (`Q71` = 0.183)                                    |
| upto31   | `M73`, `U73`, `W73`                        | `SUM(O7:O68)`, `T73*0.66+T74*0.34`, `(M73/100)*P73*U73`               |
| upto31   | `R75:V75`, `W75`, `X75`                    | `SUM(R7:R44)`…`SUM(V7:V44)` (bug), `W73+W71+W69`, `SUM(X7:X44)` (bug) |
| upto31   | `W77` / `W79`                              | value 0 / `W75-W77`                                                   |

Static template texts of note (kept): `A1` "Zamestnávateľ", `D2` "CESTOVNÝ PRÍKAZ", `J1` "Vyúčtovanie pracovnej cesty", `A3` "1. Priezvisko, meno, titul", `A4` "2. Bydlisko", `G5`/`H5` "Od 8:00" / "Do 16:30", `F45` "Ján Švantner", travel-type legend `J56:L60` (upto19) / `J80:L84` (upto31). Print area `A1:X61` (upto19); `upto31` fits to 1 page wide × 1 tall.

Other output settings: column E width 15.56 in the output (both templates). Output file name and folder: TWE-01.

Worked example (timezone Europe/Bratislava, `upto19`): user Novák Ján, degrees `Ing.`, address `Hlavná 1, Bratislava`; trip 0: departure 2018-03-05 07:00, arrival 2018-03-05 19:30, place `{name: "Viedeň, AT", originName: "Bratislava", destinationName: "Viedeň", travelDuration: "PT1H30M", country: "AT"}`, purpose `konzultácie`, travelType `AUS`, price `12.5`.

- `C3` `Novák, Ján, Ing.`; `B4` `Hlavná 1, Bratislava`.
- `A8` `Bratislava, 5.3.2018`; `C8` `Viedeň, AT`; `F8` `konzultácie`; `H8` `Bratislava, 5.3.2018`.
- `J7` `05/03/2018`; `J9` empty; `L7` `Bratislava`; `L8` `Viedeň`; `L9` `Viedeň`; `L10` `Bratislava`; `M7` `7:00`; `M8` `8:30`; `M9` `18:00`; `M10` `19:30`; `N7` `AUS`; `R7` 12.50; `S7` 45.00 (12.5 h > 12 → 100 % of AT 45, TWE-04).
- A second trip departing 2018-03-20 23:00 and arriving 2018-03-21 06:00 fills row 9 left and block rows 11–14 right, with `J13` = `21/03/2018`.

**Acceptance criteria**:

- Given the worked example, when exported, then every listed cell has exactly the listed value and format.
- Given a user without degrees or address, then `C3` ends with `, ` and `B4` is empty, with no `undefined` text.
- Given a trip arriving on a later day, then `J{b+2}` holds the arrival date; given same-day arrival, then it is empty.
- Given 0 trips, then no `${` or `<%` text remains anywhere in the sheet.
- Given any export, then every formula cell has no cached value and the totals show correct sums after opening in Excel and LibreOffice.
- Given an `upto31` export with 12 trips, then `R69` sums all 12 prices and `R75` sums only trips 0–9 (rows 7–44) (preserved bug).
- Given any export, then `F45` reads "Ján Švantner" and left cells A/H start with `Bratislava, ` regardless of `place.originName`.
- Given any export, then column E width is 15.56 and the file opens without a repair prompt in Excel.
- Given a purpose `2019`, then `F{r}` is the number 2019 with format `0.00`.

**Tests**:

- Unit: cell-map builder for the worked example (both templates, block offsets for i = 0, 1, 8, 14); value typing rules (`12.5` → number; `-3` → number; `05/03/2018` → text + `dd/mm/yyyy`; `1e5` → text; `''` → empty); time ± ISO duration (`PT1H30M`, `PT0S`, `PT23H45M` crossing midnight); timezone formatting around DST change (2018-03-25, 2018-10-28).
- Integration: generate xlsx from the real template files, re-read it, assert cell values, formats, formulas present without cached values, `F45` text, column E width, and that the template files on disk are unchanged.
- End-to-end: download a generated file and open it with the chosen xlsx library to check header and first trip.

#### TWE-04 — Per-diem

- **Type**: functional
- **Source**:
  - `(rewrite spec: Features by area › Travel-warrant export)` — "Per-diem by country and whole-trip hours: SK 4.5 / 6.7 / 10.3 €; foreign 25 / 50 / 100 % of tariff; unknown country 0."
  - `(rewrite spec: Features by area › Travel-warrant export)` — "**[PRESERVED BUG]** SK trips under 5 h get 6.7 €; multi-day trips are not split per day."
  - `(rewrite spec: NFR › Maintainability)` — "Shared types package … (… countries, diet tariffs) …"
- **Depends on**: NFR-MNT-02, DATA-01, TWE-05

**Goal**: For each exported trip the server computes the per-diem (stravné) in EUR from the place's country and the whole trip's duration in hours. Slovakia uses three fixed amounts; other countries use 25 %, 50 % or 100 % of a country tariff, converted to EUR when the tariff is not in EUR (TWE-05). Countries without a tariff get 0.

**Old behavior**:

- Hours = `moment.duration(|arrivalTime − departureTime|).asHours()`, fractional, whole trip `server/export/exportTravelWarrant.js:57-60`. Country = `place.country` `exportTravelWarrant.js:61`.
- `compute(countryCode, hours)` returns a Promise of a number `src/data/Diets.js:234-251`: tariff is a function (SK, non-EUR) → call it; a number → `foreign(tariff, hours)`; no entry → `foreign(0, hours)` = 0.
- SK `src/data/Diets.js:10-18`; foreign percentages `Diets.js:20-28`; non-EUR conversion `Diets.js:30-33`; tariff table `Diets.js:37-232`; `DEFAULT_DIET = 0` `Diets.js:35`. Source cited in code: Slovak decree on basic per-diem rates (zbierka.sk link) `Diets.js:36`.
- No rounding of the final value; the cell shows it with format `0.00` (TWE-03).
- **Analysis mismatch**: analysis §2.6 says 191 tariff entries and cites `Diets.js:234-256`; the code has 194 entries (SK + 134 EUR + 59 non-EUR) and `compute` spans `Diets.js:234-251`.
- Tariff codes `CW`, `ME`, `RS` exist in the table but not in the Place country enum (`src/data/Countries.js` has `CS` "Serbia and Montenegro" and `AN` "Netherlands Antilles" instead), so they are unreachable; `CS` and `AN` get 0. 52 enum countries have no tariff and get 0.

**Constraints**:

- **[PRESERVED BUG]** SK trips under 5 h get 6.7 € (not 0) _(rewrite spec; client answer: A3 Not relevant)_.
- **[PRESERVED BUG]** Multi-day trips are not split per day: one amount for the whole duration _(rewrite spec; A3 Not relevant)_.
- The tariff table and SK amounts live in the shared types package owned by NFR-MNT-02; this task's appendix is the authoritative content. Do not change amounts, currencies or codes (including unreachable `CW`, `ME`, `RS`).
- Computation runs on the server only.

**Business rules**:

Let `h` = |arrival − departure| in hours (fractional, not rounded).

Slovakia (`SK`):

| Condition     | Diet (EUR)          |
| ------------- | ------------------- |
| `h < 5`       | 6.7 (preserved bug) |
| `5 ≤ h ≤ 12`  | 4.5                 |
| `12 < h ≤ 18` | 6.7                 |
| `h > 18`      | 10.3                |

Other country with tariff `T` (in EUR; non-EUR first converted to EUR and rounded to 2 decimals, TWE-05):

| Condition    | Diet (EUR) |
| ------------ | ---------- |
| `h ≤ 6`      | `T × 0.25` |
| `6 < h ≤ 12` | `T × 0.5`  |
| `h > 12`     | `T`        |

Country not in the table, or Place without country: 0.

Worked examples:

| Country        | Duration                        | Diet                                                                                                                |
| -------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| SK             | 3 h                             | 6.7                                                                                                                 |
| SK             | 4 h 59 min                      | 6.7                                                                                                                 |
| SK             | 5 h                             | 4.5                                                                                                                 |
| SK             | 12 h                            | 4.5                                                                                                                 |
| SK             | 12 h 1 min                      | 6.7                                                                                                                 |
| SK             | 18 h                            | 6.7                                                                                                                 |
| SK             | 18 h 1 min                      | 10.3                                                                                                                |
| SK             | 50 h (3 days)                   | 10.3 (no split)                                                                                                     |
| AT (45 EUR)    | 6 h                             | 11.25                                                                                                               |
| AT             | 6 h 30 min                      | 22.5                                                                                                                |
| AT             | 10 h                            | 22.5                                                                                                                |
| AT             | 12 h                            | 22.5                                                                                                                |
| AT             | 13 h                            | 45                                                                                                                  |
| PL (37 EUR)    | 2 h                             | 9.25                                                                                                                |
| HU (39 EUR)    | 72 h                            | 39                                                                                                                  |
| CZ (600 CZK)   | 10 h                            | `round2(600 CZK in EUR) × 0.5`; with rate EUR 0.76 / CZK 21.1 per USD: `round2(600 / 21.1 × 0.76) = 21.61` → 10.805 |
| AX (no tariff) | 10 h                            | 0                                                                                                                   |
| any            | arrival before departure by 8 h | same as 8 h (absolute value)                                                                                        |

**Acceptance criteria**:

- Given each row of the worked-examples table, when computing the diet, then the result equals the listed value.
- Given an SK trip of 4 h, then the exported `S` cell is 6.70.
- Given a 3-day SK trip, then one 10.3 € amount is exported, not per day.
- Given a place with country `CS`, then the diet is 0.
- Given the shared package, then it holds exactly the 194 entries of the appendix.

**Tests**:

- Unit: every boundary above for SK and foreign (exact equality and ±1 minute); unknown country; missing country; non-EUR path with a mocked FX rate (TWE-05); table snapshot test against the appendix (194 entries, codes, amounts, currencies).
- Integration: export with trips to SK, AT, CZ (mocked FX) and an unknown country; check `S` cells.

**Appendix — diet tariff table** (`src/data/Diets.js:38-231`; amount = full daily basic tariff for > 12 h; `SK rule` = SK table above)

| Code | Amount  | Currency | Code | Amount | Currency | Code | Amount | Currency |
| ---- | ------- | -------- | ---- | ------ | -------- | ---- | ------ | -------- |
| SK   | SK rule | EUR      | AF   | 32     | EUR      | AL   | 33     | EUR      |
| DZ   | 42      | USD      | AD   | 42     | EUR      | AO   | 40     | EUR      |
| AI   | 50      | USD      | AG   | 52     | USD      | AR   | 37     | EUR      |
| AM   | 35      | USD      | AW   | 33     | USD      | AU   | 74     | AUD      |
| AZ   | 36      | USD      | BS   | 47     | USD      | BH   | 39     | EUR      |
| BD   | 36      | EUR      | BB   | 54     | USD      | BE   | 45     | EUR      |
| BZ   | 45      | USD      | BJ   | 47     | USD      | BM   | 51     | USD      |
| BT   | 30      | EUR      | BY   | 39     | EUR      | BO   | 32     | EUR      |
| BA   | 40      | EUR      | BW   | 33     | EUR      | BR   | 40     | EUR      |
| BN   | 27      | EUR      | BG   | 36     | EUR      | BF   | 36     | EUR      |
| BI   | 43      | EUR      | CW   | 40     | USD      | CY   | 41     | EUR      |
| TD   | 39      | EUR      | CZ   | 600    | CZK      | CL   | 37     | EUR      |
| ME   | 40      | EUR      | CN   | 38     | EUR      | DK   | 380    | DKK      |
| DM   | 41      | USD      | DO   | 50     | USD      | DJ   | 38     | EUR      |
| EG   | 40      | EUR      | EC   | 45     | EUR      | ER   | 38     | EUR      |
| EE   | 42      | EUR      | ET   | 39     | EUR      | FJ   | 55     | AUD      |
| PH   | 31      | EUR      | FI   | 50     | EUR      | FR   | 45     | EUR      |
| PF   | 42      | EUR      | GA   | 45     | EUR      | GM   | 33     | USD      |
| GH   | 55      | USD      | GI   | 40     | EUR      | GR   | 42     | EUR      |
| GD   | 46      | USD      | GE   | 37     | USD      | GP   | 38     | EUR      |
| GT   | 38      | USD      | GN   | 43     | USD      | GW   | 46     | USD      |
| GY   | 38      | EUR      | HT   | 55     | USD      | NL   | 45     | EUR      |
| HN   | 38      | USD      | HK   | 40     | EUR      | HR   | 40     | EUR      |
| IN   | 38      | EUR      | ID   | 42     | EUR      | IQ   | 35     | EUR      |
| IR   | 37      | EUR      | IE   | 53     | EUR      | IS   | 55     | EUR      |
| IL   | 48      | EUR      | JM   | 56     | USD      | JP   | 6500   | JPY      |
| YE   | 35      | EUR      | JO   | 36     | EUR      | ZA   | 38     | EUR      |
| KH   | 29      | EUR      | CM   | 38     | EUR      | CA   | 65     | CAD      |
| CV   | 38      | USD      | QA   | 35     | EUR      | KZ   | 45     | EUR      |
| KE   | 45      | EUR      | KG   | 37     | EUR      | CO   | 39     | EUR      |
| KM   | 35      | USD      | CD   | 60     | USD      | CG   | 55     | USD      |
| KP   | 34      | EUR      | KR   | 40     | EUR      | CR   | 45     | USD      |
| CU   | 45      | EUR      | KW   | 38     | EUR      | LA   | 34     | EUR      |
| LS   | 32      | EUR      | LB   | 37     | EUR      | LR   | 55     | USD      |
| LY   | 45      | EUR      | LI   | 80     | CHF      | LT   | 40     | EUR      |
| LV   | 40      | EUR      | LU   | 50     | EUR      | MO   | 59     | EUR      |
| MK   | 37      | EUR      | MG   | 31     | EUR      | HU   | 39     | EUR      |
| MY   | 32      | EUR      | MW   | 34     | EUR      | MV   | 41     | EUR      |
| ML   | 46      | USD      | MT   | 45     | EUR      | MA   | 35     | USD      |
| MQ   | 25      | EUR      | MU   | 34     | EUR      | MR   | 30     | EUR      |
| MX   | 35      | EUR      | MM   | 41     | EUR      | MD   | 40     | EUR      |
| MC   | 45      | EUR      | MN   | 40     | EUR      | MZ   | 35     | EUR      |
| NA   | 31      | EUR      | DE   | 45     | EUR      | NP   | 36     | EUR      |
| NE   | 42      | USD      | NG   | 47     | EUR      | NI   | 44     | USD      |
| NO   | 420     | NOK      | NZ   | 48     | USD      | OM   | 38     | EUR      |
| PK   | 35      | EUR      | PA   | 42     | USD      | PG   | 30     | EUR      |
| PY   | 31      | EUR      | PE   | 40     | EUR      | CI   | 38     | EUR      |
| PL   | 37      | EUR      | PR   | 35     | USD      | PT   | 43     | EUR      |
| AT   | 45      | EUR      | GQ   | 45     | USD      | RO   | 43     | EUR      |
| RU   | 39      | EUR      | RW   | 41     | EUR      | SV   | 40     | USD      |
| WS   | 36      | USD      | SM   | 45     | EUR      | SA   | 36     | EUR      |
| SN   | 41      | USD      | SC   | 35     | EUR      | SL   | 48     | USD      |
| SG   | 35      | EUR      | SI   | 38     | EUR      | SO   | 32     | EUR      |
| AE   | 35      | EUR      | GB   | 37     | GBP      | US   | 60     | USD      |
| RS   | 43      | EUR      | LK   | 37     | EUR      | CF   | 31     | USD      |
| SD   | 42      | EUR      | SR   | 42     | EUR      | SZ   | 29     | EUR      |
| LC   | 40      | USD      | KN   | 57     | USD      | ST   | 37     | USD      |
| SY   | 30      | EUR      | ES   | 43     | EUR      | CH   | 80     | CHF      |
| SE   | 455     | SEK      | TJ   | 32     | EUR      | TW   | 40     | EUR      |
| IT   | 45      | EUR      | TZ   | 42     | EUR      | TH   | 31     | EUR      |
| TG   | 36      | EUR      | TT   | 56     | USD      | TN   | 37     | EUR      |
| TR   | 44      | EUR      | TM   | 33     | EUR      | UG   | 42     | EUR      |
| UA   | 37      | EUR      | UY   | 37     | EUR      | UZ   | 39     | EUR      |
| VA   | 45      | EUR      | VE   | 46     | EUR      | VN   | 35     | EUR      |
| ZM   | 33      | EUR      | ZW   | 39     | EUR      |      |        |          |

Non-EUR currencies used: USD (48 countries), AUD (AU, FJ), CHF (LI, CH), CZK (CZ), DKK (DK), JPY (JP), CAD (CA), NOK (NO), GBP (GB), SEK (SE). Note `NZ` is 48 USD (as in the code).

#### TWE-05 — FX conversion for non-EUR tariffs

- **Type**: functional
- **Source**:
  - `(rewrite spec: Features by area › Travel-warrant export)` — "Non-EUR diet tariffs are converted to EUR via an exchange-rate source (source: open question S1)." Resolved: same provider as the old app _(client answer: S1)_; API believed alive _(client answer: A6)_.
- **Depends on**: SETUP-01, NFR-MNT-02, TST-03

**Goal**: When a trip's country tariff is in a currency other than EUR, the server converts the tariff amount to EUR with the same exchange-rate provider as the old app (Open Exchange Rates, via the `currency-converter` package), then applies the TWE-04 percentage. The provider key comes from an environment variable instead of source code.

**Old behavior**:

- Package `currency-converter` `^0.1.12` (`package.json:18`), resolved 0.1.12 (`yarn.lock:3695-3701`, deps `bluebird ^2.3.2`, `request ^2.40.0`). `node_modules` is absent in the repo; the package behavior below was read from the published 0.1.12 source on the npm registry (`index.js`, `app/openExchangeRates.js`, `app/openExchangeRateUtils.js`, `app/db/rates.txt`).
- Setup: `require('currency-converter')({fetchInterval: 3600000, CLIENTKEY: <hardcoded key>})` `src/data/Diets.js:1-4`. The key is in source (security risk, analysis §8); it is not reproduced here.
- Conversion call: `cc.convert(amount, currency, 'EUR')` (Bluebird promise wrapped into a native promise), then `foreign(result.amount, hours)` `Diets.js:6-8,30-33`.
- Provider endpoint: `http://openexchangerates.org/api/latest.json?app_id=<CLIENTKEY>` (package `app/openExchangeRates.js`). Response `.rates` = units of each currency per 1 USD.
- Formula (package `app/openExchangeRateUtils.js`): `EUR = round2(amount / rate[FROM] × rate[EUR])`, `round2(x) = Math.round(x × 100) / 100`. Result object `{currency: 'EUR', symbol, amount}`; the old code uses `amount`.
- Caching (package): rates are stored in a file `app/db/rates.txt` inside the package folder (`CODE=symbol rate` per line). Each `convert` reads that file. Only when the file is empty does it call the API, then writes the new rates to the file. `fetchInterval` starts a `setInterval` of 1 h with no immediate first fetch; each tick only re-reads the local file (no network call while the file is non-empty).
- **Analysis mismatch**: the analysis describes this as an hourly API fetch (§2.1 Ops, §4). In the package code, the published package ships a non-empty `app/db/rates.txt` (USD = 1, EUR 0.76, CZK 21.1, GBP 0.6, CHF 0.92, AUD 1.07, CAD 1.09, DKK 5.65, NOK 6.18, SEK 6.97, JPY 103.73; no date). The Docker image installs the package from the registry (`Dockerfile:20-22,32`), so the old app most likely never calls the API and converts with these frozen rates. Runtime unverified.
- Failure handling (package): an unknown currency or a failed or non-JSON live fetch either rejects or leaves the promise pending forever (callback errors are not caught). A rejection fails `Promise.all` → HTTP 500 `exportTravelWarrant.js:53-65`, `exportMiddleware.js:24-27`; a pending promise leaves the HTTP request hanging.
- Conversion happens per trip, on every export; no rates are stored in MongoDB.

**Constraints**:

- Provider: Open Exchange Rates `latest.json`, same as the old app _(client answer: S1)_. API believed alive _(client answer: A6)_.
- Key: env var `FX_API_KEY` (name proposed), loaded via SETUP-01 config. Never hardcode or log it. The old key must be rotated or reused by Instea; do not copy it from the old source into the new repo.
- The old frozen package rates are not reproduced. Suggested: fetch live rates from the provider as described below `(interview: suggested answer accepted)`.
- Conversion formula and 2-decimal rounding as in the old package; rounding happens before the TWE-04 percentage.
- HTTP client and caching library: Instea picks _(client answer: S3)_.

**Integrations**:

- Service: Open Exchange Rates. Operation: `GET https://openexchangerates.org/api/latest.json?app_id=${FX_API_KEY}` (HTTPS proposed; old URL is `http://`) `(interview: suggested answer accepted)`.
- Response used: `rates` object, base USD. Needed codes: `EUR` (target) and `USD`, `AUD`, `CAD`, `CHF`, `CZK`, `DKK`, `GBP`, `JPY`, `NOK`, `SEK`.
- Cache: in-memory, per server process. Suggested `(interview: suggested answer accepted)`:
  - Fetch on first need (first non-EUR conversion) and then refresh at most once per hour (`fetchInterval` 3600000 ms as in the old setup).
  - Before the first successful fetch, a conversion waits for that fetch.
  - On a refresh failure, keep using the last good rates and log a warning (without the key).
  - With no good rates at all (first fetch failed, timed out, or `EUR`/source code missing), the conversion fails → the export fails with HTTP 500 → "Problem preparing file". The request must not hang: use a fetch timeout (suggested 10 s).
- Missing env var: exports with only EUR/SK tariffs work; a non-EUR conversion fails with HTTP 500 and a server log line naming the missing variable.

**Business rules**:

- `EUR(amount, FROM) = round2(amount / rates[FROM] × rates['EUR'])`.
- Example with old package rates: `600 CZK → round2(600 / 21.1 × 0.76) = round2(21.6114) = 21.61`; `60 USD → round2(60 / 1 × 0.76) = 45.6`; `37 GBP → round2(37 / 0.6 × 0.76) = 46.87`.
- Then TWE-04: e.g. US trip of 5 h → `45.6 × 0.25 = 11.4`.

**Acceptance criteria**:

- Given mocked rates `{USD: 1, EUR: 0.9, CZK: 22.5}`, when a 10 h CZ trip is exported, then `S` = `round2(600 / 22.5 × 0.9) × 0.5 = 24 × 0.5 = 12`.
- Given rates fetched less than 1 h ago, when another export with non-EUR tariffs runs, then no new provider call is made.
- Given rates older than 1 h, when a non-EUR conversion is needed, then the rates are refreshed.
- Given the provider is down and good rates exist, when exporting, then the old rates are used and the export succeeds.
- Given the provider is down and no rates were ever fetched, when exporting a non-EUR trip, then HTTP 500 within the timeout and "Problem preparing file".
- Given a month with only SK/EUR-tariff trips, when the provider is down, then the export succeeds (no provider call).
- Given any log output, then the API key never appears.

**Tests**:

- Unit: conversion formula and rounding for all 10 currencies with fixed rates; cache freshness (fake timers: < 1 h no refetch, ≥ 1 h refetch); failure paths (timeout, non-200, invalid JSON, missing currency) with and without last good rates; missing env var.
- Integration: export with a stubbed HTTP provider (CZ, US, GB trips); provider failure → 500; key passed only as `app_id` query parameter.
- End-to-end: not required (provider stubbed in e2e environment); optional smoke test against the real API in a staging environment with the real key.

### Area: Leaves

#### LV-01 — Leaves list

- **Type**: functional
- **Source**: `(rewrite spec: Features by area › Leaves)` — "**[CHANGE]** Regular user sees only own leaves in list and calendar; admin sees all."
- **Source**: `(rewrite spec: Features by area › Leaves)` — "User lists leaves: Requester, Days (`start - end (N work days)`, `?` if unknown), Type, State, Approver, Delete."
- **Depends on**: SETUP-01, SETUP-02, DATA-01, AUTH-03, USR-05, NFR-MNT-02, NFR-L10N-01

**Goal**: A logged-in user opens the leaves page and sees a table of leaves. A regular user gets only the leaves they requested; an admin gets all leaves. The page holds the toolbar (Add, filter, List/Calendar switch) and the table; the filter is specified in LV-02, the calendar in LV-03, delete in LV-07.

**Old behavior**:

- Server `getLeaves` returns every leave of every user, no sort (`Leave.find({})`), guard `userProtected` (`server/graphql/leaveRelated.js:18-20`, `server/auth/rootResolverDecorators.js:1-8`).
- Each leave resolves `requester` and `approver` via `getUserOrDefault`; a missing user becomes `{firstName:'Deleted', surname:<id>, email:'<id>@deleted.instea.co'}` (`leaveRelated.js:58-63`, `server/service/userService.js:3-18`). Dates are serialized as ISO strings (`src/data/Leave.js:22-25`, `src/data/dataUtil.js:3`).
- Client query `LeavesQuery` asks `id startDate endDate type state isHalfDay numDays requester{id email firstName surname} approver{id email firstName surname}` (`angular/src/app/services/leaves.service.ts:55-79`). Missing `type` defaults to ANNUAL and missing `state` to PENDING on the client (`angular/src/app/leaves/leave.ts:30-46`).
- Page heading "Annual / Sick leaves"; toolbar: "Add" button → `/list/add`, three multiselects, "Clear filter", "List"/"Calendar" toggle (`angular/src/app/leaves/leaves-list/leaves-list.component.html:1-20`).
- Table `#leaveList` columns: "Requester", "Days", "Type", "State", "Approver", and an unlabeled column with a red "Delete" button (`leaves-list.component.html:22-48`).
- Requester / Approver cell = `firstName + ' ' + surname` (`angular/src/app/login-page/user.ts:7-9`); approver cell empty when there is no approver (`leaves-list.component.html:42`).
- Days cell = `{{startDate | date}} - {{endDate | date}}` + ` ({{numDays || '?'}} work days)` (`leaves-list.component.html:36-39`). Angular `date` pipe default is `mediumDate` (en-US: `Dec 5, 2017`), rendered in browser local time. `numDays` of `0`, `null` or missing shows `?` (falsy check).
- Type and State cells show the enum code (`ANNUAL`, `PENDING`, ...) via `translateLeaveType` / `translateLeaveState` pipes, which return the enum name (`angular/src/app/pipes/translate-leave-type.pipe.ts:6-8`, `translate-leave-state.pipe.ts:6-8`). The React labels "Doctor visit" / "Caring for a relative at home" in `src/data/LeaveType.js:5,8` are not used by any screen.
- Rows appear in server order; no client sort (`leaves-list.component.ts:72-79`).
- View (`list`/`calendar`) and filter are kept in app state (ngrx), default view `list`; they survive navigation inside the SPA and reset on page reload (`angular/src/app/state/leaves.ts:35-43`).
- **Analysis mismatch**: the analysis (§2.4) says `?` shows "if no numDays"; the code also shows `?` when `numDays` is `0` (`leaves-list.component.html:38`, `numDays || '?'`).
- No loading, empty or error state (`leaves-list.component.html`). Spec test: three leaves → three rows in server order (`leaves-list.component.spec.ts:107-114`).

**Constraints**:

- **[CHANGE]** `getLeaves` returns only the caller's own leaves (`requesterId = caller id`) for a non-admin; admin gets all. _(interview: Data visibility; confirmed over client answer A10 — interview: A10 vs Data visibility)_
- Contract shape unchanged: same operation name, no arguments, `[Leave]`. _(interview: API style)_
- **[CHANGE]** Client recovers after an API error without page reload _(rewrite spec: Auth and session)_: use SETUP-02 shared loading and error components.
- English copy is exact old copy; all strings are i18n keys translated to Slovak per NFR-L10N-01 _(client answer: A9)_.
- Leave type and state labels (English) are the enum codes from the shared package (NFR-MNT-02).

**Data model**: Leave (full definition in DATA-01). Read: `id`, `requesterId`, `approverId`, `startDate`, `endDate`, `type`, `state`, `isHalfDay`, `numDays`. User (DATA-01): `id`, `email`, `firstName`, `surname`.

**API**:

- `getLeaves: [Leave]` (GraphQL Query, no args).
  - Guard: `userProtected` (AUTH-03). Anonymous → `null`, HTTP 200.
  - Non-admin: leaves with `requesterId == caller.id`. Admin (`isAdmin = true`): all leaves.
  - Order: **(interview: suggested answer accepted)** old code has no sort and returns MongoDB natural order; suggested: sort by insertion order (`_id` ascending), which matches natural order for this collection.
  - `Leave` type: `id: ID!`, `requester: User`, `approver: User`, `state: LeaveState`, `startDate: String!` (ISO 8601 UTC, e.g. `2017-12-04T23:00:00.000Z`), `endDate: String!`, `type: LeaveType`, `isHalfDay: Boolean`, `numDays: Float` (`server/graphql/schema.js:34-40,101-107`).
  - `requester` / `approver` resolve the user by id; a missing user resolves to the "Deleted" placeholder (owned by USR-05). No `approverId` → `approver: null`.
  - No REST counterpart exists for leaves.

**Screens**:

- URL `/leaves/list` (also `/leaves/` redirects here; routing owned by SETUP-02). Who: any logged-in user.
- Heading: "Annual / Sick leaves".
- Toolbar left to right: "Add" (green button, goes to `/leaves/list/add`), "Requester", "Month", "Year" multiselects and "Clear filter" (LV-02), "List" / "Calendar" toggle with the active one highlighted (LV-03).
- List view table columns and cell content:

| Column header  | Content                                                                                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Requester      | `<firstName> <surname>` of requester                                                                                                                                      |
| Days           | `<start> - <end> (<N> work days)`; date format `MMM D, YYYY` (e.g. `Dec 5, 2017`) in browser local time; `N` = stored `numDays`, `?` when `numDays` is 0, null or missing |
| Type           | leave type code (`ANNUAL`, `SICKNESS`, `DOCTOR`, `MATERNITY`, `PARENTAL`, `CARING`); missing type shows `ANNUAL`                                                          |
| State          | `PENDING`, `APPROVED` or `REJECTED`; missing state shows `PENDING`                                                                                                        |
| Approver       | `<firstName> <surname>` of approver, empty when none                                                                                                                      |
| (empty header) | red "Delete" button on every row (LV-07)                                                                                                                                  |

- Rows: leaves that match the filter (LV-02), in server order.
- Loading: SETUP-02 loading component. Error: SETUP-02 error component; retry works without reload. Empty: header row only.
- Selected view and filter persist while the SPA stays loaded (navigating to add/approval and back keeps them); a page reload resets to view `list` and empty filter.
- Date format for Slovak locale: **(interview: suggested answer accepted)** suggested: locale medium date (`5. 12. 2017` style).

**Permissions**:

| Action           | Role  | UI allows                   | Server enforces      |
| ---------------- | ----- | --------------------------- | -------------------- |
| View leaves page | anon  | no (login screen, SETUP-02) | `getLeaves` → `null` |
| View leaves page | user  | yes, own leaves             | own leaves only      |
| View leaves page | admin | yes, all leaves             | all leaves           |

**Business rules**:

- Visibility: `visible(leave) = caller.isAdmin || leave.requesterId == caller.id`.
- Days text: `format(start) + ' - ' + format(end) + ' (' + (numDays ? numDays : '?') + ' work days)'`. Example: start 2017-12-05, end 2017-12-07, numDays 3 → `Dec 5, 2017 - Dec 7, 2017 (3 work days)`; numDays 0 → `... (? work days)`; numDays 2.5 → `(2.5 work days)`.

**Acceptance criteria**:

- Given user A with 2 leaves and user B with 1 leave, when A opens `/leaves/list`, then A sees exactly 2 rows.
- Given an admin, when they open `/leaves/list`, then all 3 rows show.
- Given a leave with `numDays` null, then Days ends with `(? work days)`.
- Given a pending leave, then the Approver cell is empty and State is `PENDING`.
- Given a leave whose requester was deleted, then Requester shows `Deleted <id>`.
- Given the API fails, then an error shows; when the API recovers and the user retries/navigates back, the list loads without a page reload.
- Given anonymous `getLeaves`, then response `{"data":{"getLeaves":null}}`, HTTP 200.

**Tests**:

- Unit: Days text formatter (numDays 3, 2.5, 0, null); name formatter; type/state label mapping with defaults.
- Integration: `getLeaves` as anon (`null`), as user (own only), as admin (all); `requester`/`approver` resolution incl. deleted placeholder and `approver: null`; ISO date serialization.
- End-to-end: user and admin open `/leaves/list` and `/leaves/`; rows and columns match; reuse `leaves-list.component.spec.ts:107-114` (three leaves → three rows in order).

#### LV-02 — Leave filter

- **Type**: functional
- **Source**: `(rewrite spec: Features by area › Leaves)` — "User filters leaves by requester, month and year (leaves split into per-year segments) and clears the filter."
- **Depends on**: LV-01, NFR-L10N-01

**Goal**: On the leaves page the user narrows the list and the calendar by requester, month and year with three multiselects and resets them with "Clear filter". The filter runs in the SPA on the already loaded leaves.

**Old behavior**:

- Filter state `{requesterIds: string[], months: number[], years: number[]}`, initial all empty (`angular/src/app/state/leaves.ts:14-18,35-43`). Form changes dispatch the filter; "Clear filter" resets all three to empty (`leaves-list.component.ts:95-103,125-127`, `state/leaves.ts:57-61`).
- Same filtered list feeds both the table and the calendar (`leaves-list.component.html:34,50`).
- Matching `isMatchingFilter` (`angular/src/app/leaves/leaveFilter.ts:52-102`), segments `splitByYear` (`leaveFilter.ts:29-50`).
- Options: months `January`..`December` with ids 0..11 (`leaveFilter.ts:6-21,104-106`); requesters = unique requesters of all loaded leaves by id, label `firstName surname`, first-appearance order (`leaveFilter.ts:108-114`); years = start year and end year of every loaded leave plus the current year, unique, descending (`leaveFilter.ts:116-133`).
- Multiselect titles "Requester", "Month", "Year"; check-all and uncheck-all enabled (`leaves-list.component.ts:39-55`).
- Options are computed from all loaded leaves, not from the filtered ones (`leaves-list.component.ts:65-74`).

**Constraints**:

- With own-only visibility (LV-01, _interview: Data visibility_), a non-admin's requester options contain only the user themself (or nothing when the user has no leaves). The control stays, unchanged.
- Month names and control labels are i18n keys (NFR-L10N-01); English copy exact.

**Screens**:

- On `/leaves/list` toolbar, in this order: "Requester" multiselect, "Month" multiselect, "Year" multiselect, "Clear filter" button.
- Each multiselect: title shows its label when nothing is selected; offers select-all and unselect-all actions. Exact helper texts of the old widget library: **(interview: suggested answer accepted)** suggested "Check all" / "Uncheck all".
- Changing any selection updates list and calendar immediately. "Clear filter" empties all three.
- Filter persists across in-app navigation, resets on page reload (LV-01).

**Business rules**:

- All dates evaluated in browser local time.
- `segments(leave)`: start with `current = startDate`. While `year(current) <= year(endDate)`: add `{year: year(current), startMonth: month(current), endMonth: (year(current) == year(endDate) ? month(endDate) : 11)}`; then `current = current + 1 year`, month set to January (0). If `startDate > endDate` across years, there are zero segments.
- `isMatchingFilter(leave, filter)`:
  1. filter null/undefined → match.
  2. `requesterIds` non-empty and leave requester id not in it → no match.
  3. `years` non-empty and no segment year in `years` → no match.
  4. `months` non-empty and no segment satisfies `(years empty or segment.year in years) and some m in months with startMonth <= m <= endMonth` → no match.
  5. else match.
- Month ids are 0..11; ids outside that range never match by themselves.
- Year options: `unique([startYear, endYear of every leave] + [currentYear])` sorted descending. Intermediate years of a multi-year leave are NOT added.

Worked examples (from `angular/src/app/leaves/leaveFilter.spec.ts:21-93`):

| Leave (requester)          | Filter                          | Result |
| -------------------------- | ------------------------------- | ------ |
| 2017-12-05..2017-12-05 (1) | null / `{}` / all empty         | true   |
| 2017-12-05..2017-12-05 (1) | `{years:[2018]}`                | false  |
| 2017-12-05..2017-12-12 (1) | `{years:[2018]}`                | false  |
| 2017-12-05..2018-02-05 (2) | `{years:[2018]}`                | true   |
| 2017-12-05..2020-12-01 (2) | `{years:[2018]}`                | true   |
| 2017-12-05..2017-12-05 (1) | `{years:[2018,2017]}`           | true   |
| 2017-12-05 one day (1)     | `{months:[1,6]}`                | false  |
| 2017-12-05..2018-02-05 (2) | `{months:[1,6]}`                | true   |
| 2017-12-05..2020-12-01 (2) | `{months:[1,6]}`                | true   |
| 2017-12-18..2018-01-12 (2) | `{months:[0]}`                  | true   |
| one day (1)                | `{requesterIds:['1','3']}`      | true   |
| 2017-12-05..2018-02-05 (2) | `{requesterIds:['1','3']}`      | false  |
| one day 2017-12-05 (1)     | `{months:[12,6], years:[2020]}` | false  |
| 2017-12-05..2018-02-05 (2) | `{months:[12,6], years:[2020]}` | false  |
| 2017-12-05..2020-12-01 (2) | `{months:[12,6], years:[2020]}` | true   |

List-level example (`leaves-list.component.spec.ts:116-124`): leaves 2017-12-05 (u1), 2018-12-05 (u2), 2017-11-05..2019-04-01 (u3); filter `{months:[11], years:[2017]}` → u1 and u3 rows.

**Acceptance criteria**:

- Given filter months=[11], years=[2017], then only leaves overlapping December 2017 show _(analysis: §2.8 Leaves)_.
- Given a leave 2017-12-18..2018-01-12, when the user selects January, then it shows.
- Given leaves in 2016 and 2019 only and current year 2026, then Year options are 2026, 2019, 2016.
- Given a non-admin, then the Requester options contain only that user.
- Given any filter, when "Clear filter" is clicked, then all three selections are empty and all leaves show.
- Given the calendar view, when a filter is set, then the calendar shows only matching leaves.

**Tests**:

- Unit: every row of the worked-example table; `segments` for one-day, cross-year and 3-year leaves; start > end; year/month/requester option builders.
- End-to-end: select month/year on `/leaves/list`, verify rows; Clear filter; switch to calendar and verify filtered events; reload resets filter.

#### LV-03 — Leaves calendar

- **Type**: functional
- **Source**: `(rewrite spec: Features by area › Leaves)` — "User switches to a calendar of non-rejected leaves: color per requester (15-color round robin), pending at half opacity, title `First Surname [1/2 ](T)`."
- **Depends on**: LV-01, LV-02, SETUP-02

**Goal**: The "Calendar" toggle on the leaves page replaces the table with a FullCalendar month view of the filtered, non-rejected leaves. Each requester gets a stable color; pending leaves are half transparent.

**Old behavior**:

- Toggle "List"/"Calendar" sets view state (`leaves-list.component.html:10-19`, `leaves-list.component.ts:128-130`).
- Calendar options: `editable: false`, `eventLimit: false`, header left `prev,next today`, center `title`, right empty; default FullCalendar 3 view = month (`angular/src/app/leaves/leaves-calendar/leaves-calendar.component.ts:24-36`).
- Events from filtered leaves with `state !== REJECTED` (`leaves-calendar.component.ts:37-43`).
- Event: `allDay: true`, `start = local date of startDate (YYYY-MM-DD)`, `end = local date of endDate + 1 day` (exclusive), `backgroundColor`, `title` (`leaves-calendar.component.ts:64-88`).
- Title: `` `${firstName} ${surname} ${isHalfDay ? '1/2 ' : ''}(${T})` ``, `T` = first character of the type code (`leaves-calendar.component.ts:69-78`).
- Color: `ColorService.getColor(requester.email)`; opacity 1 for APPROVED, 0.5 otherwise (`leaves-calendar.component.ts:57-62`). ColorService is an app-wide singleton (`angular/src/app/app.module.ts:87`) holding an email→color cache and a counter; a new email takes `COLORS[count++ % 15]` (`angular/src/app/services/color.service.ts:3-19,40-59`). Color string `rgb(r,g,b)` at opacity 1, else `rgba(r,g,b,a)` (`color.service.ts:29-33`).
- Only `backgroundColor` is set; border and text colors are library defaults.

**Constraints**:

- FullCalendar 6 (target stack). Equivalent options: `initialView` month grid, header toolbar `prev,next today` | `title` | empty, not editable, no "+more" limit (`dayMaxEvents: false`).
- With own-only visibility, a non-admin sees only own leaves, so all their events use the first color `rgb(134,182,201)`.

**Screens**:

- `/leaves/list` with Calendar selected. Same heading and toolbar as LV-01. Calendar opens on the current month.
- Navigation buttons: previous month, next month, today. Title = month and year (library format, localized per NFR-L10N-01).
- Events are read-only; clicking does nothing.

**Business rules**:

- Event set: leaves after LV-02 filter, excluding `state == REJECTED`.
- Palette, in assignment order (index: hex → CSS):

| #   | Hex    | RGB              |
| --- | ------ | ---------------- |
| 0   | 86b6c9 | rgb(134,182,201) |
| 1   | cf9f90 | rgb(207,159,144) |
| 2   | adc26d | rgb(173,194,109) |
| 3   | 43add4 | rgb(67,173,212)  |
| 4   | d193da | rgb(209,147,218) |
| 5   | fecd8f | rgb(254,205,143) |
| 6   | a7e278 | rgb(167,226,120) |
| 7   | d2c6be | rgb(210,198,190) |
| 8   | 1fc0bf | rgb(31,192,191)  |
| 9   | f7c3d2 | rgb(247,195,210) |
| 10  | ff8732 | rgb(255,135,50)  |
| 11  | c5b7ab | rgb(197,183,171) |
| 12  | a7dd98 | rgb(167,221,152) |
| 13  | e2f3ca | rgb(226,243,202) |
| 14  | 85eaf5 | rgb(133,234,245) |

- Assignment: one SPA-wide map `requester email → palette index` plus a counter starting at 0. When building events, leaves are processed in list order (server order, LV-01); the first time an email appears, it gets `counter % 15` and the counter increments. The map is never reset while the SPA stays loaded (filter changes and re-renders keep colors); a page reload resets it. The 16th distinct email reuses color 0.
- Color string: APPROVED → `rgb(r,g,b)`; PENDING → `rgba(r,g,b,0.5)`.
- Title: `<firstName> <surname> ` + (`1/2 ` if `isHalfDay`) + `(` + T + `)`, where T: ANNUAL→`A`, SICKNESS→`S`, DOCTOR→`D`, MATERNITY→`M`, PARENTAL→`P`, CARING→`C`. Missing type → `A`.
- Dates: start = browser-local calendar date of `startDate`; end (exclusive) = browser-local calendar date of `endDate` + 1 day.
- Examples:
  - Approved ANNUAL leave of Jana Nová (first email seen), 2017-12-05..2017-12-07 → title `Jana Nová (A)`, start `2017-12-05`, end `2017-12-08`, color `rgb(134,182,201)`.
  - Pending half-day DOCTOR leave of Peter Kováč (second email), 2017-12-11 → title `Peter Kováč 1/2 (D)`, start `2017-12-11`, end `2017-12-12`, color `rgba(207,159,144,0.5)`.
  - Rejected leave → no event.

**Acceptance criteria**:

- Given approved, pending and rejected leaves, when Calendar is selected, then only approved and pending show; pending at 0.5 opacity.
- Given two requesters, then each has a different color, stable after changing the filter and switching List/Calendar.
- Given a half-day leave, then its title contains `1/2 ` before the type letter.
- Given a leave 5–7 Dec, then the event covers 5, 6 and 7 Dec and not 8 Dec.
- Given 16 requesters, then the 16th uses the color of the 1st.

**Tests**:

- Unit: color assigner (order, wrap at 15, stability, rgb/rgba strings); title builder for each type and half-day; event mapper (exclusive end, rejected excluded).
- End-to-end: switch to Calendar on `/leaves/list`, check events for seeded leaves, prev/next/today buttons.

#### LV-04 — Add leave screen

- **Type**: functional
- **Source**: `(rewrite spec: Features by area › Leaves)` — "User adds a leave: type (ANNUAL, SICKNESS, DOCTOR, MATERNITY, PARENTAL, CARING; default ANNUAL), start (default today), end (follows start until edited), half-day; work days shown."
- **Source**: `(rewrite spec: Features by area › Leaves)` — "Add form shows "Start date must not be greater than end date" and "Half day option is allowed only within single day"."
- **Source**: `(rewrite spec: Features by area › Leaves)` — "**[PRESERVED BUG]** "Add leave" may be always disabled (Angular group-validator bug); runtime behavior is unverified, see open questions S2 and A2." — resolved, see Constraints.
- **Depends on**: LV-05, LV-06, SETUP-02, NFR-MNT-02, NFR-L10N-01

**Goal**: A logged-in user fills a form with type, start date, end date and half-day flag, sees the computed number of work days, and submits. On success the app returns to the leaves list, which shows the new PENDING leave.

**Old behavior**:

- Route `list/add` (`angular/src/app/app-routing.module.ts:12`), heading "Add new leave" (`angular/src/app/leaves/leaves-add/leaves-add.component.html:2`).
- Fields (`leaves-add.component.html:7-43`): "Type" select (options from the Angular enum, label = code, order ANNUAL, SICKNESS, DOCTOR, MATERNITY, PARENTAL, CARING — `leaves-add.component.ts:94-98`, `leave.ts:3-10`); "Start date" and "End date" primeng `p-calendar` (default display format `mm/dd/yy`, i.e. `12/05/2017`); "Number of work days missed" disabled text input = `computeNumWorkDays()`; checkbox "Is half day?"; submit "Add leave" disabled while form invalid.
- Defaults: start = end = today at 00:00 local; type ANNUAL; isHalfDay false (`leaves-add.component.ts:28-37,88-92`).
- End follows start: on start change, if end is not dirty, end := start (`leaves-add.component.ts:41-48`).
- Validators: start and end `required`; group validator adds `validateDateOrder` if `end < start`, `validateHalfDay` if half-day and `end.getTime() != start.getTime()` (`leaves-add.component.ts:66-78`).
- Messages: `validateDateOrder` → "Start date must not be greater than end date", `validateHalfDay` → "Half day option is allowed only within single day", any other key → `<key> failed` (e.g. "required failed") (`angular/src/app/components/validation-errors/validation-errors.component.ts:4-26`). Group errors show in a red alert above the form while the form is invalid; field errors show under the date field when it is invalid and dirty or touched (`leaves-add.component.html:4-6,19-21,28-30`).
- Submit sends `{startDate, endDate, type, isHalfDay, numDays}` with dates as `toISOString()` of local midnight and type as code (`leaves-add.component.ts:55-64`, `angular/src/app/services/leaves.service.ts:89-104`), refetches the list, then navigates to `/list` regardless of the mutation result (`angular/src/app/state/leave.effects.ts:28-35`). No error handling; an error kills the effect stream.
- Group validator returns `{}` when valid (`leaves-add.component.ts:70,77`); the analysis flags that Angular 4 may treat `{}` as invalid (`docs/tech-rewrite/PROJECT_INITIAL_ANALYSIS.md` §8 Risks).

**Constraints**:

- "Add leave" is disabled only when the form is invalid; a valid form submits. The always-disabled bug does not occur in production _(client answer: A2 "No it works fine")_ and valid creation must be enabled _(client answer: S2)_. This replaces the [PRESERVED BUG] line.
- **[CHANGE]** Client recovers after an API error without reload _(rewrite spec: Auth and session)_.
- Type options come from the shared LeaveType enum (NFR-MNT-02); English label = code.
- Work-day count uses the shared function from LV-05; `numDays` sent to the server is that value (server trusts it, LV-06).
- English copy exact; keys translated to Slovak (NFR-L10N-01).

**Screens**:

- URL `/leaves/list/add`. Who: any logged-in user. Entry: "Add" button on `/leaves/list`.
- Heading: "Add new leave".

| Label                      | Control                                                       | Default                                                          | Rules                                                                   |
| -------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Type                       | select: ANNUAL, SICKNESS, DOCTOR, MATERNITY, PARENTAL, CARING | ANNUAL                                                           | —                                                                       |
| Start date                 | date picker                                                   | today (local)                                                    | required                                                                |
| End date                   | date picker                                                   | = Start date; follows Start date until the user changes End date | required; ≥ Start date                                                  |
| Number of work days missed | read-only text                                                | computed                                                         | = LV-05 `workDays(start, end, isHalfDay)`, recalculated on every change |
| Is half day?               | checkbox                                                      | unchecked                                                        | allowed only when Start date == End date                                |

- Date picker display format: **(interview: suggested answer accepted)** suggested `MM/DD/YYYY` (old primeng default `mm/dd/yy`) in English and `D. M. YYYY` in Slovak.
- Validation (shown in a red alert above the fields while invalid, one line each, in this order):
  - End < Start → "Start date must not be greater than end date".
  - Is half day? checked and Start ≠ End (compare calendar dates) → "Half day option is allowed only within single day".
- Empty date field (after it was touched) → under the field: "required failed".
- Button "Add leave": disabled while any rule fails; enabled when valid.
- Submit: call `createLeave` (LV-06) with `leave = {startDate, endDate, type, isHalfDay, numDays}`; `startDate`/`endDate` = ISO 8601 string of local midnight of the chosen date (e.g. `2017-12-04T23:00:00.000Z` for 5 Dec 2017 in CET); `numDays` = displayed value. Then refetch `getLeaves` and navigate to `/leaves/list`.
- Mutation returns `null` (e.g. session lost): navigate to `/leaves/list` as old code does.
- Mutation network/GraphQL error: **(interview: suggested answer accepted)** suggested: stay on the form, show the SETUP-02 error component with the message, keep inputs, button usable again.
- No Cancel button (old form has none); navigation via menu.

**Business rules**:

- Validity: `start != null && end != null && !(end < start) && !(isHalfDay && date(start) != date(end))`.
- Examples: today Wed → start = end = today, work days 1 _(analysis: §2.8 Leaves)_; start 2017-12-11, end 2017-12-13 → 3; same with half day → error "Half day option is allowed only within single day", button disabled; start 2017-12-13, end 2017-12-11 → "Start date must not be greater than end date", work days 0.

**Acceptance criteria**:

- Given `/leaves/list/add`, then Type ANNUAL, start = end = today, and on a work day "Number of work days missed" = 1.
- Given the user changes Start date without touching End date, then End date equals the new Start date.
- Given the user changed End date once, when Start date changes, then End date stays.
- Given end < start, then "Start date must not be greater than end date" shows and "Add leave" is disabled.
- Given half day with start ≠ end, then "Half day option is allowed only within single day" shows and "Add leave" is disabled.
- Given a valid form, then "Add leave" is enabled; when clicked, the leave is created PENDING and the app shows `/leaves/list` with the new row.
- Given a single-day half-day leave on a work day, then work days shows 0.5 and the created leave has `numDays` 0.5, `isHalfDay` true.

**Tests**:

- Unit: form validity and message rules; end-follows-start logic; payload builder (local midnight ISO, type code, numDays).
- Integration (SPA with mocked Apollo): submit calls `createLeave` with exact variables and navigates; null result navigates; error shows and stays.
- End-to-end: create a leave as a user, see it on the list as PENDING; both validation messages; default values.

#### LV-05 — Work-day count

- **Type**: functional
- **Source**: `(rewrite spec: Features by area › Leaves)` — "Work days = weekdays that are not SK public holidays; half-day subtracts 0.5."
- **Source**: `(rewrite spec: Features by area › Leaves)` — "**[PRESERVED BUG]** Half-day subtracts 0.5 for any range length."
- **Depends on**: NFR-MNT-02

**Goal**: One pure function computes the number of work days a leave covers. The add form (LV-04) and the summary (SUM-01) use it. It lives in the shared package (NFR-MNT-02) together with the Slovak holiday calendar, so the SPA and the server use the same rules.

**Old behavior**:

- `HolidayCountService.numWorkDays(leave)` (`angular/src/app/services/holiday-count.service.ts:29-46`): normalize start and end to 12:00:00 local (`:10-18`); iterate day by day from start to end inclusive (`!date.isAfter(endDate, 'day')`); count days where `isoWeekday() < 6` and `!holidays.isHoliday(date)` (`:48-59`); if `count > 0 && isHalfDay` subtract 0.5 once.
- Holidays: `new Holidays('SK')` from date-holidays 1.2.0 with no options (`holiday-count.service.ts:22`, `angular/yarn.lock:1687-1691`). In date-holidays-parser 1.2.0, `isHoliday` does not filter by type, so every rule counts, including observances; the SK data timezone is `Europe/Prague` (date-holidays 1.2.0 `data/countries/SK.yaml`, date-holidays-parser 1.2.0 `src/Holidays.js:213-227`).
- The server uses the same library for detail export and attendance (`server/service/tripService.js:4-5`, `server/service/attendenceService.js:3,49-53`).
- The list shows the stored client `numDays`, not a recomputed value (`leaves-list.component.html:38`).

**Constraints**:

- **[PRESERVED BUG]** Half-day subtracts 0.5 once for any range length, not only single-day ranges _(analysis: §2.6 Work-day count)_.
- Holiday source: the new date/holiday library is chosen by Instea _(client answer: S3)_. The SK holiday set follows **current Slovak law**, not the frozen date-holidays 1.2.0 set _(interview: SK holidays)_. Rules are year-versioned: each date applies only in the years the law made it a day of rest (Act No. 241/1993 Coll. on state holidays, days of rest and memorial days, as amended). Before implementation, the developer confirms the day-of-rest list per year from 2025 against the current text of the act. Public sources conflict on the 2025–2026 consolidation changes for 6 January, 8 May, 1 September, 15 September and 17 November. The domain expert signs off on the list in DOC-02. The same versioned list feeds DET-02 and ATT-03.

**Business rules**:

- Input: `startDate`, `endDate` (calendar dates), `isHalfDay` (boolean, missing = false). Output: number (step 0.5).
- Calendar dates: the SPA takes the browser-local calendar date of each value (old code normalizes to local 12:00). Holiday dates are Slovak calendar dates (Europe/Prague = Europe/Bratislava rules).
- `count = |{ d : startDate ≤ d ≤ endDate, d is Mon–Fri, d not an SK holiday }|`. If `startDate > endDate`, count = 0.
- If `count > 0` and `isHalfDay` → `count − 0.5`. If `count == 0` → 0 even with half day.
- SK holidays valid **up to and including 2024** (equal to the date-holidays 1.2.0 set, all count as non-work days). From 2025, apply the year-versioned list confirmed under Constraints:

| Rule                                                        | Date            |
| ----------------------------------------------------------- | --------------- |
| Deň vzniku Slovenskej republiky                             | 01-01           |
| Epiphany                                                    | 01-06           |
| Good Friday                                                 | Easter − 2 days |
| Easter Sunday (observance, always Sunday)                   | Easter          |
| Easter Monday                                               | Easter + 1 day  |
| Labour Day                                                  | 05-01           |
| Day of victory over fascism                                 | 05-08           |
| Mother's Day (observance, 2nd Sunday of May, always Sunday) | —               |
| Saints Cyril and Methodius Day                              | 07-05           |
| Slovak National Uprising anniversary                        | 08-29           |
| Constitution Day                                            | 09-01           |
| Day of Our Lady of the Seven Sorrows                        | 09-15           |
| All Saints' Day                                             | 11-01           |
| Struggle for Freedom and Democracy Day                      | 11-17           |
| Christmas Eve                                               | 12-24           |
| Christmas Day                                               | 12-25           |
| St. Stephen's Day                                           | 12-26           |

- No substitute days. Easter = Western (Gregorian) Easter Sunday. The two observances are Sundays, so they do not change the count.
- Worked examples (`angular/src/app/services/holiday-count.service.spec.ts:30-53`):

| Start                   | End              | Half day | Result | Why                                    |
| ----------------------- | ---------------- | -------- | ------ | -------------------------------------- |
| 2017-12-07 (Thu)        | 2017-12-11 (Mon) | no       | 3      | 7, 8, 11                               |
| 2017-12-22 (Fri)        | 2017-12-30 (Sat) | no       | 4      | 22, 27, 28, 29; 24–26 holidays/weekend |
| 2017-12-11 (Mon)        | 2017-12-13 (Wed) | yes      | 2.5    | 3 − 0.5 (preserved bug)                |
| 2017-12-11              | 2017-12-11       | yes      | 0.5    | 1 − 0.5                                |
| 2017-12-09 (Sat)        | 2017-12-09       | yes      | 0      | count 0, no subtraction                |
| 2017-12-13              | 2017-12-11       | no       | 0      | start after end                        |
| 2018-04-02 (Easter Mon) | 2018-04-02       | no       | 0      | holiday                                |

**Acceptance criteria**:

- Each worked example returns the listed value.
- Given any year 2017–2024, then every date in the holiday table is a non-work day, and no other weekday is.
- Given a year from 2025, then exactly the days of rest confirmed against Act No. 241/1993 Coll. (DOC-02 sign-off) are non-work days.

**Tests**:

- Unit: all worked examples; every holiday rule for at least two years (incl. Easter-based dates for 2018 and 2024); each 2025+ change of the confirmed list (a removed day of rest is a work day from its first year); weekend boundaries; half-day on ranges of 1, 3 and 0 work days.

#### LV-06 — createLeave

- **Type**: functional
- **Source**: `(rewrite spec: Features by area › Leaves)` — "Server creates the leave as PENDING with requester = caller and emails the approver."
- **Source**: `(rewrite spec: Features by area › Leaves)` — "**[PRESERVED BUG]** Server does not validate leave dates, half-day rule or overlaps and trusts client `numDays`."
- **Depends on**: SETUP-01, DATA-01, AUTH-03, NFR-MNT-02, NTF-01

**Goal**: The `createLeave` GraphQL mutation stores a new leave for the caller with state PENDING and triggers the approver email (NTF-01) without waiting for it. The server stores client values as given, except id, requester and state.

**Old behavior**:

- `createLeave: userProtected(...)`: sets `id = uuid v4`, `requesterId = context.user.id`, `state = 'PENDING'`, converts dates with `moment(val).toDate()`, saves, calls `sendPendingLeaveMail(leave)` without awaiting, returns the leave (`server/graphql/leaveRelated.js:21-31`, `src/data/Leave.js:4-20,32-35`, `src/data/dataUtil.js:5`).
- Signature `createLeave(leave: LeaveInput): Leave`, `LeaveInput{startDate: String!, endDate: String!, type: LeaveType, isHalfDay: Boolean, numDays: Float}` (`server/graphql/schema.js:34-40,109-111,135`).
- Stored fields are picked: `id, requesterId, approverId, startDate, endDate, type, state, isHalfDay, numDays` (`src/data/Leave.js:5-15`). Mongoose enums on `state` and `type` (`server/db/schema.js:128-137`); `reqired` typo means no required checks (`server/db/schema.js:109-127`).
- SPA requests only `id` back (`angular/src/app/services/leaves.service.ts:9-15`).

**Constraints**:

- **[PRESERVED BUG]** No server check of `startDate ≤ endDate`, the half-day single-day rule, overlaps, or `numDays` correctness; `numDays` stored as sent _(interview: Rewrite goal › Other bugs; analysis: §2.2 Data model)_.
- **[PRESERVED BUG]** No required fields beyond GraphQL non-null _(rewrite spec: Data and validation)_: `type`, `isHalfDay`, `numDays` may be missing.
- Same operation name, argument name and shapes _(interview: API style)_.
- Email failure never affects the mutation result (NTF-01).

**Data model**: Leave (DATA-01). Written:

| Field              | Value                               | Set by |
| ------------------ | ----------------------------------- | ------ |
| id                 | new UUID v4                         | server |
| requesterId        | caller `user.id`                    | server |
| state              | `PENDING`                           | server |
| approverId         | not set                             | —      |
| startDate, endDate | `Date` parsed from the ISO strings  | client |
| type               | LeaveType code or missing           | client |
| isHalfDay          | boolean or missing                  | client |
| numDays            | number or missing, stored unchanged | client |

**API**:

- `createLeave(leave: LeaveInput): Leave` (GraphQL Mutation).
  - Guard: `userProtected` (AUTH-03). Anonymous/invalid JWT → `null`, HTTP 200, nothing stored, no email.
  - Input as above. Invalid enum value → standard GraphQL validation error. `leave` omitted/null → GraphQL error, nothing stored (old code throws on `leave.id`).
  - Unparseable date string → error from the persistence layer, nothing stored, no email.
  - Output: the stored Leave (LV-01 `Leave` shape), `state: PENDING`, `approver: null`, `requester` = caller.
  - Side effect after successful save: NTF-01 email, fire-and-forget.
  - No audit entry (NFR-PRV-01 lists approve/reject/delete only).

**Permissions**:

| Action       | Role         | UI allows           | Server enforces                     |
| ------------ | ------------ | ------------------- | ----------------------------------- |
| Create leave | anon         | no                  | `null`                              |
| Create leave | user / admin | yes (for self only) | yes; requester is always the caller |

**Business rules**:

- A client cannot set `id`, `requesterId`, `approverId` or `state` (they are not in `LeaveInput`).
- Example: user U sends `{startDate:"2017-12-13T23:00:00.000Z", endDate:"2017-12-10T23:00:00.000Z", type:ANNUAL, isHalfDay:true, numDays:42}` → stored as is, PENDING, requester U (preserved bug).

**Acceptance criteria**:

- Given a logged-in user, when `createLeave` with valid input, then a leave with a new UUID, `requesterId` = user, `state` PENDING exists and is returned.
- Given SMTP configured, then one email reaches `APPROVAL_MAIL_RECEIVER` (NTF-01).
- Given SMTP not configured, then the mutation still succeeds.
- Given end before start, half day on 3 days and `numDays` 42, then the leave is stored unchanged.
- Given no JWT, then `{"data":{"createLeave":null}}` and no leave is stored.

**Tests**:

- Integration: anon → null; user → stored fields and response shape; preserved-bug input stored unchanged; missing optional fields; invalid enum rejected; mail catcher receives one email; SMTP unset → success, no email; SMTP failure → success.
- End-to-end: covered by LV-04.

#### LV-07 — Delete leave

- **Type**: functional
- **Source**: `(rewrite spec: Features by area › Leaves)` — "Requester or admin deletes a leave in any state, without confirmation."
- **Source**: `(rewrite spec: Features by area › Leaves)` — "**[PRESERVED BUG]** Delete button shows on every row and silently fails for others' leaves."
- **Depends on**: LV-01, AUTH-03, DATA-01, NFR-PRV-01

**Goal**: The "Delete" button on a leaves-list row removes the leave immediately (no confirmation) and the list refreshes. The server allows it for the requester or an admin, in any state, and writes an audit entry.

**Old behavior**:

- Red "Delete" button on every row (`angular/src/app/leaves/leaves-list/leaves-list.component.html:43-45`); click calls `removeLeave(id)` with refetch of `LeavesQuery`, result only logged (`leaves-list.component.ts:119-123`, `angular/src/app/services/leaves.service.ts:106-115`).
- Server `removeLeave: ownerProtected(...)`: loads the leave; if missing or `!checkUserId(leave.requesterId)` → `null`; else `findOneAndRemove({id})` wrapped in `simpleResult` (`server/graphql/leaveRelated.js:32-39`). `checkUserId` is `() => true` for admin, else `userId === caller.id` (`server/auth/rootResolverDecorators.js:10-20`). `simpleResult` → `{success:true}` or `{success:false, message}` on DB error (`server/graphql/utils.js:1-10`).
- Signature `removeLeave(id: ID!): Result` (`server/graphql/schema.js:136`).

**Constraints**:

- **[PRESERVED BUG]** Delete button on every row, no confirmation, no feedback on failure _(interview: Rewrite goal › Other bugs)_. With own-only visibility _(interview: Data visibility)_, a non-admin's list only holds own leaves, so the "fails for others' leaves" case cannot be reached from the list; it still applies to direct API calls (server returns `null`). Admin sees all leaves and can delete all.
- Any state may be deleted, including APPROVED and REJECTED (no state precondition).
- Audit: successful delete writes an AuditLog entry (entity owned by NFR-PRV-01) _(input NFR: Data privacy)_.

**API**:

- `removeLeave(id: ID!): Result` (GraphQL Mutation).
  - Guard: `ownerProtected` (AUTH-03); owner = `leave.requesterId`.
  - Anonymous → `null`. Unknown id → `null`. Caller not requester and not admin → `null`. All HTTP 200, nothing deleted, no audit entry.
  - Allowed → delete document; `{success: true}`; DB error → `{success: false, message: <error message>}`.
  - Side effect on success: AuditLog entry with actor = caller id, timestamp, record = the leave id, action = leave delete (action naming per NFR-PRV-01).

**Screens**:

- `/leaves/list`, "Delete" button on each row. Click → `removeLeave` → refetch `getLeaves` → row disappears. No confirmation dialog, no success or failure message.

**Permissions**:

| Action                       | Role  | UI allows                                        | Server enforces         |
| ---------------------------- | ----- | ------------------------------------------------ | ----------------------- |
| Delete own leave (any state) | user  | yes                                              | yes                     |
| Delete other's leave         | user  | button would show, but such rows are not visible | `null`, nothing deleted |
| Delete any leave             | admin | yes                                              | yes                     |

**Acceptance criteria**:

- Given a user's own APPROVED leave, when "Delete" is clicked, then it is removed without a confirmation and the row disappears.
- Given a non-owner non-admin calling `removeLeave` via API, then the result is `null` and nothing is removed _(analysis: §2.8 Leaves)_.
- Given an admin, when deleting another user's PENDING leave, then `{success:true}` and the leave is gone.
- Given an unknown id, then `null`.
- Given a successful delete, then one audit entry (actor, time, leave id, delete action) exists; given a denied delete, then none.

**Tests**:

- Integration: anon/unknown/non-owner → null; owner and admin → success for each state; audit entry written only on success.
- End-to-end: user deletes own leave from the list; admin deletes another user's leave.

### Area: Leave approval

#### APR-01 — Leave approval page

- **Type**: functional
- **Source**: `(rewrite spec: Features by area › Leave approval)` — "Admin sees pending leaves and approves or rejects them; approver is set and the row disappears."
- **Source**: `(rewrite spec: Features by area › Leave approval)` — "**[PRESERVED BUG]** Approval page is reachable by non-admins (clicks silently fail); leaves can be re-approved or re-rejected in any state; no email on decision."
- **Depends on**: LV-01, AUTH-03, DATA-01, NFR-PRV-01, SETUP-02

**Goal**: An admin opens "Leaves approval", sees all PENDING leaves and clicks "Approve" or "Reject". The server sets the new state and the caller as approver; the row disappears because it is no longer pending. Each decision writes an audit entry.

**Old behavior**:

- Route `approval`, no guard (`angular/src/app/app-routing.module.ts:11`); nav link only for admins (`angular/src/app/nav-header/nav-header.component.html:22-27`).
- Page heading "Leaves approval"; table columns "Requester", "Days", "Type", "State", unlabeled column with green "Approve" and red "Reject" buttons (`angular/src/app/leaves/leaves-approval/leaves-approval.component.html:1-33`). Cells formatted as in LV-01.
- Rows = `getLeaves` filtered client-side to `state === PENDING` (`angular/src/app/services/leaves.service.ts:81-83,139-141`, `leaves-approval.component.ts:22-24`).
- Approve/Reject call `approveLeave(id)` / `rejectLeave(id)` requesting `id state approver{id email firstName surname}`; the normalized cache updates the leave, so it drops out of the pending list (`leaves.service.ts:25-53,117-131`, `angular/src/app/state/leave.effects.ts:37-45`). No message, no confirmation.
- Server `approveLeave` / `rejectLeave`: `adminProtected`; `findOneAndUpdate({id}, {$set:{state, approverId: caller.id}}, {new:true})`; no state precondition; no email (`server/graphql/leaveRelated.js:40-55`). Signatures `approveLeave(id: String!): Leave`, `rejectLeave(id: String!): Leave` (`server/graphql/schema.js:137-138`).
- Unknown id: update returns no document; serializing it yields a Leave without `id`, so GraphQL reports a non-null `Leave.id` error and the field is `null` (`leaveRelated.js:46,58-62`).

**Constraints**:

- **[PRESERVED BUG]** Route not guarded: a non-admin can open `/leaves/approval` _(interview: Rewrite goal › Other bugs)_. With own-only visibility _(interview: Data visibility)_, a non-admin sees only their own PENDING leaves there; clicking Approve/Reject returns `null` and nothing changes, without a message.
- **[PRESERVED BUG]** No state precondition: APPROVED or REJECTED leaves can be approved/rejected again via API, overwriting `approverId`.
- **[PRESERVED BUG]** No email on approve or reject.
- Audit entry on each successful approve/reject _(input NFR: Data privacy)_.

**API**:

- `approveLeave(id: String!): Leave` and `rejectLeave(id: String!): Leave` (GraphQL Mutation).
  - Guard: `adminProtected` (AUTH-03). Anonymous or non-admin → `null`, HTTP 200, no change, no audit entry.
  - Admin, existing id → set `state` to `APPROVED` / `REJECTED` and `approverId` = caller id; return the updated Leave (LV-01 shape).
  - Admin, unknown id → `null` with a GraphQL error (non-null `Leave.id`); no change, no audit entry. Exact error text: **(interview: suggested answer accepted; verify before go-live)** suggested: keep any GraphQL error; `data.approveLeave` must be `null`.
  - Side effect on success: AuditLog entry with actor = caller id, timestamp, record = leave id, action = approve or reject (naming per NFR-PRV-01).

**Screens**:

- URL `/leaves/approval`. Who: any logged-in user can open it (preserved bug); the nav link shows only for admins (APR-02).
- Heading: "Leaves approval".
- Columns: Requester (`firstName surname`), Days (LV-01 format), Type (code), State (code), actions column with "Approve" (green) and "Reject" (red).
- Rows: leaves from `getLeaves` with state PENDING, in server order.
- After Approve/Reject succeeds: the cached leave gets the new state and approver; the row disappears; the nav badge count (APR-02) drops by one. No message, no navigation.
- Loading/error: SETUP-02 components. Empty: header row only.

**Permissions**:

| Action                  | Role  | UI allows                   | Server enforces   |
| ----------------------- | ----- | --------------------------- | ----------------- |
| Open `/leaves/approval` | user  | yes (no guard; no nav link) | —                 |
| Approve / reject        | user  | buttons shown               | `null`, no change |
| Approve / reject        | admin | yes                         | yes, any state    |

**Acceptance criteria**:

- Given an admin on `/leaves/approval`, when "Approve" on a pending leave, then its state is APPROVED, approver = admin, and the row disappears _(analysis: §2.8 Leaves)_.
- Given an admin, when "Reject", then state REJECTED, approver = admin, row disappears.
- Given a non-admin on `/leaves/approval`, then only their own pending leaves show; clicking Approve changes nothing and shows no message.
- Given an APPROVED leave, when an admin calls `rejectLeave` via API, then state becomes REJECTED and approver = that admin.
- Given an approve or reject, then no email is sent.
- Given a successful decision, then one audit entry exists; given a non-admin call, then none.

**Tests**:

- Integration: anon/non-admin → null; admin approve and reject from each state; unknown id → null + error; approverId set; no mail in mail catcher; audit entries.
- End-to-end: admin approves and rejects from `/leaves/approval`; badge decrements; non-admin opens page, clicks have no effect.

#### APR-02 — Pending-leave badge

- **Type**: functional
- **Source**: `(rewrite spec: Features by area › Leave approval)` — "Admin nav shows a badge with the pending-leave count."
- **Depends on**: SETUP-02, LV-01, APR-01

**Goal**: For an admin, the "Leaves approval" menu item shows a red badge with the number of PENDING leaves. It updates when leaves are created, deleted, approved or rejected in the SPA.

**Old behavior**:

- Nav item "Leaves approval" (link `/approval`) rendered only when `userInfo.isAdmin` (`angular/src/app/nav-header/nav-header.component.html:22-27`).
- Badge `badge-danger` with `count`, shown only if `count > 0` (`nav-header.component.html:25`).
- `count` = length of `getLeaves` filtered to PENDING, from the watched query, so it follows cache updates (`angular/src/app/nav-header/nav-header.component.ts:27-31`, `angular/src/app/services/leaves.service.ts:133-141`).

**Constraints**:

- Menu structure, labels and old-URL handling are owned by SETUP-02; this task adds the badge on the "Leaves approval" item, which links to `/leaves/approval`.
- Admin's `getLeaves` returns all leaves, so the count covers all users.

**Screens**:

- Admin menu: "Leaves approval" + red badge with the PENDING count when count > 0; no badge when 0.
- Non-admin: no "Leaves approval" item, no badge.
- Count source: the same `getLeaves` cache as LV-01, so it changes after create (refetch), delete (refetch), approve/reject (cache update) without reload.

**Acceptance criteria**:

- Given 3 pending leaves, when an admin logs in, then the badge shows 3.
- Given the admin approves one, then the badge shows 2 without reload.
- Given 0 pending leaves, then no badge shows.
- Given a non-admin, then neither the item nor a badge shows.

**Tests**:

- Unit: pending counter.
- End-to-end: badge value for admin; decrement after approve; hidden for non-admin and for 0.

### Area: Leave summary

#### SUM-01 — Leave summary

- **Type**: functional
- **Source**: `(rewrite spec: Features by area › Leave summary)` — "User sees own leaves per year (descending), per type, with total work days; leaves crossing a year are clipped."
- **Source**: `(rewrite spec: Features by area › Leave summary)` — "**[PRESERVED BUG]** Summary counts PENDING and REJECTED leaves." — replaced, see Constraints.
- **Depends on**: LV-01, LV-05, SETUP-02, NFR-MNT-02, NFR-L10N-01

**Goal**: The user opens "Summary" from the user dropdown and sees, for each year from newest to oldest, the total work days of their own APPROVED leaves per leave type. Leaves spanning two years are split at the year boundary.

**Old behavior**:

- Route `summary` (`angular/src/app/app-routing.module.ts:15`); linked as "Summary" in the user dropdown (`angular/src/app/nav-header/nav-header.component.html:34-37`).
- Data: `getLeaves`, filtered client-side to `requester.id == userInfo.id`, all states (`angular/src/app/leaves/summary/summary.component.ts:36-50`).
- Year range: `min(startYear)` .. `max(endYear)` of own leaves, listed descending (`rangeRight`) — years in the range without leaves still appear with no types (`summary.component.ts:52-59`).
- Per year: leaves with `startYear ≤ year ≤ endYear`; start clipped to Jan 1 of the year if it starts earlier, end clipped to Dec 31 if it ends later (`summary.component.ts:60-83`).
- Grouped by type (`groupBy` on numeric enum → ascending enum order ANNUAL, SICKNESS, DOCTOR, MATERNITY, PARENTAL, CARING; only types present), count = sum of `numWorkDays` recomputed on the clipped range, keeping `isHalfDay` (`summary.component.ts:85-96`). Stored `numDays` is not used.
- Markup: no page heading; per year `<h2>YYYY</h2>`, per type "Type: <CODE>" and "Count: <bold N>" (`angular/src/app/leaves/summary/summary.component.html:1-9`).
- No own leaves → nothing rendered. No loading/error state.
- Spec: three ANNUAL leaves 2017-12-10..14, 2017-12-27..2018-01-05, 2018-01-10..14, mocked 5 days per segment → `[{2018, ANNUAL 10}, {2017, ANNUAL 10}]` (`angular/src/app/leaves/summary/summary.component.spec.ts:17-87`).

**Constraints**:

- **[CHANGE]** Only APPROVED leaves count _(client answer: A4)_. PENDING and REJECTED are ignored.
- Own leaves only, also for admins (client-side filter by caller id kept; server visibility per LV-01).
- **[PRESERVED BUG]** Half-day subtraction per LV-05 applies to each clipped segment (a half-day leave crossing a year subtracts 0.5 in each year).
- Year range source: **(interview: suggested answer accepted)** suggested: compute min/max years from the APPROVED own leaves only (the old code used all own leaves).

**Screens**:

- URL `/leaves/summary`. Who: any logged-in user. Entry: user dropdown → "Summary".
- No page heading (old). For each year, descending: heading `YYYY`; under it, one block per type present: "Type: <type code>" and "Count: **<N>**" (N may be fractional, e.g. `2.5`).
- Years between the oldest and newest year with no approved leaves: heading only.
- No approved own leaves: empty page.
- Loading/error: SETUP-02 components.

**Business rules**:

- `own = leaves where requester.id == caller.id and state == APPROVED`.
- `years = maxEndYear down to minStartYear` over `own`.
- For year Y: `segment.start = (year(start) == Y) ? start : Y-01-01`; `segment.end = (year(end) == Y) ? end : Y-12-31`; include leaves with `year(start) ≤ Y ≤ year(end)`.
- `count(Y, type) = Σ workDays(segment.start, segment.end, isHalfDay)` (LV-05).
- Type order inside a year: ANNUAL, SICKNESS, DOCTOR, MATERNITY, PARENTAL, CARING.
- Worked example (all APPROVED ANNUAL, real SK calendar): 2017-12-10..14 → 4 (11–14); 2017-12-27..2018-01-05 → 2017 part 27–29 = 3, 2018 part 2–5 Jan = 4 (1 Jan holiday); 2018-01-10..14 → 3 (10–12). Result: 2018 ANNUAL 7; 2017 ANNUAL 7.
- Same three leaves with the middle one PENDING → 2018 ANNUAL 3; 2017 ANNUAL 4.

**Acceptance criteria**:

- Given the worked example, then the page shows `2018` with "Type: ANNUAL" "Count: 7", then `2017` with "Count: 7".
- Given a REJECTED or PENDING leave, then it does not change any count.
- Given an admin, then only the admin's own leaves are summarized.
- Given approved leaves in 2015 and 2017, then headings 2017, 2016 (no types), 2015 show.
- Given an approved SICKNESS and an ANNUAL leave in one year, then ANNUAL is listed before SICKNESS.

**Tests**:

- Unit: summary builder with the worked examples (reuse `summary.component.spec.ts:17-87` with mocked 5 days/segment → 2018: 10, 2017: 10, all APPROVED), state filter, empty input, gap years, type order, half-day across a year boundary.
- End-to-end: user opens Summary from the dropdown and sees values for seeded approved leaves.

### Area: Detail export (meal vouchers)

#### DET-01 — Detail export screen and `POST /export/detail`

- **Type**: functional
- **Source**: `(rewrite spec: Features by area › Detail export (meal vouchers))` — "User picks a person (all users listed) and a month and downloads an xlsx: name, month, trips count, leaves count, expected meal vouchers, trip days, leave days, leave types, "HALF DAY"."
- **Source**: `(rewrite spec: Features by area › Detail export (meal vouchers))` — "**[PRESERVED BUG]** Server accepts any `userId` for export."
- **Depends on**: SETUP-01, SETUP-02, DATA-01, AUTH-03, NFR-SEC-03, NFR-MNT-02, NFR-L10N-01, MIG-01, DET-02

**Goal**: A logged-in user opens the detail export screen, picks a person and a month, clicks "Generate", and gets a "Download" button. The server builds a one-sheet xlsx with the person's trip working days, leave working days and expected meal vouchers for that month, stores it in the download folder and returns its URL as a JSON string. The numbers come from DET-02.

**Old behavior**:

- Screen: Angular route `export` under `/leaves/` (`angular/src/app/app-routing.module.ts:14`), nav link "Export" for every logged-in user (`angular/src/app/nav-header/nav-header.component.html:20`). No route guard.
- Heading "Month vacation/trip export"; field "User" (native select) and "Select month" (PrimeNG `p-calendar`, a day picker; any day picks its month); buttons "Generate" and "Download" (`angular/src/app/leaves/leaves-export/leaves-export.component.html:2-29`).
- User options come from GraphQL `getUsers { id email firstName surname }` (`angular/src/app/services/users.service.ts:7-16`), which returns ALL users to any logged-in user (`server/graphql/userRelated.js:19`). Label = `firstName + ' ' + surname` (`angular/src/app/login-page/user.ts:7-9`, `leaves-export.component.ts:89-91`). Default = the user whose email equals the logged-in user's email (`leaves-export.component.ts:47-54`).
- Form: `userId` required, `month` default `new Date()`, no validator (`leaves-export.component.ts:40-43`). "Generate" disabled only while the form is invalid (`.html:21`). Spinner icon inside "Generate" while in progress (`.html:22`).
- Submit sets the date to day 1 (`leaves-export.component.ts:67`) and posts `{userId, month: moment(month).format('YYYY-MM')}` (browser local time) to `${serverBase}/export/detail` with `Authorization: Bearer <jwt>` (`angular/src/app/state/leave.effects.ts:47-74`, `constants.ts:6`, `services/JwtInterceptor.ts:18-24`). A new Generate cancels the previous request (`switchMap`, `leave.effects.ts:50`) and clears the previous URL and error (`angular/src/app/state/leaves.ts:62-67`).
- Success: response is a JSON string → "Download" button appears; click → `window.location.assign(url)` (`leaves-export.component.ts:81-86`, `.html:25-27`). Error: red alert with Angular's `HttpErrorResponse.message`, e.g. "Http failure response for …/export/detail: 500 Internal Server Error" (`leave.effects.ts:53-59`, `.html:28-30`).
- Server: `POST /export/*` with `bodyParser.json()` (`server/index.js:50-51`). No `req.context.user` → `401`, empty body (`server/export/exportMiddleware.js:11-13`). Path `/export/detail` → `exportDetail(req.body)` (`exportMiddleware.js:5-8,16-20`). `userId` is not checked against the caller (`exportMiddleware.js:20`). Any thrown error → `500`, empty body (`exportMiddleware.js:24-27`).
- Response: JSON string `'http://' + req.headers.host + '/' + path.relative(server/export, file)` = `http://<host>/../download/<file>` (`exportMiddleware.js:21-23`).
- User lookup: `getUserOrDefault(userId)`; unknown id → placeholder firstName "Deleted", surname = id (`server/service/userService.js:3-18`, `exportDetail.js:20`). Missing `userId` → placeholder is `undefined` → `user.firstName` throws → 500 (`userService.js:5`, `exportDetail.js:61`).
- Workbook (`server/export/exportDetail.js:54-94`): one sheet "Detail"; column widths A=18, C=18, E=25; cells listed in **Business rules** below. Dates are native Excel dates at 12:00 server-local time, no explicit number format (`exportDetail.js:72-76`).
- File: `server/download/detail-<firstName>-<surname>-<month>-<rand>.xlsx`, rand = `Math.round(Math.random() * 90000000 + 10000000)` (`exportDetail.js:96-103`). Names are not sanitised. Files are served by public `/download` static and never deleted (`server/index.js:26-34`).

**Constraints**:

- Export IDOR preserved: server accepts any `userId` from any logged-in user _(client answer: S5)_. Public `/download` preserved _(client answer: S5)_.
- Data visibility conflict: spec line "all users listed" contradicts "Regular users see only their own trips, leaves and user record" _(interview: Data visibility)_. Suggested resolution, same as the travel-warrant export picker: admin sees all users; non-admin sees only self _(interview: suggested answer accepted)_.
- Download URL built by the NFR-SEC-03 builder (request scheme and host, path `/download/<file>`), replacing hardcoded `http://` and the `/../` segment.
- xlsx stays English only _(client answer: S7)_. Screen copy is English with Slovak translation keys (NFR-L10N-01).
- Old URL `/leaves/export` must open this screen _(client answer: S6)_; routing owned by SETUP-02.
- Migration: the endpoint and screen move in step 1 together with leaves _(interview: S4 follow-up)_. Until step 2, the new server reads `Trip` and `User` documents from the old MongoDB 3.6 through the second connection (MIG-01); `Leave` is read from the new DB.

**Data model**: read-only. Fields read (full definitions in DATA-01):

| Entity | Fields read                                                         | Used for                                            |
| ------ | ------------------------------------------------------------------- | --------------------------------------------------- |
| User   | `id`, `firstName`, `surname`, `email`, `isAdmin`                    | A1 name, file name, picker label, default selection |
| Trip   | `userId`, `departureTime`, `arrivalTime`                            | trip days (DET-02)                                  |
| Leave  | `requesterId`, `startDate`, `endDate`, `type`, `state`, `isHalfDay` | leave days, types, half days (DET-02)               |

**API**:

`POST /export/detail` (REST, JSON body)

| Item             | Contract                                                                                                                                                                                                                                             |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth             | Bearer JWT; request auth context per AUTH-03. No user in context → `401`, empty body.                                                                                                                                                                |
| Body             | `{ "userId": string, "month": "YYYY-MM" }`. `userId` any string; not compared to the caller.                                                                                                                                                         |
| `month` parsing  | First 7 characters `YYYY-MM` define the month in `DEFAULT_TIMEZONE`. Old code parsed non-strictly with `moment(month, 'YYYY-MM')` (`exportDetail.js:21`). Missing or unparseable month → `500`, empty body _(interview: suggested answer accepted)_. |
| Unknown `userId` | Placeholder user firstName "Deleted", surname = `userId` (DATA-01 placeholder rule); export proceeds with that user's (normally zero) trips/leaves.                                                                                                  |
| Missing `userId` | `500`, empty body.                                                                                                                                                                                                                                   |
| Success          | `200`, `Content-Type: application/json`, body = JSON string with the download URL from NFR-SEC-03, e.g. `"https://cestaky2.instea.co/download/detail-Jana-Novak-2017-11-48213977.xlsx"`.                                                             |
| Any other error  | `500`, empty body; error logged.                                                                                                                                                                                                                     |
| Side effects     | Writes one file to the download folder; never deleted.                                                                                                                                                                                               |

File name: `detail-<firstName>-<surname>-<month>-<rand>.xlsx`, where `<month>` is the request `month` string as sent, and `<rand>` is an integer in 10000000–100000000 (8 digits, rarely 9). Name parts are not sanitised (old behavior); the URL path segment is percent-encoded by the NFR-SEC-03 builder _(interview: suggested answer accepted)_.

**Screens**:

URL `/leaves/export` (old URL kept, SETUP-02). Who: any logged-in user (no admin guard, same as old).

| Element         | Label (exact copy)           | Default / behavior                                                                                                                                                                                                              |
| --------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Heading         | "Month vacation/trip export" | —                                                                                                                                                                                                                               |
| User select     | "User"                       | Admin: all users from `getUsers`, in server order, label `firstName surname`. Non-admin: only self _(interview: suggested answer accepted)_. Default = the logged-in user. Required.                                            |
| Month picker    | "Select month"               | Month granularity; default = current month; no year limits (old day picker had none). Required.                                                                                                                                 |
| Generate button | "Generate"                   | Disabled while form invalid. Shows a spinner while the request runs. A new click cancels the previous request; previous URL and error clear. Sends `month` as `YYYY-MM` in the browser's local time.                            |
| Download button | "Download"                   | Visible only after success. Click navigates the current tab to the returned URL (browser downloads the xlsx).                                                                                                                   |
| Error alert     | red alert                    | Shown on any non-2xx. Old text was the library message "Http failure response for <url>: <status> <statusText>"; suggested copy "Problem preparing file" (travel-warrant export copy) _(interview: suggested answer accepted)_. |

Loading state: spinner in "Generate". User list loading/error uses shared SETUP-02 components. No empty state (the list always contains at least self).

**Permissions**:

| Action                | Role            | UI allows                                       | Server enforces                                       |
| --------------------- | --------------- | ----------------------------------------------- | ----------------------------------------------------- |
| Open `/leaves/export` | user, admin     | yes                                             | n/a                                                   |
| Export self           | user            | yes                                             | yes                                                   |
| Export another user   | user            | no (picker shows only self, interview: Pickers) | **yes — any `userId` accepted** _(client answer: S5)_ |
| Export any user       | admin           | yes                                             | yes                                                   |
| Export                | anon            | login screen                                    | `401`                                                 |
| Download file         | anyone with URL | —                                               | public, no auth _(client answer: S5)_                 |

**Business rules**: workbook layout (values from DET-02).

| Cell                      | Value                                                                                                                           | Type       |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| A1                        | `firstName + ' ' + surname`                                                                                                     | text       |
| B1                        | `Month: ` (trailing space)                                                                                                      | text       |
| C1                        | month formatted `MMMM YYYY`, English, e.g. `November 2017`                                                                      | text       |
| A3                        | `Trips: `                                                                                                                       | text       |
| B3                        | number of trip working days (`                                                                                                  | tripDays   | `, not number of trips) | number |
| C3                        | `Leaves: `                                                                                                                      | text       |
| D3                        | `leavesCount` (may be fractional, e.g. 2.5)                                                                                     | number     |
| E3                        | `Expected meal vouchers: `                                                                                                      | text       |
| F3                        | `expectedMealVouchers` (may be fractional)                                                                                      | number     |
| A4, A5, …                 | each trip working day, ascending                                                                                                | Excel date |
| C4, C5, …                 | each leave working day, ascending                                                                                               | Excel date |
| D4, D5, … (same row as C) | leave type codes of leaves covering that day, unique, joined with one space, in leave order, e.g. `ANNUAL` or `ANNUAL SICKNESS` | text       |
| E4, E5, … (same row as C) | `HALF DAY` if the first leave covering that day has `isHalfDay = true`; else empty                                              | text       |

- Row 2 is empty. Trip and leave lists both start at row 4 and are independent (row n of column A is unrelated to row n of column C).
- Sheet name `Detail`. Column widths: A 18, C 18, E 25. No other styling.
- Dates: native Excel date values of the calendar day (time 12:00 so no timezone shifts the day). Display format: Excel built-in short date (numFmt 14) _(interview: suggested answer accepted — old code sets no format)_.
- Leave type codes are the raw `LeaveType` codes (NFR-MNT-02): `ANNUAL`, `SICKNESS`, `DOCTOR`, `MATERNITY`, `PARENTAL`, `CARING`.
- Only leaves counted by DET-02 (APPROVED) appear in C/D/E.

**Acceptance criteria**:

- Given an admin on `/leaves/export`, then "User" lists all users and defaults to self, and "Select month" defaults to the current month.
- Given a non-admin on `/leaves/export`, then "User" lists only self _(interview: suggested answer accepted)_.
- Given valid input, when "Generate", then a spinner shows, then "Download" appears; clicking it downloads `detail-<first>-<surname>-<YYYY-MM>-<8 digits>.xlsx`.
- Given the workbook, then sheet `Detail` has A1 name, B1 `Month: `, C1 `November 2017`, row 3 labels and numbers, dates from row 4, as in the layout table.
- Given a non-admin who posts another user's `userId` directly, then the server returns that user's export (preserved IDOR).
- Given no JWT, when `POST /export/detail`, then `401` with empty body.
- Given an unknown `userId`, then A1 is `Deleted <userId>` and the file name is `detail-Deleted-<userId>-<month>-<rand>.xlsx`.
- Given a missing `userId`, then `500` and the screen shows the error alert.
- Given HTTPS, then the returned URL starts with `https://` and contains `/download/` without `/../`.
- Given a day covered by an ANNUAL half-day leave, then that row has D=`ANNUAL`, E=`HALF DAY`.
- Given two APPROVED leaves of types ANNUAL and DOCTOR on the same day, then D=`ANNUAL DOCTOR` (insertion order) and the day appears once.

**Tests**:

- Unit: layout writer — cell addresses, labels with trailing spaces, `MMMM YYYY`, sheet name, widths, date cells as calendar days, D join with space, E `HALF DAY` rule; file-name pattern and random range.
- Integration: `POST /export/detail` — 401 without JWT; 200 + URL via NFR-SEC-03 builder; any `userId` accepted for a non-admin; unknown `userId` placeholder; missing `userId` → 500; parse the generated xlsx and compare to the DET-02 worked example; reads trips/users via old-DB connection when MIG-01 step-1 config is active.
- End-to-end: admin and non-admin open `/leaves/export`, generate, download; error alert on server 500. Replaces the old smoke test `angular/src/app/leaves/leaves-export/leaves-export.component.spec.ts:48-50`.

#### DET-02 — Working days and meal vouchers

- **Type**: functional
- **Source**: `(rewrite spec: Features by area › Detail export (meal vouchers))` — "Working day = not SK holiday and not weekend; trip and leave days are unique sorted working days."
- **Source**: `(rewrite spec: Features by area › Detail export (meal vouchers))` — "Expected meal vouchers = month working days − trip days − leave days + half days."
- **Source**: `(rewrite spec: Features by area › Detail export (meal vouchers))` — "**[PRESERVED BUG]** PENDING and REJECTED leaves are counted; month working days include the 1st of the next month." → CHANGED by _(client answer: A4)_ and _(interview: A4 follow-up)_.
- **Depends on**: DATA-01, LV-05, NFR-MNT-02, MIG-01

**Goal**: For one user and one calendar month, compute the trip working days, leave working days, half days, leave count and expected meal vouchers shown in the detail export (DET-01). Only APPROVED leaves count, and only days of the requested month count.

**Old behavior**:

- Range `[monthStart, nextMonthStart]` from `moment(month, 'YYYY-MM')` in the server process timezone (`server/export/exportDetail.js:21-28`). The repo sets no `TZ` (`Dockerfile`), so the pod timezone is unknown.
- Trips: `userId = id` and `monthStart ≤ departureTime < nextMonthStart` (`server/service/tripService.js:7-15`). A trip that departs in the previous month is not selected.
- Leaves: `requesterId = id`, `startDate ≤ nextMonthStart` (inclusive) and `endDate ≥ monthStart`, **any state** (`server/service/leaveService.js:8-19`).
- Each trip/leave start and end is clamped to `[monthStart, nextMonthStart]` and turned into a `YYYY-MM-DD` date (`tripService.js:35-39`, `exportDetail.js:30-43`). So days on the 1st of the next month survive.
- Days of an interval = every calendar day from start date to end date, inclusive, deduplicated (`tripService.js:47-56`). Working day = not SK holiday (date-holidays `SK`) and not Saturday/Sunday (`tripService.js:4-5,41-45`). **New**: the SK holiday list is the year-versioned current-law list from LV-05 _(interview: SK holidays)_, so results for 2025+ can differ from the old app.
- `tripDays` / `leavesDays` = sorted unique working days over all trips / leaves (`tripService.js:22-28`, `leaveService.js:35-41`).
- `halfDays = (number of selected leaves with isHalfDay) / 2`; `leavesCount = |leavesDays| − halfDays` (`exportDetail.js:45-46`).
- `monthDays = workingDays(monthStart, nextMonthStart)` — includes the 1st of next month (`exportDetail.js:48`).
- `expectedMealVouchers = |monthDays \ tripDays \ leavesDays| + halfDays` (`exportDetail.js:49-52`).

**Constraints**:

- Count ONLY leaves with `state = APPROVED` _(client answer: A4)_. This applies to leave days, half days, leave count, D/E columns.
- Month working days EXCLUDE the 1st of next month _(interview: A4 follow-up)_. The same month-end bound applies to trip and leave days, so no day outside the month appears anywhere.
- Selection by trip departure month is kept (a trip departing in the previous month is not counted), because the spec does not change it.
- All dates are calendar days in `DEFAULT_TIMEZONE` (default `Europe/Bratislava`) _(interview: suggested answer accepted — old code used the process timezone)_. Do not change any global timezone setting.
- SK holiday calendar per LV-05 (single shared rule for leaves, detail export, attendance).
- Migration: trips (and users) come from the old DB until step 2 (MIG-01).

**Data model**: none new. Reads Trip `userId, departureTime, arrivalTime` and Leave `requesterId, startDate, endDate, state, isHalfDay, type` (DATA-01). Enums `LeaveState`, `LeaveType` from NFR-MNT-02.

**Business rules**:

Definitions (all in `DEFAULT_TIMEZONE`; `date(x)` = calendar date of instant `x`):

| Name                   | Definition                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------ |
| `first`                | 1st day of requested month                                                                                   |
| `last`                 | last day of requested month                                                                                  |
| `isWorking(d)`         | `d` is Monday–Friday AND not an SK public holiday (LV-05)                                                    |
| `monthDays`            | `{ d ∈ [first, last] : isWorking(d) }` — both bounds inclusive                                               |
| selected trips         | `userId = id` AND `first ≤ date(departureTime) ≤ last` (equals instant range `[monthStart, nextMonthStart)`) |
| trip interval          | `[max(date(departureTime), first), min(date(arrivalTime), last)]`, inclusive                                 |
| selected leaves        | `requesterId = id` AND `state = APPROVED` AND `date(startDate) ≤ last` AND `date(endDate) ≥ first`           |
| leave interval         | `[max(date(startDate), first), min(date(endDate), last)]`, inclusive                                         |
| `tripDays`             | sorted unique working days of all trip intervals                                                             |
| `leavesDays`           | sorted unique working days of all leave intervals                                                            |
| `halfDays`             | (number of selected leaves with `isHalfDay = true`) / 2                                                      |
| `leavesCount`          | `                                                                                                            | leavesDays                        | − halfDays` |
| `expectedMealVouchers` | `                                                                                                            | monthDays \ tripDays \ leavesDays | + halfDays` |

Notes kept from old behavior:

- A day that is both trip and leave counts in B3 and D3, but is subtracted from vouchers once (set difference).
- `halfDays` counts every selected half-day leave, even if its day is not a working day or is also a trip day. Example: an APPROVED half-day leave on a Saturday gives `leavesCount = −0.5` and adds 0.5 to vouchers.
- An interval whose clamped end is before its clamped start yields only the end day (if working), as in the old loop (`tripService.js:47-56`).

Worked examples — old test suite (`server/service/tests/tripService.test.js:25-45`), month December 2017, still valid:

| Trips                     | tripDays                             |
| ------------------------- | ------------------------------------ |
| 4 Dec 18:00 → 6 Dec 09:00 | 04, 05, 06                           |
| [5–6], [5–5], [4–5]       | 04, 05, 06 (merged, deduped, sorted) |
| 24 → 27 Dec               | 27 (24 Sunday, 25–26 holidays)       |
| 8 → 11 Dec                | 08, 11 (weekend skipped)             |

Worked example — new rules, November 2017. Working days: Mon–Fri = 22, minus 1 Nov and 17 Nov (SK holidays) → `|monthDays| = 20`. 1 Dec 2017 is a Friday.

| Record                          | Old result      | New result                        |
| ------------------------------- | --------------- | --------------------------------- |
| Trip 6 Nov 08:00 → 7 Nov 17:00  | 06, 07          | 06, 07                            |
| Trip 30 Nov 08:00 → 1 Dec 18:00 | 30, Dec 01      | 30 (clamped to `last`)            |
| Trip 31 Oct 08:00 → 2 Nov 17:00 | not selected    | not selected (departs in October) |
| APPROVED ANNUAL 13–14 Nov       | 13, 14          | 13, 14                            |
| APPROVED ANNUAL half day 20 Nov | 20, half 0.5    | 20, half 0.5                      |
| PENDING ANNUAL 21 Nov           | 21              | ignored                           |
| REJECTED SICKNESS 22 Nov        | 22              | ignored                           |
| APPROVED DOCTOR 1 Dec           | Dec 01          | not selected                      |
| APPROVED ANNUAL 30 Oct – 2 Nov  | 02 (01 holiday) | 02 (01 holiday)                   |

| Value         | Old                                             | New                     |
| ------------- | ----------------------------------------------- | ----------------------- |
| `             | monthDays                                       | `                       | 21 (incl. 1 Dec) | 20  |
| `tripDays`    | 06, 07, 30, Dec 01 → 4                          | 06, 07, 30 → 3          |
| `leavesDays`  | 02, 13, 14, 20, 21, 22, Dec 01 → 7              | 02, 13, 14, 20 → 4      |
| `halfDays`    | 0.5                                             | 0.5                     |
| `leavesCount` | 6.5                                             | 3.5                     |
| vouchers      | 21 − 10 (union of trip/leave days) + 0.5 = 11.5 | 20 − 7 + 0.5 = **13.5** |

Worked example from the analysis AC (still valid): 21 working days, 3 trip days, one APPROVED 2-day full leave and one APPROVED half-day leave on other working days → `leavesDays = 3`, `halfDays = 0.5`, `leavesCount = 2.5`, vouchers = 21 − 3 − 3 + 0.5 = **15.5**.

Overlap example (Nov 2017): APPROVED trip and APPROVED ANNUAL leave both on 13 Nov, nothing else → B3 = 1, D3 = 1, vouchers = 20 − 1 = **19**.

Timezone example: an APPROVED leave stored as `2017-11-12T23:00:00Z` (13 Nov 00:00 in Bratislava) is day **13 Nov**, not 12 Nov.

**Acceptance criteria**:

- Given the four December 2017 trip sets above, then `tripDays` matches the table.
- Given the November 2017 example, then B3 = 3, D3 = 3.5, F3 = 13.5, column A = 06, 07, 30 Nov, column C = 02, 13, 14, 20 Nov.
- Given a PENDING or REJECTED leave, then it does not change any value or row.
- Given a trip or APPROVED leave that ends on the 1st of next month, then no day of next month appears in A or C and `monthDays` ends at `last`.
- Given an APPROVED leave starting on the 1st of next month, then it is not selected.
- Given a trip departing in the previous month and arriving in this month, then it is not counted.
- Given an APPROVED half-day leave on a Saturday, then D3 = −0.5 and vouchers increase by 0.5.
- Given a month with no trips or leaves, then B3 = 0, D3 = 0, F3 = number of working days.

**Tests**:

- Unit: `isWorking` (weekend, SK holiday via LV-05); interval enumeration inclusive; dedupe/sort (`tripService.test.js:25-45` four cases ported); clamping to `[first, last]`; selection predicates (trip by departure month, leave overlap, APPROVED only); `halfDays`/`leavesCount`/vouchers for all examples above; timezone conversion of stored instants (leave at local midnight, trip at 00:30 local on the 1st).
- Integration: seeded DB (trips in old-DB connection, leaves in new DB per MIG-01) → `POST /export/detail` → parsed xlsx values equal the November 2017 example.
- End-to-end: covered by DET-01.

### Area: Attendance API (M2M)

#### ATT-01 — Attendance endpoint, auth, validation, errors

- **Type**: functional
- **Source**: `(rewrite spec: Features by area › Attendance API (M2M))` — "M2M client calls `GET /api/attendence/:year/:month` with Basic auth; 401 when credentials are wrong or unset."
- **Source**: `(rewrite spec: Features by area › Attendance API (M2M))` — "Errors: 400 "Month is not a number." / "Year is not a number."; 500 "Cannot get data from SSO, try again later." / "Cannot get data from Toggl, try again later."."
- **Source**: `(rewrite spec: Features by area › Attendance API (M2M))` — "Dates use `DEFAULT_TIMEZONE` (default `Europe/Bratislava`)."
- **Depends on**: SETUP-01, MIG-01, ATT-02, ATT-03

**Goal**: Expose `GET /api/attendence/:year/:month` (old spelling kept) for machine clients with HTTP Basic auth. Validate the path parameters, build the attendance report (ATT-02, ATT-03) and return it as JSON with exactly the old shape, status codes and messages.

**Old behavior**:

- Basic auth middleware on `/api/*` (`server/api/attendenceApi.js:4-24`). Credentials parsed with `basic-auth`. Pass only if `M2M_USERNAME` and `M2M_PASSWORD` are both set (non-empty) and both match exactly (`attendenceApi.js:7-11`). Otherwise `401`, empty body, no `WWW-Authenticate` header (`attendenceApi.js:5,14,17`).
- Route `GET /api/attendence/:year/:month` (`attendenceApi.js:23`). Month checked first: `isNaN(month)` → `400 {"message":"Month is not a number."}`; then `isNaN(year)` → `400 {"message":"Year is not a number."}` (`attendenceApi.js:27-39`).
- Service error → `500 {"message": <error>}`; success → `200` JSON (`attendenceApi.js:41-48`).
- Timezone: `DEFAULT_TIMEZONE || 'Europe/Bratislava'` set as global moment default on each call (`server/service/attendenceService.js:119-120`).
- Month: `start = moment().year(year).month(month − 1).startOf('month')`, `end = …endOf('month')`, strings `YYYY-MM-DD` (`attendenceService.js:123-127`). The setter overflows: month 13 → January of year+1, month 0 → December of year−1; fractional values truncate.
- Response `{start, end, attendence}` (`attendenceService.js:168-175`).
- Global `cors()` adds `Access-Control-Allow-Origin: *` (`server/index.js:37`).
- An authenticated request to another `/api/*` path falls through to the React SPA catch-all (`server/index.js:61-63`).

**Analysis mismatch**: §2.5 says "month 1–12". The code accepts any value where `isNaN` is false (e.g. `05`, `13`, `0`, `1e1`, `5.5`) and rolls over out-of-range months (`attendenceApi.js:29`, `attendenceService.js:123-124`).

**Constraints**:

- Contract frozen by contract tests in TST-02 _(interview: M2M contract)_; SSO/Toggl fakes from TST-03.
- Endpoint moves to the new server in migration step 1 together with leaves _(interview: S4 follow-up)_; until step 2 the `User` lookup by email reads the old DB (MIG-01).
- CORS-all preserved (owned by the security-bug preservation decision, see brief) — the header stays on these responses.
- Use `DEFAULT_TIMEZONE` per request computation; do not set a process-wide default timezone.

**API**:

`GET /api/attendence/:year/:month`

| Item                                  | Contract                                                                                                                                                                                                                                       |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth                                  | `Authorization: Basic base64(user:pass)`. Password may contain `:` (split at the first `:`). Pass iff `M2M_USERNAME` and `M2M_PASSWORD` are non-empty and both equal. Applies to every `/api/*` path, checked before any validation.           |
| 401                                   | Empty body, no `WWW-Authenticate` header. Cases: header missing, not Basic, malformed, wrong user/pass, env var missing or empty.                                                                                                              |
| Param parsing                         | `n = Number(param)` (JS numeric conversion of the decoded path segment). `NaN` → 400. Check month before year.                                                                                                                                 |
| 400                                   | `Content-Type: application/json; charset=utf-8`, body `{"message":"Month is not a number."}` or `{"message":"Year is not a number."}`.                                                                                                         |
| Month resolution                      | Take today in `DEFAULT_TIMEZONE`, set year = `year`, set month index = `month − 1` with rollover (13 → Jan of year+1, 0 → Dec of year−1, fraction truncated). `start` = first day 00:00, `end` = last day 23:59:59.999 of the resulting month. |
| `start` / `end`                       | `YYYY-MM-DD` strings of the resolved month's first and last day.                                                                                                                                                                               |
| 500 SSO                               | `{"message":"Cannot get data from SSO, try again later."}` (ATT-02).                                                                                                                                                                           |
| 500 Toggl                             | `{"message":"Cannot get data from Toggl, try again later."}` (ATT-02). No partial data.                                                                                                                                                        |
| 200                                   | `Content-Type: application/json; charset=utf-8`, body shape below.                                                                                                                                                                             |
| Other headers                         | `Access-Control-Allow-Origin: *`. ETag / `X-Powered-By` are not part of the contract _(interview: suggested answer accepted)_.                                                                                                                 |
| Unknown `/api/*` path (authenticated) | `404` _(interview: suggested answer accepted; verify before go-live — old app served the React SPA HTML with 200)_.                                                                                                                            |

Response body:

```
{
  "start": "YYYY-MM-DD",
  "end": "YYYY-MM-DD",
  "attendence": {
    "<SSO name>": {
      "days": [ { "logged_time": number, "leave": string }, ... one per day of month ],
      "total": number,
      "contractType": string        // omitted when SSO has no contractType key
    }
  }
}
```

Full example: `GET /api/attendence/2023/2` (February 2023, 28 days, no SK holidays). SSO returns Jana (employee, togglUserId 101) and Peter (togglUserId 102, `employee` not `'1'`). Jana's Toggl entries: 1 Feb 8 h, 2 Feb 7.5 h, 6 Feb 4 h, 13 Feb 1.25 h. Jana's APPROVED leaves (insertion order): ANNUAL half day 6 Feb; SICKNESS 9–13 Feb; DOCTOR 13 Feb.

```
{
  "start": "2023-02-01",
  "end": "2023-02-28",
  "attendence": {
    "Jana Novak": {
      "days": [
        {"logged_time": 8, "leave": ""},
        {"logged_time": 7.5, "leave": ""},
        {"logged_time": 0, "leave": ""},
        {"logged_time": 0, "leave": ""},
        {"logged_time": 0, "leave": ""},
        {"logged_time": 4, "leave": "D4"},
        {"logged_time": 0, "leave": ""},
        {"logged_time": 0, "leave": ""},
        {"logged_time": 0, "leave": "PN"},
        {"logged_time": 0, "leave": "PN"},
        {"logged_time": 0, "leave": ""},
        {"logged_time": 0, "leave": ""},
        {"logged_time": 1.25, "leave": "PN, L"},
        {"logged_time": 0, "leave": ""},
        {"logged_time": 0, "leave": ""},
        {"logged_time": 0, "leave": ""},
        {"logged_time": 0, "leave": ""},
        {"logged_time": 0, "leave": ""},
        {"logged_time": 0, "leave": ""},
        {"logged_time": 0, "leave": ""},
        {"logged_time": 0, "leave": ""},
        {"logged_time": 0, "leave": ""},
        {"logged_time": 0, "leave": ""},
        {"logged_time": 0, "leave": ""},
        {"logged_time": 0, "leave": ""},
        {"logged_time": 0, "leave": ""},
        {"logged_time": 0, "leave": ""},
        {"logged_time": 0, "leave": ""}
      ],
      "total": 20.75,
      "contractType": "TPP"
    },
    "Peter Kral": {
      "days": [ 28 × {"logged_time": 0, "leave": ""} ],
      "total": 0,
      "contractType": "contractor"
    }
  }
}
```

(`Peter Kral.days` is written in full as 28 identical objects in the real response; `contractType` values are whatever SSO returns.) Key order of `attendence` = ascending numeric `togglUserId` (JS object key order of the old intermediate map, `attendenceService.js:163-166`).

**Acceptance criteria**:

- Given `M2M_USERNAME`/`M2M_PASSWORD` unset, when called with any credentials, then `401`, empty body.
- Given wrong password, then `401`, no `WWW-Authenticate`.
- Given no `Authorization` header, then `401` (before param validation, e.g. `/api/attendence/x/y`).
- Given `/api/attendence/2023/may`, then `400 {"message":"Month is not a number."}`.
- Given `/api/attendence/abc/may`, then the month message (month checked first).
- Given `/api/attendence/abc/5`, then `400 {"message":"Year is not a number."}`.
- Given `/api/attendence/2023/05`, then same result as `/2023/5`.
- Given `/api/attendence/2023/13`, then `start = 2024-01-01`, `end = 2024-01-31`, hours for January 2024, no leave codes (ATT-03).
- Given `/api/attendence/2023/2`, then `days` has 28 entries and `end = 2023-02-28`; given `/2024/2`, 29 entries.
- Given SSO fails, then `500 {"message":"Cannot get data from SSO, try again later."}`.
- Given a Toggl call fails, then `500 {"message":"Cannot get data from Toggl, try again later."}`.
- Given the February 2023 fixture, then the body equals the example exactly.

**Tests**:

- Unit: Basic-auth check matrix (unset, empty, wrong user, wrong pass, colon in password, good); param parsing (`5`, `05`, `13`, `0`, `5.5`, `1e1`, `may`, `abc`) and month resolution incl. rollover; `start`/`end` for 28/29/30/31-day months in `DEFAULT_TIMEZONE`.
- Integration: Nest app with SSO and Toggl fakes (TST-03): every status code and message; headers (`Content-Type`, CORS, no `WWW-Authenticate`).
- Contract: owned by TST-02 — freezes JSON shape, status codes, messages and codes using the example above.

#### ATT-02 — SSO users and Toggl hours

- **Type**: functional
- **Source**: `(rewrite spec: Features by area › Attendance API (M2M))` — "Response lists SSO users with a Toggl id; only `employee === '1'` get daily hours, leave codes and total, plus `contractType`."
- **Source**: `(rewrite spec: Features by area › Attendance API (M2M))` — "Hours come from Toggl Reports v3 per user token, paginated with a 500 ms pause."
- **Source**: `(rewrite spec: Features by area › Attendance API (M2M))` — "**[PRESERVED BUG]** Request crashes on an employee without `togglUserId` or an unknown Toggl user; duplicate SSO names overwrite each other."
- **Depends on**: SETUP-01, TST-03

**Goal**: Load the user directory from SSO, create one attendance row per SSO user with a Toggl id, fill daily hours and totals from Toggl Reports v3 for employees, then key rows by SSO name. Keep the old failure modes listed as preserved bugs.

**Old behavior**:

- SSO: `GET process.env.SSO_URI` with Basic auth `SSO_USERNAME`/`SSO_PASSWORD` (`server/service/attendenceService.js:8-9`). Body = array of `{name, email, keys: [{key, value}]}`; each key/value is copied onto the user object (`attendenceService.js:10-16`). Keys used: `togglUserId`, `togglWorkspaceId`, `togglApiToken`, `contractType`, `employee`.
- Any SSO error (missing URI, network, non-2xx, body not an array) → `"Cannot get data from SSO, try again later."` (`attendenceService.js:129-138`).
- Rows: every SSO user with truthy `togglUserId`, `days` = one `{logged_time: 0, leave: ''}` per day of month, `total: 0`, `contractType` = SSO value (`attendenceService.js:19-40`). Duplicate `togglUserId` → later SSO user replaces the earlier row.
- Employees (`employee === '1'`, string compare) processed sequentially in SSO order (`attendenceService.js:142-161`). For each: Toggl hours (if `togglWorkspaceId` truthy), then leaves (ATT-03).
- Toggl: `POST https://api.track.toggl.com/reports/api/v3/workspace/{togglWorkspaceId}/search/time_entries`, Basic auth user = `togglApiToken`, password = `api_token`, header `Accept: application/json`, JSON body `{start_date, end_date, user_ids: [parseInt(togglUserId)]}` plus `first_row_number` from page 2 (`attendenceService.js:7,75-97`).
- Response body = array of rows `{user_id, time_entries: [{seconds, start, …}]}`; each entry adds `seconds / 3600` to `days[date(start) − 1].logged_time` and to `total` of row `user_id`; `date(start)` in the default timezone (`attendenceService.js:99-107`). No rounding.
- Pagination: next page while header `x-next-row-number` is present and differs from the previous value; sleep 500 ms after every page, including the last (`attendenceService.js:109-113`).
- Any Toggl error (HTTP error, 429, exception while summing) → `"Cannot get data from Toggl, try again later."`, no partial data (`attendenceService.js:147-155`).
- Rename: for each row key (ascending numeric `togglUserId`) `attendence[name] = row; delete attendence[togglUserId]` (`attendenceService.js:163-166`). Same name twice → the higher `togglUserId` wins.
- No timeouts on SSO or Toggl calls.

**Analysis mismatch**:

- §8 says the request "crashes" on an unknown Toggl user. In code, `attendence[entry.user_id]` is `undefined` → TypeError inside the Toggl `try` → caught → `500` "Cannot get data from Toggl, try again later." (`attendenceService.js:104,147-155`).
- §8 "crashes on an employee without `togglUserId`": the Toggl call sends `user_ids: [null]` (`parseInt(undefined)` = NaN → JSON `null`) if `togglWorkspaceId` is set; then any APPROVED leave on a working day of the month throws outside any `try` (`attendenceService.js:65,157-160`). Express 4 never sends a response (request hangs until client/proxy timeout).
- Spec says only employees get "contractType"; code sets `contractType` on every row, employees or not (`attendenceService.js:31-35`). Non-employees get zero-filled `days` and `total: 0`.

**Constraints**:

- Preserved bugs _(rewrite spec: Attendance API — [PRESERVED BUG])_: (a) unknown Toggl `user_id` in a Toggl response → `500` Toggl message; (b) employee without `togglUserId`: Toggl call with `user_ids: [null]` when `togglWorkspaceId` is set (Toggl error → `500` Toggl message), and if the employee has an APPROVED leave on a working day of the month the request fails with the framework's default `500` body _(interview: suggested answer accepted; verify before go-live — old app hung; a hang is not reproducible on NestJS, suggested default 500)_; (c) duplicate SSO names → last row in ascending `togglUserId` order wins.
- Also preserved (contract): duplicate `togglUserId` → one row; Toggl fetched once per employee, so hours double; Toggl entry whose `start` date is outside the month → added to that day-of-month index (or `500` Toggl message if the index does not exist, e.g. day 31 in a 30-day month).
- No rounding of hours; float sums as produced by adding `seconds / 3600` in entry order.
- Secrets only in env vars: `SSO_URI`, `SSO_USERNAME`, `SSO_PASSWORD`. Toggl tokens come from SSO, never logged.
- Fakes for SSO and Toggl live in the repo (TST-03).

**Integrations**:

| Service          | Request                                                                                                                                                                                                                                                                                                                                                                    | Fields used                                                                                                                                                                                                                        | Failure                       |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| SSO directory    | `GET ${SSO_URI}`, Basic `SSO_USERNAME`:`SSO_PASSWORD`, no body                                                                                                                                                                                                                                                                                                             | array items: `name`, `email`, `keys[].key`/`keys[].value` → `togglUserId`, `togglWorkspaceId`, `togglApiToken`, `contractType`, `employee`. Keys are copied after `name`/`email`, so a key named `name` or `email` overrides them. | any error → 500 SSO message   |
| Toggl Reports v3 | `POST https://api.track.toggl.com/reports/api/v3/workspace/{togglWorkspaceId}/search/time_entries`; headers `Authorization: Basic base64(<togglApiToken>:api_token)`, `Accept: application/json`, `Content-Type: application/json`; body `{"start_date":"YYYY-MM-DD","end_date":"YYYY-MM-DD","user_ids":[<int togglUserId>]}` + `"first_row_number": <int>` on later pages | response rows: `user_id`, `time_entries[].seconds`, `time_entries[].start`; header `x-next-row-number`                                                                                                                             | any error → 500 Toggl message |

**Business rules**:

- Row set = SSO users with non-empty `togglUserId`. Employee = `employee === '1'` (exact string).
- Skip Toggl if `togglWorkspaceId` is empty; leaves (ATT-03) still apply.
- Page loop: page 1 without `first_row_number`; after each page, `next = header x-next-row-number`; stop when `next` is missing or equals the previous `next`; else request with `first_row_number = parseInt(next)`. Wait 500 ms after every page.
- Hours: for each entry, `day = calendar date of start in DEFAULT_TIMEZONE`, `days[day − 1].logged_time += seconds / 3600`, `total += seconds / 3600`. Example: 27000 s → 7.5; 1000 s → 0.2777777777777778.
- Output key = SSO `name`; key order = ascending numeric `togglUserId`.

Example (Feb 2023): Toggl page 1 returns `x-next-row-number: 51`, page 2 returns `x-next-row-number: 51` → stop after page 2 (two requests, two 500 ms pauses).

**Acceptance criteria**:

- Given an SSO user without `togglUserId`, then no row for that user.
- Given a non-employee with `togglUserId` and `contractType`, then a zero-filled row with that `contractType` and no Toggl call.
- Given an SSO user without `contractType`, then the row has no `contractType` property.
- Given two Toggl pages, then hours of both pages are summed and two 500 ms pauses happen.
- Given a Toggl entry `start = 2023-02-01T23:30:00Z`, then it counts on 2 Feb (Bratislava).
- Given Toggl returns a row whose `user_id` has no attendance row, then `500 {"message":"Cannot get data from Toggl, try again later."}`.
- Given Toggl answers 429 or 5xx, then the Toggl 500 message.
- Given an employee without `togglUserId` and with an APPROVED working-day leave in the month, then the request fails with HTTP 500 (preserved bug).
- Given two SSO users named "Jana Novak" with Toggl ids 101 and 205, then one key "Jana Novak" holding the data of 205.
- Given SSO returns non-2xx or a non-array body, then the SSO 500 message.

**Tests**:

- Unit: SSO key flattening; row init (days length, `contractType` omitted when undefined); pagination loop with header sequences (none; 51→51; 51→101→none); seconds→hours and day mapping across midnight/DST; rename and duplicate-name overwrite order.
- Integration: Toggl/SSO fakes (TST-03) assert request URL, auth header, `Accept`, body JSON incl. `user_ids:[null]` case and `first_row_number`; 500 ms pause (fake timers); every failure path.
- Contract: TST-02 freezes the preserved-bug outcomes and the example.

#### ATT-03 — Attendance leave codes

- **Type**: functional
- **Source**: `(rewrite spec: Features by area › Attendance API (M2M))` — "APPROVED leaves on working days map to codes D8 / D4 (half day) / PN / L / I, joined with ", "."
- **Depends on**: DATA-01, LV-05, NFR-MNT-02, MIG-01

**Goal**: For each SSO employee, find the app user with the same email, take their APPROVED leaves overlapping the requested month, and write an attendance code into `days[d − 1].leave` for every working day of the month the leave covers.

**Old behavior**:

- Lookup: `User.findOne({email})` with the SSO email (exact, case-sensitive); no user → no leaves (`server/service/leaveService.js:21-33`, `server/service/userService.js:16`).
- Leaves: `requesterId = user.id`, `startDate ≤ end`, `endDate ≥ start` (instants of ATT-01), then filter `state === 'APPROVED'` (`leaveService.js:24-32`, `server/service/attendenceService.js:157-158`). No sort → MongoDB natural order.
- Per leave: from `startDate` step 1 calendar day in `DEFAULT_TIMEZONE` while `≤ endDate` (inclusive); write only if the day's month index equals `month − 1` (year not checked) and the day is a working day (`attendenceService.js:57-73`).
- Working day: ISO weekday < 6 and not `date-holidays` `SK` holiday (`attendenceService.js:49-55`). **New**: the SK holiday list is the year-versioned current-law list from LV-05 _(interview: SK holidays)_, so results for 2025+ can differ from the old app.
- Code map `ANNUAL→D`, `SICKNESS→PN`, `DOCTOR→L`, anything else → `I`; ANNUAL gets `4` if `isHalfDay` else `8` (`attendenceService.js:42-47,61-64`).
- Existing code on that day → append `", " + code` (`attendenceService.js:65-69`).

**Constraints**:

- Only `APPROVED` (NFR-MNT-02 `LeaveState`).
- Working day = SK rule from LV-05 (same as DET-02).
- Leave and User read per MIG-01: leaves from the new DB in step 1; users from the old DB until step 2.
- Preserved quirks (contract, TST-02): month-index check ignores the year, so a leave longer than 11 months writes codes for the same month of another year too; a rolled-over month (ATT-01, e.g. 13) never matches, so no codes; overlapping leaves produce repeated codes (e.g. `D8, D8`).

**Business rules**:

| Leave `type`                       | `isHalfDay`     | Code |
| ---------------------------------- | --------------- | ---- |
| ANNUAL                             | true            | `D4` |
| ANNUAL                             | false / missing | `D8` |
| SICKNESS                           | any             | `PN` |
| DOCTOR                             | any             | `L`  |
| MATERNITY, PARENTAL, CARING, other | any             | `I`  |

- Day written iff: leave covers the calendar day (inclusive start/end, `DEFAULT_TIMEZONE`), day's month index = `month − 1`, Monday–Friday, not SK holiday.
- Join: codes appended in leave order with `", "`. Leave order = insertion order (ascending `_id`) _(interview: suggested answer accepted — old code had no sort, natural order)_.
- Hours and leave codes are independent; a day can have both.

Examples (February 2023, no holidays):

- APPROVED ANNUAL half day Mon 6 Feb → day 6 `D4`.
- APPROVED SICKNESS Thu 9 – Mon 13 Feb → 9 `PN`, 10 `PN`, 11–12 empty (weekend), 13 `PN`.
- plus APPROVED DOCTOR 13 Feb inserted after the sickness → 13 `PN, L`.
- PENDING ANNUAL 14 Feb → day 14 empty.
- APPROVED CARING 15 Feb → `I`.
- APPROVED ANNUAL 27 Jan – 2 Feb, request `/2023/2` → 1 `D8`, 2 `D8` (January days skipped).
- Holiday example: APPROVED ANNUAL 24–27 Dec 2017, request `/2017/12` → only 27 `D8` (24 Sunday, 25–26 SK holidays).

**Acceptance criteria**:

- Given each row of the code table, then the code matches.
- Given an APPROVED half-day ANNUAL leave on a weekday, then that day's `leave` is `D4`.
- Given a leave on a weekend or SK holiday, then that day stays `""`.
- Given a PENDING or REJECTED leave, then no code.
- Given two APPROVED leaves on one day, then codes joined `", "` in insertion order.
- Given an SSO email with no app user, then all `leave` values are `""`.
- Given an SSO email differing only by case from the app user, then no codes (exact match).
- Given a leave crossing the month boundary, then only days of the requested month get codes.

**Tests**:

- Unit: code map; working-day check (LV-05 cases, e.g. 24–27 Dec 2017); day iteration inclusive and in `DEFAULT_TIMEZONE` across DST; join order; year-blind month check; rollover month gives no codes.
- Integration: seeded users/leaves (old/new DB per MIG-01) + SSO fake → codes in response; state filter; email match.
- Contract: TST-02 freezes codes and join format with the ATT-01 example.

### Area: Notifications

#### NTF-01 — New-leave email

- **Type**: functional
- **Source**: `(rewrite spec: Features by area › Notifications)` — "New leave sends "New leave notification" email to `APPROVAL_MAIL_RECEIVER`: requester, dates, type, "Approve" link to the approval page."
- **Source**: `(rewrite spec: Features by area › Notifications)` — "Missing SMTP settings only log, they do not fail leave creation."
- **Source**: `(rewrite spec: Features by area › Notifications)` — "**[PRESERVED BUG]** User names are not HTML-escaped in the email."
- **Depends on**: SETUP-01, DATA-01, USR-05, TST-03

**Goal**: After `createLeave` saves a leave, the server sends one HTML email to the approver address with requester, dates, type and an "Approve" link. Sending runs in the background; missing configuration or SMTP errors are only logged.

**Old behavior**:

- Trigger: `sendPendingLeaveMail(leave)` after save, not awaited (`server/graphql/leaveRelated.js:27-29`).
- Requester loaded with `getUserOrDefault(leave.requesterId)` (`server/service/mailService.js:17-20`).
- Subject `New leave notification`, to `APPROVAL_MAIL_RECEIVER`, from `MAIL_SENDER`, HTML body (`mailService.js:19,22-37`).
- Body (`mailService.js:22-29`), concatenated without escaping.
- Dates: `moment(date).tz(DEFAULT_TIMEZONE || 'Europe/Bratislava').format('dddd, MMM D, YYYY')` (`mailService.js:50-54`).
- Link: `BASE_URL + '/leaves/approval'` when `NODE_ENV === 'production'`, else `BASE_URL + '/approval'`; `BASE_URL` default `''` (`server/service/urlService.js:1-8`).
- Transport: SMTP with `host: SMTP_HOST`, `port: SMTP_PORT`, `secure: SMTP_SECURE === 'true'`, auth `SMTP_USER` / `SMTP_PASSWORD` (`mailService.js:7-15`).
- Sends only if `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` are all non-empty; else logs `Email should be send now, but environmental properties for SMTP are not set.` (`mailService.js:6,38-47`). On send error logs the error; on success logs `Message %s sent: %s` with message id and server response (`mailService.js:39-44`).
- No email on approve, reject, delete or registration (`server/graphql/leaveRelated.js:40-55`).

**Constraints**:

- Email is English only _(client answer: S7)_.
- **[PRESERVED BUG]** Requester first name and surname are inserted into the HTML without escaping _(analysis: §8 Risks)_.
- Approve link: the single SPA keeps old URLs _(client answer: S6)_, so the link is always `BASE_URL + '/leaves/approval'`. The old non-production variant `BASE_URL + '/approval'` only existed for the standalone Angular dev server; the new app does not use `NODE_ENV` for the link.
- Mail library: Instea picks _(client answer: S3)_; behavior below is the contract.
- Tests use the mail-catcher fake _(rewrite spec: Testing)_.

**Notifications and jobs**:

- Trigger: successful `createLeave` (LV-06), after the leave is stored. Not awaited; the mutation response does not wait for or depend on it.
- Recipient: value of `APPROVAL_MAIL_RECEIVER`, used verbatim as the To field (a comma-separated list of addresses is accepted).
- Sender: `MAIL_SENDER`.
- Subject: `New leave notification`.
- Body (HTML, exact, `{…}` replaced):

```
<h4>New leave was created and need to be approved.</h4><b>Requester: </b> {firstName} {surname}<br><b>Days: </b>{start} - {end}<br><b>Type: </b>{type}<br><a href="{approvalUrl}">Approve</a>
```

- `{firstName}`, `{surname}`: requester's values, unescaped; for a missing user the placeholder `Deleted` / `<id>` (USR-05). A null value renders as `null`. **(interview: suggested answer accepted)** suggested: keep `null`/`undefined` text for 1:1.
- `{start}`, `{end}`: leave `startDate` / `endDate` in timezone `DEFAULT_TIMEZONE` (default `Europe/Bratislava`), format `dddd, MMM D, YYYY`, English (e.g. `Tuesday, Dec 5, 2017`).
- `{type}`: leave type code (e.g. `ANNUAL`); missing type renders as `undefined` (old behavior).
- `{approvalUrl}`: `BASE_URL + '/leaves/approval'`, `BASE_URL` default empty string (link becomes `/leaves/approval`).
- Schedule: none (event driven only).

**Integrations**:

- SMTP. Env vars: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE` (`'true'` → implicit TLS connection; any other value or unset → plain connection, STARTTLS as offered by the mail library), `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_SENDER`, `APPROVAL_MAIL_RECEIVER`, `BASE_URL`, `DEFAULT_TIMEZONE`.
- Config check: send only if `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER` and `SMTP_PASSWORD` are all non-empty. Otherwise log `Email should be send now, but environmental properties for SMTP are not set.` and stop.
- Failures (SMTP error, unknown recipient, missing `APPROVAL_MAIL_RECEIVER`, requester lookup error): log the error; never retry; never change the mutation result.
- Success: log message id and server response.

**Acceptance criteria**:

- Given SMTP configured and `BASE_URL=https://cestaky.example`, when Jana Nová creates an ANNUAL leave 5–7 Dec 2017, then the mail catcher gets one email: subject `New leave notification`, to `APPROVAL_MAIL_RECEIVER`, from `MAIL_SENDER`, body containing `<b>Requester: </b> Jana Nová<br><b>Days: </b>Tuesday, Dec 5, 2017 - Thursday, Dec 7, 2017<br><b>Type: </b>ANNUAL<br><a href="https://cestaky.example/leaves/approval">Approve</a>`.
- Given a leave stored as `2017-12-04T23:00:00.000Z` and `DEFAULT_TIMEZONE` unset, then the date renders as `Tuesday, Dec 5, 2017`.
- Given `SMTP_PASSWORD` unset, then `createLeave` succeeds, no email is sent, and the log line above appears.
- Given the SMTP server rejects the message, then `createLeave` still returns the leave.
- Given a first name `<b>X</b>`, then it appears unescaped in the HTML.
- Given `NODE_ENV` not `production`, then the link is still `BASE_URL + '/leaves/approval'`.

**Tests**:

- Unit: body builder (exact string, unescaped names, timezone and format, default timezone, link with and without `BASE_URL`); config check.
- Integration: `createLeave` with mail catcher (one email, exact fields); SMTP vars missing → no email, success; SMTP failure → success; approve/reject send no email.

### Area: Operations

#### OPS-01 — Health check endpoint

- **Type**: functional
- **Source**: `(rewrite spec: Features by area › Operations)` — "`/health-check` pings Mongo: 200 `{checkMongo:'ok'}` or 500 with the error."
- **Depends on**: SETUP-01, MIG-01

**Goal**: Expose `/health-check` without authentication. It runs a Mongo check and returns 200 with `{"checkMongo":"ok"}` or 500 with the error text in the same key.

**Old behavior**:

- Mounted with `app.use('/health-check', …)` (`server/health-check/health-check.js:25-27`), so it answers every HTTP method and every sub-path (e.g. `/health-check/x`).
- Check = `getUserByEmail('dummy@just-to-test.com')`, i.e. a `users.findOne({email})` query, not a driver ping (`server/health-check/health-check.js:3-5`, `server/service/userService.js:16`).
- Each check runs; on success the key (function name `checkMongo`) is `'ok'`; on error the key is `` `${err}` `` = the error's `toString()`, i.e. `"<ErrorName>: <message>"` (`health-check.js:12-19`). Status 200 if all ok, else 500; body is JSON (`:22`).
- Mounted after the auth middleware (`server/index.js:39,48`), so a Bearer header triggers a user lookup first; no auth is required.
- **Analysis mismatch**: analysis says "pings Mongo"; the code runs a `users` query. Behavior to clients is the same.

**Constraints**: Public, no auth. Response shape frozen.

**API**:

- Path `/health-check` and any sub-path, any method (GET, HEAD, POST, …).
- Check `checkMongo`: a read against the new DB (`users` collection lookup by a non-existent email, or a driver `ping`; either is fine).
- 200 body: `{"checkMongo":"ok"}`.
- 500 body: `{"checkMongo":"<String(err)>"}`, e.g. `{"checkMongo":"MongoServerSelectionError: connect ECONNREFUSED 127.0.0.1:27017"}`.
- During migration (`OLD_MONGO_URL` set), a second check against the old DB is added with key `checkOldMongo`, present only in dual-DB mode; status 500 if any check fails. (interview: suggested answer accepted — suggest this; the alternative is to fold both into `checkMongo`.)
- The check must not hang: timeout 5 s per check (interview: suggested answer accepted), a timeout reports `"Error: timeout"` and 500.
- Content-Type `application/json`. Security headers per NFR-SEC-02 and CORS per OPS-03 apply.

**Acceptance criteria**:

- Given Mongo is reachable, when `GET /health-check`, then 200 `{"checkMongo":"ok"}`.
- Given Mongo is unreachable, then 500 and `checkMongo` is a non-empty string starting with the error name.
- Given `POST /health-check/anything`, then the same response as GET.
- Given an invalid Bearer token, then the endpoint still answers 200.
- Given dual-DB mode and the old DB down, then 500 with `{"checkMongo":"ok","checkOldMongo":"<error>"}`.

**Tests**:

- Unit: error serialization (`String(new Error('x'))` → `"Error: x"`).
- Integration: real MongoDB 8 container up → 200; container stopped (or wrong `MONGO_URL` on a test module) → 500 with error string; method/sub-path variants; dual-DB variant with mongo:3.6 container stopped.

#### OPS-02 — Exit on Mongo connection loss

- **Type**: functional
- **Source**: `(rewrite spec: Features by area › Operations)` — "Process exits on Mongo connect failure or disconnect, so Kubernetes restarts the pod."
- **Depends on**: SETUP-01, MIG-01

**Goal**: The server process terminates when it cannot open a MongoDB connection at startup, or when an open connection is lost, so Kubernetes restarts the pod. With two connections during migration, losing either one terminates the process.

**Old behavior** (`server/db/connect.js`):

- Connect failure: log `Connect to database failed -> exiting`, `process.exit(-1)` (`:12-19`) → OS exit status 255.
- `disconnected` event: log `Disconnected from the database -> exiting: <err>`, `process.exit(-2)` (`:26-32`) → exit status 254. Reason in comment: reconnect fails with `OverwriteModelError` (`:28-30`).
- `error` event only logs (`:25`); `close` only logs (`:33-35`).

**Constraints**: Exit codes kept: 255 (code -1) for connect failure, 254 (code -2) for disconnect.

**Business rules**:

| Event                                                               | Connection                               | Log (JSON, level `error`)                                       | Exit code |
| ------------------------------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------- | --------- |
| initial connect fails (after the driver's server selection timeout) | new (`MONGO_URL`)                        | `msg: "Connect to database failed -> exiting"`, `db: "new"`     | 255       |
| initial connect fails                                               | old (`OLD_MONGO_URL`, dual-DB mode only) | same, `db: "old"`                                               | 255       |
| `disconnected` after being connected                                | new                                      | `msg: "Disconnected from the database -> exiting"`, `db: "new"` | 254       |
| `disconnected` after being connected                                | old                                      | same, `db: "old"`                                               | 254       |
| `error` event                                                       | either                                   | logged, no exit                                                 | —         |
| intentional close during graceful shutdown (SETUP-01)               | either                                   | logged at `info`                                                | 0         |

- Driver auto-reconnect must not hide a disconnect: the handler reacts to the ODM's `disconnected` event exactly as old code did; no in-process reconnect is attempted.
- Server selection timeout for the initial connect: driver default (30 s) (interview: suggested answer accepted).

**Acceptance criteria**:

- Given `MONGO_URL` points to a closed port, when the server starts, then it logs the connect-failure line and exits with status 255.
- Given dual-DB mode and `OLD_MONGO_URL` unreachable, then exit 255 with `db: "old"`.
- Given the server runs and the MongoDB 8 container stops, then the process exits with status 254.
- Given dual-DB mode and the mongo:3.6 container stops, then exit 254 with `db: "old"`.
- Given SIGTERM, then the process exits 0 even though connections close.

**Tests**:

- Integration (spawn the built server as a child process): unreachable new DB → 255; unreachable old DB → 255; stop new DB container → 254; stop old DB container → 254; SIGTERM → 0.

#### OPS-03 — Public GraphQL IDE and open CORS

- **Type**: functional
- **Source**: `(rewrite spec: Features by area › Operations)` — "[PRESERVED BUG] GraphiQL is public and CORS allows all origins."
- **Depends on**: SETUP-01, NFR-SEC-02

**Goal**: Keep an in-browser GraphQL IDE at `GET /graphql` reachable without login, and keep CORS open to all origins on all routes. Both are preserved security bugs.

**Old behavior**:

- `graphqlHTTP({…, graphiql: true})` at `/graphql` (`server/index.js:40-45`): a `GET /graphql` from a browser (`Accept: text/html`) returns the GraphiQL page; requests run with whatever `req.context` the auth middleware produced, so anonymous use works and operations behave as for anon (guards return `null`). Introspection is allowed (graphql-js default).
- `app.use(cors())` with defaults (`server/index.js:36-37`): `Access-Control-Allow-Origin: *`; preflight `OPTIONS` answered 204 with `Access-Control-Allow-Methods: GET,HEAD,PUT,PATCH,POST,DELETE` and `Access-Control-Allow-Headers` echoing the request's `Access-Control-Request-Headers`; no credentials header.
- **Analysis mismatch**: `/download` is mounted before `cors()` (`server/index.js:34` vs `:37`), so download file responses carry no CORS headers; the analysis says all origins on all routes. The new server applies CORS to all routes including `/download`; this only adds headers and changes nothing for browsers fetching via navigation.

**Constraints**: `[PRESERVED BUG]` _(interview: Rewrite goal › Security bugs; client answer: S5 context)_. Security headers (NFR-SEC-02) must not break the IDE.

**API**:

- `GET /graphql` with `Accept: text/html` → 200 HTML page of an in-browser GraphQL IDE (GraphiQL or the equivalent offered by the chosen NestJS GraphQL driver), no auth, pointing at the same endpoint (respect `PUBLIC_PATH_PREFIX`, so in migration step 1 the IDE at `/v2/graphql` queries `/v2/graphql`).
- Introspection enabled in every environment including `NODE_ENV=production` (some GraphQL servers disable it in production by default; it must be explicitly on).
- `POST /graphql` with `Content-Type: application/json` from any origin must be executed (no CSRF-prevention feature may reject cross-origin JSON POSTs, because CORS `*` is preserved). Whether `GET /graphql?query=…` executes queries: (interview: suggested answer accepted) — suggest yes for queries only, as express-graphql did.
- The IDE needs no way to log in; users may paste a header if the IDE supports it.
- CORS on every route: `Access-Control-Allow-Origin: *`; preflight 204 with methods `GET,HEAD,PUT,PATCH,POST,DELETE` and echoed request headers; no `Access-Control-Allow-Credentials`.
- CSP interplay: the IDE page may need inline scripts and assets from a CDN; the server sends a relaxed CSP only on the IDE HTML response (see NFR-SEC-02), and the strict CSP everywhere else.

**Acceptance criteria**:

- Given no JWT, when a browser opens `/graphql`, then the IDE renders and the browser console shows no CSP violations.
- Given the IDE, when the anon user runs `{ getTrips { id } }`, then the result is `{"data":{"getTrips":null}}`.
- Given the IDE, when introspection runs with `NODE_ENV=production`, then the schema loads.
- Given `Origin: https://evil.example` on `POST /graphql`, then the response has `Access-Control-Allow-Origin: *` and executes.
- Given `OPTIONS /export/trips` with `Access-Control-Request-Headers: authorization,content-type`, then 204 with those headers allowed.

**Tests**:

- Integration: HTML IDE response on GET with `Accept: text/html`; introspection under `NODE_ENV=production`; CORS headers on `/graphql`, `/export/trips`, `/download/x.xlsx`, `/api/attendence/2024/1`, `/health-check`; preflight response; cross-origin JSON POST not rejected. Each named "[PRESERVED BUG]".
- End-to-end: open `/graphql` in a browser, assert no CSP console errors.

### Area: Data and validation

#### DATA-01 — Data model: Place, User, Trip, Leave

- **Type**: functional
- **Source**: `(rewrite spec: Features by area › Data and validation)` — "Data model: Place, User, Trip, Leave with app-level `id` (UUID or Google `sub`) and indexes as today."
- **Source**: `(rewrite spec: Features by area › Data and validation)` — "[PRESERVED BUG] Server enforces no required fields beyond GraphQL non-null inputs."
- **Depends on**: SETUP-01, NFR-MNT-02

**Goal**: Define the four persistent entities (Place, User, Trip, Leave) as Mongoose 8 models and their GraphQL types and input types, byte-compatible with the old MongoDB documents. Data is copied from the old MongoDB 3.6 database into the new MongoDB 8 database at each cutover (MIG tasks), and until then the new server may read/write the old database through a second connection. So collection names, field names, field types and the `id` convention must stay identical. The server keeps the old "no required fields" behaviour: only GraphQL non-null input types and Mongoose enum checks reject data.

**Old behavior**:

- All models are defined in `server/db/schema.js` with `mongoose.model('Place'|'User'|'Trip'|'Leave', ...)` (`schema.js:37,66,105,143`). Mongoose pluralizes model names into collections `places`, `users`, `trips`, `leaves` (Mongoose 4.13 default pluralization; no explicit `collection` option anywhere in `server/`).
- Every "required" flag is spelled `reqired` (e.g. `schema.js:12,16,20,24,28,42,47,56,60,71,75,...`), so Mongoose ignores it and no field is required server-side.
- `enum` validators are spelled correctly and ARE enforced by Mongoose on `save()` (create): Place.country (`schema.js:30-33`), Trip.travelType (`:93-97`), Leave.state (`:128-132`), Leave.type (`:133-137`). Updates use `findOneAndUpdate` without `runValidators`, so updates do not run them (`tripRelated.js:31-32`, `placeRelated.js:15`, `userRelated.js:78`).
- No defaults are declared anywhere in the schemas. Mongoose adds `_id` (ObjectId) and `__v` (version key, `0`) automatically. `_id` is never exposed or queried; every lookup uses the app-level `id` field (`tripRelated.js:20,31,39`, `placeRelated.js:9,15,17`, `userService.js:15-18`, `leaveRelated.js:38,45,53`).
- `id` values: Place/Trip/Leave get `uuid.v4()` on create (`placeRelated.js:11-13`, `tripRelated.js:23-24`, `leaveRelated.js:15,23`); User gets the Google `sub` on first login (`userRelated.js:49-50`).
- Dates (Trip.departureTime/arrivalTime, Leave.startDate/endDate) are stored as BSON Date. The API exchanges them as ISO-8601 strings: incoming strings are parsed with `moment(val).toDate()` (`src/data/dataUtil.js:5`, `src/data/Trip.js:21-24`, `src/data/Leave.js:32-35`); outgoing values are `moment(val).toISOString()`, i.e. UTC with milliseconds, e.g. `2017-12-04T07:00:00.000Z` (`dataUtil.js:3`, `Trip.js:11-14`, `Leave.js:22-25`).
- Place.travelDuration is stored as an ISO-8601 duration string produced by `moment.duration(...).toISOString()` (`src/data/Place.js:10-12`), e.g. `PT2H30M`, `PT15M`, `PT24H`, and `P0D` for zero.
- GraphQL SDL is built in `server/graphql/schema.js:42-146` from shared field strings (`:7-40`).

**Analysis mismatch**: The analysis (§2.2) lists `User.email` as non-null in GraphQL. In code, `type User` declares `email: String!` (`schema.js:96`) and then again `email: String` via `userFields` (`schema.js:20,98`); `approved: Boolean` is also declared twice (`:15,97`). graphql 0.10 `buildSchema` keeps the LAST definition of a duplicated field, so the effective type is `email: String` (nullable). Verify by introspecting the running production `/graphql` (GraphiQL is public) before freezing the SDL. The SDL below uses the effective (nullable) type.

**Analysis mismatch**: The analysis (§2.5, and BRIEF "Result type `{success, message}`") omits that `type Result` also has `payload: String` (`schema.js:43-47`). No resolver sets it. SETUP-01 owns `Result`; it must keep `payload: String` in the SDL.

**Analysis mismatch**: The analysis (§2.2) says `{id:1}` indexes are plain and User has "unique on id, email". In code the User schema declares BOTH `unique: true` on `id` and `email` (`schema.js:40-49`) AND plain `UserSchema.index({id: 1})` / `index({email: 1})` (`:63-64`). Both produce an index named `id_1` / `email_1` with different options, so one of the two `ensureIndex` calls fails at startup (Mongoose logs/ignores it). Which variant exists in production is not visible in code; copy the indexes found by `db.users.getIndexes()` on the anonymized prod copy (interview: suggested answer accepted; verify before go-live).

**Constraints**:

- Collection names and field names stay identical; data is copied old→new at cutover _(client answer: S4)_.
- **[PRESERVED BUG]** No server-side required-field validation beyond GraphQL non-null inputs _(rewrite spec: Data and validation)_. Do NOT add `required: true` to any Mongoose path. Empty strings for `String!` inputs are accepted and stored.
- Mongoose enum validation on create stays (it is current behaviour, not part of the bug).
- Enums (TravelType, Country, LeaveType, LeaveState) come from the shared types package owned by NFR-MNT-02; do not redefine the value lists here.
- Mongoose strict mode stays on (default): fields not in the schema are dropped silently on create/update (old Mongoose 4 default).
- The `Leave` path named `type` must be declared so Mongoose treats it as a field, not as the schema type key (old code: `type: { type: String, enum: ... }`, `schema.js:133-137`).

**Data model**:

Common to all four collections:

| Field | Type     | required    | default | validation | set by                                                                                           |
| ----- | -------- | ----------- | ------- | ---------- | ------------------------------------------------------------------------------------------------ |
| `_id` | ObjectId | auto        | auto    | —          | MongoDB/Mongoose; never exposed in API, never used in queries                                    |
| `__v` | Number   | auto        | `0`     | —          | Mongoose version key; keep enabled (default) so copied documents and new documents look the same |
| `id`  | String   | no (server) | —       | —          | server: `uuid` v4 (lowercase, hyphenated) for Place/Trip/Leave; Google `sub` for User            |

**Place** — collection `places`; index `{id: 1}` (non-unique) (`schema.js:35`)

| Field           | Mongo type | required (server)      | default | enum / validation                                                                 | set by                                            |
| --------------- | ---------- | ---------------------- | ------- | --------------------------------------------------------------------------------- | ------------------------------------------------- |
| id              | String     | no                     | —       | uuid v4                                                                           | server on `createPlace` (`placeRelated.js:11-13`) |
| name            | String     | no (GraphQL `String!`) | —       | none server-side                                                                  | admin via PlaceInput                              |
| destinationName | String     | no (GraphQL `String!`) | —       | none                                                                              | admin                                             |
| originName      | String     | no (GraphQL `String!`) | —       | none                                                                              | admin                                             |
| travelDuration  | String     | no (GraphQL `String!`) | —       | ISO-8601 duration string from client; server does not parse or validate it        | admin (UI slider, PLC-02)                         |
| country         | String     | no                     | —       | enum = Country codes (243 ISO 3166-1 alpha-2, NFR-MNT-02), checked on create only | admin                                             |

**User** — collection `users`; indexes on `id` and `email` (`schema.js:39-64`)

| Field     | Mongo type | required (server) | default                  | enum / validation       | set by                                                                  |
| --------- | ---------- | ----------------- | ------------------------ | ----------------------- | ----------------------------------------------------------------------- |
| id        | String     | no                | —                        | unique (see index note) | server at first login = Google `sub` (`userRelated.js:50`)              |
| email     | String     | no                | —                        | unique (see index note) | server at first login from token; writable via `updateUser` (USR tasks) |
| firstName | String     | no                | —                        | —                       | login (`given_name`), profile edit                                      |
| surname   | String     | no                | —                        | —                       | login (`family_name`), profile edit                                     |
| degrees   | String     | no                | — (login writes `''`)    | —                       | profile edit                                                            |
| address   | String     | no                | — (login writes `''`)    | —                       | profile edit                                                            |
| isAdmin   | Boolean    | no                | — (login writes `false`) | —                       | admin, CLI promote (`promoteUser.js:5`)                                 |
| approved  | Boolean    | no                | — (login writes `false`) | —                       | `approveUser`, CLI, `updateUser`                                        |

**Trip** — collection `trips`; index `{id: 1}` (non-unique) (`schema.js:103`)

| Field         | Mongo type      | required (server)          | default | enum / validation                                                                               | set by                                          |
| ------------- | --------------- | -------------------------- | ------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| id            | String          | no                         | —       | uuid v4                                                                                         | server on `createTrip` (`tripRelated.js:23-24`) |
| userId        | String          | no (GraphQL `String!`)     | —       | not checked against users or caller (TRIP-02 preserved bug)                                     | client                                          |
| placeId       | String          | no (GraphQL `String!`)     | —       | not checked against places                                                                      | client                                          |
| departureTime | Date            | no (GraphQL `String!`)     | —       | parsed from ISO string; invalid date → cast error                                               | client                                          |
| arrivalTime   | Date            | no (GraphQL `String!`)     | —       | parsed from ISO string; NOT compared to departure (TRIP-02 preserved bug)                       | client                                          |
| purpose       | String          | no (GraphQL `String!`)     | —       | none                                                                                            | client                                          |
| travelType    | String          | no (GraphQL `TravelType!`) | —       | enum TravelType codes `O, R, A, L, DZ, AUS, AUV, MOS, MOV` (NFR-MNT-02), checked on create only | client                                          |
| priceOfTravel | Number (double) | no (GraphQL `Float!`)      | —       | none (negative and 0 accepted)                                                                  | client                                          |

**Leave** — collection `leaves`; index `{id: 1}` (non-unique) (`schema.js:141`)

| Field       | Mongo type      | required (server)      | default                               | enum / validation                                                                         | set by                                                        |
| ----------- | --------------- | ---------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| id          | String          | no                     | —                                     | uuid v4                                                                                   | server on `createLeave` (`leaveRelated.js:23`)                |
| requesterId | String          | no                     | —                                     | —                                                                                         | server = caller id (`leaveRelated.js:24`)                     |
| approverId  | String          | no                     | absent until decided                  | —                                                                                         | server = admin id on approve/reject (`leaveRelated.js:42,50`) |
| startDate   | Date            | no (GraphQL `String!`) | —                                     | no date checks                                                                            | client                                                        |
| endDate     | Date            | no (GraphQL `String!`) | —                                     | no date checks                                                                            | client                                                        |
| state       | String          | no                     | — (server writes `PENDING` on create) | enum LeaveState `PENDING, APPROVED, REJECTED`, checked on create                          | server                                                        |
| type        | String          | no                     | —                                     | enum LeaveType `ANNUAL, SICKNESS, DOCTOR, MATERNITY, PARENTAL, CARING`, checked on create | client                                                        |
| isHalfDay   | Boolean         | no                     | —                                     | —                                                                                         | client                                                        |
| numDays     | Number (double) | no                     | —                                     | trusted from client                                                                       | client                                                        |

Index note (User): create indexes so that the new database ends up with the same index set as production. Suggested answer: copy the exact index definitions found on the production copy (`db.users.getIndexes()`), and if `id_1`/`email_1` are unique there, declare them `unique: true` only (no duplicate plain index). (interview: suggested answer accepted)

Date and duration serialization (owned here, used by TRIP-_, PLC-_, LEAVE-*, exports):

- API → DB: ISO-8601 string parsed as an instant, stored as BSON Date (UTC).
- DB → API: `YYYY-MM-DDTHH:mm:ss.SSSZ` in UTC (JavaScript `Date.prototype.toISOString` format).
- travelDuration is passed through as a string in both directions.

**API** (GraphQL SDL fragments owned by this task; operations are owned by TRIP-_, PLC-_, USR-_, LEAVE-_ tasks; `Result`, `LoginResult` by SETUP-01/AUTH tasks; enums by NFR-MNT-02). Field names, order-insensitive, and nullability exactly as below:

```graphql
input PlaceInput {
  name: String!
  destinationName: String!
  originName: String!
  travelDuration: String!
  country: Country
}

type Place {
  id: String!
  name: String!
  destinationName: String!
  originName: String!
  travelDuration: String!
  country: Country
}

input TripInput {
  userId: String!
  placeId: String!
  departureTime: String!
  arrivalTime: String!
  purpose: String!
  travelType: TravelType!
  priceOfTravel: Float!
}

type Trip {
  id: String!
  userId: String!
  placeId: String!
  departureTime: String!
  arrivalTime: String!
  purpose: String!
  travelType: TravelType!
  priceOfTravel: Float!
  user: User!
  place: Place!
}

input UserInput {
  isAdmin: Boolean!
  approved: Boolean
  firstName: String
  surname: String
  degrees: String
  address: String
  email: String
}

type User {
  id: String!
  email: String # effective type today, see Analysis mismatch
  approved: Boolean
  isAdmin: Boolean!
  firstName: String
  surname: String
  degrees: String
  address: String
}

type Leave {
  id: ID!
  requester: User
  approver: User
  state: LeaveState
  startDate: String!
  endDate: String!
  type: LeaveType
  isHalfDay: Boolean
  numDays: Float
}

input LeaveInput {
  startDate: String!
  endDate: String!
  type: LeaveType
  isHalfDay: Boolean
  numDays: Float
}
```

- `Trip.user` and `Trip.place` are resolved from `userId`/`placeId` (`tripRelated.js:9-14`); `Leave.requester`/`approver` from `requesterId`/`approverId` (`leaveRelated.js:58-63`). User resolution uses the deleted-user placeholder (USR-05).
- GraphQL variable coercion: the new GraphQL stack rejects a JSON string for `Float` (graphql 0.10 accepted `"12"`). The SPA must send `priceOfTravel` and `numDays` as JSON numbers.

**Business rules**:

- Missing document on read by `id` → `null` (Mongo `findOne` returns nothing).
- Update by `id` of a non-existent document → no error, operation reports success (`server/graphql/utils.js:1-10`; owned by SETUP-01 `Result` helper).
- Worked examples (serialization): input `departureTime: "2017-12-04T08:00:00+01:00"` → stored Date `2017-12-04T07:00:00Z` → returned `"2017-12-04T07:00:00.000Z"`. Duration 150 min → `"PT2H30M"`; 0 min → `"P0D"`; 1440 min → `"PT24H"`.

**Acceptance criteria**:

- Given a copy of the production database, when the new server starts on it, then it reads Place, User, Trip and Leave documents from collections `places`, `users`, `trips`, `leaves` with no data transformation.
- Given a new trip/place/leave created via the API, then the stored document has `_id`, `__v: 0`, an `id` in uuid v4 format, and the same field names as old documents.
- Given `createTrip` with `purpose: ""`, then the trip is saved (no required check).
- Given `createTrip` with `arrivalTime` before `departureTime`, then the trip is saved.
- Given `createPlace` without `country`, then the place is saved without a `country` field.
- Given a Mongo document with `departureTime` stored as Date, when read via GraphQL, then it is returned as `YYYY-MM-DDTHH:mm:ss.SSSZ` UTC.
- Given a GraphQL introspection of the new server, then every type and input above has exactly the listed fields and nullability.
- Given a Leave document with `type: "ANNUAL"`, then Mongoose reads `type` as a normal field.

**Tests**:

- Unit: date serializer (ISO with offset → UTC ISO with ms; invalid string → cast error); duration passthrough.
- Integration (Mongo test instance): each model writes to the expected collection name; indexes created match the expected list; create with empty strings succeeds; create with invalid enum (`travelType`, `country`, `state`, `type`) fails via Mongoose validation; update with an invalid enum value via findOneAndUpdate is NOT validated (matches old); unknown fields are dropped.
- Integration (GraphQL): introspection snapshot of `Place`, `PlaceInput`, `Trip`, `TripInput`, `User`, `UserInput`, `Leave`, `LeaveInput`, `Result` against the SDL above.
- Integration (migration rehearsal, with MIG tasks): load anonymized production copy, read every document of the four collections through the GraphQL types without errors.

## Decisions areas

### Area: Testing

#### TST-01 — Test infrastructure and coverage gate

- **Type**: decision
- **Source**:
  - `(rewrite spec: User decisions › Testing)` — "Every feature has automated tests; humans and AI agents both write code, so tests are mandatory and a coverage gate runs in CI."
  - `(rewrite spec: User decisions › Testing)` — "Tests are written only in the new app, from the analysis acceptance criteria and worked examples; no golden comparison with the old system."
  - `(rewrite spec: User decisions › Testing)` — "Unit tests cover all business rules: per-diem, template choice, template filling, work days, meal vouchers, leave filter, calendar colors, summary, attendance codes."
  - `(rewrite spec: User decisions › Testing)` — "Integration tests cover every GraphQL operation and REST endpoint, including the permission matrix and the preserved bugs."
  - `(rewrite spec: User decisions › Testing)` — "End-to-end tests cover the main screens: login, trips, places, users, both exports, leaves list/calendar/add/approval/summary."
- **Depends on**: SETUP-01, SETUP-02, TST-03, ENV-01

**Goal**: Set up test tooling for the server, the SPA and the shared package, define the three test levels, and enforce a coverage gate in CI. Every other task's test list runs inside this setup.

**Old behavior**: Server: 4 jest cases for `enumarateTripsWorkingDays` (`server/service/tests/tripService.test.js:26,31,36,41`). React: dummy test (`src/App.test.js`). Angular: mostly "should create" plus leave filter (`angular/src/app/leaves/leaveFilter.spec.ts:42-88`, 8 cases), holiday count (`angular/src/app/services/holiday-count.service.spec.ts:23-46`, 4 cases), color (`angular/src/app/services/color.service.spec.ts:12`), summary (`angular/src/app/leaves/summary/summary.component.spec.ts:80`); stale e2e scaffold (`angular/e2e/app.e2e-spec.ts:10-13`). Run by `bin/test.sh:9-15`. No coverage gate.

**Constraints**:

- Test frameworks are Instea's choice _(client answer: S3)_.
- No golden comparison with the old system; expected values come from analysis acceptance criteria, worked examples and DOC-02.
- Tests never call real external services; they use TST-03 fakes.
- AI agents have no production access (ENV-01).

**Test levels**:

| Level                | Scope                                                                   | Runs against                                                                       | Must cover                                                                                                                                                                                                                        |
| -------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit                 | pure functions in shared package, server services, SPA components/hooks | no DB, no network                                                                  | every business rule in DOC-02 with its worked examples; per-diem, template choice, template filling, work days, meal vouchers, leave filter, calendar colors, summary, attendance codes                                           |
| Integration (server) | HTTP to the running NestJS app                                          | real MongoDB 8 container (and mongo:3.6 container for dual-DB tests), TST-03 fakes | every GraphQL operation and REST endpoint; permission matrix (NFR-PRV-04 and AUTH-03) for anon, unapproved user with JWT, user, owner, admin, M2M; every `[PRESERVED BUG]` and `[CHANGE]` line, test names prefixed with that tag |
| Contract             | attendance API                                                          | see TST-02                                                                         | —                                                                                                                                                                                                                                 |
| End-to-end           | browser against the docker-compose stack (ENV-01)                       | fakes + seeded fixture data                                                        | login, trips, places, users, travel-warrant export, detail export, leaves list, calendar, add, approval, summary                                                                                                                  |

- Reuse old cases as named examples: `tripService.test.js:26-45` (trip working days), `leaveFilter.spec.ts:42-95` (leave filter), `holiday-count.service.spec.ts:23-53` (work-day count), `color.service.spec.ts:12` (calendar colors), `summary.component.spec.ts:80` (summary). Owning tasks cite them.
- Time: tests run with process timezone `UTC` (as in the production container) and with fixed "now" where dates default (e.g. trip form default "yesterday 08:00"). Tests that depend on `DEFAULT_TIMEZONE` set it explicitly.
- Test data: fixture builders in the repo; no anonymized production data in CI.
- Flaky-test rule: a test failing intermittently is fixed or quarantined with an issue; quarantined tests do not count to coverage (interview: suggested answer accepted).

**Coverage gate**:

- Measured on unit + integration runs for `server` and `shared` packages, and unit runs for the SPA.
- Threshold: 80 % lines on server and shared packages; SPA 70 % lines (interview: suggested answer accepted — values are suggestions).
- CI fails the PR if any package is below its threshold. The threshold lives in config in the repo; lowering it needs an ADR (NFR-MNT-03).
- Coverage reports are attached to the CI run.

**Acceptance criteria**:

- Given a PR that lowers server line coverage below the threshold, then CI fails with the coverage step named.
- Given `docker compose up` (ENV-01), when the e2e suite runs, then it passes without network access to Google, Toggl, SSO, SMTP or the FX provider.
- Given a preserved bug, then a test named `[PRESERVED BUG] …` asserts the buggy behavior.

**Tests**: This task's deliverable is the test setup; its own check is a CI run with one sample test per level and the gate enforced.

#### TST-02 — Attendance API contract tests

- **Type**: decision
- **Source**: `(rewrite spec: User decisions › Testing)` — "Contract tests freeze the attendance API: JSON shape, status codes, error messages, attendance codes."
- **Depends on**: TST-01, TST-03, ATT-01

**Goal**: Freeze the M2M attendance API contract with contract tests that run in CI and must pass before the attendance API goes live in migration step 1 (MIG-02).

**Old behavior** (`server/api/attendenceApi.js`, `server/service/attendenceService.js`):

- Auth: Basic auth on `/api/*`; no credentials, wrong credentials, or `M2M_USERNAME`/`M2M_PASSWORD` unset → 401 with empty body (`attendenceApi.js:4-19,22`).
- `GET /api/attendence/:year/:month`; month checked first: `isNaN(month)` → 400 `{"message":"Month is not a number."}`; then `isNaN(year)` → 400 `{"message":"Year is not a number."}` (`:29-39`). `isNaN` semantics: numeric strings like `13` or `1e1` pass.
- SSO failure → 500 `{"message":"Cannot get data from SSO, try again later."}`; Toggl failure → 500 `{"message":"Cannot get data from Toggl, try again later."}` (`attendenceService.js:130-155`, `attendenceApi.js:43-47`).
- 200 body: `{"start":"YYYY-MM-DD","end":"YYYY-MM-DD","attendence":{"<SSO name>":{"days":[{"logged_time":<number hours>,"leave":"<codes>"}, …one per day of month],"total":<number>,"contractType":<value or key absent>}}}` (`attendenceService.js:19-40,168-175`). Users without `togglUserId` are omitted; users with `employee !== '1'` are present with zero hours and empty leave strings; `contractType` key is absent when SSO has no value (JSON drops `undefined`).
- Codes: ANNUAL → `D8`, ANNUAL half-day → `D4`, SICKNESS → `PN`, DOCTOR → `L`, any other type → `I`; only APPROVED leaves; only working days in the month (not weekend, not SK holiday); several leaves on one day joined with `", "` (`attendenceService.js:42-73,158`).
- `logged_time` = sum of Toggl `seconds / 3600` for entries starting that day, not rounded (`:102-105`).

**Constraints**: Contract tests are written from this spec and the Attendance API task, not by recording the old system _(rewrite spec: User decisions › Testing)_. `[PRESERVED BUG]` crash on employee without `togglUserId` and duplicate-name overwrite stay frozen as the Attendance API task specifies.

**Contract test design**:

- Contract files in the repo (e.g. `contracts/attendance/*.json`): each holds SSO stub fixture, Toggl stub fixture, DB leaves/users fixture, request (path, auth), expected status, expected body (exact JSON, numbers compared with exact equality).
- Runner starts the server with TST-03 SSO and Toggl stubs and a MongoDB 8 container, loads fixtures, runs the request, compares exact JSON (key set, value types, values).
- A schema file (JSON Schema) for the 200 body, error body and code set is published with the contract for the M2M consumer (DOC-01).
- Any change to a contract file needs a PR label/approval by the M2M consumer owner (interview: suggested answer accepted — who owns the consumer).

**Acceptance criteria / required contract cases**:

1. No `Authorization` → 401, empty body.
2. Wrong password → 401. 3. Env credentials unset, any credentials → 401.
3. `/api/attendence/2024/abc` → 400 `{"message":"Month is not a number."}`.
4. `/api/attendence/abc/abc` → 400 month message (month checked first).
5. `/api/attendence/abc/1` → 400 `{"message":"Year is not a number."}`.
6. SSO stub returns 500 → 500 SSO message. 8. Toggl stub returns 500 → 500 Toggl message.
7. February 2024 (leap year) → `days` length 29; `start` `2024-02-01`, `end` `2024-02-29`.
8. Approved ANNUAL full day on a working day → `D8`; half day → `D4`; SICKNESS → `PN`; DOCTOR → `L`; MATERNITY / PARENTAL / CARING → `I`.
9. PENDING and REJECTED leaves → no code.
10. Leave over a weekend and an SK holiday (e.g. 2024-01-01 and 2024-01-06) → no code on those days.
11. Two approved leaves on one day → `"D8, L"` in leave creation order as returned by the DB query.
12. Toggl pagination with `X-Next-Row-Number` over 2 pages → hours summed across pages.
13. Non-employee user with `togglUserId` → present with zeros; user without `togglUserId` → absent.
14. SSO user without `contractType` → `contractType` key absent.

**Tests**: The cases above, at contract level, in CI on every PR (TST-01). MIG-02 requires them green.

#### TST-03 — Integration fakes

- **Type**: decision
- **Source**: `(rewrite spec: User decisions › Testing)` — "External integrations are replaced in tests by fakes kept in the repo: mail catcher, SSO stub, Toggl stub, fake Google token issuer, mocked exchange rates."
- **Depends on**: SETUP-01, DOC-01

**Goal**: Provide in-repo fakes for every external integration, runnable as containers in docker-compose (ENV-01) and in CI, and make the server point at them only through environment variables.

**Old behavior**: All integrations are called directly: Google token verification via google-auth-library with Google's certs (`server/graphql/userRelated.js:11,22-25`); SSO at `SSO_URI` (`server/service/attendenceService.js:9`); Toggl at a hardcoded base URL (`:7,92-97`); SMTP via nodemailer (`server/service/mailService.js:7-15`); FX via the `currency-converter` package with a hardcoded key (`src/data/Diets.js:1-4,30-33`). No fakes exist.

**Constraints**: Fakes behave per DOC-01. Production config must never point at a fake; the server logs a `warn` line at startup when `GOOGLE_ID_TOKEN_CERTS_URL` or `GOOGLE_ID_TOKEN_ISSUERS` differ from defaults.

**Fakes**:

| Fake                                            | Server env vars pointing at it                                                                                                                                                      | Behavior                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mail catcher (off-the-shelf SMTP catcher image) | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` (any values; must be non-empty because the server only sends when all four are set, `mailService.js:6`), `SMTP_SECURE=false` | Accepts SMTP with any auth, stores messages, exposes a web UI and an HTTP API to list/read/clear messages; tests assert recipient, subject "New leave notification" and HTML body                                                                                                                                                                                                                                            |
| SSO stub                                        | `SSO_URI=http://sso-stub:<port>/users`, `SSO_USERNAME`, `SSO_PASSWORD`                                                                                                              | `GET /users` with Basic auth equal to configured creds → 200 JSON array `[{"name","email","keys":[{"key","value"}]}]` from a fixture file; wrong auth → 401; control endpoint (`POST /__control`) sets mode `ok` / `error500` / `timeout` and replaces the fixture                                                                                                                                                           |
| Toggl stub                                      | `TOGGL_REPORTS_BASE_URL=http://toggl-stub:<port>/reports/api/v3`, `TOGGL_PAGE_DELAY_MS=0` in tests                                                                                  | `POST /reports/api/v3/workspace/:workspaceId/search/time_entries`, Basic auth `<token>:api_token`; body `{start_date, end_date, user_ids:[int], first_row_number?}`; returns `[{"user_id":int,"time_entries":[{"seconds":int,"start":"ISO"}]}]` from fixtures filtered by user and date range; pages of N rows with header `X-Next-Row-Number` when more rows exist; wrong token → 403; control endpoint for `error500` mode |
| Fake Google token issuer                        | `GOOGLE_ID_TOKEN_CERTS_URL=http://google-fake:<port>/certs`, `GOOGLE_ID_TOKEN_ISSUERS=http://google-fake:<port>`, `CLIENT_ID=<test client id>`; SPA `VITE_FAKE_GOOGLE_LOGIN=true`   | Serves a JWKS at `/certs`; `POST /token` with `{sub, email, hd?, given_name, family_name, aud?, exp?, alg?}` returns a signed RS256 ID token (defaults `aud=CLIENT_ID`, `exp=now+1h`, `iss` = its own issuer); can mint invalid tokens (wrong `aud`, expired, bad signature) for FAILED tests; serves a dev login page listing fixture users for e2e (the SPA's fake login button opens it and receives the credential)      |
| FX mock                                         | `FX_API_BASE_URL=http://fx-mock:<port>`, `FX_API_KEY=any`                                                                                                                           | Implements the subset of the real provider's HTTP API that the server calls (endpoint shape: Open Exchange Rates `GET /api/latest.json?app_id=<key>`, see TWE-05 and DOC-01), with fixed rates from a fixture (e.g. 1 USD = 0.9 EUR, 1 CZK = 0.04 EUR, …); control mode `error500`                                                                                                                                           |

- Google verification needs a configurable certs URL and issuer list in the server's ID-token verifier (or an injectable verifier in unit tests). Audience check against `CLIENT_ID` and expiry check stay on.
- Fakes are small services in the repo (e.g. `fakes/<name>`), each with its own image built in CI, plus fixture files. Integration tests can also start them in-process.
- In unit tests, integrations are replaced by injected test doubles at the service boundary.

**Acceptance criteria**:

- Given the compose stack, when a user logs in through the fake login page as an approved fixture user, then login returns SUCCESS and the SPA shows trips.
- Given the fake issuer mints a token with a different `aud`, then `loginUser` returns FAILED.
- Given a new leave, then the mail catcher API lists one message to `APPROVAL_MAIL_RECEIVER` with subject "New leave notification".
- Given the SSO stub in `error500` mode, then the attendance API returns 500 "Cannot get data from SSO, try again later.".
- Given production manifests, then none of the fake URLs appear (CI check greps manifests).

**Tests**:

- Unit: each fake's request matching (auth, pagination header logic).
- Integration: server against each fake (login, mail, attendance, travel-warrant export with FX mock).

### Area: Environments

#### ENV-01 — Local docker-compose environment

- **Type**: decision
- **Source**:
  - `(rewrite spec: User decisions › Environments)` — "Local docker-compose runs the full stack with integration fakes; no hosted staging environment."
  - `(rewrite spec: User decisions › Environments)` — "AI agents work with code and the local docker-compose environment (fakes, anonymized data); no production access."
- **Depends on**: SETUP-01, SETUP-02, TST-03, MIG-01

**Goal**: One `docker compose up` starts the whole new stack with all fakes and seeded data, so developers and AI agents can run, test and rehearse migration locally. There is no hosted staging.

**Old behavior**: `db/docker-compose.yml:1-13` starts only `mongo:3.6` on port 27017 (no auth, no volume). Server and SPAs run with `yarn server`, `yarn start`, `cd angular && yarn start` (`README.md:84-128`).

**Constraints**: No production secrets or URLs in the repo or compose files. AI agents get no production access; their data is fixtures or the anonymized copy (ENV-02). Two DBs for migration rehearsal _(client answer: S4)_.

**Services** (ports are proposals):

| Service       | Image                                                 | Port(s)            | Notes                                                                                             |
| ------------- | ----------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------- |
| `server`      | built from repo                                       | 4100               | env from `.env.example` defaults pointing at fakes; mounts a dev JWT key generated on first start |
| `web`         | Vite dev server (or the server serving the built SPA) | 5173               | proxies `/graphql`, `/refresh-jwt`, `/export`, `/download`, `/api`, `/health-check` to `server`   |
| `mongo`       | `mongo:8`                                             | 27017              | new DB, named volume                                                                              |
| `mongo-old`   | `mongo:3.6`                                           | 27018              | "old DB" for dual-DB mode and rehearsals, named volume                                            |
| `mailcatcher` | SMTP catcher                                          | 1025 SMTP, 1080 UI | TST-03                                                                                            |
| `sso-stub`    | repo fake                                             | 4201               | TST-03                                                                                            |
| `toggl-stub`  | repo fake                                             | 4202               | TST-03                                                                                            |
| `google-fake` | repo fake                                             | 4203               | TST-03                                                                                            |
| `fx-mock`     | repo fake                                             | 4204               | TST-03                                                                                            |

- Profiles: default = single-DB mode (only `mongo`); `migration` profile adds `mongo-old` and sets `OLD_MONGO_URL` / `OLD_DB_COLLECTIONS` for step-1 layout (MIG-01).
- Seeding: `seed` command loads fixtures: one admin (approved), one approved user, one unapproved user, places in SK and abroad (incl. a non-EUR country), trips in two months, leaves in each state and type, half-day leave, leave across a year boundary; matching SSO/Toggl fixtures. `restore-anonymized <archive>` loads an ENV-02 archive into `mongo-old` (and/or `mongo`).
- `.env.example` documents every variable from SETUP-01 with safe local values.
- Developer docs (NFR-MNT-03) describe start, seed, reset, run tests, rehearse.

**Acceptance criteria**:

- Given a clean checkout and Docker, when `docker compose up` and `seed` run, then the SPA at `http://localhost:5173` lets a fixture admin log in via the fake login and see trips, places, users, leaves.
- Given the stack, then no container has network egress needs (works with outbound internet blocked, except pulling images).
- Given the `migration` profile, then the server reads users/trips/places from `mongo-old` and leaves from `mongo`.
- Given the repo, then no file contains a production hostname, password or key.

**Tests**: CI starts the compose stack and runs the e2e suite against it (TST-01).

#### ENV-02 — Anonymized production copy

- **Type**: decision
- **Source**: `(rewrite spec: User decisions › Environments)` — "Script creates an anonymized copy of production MongoDB (names, emails, addresses) for local testing and migration rehearsal."
- **Depends on**: DATA-01, MIG-01, NFR-PRV-01, TST-03

**Goal**: A script in the repo turns a production MongoDB dump into an anonymized archive that can be restored into the local compose stack (ENV-01) for testing and migration rehearsal. Names, emails and addresses are replaced; references between collections stay consistent.

**Old behavior**: New — no counterpart in the old system. Personal data fields (`server/db/schema.js`): `users.firstName`, `surname`, `degrees`, `address`, `email`, `id` (= Google `sub`, `server/graphql/userRelated.js:27,50`). References: `trips.userId`, `leaves.requesterId`, `leaves.approverId`; attendance matches app users to SSO users by email (`server/service/leaveService.js:21-33`). The deleted-user placeholder uses the raw id as surname and in the email (`server/service/userService.js:3-13`).

**Constraints**: Only Instea staff with production access run the export part; AI agents only receive the anonymized archive (ENV-01). Raw dumps never enter the repo or CI.

**Process**:

1. Operator dumps the production DB(s): old MongoDB 3.6 (all collections) and, after step 1, the new MongoDB 8 (`leaves`, `auditlogs`). Use a dump tool version that supports server 3.6 (interview: suggested answer accepted; verify before go-live — verify tool compatibility).
2. Restore into a throwaway local MongoDB of the same major version (mongo:3.6 for the old DB).
3. Run `anonymize` (repo CLI) against the throwaway DB.
4. Script self-check: it keeps the original values in memory only and scans every string field of every document for any original email, first name + surname pair, address, or original id; any hit fails the run.
5. Dump the anonymized DB to an archive; delete the raw dump and throwaway DB.
6. Archive storage location: (interview: suggested answer accepted) — suggest an internal Instea storage, never git.

**Business rules** (per collection):

| Collection         | Field                                                             | Rule                                                                                                                                                                                         |
| ------------------ | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| users              | `id`                                                              | replaced with `anon-<NNN>` (interview: suggested answer accepted — spec lists only names/emails/addresses; the Google `sub` identifies the person's Google account, so suggest replacing it) |
| users              | `email`                                                           | `user<NNN>@example.test` (reserved `.test` domain so no real mail can go out)                                                                                                                |
| users              | `firstName`                                                       | `First<NNN>` if non-empty, else unchanged                                                                                                                                                    |
| users              | `surname`                                                         | `Last<NNN>` if non-empty, else unchanged                                                                                                                                                     |
| users              | `degrees`                                                         | `''` if empty, else `Ing.`                                                                                                                                                                   |
| users              | `address`                                                         | `Street <NNN>, 000 00 Testville` if non-empty, else unchanged                                                                                                                                |
| users              | `isAdmin`, `approved`, `_id`, `__v`                               | unchanged                                                                                                                                                                                    |
| trips              | `userId`                                                          | mapped through the id map                                                                                                                                                                    |
| trips              | `purpose`                                                         | unchanged (interview: suggested answer accepted — free text may contain personal data; suggest replace with `Purpose <n>` if the domain expert says so)                                      |
| trips              | other fields                                                      | unchanged                                                                                                                                                                                    |
| places             | all                                                               | unchanged (business data)                                                                                                                                                                    |
| leaves             | `requesterId`, `approverId`                                       | mapped through the id map                                                                                                                                                                    |
| leaves             | other fields                                                      | unchanged                                                                                                                                                                                    |
| auditlogs (new DB) | `actorId`, `subjectUserId`, `entityId` (when `entityType = User`) | mapped through the id map                                                                                                                                                                    |

- `NNN` = 3-digit index from sorting all distinct user ids found anywhere (users plus every reference, including ids of deleted users) by original value; so ids of deleted users map too, and the "Deleted" placeholder still works (`surname` shows the anonymized id).
- Optional output: SSO stub fixture (TST-03) with one SSO user per anonymized user: `name` = `First<NNN> Last<NNN>`, same `email`, keys `togglUserId=<NNN>`, `togglWorkspaceId=1`, `togglApiToken=fake-<NNN>`, `employee='1'`, `contractType` copied as `HPP` placeholder (interview: suggested answer accepted).
- Optional output: a list of anonymized users with `isAdmin`/`approved` flags (no original values) so a developer knows which fake login to use.
- The script is idempotent on already-anonymized data only in the sense that it refuses to run when all emails already end with `@example.test`.

**Acceptance criteria**:

- Given a fixture "production" DB with 3 users, trips and leaves referencing them and a leave approved by a since-deleted user, when anonymized, then no original name/email/address/id remains, every `trips.userId`, `leaves.requesterId`, `leaves.approverId` points at the mapped id, and the deleted approver maps to an id with no user document.
- Given the anonymized archive restored with the matching SSO fixture, then the attendance API returns leaves for anonymized employees (email match works).
- Given duplicated emails cannot occur, then the unique index on `users.email` builds.

**Tests**:

- Unit: id map ordering; field rules incl. empty values.
- Integration: run against a mongo:3.6 container with fixture data; self-check failure when a planted original value survives in an unexpected field.

### Area: Integrations and documentation

#### DOC-01 — Integration reference document

- **Type**: decision
- **Source**: `(rewrite spec: User decisions › Integrations)` — "Integration reference document for Google Identity, SSO directory, Toggl Reports v3, SMTP, exchange-rate source and the M2M consumer: endpoints, auth, fields, error behavior."
- **Depends on**: none

**Goal**: Write `docs/integrations.md` in the new repo: one section per integration with endpoints, auth, fields used, error behavior and the app's reaction, env vars, and the fake used in tests. Fakes (TST-03) must match it.

**Old behavior** (facts to document):

| Integration            | Endpoint / mechanism                                                                                                                                                                                                                                                                                                        | Auth                                                          | Fields used                                                                                                                                                                                             | Errors and app reaction                                                                                                                                                     |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Google Identity        | SPA loads `https://accounts.google.com/gsi/client` (`angular/src/index.html:12`; React via `@react-oauth/google`, `src/containers/auth/LoginForm.js:24`), gets an ID token (`credential`); server verifies with google-auth-library `verifyIdToken({idToken, audience: CLIENT_ID})` (`server/graphql/userRelated.js:22-25`) | ID token signature / audience                                 | `sub`, `hd`, `email`, `given_name`, `family_name` (`userRelated.js:26-29,50-55`)                                                                                                                        | verification error → `FAILED` (`:62-66`); `hd` ≠ `HOSTED_DOMAIN` → `WRONG_DOMAIN` (`:30-34`)                                                                                |
| SSO directory          | `GET SSO_URI` (`server/service/attendenceService.js:9`)                                                                                                                                                                                                                                                                     | Basic `SSO_USERNAME`/`SSO_PASSWORD`                           | array of `{name, email, keys:[{key, value}]}`; keys `togglUserId`, `togglWorkspaceId`, `togglApiToken`, `contractType`, `employee` (`'1'` = employee) (`:10-16,23-35,143`)                              | any error → 500 "Cannot get data from SSO, try again later." (`:130-138`)                                                                                                   |
| Toggl Reports v3       | `POST https://api.track.toggl.com/reports/api/v3/workspace/{togglWorkspaceId}/search/time_entries` (`:7,92-97`)                                                                                                                                                                                                             | Basic `<togglApiToken>:api_token`, `Accept: application/json` | request `{start_date, end_date, user_ids:[int], first_row_number?}`; response array of `{user_id, time_entries:[{seconds, start}]}`; header `x-next-row-number`; 500 ms pause between pages (`:82-113`) | any error → 500 "Cannot get data from Toggl, try again later." (`:147-155`); user without `togglWorkspaceId` skipped (`:80`)                                                |
| SMTP                   | nodemailer transport `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE` (`server/service/mailService.js:7-15`)                                                                                                                                                                                                                         | `SMTP_USER`/`SMTP_PASSWORD`                                   | from `MAIL_SENDER`, to `APPROVAL_MAIL_RECEIVER`, subject "New leave notification", HTML body (`:17-37`)                                                                                                 | send error logged only (`:39-42`); any of host/port/user/password missing → log "Email should be send now, but environmental properties for SMTP are not set." (`:6,45-46`) |
| Exchange rates         | npm `currency-converter` 0.1.12 with `CLIENTKEY` and `fetchInterval: 3600000` (rates cached 1 h) (`src/data/Diets.js:1-4`); `convert(amount, from, 'EUR')` → `{amount}` (`:30-33`); currencies used: USD, AUD, CAD, CHF, CZK, DKK, GBP, JPY, NOK, SEK                                                                       | client key                                                    | rate from currency to EUR                                                                                                                                                                               | rejection → export fails with 500 (`server/export/exportMiddleware.js:24-26`)                                                                                               |
| M2M consumer (inbound) | `GET /api/attendence/:year/:month` (`server/api/attendenceApi.js:21-24`)                                                                                                                                                                                                                                                    | Basic `M2M_USERNAME`/`M2M_PASSWORD`                           | response per TST-02                                                                                                                                                                                     | 401 / 400 / 500 per TST-02                                                                                                                                                  |

**Constraints**: Keep the same FX provider _(client answer: S1)_; key moves to `FX_API_KEY` env var; API believed alive _(client answer: A6)_. SSO system identity was marked not relevant _(client answer: A8)_; document only what the code uses.

**Document content per integration**: purpose; direction; base URL(s) and env vars; auth; request and response fields with types and examples; pagination; timeouts and retries (old code: none); error cases with the app's exact reaction and message; rate limits if known; fake used in tests and its control modes; open points.

**Open points the document must resolve** (each is a Gap):

- The HTTP endpoint and response format behind `currency-converter` 0.1.12 (not determinable from the repo because `node_modules` is absent). Suggested answer: read the package source from the npm registry and document the exact URL, query parameters and JSON shape; the FX mock (TST-03) implements exactly that.
- Who the M2M consumer is and who owns its side of the contract. Suggested answer: name the system and an owner contact; that owner approves contract-file changes (TST-02).
- Timeouts for outgoing calls (old: library defaults). Suggested answer: 10 s per call.

**Acceptance criteria**:

- Given the document, then each of the six integrations has all sections listed above, with `file:line` references to the new code once implemented.
- Given TST-03 fakes, then each fake's README links to its section and implements the same request/response shapes.

**Tests**: Review checklist in the PR (all sections present, fakes match). No automated tests.

#### DOC-02 — Business rules document

- **Type**: decision
- **Source**: `(rewrite spec: User decisions › Documentation)` — "Business rules document (diets, meal vouchers, work days, attendance codes, leave filter), validated by the domain expert."
- **Depends on**: TWE-04, DET-02, LV-05, LV-02, ATT-03, SUM-01

**Goal**: Write `docs/business-rules.md`: each rule as statement, formula/table with exact boundaries, preserved quirks, changed rules, and worked examples identical to the unit-test examples. A named domain expert validates it and the sign-off is recorded in the document.

**Old behavior** (rule sources to document):

- Diets: SK bands `hours >= 5 && hours <= 12` → 4.5, `<= 18` → 6.7, `> 18` → 10.3, so `< 5 h` → 6.7 (`src/data/Diets.js:10-18`); foreign: `<= 6` → 25 %, `<= 12` → 50 %, else 100 % of tariff (`:20-28`); unknown country → 0 (`:35,234-243`); non-EUR tariffs converted first (`:30-33`).
- Meal vouchers: month working days − trip days − leave days + half days (`server/export/exportDetail.js:48-52`), with the A4 changes.
- Work days: weekdays not SK public holidays; half-day subtracts 0.5 for any range (`angular/src/app/services/holiday-count.service.ts`), server equivalents (`server/service/tripService.js:4-5`).
- Attendance codes: `server/service/attendenceService.js:42-73` (see TST-02).
- Leave filter: `angular/src/app/leaves/leaveFilter.ts` with cases in `leaveFilter.spec.ts:42-95`.

**Constraints**:

- SK < 5 h = 6.7 € and no per-day split stay _(client answer: A3 Not relevant → spec stands)_.
- Detail export and summary count only APPROVED leaves _(client answer: A4)_; detail-export month working days exclude the 1st of the next month _(interview: A4 follow-up)_.
- The document describes the new app's rules. If the domain expert disagrees with a rule, the disagreement is recorded as an open issue and the code is not changed without a scope decision.

**Document structure**: one section per rule: rule ID, statement, inputs, formula/table, boundaries, quirks (`[PRESERVED BUG]`), changes (`[CHANGE]` with source), worked examples (input → output), link to the unit tests and to the owning task. Plus template choice (0–9 → `upto19`, 10–15 → `upto31`, ≥16 → error), summary, and calendar colors, because they are unit-test targets in TST-01.

**Validation**: Sign-off table at the top: domain expert name, date, document version, result. Domain expert identity: (interview: suggested answer accepted) — suggest the Instea person who approves leaves and prepares travel warrants today.

**Acceptance criteria**:

- Given the document, then every rule listed in the Source has at least three worked examples, including each boundary (e.g. SK 4.99 h, 5 h, 12 h, 12.01 h, 18 h, 18.01 h).
- Given the unit tests, then each worked example exists as a test with the same values.
- Given the sign-off table, then it is filled before migration step 2 go-live (MIG-03).

**Tests**: A CI check that every rule ID in the document is referenced by at least one test name (interview: suggested answer accepted — suggest it; otherwise manual review).

### Area: Migration strategy

#### MIG-01 — Dual-DB data layer and copy tool

- **Type**: decision
- **Source**:
  - `(rewrite spec: User decisions › Migration strategy)` — "Migration goes module by module; cutover can happen at any time in the month."
  - `(rewrite spec: User decisions › Migration strategy)` — "Old and new app share one MongoDB and one JWT signing key during the transition, so a session works across both." — CHANGED by _(client answer: S4)_ "Module by module but 2 separate databases"; JWT key still shared.
  - `(rewrite spec: User decisions › Migration strategy)` — "MongoDB 3.6 is upgraded to MongoDB 8; the timing relative to the shared-database period is open (see S4)." — RESOLVED: the new app runs MongoDB 8 from the start; the old 3.6 DB is retired in the final step (MIG-05).
  - Decision _(interview: S4 follow-up)_: copy module collections old→new at each cutover; until a collection is migrated, the new server reads and writes it in the old DB through a second connection.
- **Depends on**: SETUP-01, DATA-01

**Goal**: The new server can bind each collection to either the new MongoDB 8 or the old MongoDB 3.6, by configuration. A CLI copy tool moves a module's collections from the old DB to the new DB at cutover, idempotently, preserving `_id` and `id`, and verifies the result.

**Old behavior**: One Mongoose connection from `MONGO_URL` (`server/db/connect.js:7-14`); models `Place`, `User`, `Trip`, `Leave` registered on `open` (`server/db/schema.js:7-143`); Mongoose default collection names `places`, `users`, `trips`, `leaves`. App-level `id` field plus Mongo `_id` (`schema.js:10-13,32-36,61-64,108-111`). Old driver: Mongoose 4.13.5.

**Constraints**:

- Old app keeps MongoDB 3.6; new app uses MongoDB 8 _(client answer: S4)_.
- Same JWT signing key in both apps (SETUP-03), and the same `localStorage['jwt']` key in the browser (SETUP-02), so a session works across both apps on the same origin.
- Cutover can be any day of the month (no month-end dependency in the copy).

**Collection placement per step**:

| Step                           | New DB (MongoDB 8, `MONGO_URL`)                   | Old DB (MongoDB 3.6, `OLD_MONGO_URL`) | `OLD_DB_COLLECTIONS`         |
| ------------------------------ | ------------------------------------------------- | ------------------------------------- | ---------------------------- |
| Before step 1 (local only)     | —                                                 | —                                     | —                            |
| Step 1 live (MIG-02)           | `leaves`, `auditlogs`                             | `users`, `trips`, `places`            | `users,trips,places`         |
| Step 2 live (MIG-03) and after | `users`, `trips`, `places`, `leaves`, `auditlogs` | none (old app stopped)                | empty; `OLD_MONGO_URL` unset |

- Each model is registered on the connection chosen by `OLD_DB_COLLECTIONS`. Collections not listed use the new DB. `auditlogs` is always in the new DB.
- Cross-DB reads are application-level joins (e.g. leave `requester` resolved from `users` in the old DB). No `$lookup` across collections may be used while they can live in different DBs.
- Indexes per DATA-01 are created by the new server only on the new DB; the old DB's indexes are left as they are.

**Copy tool** (`migrate-copy`, CLI in the server image):

- Inputs: `--collections <list>` (e.g. `leaves`), `--direction old-to-new | new-to-old` (default `old-to-new`; reverse used by MIG-04), `--dry-run`, `--verify-only`, `--mirror`.
- Reads raw BSON documents (not through Mongoose models, so no casting, defaults or validation alter data) and writes them with upsert by `_id` (replace whole document). All fields including `_id`, `id`, `__v` are preserved byte-for-byte in value.
- `--mirror`: also deletes target documents whose `_id` is not in the source. Without `--mirror`, the tool refuses to run if the target has documents not in the source and prints them (interview: suggested answer accepted — suggest mirror mode for cutover runs).
- Idempotent: running twice gives the same target.
- Verify step (always after writing, or alone with `--verify-only`): per collection, source count = target count, and for every `_id` a hash of the canonical document equals. Prints a summary table; exits non-zero on any mismatch.
- Also reports, as warnings, documents that would fail DATA-01 enum checks or have duplicate values in fields with unique indexes (`users.id`, `users.email`), then builds DATA-01 indexes on the target and fails if an index build fails.
- Logs counts and duration; never logs document contents.

**Driver compatibility risk**: the new server connects to MongoDB 3.6 with the MongoDB Node driver bundled with Mongoose 8. Recent Node driver releases raised the minimum supported server version, and it is not verified here whether the Mongoose 8 release chosen still supports MongoDB 3.6. (interview: suggested answer accepted; verify before go-live — to verify) Suggested answer: verify in local compose (`mongo:3.6`) before implementation; if unsupported, pin a Mongoose 8 release whose driver still supports 3.6 for the whole project, or use a separate driver version only for the old-DB connection and the copy tool. Record the result in an ADR (NFR-MNT-03).

**Acceptance criteria**:

- Given `OLD_DB_COLLECTIONS=users,trips,places`, when the server creates a trip, then the document is written to the old DB `trips` and not to the new DB.
- Given step-1 config, when `getLeaves` runs, then leaves come from the new DB and `requester` names from the old DB `users`.
- Given 10 leaves in the old DB, when `migrate-copy --collections leaves` runs twice, then the new DB has exactly 10 leaves with the same `_id`, `id` and field values, and verify passes both times.
- Given the target has an extra document and no `--mirror`, then the tool exits non-zero without writing.
- Given a document whose hash differs after copy (simulated), then verify exits non-zero and names the `_id`.

**Tests**:

- Unit: placement resolution from `OLD_DB_COLLECTIONS`; canonical hash.
- Integration: mongo:3.6 + mongo:8 containers: copy, re-copy, mirror, reverse copy, verify mismatch, enum/unique warnings; server in step-1 config runs GraphQL leave and trip operations against the right DBs; old-DB connection works with the chosen driver (this test is the compatibility proof).

#### MIG-02 — Step 1 cutover: leaves, attendance API, detail export

- **Type**: decision
- **Source**:
  - `(rewrite spec: User decisions › Migration strategy)` — "Step 1, Leaves: new SPA leave screens and leave API go live; ingress routes `/leaves/` to the new app; the old app still serves Trips."
  - `(rewrite spec: User decisions › Migration strategy)` — "Step 3, Attendance API: `/api/attendence` moves to the new server after its contract tests pass." — moved into step 1 together with detail export _(interview: S4 follow-up)_.
  - `(rewrite spec: User decisions › Migration strategy)` — "Each step is rehearsed locally on the anonymized prod copy before go-live."
- **Depends on**: MIG-01, MIG-04, SETUP-03, TST-02, ENV-02, NFR-SEC-02, NFR-SEC-03, NFR-PRV-01, NFR-L10N-01, AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, AUTH-07, LV-01, LV-02, LV-03, LV-04, LV-05, LV-06, LV-07, APR-01, APR-02, SUM-01, NTF-01, DET-01, DET-02, ATT-01, ATT-02, ATT-03

**Goal**: Put the new leave screens, leave API, detail export and attendance API live while the old app keeps serving Trips, Places, Users and travel-warrant export. The new SPA must call the new API under a path that does not collide with the old app's `/graphql`, `/refresh-jwt`, `/export/*` and `/download`.

**Old behavior**:

- The old app serves on one origin: `/graphql`, `/refresh-jwt`, `/download/*`, `/api/*`, `/health-check`, `/export/*`, `/leaves/*` (Angular), `/*` (React) (`server/index.js:34-63`).
- Angular in production calls same-origin `/graphql`, `/refresh-jwt`, `/export/detail` (`angular/src/app/constants.ts:3-6`, `environment.prod.ts`); React calls `/graphql`, `/refresh-jwt`, `/export/trips` (`src/singletons/apolloClient.js:5`, `src/core/init.js:12`, `src/actions/exportActions.js:18`). Download URLs point to `/download/<file>` on the pod that generated the file (`server/export/exportMiddleware.js:21-23`).
- Approval email link: `BASE_URL + '/leaves/approval'` in production (`server/service/urlService.js:3-8`).

**Constraints**: Two DBs (MIG-01); shared JWT key; old URLs keep working _(client answer: S6)_; cutover any day of the month.

**Routing scheme** (interview: suggested answer accepted — proposal):

- New API is reachable under prefix `/v2`: `/v2/graphql`, `/v2/refresh-jwt`, `/v2/export/detail`, `/v2/download/<file>`, `/v2/health-check`. Implementation: either an ingress rewrite that strips `/v2`, or the server mounting its routes under `PUBLIC_PATH_PREFIX`; behavior is the same: a request to `/v2/X` is handled as `/X`.
- Server config `PUBLIC_PATH_PREFIX=/v2`: download URLs built by NFR-SEC-03 include it (`https://<host>/v2/download/<file>`), and the IDE (OPS-03) targets `/v2/graphql`.
- SPA built with `VITE_API_BASE=/v2` and `VITE_MIGRATION_STEP=1` (SETUP-02): leave routes rendered in-app; Trips/Places/Users/Export/Profile/Login links are full page loads to the old app; unauthenticated `/leaves/*` shows the login inline (login mutation goes to `/v2/graphql`, same user DB via old-DB connection).
- Ingress rules added (class `public`, same host), routed to the new Service; everything else keeps going to the old Service:

| Path             | Type   | Target | Why                                                                                          |
| ---------------- | ------ | ------ | -------------------------------------------------------------------------------------------- |
| `/leaves`        | Prefix | new    | leave screens (`index.html` for all `/leaves/*`)                                             |
| `/spa-assets`    | Prefix | new    | SPA asset base (SETUP-02)                                                                    |
| `/v2`            | Prefix | new    | new API                                                                                      |
| `/api`           | Prefix | new    | attendance API (only route under `/api` in the old app, `server/api/attendenceApi.js:22-23`) |
| `/export/detail` | Exact  | new    | detail export also reachable at its old path; returns `/v2/download/…` URLs                  |

`/graphql`, `/refresh-jwt`, `/export/trips`, `/download`, `/login`, `/health-check` and `/` stay on the old app.

- Sessions: both SPAs read and write `localStorage['jwt']` on the same origin; both servers verify with the same key; each SPA refreshes via its own server (`/refresh-jwt` vs `/v2/refresh-jwt`).

**Go-live sequence**:

1. Preconditions: TST-02 contract tests green; leave, detail export and attendance integration and e2e suites green; rehearsal (below) passed within the last 7 days; MongoDB 8 running (SETUP-03); Secret with the shared JWT key mounted; new Deployment configured with step-1 values (`OLD_MONGO_URL`, `OLD_DB_COLLECTIONS=users,trips,places`, `PUBLIC_PATH_PREFIX=/v2`) at replicas 0.
2. Announce a short window: leave screens and the attendance API return 503 for a few minutes. Users with an open old Angular tab must reload afterwards; writes from an old tab after step 3 are lost (interview: suggested answer accepted — acceptable?).
3. Apply the new ingress rules (new Service has 0 pods → 503 on those paths). The old Angular UI is now unreachable, so no new leave writes reach the old DB through the UI.
4. Run `migrate-copy --collections leaves --mirror`; verify passes.
5. Scale the new Deployment to 1; wait for Ready.
6. Smoke test: admin logs in at `/leaves/list`; list shows the copied leaves; create a leave (approval email received with link `/leaves/approval`); approve it; detail export downloads from `/v2/download/…` over HTTPS; `GET /api/attendence/<year>/<month>` with M2M credentials returns 200; navigating to `/trips` shows the old app still logged in.
7. Record start/end times and verify output in the migration log.

**Rehearsal** (local, ENV-01 `migration` profile): restore the latest ENV-02 archive into `mongo-old`; run an old-app container if available (interview: suggested answer accepted — suggest building the old image from commit `b94e050` for rehearsals only); run steps 3–6 against compose with a local ingress or reverse proxy that mimics the rules above; run the leave/detail-export/attendance e2e suites; record copy duration and counts. Repeat until clean.

**Acceptance criteria**:

- Given step-1 routing, when a user opens `/leaves/list`, then the new SPA renders and its GraphQL calls go to `/v2/graphql`.
- Given step-1 routing, when a user opens `/trips`, then the old React app renders and its calls go to `/graphql` on the old app.
- Given a JWT obtained in the new SPA, when the user opens `/trips`, then the old app shows them logged in (and vice versa).
- Given a detail export in the new SPA, then the returned URL starts with `https://<host>/v2/download/` and downloads the file.
- Given the M2M consumer calls `/api/attendence/2024/5` unchanged, then the new server answers with the frozen contract.

**Tests**:

- Integration: server with `PUBLIC_PATH_PREFIX=/v2` serves all routes under the prefix and builds prefixed download URLs.
- End-to-end (rehearsal environment): the go-live smoke steps as an automated script.

#### MIG-03 — Step 2 cutover: trips, places, users, travel-warrant export

- **Type**: decision
- **Source**: `(rewrite spec: User decisions › Migration strategy)` — "Step 2, Trips, Places, Users, travel-warrant and detail exports: new screens and API go live; ingress routes `/` to the new app." (Detail export already moved in step 1, _interview: S4 follow-up_.) "Each step is rehearsed locally on the anonymized prod copy before go-live."
- **Depends on**: MIG-02, AUTH-06, DOC-02, NFR-PRV-02, NFR-PRV-03, TRIP-01, TRIP-02, TRIP-03, TRIP-04, TRIP-05, PLC-01, PLC-02, USR-01, USR-02, USR-03, USR-04, USR-05, TWE-01, TWE-02, TWE-03, TWE-04, TWE-05

**Goal**: Move the remaining module to the new app: copy `users`, `trips`, `places` into MongoDB 8, switch the new server to single-DB mode, and route `/` to the new app so it serves every path.

**Old behavior**: Old app serves `/`, `/trips…`, `/places…`, `/users…`, `/export`, `/login`, `/graphql`, `/refresh-jwt`, `/export/trips`, `/download/*`, `/health-check` (`server/index.js:34-63`).

**Constraints**: Old URLs keep working _(client answer: S6)_. Old deployment is kept (scaled to 0) for rollback until MIG-05.

**Go-live sequence**:

1. Preconditions: all e2e suites green with `VITE_MIGRATION_STEP=2`, `VITE_API_BASE=''`, `PUBLIC_PATH_PREFIX=''`; rehearsal passed within 7 days; DOC-02 signed off; new image built with step-2 SPA.
2. Announce downtime (interview: suggested answer accepted — acceptable length; rehearsal measures it).
3. Scale the old Deployment to 0 (no more writes to the old DB). Scale the new Deployment to 0.
4. Run `migrate-copy --collections users,trips,places --mirror`; verify passes.
5. Update the new Deployment config: unset `OLD_MONGO_URL`, empty `OLD_DB_COLLECTIONS`, `PUBLIC_PATH_PREFIX=''`; deploy the step-2 image; scale to 1.
6. Ingress: route `/` (Prefix) to the new Service; remove the step-1 special rules except `/v2`, which stays as an alias to the new Service for open step-1 tabs for 7 days (interview: suggested answer accepted).
7. Smoke test: login at `/login`; trips list, add, edit, duplicate; places; users approve; travel-warrant export download over HTTPS; leaves pages; attendance API; audit log page shows the smoke-test actions.
8. Record in the migration log.

- Files generated by the old app in its pod's `/download` are not migrated (one-time links).

**Acceptance criteria**:

- Given step 2 is live, then every old URL from SETUP-02 is served by the new app and no request reaches the old Service.
- Given a user created in the old app before step 2, then they log in to the new app with the same Google account and see their trips.
- Given the copy, then counts and hashes of `users`, `trips`, `places` match the old DB.
- Given the new server, then it has no old-DB connection (`/health-check` has no `checkOldMongo`).

**Tests**:

- Integration: server in single-DB mode passes the full integration suite.
- End-to-end (rehearsal environment): smoke steps as an automated script on the anonymized copy.

#### MIG-04 — Rollback per step

- **Type**: decision
- **Source**: `(rewrite spec: User decisions › Migration strategy)` — "Rollback per step: route the ingress path back to the old deployment."
- **Depends on**: MIG-01

**Goal**: Define how to return a step to the old app. Because the DBs are separate, writes made in the new DB after cutover are not in the old DB; rolling back only the ingress would lose them.

**Old behavior**: New — no counterpart in the old system.

**Constraints**: Two DBs _(client answer: S4)_.

**Rollback procedure** (interview: suggested answer accepted — reverse copy before routing back is the suggested answer):

- Step 1 rollback:
  1. Scale the new Deployment to 0 (stops writes to new `leaves`).
  2. `migrate-copy --direction new-to-old --collections leaves --mirror`; verify passes.
  3. Remove the step-1 ingress rules (`/leaves`, `/spa-assets`, `/v2`, `/api`, `/export/detail`), so the old app serves them again.
  4. Smoke test old Angular leaves and old attendance API.
  5. `auditlogs` stay in the new DB; actions done in the old app after rollback are not audited.
- Step 2 rollback (back to the step-1 state):
  1. Scale the new Deployment to 0.
  2. `migrate-copy --direction new-to-old --collections users,trips,places --mirror`; verify passes.
  3. Reconfigure the new Deployment to step-1 values (MIG-02) and the step-1 SPA image; scale old Deployment to 1; restore step-1 ingress rules.
  4. Smoke test both apps.
- Documents written by Mongoose 8 must be readable by the old app's Mongoose 4.13 on MongoDB 3.6. DATA-01 must not add fields or types that the old app cannot read while rollback is possible (interview: suggested answer accepted; verify before go-live — confirm; verify in rehearsal).
- Rollback window: until MIG-05 (interview: suggested answer accepted — suggest 4 weeks after step 2).

**Acceptance criteria**:

- Given step 1 live and a leave created and another deleted in the new app, when step-1 rollback runs, then the old app shows the created leave and not the deleted one.
- Given step 2 live and a trip edited in the new app, when step-2 rollback runs, then the old React app shows the edited trip.

**Tests**: Rehearsed locally for each step (copy forward, write in new app, rollback, check in old app) on the anonymized copy; integration tests of `--direction new-to-old` in MIG-01.

#### MIG-05 — Final step: remove old deployment and MongoDB 3.6

- **Type**: decision
- **Source**: `(rewrite spec: User decisions › Migration strategy)` — "Final step: remove the old deployment and turn off the Jenkins job." Jenkins already inactive _(client answer: A7)_. MongoDB 3.6 retired at the end (S4 resolution).
- **Depends on**: MIG-03, MIG-04

**Goal**: After step 2 is stable, delete the old app's Kubernetes objects, confirm the Jenkins job is off, back up and retire the MongoDB 3.6 instance, and remove migration-only code and config.

**Old behavior**: Jenkins pipeline built `cestaky:master` and ran `docker-compose up -d` in `$DEPLOY_DIR` (`Jenkinsfile:9-13`); inactive per A7.

**Procedure**:

1. Preconditions: step 2 live for the rollback window (MIG-04) with no rollback; owner approval.
2. Final `mongodump` of the old DB 3.6 to an archive; retention (interview: suggested answer accepted — suggest 1 year, internal storage).
3. Delete old Deployment, Service, Ingress rules and old-only Secrets/ConfigMaps. Keep the JWT key Secret (used by the new app).
4. Stop and delete the MongoDB 3.6 instance and its storage.
5. Jenkins: verify the job is disabled; delete or archive it (interview: suggested answer accepted; verify before go-live — who has Jenkins access).
6. Remove the `/v2` ingress alias.
7. Code cleanup PR: remove `OLD_MONGO_URL`/`OLD_DB_COLLECTIONS` support, `checkOldMongo`, `PUBLIC_PATH_PREFIX` and `VITE_MIGRATION_STEP` step-1 branches, and decide whether to keep `migrate-copy` (ADR). If the new code lives in the old repo, also remove `Jenkinsfile`, `bin/test.sh`, `PM2.md`, `db/docker-compose.yml` and the old app sources (interview: suggested answer accepted — new repo or same repo).

**Acceptance criteria**:

- Given the cluster, then no object of the old app exists and the new app still passes smoke tests.
- Given the archive, then it restores into a mongo:3.6 container with the same counts as before deletion.

**Tests**: Post-removal smoke test (same script as MIG-03 step 7).

## NFR areas

### Area: Security

#### NFR-SEC-01 — Dependency and image vulnerability scanning

- **Type**: NFR
- **Source**: `(rewrite spec: Non-functional requirements › Security)` — "CI scans dependencies and the container image for known vulnerabilities."
- **Depends on**: NFR-MNT-01, SETUP-03

**Goal**: CI scans all dependency lockfiles and each built container image for known vulnerabilities on every PR and blocks merges above a threshold.

**Old behavior**: New — no counterpart in the old system (`Jenkinsfile`, `bin/test.sh` run no scans).

**Constraints**: Scanner tools are Instea's choice _(client answer: S3)_.

**Rules**:

- Scope: every lockfile in the repo (server, SPA, shared, fakes, tools) and every image pushed to `registry.instea.co` (OS packages and bundled node modules).
- Threshold: fail on CRITICAL or HIGH findings that have a fixed version available; report MEDIUM/LOW without failing (interview: suggested answer accepted).
- Accepted findings: an allowlist file in the repo with vulnerability ID, package, reason, owner, expiry date; expired entries fail CI.
- Scheduled scan of the `master` image weekly, reporting to the team channel (interview: suggested answer accepted).
- Scan reports attached to the CI run.

**Acceptance criteria**:

- Given a PR adding a dependency with a known HIGH vulnerability that has a fix, then CI fails at the scan step.
- Given the same finding in the allowlist with a future expiry, then CI passes and lists it as accepted.
- Given an allowlist entry past expiry, then CI fails.

**Tests**: CI pipeline test with a deliberately vulnerable fixture package in a throwaway branch (manual check at setup).

#### NFR-SEC-02 — Security headers

- **Type**: NFR
- **Source**: `(rewrite spec: Non-functional requirements › Security)` — "Server sends standard security headers on all responses."
- **Depends on**: SETUP-01

**Goal**: Every server response (SPA HTML, assets, GraphQL, REST, downloads, health check, errors) carries a standard set of security headers, compatible with Google Sign-In, FullCalendar, the public GraphQL IDE and open CORS.

**Old behavior**: No security headers; Express sends `X-Powered-By: Express` (`server/index.js:23`, no `helmet` or header middleware).

**Constraints**: CORS `*` preserved (OPS-03); GraphQL IDE public (OPS-03); Google Identity Services script and iframe (`angular/src/index.html:12`); FullCalendar 6 injects styles at runtime.

**Headers** (interview: suggested values accepted):

| Header                                                                  | Value                                                                                                                                                                                                                                                                                                                                                                                                                | Applies to                                                                                                           |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `Strict-Transport-Security`                                             | `max-age=31536000`                                                                                                                                                                                                                                                                                                                                                                                                   | all (only meaningful over HTTPS; harmless if host nginx also sets it — must not be sent twice with different values) |
| `X-Content-Type-Options`                                                | `nosniff`                                                                                                                                                                                                                                                                                                                                                                                                            | all                                                                                                                  |
| `X-Frame-Options`                                                       | `DENY`                                                                                                                                                                                                                                                                                                                                                                                                               | all                                                                                                                  |
| `Referrer-Policy`                                                       | `strict-origin-when-cross-origin` (Google Sign-In does not work with `no-referrer`)                                                                                                                                                                                                                                                                                                                                  | all                                                                                                                  |
| `Cross-Origin-Opener-Policy`                                            | `same-origin-allow-popups` (Google Sign-In popup flow)                                                                                                                                                                                                                                                                                                                                                               | all                                                                                                                  |
| `Permissions-Policy`                                                    | `camera=(), microphone=(), geolocation=()`                                                                                                                                                                                                                                                                                                                                                                           | all                                                                                                                  |
| `Content-Security-Policy`                                               | `default-src 'self'; script-src 'self' https://accounts.google.com/gsi/client; frame-src https://accounts.google.com/gsi/; connect-src 'self' https://accounts.google.com/gsi/; style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style; img-src 'self' data: https://*.googleusercontent.com; font-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'` | all except the IDE page                                                                                              |
| `Content-Security-Policy` (IDE page only: `GET /graphql` HTML response) | as above plus the script/style/connect origins the chosen IDE needs (e.g. its CDN) and `'unsafe-inline'` for scripts if the IDE page needs it                                                                                                                                                                                                                                                                        | IDE HTML only                                                                                                        |
| `X-Powered-By`                                                          | not sent                                                                                                                                                                                                                                                                                                                                                                                                             | all                                                                                                                  |

- `'unsafe-inline'` in `style-src` is needed because FullCalendar 6 and Google's button inject inline styles (interview: suggested answer accepted — Instea may switch to nonces).
- No `Cross-Origin-Resource-Policy` or `Cross-Origin-Embedder-Policy` header, so cross-origin API use under CORS `*` keeps working.
- `/download/*` responses also get `Content-Disposition: attachment` (interview: suggested answer accepted — old relied on the file type; harmless).

**Acceptance criteria**:

- Given any of `/`, `/trips`, `/leaves/list`, `/spa-assets/<file>`, `POST /graphql`, `/health-check`, `/download/<file>`, `/api/attendence/2024/1` (401), `/no-such` (POST 404), then each response has all headers in the table and no `X-Powered-By`.
- Given the SPA in a browser, when the user logs in with Google (production) or the fake login (local), then the browser console shows no CSP violation.
- Given the leaves calendar page, then FullCalendar renders with no CSP violation.
- Given `/graphql` in a browser, then the IDE loads with no CSP violation.

**Tests**:

- Integration: header assertions for the route list above.
- End-to-end: browser console has no CSP errors on login, leaves calendar, GraphQL IDE.

#### NFR-SEC-03 — Export download URLs use the request scheme

- **Type**: NFR
- **Source**: `(rewrite spec: Non-functional requirements › Security)` — "Export download URLs use the request scheme (HTTPS), not hardcoded `http://`."
- **Depends on**: SETUP-01

**Goal**: One URL builder creates the download URL returned by `POST /export/trips` and `POST /export/detail`. It uses the scheme and host of the original client request (HTTPS behind host nginx and ingress), plus the public path prefix.

**Old behavior**: `res.json('http://' + req.headers.host + '/' + path.relative(__dirname, filename))` (`server/export/exportMiddleware.js:21-23`). `__dirname` is `server/export`, the file is in `server/download` (`server/export/exportTravelWarrant.js:176-181`, `server/export/exportDetail.js:95-101`), so the relative path is `../download/<file>` and the result is `http://<Host header>/../download/<file>`; the browser normalizes it to `http://<host>/download/<file>` when the client calls `window.location.assign(url)` (`src/containers/export/ExportForm.js:38`, `angular/src/app/leaves/leaves-export/leaves-export.component.ts:81-86`). Behind HTTPS this is mixed/insecure.

**Constraints**: Response body stays a JSON string (the URL) _(rewrite spec: Scope — contract stays the same)_. `/download` stays public `[PRESERVED BUG]` _(client answer: S5)_.

**Business rules**:

- URL = `<scheme>://<host><PUBLIC_PATH_PREFIX>/download/<encodeURIComponent(filename)>`.
- `<scheme>`: when `TRUST_PROXY` is on, the first value of `X-Forwarded-Proto`; otherwise the connection protocol (`http` / `https`).
- `<host>`: the `Host` header (as old code), or the first `X-Forwarded-Host` value when `TRUST_PROXY` is on and the header is present.
- `PUBLIC_PATH_PREFIX`: `''` normally, `/v2` in migration step 1 (MIG-02).
- No `/../` segment in the output.
- Filenames keep the old patterns (owned by the export tasks); detail filenames contain user names (`exportDetail.js:98`), so encoding matters (spaces, diacritics).
- Proxy chain prerequisite: host nginx sets `X-Forwarded-Proto https` and ingress-nginx keeps it (SETUP-03 Gap).

**Worked examples**:

| Request                                                                                   | Config                 | Result                                                                                 |
| ----------------------------------------------------------------------------------------- | ---------------------- | -------------------------------------------------------------------------------------- |
| `Host: cestaky.example`, `X-Forwarded-Proto: https`, file `cestovny-prikaz-12345678.xlsx` | trust on, prefix `''`  | `https://cestaky.example/download/cestovny-prikaz-12345678.xlsx`                       |
| same, file `detail-Ján-Novák-2024-05-12345678.xlsx`                                       | trust on, prefix `/v2` | `https://cestaky.example/v2/download/detail-J%C3%A1n-Nov%C3%A1k-2024-05-12345678.xlsx` |
| `Host: localhost:4100`, no forwarded headers                                              | trust on               | `http://localhost:4100/download/<file>`                                                |
| `X-Forwarded-Proto: https, http`                                                          | trust on               | scheme `https` (first value)                                                           |
| `X-Forwarded-Proto: https`                                                                | trust off              | scheme from the connection (`http` locally)                                            |

**Acceptance criteria**:

- Given production routing, when a user generates any export, then the returned URL starts with `https://` and the file downloads without a mixed-content warning.
- Given a filename with spaces and diacritics, then the URL is percent-encoded and `GET` on it returns the file.

**Tests**:

- Unit: builder with the worked examples.
- Integration: `POST /export/trips` with `X-Forwarded-Proto: https` returns an `https://` URL; GET of that path returns the xlsx.

### Area: Data privacy and compliance

#### NFR-PRV-01 — Audit log

- **Type**: NFR
- **Source**: `(rewrite spec: Non-functional requirements › Data privacy and compliance)` — "Audit log records leave approve/reject/delete and user edit/approve/remove: who, when, which record." Viewable only by admins on a read-only admin screen, entries kept forever _(client answer: S8; interview: S8 follow-up)_.
- **Depends on**: SETUP-01, SETUP-02, DATA-01, AUTH-03, MIG-01

**Goal**: Record an immutable audit entry for each leave approve, reject, delete and each user edit, approve, remove (plus the new erase and data-export operations), and give admins a read-only screen to browse them. Entries are never deleted.

**Old behavior**: New — no counterpart in the old system. Operations to audit: `approveLeave`, `rejectLeave` (`server/graphql/leaveRelated.js:40-55`), `removeLeave` (`:32-39`), `updateUser` (`server/graphql/userRelated.js:70-79`), `approveUser` (`:82-84`), `removeUser` (`:81`).

**Constraints**: Admin only, read-only, kept forever _(client answer: S8)_. `updateUser` stays open to any user `[PRESERVED BUG]`, so non-admin edits of other users are audited too. Stored in the new DB from step 1 (MIG-01); user operations are audited only from step 2, when they move to the new app.

**Data model** — entity `AuditLog`, collection `auditlogs`:

| Field           | Type             | Required | Default   | Enum values                                                                                                                     | Validation                                                                  | Set by |
| --------------- | ---------------- | -------- | --------- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------ |
| `id`            | String (UUID v4) | yes      | generated | —                                                                                                                               | unique                                                                      | server |
| `at`            | Date (UTC)       | yes      | now       | —                                                                                                                               | —                                                                           | server |
| `actorId`       | String           | yes      | —         | —                                                                                                                               | id of the authenticated user from the auth context (AUTH-03)                | server |
| `action`        | String           | yes      | —         | `LEAVE_APPROVE`, `LEAVE_REJECT`, `LEAVE_DELETE`, `USER_UPDATE`, `USER_APPROVE`, `USER_REMOVE`, `USER_ERASE`, `USER_DATA_EXPORT` | —                                                                           | server |
| `entityType`    | String           | yes      | —         | `Leave`, `User`                                                                                                                 | —                                                                           | server |
| `entityId`      | String           | yes      | —         | —                                                                                                                               | app-level `id` of the affected record                                       | server |
| `subjectUserId` | String           | yes      | —         | —                                                                                                                               | user whose data the record is: leave `requesterId`, or the user `id`        | server |
| `changedFields` | [String]         | no       | —         | —                                                                                                                               | `USER_UPDATE` only: names of fields present in the update input (no values) | server |

- No names, emails or other values are stored, so the log holds only ids (resolved for display).
- Indexes: `{id: 1}` unique, `{at: -1}`, `{actorId: 1, at: -1}`, `{subjectUserId: 1, at: -1}`, `{action: 1, at: -1}`.
- No update or delete API; no TTL index.
- When an entry is written: after the operation succeeded and affected a document: approve/reject returned a leave; `removeLeave` found the leave and the requester/admin check passed; `updateUser`/`removeUser`/`approveUser` matched a user. Denied calls (guard returns `null`) and no-match calls write nothing (interview: suggested answer accepted). Audit write failure: the operation's result is still returned and the failure is logged at `error` (interview: suggested answer accepted — alternative is a transaction).

**API** (interview: suggested names accepted):

- `getAuditLog(filter: AuditLogFilter, offset: Int = 0, limit: Int = 50): AuditLogPage` — admin only (`adminProtected`: non-admin and anon get `null`, HTTP 200).
  - `AuditLogFilter { action: [String], actorId: String, subjectUserId: String, from: String (ISO date), to: String (ISO date, inclusive end of day) }`, all optional.
  - `AuditLogPage { total: Int!, items: [AuditLogEntry!]! }`; `AuditLogEntry { id, at (ISO string), action, entityType, entityId, changedFields, actor: User, subjectUser: User }`; `actor`/`subjectUser` resolve through the deleted-user placeholder (USR-05).
  - Sorted by `at` descending; `limit` max 200.

**Screens**: `/audit-log` (interview: suggested answer accepted — new URL), admin only; non-admin and anon see Unauthorized (SETUP-02). Live from step 2 (MIG-03).

- Header "Audit log".
- Filters: Action (multi-select of the enum, labels as table below), Who (user select), Subject (user select), From / To (date pickers); "Clear filter" button.
- Table columns: When (`D. M. YYYY H:mm`), Who (`surname, firstName`), Action, Record (`entityType` + `entityId`), Subject user (`surname, firstName`), Changed fields (comma list).
- Paging: 50 rows per page, previous/next and "Page X of Y".
- Empty state: "No audit entries." Loading/error via QueryState (SETUP-02).
- Action labels (English, translated via NFR-L10N-01): Leave approved, Leave rejected, Leave deleted, User edited, User approved, User removed, User erased, User data exported. (interview: suggested answer accepted — new copy.)

**Permissions**:

| Action                 | Anon         | User         | Admin   |
| ---------------------- | ------------ | ------------ | ------- |
| View `/audit-log` (UI) | Unauthorized | Unauthorized | allowed |
| `getAuditLog` (server) | `null`       | `null`       | data    |
| Modify/delete entries  | no API       | no API       | no API  |

**Acceptance criteria**:

- Given an admin approves leave L of user U, then one entry `{action: LEAVE_APPROVE, actorId: admin, entityType: Leave, entityId: L, subjectUserId: U}` exists.
- Given a requester deletes their own leave, then a `LEAVE_DELETE` entry with `actorId = subjectUserId` exists.
- Given a non-admin calls `approveLeave`, then no entry is written.
- Given user A updates user B's surname via `updateUser` `[PRESERVED BUG]`, then a `USER_UPDATE` entry with actor A, subject B, `changedFields` listing the input fields exists.
- Given 120 entries, when an admin opens `/audit-log`, then 50 newest show, and page 3 shows 20.
- Given filter Action = Leave rejected and From/To on one day, then only matching entries show.
- Given a non-admin calls `getAuditLog`, then `null` with HTTP 200.
- Given an entry's actor was removed, then Who shows "Deleted <id>" style placeholder per USR-05.

**Tests**:

- Unit: entry builder per action; `changedFields` from input.
- Integration: each audited mutation writes exactly one entry on success, none on denial/no-match; `getAuditLog` filters, paging, sorting, admin-only.
- End-to-end: admin approves a leave and sees the entry on `/audit-log`; non-admin sees Unauthorized.

#### NFR-PRV-02 — Admin exports a user's personal data

- **Type**: NFR
- **Source**: `(rewrite spec: Non-functional requirements › Data privacy and compliance)` — "Admin can export all personal data of one user."
- **Depends on**: NFR-PRV-01, DATA-01, AUTH-03, USR-01

**Goal**: An admin downloads one file with all personal data the app holds about one user: the user record, their trips, their leaves and audit entries about them.

**Old behavior**: New — no counterpart in the old system.

**Constraints**: Format not specified (interview: suggested answer accepted) — suggested answer: JSON file. Admin only.

**API** (interview: suggested answer accepted): `exportUserData(id: String!): String` — admin only (`null` otherwise). Returns a JSON string:

```
{ "exportedAt": ISO, "user": {id, email, firstName, surname, degrees, address, isAdmin, approved},
  "trips": [ {id, placeId, placeName, departureTime, arrivalTime, purpose, travelType, priceOfTravel} ],
  "leaves": [ {id, startDate, endDate, type, state, isHalfDay, numDays, approverId} ],
  "leavesApproved": [ {id, requesterId, state} ],
  "auditEntries": [ {at, action, entityType, entityId, actorId, subjectUserId} ] }
```

`auditEntries` = entries where the user is subject or actor. Unknown id → `null`. Writes a `USER_DATA_EXPORT` audit entry.

**Screens**: On `/users/edit/:id` (admin view) and as a row action on `/users`: button "Export personal data" (interview: suggested answer accepted — copy). Click → SPA calls the query and saves `user-<id>-personal-data.json`. Error → ErrorMessage with the error text.

**Permissions**: user/anon: button hidden, server returns `null`; admin: allowed.

**Acceptance criteria**:

- Given user U with 2 trips, 3 leaves and audit entries, when an admin exports, then the file contains exactly those records.
- Given a non-admin calls `exportUserData`, then `null`.
- Given an export, then a `USER_DATA_EXPORT` audit entry exists.

**Tests**:

- Integration: content completeness; admin-only; audit entry.
- End-to-end: admin clicks the button and a JSON file is downloaded.

#### NFR-PRV-03 — Admin erases a user's personal data

- **Type**: NFR
- **Source**: `(rewrite spec: Non-functional requirements › Data privacy and compliance)` — "Admin can erase one user's personal data." The erased user's trips and leaves are deleted _(client answer: S9)_.
- **Depends on**: NFR-PRV-01, DATA-01, USR-05, AUTH-03, USR-01

**Goal**: An admin erases one user: the user record and all their trips and leaves are deleted after a confirmation. Leaves they approved for others keep `approverId`, which then shows the "Deleted" placeholder.

**Old behavior**: New — no counterpart. Closest old operation: `removeUser` deletes only the user document (`server/graphql/userRelated.js:81`); references then resolve to the placeholder `firstName "Deleted"`, `surname = id`, `email <id>@deleted.instea.co` (`server/service/userService.js:3-13`).

**Constraints**: Delete trips and leaves _(client answer: S9)_. Audit entries kept forever _(client answer: S8)_.

**API** (interview: suggested answer accepted): `eraseUser(id: String!): Result` — admin only (`null` otherwise).

- Deletes: `users` document with `id`; all `trips` with `userId = id`; all `leaves` with `requesterId = id`.
- Keeps: `leaves` of other users with `approverId = id` (approver shows the USR-05 placeholder).
- Audit entries: kept unchanged (they hold ids only) (interview: suggested answer accepted — keep vs anonymize; suggest keep, per S8 "kept forever").
- Generated files in `/download` containing the user's name (detail export names, `server/export/exportDetail.js:98`) are not touched (interview: suggested answer accepted — suggest out of scope, or covered by TWE-01 cleanup).
- Writes one `USER_ERASE` audit entry (`entityType User`, `entityId = subjectUserId = id`).
- Returns `Result` with SETUP-01 semantics; unknown id → `{success: true}` with nothing deleted and no audit entry (interview: suggested answer accepted; verify before go-live).
- Erasing your own account: (interview: suggested answer accepted) suggest refused with `{success: false, message: "You cannot erase your own account."}`.
- Step availability: from step 2 (MIG-03), when users and trips are in the new DB.

**Screens**: On `/users` row actions and `/users/edit/:id` (admin): button "Erase personal data" (danger). Confirmation dialog: title "Erase personal data", text "This deletes <email>, all their trips and all their leaves. This cannot be undone.", buttons "Cancel" / "Erase". After success: navigate to `/users`, success message "Personal data erased." Error: ErrorMessage with `message`. (interview: suggested answer accepted; verify before go-live — new copy.)

**Permissions**: user/anon: hidden, server `null`; admin: allowed (not on self, per Gap).

**Acceptance criteria**:

- Given user U with trips and leaves, and U approved leave L2 of user V, when an admin erases U, then U, U's trips and U's leaves are gone, L2 remains with `approverId = U` and shows approver "Deleted" with surname U.
- Given the erase, then one `USER_ERASE` entry exists and older entries about U remain.
- Given Cancel in the dialog, then nothing is deleted.
- Given a non-admin calls `eraseUser`, then `null`.

**Tests**:

- Integration: deletion scope, approver references kept, audit entry, admin-only, self-erase refusal.
- End-to-end: admin erases a fixture user through the dialog; their trips disappear from the trips list.

#### NFR-PRV-04 — Regular users see only their own data

- **Type**: NFR
- **Source**: `(rewrite spec: Non-functional requirements › Data privacy and compliance)` — "Regular users see only their own data (see Scope)." Scope: "Regular users see only their own trips, leaves and user record; admin sees all." _(interview: Data visibility; confirmed over client answer A10)_
- **Depends on**: AUTH-03

**Goal**: Define the cross-cutting read-visibility rule and the permission integration test matrix that proves it. The functional tasks implement the filtering; this task owns the rule and the matrix.

**Old behavior**: `getTrips` returns all trips (`server/graphql/tripRelated.js:17-18`), `getLeaves` all leaves (`server/graphql/leaveRelated.js:18-20`), `getUsers` all users and `getUser` any id for any user (`server/graphql/userRelated.js:17-19`).

**Constraints**:

- **[CHANGE]** read visibility per Scope.
- Preserved exceptions (unchanged by this rule): `createTrip` with any `userId`, `updateUser` on any user, exports for any `userId`, public `/download` _(client answer: S5; spec [PRESERVED BUG] lines)_.
- Denial semantics per AUTH-03: `null` with HTTP 200, never 401.

**Rule**:

- Non-admin reads of trips, leaves and users return only records where the owner is the caller (`trip.userId`, `leave.requesterId`, `user.id`). Admin reads return all.
- Nested user fields on own records (e.g. a leave's `approver`, a trip's user) still resolve, so names display.
- Single-record reads of another user's record by a non-admin return `null` (exact per-operation behavior in TRIP-01 / USR-01).
- Derived lists use the same rule: pending-leave badge, calendar, leave filter requester options, summary.
- Person pickers: spec says the detail export lists all users (`(rewrite spec: Features by area › Detail export)` "all users listed"), but non-admins can no longer read other users. (interview: suggested answer accepted) Suggested answer: non-admin pickers (detail export, leave filter requester) show only the caller, like the travel-warrant export picker.

**Permission integration test matrix** (each cell is one integration test; "own" = record of the caller; "other" = another user's record):

| Operation                                                   | anon                   | user (own)       | user (other)                       | admin            |
| ----------------------------------------------------------- | ---------------------- | ---------------- | ---------------------------------- | ---------------- |
| `getTrips`                                                  | `null`                 | only own trips   | other trips absent                 | all trips        |
| `getTrip(id)`                                               | `null`                 | trip             | per TRIP-01 (`null`)               | trip             |
| `getLeaves`                                                 | `null`                 | only own leaves  | other leaves absent                | all leaves       |
| `getUsers`                                                  | `null`                 | only self        | others absent                      | all users        |
| `getUser(id)`                                               | `null`                 | self             | per USR-01 (`null`)                | user             |
| `getUserInfo`                                               | `null`                 | self             | —                                  | self             |
| `getPlaces`                                                 | `null`                 | all places       | all places                         | all places       |
| `POST /export/trips` / `/export/detail` with other `userId` | 401                    | file             | file `[PRESERVED BUG]`             | file             |
| `GET /download/<file>`                                      | file `[PRESERVED BUG]` | file             | file                               | file             |
| `createTrip` with other `userId`                            | `null`                 | created          | created `[PRESERVED BUG]`          | created          |
| `updateUser` other user                                     | `null`                 | `{success:true}` | `{success:true}` `[PRESERVED BUG]` | `{success:true}` |
| `getAuditLog`, `exportUserData`, `eraseUser`                | `null`                 | `null`           | `null`                             | data             |

Roles also tested: unapproved user holding a valid JWT behaves as "user" `[PRESERVED BUG]` (approval not re-checked per request, AUTH-03).

**Acceptance criteria**:

- Given users A and B each with trips and leaves, when A calls `getTrips` and `getLeaves`, then only A's records return; when admin calls, both return.
- Given A opens the leaves calendar, then only A's leaves show.
- Given A opens the user list URL, then Unauthorized (UI) and `getUsers` returns only A.

**Tests**: Integration: the full matrix above. End-to-end: user A's trips list and leaves list/calendar do not show B's records.

### Area: Maintainability

#### NFR-MNT-01 — CI pipeline

- **Type**: NFR
- **Source**: `(rewrite spec: Non-functional requirements › Maintainability)` — "CI runs on every PR: lint, typecheck, tests, coverage gate, image build and push to `registry.instea.co`; replaces Jenkins."
- **Depends on**: TST-01, SETUP-03

**Goal**: A CI pipeline runs on every PR and on merges to `master`: lint, typecheck, unit/integration/contract/e2e tests, coverage gate, vulnerability scans, image build and push. It replaces Jenkins.

**Old behavior**: Jenkins scripted pipeline: checkout → `bin/test.sh` (nvm Node 8, `yarn`, `CI=true yarn test`, `yarn lint`, Angular install/test with ChromeHeadless/lint) → `docker build -t cestaky:master .` → `cd $DEPLOY_DIR; docker-compose up -d`; mail to `dev@instea.co` (`Jenkinsfile:1-16`, `bin/test.sh:1-15`). Husky pre-commit/pre-push run eslint and `bin/test.sh` (`package.json:5-10`). Jenkins inactive _(client answer: A7)_.

**Constraints**: CI tool is Instea's choice _(client answer: S3)_. Registry credentials only as CI secrets (`REGISTRY_USERNAME`, `REGISTRY_PASSWORD`, names proposed).

**Pipeline stages** (fail fast; each stage blocks merge):

1. Install with frozen lockfile (Node 22).
2. Lint (all packages) and formatting check.
3. Typecheck (all packages, strict mode).
4. Unit tests with coverage.
5. Integration tests (MongoDB 8 and mongo:3.6 service containers, fakes) with coverage.
6. Contract tests (TST-02).
7. Coverage gate (TST-01 thresholds).
8. Dependency scan (NFR-SEC-01).
9. Build images (server; fakes; SPA image if separate).
10. Image scan (NFR-SEC-01).
11. E2E tests against compose using the built images.
12. Push images to `registry.instea.co`.

- Tags (interview: suggested answer accepted): suggest `pr-<number>-<shortsha>` on PRs, `master-<shortsha>` and `latest` on `master`, plus `vX.Y.Z` on git tags.
- Deployment to the cluster is not part of the spec; (interview: suggested answer accepted) suggest a manual `kubectl apply` of manifests with the chosen tag, documented in the README.
- Branch protection: `master` requires the pipeline green and one review.
- Notifications: failures on `master` notify the team (old: mail to `dev@instea.co`, `Jenkinsfile:15`).
- Local hooks (optional): lint-staged on commit.

**Acceptance criteria**:

- Given a PR with a type error, then CI fails at typecheck and the PR cannot merge.
- Given a green PR, then an image tagged per scheme exists in `registry.instea.co`.
- Given a merge to `master`, then images tagged `master-<sha>` are pushed.

**Tests**: The pipeline itself; verified once on a sample PR with a deliberate lint error, type error, failing test and low coverage.

#### NFR-MNT-02 — Shared types package

- **Type**: NFR
- **Source**: `(rewrite spec: Non-functional requirements › Maintainability)` — "Shared types package for enums and data used by server and SPA (travel types, leave types/states, login results, countries, diet tariffs); no "keep in sync" copies."
- **Depends on**: none

**Goal**: One TypeScript package (proposed name `@cestaky/shared`) used by server and SPA holds every enum and static data table below. GraphQL enums, Mongoose enums and SPA selects derive from it. No duplicated copies exist.

**Old behavior** — inventory:

| Item             | Old source                                                                                                                                                                                 | Duplicates / consumers                                                                                                                                                     | Values                                                                                                                                                                                                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TravelType       | `src/data/TravelType.js:1-17` (`values` + `byCode`)                                                                                                                                        | GraphQL enum `server/graphql/schema.js:54-56`; Mongoose enum `server/db/schema.js:2,85-88`; React form `src/containers/trips/TripForm.js:11`, `AddTripForm.js:6`           | `O` Osobný vlak; `R` Rýchlik; `A` Autobus; `L` Lietadlo; `DZ` Doprava zabezpečená; `AUS` Auto služobné; `AUV` Auto vlastné; `MOS` Motocykel služobný; `MOV` Motocykel vlastný (order as listed)                                                                                          |
| LeaveType        | `src/data/LeaveType.js:1-9` ("keep in sync with angular enum")                                                                                                                             | Angular numeric enum `angular/src/app/leaves/leave.ts:3-10`; GraphQL `schema.js:62-64`; Mongoose `server/db/schema.js:4,133-137`                                           | `ANNUAL` "ANNUAL"; `SICKNESS` "SICKNESS"; `DOCTOR` "Doctor visit"; `MATERNITY` "MATERNITY"; `PARENTAL` "PARENTAL"; `CARING` "Caring for a relative at home"                                                                                                                              |
| LeaveState       | `src/data/LeaveState.js:1-14` ("keep in sync with angular enum", `:7`)                                                                                                                     | Angular `leave.ts:12-16`; GraphQL `schema.js:66-68`; Mongoose `server/db/schema.js:5,128-132`                                                                              | `PENDING`, `APPROVED`, `REJECTED` (labels equal codes)                                                                                                                                                                                                                                   |
| LoginResults     | `src/data/LoginResults.js:1-9` ("keep in sync with angular")                                                                                                                               | Angular `angular/src/app/state/login.result.ts:1-7` ("keep in sync with react"); server `server/graphql/userRelated.js:8`                                                  | `SUCCESS`, `NEED_APPROVAL`, `WRONG_DOMAIN`, `FAILED` (GraphQL `LoginResult.status` is `String`, `schema.js:50-53`)                                                                                                                                                                       |
| Countries        | `src/data/Countries.js:1-244`, 243 entries `{name, code}` (English names, ISO 3166-1 alpha-2 codes, includes historic `CS` "Serbia and Montenegro" `:194`); list origin not stated in code | GraphQL `schema.js:58-60`; Mongoose `server/db/schema.js:3,22-25`; React `src/containers/places/PlaceForm.js:9`; default `SK` (`src/containers/places/AddPlaceForm.js:11`) | 243 codes as in the file, same order                                                                                                                                                                                                                                                     |
| Diet tariffs     | `src/data/Diets.js:37-232`, 194 entries; legal source URL comment `:36`                                                                                                                    | server `server/export/exportTravelWarrant.js:6`                                                                                                                            | `SK` → band function (`:10-18`); EUR tariffs as numbers (e.g. `AF: 32`); non-EUR as `inCurrency(amount, currency)`: 48 USD, 2 AUD (`AU`, `FJ`), 2 CHF (`LI`, `CH`), 1 each CZK (`CZ` 600), DKK (`DK` 380), GBP (`GB` 37), JPY (`JP` 6500), CAD (`CA` 65), NOK (`NO` 420), SEK (`SE` 455) |
| Refresh interval | `src/core/init.js:21` and `angular/src/app/constants.ts:8` (both 15 min)                                                                                                                   | —                                                                                                                                                                          | `15 * 60 * 1000` ms                                                                                                                                                                                                                                                                      |
| Holiday country  | `server/service/tripService.js:4-5`, `server/service/attendenceService.js:49`, `angular/src/app/services/holiday-count.service.ts:22`                                                      | —                                                                                                                                                                          | `'SK'`                                                                                                                                                                                                                                                                                   |

- Angular displayed leave types and states as enum code names, not labels (`angular/src/app/pipes/translate-leave-type.pipe.ts:7`, `translate-leave-state.pipe.ts:7`), so the LeaveType labels "Doctor visit" / "Caring for a relative at home" were never shown in the leave UI. The display rule belongs to the leave screen tasks; this package only carries codes and labels.
- Diet keys `CW`, `ME`, `RS` (`src/data/Diets.js:69,74,200`) are not in the Countries list, so no place can use them; keep them as data (parity).
- Not shared (stay in their owner): Mongo/GraphQL converters `src/data/Trip.js`, `Place.js`, `Leave.js`, `User.js`, `dataUtil.js` (replaced by typed DTOs in server and SPA); FX conversion (server only, needs `FX_API_KEY`); attendance code map (server only, `attendenceService.js:42-47`).

**Constraints**: Values, codes, order and labels exactly as above. Travel-type labels stay Slovak data labels in every UI language (NFR-L10N-01).

**Package content**:

- `TravelType` codes (string union + ordered array of `{code, label}`) and `travelTypeLabel(code)`.
- `LeaveType`, `LeaveState`, `LoginResult` codes + ordered arrays with labels.
- `COUNTRIES` ordered array `{code, name}` and `CountryCode` union; `DEFAULT_COUNTRY = 'SK'`.
- `DIET_TARIFFS`: map code → `{kind: 'SK'}` or `{kind: 'tariff', amount, currency}` (currency `EUR` for numeric entries), plus pure functions for the SK bands and the foreign percentage (FX applied by the server).
- `JWT_REFRESH_INTERVAL_MS`, `HOLIDAY_COUNTRY`.
- Work-day helper used by both the SPA (leave add) and the server (detail export, attendance): (interview: suggested answer accepted) suggest include, since the old code implemented it twice (`holiday-count.service.ts` and `tripService.js`).
- No runtime dependencies other than the date/holiday library if the work-day helper is included.
- Server GraphQL enums and Mongoose enums are generated from these arrays; a test asserts equality.
- No file anywhere else defines these values; CI lint rule or test forbids string literals of enum arrays outside the package (interview: suggested answer accepted — mechanism).

**Acceptance criteria**:

- Given the package, then TravelType has 9 entries with the exact codes/labels/order above, LeaveType 6, LeaveState 3, LoginResult 4, COUNTRIES 243, DIET_TARIFFS 194.
- Given the GraphQL schema introspection, then enums `TravelType`, `Country`, `LeaveType`, `LeaveState` list exactly the package's codes in the same order.
- Given SPA selects, then options come from the package.

**Tests**:

- Unit: counts and spot values (e.g. `CZ` → 600 CZK, `SK` bands, `AF` → 32 EUR, `DZ` → 42 USD); snapshot of the full arrays.
- Integration: schema enum values equal package arrays; Mongoose rejects values outside the enums.

#### NFR-MNT-03 — Developer documentation and ADRs

- **Type**: NFR
- **Source**: `(rewrite spec: Non-functional requirements › Maintainability)` — "Developer docs: README with local setup, architecture decision records."
- **Depends on**: ENV-01, NFR-MNT-01, SETUP-03

**Goal**: The new repo has a README that gets a developer or AI agent from clone to running stack and tests, and a folder of architecture decision records.

**Old behavior**: `README.md:1-177` covers install, Mongo via compose, key generation, promote-user, env vars, run, test, docker build; it is stale (Node 8 vs runtime Node 12, `README.md:15`, `Dockerfile:29`; mentions `private.key`/`public.pem` files that code never reads, `README.md:58` vs `server/auth/setup.js:7`). Angular README tests section "TODO".

**README sections**: purpose; architecture overview (server, SPA, shared package, DBs, integrations, fakes); prerequisites (Node 22, Docker); clone and install; `docker compose up`, seed, fake login users; env var table (from SETUP-01) with local defaults; running tests per level and coverage; lint/format/typecheck; creating the first admin (promote-user CLI); generating a local JWT key; anonymized data restore (ENV-02); migration rehearsal (MIG-02/03); build and deploy (SETUP-03, NFR-MNT-01); preserved bugs list with links; links to `docs/integrations.md` (DOC-01) and `docs/business-rules.md` (DOC-02).

**ADRs** (`docs/adr/NNNN-title.md`; sections Status, Context, Decision, Consequences):

1. Two databases during migration, dual connection and copy tool (MIG-01), incl. driver compatibility result.
2. Ingress routing scheme during migration (`/v2` prefix, asset base) (MIG-02).
3. SPA served by the server vs own container (SETUP-03).
4. Preserved bugs register and how tests mark them.
5. GraphQL code-first vs schema-first and contract-parity checks (SETUP-01).
6. Shared types package and generated enums (NFR-MNT-02).
7. One ADR per library choice under S3: xlsx, mail, Google auth/JWT, date/holidays, UI kit, forms/state, i18n, test frameworks, CI tool, scanners.
8. Integration fakes and verifier configuration (TST-03).
9. Audit log design (NFR-PRV-01).
10. Coverage thresholds (TST-01).
11. Download file storage and replicas (TWE-01).

**Acceptance criteria**:

- Given a new developer following only the README on a clean machine, then they reach a logged-in SPA and a green unit test run.
- Given each ADR in the list, then it exists with Status "Accepted" before step 1 go-live (ADR 1, 2, 3 before implementation starts).

**Tests**: CI link check on Markdown files (interview: suggested answer accepted — suggest it).

### Area: Localization

#### NFR-L10N-01 — SPA internationalization (English, Slovak)

- **Type**: NFR
- **Source**: `(rewrite spec: Non-functional requirements › Localization)` — "SPA uses an i18n framework with Slovak and English translations and a language switch." Default English _(client answer: A9)_; exports and emails English only _(client answer: S7)_.
- **Depends on**: SETUP-02, NFR-MNT-02

**Goal**: All SPA UI text comes from translation keys with English and Slovak catalogs. English is the default. A language switch changes the UI language immediately. xlsx exports and emails stay English only.

**Old behavior**: No i18n; UI copy is English except travel-type labels (Slovak, `src/data/TravelType.js:1-11`) and some placeholders (analysis §8 Q9). Date formats per SETUP-02.

**Constraints**:

- English copy equals the old copy (screen tasks list it); every key has a Slovak translation.
- Travel-type labels stay the Slovak data labels from NFR-MNT-02 in both languages (they are data, not UI copy).
- Server-produced texts (exports, emails, REST/GraphQL error messages such as attendance errors and `Result.message`) are not translated _(client answer: S7)_; the SPA shows raw server error messages as received.
- i18n library: Instea's choice _(client answer: S3)_.

**Rules**:

- Language switch: in the nav bar, right side, visible on all pages including the login page (SETUP-02); options "English" / "Slovenčina".
- Default: English on first visit (not browser language).
- Persistence: `localStorage['lang']` (`en` / `sk`) (interview: suggested answer accepted); read on load; invalid value → English.
- `<html lang>` follows the selection.
- Missing key in Slovak → English text; missing in English → key name, and a unit test fails.
- Login-result messages are mapped from status codes to keys ("Login failed. Try again later.", "Used email does not belong to given hosted domain.", "Account needs to be approved by admin first."), so they translate.
- Leave type and state display: codes are shown as in the old Angular UI; whether Slovak shows translated names (interview: suggested answer accepted) — suggest translate via keys `leaveType.<CODE>`, `leaveState.<CODE>` with English values equal to the codes.
- Country names in the place form: English names from the package in both languages (interview: suggested answer accepted — suggest keep English).
- Dates (interview: suggested answer accepted — for Slovak):

| Helper     | English                          | Slovak (suggested)                  |
| ---------- | -------------------------------- | ----------------------------------- |
| date-time  | `D. M. YYYY H:mm`                | `D. M. YYYY H:mm`                   |
| date       | `D. M. YYYY`                     | `D. M. YYYY`                        |
| leave date | `MMM D, YYYY`                    | `D. M. YYYY`                        |
| month      | `MMM YYYY` (English month names) | `MMMM YYYY` with Slovak month names |

- FullCalendar locale follows the selection (`en` / `sk`), including week start (Monday for `sk`; English week start as in the old calendar config, see LV-03; interview: suggested answer accepted).
- Number format for prices: unchanged from old (dot decimal) in both languages (interview: suggested answer accepted).

**Acceptance criteria**:

- Given a first visit, then the UI is English.
- Given the user selects Slovenčina, then all visible UI text switches without reload, and after reload it stays Slovak.
- Given Slovak UI, then travel-type options still read "Osobný vlak", "Rýchlik", …, and the travel-warrant xlsx and approval email are English.
- Given the English and Slovak catalogs, then both have the same key set.

**Tests**:

- Unit: catalog key parity; fallback behavior; date helpers per language with fixed dates.
- End-to-end: switch language on login page and on trips list; persists after reload; travel types unchanged.

## Derived tasks

### Area: Project setup

#### SETUP-01 — Server scaffold

- **Type**: derived
- **Source**: Derived — needed by every server task (all GraphQL, REST, export, attendance, auth, audit tasks). `(rewrite spec: Target tech stack › Server)` — "NestJS GraphQL module + REST, same operations and shapes as today"
- **Depends on**: NFR-MNT-02

**Goal**: Create the NestJS 11 / Node 22 / TypeScript server application that every server task plugs into. It loads configuration from environment variables, listens on one HTTP port, exposes the GraphQL API at `/graphql`, defines the shared `Result` GraphQL type, serves the SPA build, logs in structured form and shuts down gracefully. It does not implement any business operation itself.

**Old behavior**:

- Express app, port `4100` hardcoded (`server/index.js:23-24`), listens at `server/index.js:65`.
- Middleware order (`server/index.js:26-63`): create `server/download` folder (26-33) → `/download` static, no auth (34) → `cors()` (37) → `setupAuth(app, '/', '/refresh-jwt')` (39) → `/graphql` via express-graphql with `graphiql: true`, `context: req.context` (40-45) → `/api/*` Basic auth + attendance (47, `server/api/attendenceApi.js:21-24`) → `/health-check` (48) → `bodyParser.json()` + `POST /export/*` (50-51) → `/leaves/` static Angular build + `GET /leaves/*` returns Angular `index.html` (53-57) → `/` static React build + `GET *` returns React `index.html` (59-63).
- CLI mode: `node server/index.js --email X` promotes a user and does not start the server (`server/index.js:16-21`). Owned by the Auth area task for "CLI command promotes a user"; the scaffold must provide a CLI entry point that boots configuration and DB connections without starting HTTP.
- Mongo connection starts at require time (`server/index.js:6`, `server/db/connect.js:12-21`) and the HTTP listener starts without waiting for it; models are registered only on the connection `open` event (`server/db/schema.js:7`), so a request before `open` hits undefined models.
- Only `SIGINT` is handled: `process.exit()` with code 0 (`server/index.js:67-70`). `SIGTERM` is not handled (Node default: terminate by signal).
- Logging is `console.log` / `console.error` free text (e.g. `server/db/connect.js:16,21,25,27`, `server/export/exportMiddleware.js:25`, `server/graphql/userRelated.js:63`).
- `Result` helper `simpleResult` (`server/graphql/utils.js:1-23`):
  - Promise form: resolves → `{success: true}`; rejects → `{success: false, message: err.message}` (2-10). The result is `success: true` even when no document matched, because Mongoose `findOneAndUpdate/Remove` resolves with `null`.
  - Callback form: returns `(err) => …`; `err` truthy → resolves `{success: false, message: err.message}`, else `{success: true}` (12-22).
- GraphQL `Result` SDL is `type Result { success: Boolean!, message: String, payload: String }` (`server/graphql/schema.js:44-48`). `payload` is never set by any resolver.
- **Analysis mismatch**: the analysis (§2.5) describes `Result` as `{success, message}`; the SDL also has `payload: String` (`server/graphql/schema.js:47`), always `null`. Keep the field for contract parity.

**Constraints**:

- Same GraphQL operations, argument names and response shapes as today `(rewrite spec: Target tech stack › Server)`. The schema must be produced so that field names, nullability, enum names and enum values equal `server/graphql/schema.js:42-146`. Code-first or schema-first is Instea's choice; an ADR records it (NFR-MNT-03).
- `[PRESERVED BUG]` GraphiQL public and CORS all origins → OPS-03.
- Two DB connections during migration → MIG-01; the scaffold exposes both connections to modules.
- Libraries not named in the target stack are Instea's choice _(client answer: S3)_.

**Configuration (environment variables)**:

Validated at startup. A missing required variable stops the process with a log line naming the variable and exit code 1. Values are never logged.

| Variable                                               | Default                                                                                    | Old source                                                                             | Used by                                                 |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `PORT` (new name)                                      | `4100`                                                                                     | hardcoded `server/index.js:24`                                                         | SETUP-01, SETUP-03                                      |
| `MONGO_URL`                                            | `mongodb://localhost/data`                                                                 | `server/db/connect.js:7`                                                               | MIG-01 (new DB, MongoDB 8), OPS-01, OPS-02              |
| `OLD_MONGO_URL` (new name)                             | unset = single-DB mode                                                                     | —                                                                                      | MIG-01, OPS-01, OPS-02                                  |
| `OLD_DB_COLLECTIONS` (new name)                        | empty                                                                                      | —                                                                                      | MIG-01                                                  |
| `JWT_KEY_FILE` (new name)                              | `secrets/key.pem` (relative to app root)                                                   | hardcoded path `server/auth/setup.js:7`, `server/auth/operations.js:6`                 | Auth area (JWT sign/verify, `/refresh-jwt`), SETUP-03   |
| `CLIENT_ID`                                            | none                                                                                       | `server/graphql/userRelated.js:10`                                                     | Auth area (Google ID token audience)                    |
| `HOSTED_DOMAIN`                                        | unset = no domain check                                                                    | `server/graphql/userRelated.js:12`                                                     | Auth area (WRONG_DOMAIN)                                |
| `GOOGLE_ID_TOKEN_CERTS_URL` (new name)                 | Google's public certs URL                                                                  | implicit in google-auth-library                                                        | Auth area, TST-03                                       |
| `GOOGLE_ID_TOKEN_ISSUERS` (new name)                   | `accounts.google.com,https://accounts.google.com`                                          | implicit in google-auth-library                                                        | Auth area, TST-03                                       |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` | unset = mail only logged                                                                   | `server/service/mailService.js:6-14`                                                   | Notifications task                                      |
| `SMTP_SECURE`                                          | `false` (only the string `true` enables)                                                   | `server/service/mailService.js:10`                                                     | Notifications task                                      |
| `MAIL_SENDER`                                          | unset                                                                                      | `server/service/mailService.js:33`                                                     | Notifications task                                      |
| `APPROVAL_MAIL_RECEIVER`                               | unset                                                                                      | `server/service/mailService.js:19`                                                     | Notifications task                                      |
| `BASE_URL`                                             | `''`                                                                                       | `server/service/urlService.js:1`                                                       | Notifications task (approval link)                      |
| `NODE_ENV`                                             | unset                                                                                      | `server/service/urlService.js:4` (`production` → `/leaves/approval`, else `/approval`) | Notifications task, OPS-03 (introspection must stay on) |
| `DEFAULT_TIMEZONE`                                     | `Europe/Bratislava`                                                                        | `server/service/attendenceService.js:119`, `server/service/mailService.js:51`          | Attendance API task, Notifications task                 |
| `SSO_URI`, `SSO_USERNAME`, `SSO_PASSWORD`              | unset                                                                                      | `server/service/attendenceService.js:9`                                                | Attendance API task, TST-03                             |
| `M2M_USERNAME`, `M2M_PASSWORD`                         | unset = every request 401                                                                  | `server/api/attendenceApi.js:8-10`                                                     | Attendance API task                                     |
| `TOGGL_REPORTS_BASE_URL` (new name)                    | `https://api.track.toggl.com/reports/api/v3`                                               | hardcoded `server/service/attendenceService.js:7`                                      | Attendance API task, TST-03                             |
| `TOGGL_PAGE_DELAY_MS` (new name)                       | `500`                                                                                      | hardcoded `server/service/attendenceService.js:113`                                    | Attendance API task, TST-03                             |
| `FX_API_KEY` (new name)                                | none                                                                                       | hardcoded client key `src/data/Diets.js:3`                                             | Travel-warrant per-diem task, DOC-01                    |
| `FX_API_BASE_URL` (new name)                           | provider URL (see DOC-01)                                                                  | implicit in `currency-converter` package                                               | Travel-warrant per-diem task, TST-03                    |
| `DOWNLOAD_DIR` (new name)                              | `<app root>/download`                                                                      | `server/index.js:26` (`server/download`)                                               | Travel-warrant / detail export tasks, TWE-01            |
| `PUBLIC_PATH_PREFIX` (new name)                        | `''`                                                                                       | —                                                                                      | NFR-SEC-03, MIG-02                                      |
| `TRUST_PROXY` (new name)                               | `true` (trust `X-Forwarded-*` from the ingress hop) (interview: suggested answer accepted) | —                                                                                      | NFR-SEC-03                                              |
| `SPA_DIST_DIR` (new name)                              | `<app root>/public` (SPA build copied into the image)                                      | `server/index.js:53,59`                                                                | SETUP-01, SETUP-03                                      |
| `LOG_LEVEL` (new name)                                 | `info`                                                                                     | —                                                                                      | SETUP-01                                                |

All "(new name)" names are proposals; Instea may rename them in the README and manifests, but must keep one name per value across code, compose and k8s.

**Application structure**:

- One NestJS module per area (auth, users, places, trips, leaves, exports, attendance, health, audit). Each GraphQL resolver and REST controller lives in its area's module.
- A config module validates and exposes the table above. No module reads `process.env` directly.
- A DB module creates the connections defined in MIG-01 before the HTTP listener starts. **[CHANGE vs. old internals]** the HTTP port opens only after all configured DB connections are open and models are registered (old: listener and models raced, `server/db/schema.js:7`). This is not a behavior change visible to clients except that early requests no longer fail.

**API**:

- GraphQL endpoint: path `/graphql`, `POST` with JSON body `{query, variables, operationName}`, plus the IDE and `GET` behavior defined in OPS-03. Context carries the request auth context defined by AUTH-03.
- GraphQL type `Result`, shared by all mutations that return it:

| Field     | Type       | Semantics                                                                                                               |
| --------- | ---------- | ----------------------------------------------------------------------------------------------------------------------- |
| `success` | `Boolean!` | `true` when the underlying DB operation completed without throwing, even if no document matched. `false` when it threw. |
| `message` | `String`   | `null` on success; the thrown error's `message` on failure.                                                             |
| `payload` | `String`   | Always `null` (kept for parity, `server/graphql/schema.js:47`).                                                         |

Provide one helper (e.g. `toResult(promise)`) with exactly these semantics; resolvers that return `Result` must use it. A resolver that is denied by a guard returns `null` for the whole field, not a `Result` (AUTH-03).

- REST controllers registered by other tasks: `POST /refresh-jwt`, `POST /export/trips`, `POST /export/detail`, `GET /download/*`, `GET /api/attendence/:year/:month` (with Basic auth on `/api/*`), `ALL /health-check`.
- SPA static serving (if the SPA is served by the server; see SETUP-03 Gap):
  - Files from `SPA_DIST_DIR` are served for matching paths (asset path prefix per SETUP-02).
  - Any other `GET` not matched by an API route returns the SPA `index.html` with status 200 (old: `server/index.js:55-57,61-63`). This covers `/`, `/login`, `/trips…`, `/places…`, `/users…`, `/export`, `/leaves/…` and any unknown path (old React rendered an empty page body for unknown paths; the SPA does the same, SETUP-02).
  - Non-GET requests to unknown paths return 404.
- Body parsing: JSON for GraphQL and `/export/*`; body size limit default of the chosen framework (old: body-parser default 100 kB on `/export/*`, `server/index.js:50`).
- Response header `X-Powered-By` is not sent (NFR-SEC-02).

**Structured logging**:

- One JSON object per line to stdout with at least: `time` (ISO-8601 UTC), `level`, `msg`, `context` (module name), `reqId` (per HTTP request, also returned as response header `X-Request-Id`).
- Each HTTP request logs one line at `info` on completion: method, path (without query string), status, duration ms, `reqId`. The GraphQL operation name is added when present.
- Never log: `Authorization` header, JWTs, Google ID tokens, `SMTP_PASSWORD`, `SSO_PASSWORD`, `M2M_PASSWORD`, Toggl API tokens, `FX_API_KEY`, request bodies of `loginUser`. Old code logged a full error object on login failure (`server/graphql/userRelated.js:63`) and full leave arrays (`server/service/leaveService.js:36`); the new server logs error class and message only.
- `LOG_LEVEL` controls the minimum level (`debug`, `info`, `warn`, `error`).

**Graceful shutdown**:

- On `SIGINT` or `SIGTERM`: stop accepting new connections, wait for in-flight requests up to 10 s (interview: suggested answer accepted), close DB connections, exit with code 0.
- Closing DB connections on shutdown must not trigger the "disconnected → exit 254" path of OPS-02 (remove the disconnect handler, or mark shutdown in progress, before closing).
- A second signal during shutdown exits immediately with code 0.

**Acceptance criteria**:

- Given no `PORT`, when the server starts, then it listens on 4100.
- Given `PORT=5000`, when the server starts, then it listens on 5000.
- Given `CLIENT_ID` is unset, when the server starts, then it exits with code 1 and logs the missing variable name (interview: suggested answer accepted — old server started without it and every login returned FAILED; suggest fail fast).
- Given the DB is reachable, when the server starts, then `/graphql` and `/health-check` respond only after the DB connection(s) are open.
- Given a mutation whose DB call resolves with `null`, when it returns `Result`, then the response is `{success: true, message: null, payload: null}`.
- Given a mutation whose DB call throws `Error('boom')`, then the response is `{success: false, message: "boom", payload: null}`.
- Given a `GET /trips/edit/abc` request, then the response is the SPA `index.html` with status 200.
- Given `SIGTERM` while a request is in flight, then the request completes, the process exits with code 0, and no "exit 254" happens.
- Given any request, then exactly one JSON log line with method, path, status and duration is written, and no `Authorization` value appears in logs.

**Tests**:

- Unit: config validation (defaults, required vars, `SMTP_SECURE` string parsing); `toResult` helper (resolve value, resolve `null`, reject); log redaction of secrets and `Authorization`.
- Integration: server boots against MongoDB 8 container; `Result` shape through a test mutation; SPA fallback for every old URL listed in SETUP-02; 404 for `POST /unknown`; shutdown on `SIGTERM` exits 0 with an in-flight request completed; `X-Request-Id` present.
- End-to-end: covered by screen e2e tests (server serves SPA).

#### SETUP-02 — SPA shell

- **Type**: derived
- **Source**: Derived — needed by all screen tasks. `(rewrite spec: User decisions › Scope)` — "The two SPAs become one React SPA; the GraphQL + REST contract stays the same."; old URLs _(client answer: S6)_.
- **Depends on**: SETUP-01, NFR-MNT-02

**Goal**: Create the single React 19 + Vite + TypeScript SPA that replaces the React "Trips" SPA (`/`) and the Angular "Leaves" SPA (`/leaves/`). It owns routing for all old URLs, the unified navigation bar, shared Unauthorized / loading / error components, the Apollo Client 3 setup with the Bearer header, and the date formatting helpers. Screen tasks only add page components into this shell.

**Old behavior**:

React routes (`src/App.js:26-46`):

| URL                | Component                                  |
| ------------------ | ------------------------------------------ |
| `/` (exact)        | redirect to `/trips/` (`src/App.js:26,34`) |
| `/trips` (exact)   | TripList                                   |
| `/trips/add`       | AddTripForm                                |
| `/trips/edit/:id`  | EditTripForm                               |
| `/login`           | LoginForm                                  |
| `/users` (exact)   | UserList                                   |
| `/users/edit/:id`  | EditUserForm                               |
| `/places` (exact)  | PlaceList                                  |
| `/places/add`      | AddPlaceForm                               |
| `/places/edit/:id` | EditPlaceForm                              |
| `/export` (exact)  | ExportForm (travel warrant)                |

No catch-all route: unknown paths render the menu bar and an empty body.

Angular routes, base href `/leaves/` set after build (`angular/tools/updateDist.js:13`, `angular/src/app/app-routing.module.ts:10-21`): `approval`, `list/add`, `list`, `export` (detail export), `summary`; empty path redirects to `/list` (= `/leaves/list`). The whole Angular app shows the login page inline when not logged in and the nav + routed page when logged in (`angular/src/app/app.component.html:3-10`); there is no `/leaves/login` route.

React MenuBar (`src/containers/auth/MenuBar.js:30-89`), react-bootstrap Navbar:

| Position          | Label                                                         | Target                                                            | Visible when                                                                                      |
| ----------------- | ------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| left, first       | glyph `circle-arrow-left` + "Leaves"                          | `/leaves/` full page load (`href`)                                | always (`MenuBar.js:74-77`)                                                                       |
| left              | "Trips"                                                       | `/trips`                                                          | logged in (`MenuBar.js:34,56`)                                                                    |
| left              | "Places"                                                      | `/places`                                                         | logged in (`:35`)                                                                                 |
| left              | glyph `lock` + "Users"                                        | `/users`                                                          | admin only (`:36,57`); lock icon red class `admin-link-unallowed` if not admin (never shown then) |
| left              | "Export"                                                      | `/export`                                                         | logged in (`:37`)                                                                                 |
| right, logged in  | glyph `user` + first name; icon green (`admin-icon`) if admin | dropdown: "Profile" → `/users/edit/<own id>`, "Sign out" → logout | logged in (`:14-24`)                                                                              |
| right, logged out | "Login"                                                       | `/login`                                                          | logged out (`:26-28`)                                                                             |

Active item: current path starts with the item link (`MenuBar.js:45`).

Angular nav-header (`angular/src/app/nav-header/nav-header.component.html:1-41`), Bootstrap 4 navbar, shown only when logged in:

| Position    | Label                                                           | Target                                            | Visible when                                                                                                 |
| ----------- | --------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| left, first | icon `fa-arrow-circle-left` + "Trips"                           | `/trips` full page load                           | logged in (`:9-15`)                                                                                          |
| left        | "Leaves"                                                        | `/leaves/list`                                    | logged in (`:16-18`)                                                                                         |
| left        | "Export"                                                        | `/leaves/export` (detail export)                  | logged in (`:19-21`)                                                                                         |
| left        | "Leaves approval" + red badge with pending count when count > 0 | `/leaves/approval`                                | admin (`:22-27`); count = number of PENDING leaves (`nav-header.component.ts:27-31`, `leaves.service.ts:82`) |
| right       | "`firstName surname`"                                           | dropdown: "Summary" → `/leaves/summary`, "Logout" | logged in (`:29-39`)                                                                                         |

Shared components:

- Unauthorized: red alert (`alert alert-danger`) with text "You are not authorized to view this page!" (`src/components/Unauthorized.js:4-8`, `src/components/ErrorMessage.js:4-10`).
- Loading / error HOC: shows a loading indicator while loading, else an `ErrorMessage` with `err.message` (`src/components/withProgress.js:14-22`).
- Warning: yellow alert (`src/components/WarningMessage.js:4-10`).

Apollo / HTTP:

- React: Apollo network interface `uri: '/graphql'`, adds `authorization: Bearer <jwt>` when a JWT is in the store (`src/singletons/apolloClient.js:4-19`). REST calls use superagent with Bearer (`src/actions/exportActions.js:17-22`, `src/core/init.js:11-15`).
- Angular: Apollo `uri: GRAPHQL_URL` = `serverBase + '/graphql'` with `Authorization: Bearer <jwt>` (`angular/src/app/app.module.ts:105-122`, `angular/src/app/constants.ts:3-6`); `serverBase` is `''` in production (`angular/src/environments/environment.prod.ts`) and `http://localhost:4100` in dev (`environment.ts`). So in production Angular calls same-origin `/graphql`, `/refresh-jwt`, `/export/detail`.
- JWT stored in `localStorage['jwt']` by both apps (`src/actions/authActions.js:49`, `src/core/init.js:26`, `angular/src/app/auth.service.ts:74`).

Date formats in the old UI:

- React: `D. M. YYYY H:mm` and `D. M. YYYY` (`src/components/FormHelpers.js:39,43`); month picker `MMM YYYY` and month names `MMM` (`src/components/MonthPicker.js:9,20`).
- Angular: Angular `date` pipe default (`mediumDate`, en-US, e.g. `Jun 5, 2024`) for leave dates (`leaves-list.component.html:37`, `leaves-approval.component.html:17`).
- Value format sent to the server: ISO-8601 strings (`src/data/dataUtil.js:3`), month as `YYYY-MM` (`angular/src/app/state/leave.effects.ts:72`, `src/components/MonthPicker.js:22`).

**Constraints**:

- All old URLs keep working _(client answer: S6)_: `/`, `/login`, `/trips`, `/trips/add`, `/trips/edit/:id`, `/places`, `/places/add`, `/places/edit/:id`, `/users`, `/users/edit/:id`, `/export`, `/leaves/`, `/leaves/list`, `/leaves/list/add`, `/leaves/approval`, `/leaves/export`, `/leaves/summary`.
- English UI copy equals the old copy; translations via NFR-L10N-01 _(client answer: A9)_.
- Enums and labels come from the shared package (NFR-MNT-02).
- During migration step 1 only the leave routes are served by the new SPA (MIG-02).

**Routing** (React Router 7, browser history, no basename):

| URL                                                                                         | Page owner                      | Unauthenticated behavior                                                                                                    |
| ------------------------------------------------------------------------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `/`                                                                                         | redirect to `/trips`            | —                                                                                                                           |
| `/login`                                                                                    | Auth area (login page)          | login page                                                                                                                  |
| `/trips`, `/trips/add`, `/trips/edit/:id`                                                   | Trips tasks                     | Unauthorized component (React parity, `src/containers/trips/TripList.js:42,90-92`)                                          |
| `/places`, `/places/add`, `/places/edit/:id`                                                | Places tasks                    | Unauthorized                                                                                                                |
| `/users`, `/users/edit/:id`                                                                 | Users tasks                     | Unauthorized                                                                                                                |
| `/export`                                                                                   | Travel-warrant export task      | page as the export task defines (old ExportForm had no guard)                                                               |
| `/leaves`, `/leaves/`                                                                       | redirect to `/leaves/list`      | login page inline                                                                                                           |
| `/leaves/list`, `/leaves/list/add`, `/leaves/approval`, `/leaves/export`, `/leaves/summary` | Leave tasks, Detail export task | login page rendered inline at the same URL (Angular parity, `app.component.html:3-5`); after login the requested page shows |
| `/audit-log` (new)                                                                          | NFR-PRV-01                      | Unauthorized                                                                                                                |
| any other path                                                                              | shell with nav and empty body   | —                                                                                                                           |

Trailing slashes are accepted on every route (`/trips/` = `/trips`).

**Merged navigation** — (interview: suggested answer accepted — merged layout, labels and order). Proposed layout:

| Position | Label (English)                                                                                                                  | Target             | Visible when |
| -------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ------------ |
| left     | "Trips"                                                                                                                          | `/trips`           | logged in    |
| left     | "Places"                                                                                                                         | `/places`          | logged in    |
| left     | lock icon + "Users"                                                                                                              | `/users`           | admin        |
| left     | "Export"                                                                                                                         | `/export`          | logged in    |
| left     | "Leaves"                                                                                                                         | `/leaves/list`     | logged in    |
| left     | "Leaves export" (old Angular label was "Export"; renamed to avoid two "Export" items)                                            | `/leaves/export`   | logged in    |
| left     | "Leaves approval" + red badge with pending count when > 0                                                                        | `/leaves/approval` | admin        |
| left     | "Audit log" (new)                                                                                                                | `/audit-log`       | admin        |
| right    | language switch (NFR-L10N-01)                                                                                                    | —                  | always       |
| right    | user icon (green if admin) + first name → dropdown "Profile" (`/users/edit/<own id>`), "Summary" (`/leaves/summary`), "Sign out" | —                  | logged in    |
| right    | "Login"                                                                                                                          | `/login`           | logged out   |

The two "portal" links ("← Leaves", "← Trips") disappear because both areas live in one SPA. Active item = current path starts with the item target (`/leaves/list` stays active on `/leaves/list/add`). The pending badge count = number of leaves with state PENDING returned by `getLeaves` (admin sees all); it refreshes after approve/reject.

During migration step 1 (`VITE_MIGRATION_STEP=1`, MIG-02), links to `/trips`, `/places`, `/users`, `/export`, `/users/edit/<id>` and `/login` are full page loads (they are served by the old React app), and "Audit log" is hidden.

**Shared components**:

- `Unauthorized`: danger alert, text key `common.unauthorized` = "You are not authorized to view this page!".
- `ErrorMessage`: danger alert with given text. `WarningMessage`: warning alert.
- `Loading`: spinner shown while a query is loading.
- `QueryState` wrapper: loading → `Loading`; error → `ErrorMessage` with the error message (old `withProgress.js:20-22`); otherwise children. **[CHANGE]** it offers retry and re-runs the query without page reload `(rewrite spec: Features by area › Auth and session)` — "Client data loading recovers after an API error without a page reload."

**Apollo Client 3 setup**:

- HTTP link URI = `${VITE_API_BASE}/graphql` (`VITE_API_BASE` default `''`; `/v2` in migration step 1, MIG-02).
- Auth link adds `Authorization: Bearer <jwt>` when `localStorage['jwt']` (key name `jwt`, unchanged) holds a token; no header otherwise.
- In-memory cache; type policies keyed by `id` for `User`, `Trip`, `Place`, `Leave`.
- Logout clears the cache (`resetStore`/`clearStore`), per Auth area.
- REST helper for `/refresh-jwt` and `/export/*` with the same base and Bearer header.

**SPA build configuration (build-time)**:

| Variable                 | Old equivalent                                                                                                                         | Purpose                                                       |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `VITE_GOOGLE_CLIENT_ID`  | `REACT_APP_CLIENT_ID` (`src/index.js:13`, `Dockerfile:4`); Angular hardcoded (`angular/src/app/login-page/login-page.component.ts:42`) | Google Sign-In client ID                                      |
| `VITE_HOSTED_DOMAIN`     | `REACT_APP_HOSTED_DOMAIN` (`src/containers/auth/LoginForm.js:24`, `Dockerfile:3`)                                                      | Google button `hosted_domain` hint                            |
| `VITE_API_BASE`          | Angular `serverBase`                                                                                                                   | API path prefix (`''` or `/v2`)                               |
| `VITE_MIGRATION_STEP`    | —                                                                                                                                      | `1` or `2` (default `2`), see MIG-02                          |
| `VITE_FAKE_GOOGLE_LOGIN` | —                                                                                                                                      | local/test only, see TST-03; must be off in production builds |

Assets are emitted under one path prefix that does not collide with the old apps (old React: `/static/`, `/manifest.json`, `/favicon.ico`; old Angular: files under `/leaves/`). Proposed asset base: `/spa-assets/` (interview: suggested answer accepted).

**Date formats** (helpers in the SPA, used by all screens):

| Helper     | English                            | Source                                                       |
| ---------- | ---------------------------------- | ------------------------------------------------------------ |
| date-time  | `D. M. YYYY H:mm`                  | `src/components/FormHelpers.js:39`                           |
| date       | `D. M. YYYY`                       | `src/components/FormHelpers.js:43`                           |
| leave date | `MMM D, YYYY` (e.g. `Jun 5, 2024`) | Angular `date` pipe default, `leaves-list.component.html:37` |
| month      | `MMM YYYY`                         | `src/components/MonthPicker.js:20`                           |

Slovak variants: NFR-L10N-01. Values sent to the server stay ISO-8601 and `YYYY-MM`.

**Acceptance criteria**:

- Given a logged-in user, when they open each old URL from the Constraints list directly, then the matching page renders (no 404, no blank page).
- Given `/`, then the browser ends on `/trips`. Given `/leaves/`, then it ends on `/leaves/list`.
- Given a non-admin user, then the nav shows Trips, Places, Export, Leaves, Leaves export, and not Users, Leaves approval or Audit log.
- Given an admin and 3 PENDING leaves, then "Leaves approval" shows badge `3`; given 0 PENDING, no badge.
- Given a logged-out visitor at `/trips`, then the page shows "You are not authorized to view this page!" and the nav shows "Login".
- Given a logged-out visitor at `/leaves/approval`, then the login page shows at that URL, and after successful login the approval page shows.
- Given a stored JWT, then every GraphQL request carries `Authorization: Bearer <jwt>`; given none, no `Authorization` header is sent.
- Given a GraphQL network error, when the user clicks retry, then the query re-runs and the page renders without reload.
- Given `VITE_MIGRATION_STEP=1`, when the user clicks "Trips", then the browser performs a full page load of `/trips`.

**Tests**:

- Unit: route table resolves every old URL; nav visibility per role (anon, user, admin) and per migration step; date helpers with fixed dates (`2024-06-05T08:30` → `5. 6. 2024 8:30`, `5. 6. 2024`, `Jun 5, 2024`, `Jun 2024`); auth link header present/absent.
- Integration (component level with mocked GraphQL): pending badge count; QueryState loading/error/retry.
- End-to-end: deep-link each old URL as user and admin; logged-out behavior on a React-origin URL and a `/leaves/*` URL; nav click-through.

#### SETUP-03 — Kubernetes deployment

- **Type**: derived
- **Source**: Derived from `(rewrite spec: Target tech stack › Delivery and operations)` — "Same MicroK8s / Contabo"; "Docker image(s) pushed to `registry.instea.co`". Platform: "host nginx with TLS → ingress-nginx class `public` → service" `(rewrite spec: Target tech stack)`.
- **Depends on**: SETUP-01, SETUP-02, OPS-01, OPS-02, MIG-01, NFR-SEC-03

**Goal**: Package the new app as container image(s) and run it on the existing MicroK8s cluster with a Deployment, Service, Ingress (class `public`), Secrets, health probes and a MongoDB 8 instance for the new database. Manifests live in the repo.

**Old behavior**:

- One multi-stage Dockerfile: `node:8` builder builds Angular (`yarn build` → `ng build --aot --env=prod && updateDist`) and React (build args `REACT_APP_HOSTED_DOMAIN`, `REACT_APP_CLIENT_ID`); runtime `node:12.22-slim`, `EXPOSE 4100`, `CMD ["node", "server/index.js"]`, `VOLUME /opt/app/secrets/` (`Dockerfile:1-42`). The runtime image also copies `src/` because the server imports `src/data` (`Dockerfile:36-37`).
- `.dockerignore` excludes `.git`, `node_modules`, `build`, `secrets/`, `README.md`.
- No k8s manifests in the repo. Production is k8s and Jenkins is inactive _(client answer: A7)_. Connection code comments assume k8s restarts the pod (`server/db/connect.js:17,30`).
- PM2 notes: 1 instance, `max_memory_restart: '250M'` (`PM2.md:12-15`).
- Generated exports are written to the pod's local `server/download` and served from there (`server/index.js:26-34`), so a second replica would 404 on downloads created by the first.

**Constraints**:

- Current production routing (cluster state recorded 2026-10-07, not in the repo): host nginx (certbot TLS, `/etc/nginx/conf.d/cestaky.conf`) → ingress-nginx class `public` → Ingress `cestaky-ingress` with path `/cestaky/?(.*)` and rewrite → `cestaky-service` → `cestaky-deployment` in namespace `default`; image `registry.instea.co/cestovne-prikazy:<version>`, pull secret `instea-registry`, readiness probe `/health-check`. The manifest lives on the server at `~/kubernetes-demos/02-contabo/cestaky/cestaky.yml`. New Ingress rules (MIG-02, MIG-03) must use the same host-nginx path scheme: the external paths in MIG-02 are seen by ingress-nginx under the `/cestaky` prefix. Set `spec.ingressClassName: public`; without it the Ingress returns 404. Verify the host nginx config before go-live.
- Images pushed to `registry.instea.co` (NFR-MNT-01 builds and pushes them).
- Ingress class `public`; TLS terminates at the host nginx in front of ingress-nginx.
- Same JWT signing key as the old app _(client answer: S4; BRIEF resolved decisions)_.
- Old app keeps running beside the new one until MIG-05.

**Images**:

- Server image: Node 22 LTS slim base, multi-stage build (install with frozen lockfile → typecheck/build → prune dev dependencies). Runs as a non-root user. `EXPOSE 4100`. Entry: start the NestJS app. A second entry point (same image) runs CLI commands: promote user (Auth area), copy tool (MIG-01), anonymizer (ENV-02).
- SPA: served by the server (SPA build copied into the server image under `SPA_DIST_DIR`) or by its own container (e.g. static web server image). (interview: suggested answer accepted) Suggested answer: one image, server serves the SPA — same-origin routing stays as today, one Deployment, fewer ingress rules during migration.
- Image names (interview: suggested answer accepted): suggest `registry.instea.co/cestaky-next` (old image name was `cestaky:master`, `Jenkinsfile:10`).

**Kubernetes objects** (namespace: the one the old app runs in, `default` per current prod; interview: suggested answer accepted):

| Object                      | Name (proposed)       | Key settings                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deployment                  | `cestaky-next`        | replicas 1; strategy `Recreate` (local `/download` files, see TWE-01); container port 4100; env from Secret `cestaky-next-env` and ConfigMap `cestaky-next-config`; JWT key Secret mounted read-only as a file at the path in `JWT_KEY_FILE`; `emptyDir` volume at `DOWNLOAD_DIR` (or the storage TWE-01 decides); resources requests 128Mi/100m, limits 512Mi (interview: suggested answer accepted); `terminationGracePeriodSeconds: 30`; `imagePullSecrets` for `registry.instea.co` |
| Service                     | `cestaky-next`        | ClusterIP, port 80 → 4100                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Ingress                     | `cestaky-next`        | `ingressClassName: public`; host = current production host (interview: suggested answer accepted); paths per migration step (MIG-02, MIG-03); body size large enough for GraphQL/export JSON (default is fine)                                                                                                                                                                                                                                                                          |
| Secret                      | `cestaky-jwt-key`     | key file content; the SAME secret (or same content) is mounted by the old Deployment at `/opt/app/secrets/key.pem`                                                                                                                                                                                                                                                                                                                                                                      |
| Secret                      | `cestaky-next-env`    | `MONGO_URL`, `OLD_MONGO_URL`, `SMTP_USER`, `SMTP_PASSWORD`, `SSO_USERNAME`, `SSO_PASSWORD`, `M2M_USERNAME`, `M2M_PASSWORD`, `FX_API_KEY`, `CLIENT_ID`                                                                                                                                                                                                                                                                                                                                   |
| ConfigMap                   | `cestaky-next-config` | all non-secret variables from SETUP-01                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| StatefulSet + Service + PVC | `mongo8`              | MongoDB 8, 1 replica, auth enabled, PVC on the cluster's storage class (MicroK8s hostpath), ClusterIP only, not exposed via ingress                                                                                                                                                                                                                                                                                                                                                     |

**Probes** (OPS-01 endpoint):

- readiness: `GET /health-check`, period 10 s, timeout 3 s, failure threshold 3.
- liveness: `GET /health-check`, initial delay 20 s, period 20 s, timeout 3 s, failure threshold 3.
- (interview: suggested answer accepted) on numbers; the endpoint returns 500 when Mongo fails, and OPS-02 exits the process on disconnect anyway.

**MongoDB 8 location**: (interview: suggested answer accepted; verify before go-live) Where the new MongoDB 8 runs is not specified. Suggested answer: StatefulSet in the same MicroK8s cluster as above, with a nightly `mongodump` backup to host storage. Where the old MongoDB 3.6 runs is also unknown (old Deployment's `MONGO_URL`); the new pod must reach it during migration (MIG-01).

**Forwarded headers**: the URL builder (NFR-SEC-03) needs the original scheme. The host nginx must send `X-Forwarded-Proto https` and ingress-nginx must be configured to pass it through (`use-forwarded-headers`) instead of overwriting it with `http`. (interview: suggested answer accepted; verify before go-live — verify on the cluster.)

**Acceptance criteria**:

- Given the manifests, when applied to an empty namespace with the secrets, then the pod becomes Ready and `/health-check` returns 200.
- Given MongoDB 8 is stopped, then readiness fails within 30 s and the pod restarts (OPS-02).
- Given a JWT issued by the old app, when sent to the new app, then the new app accepts it (same key file).
- Given the container, then it runs as non-root and the filesystem holds no secret files except the mounted key.

**Tests**:

- Integration: CI builds the image and runs it with docker against MongoDB 8 and checks `/health-check` 200 and SPA `index.html` served.
- Manifest validation in CI (schema lint of the k8s YAML).
- End-to-end: covered by the local rehearsal (MIG-02, MIG-03).

---

## 4. Traceability

### Rewrite spec items

| Section                                                   | Item                                                                                                                                                                                      | Tasks                                                             |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Features by area › Auth and session                       | User signs in with Google; server verifies the ID token against `CLIENT_ID`.                                                                                                              | AUTH-01                                                           |
| Features by area › Auth and session                       | Login returns WRONG_DOMAIN and creates no user when `HOSTED_DOMAIN` is set and the token domain differs.                                                                                  | AUTH-01                                                           |
| Features by area › Auth and session                       | First login of an unknown email auto-creates an unapproved, non-admin user (id = Google `sub`, names from token) and returns NEED_APPROVAL.                                               | AUTH-01                                                           |
| Features by area › Auth and session                       | Unapproved user gets NEED_APPROVAL; approved user gets SUCCESS and a 1-hour JWT.                                                                                                          | AUTH-01                                                           |
| Features by area › Auth and session                       | Failed token verification returns FAILED.                                                                                                                                                 | AUTH-01                                                           |
| Features by area › Auth and session                       | Login page shows "Login failed. Try again later.", "Used email does not belong to given hosted domain." or "Account needs to be approved by admin first.".                                | AUTH-02                                                           |
| Features by area › Auth and session                       | JWT is kept in browser `localStorage`; app auto-logs-in on reload and logs out if the user info call returns nothing.                                                                     | AUTH-04                                                           |
| Features by area › Auth and session                       | JWT is refreshed every 15 minutes via `POST /refresh-jwt`.                                                                                                                                | AUTH-04, AUTH-05                                                  |
| Features by area › Auth and session                       | Logout removes the JWT and resets the client cache.                                                                                                                                       | AUTH-04                                                           |
| Features by area › Auth and session                       | CLI command promotes a user (by email) to admin and approved.                                                                                                                             | AUTH-06                                                           |
| Features by area › Auth and session                       | **[CHANGE]** Refreshed JWT is always stored, the refresh timer runs after a fresh login too, and an expired stored JWT sends the user to login.                                           | AUTH-04                                                           |
| Features by area › Auth and session                       | **[CHANGE]** Auth middleware never hangs a request on unexpected errors.                                                                                                                  | AUTH-03                                                           |
| Features by area › Auth and session                       | **[CHANGE]** Client data loading recovers after an API error without a page reload.                                                                                                       | AUTH-07                                                           |
| Features by area › Auth and session                       | **[PRESERVED BUG]** `/refresh-jwt` issues a new token for expired or invalid tokens without checking the user or approval.                                                                | AUTH-05                                                           |
| Features by area › Auth and session                       | **[PRESERVED BUG]** Invalid JWT is treated as anonymous; approval is not re-checked per request; denied calls return `null` (HTTP 200), not 401.                                          | AUTH-03                                                           |
| Features by area › Users                                  | Admin lists users: Email, Name (`surname[, firstName][, degrees]`), Is admin, Is approved.                                                                                                | USR-01                                                            |
| Features by area › Users                                  | Admin approves an unapproved user, who can then log in.                                                                                                                                   | USR-02                                                            |
| Features by area › Users                                  | Admin edits and removes users.                                                                                                                                                            | USR-03                                                            |
| Features by area › Users                                  | User edits own profile (first name, surname, degrees, address); email and approved are read-only; "Is admin" is hidden for non-admins.                                                    | USR-04                                                            |
| Features by area › Users                                  | Trips and leaves of a deleted user show placeholder "Deleted" / id / `<id>@deleted.instea.co`.                                                                                            | USR-05                                                            |
| Features by area › Users                                  | **[CHANGE]** Regular users can read only their own user record; admin reads all.                                                                                                          | USR-01                                                            |
| Features by area › Users                                  | **[PRESERVED BUG]** Any user can update any user's email, approved flag and names via `updateUser`; only `isAdmin` is protected.                                                          | USR-03                                                            |
| Features by area › Users                                  | **[PRESERVED BUG]** User edit page has an empty header, and after save a non-admin lands on `/users` and sees "You are not authorized to view this page!".                                | USR-04                                                            |
| Features by area › Trips                                  | User sees the trips table: Who, Destination, When (`D. M. YYYY[ - D. M. YYYY]`), Controls; sorted by departure ascending.                                                                 | TRIP-01                                                           |
| Features by area › Trips                                  | **[CHANGE]** Regular user sees only own trips; admin sees all.                                                                                                                            | TRIP-01                                                           |
| Features by area › Trips                                  | User adds a trip: Who, Where, departure, arrival, purpose, travel type (O, R, A, L, DZ, AUS, AUV, MOS, MOV), price; defaults yesterday 08:00–17:00, type O.                               | TRIP-02                                                           |
| Features by area › Trips                                  | **[CHANGE]** Non-admin can add a trip in the UI.                                                                                                                                          | TRIP-02                                                           |
| Features by area › Trips                                  | **[CHANGE]** Trip owner or admin can edit and remove a trip; the server checks the trip owner.                                                                                            | TRIP-03, TRIP-04                                                  |
| Features by area › Trips                                  | **[CHANGE]** UI shows an error when a trip save is denied, instead of navigating as if saved.                                                                                             | TRIP-03                                                           |
| Features by area › Trips                                  | Owner or admin removes a trip without confirmation.                                                                                                                                       | TRIP-04                                                           |
| Features by area › Trips                                  | Owner or admin duplicates a trip: new departure, arrival keeps the original duration, other fields copied.                                                                                | TRIP-05                                                           |
| Features by area › Trips                                  | **[PRESERVED BUG]** Server accepts any `userId` on trip create (user can create trips for others).                                                                                        | TRIP-02                                                           |
| Features by area › Trips                                  | **[PRESERVED BUG]** Arrival-after-departure is not validated on client or server.                                                                                                         | TRIP-02                                                           |
| Features by area › Places                                 | User lists places: Name, Destination name, Origin name, Travel duration (`2h 30m`).                                                                                                       | PLC-01                                                            |
| Features by area › Places                                 | Admin adds, edits and removes places: name, destination name, origin name, travel duration (slider 0–1440 min, step 15, stored as ISO-8601), country (243 ISO codes, default SK).         | PLC-02                                                            |
| Features by area › Places                                 | Non-admin sees a read-only list; add/edit pages show "You are not authorized to view this page!".                                                                                         | PLC-01, PLC-02                                                    |
| Features by area › Travel-warrant export                  | User picks a person and a month (years 2017..current) and generates a travel-warrant xlsx, then downloads it.                                                                             | TWE-01                                                            |
| Features by area › Travel-warrant export                  | Non-admin person picker shows only the user.                                                                                                                                              | TWE-01                                                            |
| Features by area › Travel-warrant export                  | Template is chosen by trips departing in the month: 0–9 → `upto19`, 10–15 → `upto31`.                                                                                                     | TWE-02                                                            |
| Features by area › Travel-warrant export                  | Template is filled with name/degrees/address and per-trip left rows and right 4-row blocks (dates, origin/destination, times ± travel duration, travel type, price, diet).                | TWE-03                                                            |
| Features by area › Travel-warrant export                  | Per-diem by country and whole-trip hours: SK 4.5 / 6.7 / 10.3 €; foreign 25 / 50 / 100 % of tariff; unknown country 0.                                                                    | TWE-04                                                            |
| Features by area › Travel-warrant export                  | Non-EUR diet tariffs are converted to EUR via an exchange-rate source (source: open question S1).                                                                                         | TWE-05                                                            |
| Features by area › Travel-warrant export                  | Cached formula values are stripped so Excel recalculates totals.                                                                                                                          | TWE-03                                                            |
| Features by area › Travel-warrant export                  | **[PRESERVED BUG]** 16 or more trips in a month fail with HTTP 500 / "Problem preparing file".                                                                                            | TWE-02                                                            |
| Features by area › Travel-warrant export                  | **[PRESERVED BUG]** SK trips under 5 h get 6.7 €; multi-day trips are not split per day.                                                                                                  | TWE-04                                                            |
| Features by area › Travel-warrant export                  | **[PRESERVED BUG]** Origin "Bratislava" is hardcoded; `upto31` totals sum only `R7:R44`; approver name is static template text.                                                           | TWE-03                                                            |
| Features by area › Travel-warrant export                  | **[PRESERVED BUG]** Server accepts any `userId` for export; generated files are public under `/download` with random names and never deleted.                                             | TWE-01                                                            |
| Features by area › Leaves                                 | **[CHANGE]** Regular user sees only own leaves in list and calendar; admin sees all.                                                                                                      | LV-01                                                             |
| Features by area › Leaves                                 | User lists leaves: Requester, Days (`start - end (N work days)`, `?` if unknown), Type, State, Approver, Delete.                                                                          | LV-01                                                             |
| Features by area › Leaves                                 | User filters leaves by requester, month and year (leaves split into per-year segments) and clears the filter.                                                                             | LV-02                                                             |
| Features by area › Leaves                                 | User switches to a calendar of non-rejected leaves: color per requester (15-color round robin), pending at half opacity, title `First Surname [1/2 ](T)`.                                 | LV-03                                                             |
| Features by area › Leaves                                 | User adds a leave: type (ANNUAL, SICKNESS, DOCTOR, MATERNITY, PARENTAL, CARING; default ANNUAL), start (default today), end (follows start until edited), half-day; work days shown.      | LV-04                                                             |
| Features by area › Leaves                                 | Work days = weekdays that are not SK public holidays; half-day subtracts 0.5.                                                                                                             | LV-05                                                             |
| Features by area › Leaves                                 | Add form shows "Start date must not be greater than end date" and "Half day option is allowed only within single day".                                                                    | LV-04                                                             |
| Features by area › Leaves                                 | Server creates the leave as PENDING with requester = caller and emails the approver.                                                                                                      | LV-06                                                             |
| Features by area › Leaves                                 | Requester or admin deletes a leave in any state, without confirmation.                                                                                                                    | LV-07                                                             |
| Features by area › Leaves                                 | **[PRESERVED BUG]** Delete button shows on every row and silently fails for others' leaves.                                                                                               | LV-07                                                             |
| Features by area › Leaves                                 | **[PRESERVED BUG]** Server does not validate leave dates, half-day rule or overlaps and trusts client `numDays`.                                                                          | LV-06                                                             |
| Features by area › Leaves                                 | **[PRESERVED BUG]** Half-day subtracts 0.5 for any range length.                                                                                                                          | LV-05                                                             |
| Features by area › Leaves                                 | **[PRESERVED BUG]** "Add leave" may be always disabled (Angular group-validator bug); runtime behavior is unverified, see open questions S2 and A2.                                       | LV-04                                                             |
| Features by area › Leave approval                         | Admin sees pending leaves and approves or rejects them; approver is set and the row disappears.                                                                                           | APR-01                                                            |
| Features by area › Leave approval                         | Admin nav shows a badge with the pending-leave count.                                                                                                                                     | APR-02                                                            |
| Features by area › Leave approval                         | **[PRESERVED BUG]** Approval page is reachable by non-admins (clicks silently fail); leaves can be re-approved or re-rejected in any state; no email on decision.                         | APR-01                                                            |
| Features by area › Leave summary                          | User sees own leaves per year (descending), per type, with total work days; leaves crossing a year are clipped.                                                                           | SUM-01                                                            |
| Features by area › Leave summary                          | **[PRESERVED BUG]** Summary counts PENDING and REJECTED leaves.                                                                                                                           | SUM-01                                                            |
| Features by area › Detail export (meal vouchers)          | User picks a person (all users listed) and a month and downloads an xlsx: name, month, trips count, leaves count, expected meal vouchers, trip days, leave days, leave types, "HALF DAY". | DET-01                                                            |
| Features by area › Detail export (meal vouchers)          | Working day = not SK holiday and not weekend; trip and leave days are unique sorted working days.                                                                                         | DET-02                                                            |
| Features by area › Detail export (meal vouchers)          | Expected meal vouchers = month working days − trip days − leave days + half days.                                                                                                         | DET-02                                                            |
| Features by area › Detail export (meal vouchers)          | **[PRESERVED BUG]** PENDING and REJECTED leaves are counted; month working days include the 1st of the next month.                                                                        | DET-02                                                            |
| Features by area › Detail export (meal vouchers)          | **[PRESERVED BUG]** Server accepts any `userId` for export.                                                                                                                               | TWE-01, DET-01                                                    |
| Features by area › Attendance API (M2M)                   | M2M client calls `GET /api/attendence/:year/:month` with Basic auth; 401 when credentials are wrong or unset.                                                                             | ATT-01                                                            |
| Features by area › Attendance API (M2M)                   | Response lists SSO users with a Toggl id; only `employee === '1'` get daily hours, leave codes and total, plus `contractType`.                                                            | ATT-02                                                            |
| Features by area › Attendance API (M2M)                   | Hours come from Toggl Reports v3 per user token, paginated with a 500 ms pause.                                                                                                           | ATT-02                                                            |
| Features by area › Attendance API (M2M)                   | APPROVED leaves on working days map to codes D8 / D4 (half day) / PN / L / I, joined with ", ".                                                                                           | ATT-03                                                            |
| Features by area › Attendance API (M2M)                   | Errors: 400 "Month is not a number." / "Year is not a number."; 500 "Cannot get data from SSO, try again later." / "Cannot get data from Toggl, try again later.".                        | ATT-01                                                            |
| Features by area › Attendance API (M2M)                   | Dates use `DEFAULT_TIMEZONE` (default `Europe/Bratislava`).                                                                                                                               | ATT-01                                                            |
| Features by area › Attendance API (M2M)                   | **[PRESERVED BUG]** Request crashes on an employee without `togglUserId` or an unknown Toggl user; duplicate SSO names overwrite each other.                                              | ATT-02                                                            |
| Features by area › Notifications                          | New leave sends "New leave notification" email to `APPROVAL_MAIL_RECEIVER`: requester, dates, type, "Approve" link to the approval page.                                                  | NTF-01                                                            |
| Features by area › Notifications                          | Missing SMTP settings only log, they do not fail leave creation.                                                                                                                          | NTF-01                                                            |
| Features by area › Notifications                          | **[PRESERVED BUG]** User names are not HTML-escaped in the email.                                                                                                                         | NTF-01                                                            |
| Features by area › Operations                             | `/health-check` pings Mongo: 200 `{checkMongo:'ok'}` or 500 with the error.                                                                                                               | OPS-01                                                            |
| Features by area › Operations                             | Process exits on Mongo connect failure or disconnect, so Kubernetes restarts the pod.                                                                                                     | OPS-02                                                            |
| Features by area › Operations                             | **[PRESERVED BUG]** GraphiQL is public and CORS allows all origins.                                                                                                                       | OPS-03                                                            |
| Features by area › Data and validation                    | Data model: Place, User, Trip, Leave with app-level `id` (UUID or Google `sub`) and indexes as today.                                                                                     | DATA-01                                                           |
| Features by area › Data and validation                    | **[PRESERVED BUG]** Server enforces no required fields beyond GraphQL non-null inputs.                                                                                                    | DATA-01                                                           |
| User decisions › Testing                                  | Every feature has automated tests; humans and AI agents both write code, so tests are mandatory and a coverage gate runs in CI.                                                           | TST-01                                                            |
| User decisions › Testing                                  | Tests are written only in the new app, from the analysis acceptance criteria and worked examples; no golden comparison with the old system.                                               | TST-01                                                            |
| User decisions › Testing                                  | Unit tests cover all business rules: per-diem, template choice, template filling, work days, meal vouchers, leave filter, calendar colors, summary, attendance codes.                     | TST-01                                                            |
| User decisions › Testing                                  | Integration tests cover every GraphQL operation and REST endpoint, including the permission matrix and the preserved bugs.                                                                | TST-01                                                            |
| User decisions › Testing                                  | End-to-end tests cover the main screens: login, trips, places, users, both exports, leaves list/calendar/add/approval/summary.                                                            | TST-01                                                            |
| User decisions › Testing                                  | Contract tests freeze the attendance API: JSON shape, status codes, error messages, attendance codes.                                                                                     | TST-02                                                            |
| User decisions › Testing                                  | External integrations are replaced in tests by fakes kept in the repo: mail catcher, SSO stub, Toggl stub, fake Google token issuer, mocked exchange rates.                               | TST-03                                                            |
| User decisions › Environments                             | Local docker-compose runs the full stack with integration fakes; no hosted staging environment.                                                                                           | ENV-01                                                            |
| User decisions › Environments                             | Script creates an anonymized copy of production MongoDB (names, emails, addresses) for local testing and migration rehearsal.                                                             | ENV-02                                                            |
| User decisions › Environments                             | AI agents work with code and the local docker-compose environment (fakes, anonymized data); no production access.                                                                         | ENV-01                                                            |
| User decisions › Integrations                             | Integration reference document for Google Identity, SSO directory, Toggl Reports v3, SMTP, exchange-rate source and the M2M consumer: endpoints, auth, fields, error behavior.            | DOC-01                                                            |
| User decisions › Scope                                    | Security bugs are preserved 1:1.                                                                                                                                                          | AUTH-03, AUTH-05, USR-03, TRIP-02, TWE-01, DET-01, OPS-03, NTF-01 |
| User decisions › Scope                                    | Business-rule quirks are preserved 1:1.                                                                                                                                                   | TWE-03, TWE-04, LV-05                                             |
| User decisions › Scope                                    | Export over 15 trips and leave validation/state bugs are preserved 1:1.                                                                                                                   | TWE-02                                                            |
| User decisions › Scope                                    | Trip permission bugs and session/refresh bugs are fixed.                                                                                                                                  | TRIP-02, TRIP-03, AUTH-03, AUTH-04, AUTH-07                       |
| User decisions › Scope                                    | Regular users see only their own trips, leaves and user record; admin sees all.                                                                                                           | NFR-PRV-04                                                        |
| User decisions › Scope                                    | The two SPAs become one React SPA; the GraphQL + REST contract stays the same.                                                                                                            | SETUP-02                                                          |
| User decisions › Documentation                            | Business rules document (diets, meal vouchers, work days, attendance codes, leave filter), validated by the domain expert.                                                                | DOC-02                                                            |
| User decisions › Migration strategy                       | Migration goes module by module; cutover can happen at any time in the month.                                                                                                             | MIG-01                                                            |
| User decisions › Migration strategy                       | Step 1, Leaves: new SPA leave screens and leave API go live; ingress routes `/leaves/` to the new app; the old app still serves Trips.                                                    | MIG-02                                                            |
| User decisions › Migration strategy                       | Step 2, Trips, Places, Users, travel-warrant and detail exports: new screens and API go live; ingress routes `/` to the new app.                                                          | MIG-03                                                            |
| User decisions › Migration strategy                       | Step 3, Attendance API: `/api/attendence` moves to the new server after its contract tests pass.                                                                                          | MIG-02                                                            |
| User decisions › Migration strategy                       | Old and new app share one MongoDB and one JWT signing key during the transition, so a session works across both.                                                                          | AUTH-03, MIG-01                                                   |
| User decisions › Migration strategy                       | Each step is rehearsed locally on the anonymized prod copy before go-live.                                                                                                                | MIG-02, MIG-03                                                    |
| User decisions › Migration strategy                       | Rollback per step: route the ingress path back to the old deployment.                                                                                                                     | MIG-04                                                            |
| User decisions › Migration strategy                       | MongoDB 3.6 is upgraded to MongoDB 8; the timing relative to the shared-database period is open (see S4).                                                                                 | MIG-01                                                            |
| User decisions › Migration strategy                       | Final step: remove the old deployment and turn off the Jenkins job.                                                                                                                       | MIG-05                                                            |
| Non-functional requirements › Security                    | CI scans dependencies and the container image for known vulnerabilities.                                                                                                                  | NFR-SEC-01                                                        |
| Non-functional requirements › Security                    | Server sends standard security headers on all responses.                                                                                                                                  | NFR-SEC-02                                                        |
| Non-functional requirements › Security                    | Export download URLs use the request scheme (HTTPS), not hardcoded `http://`.                                                                                                             | TWE-01, NFR-SEC-03                                                |
| Non-functional requirements › Data privacy and compliance | Audit log records leave approve/reject/delete and user edit/approve/remove: who, when, which record.                                                                                      | NFR-PRV-01                                                        |
| Non-functional requirements › Data privacy and compliance | Admin can export all personal data of one user.                                                                                                                                           | NFR-PRV-02                                                        |
| Non-functional requirements › Data privacy and compliance | Admin can erase one user's personal data.                                                                                                                                                 | NFR-PRV-03                                                        |
| Non-functional requirements › Data privacy and compliance | Regular users see only their own data (see Scope).                                                                                                                                        | NFR-PRV-04                                                        |
| Non-functional requirements › Maintainability             | CI runs on every PR: lint, typecheck, tests, coverage gate, image build and push to `registry.instea.co`; replaces Jenkins.                                                               | NFR-MNT-01                                                        |
| Non-functional requirements › Maintainability             | Shared types package for enums and data used by server and SPA (travel types, leave types/states, login results, countries, diet tariffs); no "keep in sync" copies.                      | NFR-MNT-02                                                        |
| Non-functional requirements › Maintainability             | Developer docs: README with local setup, architecture decision records.                                                                                                                   | NFR-MNT-03                                                        |
| Non-functional requirements › Localization                | SPA uses an i18n framework with Slovak and English translations and a language switch.                                                                                                    | NFR-L10N-01                                                       |

### Client answers and interview decisions

| Question  | Decision                                                                                                                                                                                                                                                                                                                | Tasks                                                                                     |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| S1        | Exchange-rate source: keep the old provider (Open Exchange Rates); live rates with cache (interview: FX rates)                                                                                                                                                                                                          | TWE-05, TST-03, DOC-01                                                                    |
| S2        | Enable valid leave creation                                                                                                                                                                                                                                                                                             | LV-04                                                                                     |
| S3        | Libraries not named are picked by Instea during implementation                                                                                                                                                                                                                                                          | SETUP-01, SETUP-02, NFR-MNT-03                                                            |
| S4        | Module by module with two separate databases; copy + second connection to old DB; attendance API and detail export move in step 1 (interview: Two DBs); reverse-copy rollback, 4-week window (interview: Rollback); MongoDB 8 as StatefulSet (interview: MongoDB 8); /v2 API prefix in step 1 (interview: Step-1 route) | MIG-01, MIG-02, MIG-03, MIG-04, MIG-05, SETUP-03, OPS-01, OPS-02, ENV-01, ENV-02          |
| S5        | Export IDOR and public /download stay as is                                                                                                                                                                                                                                                                             | TWE-01, DET-01                                                                            |
| S6        | Old URLs keep working                                                                                                                                                                                                                                                                                                   | SETUP-02, NTF-01, MIG-02, MIG-03                                                          |
| S7        | xlsx exports and emails English only                                                                                                                                                                                                                                                                                    | NFR-L10N-01, NTF-01, TWE-03, DET-01                                                       |
| S8        | Audit log only for admins; admin screen, kept forever (interview: Audit log)                                                                                                                                                                                                                                            | NFR-PRV-01                                                                                |
| S9        | Erasure deletes the user's trips and leaves; self-erasure refused, audit kept (interview: Erasure)                                                                                                                                                                                                                      | NFR-PRV-03                                                                                |
| A2        | Add-leave form works in production                                                                                                                                                                                                                                                                                      | LV-04                                                                                     |
| A4        | Only approved leaves count; detail export month excludes 1st of next month (interview: Leave count)                                                                                                                                                                                                                     | SUM-01, DET-02                                                                            |
| A6        | Currency-converter API believed alive                                                                                                                                                                                                                                                                                   | TWE-05                                                                                    |
| A7        | k8s is current; Jenkins inactive                                                                                                                                                                                                                                                                                        | SETUP-03, NFR-MNT-01, MIG-05                                                              |
| A9        | UI default language English                                                                                                                                                                                                                                                                                             | NFR-L10N-01                                                                               |
| A10       | "Yes" overridden: regular users see only own data (interview: Visibility)                                                                                                                                                                                                                                               | NFR-PRV-04, TRIP-01, LV-01, USR-01                                                        |
| Gap round | Pickers only self; nested user fields unfiltered; exports use DEFAULT_TIMEZONE; SK holidays follow current law; JSON personal-data export; CI gates 80/70 %, fail high+; all other suggested answers accepted                                                                                                           | NFR-PRV-04, USR-01, DET-01, TWE-01, TWE-03, DET-02, LV-05, NFR-PRV-02, TST-01, NFR-SEC-01 |

Questions marked Not relevant by the client (A1, A3, A5, A8, A11) add no work; the spec lines they refer to stand.
