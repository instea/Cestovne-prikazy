# Cestovné príkazy — Project Initial Analysis

> **Generated:** 2026-11-04 · **Branch:** `master` · **Commit:** `193b89f` (`193b89ffcf87f2a77b182f8c9b116b7e591bb17b`, 2026-10-19 "ci: initialize release pipeline (#84)")
> **Scope:** whole repo (215 tracked files). Read-only static analysis. Nothing installed, built or run.
> **Legend:** 🔴 critical / security · 🟠 bug / mismatch · 🟡 warning / stale · 🟢 OK / confirmed · ❓ open question
> All paths are relative to the repo root. `A/` = `angular/src/app/`.

---

## Glossary

| Term | Meaning | Source |
|---|---|---|
| **Cestovný príkaz** (pl. *cestovné príkazy*), **cestaky** | Travel warrant: the Slovak business-trip order and expense settlement form. "cestaky" is the informal name used for the k8s deployment and image | `kubernetes/cestaky.yml:4`, `server/templates/*.xlsx` |
| **Trip** | One business trip: user, place, departure, arrival, purpose, travel type, price | `src/data/Trip.js` |
| **Place** | A predefined destination: name, origin, destination, travel duration, country | `src/data/Place.js` |
| **Leave** | Absence request (annual, sick, …), handled by the Angular sub-app at `/leaves/` | `src/data/Leave.js` |
| **Requester / Approver** | Employee who creates a leave / admin who approves or rejects it. There is no separate approver role: approver = `isAdmin` | `server/graphql/leaveRelated.js:40-55` |
| **Pending user** | Account auto-created at first Google login with `approved=false`. It cannot get a JWT until an admin approves it | `server/graphql/userRelated.js:42-61` |
| **Diéty / stravné ("Diets")** | Per-diem meal allowance by country and trip hours | `src/data/Diets.js` |
| **Cestovné** | Travel costs (`priceOfTravel`) | template col R |
| **Meal vouchers** (*stravné lístky*) | Expected count = working days − trip days − leave days + half-days | `server/export/exportDetail.js:45-52` |
| **Half day** | A single-day leave counted as 0.5 | `A/services/holiday-count.service.ts:41-43` |
| **numDays / work days** | Weekdays that are not SK public holidays (`date-holidays('SK')`) | `server/service/tripService.js:41-45` |
| **Attendence** (sic) | Machine-to-machine monthly attendance API combining SSO, Toggl and leaves | `server/api/attendenceApi.js` |
| **M2M** | Machine client using HTTP Basic auth (`M2M_USERNAME`/`M2M_PASSWORD`) | `server/api/attendenceApi.js:4-23` |
| **SSO** | Company user-directory endpoint (`SSO_URI`) that returns users with key/value attributes (togglUserId, employee, contractType …) | `server/service/attendenceService.js:8-17` |
| **Hosted domain (`hd`)** | Google Workspace domain restriction (`instea.co`) | `server/graphql/userRelated.js:12,28-33` |
| **"Deleted" user** | Placeholder returned for unknown user ids (`Deleted <id>`, `<id>@deleted.instea.co`) | `server/service/userService.js:3-18` |
| **Travel types** | O Osobný vlak (local train) · R Rýchlik (express) · A Autobus (bus) · L Lietadlo (plane) · DZ Doprava zabezpečená (transport provided) · AUS/AUV Auto služobné/vlastné (company/own car) · MOS/MOV Motocykel služobný/vlastný (company/own motorcycle) | `src/data/TravelType.js:1-11` |
| **Attendance leave codes** | D8 annual (D4 half-day) · PN sick · L doctor · I other. Expansions are interpretation; only the mapping is in code | `server/service/attendenceService.js:42-47` |
| **Template terms** | Vyúčtovanie = settlement · Odchod/Príchod = departure/arrival · Preddavok = advance · Doplatok/Preplatok = due/overpaid · Amortizácia = per-km car allowance · Spotreba PHM = fuel consumption · Bezplatne poskytnuté: Raňajky/Obed/Večera = free breakfast/lunch/dinner | `server/templates/cestovny-prikaz-upto19.xlsx` |
| **Keel** | k8s operator that auto-rolls the deployment when a new image is pushed | `kubernetes/README.md:39-81` |

---

## 1. Overview

- **What it is:** an internal Instea tool for (a) recording business trips and exporting Slovak travel-warrant xlsx forms, (b) requesting and approving leaves, and (c) a machine API that reports monthly attendance (`README.md:1-3`, `angular/README.md`, `server/api/attendenceApi.js`).
- **Users:** Instea employees signing in with Google, restricted to the hosted domain `instea.co` (`kubernetes/cestaky.yml:61-62`). Admins approve accounts and leaves and manage places. An external system pulls attendance over M2M.
- **Components:** one Node/Express process on port 4100 serves (`server/index.js:24-63`):
  - GraphQL API `/graphql`
  - REST `/refresh-jwt`, `/export/*`, `/download/*`, `/api/attendence/:y/:m`, `/health-check`
  - React SPA (trips, places, users, export) at `/`
  - Angular SPA (leaves) at `/leaves/`
  - MongoDB storage
- The SPAs share the JWT through the localStorage key `jwt` (`src/actions/authActions.js:49`, `A/auth.service.ts:72-77`).

```
                    ┌─────────────── Browser ───────────────┐
                    │  React SPA  "/"        Angular SPA "/leaves/" │
                    │  trips·places·users    leaves·approval·       │
                    │  export(trips)         calendar·export(detail)│
                    └───────┬──────── localStorage['jwt'] ──┬───────┘
         Google Identity ◄──┘ (ID token)                    │
                    ▼  GraphQL /graphql · POST /refresh-jwt · POST /export/*
┌──────────────────── Node 12 / Express :4100 (server/index.js) ───────────────────┐
│ auth (express-jwt, jwt-node, google-auth-library) │ GraphQL resolvers           │
│ export (exceljs + xlsx templates) → /download     │ mailService (nodemailer)   │
│ attendenceApi (Basic M2M)                          │ health-check                │
└──────┬──────────────┬────────────────┬──────────────┬─────────────┬─────────────┘
       ▼              ▼                ▼              ▼             ▼
   MongoDB 3.6    SMTP (Gmail)     SSO meta API    Toggl v3     currency-converter
   (mongo3 sts)   leave e-mail     (users+keys)    time entries (bundled FX rates)
                                         ▲
                          External M2M client ── GET /api/attendence/:y/:m
```

---

## 2. Functional spec

### 2.1 Features by area

**Auth**
- Google Sign-In is the only login method. Users self-register on their first login and need admin approval (`README.md:6-9`).
- Login flow (`server/graphql/userRelated.js:21-68`):
  - The server verifies the ID token against `CLIENT_ID`.
  - If `HOSTED_DOMAIN` is set and differs from the token's `hd`, the result is `WRONG_DOMAIN`.
  - Existing approved user: `SUCCESS` plus a JWT.
  - Existing unapproved user: `NEED_APPROVAL`.
  - Unknown email: a user is created (`approved:false, isAdmin:false`) and the result is `NEED_APPROVAL`.
  - Verification error: `FAILED`.
- JWT details:
  - HS256 signed with `secrets/key.pem`, `sub` = user id, lifetime 1 h (`server/auth/operations.js:6-18`).
  - Both SPAs call `POST /refresh-jwt` every 15 min (`src/core/init.js:6-31`, `angular/src/app/constants.ts:8`).
  - 🟠 React refreshes only when a JWT existed at page load, and does not persist the new token to localStorage (`src/core/init.js:24-31`, `src/reducers/user.js:5-8`).
- Autologin: on load, a JWT in localStorage triggers a user-info fetch. A null result means the token is stale (Angular logs out; React silently appears logged out) (`A/state/auth.effects.ts:88-99`, `src/actions/authActions.js:56-63`).
- Logout removes the localStorage JWT and resets the Apollo store. It affects both SPAs because the key is shared.
- First admin: create the user via Google login, then run `node server/index.js --email=<email>` to set `approved` and `isAdmin` to true (`server/index.js:18-21`, `server/db/promoteUser.js:4-17`, `README.md:60-69`).

**Trips** (React)
- List shows all trips of all users, sorted by departure ascending (`server/graphql/tripRelated.js:17`).
- Add, edit and remove (no confirm dialog).
- Duplicate: the user picks a new departure; arrival = new departure + original duration (`src/containers/trips/DuplicateTripButton.js:59-87`).

**Places** (React)
- Any logged-in user can view. Only admins can create, edit or delete (`server/graphql/placeRelated.js:6-18`).

**Users** (React, admin)
- List, approve, remove, and edit profiles. Users edit their own profile through "Profile" (`src/containers/users/*`).
- There is no create-user UI.

**Travel-warrant export** (React `/export`)
- Pick a user and a month, then Generate (`POST /export/trips`). The result is an xlsx built from a template, followed by a Download button (`src/containers/export/ExportForm.js`, `server/export/exportTravelWarrant.js`).

**Leaves** (Angular `/leaves/`)
- Create a leave request with type, start, end and half-day. The work-day count is live.
- State is forced to PENDING, and an email goes to the approver (`server/graphql/leaveRelated.js:21-31`).
- List of all leaves with Requester/Month/Year multiselect filters, a List/Calendar toggle, and Delete on each row (`A/leaves/leaves-list/*`).
- Calendar (FullCalendar):
  - REJECTED leaves are hidden. PENDING are shown at 50% opacity.
  - Each requester gets a colour (`A/leaves/leaves-calendar/leaves-calendar.component.ts:37-62`).
- Approval screen: pending leaves with Approve/Reject buttons. Nav link and badge are visible to admins only (`A/nav-header/nav-header.component.html:22-26`).
- Summary: the current user's work days per year and per type (`A/leaves/summary/summary.component.ts:47-98`).
- Detail export: `POST /export/detail` produces an xlsx with trip days, leave days and expected meal vouchers (`server/export/exportDetail.js`).

**Attendance API** (M2M)
- `GET /api/attendence/:year/:month` returns per SSO employee, per day: logged Toggl hours plus a leave code (`server/service/attendenceService.js:117-176`).

**Ops**
- `/health-check` pings Mongo and returns 200/500. It is the k8s readiness probe (`server/health-check/health-check.js`, `kubernetes/cestaky.yml:34-39`).
- If Mongo is down at connect the process exits with -1; on disconnect it exits with -2 (`server/db/connect.js:12-32`).
- Manual Mongo backup and restore scripts (`kubernetes/backup.cestaky.sh`, `kubernetes/restore.sh`).

**Jobs**
- 🟡 The server has no cron. The only timer is the hourly reload of the bundled rates file inside `currency-converter` (`src/data/Diets.js:1-4`).

### 2.2 Data model (MongoDB via Mongoose; `server/db/schema.js`)

> 🔴 All schemas spell `required` as **`reqired`** (e.g. `server/db/schema.js:12,42,71`), so Mongoose enforces **no** required fields. The only required checks are GraphQL `!` markers (`server/graphql/schema.js:7-40`).
> Notes that apply to every model:
> - Every entity is keyed by a string `id` (uuid v4 or Google `sub`), in addition to Mongo's `_id`.
> - No defaults or timestamps are defined in the schema.

**Place** (`server/db/schema.js:9-37`)

| Field | Type | Required | Default | Enum / validation | Set by |
|---|---|---|---|---|---|
| id | String | – | – | – | server uuid (`placeRelated.js:11-13`) |
| name | String | GQL `!` | – | client: Required | client (admin) |
| destinationName | String | GQL `!` | – | client: Required | client |
| originName | String | GQL `!` | – | client: Required | client |
| travelDuration | String | GQL `!` | – | ISO-8601 duration (e.g. `PT1H30M`) from slider 0–1440 min, step 15. Server does not validate the format | client (`src/data/Place.js:10-16`) |
| country | String | optional | client add: `SK` | ISO-3166 alpha-2 enum, 243 entries (`src/data/Countries.js`) | client |

**User** (`server/db/schema.js:39-66`)

| Field | Type | Required | Default | Enum / validation | Set by |
|---|---|---|---|---|---|
| id | String | – | – | `unique` | server = Google `sub` |
| email | String | – | – | `unique` | server from Google; 🔴 also writable via `updateUser` |
| firstName / surname | String | – | from Google | – | server at creation, then client |
| degrees / address | String | – | `''` | – | client |
| isAdmin | Boolean | GQL input `Boolean!` | `false` | – | admin via `updateUser` or CLI |
| approved | Boolean | – | `false` | – | admin via `approveUser`; 🔴 any user via `updateUser` (`src/data/User.js:3-6`) |

**Trip** (`server/db/schema.js:68-105`)

| Field | Type | Required | Default (client add) | Enum / validation | Set by |
|---|---|---|---|---|---|
| id | String | – | – | – | server uuid |
| userId | String | GQL `!`, client Required | none | 🟠 not forced to caller (`tripRelated.js:23`) | client |
| placeId | String | GQL `!` | – | no existence check | client |
| departureTime | Date | GQL `String!` | yesterday 08:00 | – | client ISO (`src/containers/trips/AddTripForm.js:21`) |
| arrivalTime | Date | GQL `String!` | yesterday 17:00 | 🟠 no "after departure" check (client check is dead code, `TripForm.js:60-68`) | client |
| purpose | String | GQL `!` | – | placeholder "Example: konzultácie" | client |
| travelType | String | GQL `TravelType!` | `O` | O,R,A,L,DZ,AUS,AUV,MOS,MOV | client |
| priceOfTravel | Number | GQL `Float!` | – | no min; negatives allowed | client |

**Leave** (`server/db/schema.js:107-143`)

| Field | Type | Required | Default | Enum / validation | Set by |
|---|---|---|---|---|---|
| id | String | – | – | – | server uuid |
| requesterId | String | – | – | – | server = caller |
| approverId | String | – | – | – | server = admin on approve/reject |
| startDate / endDate | Date | GQL `String!` | client: today | client: end ≥ start; 🟠 server does not check | client |
| state | String | – | `PENDING` (forced) | PENDING, APPROVED, REJECTED | server |
| type | String | optional | client: ANNUAL | ANNUAL, SICKNESS, DOCTOR ("Doctor visit"), MATERNITY, PARENTAL, CARING ("Caring for a relative at home") | client |
| isHalfDay | Boolean | optional | false | client: only when start = end; 🟠 server does not check | client |
| numDays | Number | optional | – | 🟠 computed by the client, stored and trusted, never used by the server | client |

**Client vs server validation mismatches**

| # | Mismatch | Source |
|---|---|---|
| 1 | 🔴 `reqired` typo disables every DB-level required check | `server/db/schema.js` |
| 2 | 🟠 Trip arrival > departure is not enforced anywhere | `TripForm.js:60-68` (dead) |
| 3 | 🟠 Leave date order and half-day rule exist only on the client | `A/leaves/leaves-add/leaves-add.component.ts:66-78` |
| 4 | 🟠 `travelType` is not in the client required list but is `!` on the server (a default hides this) | `TripForm.js:71` |
| 5 | 🟡 `minLength` validator is inverted and unused | `src/core/validation.js:17-19` |
| 6 | 🟡 The server has `LeaveType` labels ("Doctor visit", …); the Angular pipe shows raw codes | `A/pipes/translate-leave-type.pipe.ts:6-8` |
| 7 | 🟡 The Angular `UserInfo` has `degrees`/`address`, but the query never requests them | `A/auth.service.ts:21-32` |

### 2.3 Roles and permission matrix

Server guards (`server/auth/rootResolverDecorators.js`):
- `userProtected` requires a logged-in user.
- `ownerProtected` requires a user and installs `checkUserId`, which is always true for admins.
- `adminProtected` requires `isAdmin`.
- A denied call returns **`null` with no GraphQL error**.
- `context.user` is loaded without checking `approved` (`server/auth/setup.js:29-35`).

Roles:
- **anon**: no JWT.
- **pending**: has a user record but gets no JWT, so in practice behaves like anon.
- **user**: approved.
- **owner**: user acting on their own record.
- **admin**: `isAdmin`.
- **M2M**: Basic-auth client.

| Action | anon / pending | user | owner | admin | M2M | UI vs server |
|---|---|---|---|---|---|---|
| Login | UI ✓ / server ✓ | ✓ | – | ✓ | – | 🟢 |
| Refresh JWT | 🔴 server: **any** parseable Bearer token, even a forged one | ✓ | – | ✓ | – | 🔴 forgery (§8) |
| List users (incl. emails) | null | UI: combobox only self; server: **all** | – | all | – | 🟠 |
| Edit user profile | null | UI: own only (`UserForm.js:19`); 🔴 server: **any user**, incl. `email`/`approved` (`userRelated.js:71`) | ✓ | ✓ + isAdmin | – | 🔴 |
| Approve / remove user | null | UI hidden; server null | – | ✓ | – | 🟢 |
| List trips | UI Unauthorized | UI + server: **all** users' trips | – | ✓ | – | 🟡 by design? |
| Create trip | UI Unauthorized | 🟠 UI `/trips/add` shows Unauthorized (`TripForm.js:23`); only Duplicate works. Server: ✓ for **any userId** | – | ✓ | – | 🟠 |
| Edit / remove trip | – | UI shows buttons on own rows; 🟠 server **always denies** (trip id compared to user id, `tripRelated.js:28,36`), silent | 🟠 denied | ✓ | – | 🟠 |
| View places | UI Unauthorized | ✓ | – | ✓ | – | 🟢 |
| Create / edit / remove place | – | UI hidden + Unauthorized; server null | – | ✓ | – | 🟢 |
| List leaves | UI login only | UI + server: **all** users' leaves (`leaveRelated.js:19`) | – | ✓ | – | 🟡 |
| Create leave | null | ✓ (requester forced to self) | – | ✓ | – | 🟠 UI button likely always disabled (§2.4) |
| Delete leave | null | UI: Delete on **every** row; server: own only, **any state**, silent null on others | ✓ | any | – | 🟠 |
| Open `/approval` | – | UI link hidden but **route unguarded**; server null on approve | – | ✓ | – | 🟠 |
| Approve / reject leave | null | null (silent) | – | ✓, 🟠 including own leave, any state | – | 🟠 |
| Export trips / detail | 401 | UI: self only (React), any (Angular); 🔴 server: **any userId** | – | ✓ | – | 🔴 |
| Download `/download/*` | 🔴 **public**, guessable names | public | – | public | public | 🔴 |
| Attendance API | 401 | 401 | – | 401 | ✓ 200 | 🟢 |
| `/health-check`, static SPA | public | public | – | public | public | 🟢 |
| GraphiQL `/graphql` UI | 🟡 enabled in prod (`server/index.js:44`) | | | | | 🟡 |

### 2.4 Screens

Common to all screens:
- **React:** a spinner while loading; on error, a red alert "Error while fetching list: {msg}" (`src/components/withProgress.js:16-22`).
- **React Unauthorized:** red "You are not authorized to view this page!" (`src/components/Unauthorized.js:6`).
- **Labels:** UI text is English; only placeholders and travel types are Slovak.

**React SPA (`/`)**

| URL | Who | Fields (label · default) | Validation | Buttons / after success | States |
|---|---|---|---|---|---|
| `/` | all | – | – | redirects to `/trips/` (`src/App.js:26,34`) | – |
| `/login` | all | Google button (`hosted_domain` = `REACT_APP_HOSTED_DOMAIN`) | – | Success → `goBack()` | red "Login failed. Try again later." · red "Used email does not belong to given hosted domain." · yellow "Account needs to be approved by admin first." (`src/components/LoginResultMessage.js:10-18`) |
| `/trips` | user+ | table: Who (surname, firstName) · Destination · When (`D. M. YYYY[ - D. M. YYYY]`) · Controls | – | Remove (no confirm), Edit, Duplicate on own rows (admin: all); last row Add | empty = only Add row |
| `/trips/add` "Add trip" | 🟠 admin only (bug) | Who: · Where: (`destinationName (name)`) · Time of departure: (yesterday 08:00) · Time of arrival: (yesterday 17:00) · Purpose: ("Example: konzultácie") · Type of travel: (O) · Price of travel: | "Required" | Save → `/trips` after resolve · Cancel → back | "Problem loading users/places: {msg}" |
| `/trips/edit/:id` "Edit trip" | owner/admin | same, prefilled | "Required" | Save → `/trips` **immediately** | "Error while fetching the trip: {msg}" |
| Duplicate modal "Duplicate trip" | owner/admin | Time of departure: (original) | none | Duplicate → createTrip → `/trips` · Cancel | ❓ modal close behaviour |
| `/places` | user+ | Name · Destination name · Origin name · Travel duration (`1h 30m`) · Controls | – | admin: Remove, Edit, Add | – |
| `/places/add` / `edit/:id` | admin | Name: ("Example: Viedeň, AT") · Destination name: ("Example: Viedeň") · Origin name: ("Example: Hranica SK-AT / Bratislava") · Travel duration: slider 0–1440, step 15 · Country (SK) | "Required" (all except country) | Save → `/places` | 🟡 1440 min shows "0h 00m" |
| `/users` | admin | Email · Name (`surname[, firstName][, degrees]`) · Is admin · Is approved · Controls | – | Remove (no confirm), Edit, Approve (if unapproved) | – |
| `/users/edit/:id` | self/admin | Email: (disabled) · First name: · Surname: · Degrees: · Address: (textarea) · Is approved: (disabled) · Is admin: (admin only) | none | Save → `/users` immediately (🟠 a non-admin lands on Unauthorized) | 🟡 empty page header |
| `/export` | 🟠 no guard, not in anon menu | Who: (current user) · Month: (now; years 2017–current; `MMM YYYY`) | Who, Month required | Generate → spinner → green Download (`window.location.assign`) | red "Problem preparing file"; state resets on navigation |

Menu (`src/containers/auth/MenuBar.js:14-77`):
- Leaves (always shown).
- Trips, Places, Export (logged in).
- Users 🔒 (admin).
- Right side: "Login", or a firstName dropdown (green when admin) with Profile and Sign out.

**Angular SPA (`/leaves/`)**: there are no route guards. Every screen requires login (`A/app.component.html:3-10`).

| URL | Who | Fields (label · default) | Validation messages | Buttons / after success | States |
|---|---|---|---|---|---|
| any (logged out) | anon | Google button | same three login messages as React | renders the current route | – |
| `/list` (default) "Annual / Sick leaves" | user+ | filters Requester / Month / Year (multiselect) · table Requester · Days (`start - end (n work days)`, 0 → "?") · Type · State · Approver | – | Add → `/list/add` · Clear filter · List/Calendar · Delete on each row (refetch) | no empty/loading/error state |
| Calendar view | user+ | FullCalendar `prev,next today` / title | – | read-only; title `"<Full Name> [1/2 ](<letter>)"` | REJECTED hidden, PENDING at 50% |
| `/list/add` "Add new leave" | user+ | Type (ANNUAL) · Start date (today) · End date (follows start until edited) · Number of work days missed (disabled, live) · Is half day? (false) | "Start date must not be greater than end date" · "Half day option is allowed only within single day" · "`<key>` failed" | Add leave → `/list`. 🟠 Validator returns `{}` (truthy), so the button is likely **always disabled** (`leaves-add.component.ts:70,77`) ❓ needs a browser check | none |
| `/approval` "Leaves approval" | admin (UI link) / anyone by URL | Requester · Days · Type · State | – | Approve (green) / Reject (red); the row disappears | none |
| `/export` "Month vacation/trip export" | user+ | User (self) · Select month (now) | User required | Generate (spinner) → Download | red HTTP error message |
| `/summary` | user+ | per year `<h2>`, "Type: X" / "Count: n" | – | – | empty when the user has no leaves |

Angular nav: Trips (href `/trips`) · Leaves · Export · Leaves approval + red pending badge (admin) · dropdown "firstName surname" with Summary and Logout.

### 2.5 API contract

**GraphQL** `GET|POST /graphql`:
- Server: express-graphql 0.6.11, with 🟡 GraphiQL enabled (`server/index.js:40-45`). Schema in `server/graphql/schema.js:42-146`.
- Auth header: `Authorization: Bearer <jwt>`.
- `Result` type = `{success, message, payload}`. 🟠 `success:true` even when no document matched (`server/graphql/utils.js:1-10`).
- A denied guard returns `null`.

| Operation | Args | Returns | Guard | Side effects / notes |
|---|---|---|---|---|
| `loginUser` | `token_id: String!` | `{status, jwt}` | none | Google verify; may insert a User (not awaited) |
| `getUserInfo` | – | User | user | "Deleted" dummy if missing |
| `getUser` | `id!` | User | user | dummy if not found |
| `getUsers` | – | [User] | user | all users |
| `updateUser` | `id!, user: UserInput` | Result | owner (🔴 broken) | `$set` {firstName, surname, degrees, address, email, approved} + isAdmin if admin |
| `removeUser` | `id!` | Result | admin | hard delete; trips and leaves orphaned |
| `approveUser` | `id!` | User | admin | approved=true |
| `createUser` | `user` | User | – | 🟠 declared, **no resolver** → null (`schema.js:129`) |
| `getTrips` / `getTrip` | – / `id!` | [Trip] / Trip | user | all trips, sorted by departure |
| `createTrip` | `trip: TripInput` | Trip | user | uuid id |
| `updateTrip` / `removeTrip` | `id![, trip]` | Result | owner (🟠 broken for non-admins) | – |
| `getPlaces` / `getPlace` | – / `id!` | [Place] / Place | user | – |
| `createPlace` / `updatePlace` / `removePlace` | – | Place / Result | admin | removing a place breaks the export of trips that reference it |
| `getLeaves` | – | [Leave] | user | all leaves; requester/approver resolved |
| `createLeave` | `leave: LeaveInput` | Leave | user | state=PENDING, requester=self, **email to approver** |
| `removeLeave` | `id: ID!` | Result | owner | null if not owner/not found |
| `approveLeave` / `rejectLeave` | `id: String!` | Leave | admin | state + approverId; no state-transition check; no email |

**REST**

| Method · Path | Auth | Input | Output / status | Side effects |
|---|---|---|---|---|
| `POST /refresh-jwt` | Bearer (🔴 any) | header | 200 JSON string JWT · 401 if no Bearer header | – |
| `POST /export/trips` | JWT user | `{userId, month:"YYYY-MM"}` | 200 JSON string URL `http://<host>/../download/cestovny-prikaz-<8digits>.xlsx` · 401 · 500 | writes xlsx; FX lookup |
| `POST /export/detail` | JWT user | same | 200 URL `detail-<first>-<surname>-<YYYY-MM>-<8digits>.xlsx` | writes xlsx |
| `POST /export/<other>` | JWT | – | 500 "no exporter" | – |
| `GET /download/*` | 🔴 none | – | static file; never cleaned up | – |
| `GET /api/attendence/:year/:month` | Basic M2M | path | 200 `{start, end, attendence:{<name>:{days:[{logged_time, leave}], total, contractType}}}` · 400 `Month is not a number.` / `Year is not a number.` · 401 · 500 `Cannot get data from SSO, try again later.` / Toggl variant | calls SSO + Toggl (500 ms between pages) |
| `ANY /health-check` | none | – | 200 `{"checkMongo":"ok"}` / 500 | Mongo findOne |
| `GET /leaves/*`, `GET /*` | none | – | Angular / React index.html | – |

### 2.6 Business rules

**Working day** (`server/service/tripService.js:41-45`, `A/services/holiday-count.service.ts:22,48-59`)
- A day is a working day when it is not Saturday or Sunday and not `date-holidays('SK').isHoliday` (data from 1.2.0).
- SK holidays:
  - 01-01, 01-06
  - Good Friday, Easter Monday
  - 05-01, 05-08
  - 07-05, 08-29, 09-01, 09-15
  - 11-01, 11-17
  - 12-24, 12-25, 12-26
- Observances (Easter Sunday, Mother's Day) always fall on Sunday, so they do not change counts.

**Leave work days (client)** = count of working days in [start, end], inclusive, − 0.5 if half-day and count > 0.

| Example (tests) | Result | Source |
|---|---|---|
| 2017-12-07 → 2017-12-11 | 3 | `holiday-count.service.spec.ts:30-36` |
| 2017-12-22 → 2017-12-30 (25/26 holidays) | 4 | `:38-44` |
| 2017-12-11 → 2017-12-13, half day | 2.5 | `:46-53` |

**Trip day enumeration** (`server/service/tripService.js:47-56`)
- Step 1 day from departure while `< arrival`, then always append the arrival date, and de-duplicate.

| Example (`server/service/tests/tripService.test.js`) | Working days |
|---|---|
| Dec 4 18:00 → Dec 6 09:00 (2017) | 4, 5, 6 |
| trips [5→6],[5→5],[4→5] | 4, 5, 6 (union) |
| Dec 24 → 27 | 27 |
| Dec 8 → 11 | 8, 11 |

**Diet allowance (stravné)** (`src/data/Diets.js`)
- `h` = |arrival − departure| in hours over the **whole trip**. The rate comes from `place.country`.

| Country | Hours | Amount |
|---|---|---|
| SK | 5 ≤ h ≤ 12 | 4.50 € |
| SK | 🟠 h < 5 **or** 12 < h ≤ 18 | 6.70 € (h < 5 is likely a bug; expected 0) |
| SK | h > 18 | 10.30 € |
| foreign | h ≤ 6 | 25 % of base |
| foreign | 6 < h ≤ 12 | 50 % |
| foreign | h > 12 | 100 % |
| missing / unknown | any | 0 |

- Foreign base rates:
  - EUR numbers: AT 45, DE 45, PL 37, HU 39.
  - Converted from another currency: CZ 600 CZK, US 60 USD, GB 37 GBP, CH 80 CHF. Conversion = `amount / rate[from] × rate[EUR]`, rounded to 2 dp.
  - 🟡 Rates are bundled and frozen: EUR=0.76, CZK=21.1 per USD (`node_modules/currency-converter/app/db/rates.txt`).
- Examples: AT 6 h = 11.25 · AT 7 h = 22.50 · AT 13 h = 45 · US 13 h = 45.60 (derived).
- Free meals (template field "Bezplatne boli poskytnuté") do **not** reduce the diet.

**Travel-warrant xlsx** (`server/export/exportTravelWarrant.js`)
- Trip selection: trips with `userId` and departure in [month start, next month start), ascending.
- Template choice:
  - ≤ 9 trips: `cestovny-prikaz-upto19.xlsx`.
  - ≤ 15 trips: `cestovny-prikaz-upto31.xlsx`.
  - 🟠 More than 15: 500.
- Header cells: C3 `surname, firstName, degrees`; B4 `address`.
- Left part, one row per trip from row 8: A `Bratislava, D.M.YYYY` (🟡 origin city hardcoded) · C `place.name` · F `purpose` · H `Bratislava, <arrival>`.
- Right part, 4 rows per trip at offset `+4i`:
  - J7 departure date; J9 arrival date if different.
  - L7/L8 origin → destination; L9/L10 destination → origin.
  - M7 departure time; M8 departure + travelDuration; M9 arrival − travelDuration; M10 arrival time.
  - N7 travelType; R7 price; S7 diet.
- Template formulas:
  - Amortization 0.183 €/km.
  - Fuel `U49 = T49×0.66 + T50×0.34`.
  - Total `W51 = W49+W47+W45`; balance `W55 = W51−W53`.
  - 🟠 upto31 total row 75 sums only rows 7:44.

**Detail export** (`server/export/exportDetail.js:21-117`)
- Month range = [month start, next month start), local timezone.
- Trips are selected by **departure only**. 🟠 A trip that started in the previous month is excluded.
- Leaves are selected by overlap. 🟠 **All states** count (PENDING and REJECTED included).
- Formulas:
  - `halfDays = count(leaves with isHalfDay) / 2`
  - `leavesCount = |leaveDays| − halfDays`
  - `expectedMealVouchers = |monthWorkDays \ tripDays \ leaveDays| + halfDays`
- 🟠 Day enumeration always appends the range end (the 1st of next month), so a working 1st is counted.
- Sheet layout: A1 name · C1 `MMMM YYYY` · A3/B3 Trips · C3/D3 Leaves · E3/F3 Expected meal vouchers · from row 4: trip days (A), leave day/type/"HALF DAY" (C–E).
- Worked example (derived): Dec 2017, trip Dec 4–6, half-day leave Dec 11 → Trips 3, Leaves 0.5, Vouchers 19 − 3 − 1 + 0.5 = **15.5**.

**Attendance** (`server/service/attendenceService.js`)
- Timezone `DEFAULT_TIMEZONE`, default Europe/Bratislava. It is set as the **global** moment-timezone default.
- Users come from SSO and are included only if they have `togglUserId`. Toggl and leave data are filled only when `employee === '1'`.
- Toggl: per day, Σ seconds / 3600 by entry start date.
- Leaves: APPROVED only, on working days.
  - ANNUAL → `D8`, or `D4` when half-day.
  - SICKNESS → `PN`; DOCTOR → `L`; other types → `I`.
  - Several leaves on one day are joined with `", "`.
- Output is keyed by SSO name. 🟡 Duplicate names collide.

**Leave list filter** (`A/leaves/leaveFilter.ts:52-102`)
- Each leave is split into per-year segments.
- A leave matches when all of these hold:
  - the requester is in the list (if the list is non-empty),
  - at least one segment's year is selected (if any years are selected),
  - for the months filter, some segment in a selected year has `startMonth ≤ m ≤ endMonth`.
- Example: `months [0]` matches 2017-12-18 → 2018-01-12 (`leaveFilter.spec.ts:72-80`).

**Summary** (`A/leaves/summary/summary.component.ts:47-98`)
- Uses own leaves in **all states** (🟠 including REJECTED).
- Each leave is clipped per year, then work days are summed per type. Years are listed descending.

**Calendar colour** (`A/services/color.service.ts`)
- 15-colour palette, assigned per requester email in first-seen order.
- Alpha is 1 for APPROVED and 0.5 for other states.

**Duplicate trip**
- `newArrival = newDeparture + (origArrival − origDeparture)`. All other fields are copied.

### 2.7 Notifications and jobs

| Trigger | Recipient | Channel | Content | Schedule |
|---|---|---|---|---|
| `createLeave` saved | `APPROVAL_MAIL_RECEIVER` (prod: `pm@instea.co`, `kubernetes/cestaky.yml:60`) | SMTP (nodemailer), from `MAIL_SENDER` | Subject "New leave notification". HTML: "New leave was created and need to be approved.", requester name, `dddd, MMM D, YYYY` range in `DEFAULT_TIMEZONE`, type code, link "Approve" → `BASE_URL + /leaves/approval` (prod) or `/approval` (`server/service/mailService.js:17-54`, `server/service/urlService.js:1-8`) | immediate, fire-and-forget |
| SMTP vars missing | – | – | nothing sent; a log line is written (`mailService.js:6,38-47`) | – |
| approve / reject leave, user registration, user approval | – | – | 🟡 **no notification** implemented | – |
| FX rates reload | – | – | `currency-converter` re-reads its bundled file | every 1 h (in-process) |
| Mongo backup | ops | shell | `backup.cestaky.sh`: mongodump gzip, keeps 14 days | 🟡 manual; no CronJob manifest in repo |

### 2.8 Acceptance criteria

**Auth**
- Given an unknown Google email, when it logs in, then a User with approved=false is created and the UI shows "Account needs to be approved by admin first."
- Given `HOSTED_DOMAIN=instea.co` and a token with another `hd`, when it logs in, then the status is WRONG_DOMAIN and the UI shows "Used email does not belong to given hosted domain."
- Given an approved user, when they log in, then a JWT (`sub`=id, 1 h) is stored in `localStorage.jwt`, and both SPAs treat them as logged in.
- Given a JWT in localStorage, when the page reloads, then the user is auto-logged in and the JWT refreshes every 15 min.
- Given a stale JWT, when getUserInfo returns null, then the user is shown as logged out.
- Given no Authorization header, when `POST /refresh-jwt` is called, then the response is 401.

**Trips**
- Given an anonymous user, when they open `/trips`, then they see "You are not authorized to view this page!"
- Given a logged-in user, when they open `/trips`, then all trips show sorted by departure, with controls only on their own rows (admin: all rows).
- Given an admin on `/trips/add` with all fields filled, when they press Save, then the trip is created and the app navigates to `/trips`. Given an empty field, "Required" shows.
- Given a 9 h trip, when it is duplicated with departure D, then a new trip with arrival D+9 h and the same other fields exists.
- 🟠 Given a non-admin owner, when they edit their trip, then the server returns null and nothing changes (current behaviour; the intended behaviour is ❓).

**Places / Users**
- Given a non-admin, when they open `/places/add`, then Unauthorized shows.
- Given an admin adding a place, then the country defaults to SK. When a required field is empty, "Required" shows.
- Given an admin on `/users`, when they click Approve, then the user becomes approved and the button disappears.

**Leaves**
- Given a user on `/list/add`, then the type is ANNUAL and start = end = today. When the start date changes and the end date is untouched, the end date follows.
- Given end < start, then "Start date must not be greater than end date" shows and submit is disabled.
- Given half-day ticked and start ≠ end, then "Half day option is allowed only within single day" shows.
- Given valid input, when it is submitted, then a leave with state PENDING is stored, an email goes to the approver, and the app navigates to `/list`. 🟠 Currently likely blocked by the `{}` validator.
- Given an admin on `/approval`, when they click Approve, then state = APPROVED, approver = admin, and the badge count drops.
- Given 2017-12-22 → 2017-12-30, then the work-day count is 4.
- Given filters Year 2017 + Month December, then only leaves overlapping Dec 2017 show.

**Exports**
- Given 10–15 trips in the month, when trips are exported, then the upto31 template is used. Given > 15 trips, the response is 500.
- Given an SK trip of 4 h / 5 h / 13 h / 19 h, then the diet is 6.70 (🟠) / 4.50 / 6.70 / 10.30.
- Given no JWT, when `POST /export/*` is called, then the response is 401.

**Attendance**
- Given wrong or missing Basic credentials, then the response is 401. Given month `abc`, the response is 400 `Month is not a number.`
- Given an approved ANNUAL half-day on a working Tuesday, then that day's `leave` = `D4`.

**Health**
- Given Mongo is up, then `/health-check` returns 200 `{"checkMongo":"ok"}`. Otherwise it returns 500.

---

## 3. Tech stack

Resolved versions are from `yarn.lock` (root) and `angular/yarn.lock`.

| Area | Item | Version |
|---|---|---|
| **Runtime** | Node (build stage / runtime image) | 🟡 `node:8` / `node:12.22-slim` (`Dockerfile:1,29`) |
| | Local doc | README says "node 8" (`README.md:15`) |
| **Backend** | express | 4.16.2 |
| | express-graphql / graphql | 0.6.11 / 0.10.5 |
| | mongoose / mongodb driver | 4.13.5 / 2.2.33 |
| | express-jwt (jsonwebtoken) / jwt-node | 5.3.0 (7.4.3) / 0.1.9 |
| | google-auth-library | 4.2.5 |
| | exceljs | 1.6.0 |
| | nodemailer | 6.3.0 |
| | moment / moment-timezone | 2.19.3 / 0.5.26 |
| | date-holidays | 1.2.0 |
| | currency-converter | 0.1.12 |
| | superagent, basic-auth, cors, body-parser, uuid, minimist, lodash | 3.8.1, 2.0.1, 2.8.4, 1.18.2, 3.1.0, 1.2.0, 4.17.4 |
| | bcrypt | 1.0.3 (🟡 declared, unused) |
| **DB** | MongoDB | `mongo:3.6` (`kubernetes/mongo3.yml:47`, `db/docker-compose.yml:4`) |
| **React SPA** | react / react-dom | 16.8.0 |
| | react-scripts (CRA, webpack 4.29.6, jest 24.7.1) | 3.0.1 |
| | apollo-client / react-apollo / graphql-tag | 1.9.3 / 1.4.16 / 2.5.0 |
| | redux / react-redux / redux-form / redux-thunk | 3.7.2 / 5.0.6 / 6.8.0 / 2.2.0 |
| | react-router-redux / react-router / history | 5.0.0-alpha.8 / 4.2.0 / 4.7.2 |
| | react-bootstrap (+ Bootstrap 3.3.2 CSS from CDN) | 0.31.5 (`public/index.html:14-15`) |
| | @react-oauth/google | 0.7.0 |
| | react-datetime, react-input-enhancements, react-month-picker, react-loading-indicator, recompose, immutable | 2.11.0, 0.7.5, 1.3.0, 1.0.2, 0.30.0, 3.8.2 |
| **Angular SPA** | @angular/* / @angular/cli | 🟡 4.4.6 / 1.5.5 |
| | TypeScript / RxJS / zone.js | 2.3.4 / 5.5.2 / 0.8.18 |
| | @ngrx/store / effects / router-store | 2.2.3 / 2.0.5 / 1.2.6 |
| | apollo-angular / apollo-client / graphql | 1.0.0 / 2.0.4 / 0.11.7 |
| | bootstrap / @ng-bootstrap | 4.0.0-beta.2 / 1.0.0-beta.6 |
| | primeng / fullcalendar / ng-fullcalendar | 4.3.0 / 3.7.0 / 1.1.0 |
| | angular-2-dropdown-multiselect, font-awesome, date-holidays, moment, lodash | 1.6.3, 4.7.0, 1.2.0, 2.19.4, 4.17.4 |
| | Google Identity Services | script `accounts.google.com/gsi/client` (`angular/src/index.html:12`) |
| **Tooling** | ESLint (root `.eslintrc` extends `react-app`) | 5.16.0 via CRA |
| | Prettier (`.prettierrc`), js-beautify (`.jsbeautifyrc`) | – |
| | husky (root, v3 `husky.hooks`) | 3.1.0 |
| | Angular: karma / jasmine / protractor / tslint / codelyzer / prettier / husky / lint-staged | 1.7.1 / 2.6.4 / 5.1.2 / 5.7.0 / 4.0.1 / 1.9.2 / 0.14.3 / 6.0.0 |
| **Infra** | Docker multi-stage, MicroK8s, Keel 0.22.4, nginx ingress class `public` | `Dockerfile`, `kubernetes/` |

---

## 4. Integrations

| Service | Purpose | Config (env var names) | Call site |
|---|---|---|---|
| Google Identity | ID-token login (both SPAs) + server verification | `CLIENT_ID`, `HOSTED_DOMAIN`; build args `REACT_APP_CLIENT_ID`, `REACT_APP_HOSTED_DOMAIN`. 🟡 Angular client id hardcoded | `server/graphql/userRelated.js:10-25`, `src/containers/auth/LoginForm.js:24`, `A/login-page/login-page.component.ts:40-46` |
| MongoDB | persistence | `MONGO_URL` (default `mongodb://localhost/data`) | `server/db/connect.js:7-14` |
| SMTP (Gmail in prod) | leave notification email | `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_SENDER`, `APPROVAL_MAIL_RECEIVER`, `BASE_URL`, `NODE_ENV`, `DEFAULT_TIMEZONE` | `server/service/mailService.js:6-54`, `server/service/urlService.js` |
| SSO meta API (`sso-meta.instea.co`) | employee directory and Toggl keys for attendance | `SSO_URI`, `SSO_USERNAME`, `SSO_PASSWORD` | `server/service/attendenceService.js:8-17` |
| Toggl Track Reports API v3 | logged hours per day (`POST /reports/api/v3/workspace/{ws}/search/time_entries`, paginated by `x-next-row-number`) | per-user `togglApiToken` and `togglWorkspaceId` from SSO; no env var | `server/service/attendenceService.js:75-116` |
| M2M client (external) | consumes the attendance API | `M2M_USERNAME`, `M2M_PASSWORD` | `server/api/attendenceApi.js:4-23` |
| openexchangerates (via `currency-converter`) | FX for foreign diets. Live fetch only if the bundled file is empty | 🔴 app key **hardcoded** in `src/data/Diets.js:3` | `src/data/Diets.js:1-33` |
| date-holidays | offline SK holiday data | – | `server/service/tripService.js:4-5`, `A/services/holiday-count.service.ts` |
| Bootstrap CDN | React CSS | – | `public/index.html:14-15` |

Required secret file: `secrets/key.pem` (JWT HMAC key). In k8s it is mounted from secret `cestaky-secrets`, key `server-private-key` (`kubernetes/cestaky.yml:80-88`, `kubernetes/cestaky-secrets.yml`).

---

## 5. Deployment

- **Environments:** production only, on MicroK8s on a Contabo VPS.
  - Public URL `https://cestaky.instea.co` (`BASE_URL`, `kubernetes/cestaky.yml:42`).
  - Ingress path `/cestaky/?(.*)` with rewrite `/$1` (`kubernetes/cestaky.yml:104-122`).
  - Host nginx reverse-proxies to the k8s ingress (`kubernetes/README.md:28-29`).
  - Dev runs locally (see §7). No staging environment is defined in the repo.
- **Image:** multi-stage `Dockerfile`:
  1. `node:8` builds Angular (`yarn build` = `ng build --aot --env=prod && updateDist`, which rewrites `<base href="/leaves/">`, `angular/tools/updateDist.js`).
  2. It then builds React (`react-scripts build`).
  3. The `node:12.22-slim` runtime copies `node_modules`, `build`, `angular/dist`, `server`, and `src` (the server reuses `src/data`). It exposes 4100 and runs `CMD node server/index.js`.
- **Flow:**
  - Push to `master` → GitHub Actions `release.yml` builds and pushes `registry.instea.co/cestovne-prikazy:latest` and `:<package.json version>`.
  - The registry webhook notifies Keel (ClusterIP `10.152.183.200:9300`) → Keel force-rolls `cestaky-deployment`.
  - Keel also polls every 10 min as a fallback (`kubernetes/cestaky.yml:7-12`, `kubernetes/keel/values.yaml`, `kubernetes/README.md:39-81`).
- **k8s resources:**
  - Deployment: 1 replica, RollingUpdate maxSurge 1 / maxUnavailable 0, limits cpu 2 / mem 128Mi, readiness `/health-check`.
  - Service :80 → 4100.
  - Ingress.
  - Mongo StatefulSet `mongo3` with a 2Gi PVC on `microk8s-hostpath` (`kubernetes/mongo3.yml`).
- **Config:** env vars are inline in `kubernetes/cestaky.yml:40-74`, with secret placeholders `<username>`/`<password>`. 🟡 Real values are filled in by hand per environment (`kubernetes/README.md:4,16`).
- **Alternative (legacy):** PM2 process manager (`PM2.md`).
- **Backups:** `kubernetes/backup.cestaky.sh` (manual, 14-day retention); `kubernetes/restore.sh` restores into `cestaky-restore` DB.

---

## 6. CI/CD

| Pipeline | Trigger | Jobs | Notes |
|---|---|---|---|
| `.github/workflows/release.yml` "Release" | push to `master`, PR to `master` | `version` (reads package.json version, currently `0.1.0`) → `docker` (buildx, login `registry.instea.co` with `DOCKER_REGISTRY_USERNAME`/`DOCKER_REGISTRY_PASSWORD`; push only on `push`) → `release` (master push: delete existing `v<version>` release + tag, recreate with generated notes) | 🔴 **no tests, no lint** in CI. 🟡 The version is never bumped, so `v0.1.0` is deleted and recreated on every push |
| Keel | registry push / 10-min poll | rollout of `cestaky-deployment` | `kubernetes/cestaky.yml:8-12` |
| Local git hooks (husky) | pre-commit: eslint `./server ./src`; pre-push: eslint --fix + `bin/test.sh` | `bin/test.sh`: nvm Node 8, `CI=true yarn test`, `yarn lint`, Angular `yarn test --config karma.ci.js`, `yarn lint` | 🟡 `bin/test.sh` does **not** run `yarn test-server`. 🟡 Installed node_modules (husky 9.1.7, eslint 10.14.0) differ from the lockfile, so the hooks are likely inert |

CI status: ❓ unknown. The `gh` CLI is not installed in the analysis environment, so run history could not be read.

---

## 7. Getting started (from repo docs)

Prerequisites (`README.md:13-17`): node 8 (🟡 stale; runtime image is node 12), yarn, docker + docker-compose.

```bash
git clone https://github.com/instea/Cestovne-prikazy.git ; cd Cestovne-prikazy
yarn install
pushd db && docker-compose up -d && popd           # mongo:3.6 on :27017, no auth
openssl genrsa -out ./secrets/key.pem 2048          # JWT key (README.md:49-58)
yarn server                                         # or: MONGO_URL=mongodb://user:pass@host:port/db yarn server  (:4100)
yarn start                                          # React dev server, proxies to :4100 (package.json "proxy")
# client env in .env.local: REACT_APP_HOSTED_DOMAIN, REACT_APP_CLIENT_ID
cd angular && yarn && yarn start                    # Angular dev on :4200, API http://localhost:4100
node server/index.js --email=<google_email>         # promote first admin (README shows `yarn promote-user --email=`)
yarn test          # React (CRA/jest)     · yarn test-server  # jest server
yarn lint / yarn format
cd angular && yarn test --config karma.ci.js && yarn lint
docker build --build-arg REACT_APP_HOSTED_DOMAIN --build-arg REACT_APP_CLIENT_ID -t cestaky:master .
docker run --rm -v "$(pwd)/secrets:/opt/app/secrets" -p 4100:4100 cestaky:master   # needs -e env vars
```

Server env vars (names only): `MONGO_URL`, `CLIENT_ID`, `HOSTED_DOMAIN`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_SENDER`, `APPROVAL_MAIL_RECEIVER`, `BASE_URL`, `NODE_ENV`, `DEFAULT_TIMEZONE`, `M2M_USERNAME`, `M2M_PASSWORD`, `SSO_URI`, `SSO_USERNAME`, `SSO_PASSWORD`.

🟡 `yarn buildall` (`package.json:59`) runs a plain `ng build` without `--env=prod` or updateDist. It produces the wrong base href; use `bin/build.sh` or the Dockerfile instead.

---

## 8. Risks and open questions

### Security (spot-checked in code 🟢)

| Sev | Issue | Evidence |
|---|---|---|
| 🔴 | **JWT forgery via `/refresh-jwt`**: a token whose signature check fails is re-signed using its own `sub`. Any user id (all are visible via `getUsers`) can be impersonated, admin included | `server/auth/operations.js:21-35`, `node_modules/jwt-node/index.js:408` |
| 🔴 | **`updateUser` ownership check is a no-op** (`!context.checkUserId` is always false). Any user can edit any user's email or `approved` flag | `server/graphql/userRelated.js:70-79`, `src/data/User.js:3-6` |
| 🔴 | **Export any user's data**: `/export/*` checks login only. `/download` is public with guessable names and no cleanup | `server/export/exportMiddleware.js:11-20`, `server/index.js:34`, `server/export/exportDetail.js:96-102` |
| 🔴 | Hardcoded openexchangerates app key | `src/data/Diets.js:3` |
| 🟠 | GraphiQL enabled in production; CORS open to all origins | `server/index.js:37,44` |
| 🟠 | `createTrip` accepts any `userId`; admins can approve their own leaves; no state-transition checks | `server/graphql/tripRelated.js:23`, `server/graphql/leaveRelated.js:40-55` |
| 🟡 | Basic-auth compare is not constant-time | `server/api/attendenceApi.js:9-10` |
| 🟡 | The auth error handler never responds on non-Unauthorized errors, so the request hangs | `server/auth/setup.js:40-44` |

### Functional bugs

| Sev | Issue | Evidence |
|---|---|---|
| 🟠 | Owners cannot edit or remove their own trips (trip id compared to user id) | `server/graphql/tripRelated.js:28,36` |
| 🟠 | Non-admins get Unauthorized on `/trips/add` | `src/containers/trips/TripForm.js:23`, `AddTripForm.js:13` |
| 🟠 | Angular "Add leave" likely always disabled (`{}` validator) ❓ | `A/leaves/leaves-add/leaves-add.component.ts:70,77` |
| 🟠 | Detail export counts PENDING/REJECTED leaves and the 1st of next month; ignores trips that started in the previous month | `server/export/exportDetail.js:39-52`, `server/service/tripService.js:8-15,54` |
| 🟠 | SK diet under 5 h = 6.70 €; diet computed per trip, not per day | `src/data/Diets.js:10-18` |
| 🟠 | Travel-warrant export fails with > 15 trips or with a deleted place | `server/export/exportTravelWarrant.js:8-18,55-61` |
| 🟠 | `createUser` has no resolver; `reqired` typo; no server-side date validation | `server/graphql/schema.js:129`, `server/db/schema.js` |
| 🟠 | Attendance throws (request hangs) for an employee without `togglUserId` who has leaves | `server/service/attendenceService.js:65,157-160` |
| 🟡 | Download URL hardcodes `http://`, contains `../`, ignores the `/cestaky` prefix | `server/export/exportMiddleware.js:22` |
| 🟡 | No mutation error handling in either SPA; silent `null` on denied ops; Remove has no confirmation | `src/actions/*`, `A/state/leave.effects.ts:28-45` |

### Outdated dependencies / runtime

- 🔴 Node 8 (build) / Node 12 (runtime) are both EOL (`Dockerfile:1,29`). Mongo 3.6 is EOL (`kubernetes/mongo3.yml:47`).
- 🟡 Old or abandoned libraries:
  - Server: graphql 0.10, express-graphql 0.6, mongoose 4 (`useMongoClient`), jwt-node 0.1.9, lodash 4.17.4 (prototype-pollution CVEs), exceljs 1.6, currency-converter 0.1.12, moment (maintenance mode).
  - React: react-scripts 3.0.1, Apollo 1.x, react-router-redux alpha, react-bootstrap 0.31 / Bootstrap 3, redux-form 6, recompose (deprecated).
  - Angular: Angular 4.4.6 / CLI 1.5, TypeScript 2.3, ngrx 2, Bootstrap 4 beta.
- 🟡 Statutory data may be stale: diet rates cite a 2011 law link (`src/data/Diets.js:36`); km rate 0.183 €/km in the template; SK holiday data from date-holidays 1.2.0 (2017); FX rates frozen in the bundled file.

### Tests

- 🔴 CI runs no tests (`.github/workflows/release.yml`).
- React: one dummy test (`src/App.test.js:1-3`).
- Server: 4 cases (`server/service/tests/tripService.test.js`). Nothing covers auth, resolvers, diets, exports or attendance.
- Angular:
  - 16 spec files with 31 `it` blocks, mostly "should create" smoke tests.
  - Real logic tests exist for leaveFilter, holiday-count and summary.
  - The e2e test is stale: it expects "Welcome to app!" (`angular/e2e/app.e2e-spec.ts:12`).

### Stale docs

- `README.md:15` says "node 8"; the runtime is node 12.
- `README.md:68` uses `yarn promote-user --email=…`. The script is `node server/index.js` (`package.json:55`); yarn passes the argument through, so it works.
- `README.md:154` mentions a "Contabo image registry"; the workflow uses `registry.instea.co`.
- `kubernetes/README.md:1-4` has TODOs.
- `angular/README.md` is the CLI boilerplate.
- `docs/` held no specs before this file.

### Open questions ❓

1. Intended trip permissions: should owners edit and delete their own trips, and may non-admins create trips via `/trips/add`?
2. Should list queries (trips, leaves, users) and exports be scoped to the caller, or is company-wide visibility intended?
3. Should the detail export count only APPROVED leaves, as attendance does? Is counting the 1st of next month intended?
4. Diet rules: should SK trips under 5 h get 0? Should multi-day trips be paid per day? Should free meals reduce the allowance? What are the current legal diet and km rates?
5. Is the Angular add-leave form actually blocked at runtime? How are leaves created today?
6. Should a summary or export include PENDING/REJECTED leaves? Should admins be able to approve their own leave, and users delete APPROVED leaves?
7. What is the SSO endpoint contract (keys, `employee` values, `contractType` meaning)?
8. Toggl: is `end_date` inclusive? How should entries crossing midnight be attributed?
9. Does the generated download URL work behind https and the `/cestaky` ingress prefix?
10. The upto31 template total row sums rows 7:44 only. Is that intentional?
11. CI run status and history (needs `gh` or the GitHub UI). Why is the version fixed at `0.1.0`?
12. Why does `node_modules` (husky 9.1.7, eslint 10.14.0) diverge from `yarn.lock`?
13. Does `GoogleLogin` in `@react-oauth/google` 0.7.0 honour the `hosted_domain` prop?
14. Which timezone does the container run in? Does the global moment-timezone default set by the attendance service affect export day boundaries?
15. Is there a staging environment, and is there scheduled execution of `backup.cestaky.sh` outside the repo?
