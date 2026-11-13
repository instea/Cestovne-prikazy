# Traceability matrix: user stories → tests

Every user story of the rewrite specification
([`PROJECT_REWRITE_SPEC.md` §2](tech-rewrite/PROJECT_REWRITE_SPEC.md#2-features-by-area))
mapped to the tests that prove it. The stories are the oracle of the
rewrite: they are never edited to make the new implementation pass. A
mismatch with the old system is either fixed in the new code or is an
approved change listed in
[functional spec §10](functional-spec.md#10-changes-vs-the-old-system).

[`scripts/traceability-matrix.spec.mjs`](../scripts/traceability-matrix.spec.mjs)
(Vitest project `docs`, part of `pnpm test:unit` and CI) fails when:

- a story of §2 is missing here, or a story here is not in §2 word for word
  (the source references in parentheses are left out);
- a story has no test;
- a cited test file is missing, or the cited test title no longer occurs in
  it (renamed or deleted test);
- a cited file does not match its level (Unit: `*.spec.ts(x)` /
  `*.spec.mjs`; Integration: `*.int-spec.ts`; E2E: `e2e/specs/*.spec.ts`);
- the summary table disagrees with the story sections.

The removed features of §2 "Out of scope (removed)" have no row: they are
not built.

## Contents

- [Levels](#levels)
- [Summary](#summary)
- [Authentication and accounts](#authentication-and-accounts)
- [User administration](#user-administration)
- [Leave requests](#leave-requests)
- [Leave list and calendar](#leave-list-and-calendar)
- [Leave approval](#leave-approval)
- [Leave summary](#leave-summary)
- [Work-day rules](#work-day-rules)
- [Notifications](#notifications)
- [Attendance API (M2M)](#attendance-api-m2m)
- [Operations](#operations)
- [Stories without an E2E test](#stories-without-an-e2e-test)

## Levels

| Level | What | Command |
| --- | --- | --- |
| Unit | Business rules in `packages/shared`, API units, React component tests (Vitest) | `pnpm test:unit` |
| Integration | API against MongoDB 8 and Mailpit, contract tests against recorded SSO / Toggl / Google fixtures | `pnpm test:integration` |
| E2E | Playwright against the production image | `pnpm e2e:stack` |
| Parity | Old and new app side by side on the same data ([MIG-03](../apps/api/test/parity/README.md)); every difference is classified as an [approved change](functional-spec.md#10-changes-vs-the-old-system) | `pnpm parity` |

Each test is cited as `file › test title` (for a parameterized test, the
title template or the enclosing `describe`).

## Summary

| Story | Unit | Integration | E2E | Parity |
| --- | :---: | :---: | :---: | :---: |
| [US-01](#us-01) | ✓ | ✓ | ✓ | – |
| [US-02](#us-02) | ✓ | ✓ | ✓ | – |
| [US-03](#us-03) | ✓ | ✓ | ✓ | – |
| [US-04](#us-04) | ✓ | – | ✓ | – |
| [US-05](#us-05) | ✓ | ✓ | ✓ | – |
| [US-06](#us-06) | ✓ | ✓ | ✓ | – |
| [US-07](#us-07) | – | ✓ | – | – |
| [US-08](#us-08) | ✓ | ✓ | ✓ | – |
| [US-09](#us-09) | ✓ | ✓ | ✓ | – |
| [US-10](#us-10) | ✓ | ✓ | ✓ | – |
| [US-11](#us-11) | ✓ | ✓ | ✓ | – |
| [US-12](#us-12) | ✓ | ✓ | ✓ | – |
| [US-13](#us-13) | – | ✓ | – | – |
| [US-14](#us-14) | – | ✓ | – | – |
| [US-15](#us-15) | ✓ | – | ✓ | – |
| [US-16](#us-16) | ✓ | ✓ | ✓ | – |
| [US-17](#us-17) | ✓ | – | – | – |
| [US-18](#us-18) | ✓ | – | ✓ | – |
| [US-19](#us-19) | ✓ | ✓ | ✓ | – |
| [US-20](#us-20) | – | ✓ | ✓ | – |
| [US-21](#us-21) | ✓ | ✓ | – | – |
| [US-22](#us-22) | ✓ | – | ✓ | – |
| [US-23](#us-23) | ✓ | ✓ | ✓ | – |
| [US-24](#us-24) | ✓ | ✓ | ✓ | – |
| [US-25](#us-25) | ✓ | – | ✓ | – |
| [US-26](#us-26) | ✓ | – | ✓ | – |
| [US-27](#us-27) | ✓ | – | ✓ | – |
| [US-28](#us-28) | ✓ | – | – | – |
| [US-29](#us-29) | ✓ | – | ✓ | – |
| [US-30](#us-30) | ✓ | – | ✓ | – |
| [US-31](#us-31) | ✓ | – | ✓ | – |
| [US-32](#us-32) | ✓ | ✓ | ✓ | – |
| [US-33](#us-33) | ✓ | ✓ | ✓ | – |
| [US-34](#us-34) | ✓ | ✓ | ✓ | – |
| [US-35](#us-35) | ✓ | ✓ | ✓ | – |
| [US-36](#us-36) | ✓ | ✓ | ✓ | – |
| [US-37](#us-37) | ✓ | ✓ | ✓ | ✓ |
| [US-38](#us-38) | ✓ | ✓ | ✓ | ✓ |
| [US-39](#us-39) | ✓ | ✓ | ✓ | – |
| [US-40](#us-40) | ✓ | ✓ | – | – |
| [US-41](#us-41) | ✓ | ✓ | – | – |
| [US-42](#us-42) | ✓ | ✓ | – | ✓ |
| [US-43](#us-43) | ✓ | ✓ | – | ✓ |
| [US-44](#us-44) | ✓ | ✓ | – | ✓ |
| [US-45](#us-45) | ✓ | ✓ | – | ✓ |
| [US-46](#us-46) | ✓ | ✓ | – | ✓ |
| [US-47](#us-47) | ✓ | ✓ | – | ✓ |
| [US-48](#us-48) | ✓ | ✓ | – | ✓ |
| [US-49](#us-49) | ✓ | ✓ | – | ✓ |
| [US-50](#us-50) | ✓ | ✓ | – | – |
| [US-51](#us-51) | – | ✓ | – | – |
| [US-52](#us-52) | – | ✓ | – | – |

## Authentication and accounts

### US-01

> User signs in only with Google; accounts restricted to the hosted domain `instea.co`

- Unit
  - [`apps/api/src/auth/login.service.spec.ts`](../apps/api/src/auth/login.service.spec.ts) › `hostedDomainMatches (AUTH-01)`
  - [`apps/web/src/pages/LoginPage.spec.tsx`](../apps/web/src/pages/LoginPage.spec.tsx) › `renders the Google button with the client id and hd hint from config`
- Integration
  - [`apps/api/test/contract/google.contract.int-spec.ts`](../apps/api/test/contract/google.contract.int-spec.ts) › `hd different from HOSTED_DOMAIN → verified, but the login refuses it`
  - [`apps/api/test/auth/google-login.int-spec.ts`](../apps/api/test/auth/google-login.int-spec.ts) › `wrong audience`
- E2E
  - [`e2e/specs/login.spec.ts`](../e2e/specs/login.spec.ts) › `a wrong-domain account sees the hosted-domain message`

### US-02

> Unknown Google account from the hosted domain is registered on first login and can use the app immediately, with no admin approval

- Unit
  - [`apps/api/src/auth/login.service.spec.ts`](../apps/api/src/auth/login.service.spec.ts) › `maps the spec example: lowercased email, active non-admin`
  - [`apps/web/src/pages/LoginPage.spec.tsx`](../apps/web/src/pages/LoginPage.spec.tsx) › `has no approval message or action`
- Integration
  - [`apps/api/test/auth/google-login.int-spec.ts`](../apps/api/test/auth/google-login.int-spec.ts) › `registers an unknown account: 200, session, cookie, one audit entry`
- E2E
  - [`e2e/specs/login.spec.ts`](../e2e/specs/login.spec.ts) › `first login registers the user and lands on /leaves`

### US-03

> Login shows distinct messages for failure and wrong domain

- Unit
  - [`apps/web/src/pages/LoginPage.spec.tsx`](../apps/web/src/pages/LoginPage.spec.tsx) › `shows the failure message when Google returns no credential`
- Integration
  - [`apps/api/test/contract/google.contract.int-spec.ts`](../apps/api/test/contract/google.contract.int-spec.ts) › `hd missing → verified, but the login refuses it (WRONG_DOMAIN)`
  - [`apps/api/test/auth/google-login.int-spec.ts`](../apps/api/test/auth/google-login.int-spec.ts) › `401 LOGIN_FAILED when email_verified is false`
- E2E
  - [`e2e/specs/login.spec.ts`](../e2e/specs/login.spec.ts) › `a wrong-domain account sees the hosted-domain message`

### US-04

> Session survives page reload; an invalid or expired session shows the user as logged out

- Unit
  - [`apps/web/src/App.spec.tsx`](../apps/web/src/App.spec.tsx) › `restores the session from the refresh cookie on reload`
  - [`apps/web/src/api/client.spec.ts`](../apps/web/src/api/client.spec.ts) › `ends the session when refresh fails`
- E2E
  - [`e2e/specs/login.spec.ts`](../e2e/specs/login.spec.ts) › `reload keeps the session`
  - [`e2e/specs/login.spec.ts`](../e2e/specs/login.spec.ts) › `without the refresh cookie a reload goes to /login`

### US-05

> Session is renewed while the user is active, without the old forgery hole and without losing the renewed token

- Unit
  - [`apps/web/src/auth/session.spec.ts`](../apps/web/src/auth/session.spec.ts) › `keeps renewing every ~14 min while the app is open`
  - [`apps/api/src/auth/access-token.service.spec.ts`](../apps/api/src/auth/access-token.service.spec.ts) › `checks the signature before expiry (expired forgery is INVALID)`
- Integration
  - [`apps/api/test/auth/session.int-spec.ts`](../apps/api/test/auth/session.int-spec.ts) › `rotates: new access + refresh token, sliding expiry, cookie attributes`
  - [`apps/api/test/auth/session.int-spec.ts`](../apps/api/test/auth/session.int-spec.ts) › `forged-token regression: an expired or forged JWT never yields a token (old /refresh-jwt)`
  - [`apps/api/test/auth/session.int-spec.ts`](../apps/api/test/auth/session.int-spec.ts) › `two simultaneous refreshes with the same cookie: exactly one succeeds`
- E2E
  - [`e2e/specs/login.spec.ts`](../e2e/specs/login.spec.ts) › `API calls keep working past the access-token lifetime (AUTH-02)`

### US-06

> User can log out

- Unit
  - [`apps/web/src/App.spec.tsx`](../apps/web/src/App.spec.tsx) › `logs out: calls the API, clears the session and goes to /login`
- Integration
  - [`apps/api/test/auth/logout.int-spec.ts`](../apps/api/test/auth/logout.int-spec.ts) › `revokes the family with LOGOUT and clears the cookie`
- E2E
  - [`e2e/specs/login.spec.ts`](../e2e/specs/login.spec.ts) › `logout goes to /login and stays logged out after reload (AUTH-03)`

### US-07

> First admin is promoted by email through a CLI command

- Integration
  - [`apps/api/test/cli/promote-admin.int-spec.ts`](../apps/api/test/cli/promote-admin.int-spec.ts) › `promotes by trimmed, case-insensitive email and writes a cli audit entry`
  - [`apps/api/test/cli/promote-admin.int-spec.ts`](../apps/api/test/cli/promote-admin.int-spec.ts) › `unknown email: exit 1, not-found message, nothing written`

### US-08

> Deactivated users get no access to any endpoint and are not re-activated by logging in again

- Unit
  - [`apps/web/src/App.spec.tsx`](../apps/web/src/App.spec.tsx) › `a protected call answering 401 USER_DEACTIVATED → /login with the message`
- Integration
  - [`apps/api/test/auth/deactivated.int-spec.ts`](../apps/api/test/auth/deactivated.int-spec.ts) › `covers at least the known session routes`
  - [`apps/api/test/auth/deactivated.int-spec.ts`](../apps/api/test/auth/deactivated.int-spec.ts) › `403 USER_DEACTIVATED, no session, user document unchanged`
  - [`apps/api/test/auth/deactivated.int-spec.ts`](../apps/api/test/auth/deactivated.int-spec.ts) › `an active session gets 401 USER_DEACTIVATED on the next call`
- E2E
  - [`e2e/specs/login.spec.ts`](../e2e/specs/login.spec.ts) › `a deactivated user sees the deactivated message`
  - [`e2e/specs/login.spec.ts`](../e2e/specs/login.spec.ts) › `a user deactivated while signed in is sent to /login with the message (AUTH-05)`

## User administration

### US-09

> Admin sees all users: email, name, admin flag, active / deactivated status

- Unit
  - [`apps/web/src/users/UsersPage.spec.tsx`](../apps/web/src/users/UsersPage.spec.tsx) › `lists users in API order with Email, Name, Admin, Status and actions`
- Integration
  - [`apps/api/test/users/users-api.int-spec.ts`](../apps/api/test/users/users-api.int-spec.ts) › `admin: 200, every user incl. deactivated, sorted by surname, firstName, email`
  - [`apps/api/test/users/users-api.int-spec.ts`](../apps/api/test/users/users-api.int-spec.ts) › `non-admin: 403 FORBIDDEN`
- E2E
  - [`e2e/specs/user-admin.spec.ts`](../e2e/specs/user-admin.spec.ts) › `the admin sees the user list with names, admin flag and status`

### US-10

> Admin edits a user's first name, surname and admin flag

- Unit
  - [`apps/web/src/users/EditUserPage.spec.tsx`](../apps/web/src/users/EditUserPage.spec.tsx) › `saves names and the admin flag: only changed fields, toast, back to the list with the new values`
  - [`apps/api/src/users/user-edit-body.pipe.spec.ts`](../apps/api/src/users/user-edit-body.pipe.spec.ts) › `accepts names and the admin flag, each alone`
- Integration
  - [`apps/api/test/users/users-api.int-spec.ts`](../apps/api/test/users/users-api.int-spec.ts) › `200: names + admin flag → new values, USER_UPDATED + USER_ROLE_CHANGED with the same at, listed by GET /api/users`
- E2E
  - [`e2e/specs/user-admin.spec.ts`](../e2e/specs/user-admin.spec.ts) › `the admin edits names and the admin flag; empty name is rejected`

### US-11

> User edits own first name and surname; email and admin flag are read-only for non-admins

- Unit
  - [`apps/web/src/users/ProfilePage.spec.tsx`](../apps/web/src/users/ProfilePage.spec.tsx) › `shows email and admin flag read-only, names editable`
- Integration
  - [`apps/api/test/users/users-api.int-spec.ts`](../apps/api/test/users/users-api.int-spec.ts) › `200: changes the surname, /api/auth/me returns it, one USER_UPDATED entry`
  - [`apps/api/test/users/user-data-permissions.int-spec.ts`](../apps/api/test/users/user-data-permissions.int-spec.ts) › `email is editable by nobody: 403 FIELD_NOT_EDITABLE on every user-edit endpoint`
  - [`apps/api/test/users/user-data-permissions.int-spec.ts`](../apps/api/test/users/user-data-permissions.int-spec.ts) › `isAdmin: a non-admin gets 403 FIELD_NOT_EDITABLE on /me and 403 FORBIDDEN on /:id`
- E2E
  - [`e2e/specs/user-admin.spec.ts`](../e2e/specs/user-admin.spec.ts) › `a user edits the own profile; email and admin flag are read-only (USR-03)`

### US-12

> Admin deactivates a user (soft delete); the user's leaves keep their requester

- Unit
  - [`apps/web/src/users/UsersPage.spec.tsx`](../apps/web/src/users/UsersPage.spec.tsx) › `confirm: dialog text, request, toast, list refetched with the Deactivated badge`
- Integration
  - [`apps/api/test/users/users-api.int-spec.ts`](../apps/api/test/users/users-api.int-spec.ts) › `200: active=false, deactivatedAt set, isAdmin kept, every refresh token revoked, audit entry, leaves untouched and still named`
  - [`apps/api/test/leaves/list-leaves.int-spec.ts`](../apps/api/test/leaves/list-leaves.int-spec.ts) › `keeps the deactivated requester and resolves the approver`
- E2E
  - [`e2e/specs/user-admin.spec.ts`](../e2e/specs/user-admin.spec.ts) › `deactivate: Cancel keeps the user; confirm signs them out everywhere; leaves stay listed`

### US-13

> Users are created only by first Google login; no manual create

- Integration
  - [`apps/api/test/auth/google-login.int-spec.ts`](../apps/api/test/auth/google-login.int-spec.ts) › `registers an unknown account: 200, session, cookie, one audit entry`
  - [`apps/api/test/authz/permissions.int-spec.ts`](../apps/api/test/authz/permissions.int-spec.ts) › `every route has a matrix row and every row a route`
  - [`apps/api/test/users/users-api.int-spec.ts`](../apps/api/test/users/users-api.int-spec.ts) › `no reactivation and no hard delete: both routes are 404 NOT_FOUND`

The route matrix ([`apps/api/test/permissions.ts`](../apps/api/test/permissions.ts))
has no `POST /api/users`; a new route without a matrix row fails the
permissions test.

### US-14

> Degrees and address fields are removed

- Integration
  - [`apps/api/test/users/users-api.int-spec.ts`](../apps/api/test/users/users-api.int-spec.ts) › `returns UserDto shape only (no _id, __v, degrees, approved)`

### US-15

> Remove/deactivate actions ask for confirmation

- Unit
  - [`apps/web/src/users/UsersPage.spec.tsx`](../apps/web/src/users/UsersPage.spec.tsx) › `confirm: dialog text, request, toast, list refetched with the Deactivated badge`
  - [`apps/web/src/leaves/DeleteLeaveAction.spec.tsx`](../apps/web/src/leaves/DeleteLeaveAction.spec.tsx) › `asks for confirmation with requester, dates and type`
- E2E
  - [`e2e/specs/user-admin.spec.ts`](../e2e/specs/user-admin.spec.ts) › `deactivate: Cancel keeps the user; confirm signs them out everywhere; leaves stay listed`
  - [`e2e/specs/leave-delete.spec.ts`](../e2e/specs/leave-delete.spec.ts) › `a user deletes an own leave after confirming; Cancel keeps it`

## Leave requests

### US-16

> User creates a leave with type (default ANNUAL), start date (default today), end date (follows start until edited) and half-day flag

- Unit
  - [`apps/web/src/leaves/NewLeavePage.spec.tsx`](../apps/web/src/leaves/NewLeavePage.spec.tsx) › `opens with Type = Annual leave, Start = End = today, unchecked half day, today counted`
  - [`apps/web/src/leaves/NewLeavePage.spec.tsx`](../apps/web/src/leaves/NewLeavePage.spec.tsx) › `End follows Start until End is edited`
  - [`apps/api/src/leaves/create-leave.dto.spec.ts`](../apps/api/src/leaves/create-leave.dto.spec.ts) › `applies the defaults: ANNUAL, full day`
- Integration
  - [`apps/api/test/leaves/create-leave.int-spec.ts`](../apps/api/test/leaves/create-leave.int-spec.ts) › `no type → stored type ANNUAL`
- E2E
  - [`e2e/specs/leave-create.spec.ts`](../e2e/specs/leave-create.spec.ts) › `full day: listed as Pending and the approver gets one email`

### US-17

> Leave types: ANNUAL, SICKNESS, DOCTOR, MATERNITY, PARENTAL, CARING, shown with readable labels, not raw codes

- Unit
  - [`packages/shared/src/leaves.spec.ts`](../packages/shared/src/leaves.spec.ts) › `LEAVE_TYPES holds exactly the 6 codes in display order`
  - [`apps/web/src/leaves/NewLeavePage.spec.tsx`](../apps/web/src/leaves/NewLeavePage.spec.tsx) › `offers every leave type in LEAVE_TYPES order with readable labels`
  - [`apps/web/src/leaves/LeavesPage.spec.tsx`](../apps/web/src/leaves/LeavesPage.spec.tsx) › `shows every user's leaves with requester, days, type, state and approver`

### US-18

> Form shows a live count of missed work days

- Unit
  - [`apps/web/src/leaves/NewLeavePage.spec.tsx`](../apps/web/src/leaves/NewLeavePage.spec.tsx) › `WD-01 2017-12-11 → 2017-12-13 half day: count 2.5 (3 − 0.5) with the half-day message`
- E2E
  - [`e2e/specs/leave-create.spec.ts`](../e2e/specs/leave-create.spec.ts) › `multi-day over a weekend and a holiday counts work days only`

### US-19

> End date must not be before start date; half-day allowed only for a single day; enforced on client and server

- Unit
  - [`packages/shared/src/leaves.spec.ts`](../packages/shared/src/leaves.spec.ts) › `rejects endDate before startDate`
  - [`packages/shared/src/leaves.spec.ts`](../packages/shared/src/leaves.spec.ts) › `rejects a half day over several days`
  - [`apps/web/src/leaves/NewLeavePage.spec.tsx`](../apps/web/src/leaves/NewLeavePage.spec.tsx) › `End before Start: message, count 0, submit disabled`
- Integration
  - [`apps/api/test/leaves/create-leave.int-spec.ts`](../apps/api/test/leaves/create-leave.int-spec.ts) › `endDate < startDate → 400 LEAVE_END_BEFORE_START; nothing stored, audited or mailed`
  - [`apps/api/test/leaves/create-leave.int-spec.ts`](../apps/api/test/leaves/create-leave.int-spec.ts) › `a multi-day half-day → 400 LEAVE_HALF_DAY_MULTIPLE_DAYS`
- E2E
  - [`e2e/specs/leave-create.spec.ts`](../e2e/specs/leave-create.spec.ts) › `validation messages block submit`

### US-20

> New leave is always PENDING and its requester is always the caller

- Integration
  - [`apps/api/test/leaves/create-leave.int-spec.ts`](../apps/api/test/leaves/create-leave.int-spec.ts) › `201: PENDING, requester = caller, numDays 5; stored, audited and mailed`
  - [`apps/api/test/leaves/create-leave.int-spec.ts`](../apps/api/test/leaves/create-leave.int-spec.ts) › `a body with %s → 400 VALIDATION_FAILED`
  - [`apps/api/test/leaves/create-leave.int-spec.ts`](../apps/api/test/leaves/create-leave.int-spec.ts) › `an admin creates a leave for themselves only`
- E2E
  - [`e2e/specs/leave-create.spec.ts`](../e2e/specs/leave-create.spec.ts) › `full day: listed as Pending and the approver gets one email`

### US-21

> Work-day count is computed by the server, not trusted from the client

- Unit
  - [`apps/api/src/leaves/create-leave.dto.spec.ts`](../apps/api/src/leaves/create-leave.dto.spec.ts) › `CreateLeaveDto validation (LV-01)`
- Integration
  - [`apps/api/test/leaves/create-leave.int-spec.ts`](../apps/api/test/leaves/create-leave.int-spec.ts) › `a body with %s → 400 VALIDATION_FAILED`
  - [`apps/api/test/leaves/create-leave.int-spec.ts`](../apps/api/test/leaves/create-leave.int-spec.ts) › `a weekend (2026-11-07 → 2026-11-08) → 201, numDays 0`

### US-22

> Add-leave form submits when input is valid (fixes the always-disabled button)

- Unit
  - [`apps/web/src/leaves/NewLeavePage.spec.tsx`](../apps/web/src/leaves/NewLeavePage.spec.tsx) › `sends one POST, goes to /leaves, shows the toast and the new PENDING leave`
- E2E
  - [`e2e/specs/leave-create.spec.ts`](../e2e/specs/leave-create.spec.ts) › `full day: listed as Pending and the approver gets one email`

### US-23

> User deletes only own leaves; admin deletes any leave; Delete is shown only where allowed and asks for confirmation

- Unit
  - [`apps/api/src/leaves/leave-rules.spec.ts`](../apps/api/src/leaves/leave-rules.spec.ts) › `mayDeleteLeave (LV-03)`
  - [`apps/web/src/leaves/DeleteLeaveAction.spec.tsx`](../apps/web/src/leaves/DeleteLeaveAction.spec.tsx) › `a user sees Delete on their own row only, no placeholder elsewhere`
  - [`apps/web/src/leaves/DeleteLeaveAction.spec.tsx`](../apps/web/src/leaves/DeleteLeaveAction.spec.tsx) › `an admin sees Delete on every row`
- Integration
  - [`apps/api/test/leaves/delete-leave.int-spec.ts`](../apps/api/test/leaves/delete-leave.int-spec.ts) › `another user's leave → 403 FORBIDDEN; the leave still exists`
  - [`apps/api/test/leaves/delete-leave.int-spec.ts`](../apps/api/test/leaves/delete-leave.int-spec.ts) › `an admin deletes another user's APPROVED leave → 204, actor = admin`
- E2E
  - [`e2e/specs/leave-delete.spec.ts`](../e2e/specs/leave-delete.spec.ts) › `a user deletes an own leave after confirming; Cancel keeps it`
  - [`e2e/specs/leave-delete.spec.ts`](../e2e/specs/leave-delete.spec.ts) › `a user sees no Delete on a colleague's leave`
  - [`e2e/specs/leave-delete.spec.ts`](../e2e/specs/leave-delete.spec.ts) › `an admin deletes a colleague's leave`

## Leave list and calendar

### US-24

> Every user sees all users' leaves: requester, days (`start - end (n work days)`), type, state, approver

- Unit
  - [`apps/web/src/leaves/LeavesPage.spec.tsx`](../apps/web/src/leaves/LeavesPage.spec.tsx) › `shows every user's leaves with requester, days, type, state and approver`
  - [`apps/web/src/leaves/leave-format.spec.ts`](../apps/web/src/leaves/leave-format.spec.ts) › `formats EN dates like the old list and the work-day count`
- Integration
  - [`apps/api/test/leaves/list-leaves.int-spec.ts`](../apps/api/test/leaves/list-leaves.int-spec.ts) › `returns every user's leaves to a user, sorted by startDate descending`
- E2E
  - [`e2e/specs/leave-list.spec.ts`](../e2e/specs/leave-list.spec.ts) › `lists the leaves of two users with all columns`

### US-25

> Filters by requester, month and year (multiselect), matched per year segment of a leave; Clear filter

- Unit
  - [`packages/shared/src/filters.spec.ts`](../packages/shared/src/filters.spec.ts) › `a month matching only in a non-selected year does not match`
  - [`packages/shared/src/filters.spec.ts`](../packages/shared/src/filters.spec.ts) › `requester + month + year: only that requester covering July 2026`
  - [`apps/web/src/leaves/LeavesFilters.spec.tsx`](../apps/web/src/leaves/LeavesFilters.spec.tsx) › `Clear filter empties all three selections and shows all leaves`
- E2E
  - [`e2e/specs/calendar.spec.ts`](../e2e/specs/calendar.spec.ts) › `filters apply to the calendar and carry over from the list`

### US-26

> Toggle between list and calendar view

- Unit
  - [`apps/web/src/leaves/LeavesPage.spec.tsx`](../apps/web/src/leaves/LeavesPage.spec.tsx) › `keeps the Calendar view across navigation; List is the default`
- E2E
  - [`e2e/specs/leave-list.spec.ts`](../e2e/specs/leave-list.spec.ts) › `the view toggle persists across navigation`

### US-27

> Month calendar with prev / next / today; REJECTED hidden, PENDING at 50% opacity

- Unit
  - [`apps/web/src/leaves/LeavesCalendar.spec.tsx`](../apps/web/src/leaves/LeavesCalendar.spec.tsx) › `navigates with prev / next / today`
  - [`apps/web/src/leaves/LeavesCalendar.spec.tsx`](../apps/web/src/leaves/LeavesCalendar.spec.tsx) › `hides REJECTED leaves`
  - [`packages/shared/src/calendar.spec.ts`](../packages/shared/src/calendar.spec.ts) › `has alpha 0.5 for PENDING`
- E2E
  - [`e2e/specs/calendar.spec.ts`](../e2e/specs/calendar.spec.ts) › `approved and pending leaves are shown on their days, rejected hidden`
  - [`e2e/specs/calendar.spec.ts`](../e2e/specs/calendar.spec.ts) › `prev / next / today navigation`

### US-28

> Each requester gets a stable colour from a 15-colour palette; event title `<Full Name> [1/2 ](<type letter>)`

- Unit
  - [`packages/shared/src/calendar.spec.ts`](../packages/shared/src/calendar.spec.ts) › `matches the spec test vectors (FNV-1a 32-bit mod 15)`
  - [`packages/shared/src/calendar.spec.ts`](../packages/shared/src/calendar.spec.ts) › `keeps the old 15-colour palette`
  - [`packages/shared/src/calendar.spec.ts`](../packages/shared/src/calendar.spec.ts) › ``PENDING half-day DOCTOR: `1/2 (D)` and alpha 0.5``
  - [`apps/web/src/leaves/LeavesCalendar.spec.tsx`](../apps/web/src/leaves/LeavesCalendar.spec.tsx) › `a user keeps the colour with and without a filter`

### US-29

> List, calendar and actions show loading, empty and error states

- Unit
  - [`apps/web/src/leaves/LeavesPage.spec.tsx`](../apps/web/src/leaves/LeavesPage.spec.tsx) › `shows the spinner while loading`
  - [`apps/web/src/leaves/LeavesCalendar.spec.tsx`](../apps/web/src/leaves/LeavesCalendar.spec.tsx) › `empty: info line, calendar still rendered and navigable`
  - [`apps/web/src/leaves/DeleteLeaveAction.spec.tsx`](../apps/web/src/leaves/DeleteLeaveAction.spec.tsx) › `403 → error toast with the translated code; the row stays`
- E2E
  - [`e2e/specs/leave-list.spec.ts`](../e2e/specs/leave-list.spec.ts) › `loading state while the list is slow`
  - [`e2e/specs/leave-list.spec.ts`](../e2e/specs/leave-list.spec.ts) › `error state with Retry`
  - [`e2e/specs/leave-list.spec.ts`](../e2e/specs/leave-list.spec.ts) › `empty state`

## Leave approval

### US-30

> Admin sees pending leaves with Approve / Reject; the row disappears after the action

- Unit
  - [`apps/web/src/approval/ApprovalPage.spec.tsx`](../apps/web/src/approval/ApprovalPage.spec.tsx) › `lists every PENDING leave (own included) in API order; badge shows 3`
  - [`apps/web/src/approval/ApprovalPage.spec.tsx`](../apps/web/src/approval/ApprovalPage.spec.tsx) › `Reject: row gone, toast "Leave rejected.", badge drops`
- E2E
  - [`e2e/specs/approval.spec.ts`](../e2e/specs/approval.spec.ts) › `approve: row disappears, badge decrements, requester gets the email`
  - [`e2e/specs/approval.spec.ts`](../e2e/specs/approval.spec.ts) › `reject: row disappears and the requester gets the email`

### US-31

> Admin nav shows a badge with the pending count

- Unit
  - [`apps/web/src/App.spec.tsx`](../apps/web/src/App.spec.tsx) › `hides the pending badge at 0 and shows the count otherwise`
  - [`apps/web/src/approval/ApprovalPage.spec.tsx`](../apps/web/src/approval/ApprovalPage.spec.tsx) › `refreshes the badge on every window focus, also within the 30 s staleTime (no polling)`
- E2E
  - [`e2e/specs/approval.spec.ts`](../e2e/specs/approval.spec.ts) › `approve: row disappears, badge decrements, requester gets the email`

### US-32

> Approve / reject sets the state and records the approving admin

- Unit
  - [`apps/api/src/leaves/leave-rules.spec.ts`](../apps/api/src/leaves/leave-rules.spec.ts) › `applyDecision (APR-01 transition table)`
  - [`apps/api/src/leaves/leave-rules.spec.ts`](../apps/api/src/leaves/leave-rules.spec.ts) › `never changes numDays, dates, type or requester`
- Integration
  - [`apps/api/test/leaves/decide-leave.int-spec.ts`](../apps/api/test/leaves/decide-leave.int-spec.ts) › `200 ${NEW_STATE[action]}, approver = caller, audit entry, nothing else changed`
  - [`apps/api/test/leaves/decide-leave.int-spec.ts`](../apps/api/test/leaves/decide-leave.int-spec.ts) › `admin B re-approves a leave approved by admin A: approver = B, second entry`
- E2E
  - [`e2e/specs/approval.spec.ts`](../e2e/specs/approval.spec.ts) › `on /leaves an admin re-approves a rejected leave and rejects an approved one`

### US-33

> Approval screen and actions are admin-only on client and server

- Unit
  - [`apps/web/src/approval/ApprovalPage.spec.tsx`](../apps/web/src/approval/ApprovalPage.spec.tsx) › `a non-admin on /approval gets the not-authorized text and no API call`
  - [`apps/web/src/leaves/LeaveDecisionButtons.spec.tsx`](../apps/web/src/leaves/LeaveDecisionButtons.spec.tsx) › `a non-admin sees no Approve / Reject on any row`
- Integration
  - [`apps/api/test/leaves/decide-leave.int-spec.ts`](../apps/api/test/leaves/decide-leave.int-spec.ts) › `%s as a non-admin → 403 FORBIDDEN (own, other and unknown leave); nothing changes`
  - [`apps/api/test/authz/permissions.int-spec.ts`](../apps/api/test/authz/permissions.int-spec.ts) › `every route declares its access level, equal to the matrix`
- E2E
  - [`e2e/specs/approval.spec.ts`](../e2e/specs/approval.spec.ts) › `a user has no Approve / Reject buttons on /leaves (NFR-01)`
  - [`e2e/specs/login.spec.ts`](../e2e/specs/login.spec.ts) › `a user sees none of them and gets the unauthorized text by URL`

### US-34

> Denied actions return an explicit error, never a silent empty result

- Unit
  - [`apps/web/src/approval/ApprovalPage.spec.tsx`](../apps/web/src/approval/ApprovalPage.spec.tsx) › `403 → "You are not allowed to do this."; the row stays`
- Integration
  - [`apps/api/test/leaves/decide-leave.int-spec.ts`](../apps/api/test/leaves/decide-leave.int-spec.ts) › `%s: unknown or malformed id → 404 LEAVE_NOT_FOUND for an admin`
  - [`apps/api/test/users/users-api.int-spec.ts`](../apps/api/test/users/users-api.int-spec.ts) › `non-admin on another user → 403 FORBIDDEN (old silent success fixed)`
  - [`apps/api/test/authz/permissions.int-spec.ts`](../apps/api/test/authz/permissions.int-spec.ts) › `an unknown /api route is 404 NOT_FOUND (error body)`
- E2E
  - [`e2e/specs/approval.spec.ts`](../e2e/specs/approval.spec.ts) › `a leave deleted meanwhile shows the not-found toast and disappears`

## Leave summary

### US-35

> User sees own work days per year and per leave type, clipped per year, years descending

- Unit
  - [`packages/shared/src/summary.spec.ts`](../packages/shared/src/summary.spec.ts) › `worked example: 7 / 7`
  - [`packages/shared/src/summary.spec.ts`](../packages/shared/src/summary.spec.ts) › `splits a leave spanning 3 years (2024-12-30 → 2026-01-02) into 3 parts`
  - [`apps/web/src/summary/SummaryPage.spec.tsx`](../apps/web/src/summary/SummaryPage.spec.tsx) › `shows one section per year, descending, with type labels and work days`
- Integration
  - [`apps/api/test/leaves/leave-summary.int-spec.ts`](../apps/api/test/leaves/leave-summary.int-spec.ts) › `an admin sees only their own summary`
- E2E
  - [`e2e/specs/summary.spec.ts`](../e2e/specs/summary.spec.ts) › `counts only APPROVED leaves, per year and type`

### US-36

> Summary counts only APPROVED leaves

- Unit
  - [`packages/shared/src/summary.spec.ts`](../packages/shared/src/summary.spec.ts) › `counts APPROVED only: L3 REJECTED, L1 PENDING → 4 / 3`
- Integration
  - [`apps/api/test/leaves/leave-summary.int-spec.ts`](../apps/api/test/leaves/leave-summary.int-spec.ts) › `returns only the caller's APPROVED leaves, recomputed from the dates`
- E2E
  - [`e2e/specs/summary.spec.ts`](../e2e/specs/summary.spec.ts) › `counts only APPROVED leaves, per year and type`
  - [`e2e/specs/summary.spec.ts`](../e2e/specs/summary.spec.ts) › `an approval in the admin's browser shows up in the requester's summary`

## Work-day rules

### US-37

> A working day is Monday–Friday and not a Slovak public holiday

- Unit
  - [`packages/shared/src/workdays.spec.ts`](../packages/shared/src/workdays.spec.ts) › `isWorkingDay`
  - [`packages/shared/src/workdays.spec.ts`](../packages/shared/src/workdays.spec.ts) › `returns exactly the 11 SK public holidays of 2026`
  - [`packages/shared/src/workdays.spec.ts`](../packages/shared/src/workdays.spec.ts) › `excludes observances`
- Integration
  - [`apps/api/test/leaves/create-leave.int-spec.ts`](../apps/api/test/leaves/create-leave.int-spec.ts) › `a weekend (2026-11-07 → 2026-11-08) → 201, numDays 0`
- E2E
  - [`e2e/specs/leave-create.spec.ts`](../e2e/specs/leave-create.spec.ts) › `multi-day over a weekend and a holiday counts work days only`
  - [`e2e/specs/leave-create.spec.ts`](../e2e/specs/leave-create.spec.ts) › `Easter: Good Friday and Easter Monday are not work days`
- Parity
  - [MIG-03 attendance parity](../apps/api/test/parity/README.md): leave codes are written on working days only; a date whose status changed is the approved class `HOLIDAY_REFRESH` (§10 #6)

### US-38

> Leave work days = working days in [start, end] inclusive, minus 0.5 for a half-day; existing test examples (3, 4, 2.5) keep passing

- Unit
  - [`packages/shared/src/workdays.spec.ts`](../packages/shared/src/workdays.spec.ts) › `leaveWorkDays`
  - [`packages/shared/src/workdays.spec.ts`](../packages/shared/src/workdays.spec.ts) › `never returns -0.5 for a half-day on a non-working day`
- Integration
  - [`apps/api/test/leaves/create-leave.int-spec.ts`](../apps/api/test/leaves/create-leave.int-spec.ts) › `a half-day on one working day → numDays 0.5`
- E2E
  - [`e2e/specs/leave-create.spec.ts`](../e2e/specs/leave-create.spec.ts) › `half day on a single day counts 0.5`
- Parity
  - [MIG-03 attendance parity](../apps/api/test/parity/README.md): `D8` / `D4` codes per working day of each approved leave

## Notifications

### US-39

> New leave sends an email to the configured approver address (`APPROVAL_MAIL_RECEIVER`, prod `pm@instea.co`) with requester, date range in the default timezone, type and an Approve link

- Unit
  - [`apps/api/src/notifications/leave-mail.templates.spec.ts`](../apps/api/src/notifications/leave-mail.templates.spec.ts) › `renders the exact HTML`
  - [`apps/api/src/notifications/leave-mail.templates.spec.ts`](../apps/api/src/notifications/leave-mail.templates.spec.ts) › `formatMailDate`
  - [`apps/api/src/notifications/leave-notifications.service.spec.ts`](../apps/api/src/notifications/leave-notifications.service.spec.ts) › `sends one email to APPROVAL_MAIL_RECEIVER`
- Integration
  - [`apps/api/test/notifications/leave-notifications.int-spec.ts`](../apps/api/test/notifications/leave-notifications.int-spec.ts) › `sends one email to APPROVAL_MAIL_RECEIVER`
- E2E
  - [`e2e/specs/leave-create.spec.ts`](../e2e/specs/leave-create.spec.ts) › `full day: listed as Pending and the approver gets one email`

### US-40

> Approve link in the email points to the real approval screen URL

- Unit
  - [`apps/api/src/notifications/leave-notifications.service.spec.ts`](../apps/api/src/notifications/leave-notifications.service.spec.ts) › `NODE_ENV=production: link is still {BASE_URL}/approval`
  - [`apps/api/src/notifications/leave-mail.templates.spec.ts`](../apps/api/src/notifications/leave-mail.templates.spec.ts) › `joins the link without a double slash`
- Integration
  - [`apps/api/test/notifications/leave-notifications.int-spec.ts`](../apps/api/test/notifications/leave-notifications.int-spec.ts) › `sends one email to APPROVAL_MAIL_RECEIVER`

### US-41

> When SMTP is not configured, no email is sent and a log line is written

- Unit
  - [`apps/api/src/mail/mail.service.spec.ts`](../apps/api/src/mail/mail.service.spec.ts) › `not configured: sends nothing and logs exactly one warn line`
- Integration
  - [`apps/api/test/mail/mail.int-spec.ts`](../apps/api/test/mail/mail.int-spec.ts) › `not configured: logs one warn line and Mailpit receives nothing`
  - [`apps/api/test/leaves/create-leave.int-spec.ts`](../apps/api/test/leaves/create-leave.int-spec.ts) › `201, no email, and the NOT-01 warn line`

## Attendance API (M2M)

### US-42

> `GET /api/attendence/:year/:month` keeps its path, Basic M2M auth and JSON contract `{start, end, attendence:{<name>:{days:[{logged_time, leave}], total, contractType}}}`

- Unit
  - [`apps/api/src/attendance/m2m-auth.spec.ts`](../apps/api/src/attendance/m2m-auth.spec.ts) › `compares both fields over 32-byte digests even when the username mismatches`
- Integration
  - [`apps/api/test/attendance/attendance-api.int-spec.ts`](../apps/api/test/attendance/attendance-api.int-spec.ts) › `reproduces the March 2024 worked example byte-for-byte`
  - [`apps/api/test/attendance/attendance-api.int-spec.ts`](../apps/api/test/attendance/attendance-api.int-spec.ts) › `correct username, wrong password → 401`
  - [`apps/api/test/contract/attendance.contract.int-spec.ts`](../apps/api/test/contract/attendance.contract.int-spec.ts) › `attendance JSON contract (golden files)`
- Parity
  - [MIG-03 attendance parity](../apps/api/test/parity/README.md): status, `Content-Type`, body bytes and structure of every month, old vs new

### US-43

> Error responses keep their status and text: 400 `Month is not a number.` / `Year is not a number.`, 401, 500 SSO / Toggl messages

- Unit
  - [`apps/api/src/attendance/attendance.controller.spec.ts`](../apps/api/src/attendance/attendance.controller.spec.ts) › `parseAttendanceParams (ATT-01 validation and normalization)`
- Integration
  - [`apps/api/test/contract/attendance.contract.int-spec.ts`](../apps/api/test/contract/attendance.contract.int-spec.ts) › `attendance error contract (golden files)`
  - [`apps/api/test/attendance/attendance-api.int-spec.ts`](../apps/api/test/attendance/attendance-api.int-spec.ts) › `SSO fails → 500 SSO message`
  - [`apps/api/test/attendance/attendance-api.int-spec.ts`](../apps/api/test/attendance/attendance-api.int-spec.ts) › `no Authorization header → 401, empty body, no WWW-Authenticate`
- Parity
  - [MIG-03 attendance parity](../apps/api/test/parity/README.md): `YYYY/0`, `YYYY/13`, `YYYY/1.5`, `Infinity/1`, `1e20/3`, `abc/1`, `2024/abc`

### US-44

> Employees come from the SSO directory; only users with `togglUserId` are listed; Toggl and leave data only when `employee === '1'`

- Unit
  - [`apps/api/src/attendance/attendance.assembly.spec.ts`](../apps/api/src/attendance/attendance.assembly.spec.ts) › `lists users with truthy togglUserId in SSO order, any employee flag`
  - [`apps/api/src/attendance/sso/sso.client.spec.ts`](../apps/api/src/attendance/sso/sso.client.spec.ts) › `flattens keys in order (spec example)`
- Integration
  - [`apps/api/test/contract/sso.contract.int-spec.ts`](../apps/api/test/contract/sso.contract.int-spec.ts) › `predicates: listed = truthy togglUserId, employee = "1"`
  - [`apps/api/test/attendance/attendance.int-spec.ts`](../apps/api/test/attendance/attendance.int-spec.ts) › `a non-employee gets a zero entry with no Toggl call and no DB lookup`
- Parity
  - [MIG-03 attendance parity](../apps/api/test/parity/README.md): the ordered outgoing SSO and Toggl requests of both apps are compared

### US-45

> Logged hours per day = sum of Toggl entry seconds / 3600 by entry start date, paginated Toggl Reports v3 calls with 500 ms between pages

- Unit
  - [`apps/api/src/attendance/toggl/toggl.client.spec.ts`](../apps/api/src/attendance/toggl/toggl.client.spec.ts) › `sums entries by start day (spec example)`
  - [`apps/api/src/attendance/toggl/toggl.client.spec.ts`](../apps/api/src/attendance/toggl/toggl.client.spec.ts) › `paging example 51, 101, absent: three calls, three pauses, entries in order`
  - [`apps/api/src/attendance/toggl/toggl.client.spec.ts`](../apps/api/src/attendance/toggl/toggl.client.spec.ts) › `keeps a midnight-crossing entry on its start day`
- Integration
  - [`apps/api/test/attendance/toggl.int-spec.ts`](../apps/api/test/attendance/toggl.int-spec.ts) › `follows X-Next-Row-Number across pages in order`
  - [`apps/api/test/contract/toggl.contract.int-spec.ts`](../apps/api/test/contract/toggl.contract.int-spec.ts) › `POST search/time_entries with Basic base64(token:api_token) and the exact JSON body`
- Parity
  - [MIG-03 attendance parity](../apps/api/test/parity/README.md): `logged_time` and `total` per day, and the paged Toggl requests

### US-46

> Leave code per working day, APPROVED leaves only: ANNUAL `D8` (half-day `D4`), SICKNESS `PN`, DOCTOR `L`, other `I`; several joined with `", "`

- Unit
  - [`apps/api/src/attendance/attendance.assembly.spec.ts`](../apps/api/src/attendance/attendance.assembly.spec.ts) › `leaveCode`
  - [`apps/api/src/attendance/attendance.assembly.spec.ts`](../apps/api/src/attendance/attendance.assembly.spec.ts) › `joins with ", " in call order`
  - [`apps/api/src/attendance/attendance.assembly.spec.ts`](../apps/api/src/attendance/attendance.assembly.spec.ts) › `writes codes only on working days`
- Integration
  - [`apps/api/test/attendance/attendance.int-spec.ts`](../apps/api/test/attendance/attendance.int-spec.ts) › `REJECTED and PENDING leaves only → every leave is empty`
  - [`apps/api/test/attendance/attendance.int-spec.ts`](../apps/api/test/attendance/attendance.int-spec.ts) › `reproduces the March 2024 worked example byte-for-byte`
- Parity
  - [MIG-03 attendance parity](../apps/api/test/parity/README.md): `leave` per day; differences only as `HOLIDAY_REFRESH`, `LEAVE_YEAR_CHECK` or `MIGRATION_REPORT`

### US-47

> Day boundaries use `DEFAULT_TIMEZONE` (default Europe/Bratislava)

- Unit
  - [`apps/api/src/attendance/toggl/toggl.client.spec.ts`](../apps/api/src/attendance/toggl/toggl.client.spec.ts) › `entryDayIndex`
- Integration
  - [`apps/api/test/contract/toggl.contract.int-spec.ts`](../apps/api/test/contract/toggl.contract.int-spec.ts) › `toggl.dst-boundary.json: local day across both DST switches`
  - [`apps/api/test/contract/toggl.contract.int-spec.ts`](../apps/api/test/contract/toggl.contract.int-spec.ts) › `toggl.outside-month-local.json: UTC outside, local inside / next month`
- Parity
  - [MIG-03 attendance parity](../apps/api/test/parity/README.md): both apps run with `TZ` and `DEFAULT_TIMEZONE` = Europe/Bratislava

### US-48

> Output is keyed by SSO name; duplicate names collide — preserved quirk

- Unit
  - [`apps/api/src/attendance/attendance.assembly.spec.ts`](../apps/api/src/attendance/attendance.assembly.spec.ts) › `collides duplicate names: later data, first position`
- Integration
  - [`apps/api/test/contract/attendance.contract.int-spec.ts`](../apps/api/test/contract/attendance.contract.int-spec.ts) › `duplicate SSO names: one key, the later user, the first position`
- Parity
  - [MIG-03 attendance parity](../apps/api/test/parity/README.md): key order is part of the structural diff

### US-49

> An employee without `togglUserId` who has leaves no longer hangs the request

- Unit
  - [`apps/api/src/attendance/toggl/toggl.client.spec.ts`](../apps/api/src/attendance/toggl/toggl.client.spec.ts) › `makes no call and no pause without togglWorkspaceId`
- Integration
  - [`apps/api/test/attendance/attendance-api.int-spec.ts`](../apps/api/test/attendance/attendance-api.int-spec.ts) › `employee without togglUserId but with leaves → 200, no entry (no hang)`
  - [`apps/api/test/attendance/attendance.int-spec.ts`](../apps/api/test/attendance/attendance.int-spec.ts) › `skips an employee without togglUserId (no hang, no Toggl call)`
- Parity
  - [MIG-03 attendance parity](../apps/api/test/parity/README.md): the old app times out, the new one answers 200 (approved classes `HANG_FIX`, `NO_TOGGL_ID_SKIPPED`, §10 #24)

## Operations

### US-50

> Health-check endpoint pings the database, returns 200 / 500 and serves as the k8s readiness probe

- Unit
  - [`apps/api/src/health/health.service.spec.ts`](../apps/api/src/health/health.service.spec.ts) › `times out a hanging ping after 2000 ms`
- Integration
  - [`apps/api/test/health/health.int-spec.ts`](../apps/api/test/health/health.int-spec.ts) › `returns 200 {"checkMongo":"ok"} with no-store`
  - [`apps/api/test/health/health.int-spec.ts`](../apps/api/test/health/health.int-spec.ts) › `returns 500 within 2.5 s and exits 254 after the DB goes away`
  - [`apps/api/test/ops/manifests.int-spec.ts`](../apps/api/test/ops/manifests.int-spec.ts) › `uses the OPS-01 probes`

### US-51

> App fails fast when the database is unreachable so k8s restarts it

- Integration
  - [`apps/api/test/health/process.int-spec.ts`](../apps/api/test/health/process.int-spec.ts) › `exits 255 when MongoDB is unreachable at startup`
  - [`apps/api/test/health/process.int-spec.ts`](../apps/api/test/health/process.int-spec.ts) › `exits 254 when the DB connection is lost`

### US-52

> Manual database backup (gzip dump, 14-day retention) and restore scripts, updated for MongoDB 8

- Integration
  - [`apps/api/test/ops/backup-restore.int-spec.ts`](../apps/api/test/ops/backup-restore.int-spec.ts) › `backs up to <dir>/cestaky-<timestamp>.gz, valid gzip, and applies retention`
  - [`apps/api/test/ops/backup-restore.int-spec.ts`](../apps/api/test/ops/backup-restore.int-spec.ts) › `restores into cestaky-restore with the same collections and counts`

## Stories without an E2E test

The validation methodology makes E2E tests mandatory for functional
correctness. These stories have none, on purpose:

| Story | Why no browser test | Covered instead by |
| --- | --- | --- |
| [US-07](#us-07) | CLI, no UI | Integration test of the built CLI against MongoDB |
| [US-13](#us-13), [US-14](#us-14) | Absence of a feature | Route matrix and DTO shape tests |
| [US-17](#us-17), [US-28](#us-28) | Labels and colours are visible in other E2E tests | Unit tests with exact values (labels, FNV-1a test vectors) |
| [US-21](#us-21) | A client value cannot be sent from the UI | API integration test sending `numDays` |
| [US-40](#us-40), [US-41](#us-41) | Email content and SMTP configuration | Exact-HTML unit tests, Mailpit integration tests |
| [US-42](#us-42) – [US-49](#us-49) | M2M endpoint, no browser | Contract tests on recorded SSO / Toggl fixtures, and the old-vs-new [parity run](../apps/api/test/parity/README.md) |
| [US-50](#us-50) – [US-52](#us-52) | Operations | Integration tests on the built app, image and scripts; the [cutover rehearsal](../deploy/CUTOVER.md) runs them on migrated data |
