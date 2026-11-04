# Cestovné príkazy (Trips & Leaves) — Rewrite Specification

|                           |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Project                   | Cestovné príkazy ("Cestaky"): business trips, travel-warrant export, leaves, attendance API                                                                                                                                                                                                                                                                                                                                                                                               |
| Created                   | 2026-10-29                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Source technical analysis | `docs/tech-rewrite/PROJECT_INITIAL_ANALYSIS.md` (branch `master`, commit `b94e05064f6db00dd935384def27eb144aa2d2b6` / `b94e050`)                                                                                                                                                                                                                                                                                                                                                          |
| Client assessment         | "Rewrite Project – Analysis": 9 factors (Tests: None / High; Integration testability: None / High; Environments: Prod only / Medium; Integrations: Known but undocumented / Medium; Documentation: Partial / Low; AI agent access: Code only / Low; Rewrite goal: 1:1 rewrite + defined changes / Low; Technology: Outdated but supported / Low; Knowledge holders: Domain expert available / No issue) and 4 NFRs (Security, Data privacy and compliance, Maintainability, Localization) |
| Rewrite goal              | 1:1 rewrite + defined changes. Every old behavior is a feature. Known bugs are preserved unless listed as **[CHANGE]**. Preserved bugs are marked **[PRESERVED BUG]**.                                                                                                                                                                                                                                                                                                                    |

Legend: **[CHANGE]** = defined change from the interview; **[PRESERVED BUG]** = known bug kept for 1:1 parity. Sources: `analysis:` = technical analysis section, `interview:` = Instea interview answer, `input NFR:` = client NFR.

---

## 1. Target tech stack

Platform: same MicroK8s cluster on the Contabo server (host nginx with TLS → ingress-nginx class `public` → service). Image published to `registry.instea.co`. _(interview: Platform)_

### Server (NestJS API)

| Layer                                                                       | Current (analysis)                                                                                                                                         | Target                                                            | Source                                  |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------- |
| Runtime                                                                     | Node 8 (build) / Node 12.22-slim (runtime)                                                                                                                 | Node 22 LTS                                                       | (interview: Target tech stack › Server) |
| Language                                                                    | JavaScript                                                                                                                                                 | TypeScript                                                        | (interview: Target tech stack › Server) |
| Framework                                                                   | Express 4.16.2 / 4.17.1                                                                                                                                    | NestJS 11                                                         | (interview: Target tech stack › Server) |
| API                                                                         | express-graphql 0.6.11 / graphql 0.10.5 + REST (`/refresh-jwt`, `/export/*`, `/api/attendence`, `/health-check`)                                           | NestJS GraphQL module + REST, same operations and shapes as today | (interview: API style)                  |
| ODM                                                                         | Mongoose 4.13.5                                                                                                                                            | Mongoose 8                                                        | (interview: Target tech stack › Server) |
| Database                                                                    | MongoDB 3.6                                                                                                                                                | MongoDB 8                                                         | (interview: Database)                   |
| Key libraries (xlsx, mail, Google auth/JWT, dates/holidays, test framework) | exceljs 1.6.0, nodemailer 6.3.0, google-auth-library 4.2.5, express-jwt 5.3.0 / jwt-node 0.1.9, moment / moment-timezone, date-holidays 1.2.0, jest 24.7.1 | Not decided, see open question S3                                 | (interview: not asked)                  |

### Frontend (one React SPA, merges React "Trips" and Angular "Leaves")

| Layer                  | Current (analysis)                                                                                                       | Target                             | Source                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- | ----------------------------------------- |
| Apps                   | React SPA at `/` (Trips, Places, Users, Export) + Angular SPA at `/leaves/` (Leaves)                                     | One React SPA covering all screens | (interview: Target tech stack › Frontend) |
| Language               | JavaScript (React), TypeScript 2.3.4 (Angular)                                                                           | TypeScript                         | (interview: Target tech stack › Frontend) |
| Framework / build      | React 16.8.0 + CRA 3.0.1; Angular 4.4.6 + CLI 1.5.5                                                                      | React 19 + Vite                    | (interview: Target tech stack › Frontend) |
| GraphQL client         | apollo-client 1.9.3 / react-apollo 1.4.16; apollo-angular 1.0.0 / apollo-client 2.0.4                                    | Apollo Client 3                    | (interview: Target tech stack › Frontend) |
| Routing                | react-router-redux 5.0.0-alpha.8; Angular router 4.4.6                                                                   | React Router 7                     | (interview: Target tech stack › Frontend) |
| Calendar               | fullcalendar 3.7.0 / ng-fullcalendar 1.1.0                                                                               | FullCalendar 6                     | (interview: Target tech stack › Frontend) |
| State / forms / UI kit | redux 3.7.2, redux-form 6.8.0, react-bootstrap 0.31.5 + Bootstrap 3.3.2; ngrx 2.x, primeng 4.3.0, Bootstrap 4.0.0-beta.2 | Not decided, see open question S3  | (interview: not asked)                    |
| i18n                   | None (English UI)                                                                                                        | i18n with Slovak + English         | (interview: Localization)                 |

### Delivery and operations

| Layer             | Current (analysis)                                                                      | Target                                                                                                            | Source                       |
| ----------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Hosting           | Unclear in repo: Jenkins `docker-compose`, PM2 notes, k8s hints                         | Same MicroK8s / Contabo                                                                                           | (interview: Platform)        |
| Artifact          | One Docker image (`node:8` builder, `node:12.22-slim` runtime), server serves both SPAs | Docker image(s) pushed to `registry.instea.co`                                                                    | (interview: Platform)        |
| CI/CD             | Jenkins: `bin/test.sh` → `docker build` → `docker-compose up -d`; husky hooks           | CI pipeline on every PR: lint, typecheck, tests, coverage gate, image build and push. CI tool not decided, see S3 | (interview: Maintainability) |
| Local environment | `db/docker-compose.yml` with `mongo:3.6` only                                           | docker-compose with the full stack and integration fakes                                                          | (interview: Environments)    |

---

## 2. Features by area

### Auth and session

- User signs in with Google; server verifies the ID token against `CLIENT_ID`. _(analysis: §2.1 Auth / session)_
- Login returns WRONG_DOMAIN and creates no user when `HOSTED_DOMAIN` is set and the token domain differs. _(analysis: §2.1 Auth / session, §2.8 Auth)_
- First login of an unknown email auto-creates an unapproved, non-admin user (id = Google `sub`, names from token) and returns NEED_APPROVAL. _(analysis: §2.1 Auth / session)_
- Unapproved user gets NEED_APPROVAL; approved user gets SUCCESS and a 1-hour JWT. _(analysis: §2.1 Auth / session)_
- Failed token verification returns FAILED. _(analysis: §2.1 Auth / session)_
- Login page shows "Login failed. Try again later.", "Used email does not belong to given hosted domain." or "Account needs to be approved by admin first.". _(analysis: §2.4 Screens)_
- JWT is kept in browser `localStorage`; app auto-logs-in on reload and logs out if the user info call returns nothing. _(analysis: §2.1 Auth / session, §2.8 Auth)_
- JWT is refreshed every 15 minutes via `POST /refresh-jwt`. _(analysis: §2.1 Auth / session)_
- Logout removes the JWT and resets the client cache. _(analysis: §2.1 Auth / session)_
- CLI command promotes a user (by email) to admin and approved. _(analysis: §1 Overview, §2.1 Auth / session)_
- **[CHANGE]** Refreshed JWT is always stored, the refresh timer runs after a fresh login too, and an expired stored JWT sends the user to login. _(interview: Rewrite goal › Functional bugs; analysis: §8 Risks)_
- **[CHANGE]** Auth middleware never hangs a request on unexpected errors. _(interview: Rewrite goal › Functional bugs; analysis: §8 Risks)_
- **[CHANGE]** Client data loading recovers after an API error without a page reload. _(interview: Rewrite goal › Functional bugs; analysis: §8 Risks)_
- **[PRESERVED BUG]** `/refresh-jwt` issues a new token for expired or invalid tokens without checking the user or approval. _(interview: Rewrite goal › Security bugs; analysis: §8 Risks)_
- **[PRESERVED BUG]** Invalid JWT is treated as anonymous; approval is not re-checked per request; denied calls return `null` (HTTP 200), not 401. _(analysis: §2.3 Roles)_

### Users

- Admin lists users: Email, Name (`surname[, firstName][, degrees]`), Is admin, Is approved. _(analysis: §2.1 Users, §2.4 Screens)_
- Admin approves an unapproved user, who can then log in. _(analysis: §2.1 Users, §2.8 Users)_
- Admin edits and removes users. _(analysis: §2.1 Users)_
- User edits own profile (first name, surname, degrees, address); email and approved are read-only; "Is admin" is hidden for non-admins. _(analysis: §2.1 Users, §2.8 Users)_
- Trips and leaves of a deleted user show placeholder "Deleted" / id / `<id>@deleted.instea.co`. _(analysis: §2.1 Users)_
- **[CHANGE]** Regular users can read only their own user record; admin reads all. _(interview: Data visibility)_
- **[PRESERVED BUG]** Any user can update any user's email, approved flag and names via `updateUser`; only `isAdmin` is protected. _(interview: Rewrite goal › Security bugs; analysis: §8 Risks)_
- **[PRESERVED BUG]** User edit page has an empty header, and after save a non-admin lands on `/users` and sees "You are not authorized to view this page!". _(analysis: §2.4 Screens)_

### Trips

- User sees the trips table: Who, Destination, When (`D. M. YYYY[ - D. M. YYYY]`), Controls; sorted by departure ascending. _(analysis: §2.1 Trips, §2.4 Screens)_
- **[CHANGE]** Regular user sees only own trips; admin sees all. _(interview: Data visibility)_
- User adds a trip: Who, Where, departure, arrival, purpose, travel type (O, R, A, L, DZ, AUS, AUV, MOS, MOV), price; defaults yesterday 08:00–17:00, type O. _(analysis: §2.1 Trips, §2.8 Trips)_
- **[CHANGE]** Non-admin can add a trip in the UI. _(interview: Rewrite goal › Functional bugs › Trip permissions)_
- **[CHANGE]** Trip owner or admin can edit and remove a trip; the server checks the trip owner. _(interview: Rewrite goal › Functional bugs › Trip permissions)_
- **[CHANGE]** UI shows an error when a trip save is denied, instead of navigating as if saved. _(interview: Rewrite goal › Functional bugs › Trip permissions)_
- Owner or admin removes a trip without confirmation. _(analysis: §2.4 Screens)_
- Owner or admin duplicates a trip: new departure, arrival keeps the original duration, other fields copied. _(analysis: §2.1 Trips, §2.6 Trip duplication)_
- **[PRESERVED BUG]** Server accepts any `userId` on trip create (user can create trips for others). _(interview: Rewrite goal › Security bugs; analysis: §2.3 Roles)_
- **[PRESERVED BUG]** Arrival-after-departure is not validated on client or server. _(interview: Rewrite goal › Other bugs; analysis: §2.2 Data model)_

### Places

- User lists places: Name, Destination name, Origin name, Travel duration (`2h 30m`). _(analysis: §2.1 Places, §2.4 Screens)_
- Admin adds, edits and removes places: name, destination name, origin name, travel duration (slider 0–1440 min, step 15, stored as ISO-8601), country (243 ISO codes, default SK). _(analysis: §2.1 Places, §2.2 Data model)_
- Non-admin sees a read-only list; add/edit pages show "You are not authorized to view this page!". _(analysis: §2.8 Places)_

### Travel-warrant export

- User picks a person and a month (years 2017..current) and generates a travel-warrant xlsx, then downloads it. _(analysis: §2.1 Travel-warrant export, §2.4 Screens)_
- Non-admin person picker shows only the user. _(analysis: §2.3 Roles)_
- Template is chosen by trips departing in the month: 0–9 → `upto19`, 10–15 → `upto31`. _(analysis: §2.6 Template choice)_
- Template is filled with name/degrees/address and per-trip left rows and right 4-row blocks (dates, origin/destination, times ± travel duration, travel type, price, diet). _(analysis: §2.6 Template filling)_
- Per-diem by country and whole-trip hours: SK 4.5 / 6.7 / 10.3 €; foreign 25 / 50 / 100 % of tariff; unknown country 0. _(analysis: §2.6 Per-diem)_
- Non-EUR diet tariffs are converted to EUR via an exchange-rate source (source: open question S1). _(analysis: §2.6 Per-diem, §4 Integrations)_
- Cached formula values are stripped so Excel recalculates totals. _(analysis: §2.6 Template filling)_
- **[PRESERVED BUG]** 16 or more trips in a month fail with HTTP 500 / "Problem preparing file". _(interview: Rewrite goal › Other bugs; analysis: §2.6 Template choice)_
- **[PRESERVED BUG]** SK trips under 5 h get 6.7 €; multi-day trips are not split per day. _(interview: Rewrite goal › Rule quirks; analysis: §2.6 Per-diem)_
- **[PRESERVED BUG]** Origin "Bratislava" is hardcoded; `upto31` totals sum only `R7:R44`; approver name is static template text. _(analysis: §2.6 Template filling)_
- **[PRESERVED BUG]** Server accepts any `userId` for export; generated files are public under `/download` with random names and never deleted. _(interview: Rewrite goal › Security bugs; analysis: §8 Risks)_

### Leaves

- **[CHANGE]** Regular user sees only own leaves in list and calendar; admin sees all. _(interview: Data visibility)_
- User lists leaves: Requester, Days (`start - end (N work days)`, `?` if unknown), Type, State, Approver, Delete. _(analysis: §2.1 Leaves, §2.4 Screens)_
- User filters leaves by requester, month and year (leaves split into per-year segments) and clears the filter. _(analysis: §2.6 Leave filter)_
- User switches to a calendar of non-rejected leaves: color per requester (15-color round robin), pending at half opacity, title `First Surname [1/2 ](T)`. _(analysis: §2.4 Screens, §2.6 Calendar colours)_
- User adds a leave: type (ANNUAL, SICKNESS, DOCTOR, MATERNITY, PARENTAL, CARING; default ANNUAL), start (default today), end (follows start until edited), half-day; work days shown. _(analysis: §2.1 Leaves, §2.4 Screens)_
- Work days = weekdays that are not SK public holidays; half-day subtracts 0.5. _(analysis: §2.6 Work-day count)_
- Add form shows "Start date must not be greater than end date" and "Half day option is allowed only within single day". _(analysis: §2.4 Screens, §2.8 Leaves)_
- Server creates the leave as PENDING with requester = caller and emails the approver. _(analysis: §2.1 Leaves)_
- Requester or admin deletes a leave in any state, without confirmation. _(analysis: §2.1 Leaves, §2.3 Roles)_
- **[PRESERVED BUG]** Delete button shows on every row and silently fails for others' leaves. _(interview: Rewrite goal › Other bugs; analysis: §2.3 Roles)_
- **[PRESERVED BUG]** Server does not validate leave dates, half-day rule or overlaps and trusts client `numDays`. _(interview: Rewrite goal › Other bugs; analysis: §2.2 Data model)_
- **[PRESERVED BUG]** Half-day subtracts 0.5 for any range length. _(analysis: §2.6 Work-day count)_
- **[PRESERVED BUG]** "Add leave" may be always disabled (Angular group-validator bug); runtime behavior is unverified, see open questions S2 and A2. _(interview: Rewrite goal › Other bugs; analysis: §8 Risks)_

### Leave approval

- Admin sees pending leaves and approves or rejects them; approver is set and the row disappears. _(analysis: §2.1 Leaves, §2.4 Screens, §2.8 Leaves)_
- Admin nav shows a badge with the pending-leave count. _(analysis: §2.1 Leaves)_
- **[PRESERVED BUG]** Approval page is reachable by non-admins (clicks silently fail); leaves can be re-approved or re-rejected in any state; no email on decision. _(interview: Rewrite goal › Other bugs; analysis: §2.3 Roles, §8 Risks)_

### Leave summary

- User sees own leaves per year (descending), per type, with total work days; leaves crossing a year are clipped. _(analysis: §2.1 Leaves, §2.6 Summary)_
- **[PRESERVED BUG]** Summary counts PENDING and REJECTED leaves. _(interview: Rewrite goal › Rule quirks; analysis: §2.6 Summary)_

### Detail export (meal vouchers)

- User picks a person (all users listed) and a month and downloads an xlsx: name, month, trips count, leaves count, expected meal vouchers, trip days, leave days, leave types, "HALF DAY". _(analysis: §2.1 Leaves, §2.6 Detail export)_
- Working day = not SK holiday and not weekend; trip and leave days are unique sorted working days. _(analysis: §2.6 Detail export)_
- Expected meal vouchers = month working days − trip days − leave days + half days. _(analysis: §2.6 Detail export)_
- **[PRESERVED BUG]** PENDING and REJECTED leaves are counted; month working days include the 1st of the next month. _(interview: Rewrite goal › Rule quirks; analysis: §2.6 Detail export)_
- **[PRESERVED BUG]** Server accepts any `userId` for export. _(interview: Rewrite goal › Security bugs; analysis: §2.3 Roles)_

### Attendance API (M2M)

- M2M client calls `GET /api/attendence/:year/:month` with Basic auth; 401 when credentials are wrong or unset. _(analysis: §2.1 Attendance API, §2.5 API contract)_
- Response lists SSO users with a Toggl id; only `employee === '1'` get daily hours, leave codes and total, plus `contractType`. _(analysis: §2.6 Attendance)_
- Hours come from Toggl Reports v3 per user token, paginated with a 500 ms pause. _(analysis: §2.6 Attendance)_
- APPROVED leaves on working days map to codes D8 / D4 (half day) / PN / L / I, joined with ", ". _(analysis: §2.6 Attendance)_
- Errors: 400 "Month is not a number." / "Year is not a number."; 500 "Cannot get data from SSO, try again later." / "Cannot get data from Toggl, try again later.". _(analysis: §2.5 API contract)_
- Dates use `DEFAULT_TIMEZONE` (default `Europe/Bratislava`). _(analysis: §2.6 Attendance)_
- **[PRESERVED BUG]** Request crashes on an employee without `togglUserId` or an unknown Toggl user; duplicate SSO names overwrite each other. _(analysis: §8 Risks)_

### Notifications

- New leave sends "New leave notification" email to `APPROVAL_MAIL_RECEIVER`: requester, dates, type, "Approve" link to the approval page. _(analysis: §2.7 Notifications)_
- Missing SMTP settings only log, they do not fail leave creation. _(analysis: §2.7 Notifications)_
- **[PRESERVED BUG]** User names are not HTML-escaped in the email. _(analysis: §8 Risks)_

### Operations

- `/health-check` pings Mongo: 200 `{checkMongo:'ok'}` or 500 with the error. _(analysis: §2.1 Ops, §2.5 API contract)_
- Process exits on Mongo connect failure or disconnect, so Kubernetes restarts the pod. _(analysis: §1 Overview)_
- **[PRESERVED BUG]** GraphiQL is public and CORS allows all origins. _(interview: Rewrite goal › Security bugs; analysis: §8 Risks)_

### Data and validation

- Data model: Place, User, Trip, Leave with app-level `id` (UUID or Google `sub`) and indexes as today. _(analysis: §2.2 Data model)_
- **[PRESERVED BUG]** Server enforces no required fields beyond GraphQL non-null inputs. _(interview: Rewrite goal › Other bugs; analysis: §2.2 Data model)_

---

## 3. User decisions

### Testing

- Every feature has automated tests; humans and AI agents both write code, so tests are mandatory and a coverage gate runs in CI. _(interview: AI agents)_
- Tests are written only in the new app, from the analysis acceptance criteria and worked examples; no golden comparison with the old system. _(interview: Tests)_
- Unit tests cover all business rules: per-diem, template choice, template filling, work days, meal vouchers, leave filter, calendar colors, summary, attendance codes. _(interview: Tests; analysis: §2.6 Business rules)_
- Integration tests cover every GraphQL operation and REST endpoint, including the permission matrix and the preserved bugs. _(interview: Tests; analysis: §2.3 Roles, §2.5 API contract)_
- End-to-end tests cover the main screens: login, trips, places, users, both exports, leaves list/calendar/add/approval/summary. _(interview: Tests; analysis: §2.4 Screens)_
- Contract tests freeze the attendance API: JSON shape, status codes, error messages, attendance codes. _(interview: M2M contract)_
- External integrations are replaced in tests by fakes kept in the repo: mail catcher, SSO stub, Toggl stub, fake Google token issuer, mocked exchange rates. _(interview: Integration testability)_

### Environments

- Local docker-compose runs the full stack with integration fakes; no hosted staging environment. _(interview: Environments)_
- Script creates an anonymized copy of production MongoDB (names, emails, addresses) for local testing and migration rehearsal. _(interview: Prod data)_
- AI agents work with code and the local docker-compose environment (fakes, anonymized data); no production access. _(interview: AI agent access)_

### Integrations

- Integration reference document for Google Identity, SSO directory, Toggl Reports v3, SMTP, exchange-rate source and the M2M consumer: endpoints, auth, fields, error behavior. _(interview: Integration docs)_

### Scope

- Security bugs are preserved 1:1. _(interview: Rewrite goal › Security bugs)_
- Business-rule quirks are preserved 1:1. _(interview: Rewrite goal › Rule quirks)_
- Export over 15 trips and leave validation/state bugs are preserved 1:1. _(interview: Rewrite goal › Other bugs)_
- Trip permission bugs and session/refresh bugs are fixed. _(interview: Rewrite goal › Functional bugs)_
- Regular users see only their own trips, leaves and user record; admin sees all. _(interview: Data visibility)_
- The two SPAs become one React SPA; the GraphQL + REST contract stays the same. _(interview: Target tech stack › Frontend; interview: API style)_

### Documentation

- Business rules document (diets, meal vouchers, work days, attendance codes, leave filter), validated by the domain expert. _(interview: Documentation)_

### Migration strategy

- Migration goes module by module; cutover can happen at any time in the month. _(interview: Migration; interview: Cutover)_
- Step 1, Leaves: new SPA leave screens and leave API go live; ingress routes `/leaves/` to the new app; the old app still serves Trips. _(interview: Migration)_
- Step 2, Trips, Places, Users, travel-warrant and detail exports: new screens and API go live; ingress routes `/` to the new app. _(interview: Migration)_
- Step 3, Attendance API: `/api/attendence` moves to the new server after its contract tests pass. _(interview: Migration; interview: M2M contract)_
- Old and new app share one MongoDB and one JWT signing key during the transition, so a session works across both. _(interview: Migration)_
- Each step is rehearsed locally on the anonymized prod copy before go-live. _(interview: Prod data)_
- Rollback per step: route the ingress path back to the old deployment. _(interview: Migration)_
- MongoDB 3.6 is upgraded to MongoDB 8; the timing relative to the shared-database period is open (see S4). _(interview: Database)_
- Final step: remove the old deployment and turn off the Jenkins job. _(interview: Migration; analysis: §6 CI/CD)_

---

## 4. Non-functional requirements

### Security

- CI scans dependencies and the container image for known vulnerabilities. _(input NFR: Security; interview: Security)_
- Server sends standard security headers on all responses. _(input NFR: Security; interview: Security)_
- Export download URLs use the request scheme (HTTPS), not hardcoded `http://`. _(input NFR: Security; interview: Security; analysis: §8 Risks)_

### Data privacy and compliance

- Audit log records leave approve/reject/delete and user edit/approve/remove: who, when, which record. _(input NFR: Data privacy; interview: Privacy)_
- Admin can export all personal data of one user. _(input NFR: Data privacy; interview: Privacy)_
- Admin can erase one user's personal data. _(input NFR: Data privacy; interview: Privacy)_
- Regular users see only their own data (see Scope). _(input NFR: Data privacy; interview: Data visibility)_

### Maintainability

- CI runs on every PR: lint, typecheck, tests, coverage gate, image build and push to `registry.instea.co`; replaces Jenkins. _(input NFR: Maintainability; interview: Maintainability)_
- Shared types package for enums and data used by server and SPA (travel types, leave types/states, login results, countries, diet tariffs); no "keep in sync" copies. _(input NFR: Maintainability; interview: Maintainability)_
- Developer docs: README with local setup, architecture decision records. _(input NFR: Maintainability; interview: Maintainability)_

### Localization

- SPA uses an i18n framework with Slovak and English translations and a language switch. _(input NFR: Localization; interview: Localization)_

---

## 5. Skipped questions (for client)

### S1. Which exchange-rate source should convert non-EUR diet tariffs (CZ, GB, US, CH, ...)? Options: free ECB reference rates with cache and fallback; keep the current currency-converter provider with the key moved to a secret; rates maintained by an admin in the app. _(interview: Integrations › FX source; analysis: §4 Integrations, open question 6)_

- **Answer:**
- [ ] Not relevant

### S2. Bugs are preserved 1:1, but the Angular "Add leave" button may be always disabled. If that is confirmed, preserving it blocks leave creation. Should the new app enable valid leave creation? _(interview: Rewrite goal › Other bugs; analysis: §8 Risks)_

- **Answer:**
- [ ] Not relevant

### S3. Libraries not chosen in the interview: xlsx generation, mail, Google auth/JWT, dates/holidays, UI component kit, forms/state, i18n library, test frameworks, CI tool. Any client preference, or does Instea choose? _(interview: Target tech stack)_

- **Answer:**
- [ ] Not relevant

### S4. Module-by-module migration shares one MongoDB. The old app's Mongoose 4.13 driver cannot connect to MongoDB 8. Upgrade the database after the last module, or upgrade the old app's driver first? _(interview: Migration; interview: Database)_

- **Answer:**
- [ ] Not relevant

### S5. Users now see only their own trips and leaves, but security bugs are preserved: exports still accept any `userId` and `/download` files stay public. Is that acceptable, or should those be closed too? _(interview: Data visibility; interview: Rewrite goal › Security bugs)_

- **Answer:**
- [ ] Not relevant

### S6. Must the old URLs keep working (`/trips`, `/places`, `/users`, `/export`, `/leaves/list`, `/leaves/approval` used in the approval email)? _(interview: Target tech stack › Frontend; analysis: §2.4 Screens, §2.7 Notifications)_

- **Answer:**
- [ ] Not relevant

### S7. Localization scope: should xlsx exports and emails also be in Slovak/English? Which language is the default? _(input NFR: Localization)_

- **Answer:**
- [ ] Not relevant

### S8. Audit log: how long is it kept, and who can view it (admin screen or logs only)? _(input NFR: Data privacy)_

- **Answer:**
- [ ] Not relevant

### S9. Personal data erasure: what happens to the erased user's trips and leaves (delete them, or keep them with the "Deleted" placeholder)? _(input NFR: Data privacy)_

- **Answer:**
- [ ] Not relevant

---

## 6. Open questions (from analysis)

### A1. Does `jwt-node` 0.1.9 populate `err.parsedBody` on signature mismatch? This decides whether `/refresh-jwt` is a full auth bypass. _(analysis: §8 Open questions 1)_

- **Answer:**
- [ ] Not relevant

### A2. Is the Angular add-leave form always invalid in production (Angular 4.4.6 runtime check)? _(analysis: §8 Open questions 2)_

- **Answer:**
- [ ] Not relevant

### A3. Was the SK diet for trips under 5 h meant to be 0 €? Should multi-day trips be split per day? _(analysis: §8 Open questions 3)_

- **Answer:**
- [ ] Not relevant

### A4. Should PENDING/REJECTED leaves count in the detail export and summary? _(analysis: §8 Open questions 4)_

- **Answer:**
- [ ] Not relevant

### A5. Template names "upto19"/"upto31" vs code limits 9/15 trips: what do they mean? Is the `upto31` total `SUM(R7:R44)` intended? _(analysis: §8 Open questions 5)_

- **Answer:**
- [ ] Not relevant

### A6. Is the currency-converter API still alive? What happens to the export if it fails? _(analysis: §8 Open questions 6)_

- **Answer:**
- [ ] Not relevant

### A7. Production topology: Jenkins deploys via `docker-compose`, but code comments mention k8s. Which is current, and is Jenkins still active? _(analysis: §8 Open questions 7)_

- **Answer:**
- [ ] Not relevant

### A8. Which SSO system sits behind `SSO_URI`, and what is its full key schema? _(analysis: §8 Open questions 8)_

- **Answer:**
- [ ] Not relevant

### A9. Should the UI be Slovak? All UI copy is English except travel-type labels and placeholders. _(analysis: §8 Open questions 9)_

- **Answer:**
- [ ] Not relevant

### A10. Should regular users see all users' trips and leaves? _(analysis: §8 Open questions 10)_

- **Answer:**
- [ ] Not relevant

### A11. CI status: there is no badge or status source in the repo, and the last Jenkins result is unknown. _(analysis: §8 Open questions 11)_

- **Answer:**
- [ ] Not relevant
