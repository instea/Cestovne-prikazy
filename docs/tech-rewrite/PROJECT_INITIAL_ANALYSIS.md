# Cestovné príkazy (Trips & Leaves) — Project Spec

|           |                                                                                                                               |
| --------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Generated | 2026-10-20                                                                                                                    |
| Branch    | `master`                                                                                                                      |
| Commit    | `b94e05064f6db00dd935384def27eb144aa2d2b6` (`b94e050`, "Merge pull request #83 from instea/fix/toggl", 2024-06-05)            |
| Scope     | Whole repo: `server/`, `src/` (React), `angular/` (Angular), ops files                                                        |
| Method    | Read-only static analysis. No install, build, or run. `node_modules` not present, so library runtime behaviour is unverified. |

Legend: 🔴 = security/critical, 🟠 = functional bug, 🟡 = quality/maintenance. Paths are repo-relative; `file:line`.

---

## Glossary

| Term                                   | Meaning                                                                                                                                                                                                                                                | Source                                              |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| Cestovný príkaz (pl. cestovné príkazy) | Travel warrant: Slovak official business-trip order and expense settlement form. Project name.                                                                                                                                                         | `server/templates/*.xlsx` sharedStrings             |
| Cestaky                                | Short internal name of the app (docker image `cestaky:master`, PM2 app name)                                                                                                                                                                           | `Jenkinsfile:10`, `PM2.md:8`                        |
| Vyúčtovanie pracovnej cesty            | Business-trip expense settlement (template header)                                                                                                                                                                                                     | templates                                           |
| Trip                                   | One business trip of one user to one Place                                                                                                                                                                                                             | `server/db/schema.js:68-105`                        |
| Place                                  | Predefined destination: name, origin, destination, travel duration, country                                                                                                                                                                            | `server/db/schema.js:9-37`                          |
| Stravné / diet / `dietTariff`          | Per-diem meal allowance by country and trip hours                                                                                                                                                                                                      | `src/data/Diets.js`                                 |
| Cestovné                               | Travel cost (`priceOfTravel`)                                                                                                                                                                                                                          | template column R                                   |
| Nocľažné, Nutné vedľajšie výdavky      | Accommodation; incidental expenses (template labels, never filled)                                                                                                                                                                                     | templates                                           |
| Odchod / Príchod                       | Departure / Arrival                                                                                                                                                                                                                                    | templates                                           |
| Doplatok / Preplatok / Preddavok       | Amount still owed / overpayment / advance                                                                                                                                                                                                              | templates                                           |
| Amortizácia, Spotreba, PHM             | Car depreciation, consumption, fuel (template formulas)                                                                                                                                                                                                | templates                                           |
| Travel type codes                      | O Osobný vlak (local train), R Rýchlik (express train), A Autobus (bus), L Lietadlo (plane), DZ Doprava zabezpečená (transport provided), AUS/AUV Auto služobné/vlastné (company/own car), MOS/MOV Motocykel služobný/vlastný (company/own motorcycle) | `src/data/TravelType.js:1-11`                       |
| Leave (dovolenka)                      | Absence request. Types ANNUAL, SICKNESS, DOCTOR, MATERNITY, PARENTAL, CARING                                                                                                                                                                           | `src/data/LeaveType.js:2-9`                         |
| Leave state                            | PENDING, APPROVED, REJECTED                                                                                                                                                                                                                            | `src/data/LeaveState.js`                            |
| Attendence                             | Code spelling of "attendance": monthly Toggl hours + leave report for M2M consumers                                                                                                                                                                    | `server/api/attendenceApi.js`                       |
| Attendance codes                       | D8 / D4 full / half annual-leave day; PN práceneschopnosť (sick, SICKNESS); L lekár (DOCTOR); I iné (other)                                                                                                                                            | `server/service/attendenceService.js:42-47`         |
| Meal vouchers                          | Stravné lístky: working days in month not on trip or leave                                                                                                                                                                                             | `server/export/exportDetail.js:48-52`               |
| Work days / `numDays`                  | Days not weekend and not SK public holiday; half day subtracts 0.5                                                                                                                                                                                     | `angular/src/app/services/holiday-count.service.ts` |
| Approved (user)                        | Admin has approved account. Unapproved users get NEED_APPROVAL at login                                                                                                                                                                                | `server/graphql/userRelated.js:42-46`               |
| Hosted domain                          | Google Workspace domain restriction for login (`HOSTED_DOMAIN`)                                                                                                                                                                                        | `server/graphql/userRelated.js:30-34`               |
| M2M                                    | Machine-to-machine client using HTTP Basic auth                                                                                                                                                                                                        | `server/api/attendenceApi.js:4-22`                  |
| SSO                                    | External user directory at `SSO_URI` holding Toggl keys per user                                                                                                                                                                                       | `server/service/attendenceService.js:8-17`          |
| SK                                     | Slovakia: holiday calendar and domestic diet                                                                                                                                                                                                           | `server/service/tripService.js:4-5`                 |

---

## 1. Overview

- **What**: Internal Instea app for (a) business trips and generation of Slovak travel-warrant xlsx, (b) annual/sick leave requests and approval, (c) monthly attendance report API (Toggl + leaves) for machine clients. `README.md:1-3`, `angular/README.md:1-3`.
- **Users**: Instea employees with Google accounts (optionally restricted to hosted domain); admins who approve users and leaves; M2M consumers of the attendance API. `README.md:6-11`, `README.md:106-117`.
- **Components**

| Component            | Path                                | Role                                                                                                                                                              |
| -------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node server          | `server/`                           | Express 4 + express-graphql + Mongoose. Serves GraphQL, REST exports, attendance API, health check, and both SPA builds. Port 4100 hardcoded `server/index.js:24` |
| React SPA "Trips"    | `src/`, `public/`                   | Trips, Places, Users, Travel-warrant export. Served at `/` `server/index.js:59-63`                                                                                |
| Angular SPA "Leaves" | `angular/`                          | Leaves list/calendar/add/approval/summary/detail export. Served at `/leaves/` `server/index.js:53-57`                                                             |
| Shared data modules  | `src/data/*.js`                     | Enums, converters, diet tariffs. Used by server and React; Angular has own copies ("keep in sync") `src/data/LeaveType.js`, `src/data/LoginResults.js`            |
| MongoDB              | `db/docker-compose.yml` (mongo:3.6) | Persistence                                                                                                                                                       |

```
                 Google Identity (ID token)
                    ▲                ▲
                    │                │
 Browser ── React SPA (/)      Angular SPA (/leaves/)
                    │  GraphQL /graphql, POST /refresh-jwt, POST /export/*
                    ▼
            ┌──────────────── Express server :4100 ───────────────┐
            │ auth (JWT, secrets/key.pem) · GraphQL · exports     │
            │ /download static · /api/attendence · /health-check  │
            └───┬───────────────┬─────────────┬──────────┬────────┘
                ▼               ▼             ▼          ▼
            MongoDB       SMTP (leave mail)  SSO dir   Toggl Reports v3
                              currency-converter API (diet FX)
 M2M client ── Basic auth ──► GET /api/attendence/:year/:month
```

- **Middleware chain** (`server/index.js`): create `server/download` (26-33) → `/download` static, no auth (34) → `cors()` all origins (37) → `setupAuth` = `POST /refresh-jwt` + express-jwt `credentialsRequired:false` + user loader into `req.context.user` (39; `server/auth/setup.js:10-43`) → `/graphql` with `graphiql:true` (40-45) → `/api/*` basic auth + attendance (47) → `/health-check` (48) → `bodyParser.json` + `POST /export/*` (50-51) → `/leaves/` Angular (53-57) → `/` React (59-63). SIGINT exits (68-70).
- **CLI mode**: `node server/index.js --email X` promotes user to admin + approved and exits; does not start server. `server/index.js:16-21`, `server/db/promoteUser.js:5-15`.
- **Mongo**: connects at require time; connect failure exit -1; disconnect exit -2 (comment: so k8s restarts the pod). `server/db/connect.js:7-32`. Models registered only on `open` event `server/db/schema.js:7`.

---

## 2. Functional spec

### 2.1 Features by area

**Auth / session**

- User signs in with Google button; client sends Google ID token to `loginUser` mutation. React `src/containers/auth/LoginForm.js:24-40`; Angular `angular/src/app/login-page/login-page.component.ts:40-60`.
- Server verifies token (`CLIENT_ID` audience). If `HOSTED_DOMAIN` set and token `hd` differs → WRONG_DOMAIN. `server/graphql/userRelated.js:21-34`.
- Existing approved user → SUCCESS + JWT (`sub=user.id`, exp 1h). `userRelated.js:37-41`, `server/auth/operations.js:13-16`.
- Existing unapproved → NEED_APPROVAL. Unknown email → auto-create user (`id`=Google `sub`, names from token, `approved=false`, `isAdmin=false`) → NEED_APPROVAL. `userRelated.js:42-60`.
- Token verification failure → FAILED. `userRelated.js:62-66`.
- JWT stored in `localStorage['jwt']` by both SPAs. `src/actions/authActions.js:49`; `angular/src/app/state/auth.ts:4`, `auth.service.ts:72-77`.
- JWT refreshed every 15 min via `POST /refresh-jwt`. `src/core/init.js:6-22`; `angular/src/app/constants.ts:8`, `state/auth.effects.ts:68-76`.
- Logout removes jwt, resets Apollo store. `src/actions/authActions.js:99-108`; `angular/.../auth.service.ts:79-83`.
- First admin is created by CLI: `yarn promote-user --email=<google_email>` after the user has logged in once. `README.md:60-69`.

**Users** (React)

- Admin lists, edits, removes, approves users. `src/containers/users/UserList.js`.
- Any user edits own profile (first name, surname, degrees, address); "Is admin" hidden for non-admins; email and approved read-only in UI. `src/containers/users/UserForm.js:19,29-35`.
- Deleted/missing user referenced by trip/leave resolves to placeholder: firstName "Deleted", surname = id, email `<id>@deleted.instea.co`. `server/service/userService.js:3-18`.

**Trips** (React)

- Logged-in user sees table of all trips (server returns all users' trips sorted by `departureTime` asc). `server/graphql/tripRelated.js:17-18`, `src/containers/trips/TripList.js`.
- Add trip: Who, Where, departure, arrival, purpose, travel type, price. Defaults yesterday 08:00–17:00, type O. `src/containers/trips/AddTripForm.js:19-25`.
- Edit / Remove / Duplicate shown to admin or trip owner. `TripList.js:64`.
- Duplicate: choose new departure; arrival = new departure + original duration; all other fields copied. `src/containers/trips/DuplicateTripButton.js:69-79`.

**Places** (React)

- Logged-in users list places. Admin adds/edits/removes. `src/containers/places/PlaceList.js:45,56`, `server/graphql/placeRelated.js:11-17`.

**Travel-warrant export** (React `/export`)

- Pick user + month → server builds xlsx from template → Download button. `src/containers/export/ExportForm.js`, `server/export/exportTravelWarrant.js`.

**Leaves** (Angular `/leaves/`)

- List all leaves of all users; filter by requester/month/year; switch List/Calendar. `angular/src/app/leaves/leaves-list/*`, `leaves-calendar/*`.
- Add leave: type, start, end, half-day; shows computed work days. Server forces PENDING, requester=caller, emails approver. `leaves-add/*`, `server/graphql/leaveRelated.js:21-31`.
- Delete leave (server: requester or admin, any state). `server/graphql/leaveRelated.js:32-39`.
- Admin approves/rejects pending leaves; nav badge shows pending count. `leaves-approval/*`, `nav-header.component.ts:27-31`.
- Summary: own leaves per year (desc) per type with work-day totals. `leaves/summary/summary.component.ts:47-98`.
- Detail export: user + month → xlsx with trip days, leave days, expected meal vouchers. `leaves-export/*`, `server/export/exportDetail.js`.

**Attendance API** (M2M)

- `GET /api/attendence/:year/:month` returns per-employee daily Toggl hours and leave codes. `server/api/attendenceApi.js:21-50`, `server/service/attendenceService.js:117-176`.

**Ops**

- `/health-check` pings Mongo. `server/health-check/health-check.js:3-27`.
- Jobs/cron: none. Only timers: currency-converter fetch interval 1h (`src/data/Diets.js:2`), 500 ms sleep between Toggl pages (`attendenceService.js:113`).

### 2.2 Data model (`server/db/schema.js`)

🔴/🟠 All fields use `reqired: true` (typo, e.g. `schema.js:12,16,20`). Mongoose ignores it → **no field is required server-side**. No defaults anywhere. Mongo collections have `{id:1}` indexes; `id` is an app-level UUID/Google sub, separate from `_id`.

**Place** — index `{id:1}` (`:35`)

| Field           | Type   | Req (GraphQL)           | Default            | Enum / validation                                                | Set by                                                                  |
| --------------- | ------ | ----------------------- | ------------------ | ---------------------------------------------------------------- | ----------------------------------------------------------------------- |
| id              | String | out: non-null           | —                  | uuid v4                                                          | server `placeRelated.js:11-13`                                          |
| name            | String | `String!`               | —                  | client: required                                                 | client                                                                  |
| destinationName | String | `String!`               | —                  | client: required                                                 | client                                                                  |
| originName      | String | `String!`               | —                  | client: required                                                 | client                                                                  |
| travelDuration  | String | `String!`               | client 0           | ISO-8601 duration (e.g. `PT2H30M`); UI slider 0–1440 min step 15 | client `src/data/Place.js:10-16`, `src/components/FormHelpers.js:67-75` |
| country         | String | optional `Country` enum | client `SK` on add | 243 ISO-3166 alpha-2 codes `src/data/Countries.js`               | client                                                                  |

**User** — indexes `{id:1}`, `{email:1}`; `unique` on id, email (`:39-66`)

| Field              | Type          | Req                           | Default           | Notes                                       | Set by                                             |
| ------------------ | ------------- | ----------------------------- | ----------------- | ------------------------------------------- | -------------------------------------------------- |
| id                 | String unique | non-null                      | —                 | Google `sub`                                | server at first login `userRelated.js:50`          |
| email              | String unique | non-null                      | —                 | from Google token                           | server at login; also writable via `updateUser` 🔴 |
| firstName, surname | String        | —                             | —                 | from token `given_name`/`family_name`       | login; client profile edit                         |
| degrees, address   | String        | —                             | `''` at creation  | —                                           | client profile edit                                |
| isAdmin            | Boolean       | `UserInput.isAdmin: Boolean!` | false at creation | only admin may change (`userRelated.js:77`) | admin / CLI                                        |
| approved           | Boolean       | —                             | false at creation | —                                           | `approveUser`, CLI, and (bug) `updateUser`         |

**Trip** — index `{id:1}` (`:68-105`)

| Field         | Type   | GraphQL input   | Client validation                                                                                               | Enum                               | Set by                              |
| ------------- | ------ | --------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ----------------------------------- |
| id            | String | —               | —                                                                                                               | uuid                               | server `tripRelated.js:23-24`       |
| userId        | String | `String!`       | Required                                                                                                        | —                                  | client (not checked server-side 🔴) |
| placeId       | String | `String!`       | Required                                                                                                        | —                                  | client                              |
| departureTime | Date   | `String!` (ISO) | Required; default yesterday 08:00                                                                               | —                                  | client                              |
| arrivalTime   | Date   | `String!` (ISO) | Required; default yesterday 17:00. Intended "Must be after the start" check is dead code 🟠 `TripForm.js:60-68` | —                                  | client                              |
| purpose       | String | `String!`       | Required                                                                                                        | —                                  | client                              |
| travelType    | String | `TravelType!`   | default `O`                                                                                                     | O, R, A, L, DZ, AUS, AUV, MOS, MOV | client                              |
| priceOfTravel | Number | `Float!`        | Required                                                                                                        | —                                  | client                              |

**Leave** — index `{id:1}` (`:107-143`)

| Field       | Type    | GraphQL             | Default                         | Enum / validation                                     | Set by                      |
| ----------- | ------- | ------------------- | ------------------------------- | ----------------------------------------------------- | --------------------------- |
| id          | String  | `ID!`               | —                               | uuid                                                  | server `leaveRelated.js:23` |
| requesterId | String  | (`requester: User`) | caller                          | —                                                     | server `:24`                |
| approverId  | String  | (`approver: User`)  | —                               | admin on approve/reject                               | server `:42,50`             |
| startDate   | Date    | `String!`           | client today 00:00              | client: required, ≤ endDate                           | client                      |
| endDate     | Date    | `String!`           | client = startDate until edited | client: required, ≥ startDate                         | client                      |
| type        | String  | `LeaveType`         | client ANNUAL                   | ANNUAL, SICKNESS, DOCTOR, MATERNITY, PARENTAL, CARING | client                      |
| state       | String  | `LeaveState`        | server PENDING                  | PENDING, APPROVED, REJECTED                           | server                      |
| isHalfDay   | Boolean | Boolean             | client false                    | client: only if start == end                          | client                      |
| numDays     | Number  | Float               | client-computed                 | server trusts it, never recomputes                    | client                      |

**Client vs server validation mismatches**

- 🟠 Server enforces none of the client "Required" rules beyond GraphQL non-null input types (`reqired` typo).
- 🟠 Server does not check leave `startDate ≤ endDate`, half-day single-day rule, overlaps, or `numDays` correctness.
- 🟠 Trip arrival-after-departure check is dead on client and absent on server.
- 🟡 User form has no client validation `UserForm.js:67-69`.

### 2.3 Roles and permission matrix

Roles: **anon** (no/invalid JWT; invalid JWT is silently treated as anon `server/auth/setup.js:40-43`), **pending** (User doc with `approved=false`; never receives JWT from login), **user** (JWT whose `sub` matches a User; `approved` NOT re-checked in middleware `setup.js:29-34`), **owner** (user who owns the record), **admin** (`isAdmin=true`), **M2M** (Basic auth).

Guards (`server/auth/rootResolverDecorators.js`): `userProtected` (1-8), `ownerProtected` sets `context.checkUserId` (10-20), `adminProtected` (22-29). Denial returns `null`, never an error/401.

| Action                      | UI allows (React / Angular)                                                                                         | Server enforces                                                                                                  | Mismatch                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Login                       | anyone                                                                                                              | anyone                                                                                                           | —                                                                          |
| View trips list             | user+ (`TripList.js:42`)                                                                                            | user; returns **all users' trips**                                                                               | 🟡 privacy                                                                 |
| Add trip                    | Add button shown to all; form shows Unauthorized to non-admin (`AddTripForm` passes no `ownerId`, `TripForm.js:23`) | any user, **any `userId`** (`tripRelated.js:23-25`)                                                              | 🟠 non-admin cannot add in UI; 🔴 server allows forging owner              |
| Edit/remove own trip        | owner or admin (`TripList.js:64`)                                                                                   | `checkUserId(id)` passes **trip id** not owner id → admin only (`tripRelated.js:28,36`)                          | 🟠 owners blocked server-side; UI shows success anyway                     |
| Duplicate trip              | owner or admin                                                                                                      | = createTrip (any user)                                                                                          | —                                                                          |
| View places                 | user+                                                                                                               | user                                                                                                             | —                                                                          |
| Add/edit/remove place       | admin                                                                                                               | admin                                                                                                            | —                                                                          |
| List users                  | admin (`UserList.js:14`)                                                                                            | any user (`userRelated.js:19`)                                                                                   | 🟡 data exposure                                                           |
| Get any user                | own or admin (UI)                                                                                                   | any user (`:17`)                                                                                                 | 🟡                                                                         |
| Update user                 | own profile or admin                                                                                                | **any user updates any user** — check `if (!context.checkUserId)` tests function existence (`userRelated.js:71`) | 🔴 privilege escalation (email, approved, names); only `isAdmin` protected |
| Remove / approve user       | admin                                                                                                               | admin                                                                                                            | —                                                                          |
| createUser                  | not used                                                                                                            | in SDL, no resolver → null (`schema.js:129`)                                                                     | 🟡 dead                                                                    |
| View leaves                 | user+ (all users' leaves)                                                                                           | user, all leaves                                                                                                 | 🟡 privacy                                                                 |
| Create leave                | user+                                                                                                               | user; requester = self                                                                                           | —                                                                          |
| Delete leave                | Delete button on **every** row (`leaves-list.component.html:44`)                                                    | requester or admin, any state                                                                                    | 🟡 UI shows button that silently fails                                     |
| Approve/reject leave        | nav link admin only; `/approval` route has no guard                                                                 | admin; no state precondition                                                                                     | 🟡 non-admin sees page, clicks silently fail                               |
| Travel-warrant export       | non-admin user combobox shows only self; `/export` has no guard                                                     | any user, **any `userId`** (`exportMiddleware.js:11-20`)                                                         | 🔴 IDOR                                                                    |
| Detail export               | user dropdown shows all users                                                                                       | any user, any `userId`                                                                                           | 🔴 IDOR                                                                    |
| Download xlsx `/download/*` | via returned URL                                                                                                    | **public, no auth** (`index.js:34`)                                                                              | 🔴                                                                         |
| `POST /refresh-jwt`         | logged-in                                                                                                           | none beyond Bearer; see Risks                                                                                    | 🔴                                                                         |
| `/graphql` GraphiQL UI      | —                                                                                                                   | public (`index.js:44`)                                                                                           | 🟡                                                                         |
| Attendance API              | —                                                                                                                   | M2M Basic auth; 401 if creds unset                                                                               | —                                                                          |
| Health check                | —                                                                                                                   | public                                                                                                           | —                                                                          |

### 2.4 Screens

Shared (React): form layout label xs4/sm3/md2 + input xs8/sm9/md6 (`src/components/FormHelpers.js:8-22`); loading = `react-loading-indicator`, error = red alert (`withProgress.js:14-22`); field error "Required" shown only after touch (`FormHelpers.js:11,17`); unauthorized = red alert "You are not authorized to view this page!" (`Unauthorized.js:6`). Date formats `D. M. YYYY`, `H:mm`. React UI copy is English except travel-type labels and placeholders.

**React menu** (`src/containers/auth/MenuBar.js`): "Leaves" (full-page link `/leaves/`, always), "Trips", "Places", "Export" (logged in), "Users" with lock icon (admin). Right: dropdown with user glyph (green if admin) + first name → "Profile" (`/users/edit/<ownId>`), "Sign out"; logged out → "Login".

| URL                               | Who            | Content                                                                                                                                                                                                                                                | Actions / after success                                                              | States / messages                                                                                                                                                                         |
| --------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                               | any            | redirect `/trips/` `App.js:26`                                                                                                                                                                                                                         | —                                                                                    | no 404 route                                                                                                                                                                              |
| `/login`                          | any            | LoginResultMessage + Google button                                                                                                                                                                                                                     | success → `goBack()`                                                                 | "Login failed. Try again later." (red); "Used email does not belong to given hosted domain." (red); "Account needs to be approved by admin first." (yellow) `LoginResultMessage.js:11-17` |
| `/trips`                          | user+          | "Trips" table: Who (`surname, firstName`), Destination, When (`D. M. YYYY[ - D. M. YYYY]`), Controls                                                                                                                                                   | Remove (no confirm), Edit → `/trips/edit/:id`, Duplicate (modal); Add → `/trips/add` | "Error while fetching list: <msg>"; empty = only Add row                                                                                                                                  |
| `/trips/add`, `/trips/edit/:id`   | admin or owner | "Add trip"/"Edit trip". Fields: "Who:" user combobox; "Where:" place combobox (`destinationName (name)`); "Time of departure:"; "Time of arrival:"; "Purpose:" placeholder `Example: konzultácie`; "Type of travel:" select; "Price of travel:" number | Save → `/trips` (add waits for mutation; edit navigates immediately); Cancel → back  | "Required"; "Error while fetching the trip: <msg>"; combobox "Problem loading users/places: <msg>"                                                                                        |
| Duplicate modal                   | owner/admin    | "Duplicate trip"; "Time of departure:" default = original                                                                                                                                                                                              | Duplicate → createTrip → `/trips`; Cancel                                            | —                                                                                                                                                                                         |
| `/places`                         | user+          | "Places": Name, Destination name, Origin name, Travel duration (`2h 30m`), Controls                                                                                                                                                                    | admin: Remove, Edit, Add                                                             | "Error while fetching list: <msg>"                                                                                                                                                        |
| `/places/add`, `/places/edit/:id` | admin          | "Name:" (`Example: Viedeň, AT`), "Destination name:" (`Example: Viedeň`), "Origin name:" (`Example: Hranica SK-AT / Bratislava`), "Travel duration:" slider 0–1440 step 15, "Country" combobox default SK                                              | Save → `/places`; Cancel                                                             | "Required"; "Error while fetching the place: <msg>"                                                                                                                                       |
| `/users`                          | admin          | "Users": Email, Name (`surname[, firstName][, degrees]`), Is admin, Is approved (Yes/No), Controls                                                                                                                                                     | Remove, Edit, Approve (only if unapproved)                                           | "Error while fetching list: <msg>"                                                                                                                                                        |
| `/users/edit/:id`                 | admin or self  | (empty header 🟡) "Email:" disabled, "First name:", "Surname:", "Degrees:", "Address:" textarea, "Is approved:" disabled, "Is admin:" admin only                                                                                                       | Save → `/users` (non-admin then sees Unauthorized 🟡)                                | "Error while fetching the user: <msg>"                                                                                                                                                    |
| `/export`                         | (no guard)     | "Who:" default self; "Month:" month picker default now, years 2017..current                                                                                                                                                                            | Generate → spinner → Download (`window.location.assign(url)`)                        | "Problem preparing file"; state reset on navigation                                                                                                                                       |

**Angular** (served under `/leaves/`, all strings English, no route guards; login page shown at any URL when no jwt `app.component.html:3-10`). Nav: "Trips" (full-page to `/trips`), "Leaves" → `list`, "Export", "Leaves approval" + red pending badge (admin); dropdown `First Surname` → "Summary", "Logout".

| URL               | Who                              | Content                                                                                                                                                                                                                    | Actions / after success                     | States / messages                                                                                                          |
| ----------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `/leaves/`        | user                             | redirect `list`                                                                                                                                                                                                            | —                                           | no wildcard route                                                                                                          |
| `list`            | user                             | "Annual / Sick leaves". Toolbar: "Add", multiselects "Requester"/"Month"/"Year", "Clear filter", "List"/"Calendar". Table: Requester, Days (`start - end (N work days)`, `?` if no numDays), Type, State, Approver, Delete | Delete (no confirm) → refetch               | no empty/loading/error state                                                                                               |
| `list` (Calendar) | user                             | FullCalendar, header `prev,next today` / title; non-rejected leaves; title `First Surname [1/2 ](T)`                                                                                                                       | —                                           | —                                                                                                                          |
| `list/add`        | user                             | "Add new leave": "Type" select default ANNUAL; "Start date" default today; "End date" follows start until edited; "Number of work days missed" (computed, disabled); "Is half day?"                                        | "Add leave" (disabled if invalid) → `/list` | "Start date must not be greater than end date"; "Half day option is allowed only within single day"; other: `<key> failed` |
| `approval`        | admin (UI link); route unguarded | "Leaves approval": pending leaves, Approve / Reject                                                                                                                                                                        | stays; row disappears via cache             | none                                                                                                                       |
| `export`          | user                             | "Month vacation/trip export": "User" default self (email match), "Select month" default today                                                                                                                              | Generate (spinner) → Download               | error message in red alert                                                                                                 |
| `summary`         | user                             | per year desc `<h2>year</h2>`, "Type: X" "Count: N"                                                                                                                                                                        | —                                           | none                                                                                                                       |

### 2.5 API contract

**GraphQL** `POST /graphql` (`server/graphql/schema.js:42-146`). Auth header `Authorization: Bearer <jwt>`. Denied calls return `null` (HTTP 200). `Result` = `{success:true}` on resolve, `{success:false,message}` on reject; success even if no document matched (`server/graphql/utils.js:1-10`).

| Operation                                     | Args                  | Returns                            | Guard (effective)       | Side effects                                     |
| --------------------------------------------- | --------------------- | ---------------------------------- | ----------------------- | ------------------------------------------------ |
| `getUserInfo`                                 | —                     | User                               | user (self)             | —                                                |
| `getUser`                                     | `id: String!`         | User                               | user (any id)           | —                                                |
| `getUsers`                                    | —                     | [User]                             | user                    | —                                                |
| `getTrips`                                    | —                     | [Trip] sorted by departureTime asc | user (all trips)        | —                                                |
| `getTrip`                                     | `id: String!`         | Trip                               | user                    | unknown id → non-null error 🟡                   |
| `getPlaces` / `getPlace(id)`                  |                       | [Place] / Place                    | user                    | —                                                |
| `getLeaves`                                   | —                     | [Leave]                            | user (all)              | —                                                |
| `loginUser`                                   | `token_id: String!`   | `LoginResult{status, jwt}`         | none                    | creates User on first login; Google token verify |
| `createTrip`                                  | `trip: TripInput`     | Trip                               | user (any userId)       | —                                                |
| `updateTrip`                                  | `id, trip: TripInput` | Result                             | admin (owner check bug) | —                                                |
| `removeTrip`                                  | `id`                  | Result                             | admin (owner check bug) | —                                                |
| `createUser`                                  | `user: UserInput`     | User                               | no resolver → null      | —                                                |
| `updateUser`                                  | `id, user: UserInput` | Result                             | 🔴 any user             | —                                                |
| `removeUser` / `approveUser`                  | `id`                  | Result / User                      | admin                   | —                                                |
| `createPlace` / `updatePlace` / `removePlace` |                       | Place / Result                     | admin                   | —                                                |
| `createLeave`                                 | `leave: LeaveInput`   | Leave                              | user                    | email to `APPROVAL_MAIL_RECEIVER`                |
| `removeLeave`                                 | `id: ID!`             | Result                             | requester or admin      | —                                                |
| `approveLeave` / `rejectLeave`                | `id: String!`         | Leave                              | admin                   | sets approverId; no email                        |

Inputs: `TripInput{userId!, placeId!, departureTime!, arrivalTime!, purpose!, travelType: TravelType!, priceOfTravel: Float!}`; `PlaceInput{name!, destinationName!, originName!, travelDuration!, country: Country}`; `UserInput{isAdmin: Boolean!, approved, firstName, surname, degrees, address, email}`; `LeaveInput{startDate!, endDate!, type: LeaveType, isHalfDay, numDays: Float}`. Dates as ISO strings (`src/data/dataUtil.js:3-5`).

**REST**

| Method / path                      | Auth                                | Input                       | Output                                                                                    | Errors                                                                                                                                                         | Side effects                                                                   |
| ---------------------------------- | ----------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `POST /refresh-jwt`                | Bearer (may be expired)             | —                           | JSON string: new JWT                                                                      | 401 missing/invalid scheme                                                                                                                                     | issues token (see Risks) `setup.js:11-17`, `operations.js:21-34`               |
| `POST /export/trips`               | user                                | `{userId, month:'YYYY-MM'}` | JSON string URL `http://<host>/../download/cestovny-prikaz-<8 digits>.xlsx`               | 401 no user; 500 any error incl. >15 trips                                                                                                                     | writes file to `server/download/` (never cleaned); currency-converter API call |
| `POST /export/detail`              | user                                | same                        | URL of `detail-<first>-<surname>-<month>-<rand>.xlsx`                                     | 401 / 500                                                                                                                                                      | writes file                                                                    |
| `GET /download/<file>`             | none                                | —                           | xlsx                                                                                      | 404                                                                                                                                                            | —                                                                              |
| `GET /api/attendence/:year/:month` | Basic `M2M_USERNAME`/`M2M_PASSWORD` | month 1–12                  | `{start, end, attendence:{[ssoName]:{days:[{logged_time, leave}], total, contractType}}}` | 401; 400 "Month is not a number." / "Year is not a number."; 500 "Cannot get data from SSO, try again later." / "Cannot get data from Toggl, try again later." | calls SSO + Toggl                                                              |
| `ALL /health-check`                | none                                | —                           | 200 `{checkMongo:'ok'}`                                                                   | 500 `{checkMongo:'<err>'}`                                                                                                                                     | Mongo query                                                                    |
| `GET /leaves/*`                    | none                                | —                           | Angular SPA                                                                               | —                                                                                                                                                              | —                                                                              |
| `GET *`                            | none                                | —                           | React SPA                                                                                 | —                                                                                                                                                              | —                                                                              |

### 2.6 Business rules

**Per-diem (stravné)** — `compute(countryCode, hours)` `src/data/Diets.js:234-256`. Hours = `|arrival − departure|` of whole trip (not split by day) `server/export/exportTravelWarrant.js:57-62`. No rounding; cell format `0.00`.

| Country              | Hours                          | Diet               |
| -------------------- | ------------------------------ | ------------------ |
| SK                   | 5 ≤ h ≤ 12                     | 4.5 €              |
| SK                   | h ≤ 18 (and also **h < 5** 🟠) | 6.7 €              |
| SK                   | h > 18                         | 10.3 €             |
| foreign              | h ≤ 6                          | 25 % of tariff     |
| foreign              | 6 < h ≤ 12                     | 50 %               |
| foreign              | h > 12                         | 100 %              |
| unknown / no country | any                            | 0 (`DEFAULT_DIET`) |

Tariffs per country (191 entries) `Diets.js:37-232`, e.g. AT 45, DE 45, HU 39, PL 37, UA 37; non-EUR converted via currency-converter: CZ 600 CZK, GB 37 GBP, US 60 USD, CH 80 CHF. Examples: SK 8h → 4.5; SK 13h → 6.7; SK 20h → 10.3; SK 3h → 6.7 (current behaviour); AT 10h → 22.5.

**Travel-warrant template choice** `exportTravelWarrant.js:8-18`

| Trips in month (by departureTime ∈ [month start, next month start)) | Template                                                |
| ------------------------------------------------------------------- | ------------------------------------------------------- |
| 0–9                                                                 | `cestovny-prikaz-upto19.xlsx` (Excel-saved, 2 A4 pages) |
| 10–15                                                               | `cestovny-prikaz-upto31.xlsx` (LibreOffice-saved)       |
| ≥ 16                                                                | no template → HTTP 500 🟠                               |

Template filling (`exportTravelWarrant.js:72-160`): `C3` = `surname, firstName, degrees`; `B4` = address. Left part row 8+ per trip: A `Bratislava, D.M.YYYY` (origin "Bratislava" hardcoded 🟡), C place.name, F purpose, H `Bratislava, <arrival D.M.YYYY>`. Right part, 4-row block per trip from row 7: J7 departure date, J9 arrival date (if different day), L7/L10 originName, L8/L9 destinationName, M7 departure `H:mm`, M8 departure + travelDuration, M9 arrival − travelDuration, M10 arrival, N7 travelType code, R7 priceOfTravel (Cestovné), S7 dietTariff (Stravné). Cached formula values stripped so Excel recalculates; column 5 width 15.56. Template formulas: block sums `W=SUM(R:V)`, totals, amortisation `W47=Q47*M47`, fuel `U49=T49*0.66+T50*0.34`, `W49=(M49/100)*P49*U49`, balance `W55=W51-W53`. 🟡 upto31 totals still sum only `R7:R44`. Approver name is static text in templates.

**Detail export / meal vouchers** `server/export/exportDetail.js`, `server/service/tripService.js`, `server/service/leaveService.js`

- Range `[month start, next month start]`; trips by `departureTime` in range; leaves overlapping range, **all states** 🟠 (`leaveService.js:8-19`).
- `isWorking(day)` = not SK holiday (date-holidays `SK`) ∧ not Sat ∧ not Sun (`tripService.js:41-45`).
- `tripDays` = sorted unique working days across trips (inclusive calendar days); `leavesDays` likewise for leaves.
- `halfDays = count(isHalfDay leaves) / 2`; `leavesCount = |leavesDays| − halfDays`.
- `expectedMealVouchers = |monthWorkingDays \ tripDays \ leavesDays| + halfDays`. 🟠 `monthWorkingDays` includes 1st of next month if a working day (`exportDetail.js:48`).
- xlsx: A1 name, B1 "Month: ", C1 `MMMM YYYY`; row 3 "Trips: " n, "Leaves: " n, "Expected meal vouchers: " n; rows 4+: trip days (col A), leave days (C), types (D), "HALF DAY" (E).

Worked examples (`server/service/tests/tripService.test.js`):

| Trips (Dec 2017)    | Working trip days                    |
| ------------------- | ------------------------------------ |
| 4 18:00 → 6 09:00   | 04, 05, 06                           |
| [5–6], [5–5], [4–5] | 04, 05, 06 (merged, deduped, sorted) |
| 24 → 27             | 27 (24 Sun, 25–26 holidays)          |
| 8 → 11              | 08, 11 (weekend skipped)             |

Example AC: 21 working days, 3 trip days, a 2-day full leave + 1 half-day leave on other day → leavesDays 3, halfDays 0.5, leavesCount 2.5, vouchers = 21 − 3 − 3 + 0.5 = 15.5.

**Work-day count (Angular)** `angular/src/app/services/holiday-count.service.ts`: normalise to 12:00 local; iterate start..end inclusive; count days with `isoWeekday() < 6` and not `Holidays('SK').isHoliday`; if count > 0 and `isHalfDay` → −0.5 (once, any range 🟡). Examples (`holiday-count.service.spec.ts`): 2017-12-07..11 → 3; 2017-12-22..30 → 4; 2017-12-11..13 half-day → 2.5.

**Leave filter** `angular/src/app/leaves/leaveFilter.ts`: empty/null filter matches all; requester ∈ `requesterIds` if non-empty; leave split per calendar year into `{year, startMonth, endMonth}` segments; year filter matches if any segment year selected; month filter (0–11) matches if a segment (in selected years, or any) covers a selected month. Year options = start/end years of all leaves + current year, desc. Examples (`leaveFilter.spec.ts`): `{years:[2018]}` → 2017-12-05 one-day false, 2017-12-05..2018-02-05 true; `{months:[0]}` → 2017-12-18..2018-01-12 true; `{months:[12,6], years:[2020]}` → 2017-12-05..2020-12-01 true.

**Calendar colours** `color.service.ts`: 15-colour palette assigned round-robin per requester email; approved opacity 1, pending 0.5; rejected hidden; end date +1 day (exclusive).

**Summary** `summary.component.ts:47-98`: own leaves (all states, incl. rejected 🟡), clipped per year, grouped by type, sum of client-recomputed work days. Spec example: three ANNUAL leaves (one crossing year) with mock 5/segment → 2018: 10, 2017: 10.

**Attendance** `server/service/attendenceService.js`

- Timezone `DEFAULT_TIMEZONE` (default `Europe/Bratislava`) set globally via `moment.tz.setDefault` (119-120).
- Rows: SSO users having `togglUserId`; only `employee === '1'` get hours/leaves (142-145).
- Hours: Toggl Reports v3 `POST https://api.track.toggl.com/reports/api/v3/workspace/{togglWorkspaceId}/search/time_entries`, per-user token from SSO; `seconds/3600` added to day and total; paginated via `x-next-row-number` with 500 ms sleep (75-116).
- Leaves: APPROVED leaves of user with same email; per working day in month: ANNUAL → `D8` (`D4` half day), SICKNESS → `PN`, DOCTOR → `L`, others → `I`; multiple joined `", "` (42-73).

**Trip duplication**: arrival' = departure' + (arrival − departure) (`DuplicateTripButton.js:70-72`).

### 2.7 Notifications and jobs

| Trigger                                                 | Recipient                     | Channel                   | Content                                                                                                                                                                                                                               | Config                                                                                                                                                                                                         |
| ------------------------------------------------------- | ----------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createLeave` (fire-and-forget) `leaveRelated.js:27-29` | `APPROVAL_MAIL_RECEIVER`      | SMTP email via nodemailer | Subject "New leave notification"; HTML: requester name, `startDate - endDate` (`dddd, MMM D, YYYY` in `DEFAULT_TIMEZONE`), type code, "Approve" link to `BASE_URL + '/leaves/approval'` (prod) or `BASE_URL + '/approval'` (non-prod) | `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_SENDER`, `BASE_URL`, `NODE_ENV`, `DEFAULT_TIMEZONE` (`mailService.js:6-54`, `urlService.js:1-8`). Missing SMTP setting → log only |
| CI build result                                         | `dev@instea.co` + individuals | Jenkins Mailer            | unstable/failed builds                                                                                                                                                                                                                | `Jenkinsfile:15`                                                                                                                                                                                               |

No email on approve/reject or registration. No scheduled jobs.

### 2.8 Acceptance criteria

**Auth**

- Given a new Google account in the hosted domain, when it logs in, then a User (approved=false, isAdmin=false) is created and "Account needs to be approved by admin first." shows.
- Given `HOSTED_DOMAIN` set and token from another domain, when login, then WRONG_DOMAIN and no user is created.
- Given an approved user, when login, then JWT (exp 1h) is stored in `localStorage.jwt` and the app shows the logged-in menu.
- Given a JWT in localStorage, when the app reloads, then the user is auto-logged-in; Angular logs out if `getUserInfo` returns null.
- Given logged in, when 15 minutes pass, then `POST /refresh-jwt` replaces the JWT.
- Given a user, when "Sign out"/"Logout" is clicked, then the JWT is removed and the Apollo cache reset.

**Users**

- Given an admin on `/users`, when "Approve" on unapproved user, then the user can log in.
- Given a non-admin on `/users/edit/<ownId>`, then "Is admin" is hidden and Email/Is approved are disabled.

**Trips**

- Given `/trips/add` as admin, then defaults are yesterday 08:00–17:00, "Osobný vlak"; empty required fields show "Required".
- Given a trip 08:00–17:00, when duplicated at D, then a new trip D → D+9h with same user/place/purpose/type/price exists.
- Given a non-admin owner, when they edit their trip, then the server returns `null` (owner check bug) and the change is not saved.

**Places**

- Given a non-admin, then `/places` is read-only and `/places/add` shows "You are not authorized to view this page!".

**Travel-warrant export**

- Given 3 trips departing in 2018-03, when Generate for 2018-03, then upto19 template is used and a Download link appears.
- Given 12 trips, then upto31; given 16 trips, then "Problem preparing file".
- Given an SK trip of 8h / 13h / 20h / 3h, then stravné 4.5 / 6.7 / 10.3 / 6.7.

**Leaves**

- Given `/list/add`, then Type ANNUAL, start = end = today, work days = 1 on a work day.
- Given end < start, then "Start date must not be greater than end date" and "Add leave" disabled.
- Given half-day with start ≠ end, then "Half day option is allowed only within single day".
- Given valid input, when "Add leave", then leave is PENDING, approver email is sent (if SMTP configured), app navigates to `/list`.
- Given an admin on `approval`, when "Approve", then state APPROVED and approver = admin.
- Given a non-owner non-admin, when "Delete", then nothing is removed (server returns null).
- Given filter months=[11], years=[2017], then only leaves overlapping Dec 2017 show.

**Attendance API**

- Given M2M credentials unset, when called, then 401.
- Given `/api/attendence/2023/may`, then 400 "Month is not a number.".
- Given an approved half-day ANNUAL leave on a weekday, then that day's `leave` is `D4`.

**Ops**

- Given Mongo down, when `/health-check`, then 500 `{checkMongo:"<err>"}`.

---

## 3. Tech stack (resolved from lockfiles)

**Root app (server + React)** — `yarn.lock`

| Area    | Package                                                                   | Version                                                                                                       |
| ------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Runtime | Node                                                                      | builder `node:8`, runtime `node:12.22-slim` (`Dockerfile:1,29`); CI Node 8 (`bin/test.sh:6`); README "node 8" |
| Server  | express                                                                   | 4.16.2, 4.17.1                                                                                                |
|         | express-graphql / graphql                                                 | 0.6.11 / 0.10.5                                                                                               |
|         | mongoose                                                                  | 4.13.5 (MongoDB `mongo:3.6` in `db/docker-compose.yml`)                                                       |
|         | express-jwt / jwt-node                                                    | 5.3.0 / 0.1.9                                                                                                 |
|         | google-auth-library                                                       | 4.2.5                                                                                                         |
|         | exceljs                                                                   | 1.6.0                                                                                                         |
|         | nodemailer                                                                | 6.3.0                                                                                                         |
|         | date-holidays                                                             | 1.2.0                                                                                                         |
|         | moment / moment-timezone                                                  | 2.19.3–2.22.2 / 0.5.14, 0.5.26                                                                                |
|         | currency-converter                                                        | 0.1.12                                                                                                        |
|         | superagent, basic-auth, cors, body-parser, bcrypt, lodash, uuid, minimist | 3.8.1, 2.0.1, 2.8.4, 1.18.2/1.19.0, 1.0.3, 4.17.4/4.17.15, 3.1.0/3.3.2, 1.2.0                                 |
| React   | react / react-dom                                                         | 16.8.0                                                                                                        |
|         | react-scripts (CRA)                                                       | 3.0.1                                                                                                         |
|         | apollo-client / react-apollo                                              | 1.9.3 / 1.4.16                                                                                                |
|         | redux / react-redux / redux-form / redux-thunk                            | 3.7.2 / 5.0.6 / 6.8.0 / (range ^2.2.0)                                                                        |
|         | react-router-redux / history                                              | 5.0.0-alpha.8 / 4.7.2                                                                                         |
|         | react-bootstrap (Bootstrap 3.3.2 CDN `public/index.html:14-15`)           | 0.31.5                                                                                                        |
|         | @react-oauth/google                                                       | 0.7.0                                                                                                         |
|         | immutable, recompose, react-datetime, react-month-picker                  | 3.8.2, 0.30.0, 2.11.0, 1.3.0                                                                                  |
| Tooling | jest (via CRA) / eslint / husky                                           | 24.7.1 / 3.19.0, 5.16.0 / 3.1.0                                                                               |

**Angular app** — `angular/yarn.lock`

| Package                                                              | Version                                |
| -------------------------------------------------------------------- | -------------------------------------- |
| @angular/* (core, common, router, forms, compiler-cli)               | 4.4.6                                  |
| @angular/cli                                                         | 1.5.5                                  |
| @ngrx/store / effects / router-store / store-devtools                | 2.2.3 / 2.0.5 / 1.2.6 / 3.2.4          |
| apollo-angular / apollo-client / apollo-cache-inmemory / apollo-link | 1.0.0 / 2.0.4 / 1.1.4 / 1.0.6          |
| graphql / graphql-tag                                                | 0.11.7 / 2.5.0                         |
| rxjs / zone.js / typescript                                          | 5.5.2 / 0.8.18 / 2.3.4                 |
| primeng / ng-fullcalendar / fullcalendar                             | 4.3.0 / 1.1.0 / 3.7.0                  |
| bootstrap / @ng-bootstrap/ng-bootstrap / font-awesome                | 4.0.0-beta.2 / 1.0.0-beta.6 / 4.7.0    |
| angular-2-dropdown-multiselect                                       | 1.6.3                                  |
| moment / date-holidays / lodash                                      | 2.19.4 / 1.2.0 / 4.17.4                |
| karma / karma-jasmine / jasmine-core / protractor                    | 1.7.1 / 1.1.1 / 2.6.4 / 5.1.2          |
| tslint / codelyzer / prettier / husky / lint-staged                  | 5.7.0 / 4.0.1 / 1.9.2 / 0.14.3 / 6.0.0 |
| webpack                                                              | 3.8.1                                  |

**Code style**: ESLint `react-app` + semi, single quotes, 2-space indent (`.eslintrc`); Prettier (`.prettierrc`, `angular/.prettierrc`); tslint + codelyzer (`angular/tslint.json`).

---

## 4. Integrations

| Service                                   | Purpose                                                                                             | Env vars                                                                                                                                       | Call sites                                                                                                                               |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Google Identity                           | User login (ID token)                                                                               | Server: `CLIENT_ID`, `HOSTED_DOMAIN`. React build: `REACT_APP_CLIENT_ID`, `REACT_APP_HOSTED_DOMAIN`. Angular: client ID hardcoded 🟡           | `server/graphql/userRelated.js:7-34`; `src/index.js:13`, `LoginForm.js:24`; `angular/src/index.html:12`, `login-page.component.ts:40-46` |
| JWT signing                               | App session tokens                                                                                  | key file `secrets/key.pem` (Docker volume `/opt/app/secrets/`)                                                                                 | `server/auth/operations.js:6`, `server/auth/setup.js:7`, `Dockerfile:39`                                                                 |
| MongoDB                                   | Data store                                                                                          | `MONGO_URL` (default local DB `data`)                                                                                                          | `server/db/connect.js:7-14`                                                                                                              |
| SMTP                                      | Pending-leave email                                                                                 | `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_SENDER`, `APPROVAL_MAIL_RECEIVER`, `BASE_URL`, `DEFAULT_TIMEZONE` | `server/service/mailService.js`, `server/service/urlService.js`                                                                          |
| SSO user directory                        | Users + Toggl keys (`togglUserId`, `togglWorkspaceId`, `togglApiToken`, `contractType`, `employee`) | `SSO_URI`, `SSO_USERNAME`, `SSO_PASSWORD`                                                                                                      | `server/service/attendenceService.js:8-17`                                                                                               |
| Toggl Track Reports API v3                | Logged hours                                                                                        | per-user token from SSO                                                                                                                        | `attendenceService.js:75-116`                                                                                                            |
| M2M client (inbound)                      | Consumes attendance API                                                                             | `M2M_USERNAME`, `M2M_PASSWORD`                                                                                                                 | `server/api/attendenceApi.js:4-22`                                                                                                       |
| currency-converter (npm, external FX API) | Convert non-EUR diet tariffs                                                                        | client key hardcoded in source 🔴                                                                                                              | `src/data/Diets.js:1-4,30-33`                                                                                                            |
| date-holidays (offline lib)               | SK public holidays                                                                                  | —                                                                                                                                              | `tripService.js:4-5`, `attendenceService.js:49`, `holiday-count.service.ts:22`                                                           |
| Jenkins Mailer                            | CI notifications                                                                                    | —                                                                                                                                              | `Jenkinsfile:15`                                                                                                                         |

---

## 5. Deployment

- **Artifact**: one Docker image with both SPA builds and the server. Multi-stage: `node:8` builds Angular (`yarn build` = `ng build --aot --env=prod && updateDist` rewriting `<base href="/leaves/">`, `angular/package.json:8-9`, `angular/tools/updateDist.js`) and React (`yarn build`, build args `REACT_APP_HOSTED_DOMAIN`, `REACT_APP_CLIENT_ID`); runtime `node:12.22-slim`, `EXPOSE 4100`, `CMD node server/index.js`, volume `/opt/app/secrets/`. `Dockerfile:1-42`.
- **Documented run**: `docker build --build-arg REACT_APP_HOSTED_DOMAIN --build-arg REACT_APP_CLIENT_ID -t cestaky:master .` then `docker run ... -v secrets:/opt/app/secrets -p 4100:4100 cestaky:master`. `README.md:152-162`.
- **Jenkins deploy**: build image `cestaky:master`, then `cd $DEPLOY_DIR; docker-compose up -d` (compose file not in repo). `Jenkinsfile:9-13`.
- **Alternative**: PM2 ecosystem (`cwd /opt/cestaky/src`, `MONGO_URL`, `NODE_ENV=production`, max memory 250M). `PM2.md`.
- **Kubernetes hint**: Mongo disconnect exits so "k8s restarts the pod" `server/db/connect.js:26-32`; `/health-check` endpoint exists. No k8s manifests in repo.
- **Environments**: dev (CRA proxy to `http://localhost:4100/` `package.json:53`; Angular `serverBase: 'http://localhost:4100'` `angular/src/environments/environment.ts`) and production (`NODE_ENV=production`, same-origin `serverBase: ''`). No staging defined in repo.

## 6. CI/CD

| Pipeline           | Trigger                                         | Steps                                                                                                                                                                            | Source                 |
| ------------------ | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| Jenkins (scripted) | Jenkins job on SCM (trigger config not in repo) | Checkout → Tests (`sh bin/test.sh`) → Build (`docker build -t cestaky:master .`) → Deploy (`docker-compose up -d` in `$DEPLOY_DIR`); `catchError` then Mailer to `dev@instea.co` | `Jenkinsfile`          |
| `bin/test.sh`      | called by Jenkins + husky pre-push              | nvm Node 8 → `yarn` → `CI=true yarn test` → `yarn lint` → `cd angular` → `yarn` → `yarn test --config karma.ci.js` (ChromeHeadless) → `yarn lint`                                | `bin/test.sh`          |
| Husky (root)       | pre-commit / pre-push                           | eslint server+src / eslint --fix + `bin/test.sh`                                                                                                                                 | `package.json:5-10`    |
| Husky (angular)    | precommit                                       | lint-staged → prettier                                                                                                                                                           | `angular/package.json` |

No GitHub Actions or other CI config in repo. CI status: unknown (no badge or status source in repo).

## 7. Getting started (from README)

```bash
git clone https://github.com/instea/Cestovne-prikazy.git ; cd Cestovne-prikazy
yarn install
pushd db && docker-compose up -d && popd          # local mongo:3.6 on 27017
mkdir -p secrets && openssl genrsa -out ./secrets/key.pem 2048
yarn server                                       # or MONGO_URL=mongodb://user:pass@host:port/db yarn server
yarn start                                        # React dev server, proxies to :4100
# set REACT_APP_CLIENT_ID / REACT_APP_HOSTED_DOMAIN in .env.local
cd angular && yarn install && yarn start          # Angular dev server (:4200), API at :4100
# first login with Google, then:
yarn promote-user --email=<google_email>
```

Tests / lint: `yarn test`, `yarn test-server`, `yarn lint`, `yarn format`; Angular `cd angular && yarn test` / `yarn lint`. Prerequisites: node 8, yarn, docker + docker-compose (`README.md:13-17`). Sources: `README.md:19-150`, `angular/README.md`, `package.json:54-65`.

---

## 8. Risks and open questions

### Risks

| Sev | Risk                                                                                                                                                                                                                                                                                   | Evidence                                                                                                                   |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 🔴  | `refreshJwt` issues a new token after **any** verify error, using `err.parsedBody.sub`; expired tokens refresh forever; no user/approved check; garbage token yields JWT with undefined sub. Possible auth bypass if `jwt-node` fills `parsedBody` on signature mismatch (unverified). | `server/auth/operations.js:21-34`                                                                                          |
| 🔴  | `updateUser` lets any user update any user (email, approved, names) — `if (!context.checkUserId)` never calls the function                                                                                                                                                             | `server/graphql/userRelated.js:70-79`                                                                                      |
| 🔴  | IDOR: exports and `createTrip` accept any `userId`; `getTrips`/`getLeaves`/`getUsers` return everyone's data                                                                                                                                                                           | `exportMiddleware.js:11-20`, `tripRelated.js:17-25`, `userRelated.js:15-19`, `leaveRelated.js:18-20`                       |
| 🔴  | Generated xlsx files are public under `/download`, 8-digit random names, never deleted                                                                                                                                                                                                 | `server/index.js:34`, `exportTravelWarrant.js:176-181`                                                                     |
| 🔴  | Hardcoded currency-converter client key in source                                                                                                                                                                                                                                      | `src/data/Diets.js:3`                                                                                                      |
| 🟠  | GraphiQL enabled in prod; CORS all origins                                                                                                                                                                                                                                             | `server/index.js:37,44`                                                                                                    |
| 🟠  | Trip owner check passes trip id → non-admins cannot edit/remove own trips; UI navigates as if saved                                                                                                                                                                                    | `tripRelated.js:28,36`; `src/actions/tripActions.js:86`                                                                    |
| 🟠  | React: non-admin cannot add trip (`AddTripForm` passes no `ownerId`)                                                                                                                                                                                                                   | `AddTripForm.js:12`, `TripForm.js:23`                                                                                      |
| 🟠  | Angular add-leave group validator returns `{}` when valid; in Angular 4 a truthy errors object marks the form INVALID → "Add leave" possibly always disabled (unverified at runtime)                                                                                                   | `angular/src/app/leaves/leaves-add/leaves-add.component.ts:66-78`                                                          |
| 🟠  | SK diet gives 6.7 € for trips < 5h; multi-day trips not split per day                                                                                                                                                                                                                  | `src/data/Diets.js:10-18`, `exportTravelWarrant.js:57-62`                                                                  |
| 🟠  | > 15 trips per month → HTTP 500                                                                                                                                                                                                                                                        | `exportTravelWarrant.js:15-18`                                                                                             |
| 🟠  | Detail export counts PENDING/REJECTED leaves; month working days include 1st of next month                                                                                                                                                                                             | `leaveService.js:8-19`, `exportDetail.js:48`                                                                               |
| 🟠  | Schema `reqired` typo → no server validation; no leave date checks; `numDays` trusted from client                                                                                                                                                                                      | `server/db/schema.js`                                                                                                      |
| 🟠  | Leaves re-approvable/rejectable without state check; requester can delete approved leave                                                                                                                                                                                               | `leaveRelated.js:32-55`                                                                                                    |
| 🟠  | Auth middleware hangs request on non-Unauthorized errors                                                                                                                                                                                                                               | `server/auth/setup.js:40-44`                                                                                               |
| 🟠  | Attendance crashes on employee without `togglUserId` / unknown Toggl user; duplicate SSO names overwrite                                                                                                                                                                               | `attendenceService.js:65,104,164`                                                                                          |
| 🟠  | Export URL hardcoded `http://` (mixed content behind HTTPS)                                                                                                                                                                                                                            | `exportMiddleware.js:22`                                                                                                   |
| 🟠  | React: refreshed JWT not written to localStorage; refresh timer starts only if jwt existed at page load; expired stored jwt not handled                                                                                                                                                | `src/core/init.js:18,27-30`; `authActions.js:56-64`                                                                        |
| 🟠  | Angular effects lack error handling (one error kills the effect stream)                                                                                                                                                                                                                | `angular/src/app/state/leave.effects.ts:28-45`, `auth.effects.ts:47-76`                                                    |
| 🟡  | Timezone sensitivity (UTC parse vs local `getDay`; global `moment.tz.setDefault`)                                                                                                                                                                                                      | `tripService.js:41-45`, `attendenceService.js:120`                                                                         |
| 🟡  | HTML injection of user names in email                                                                                                                                                                                                                                                  | `mailService.js:25`                                                                                                        |
| 🟡  | No route guards in Angular; `/export` unguarded in React; Delete shown on all leave rows                                                                                                                                                                                               | `app-routing.module.ts:10-21`, `ExportForm.js`, `leaves-list.component.html:44`                                            |
| 🟡  | End-of-life stack: Node 8/12, graphql 0.10/0.11, mongoose 4, mongo 3.6, Angular 4, apollo-client 1.x, react-router-redux alpha, Bootstrap 3 CDN / 4 beta                                                                                                                               | lockfiles, `Dockerfile`                                                                                                    |
| 🟡  | Tests minimal: server 4 jest cases; React dummy test; Angular mostly "should create" + filter/holiday/summary; e2e scaffold stale (expects "Welcome to app!"); Angular README "TODO"                                                                                                   | `server/service/tests/tripService.test.js`, `src/App.test.js`, `angular/e2e/app.e2e-spec.ts:10-13`, `angular/README.md:35` |
| 🟡  | Dead code: `createUser` SDL w/o resolver, `computeTripDuration`, unused validators, unhandled redux actions, `@angular/http` import, `date-fns` transitive import                                                                                                                      | see server/React/Angular reports                                                                                           |
| 🟡  | Root `buildall` builds Angular without prod env/base-href rewrite                                                                                                                                                                                                                      | `package.json:59`                                                                                                          |
| 🟡  | Stale docs: README says Node 8 but runtime image is Node 12; `promote-user` needs `--email` arg passing; Angular README tests "TODO"                                                                                                                                                   | `README.md:15`, `Dockerfile:29`                                                                                            |

### Open questions

1. Does `jwt-node` 0.1.9 populate `err.parsedBody` on signature mismatch? Decides whether `/refresh-jwt` is a full auth bypass.
2. Is the Angular add-leave form actually always invalid in production (Angular 4.4.6 runtime check)?
3. Was SK diet for < 5h meant to be 0 €? Should multi-day trips be split per day?
4. Should PENDING/REJECTED leaves count in detail export and summary?
5. Template names "upto19"/"upto31" vs code limits 9/15 trips — meaning? Is upto31 total `SUM(R7:R44)` intended?
6. Is the currency-converter API still alive? What happens to export if it fails?
7. Production topology: Jenkins deploys via `docker-compose` in `$DEPLOY_DIR`, but `connect.js` comments mention k8s. Real prod manifests/host are not in repo. Which is current, and is Jenkins still active?
8. Which SSO system sits behind `SSO_URI`; full key schema?
9. Should the UI be Slovak? All UI copy is English except travel-type labels and placeholders.
10. Should regular users see all users' trips and leaves?
11. CI status: no badge/status source in repo; last Jenkins result unknown.
