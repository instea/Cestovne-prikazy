# Cestovné príkazy → Leaves app — Project Rewrite Specification

- **Project:** Cestovné príkazy ("cestaky"), rewritten as a single leave-management app
- **Created:** 2026-11-04
- **Source technical analysis:** `docs/tech-rewrite/PROJECT_INITIAL_ANALYSIS.md` (branch `master`, commit `193b89f` / `193b89ffcf87f2a77b182f8c9b116b7e591bb17b`)
- **Client assessment:** "Rewrite Project – Analysis" (questionnaire sheet), pasted 2026-11-04. Goal: *1:1 rewrite + defined changes*; keep only the leaves module, travel orders no longer needed, one app for leave management
- **Interview:** Instea, 2026-11-04 (6 rounds)
- **Source legend:** `analysis: §x` = technical analysis section · `interview: <topic>` = Instea interview answer · `input NFR: <name>` = client NFR · `client assessment: <factor>` = client factor

## 1. Target platform and tech stack

### Platform

| Layer | Current (from analysis) | Target | Source |
|---|---|---|---|
| Hosting | MicroK8s on Contabo VPS, host nginx → ingress class `public` | Same MicroK8s cluster and host nginx | (interview: Target platform) |
| Image registry / rollout | `registry.instea.co`, Keel auto-rollout | Same registry and Keel; new manifests | (interview: Target platform) |
| Environments | Production only; dev local | Production + local (docker-compose) + CI; no staging | (interview: Environments) |
| Database hosting | Mongo StatefulSet `mongo3`, 2Gi hostpath PVC | MongoDB 8 StatefulSet on same cluster | (interview: API & DB) |

### App: Leaves server (API)

| Layer | Current (from analysis) | Target | Source |
|---|---|---|---|
| Runtime | Node 12.22 (runtime), Node 8 (build) | Node 24 LTS | (interview: Target tech stack › Backend) |
| Language | JavaScript | TypeScript (strict) | (interview: Target tech stack › Backend; Maintainability) |
| Framework | Express 4.16 | NestJS (current major) | (interview: Target tech stack › Backend) |
| API style | GraphQL (express-graphql 0.6 / graphql 0.10) + REST | REST with OpenAPI docs | (interview: API & DB) |
| Database / ODM | MongoDB 3.6, Mongoose 4.13 | MongoDB 8, Mongoose 8 | (interview: API & DB) |
| Auth | Google ID token + HS256 JWT via jwt-node 0.1.9 / express-jwt | Google ID token + secure session (real signature check, safe refresh) | (interview: Security) |
| Mail | nodemailer 6.3 over SMTP (Gmail) | Not decided (see skipped questions) | (gap: Target tech stack) |
| Date / holidays | moment 2.19, moment-timezone, date-holidays 1.2.0 | Not decided (see skipped questions) | (gap: Target tech stack) |
| Tests | jest (4 server cases) | Unit + integration + contract + parity tests; tooling not decided | (interview: Tests) |

### App: Leaves web client (replaces React SPA `/` and Angular SPA `/leaves/`)

| Layer | Current (from analysis) | Target | Source |
|---|---|---|---|
| Framework | Angular 4.4.6 (leaves) + React 16.8 (trips, places, users) | One React 19 SPA | (interview: Target tech stack › Frontend) |
| Build tool | Angular CLI 1.5 + react-scripts 3.0.1 | Vite | (interview: Target tech stack › Frontend) |
| Language | TypeScript 2.3 (Angular) + JavaScript (React) | TypeScript (strict) | (interview: Maintainability) |
| State / data fetching | ngrx 2 + apollo-angular; redux + apollo-client 1.x | Not decided (see skipped questions) | (gap: Target tech stack) |
| UI kit | Bootstrap 4 beta / ng-bootstrap; Bootstrap 3 / react-bootstrap | Not decided (see skipped questions) | (gap: Target tech stack) |
| Calendar | FullCalendar 3.7 / ng-fullcalendar | Not decided (see skipped questions) | (gap: Target tech stack) |
| i18n | none (English UI) | SK + EN | (input NFR: Localization) |
| E2E tests | stale protractor test | E2E browser tests; tool not decided | (interview: Tests) |

## 2. Features by area

### Out of scope (removed)
- Trips: list, add, edit, remove, duplicate — not carried over (client assessment: Important notes; analysis: §2.1 Trips)
- Places management — not carried over (client assessment: Important notes; analysis: §2.1 Places)
- Travel-warrant xlsx export, diet allowance, FX conversion, xlsx templates — not carried over (client assessment: Important notes; analysis: §2.1 Travel-warrant export, §2.6 Diet allowance)
- Monthly detail export (trip days, leave days, meal vouchers) — dropped (interview: Detail export; analysis: §2.1 Leaves › Detail export)
- Public `/download/*` file serving — dropped with the exports (analysis: §2.5 REST)
- "Trips" nav link — dropped (analysis: §2.4 Angular nav)

### Authentication and accounts
- User signs in only with Google; accounts restricted to the hosted domain `instea.co` (analysis: §2.1 Auth)
- Unknown Google account from the hosted domain is registered on first login and can use the app immediately, with no admin approval (analysis: §2.1 Auth; interview: Auto-approval)
- Login shows distinct messages for failure and wrong domain (analysis: §2.4 Screens › /login; interview: Auto-approval)
- Session survives page reload; an invalid or expired session shows the user as logged out (analysis: §2.1 Auth, §2.8 Auth)
- Session is renewed while the user is active, without the old forgery hole and without losing the renewed token (analysis: §2.1 Auth, §8 Security; interview: Known bugs, Security)
- User can log out (analysis: §2.1 Auth)
- First admin is promoted by email through a CLI command (analysis: §2.1 Auth)
- Deactivated users get no access to any endpoint and are not re-activated by logging in again (analysis: §2.3 Roles; interview: Security, User admin)

### User administration
- Admin sees all users: email, name, admin flag, active / deactivated status (analysis: §2.4 /users; interview: Auto-approval, User admin)
- Admin edits a user's first name, surname and admin flag (analysis: §2.4 /users/edit)
- User edits own first name and surname; email and admin flag are read-only for non-admins (analysis: §2.4 /users/edit, §8 Security; interview: Known bugs)
- Admin deactivates a user (soft delete); the user's leaves keep their requester (interview: User admin)
- Users are created only by first Google login; no manual create (analysis: §2.1 Users, §2.5 createUser)
- Degrees and address fields are removed (interview: User admin)
- Remove/deactivate actions ask for confirmation (analysis: §8 Functional bugs; interview: Known bugs)

### Leave requests
- User creates a leave with type (default ANNUAL), start date (default today), end date (follows start until edited) and half-day flag (analysis: §2.4 /list/add)
- Leave types: ANNUAL, SICKNESS, DOCTOR, MATERNITY, PARENTAL, CARING, shown with readable labels, not raw codes (analysis: §2.2 Leave, §2.2 mismatch 6; interview: Known bugs)
- Form shows a live count of missed work days (analysis: §2.4 /list/add, §2.6 Leave work days)
- End date must not be before start date; half-day allowed only for a single day; enforced on client and server (analysis: §2.2 mismatch 3; interview: Known bugs)
- New leave is always PENDING and its requester is always the caller (analysis: §2.1 Leaves)
- Work-day count is computed by the server, not trusted from the client (analysis: §2.2 Leave › numDays; interview: Known bugs)
- Add-leave form submits when input is valid (fixes the always-disabled button) (analysis: §8 Functional bugs; interview: Known bugs)
- User deletes only own leaves; admin deletes any leave; Delete is shown only where allowed and asks for confirmation (analysis: §2.3 Delete leave; interview: Leave rules, Known bugs)

### Leave list and calendar
- Every user sees all users' leaves: requester, days (`start - end (n work days)`), type, state, approver (analysis: §2.4 /list; interview: Visibility)
- Filters by requester, month and year (multiselect), matched per year segment of a leave; Clear filter (analysis: §2.6 Leave list filter)
- Toggle between list and calendar view (analysis: §2.4 /list)
- Month calendar with prev / next / today; REJECTED hidden, PENDING at 50% opacity (analysis: §2.1 Leaves › Calendar, §2.6 Calendar colour)
- Each requester gets a stable colour from a 15-colour palette; event title `<Full Name> [1/2 ](<type letter>)` (analysis: §2.6 Calendar colour, §2.4 Calendar view)
- List, calendar and actions show loading, empty and error states (analysis: §2.4 /list, §8 Functional bugs; interview: Known bugs)

### Leave approval
- Admin sees pending leaves with Approve / Reject; the row disappears after the action (analysis: §2.4 /approval)
- Admin nav shows a badge with the pending count (analysis: §2.4 Angular nav)
- Approve / reject sets the state and records the approving admin (analysis: §2.5 approveLeave / rejectLeave)
- Approval screen and actions are admin-only on client and server (analysis: §2.3 Open /approval; interview: Known bugs, Security)
- Denied actions return an explicit error, never a silent empty result (analysis: §2.3 Server guards; interview: Known bugs, Security)

### Leave summary
- User sees own work days per year and per leave type, clipped per year, years descending (analysis: §2.6 Summary)
- Summary counts only APPROVED leaves (analysis: §2.6 Summary; interview: Leave rules)

### Work-day rules
- A working day is Monday–Friday and not a Slovak public holiday (analysis: §2.6 Working day)
- Leave work days = working days in [start, end] inclusive, minus 0.5 for a half-day; existing test examples (3, 4, 2.5) keep passing (analysis: §2.6 Leave work days)

### Notifications
- New leave sends an email to the configured approver address (`APPROVAL_MAIL_RECEIVER`, prod `pm@instea.co`) with requester, date range in the default timezone, type and an Approve link (analysis: §2.7; interview: Notifications)
- Approve link in the email points to the real approval screen URL (analysis: §2.7, §8 Functional bugs)
- When SMTP is not configured, no email is sent and a log line is written (analysis: §2.7)

### Attendance API (M2M)
- `GET /api/attendence/:year/:month` keeps its path, Basic M2M auth and JSON contract `{start, end, attendence:{<name>:{days:[{logged_time, leave}], total, contractType}}}` (analysis: §2.5 REST; interview: Attendance)
- Error responses keep their status and text: 400 `Month is not a number.` / `Year is not a number.`, 401, 500 SSO / Toggl messages (analysis: §2.5 REST)
- Employees come from the SSO directory; only users with `togglUserId` are listed; Toggl and leave data only when `employee === '1'` (analysis: §2.6 Attendance)
- Logged hours per day = sum of Toggl entry seconds / 3600 by entry start date, paginated Toggl Reports v3 calls with 500 ms between pages (analysis: §2.6 Attendance, §4 Integrations)
- Leave code per working day, APPROVED leaves only: ANNUAL `D8` (half-day `D4`), SICKNESS `PN`, DOCTOR `L`, other `I`; several joined with `", "` (analysis: §2.6 Attendance)
- Day boundaries use `DEFAULT_TIMEZONE` (default Europe/Bratislava) (analysis: §2.6 Attendance)
- Output is keyed by SSO name; duplicate names collide — preserved quirk (analysis: §2.6 Attendance)
- An employee without `togglUserId` who has leaves no longer hangs the request (analysis: §8 Functional bugs; interview: Known bugs)

### Operations
- Health-check endpoint pings the database, returns 200 / 500 and serves as the k8s readiness probe (analysis: §2.1 Ops)
- App fails fast when the database is unreachable so k8s restarts it (analysis: §2.1 Ops)
- Manual database backup (gzip dump, 14-day retention) and restore scripts, updated for MongoDB 8 (analysis: §2.1 Ops, §5)

## 3. User decisions

### Scope
- Only the leaves module, user administration, auth and the attendance API are carried over (client assessment: Important notes; interview: Attendance, Detail export)
- Attendance API stays 1:1, including SSO and Toggl (interview: Attendance)
- Monthly detail export is dropped (interview: Detail export)
- Leave visibility stays company-wide, as today (interview: Visibility)

### Authentication
- No admin approval step: every Google account from the `instea.co` hosted domain is approved automatically on first login; the old pending-user flow and approve-user action are removed (interview: Auto-approval)

### Known bugs
- All known leave-module and auth bugs from the analysis are fixed, not preserved; each fix is a defined change separated from parity behavior (interview: Known bugs; client assessment: Initial Rewrite goal)
- Attendance contract quirks (path spelling `attendence`, name-keyed output) stay for compatibility (interview: Attendance)

### Leave lifecycle rules
- Summary counts APPROVED leaves only (interview: Leave rules)
- A user deletes only own leaves; only an admin deletes others' leaves (interview: Leave rules)

### User administration
- Keep user admin 1:1 except approval (list, edit, admin flag, own profile, CLI first admin) (interview: User admin, Auto-approval)
- Drop travel-only fields degrees and address (interview: User admin)
- Soft delete users instead of hard delete (interview: User admin)

### Notifications
- Keep the new-leave email to the approver address (interview: Notifications)
- Requester gets an email when their leave is approved or rejected (interview: Notifications)

### Documentation
- Functional spec of the leaves module: work-day rules, half-day, states, approval flow, attendance codes (interview: Documentation)
- API docs: OpenAPI for the app API and the M2M attendance API (interview: Documentation)
- Dev and ops README: local setup, env var names, deploy, backup / restore runbook (interview: Documentation)

### Testing
- Unit tests for all business rules: work days, holidays, half-day, filters, summary, attendance codes (interview: Tests; client assessment: Tests)
- Integration tests for every API endpoint and every authorization rule against a real test database (interview: Tests; client assessment: Tests)
- E2E browser tests for login, create leave, delete, approve / reject, calendar, summary, user admin (interview: Tests)
- Parity tests: attendance API of old and new system return equal output for the same data (interview: Tests; client assessment: Tests)
- AI agents may be used for the rewrite, so every feature ships with tests; test coverage is maximised (client assessment: AI agent access)

### Integration testability
- Contract-based mocks for Google token verification, SSO meta API and Toggl Reports v3 in tests (interview: Integration testability)
- Local mail catcher for SMTP in dev and tests (interview: Integration testability)
- Contract tests pin the attendance JSON format and SSO / Toggl response parsing (interview: Integrations)

### Environments
- No staging environment; testing relies on local docker-compose and CI (interview: Environments)

### Data migration
- Migrate users and leaves only; trips, places and generated xlsx files are archived offline, not migrated (interview: Trip data)
- Migration validates every record against the new rules; invalid or orphaned records go to a report for manual decision (interview: Data clean)
- Migration recomputes leave work days on the server (analysis: §2.2 Leave › numDays; interview: Data clean)
- Removed users referenced by leaves become deactivated users (interview: User admin, Data clean)

### Migration strategy (big bang with rehearsal)
- Migration script moves users and leaves from MongoDB 3.6 to MongoDB 8 and writes a validation report (interview: Migration strategy)
- Rehearse the migration locally on an anonymized prod dump until the report is clean or every finding is decided (interview: Migration strategy)
- Before cutover, run parity tests of the attendance API old vs new on the rehearsed data (interview: Migration strategy, Tests)
- Announce the cutover window; freeze writes on the old app (interview: Migration strategy)
- Take a final full dump of the old database and an archive of generated files; store offline (interview: Migration strategy, Trip data)
- Run the migration, check record counts and the report, smoke-test login, leaves and the attendance API (interview: Migration strategy)
- Switch host nginx / ingress to the new app; the M2M consumer keeps the same attendance URL (interview: Migration strategy, Attendance)
- Keep the old app read-only for 2 weeks as rollback; rollback = switch ingress back (interview: Migration strategy)
- After 2 weeks, decommission the old deployment and the MongoDB 3.6 StatefulSet (interview: Migration strategy)

### Platform and delivery
- Deploy to the same MicroK8s cluster with the existing registry and Keel; new k8s manifests (interview: Target platform)
- Secrets come only from k8s secrets, never from the repo (interview: Security; analysis: §8 Security)

## 4. Non-functional requirements

### Security
- Server enforces role and ownership on every endpoint; denied calls return 401 / 403; each rule has a test (input NFR: Security; interview: Security)
- Secure sessions: short-lived tokens with real signature verification and a safe refresh; Google hosted-domain check kept (input NFR: Security; interview: Security; analysis: §8 Security)
- User data is visible and editable only per the permission rules; non-admins cannot change email or admin flag (input NFR: Security; analysis: §8 Security)
- Automated dependency and image vulnerability scanning in CI (input NFR: Security; interview: Security)

### Data privacy and compliance
- Audit log of who created, approved, rejected or deleted a leave and who changed a user or role, with timestamp (input NFR: Data privacy and compliance; interview: Privacy)
- Admin can export all data of one user (GDPR access request) (input NFR: Data privacy and compliance; interview: Privacy)
- Admin can erase or anonymize one user's personal data (GDPR erasure) (input NFR: Data privacy and compliance; interview: Privacy)

### Maintainability
- CI runs lint, typecheck and all tests and blocks merge to master on failure (input NFR: Maintainability; interview: Maintainability)
- TypeScript strict mode, ESLint and Prettier, pre-commit hooks that run (input NFR: Maintainability; interview: Maintainability)
- Semantic versioning with automated version bump and release notes per release (input NFR: Maintainability; interview: Maintainability; analysis: §6 CI/CD)
- Current, supported runtime and library versions (client assessment: Technology; analysis: §8 Outdated dependencies)

### Localization
- Whole UI in Slovak and English: screens, labels, validation messages, leave types; user can switch language (input NFR: Localization; interview: Localization)
- Notification emails in Slovak and English (input NFR: Localization; interview: Localization)

## 5. Skipped questions (for client)

### Q-S1. Can an admin approve or reject their own leave? (interview: Leave rules; analysis: §2.3)
- **Answer:**
- [ ] Not relevant

### Q-S2. Should approve / reject be allowed only on PENDING leaves (no re-approving a REJECTED leave)? (interview: Leave rules; analysis: §2.5 approveLeave)
- **Answer:**
- [ ] Not relevant

### Q-S3. Can a user delete their own leave after it is APPROVED, or only while PENDING? (interview: Leave rules; analysis: §8 Open question 6)
- **Answer:**
- [ ] Not relevant

### Q-S4. Leave types SICKNESS, DOCTOR, MATERNITY are health-related and visible to all employees. Is that acceptable under GDPR, or should the type be hidden from non-admins? (input NFR: Data privacy and compliance; interview: Visibility)
- **Answer:**
- [ ] Not relevant

### Q-S5. What retention period applies to leaves, audit log entries and deactivated users? (input NFR: Data privacy and compliance)
- **Answer:**
- [ ] Not relevant

### Q-S6. Security hardening was not selected: disable API explorer in prod, restrict CORS, constant-time M2M credential compare, rate limiting. Are these required? (input NFR: Security; interview: Security)
- **Answer:**
- [ ] Not relevant

### Q-S7. Which frontend libraries: UI kit, state / data fetching, calendar component? (interview: Target tech stack › Frontend)
- **Answer:**
- [ ] Not relevant

### Q-S8. Which backend libraries for email, dates / timezones and Slovak holidays, and which test tooling (unit, E2E)? (interview: Target tech stack › Backend, Tests)
- **Answer:**
- [ ] Not relevant

### Q-S9. Which Slovak public holiday list is authoritative? The old data is from 2017; recent law changes may differ. (analysis: §2.6 Working day, §8 Outdated dependencies)
- **Answer:**
- [ ] Not relevant

### Q-S10. What is the default UI language, and how is the email language chosen (recipient preference or fixed)? (input NFR: Localization)
- **Answer:**
- [ ] Not relevant

### Q-S11. What URL will the new app use? Should old `/leaves/*` links and the `/cestaky` prefix redirect to it? (interview: Migration strategy; analysis: §5 Deployment)
- **Answer:**
- [ ] Not relevant

### Q-S12. Attendance output is keyed by SSO name and duplicate names collide. Keep 1:1, or does the M2M consumer accept a fix? (interview: Attendance; analysis: §2.6 Attendance)
- **Answer:**
- [ ] Not relevant

### Q-S13. Should the new-leave email go only to `APPROVAL_MAIL_RECEIVER`, or to all admins? (interview: Notifications; analysis: §2.7)
- **Answer:**
- [ ] Not relevant

### Q-S14. Existing users still pending (`approved=false`) in the old DB: activate them during migration, or skip them? (interview: Auto-approval, Data clean)
- **Answer:**
- [ ] Not relevant

## 6. Open questions (from analysis)

> Analysis questions 1, 3, 4, 9, 10 concern trips, diets and exports (out of scope). Question 2 is resolved (visibility stays company-wide, exports dropped). Questions 11, 12, 13 concern old tooling that is replaced.

### Q-A5. Is the old add-leave form actually blocked at runtime? How are leaves created today? (analysis: §8 Open question 5)
- **Answer:**
- [ ] Not relevant

### Q-A6. Should a summary include PENDING / REJECTED leaves? Should admins approve their own leave, and users delete APPROVED leaves? (analysis: §8 Open question 6; summary answered: APPROVED only)
- **Answer:**
- [ ] Not relevant

### Q-A7. What is the SSO endpoint contract (keys, `employee` values, `contractType` meaning)? (analysis: §8 Open question 7)
- **Answer:**
- [ ] Not relevant

### Q-A8. Toggl: is `end_date` inclusive? How should entries crossing midnight be attributed? (analysis: §8 Open question 8)
- **Answer:**
- [ ] Not relevant

### Q-A14. Which timezone does the container run in? Does the global moment-timezone default affect day boundaries? (analysis: §8 Open question 14)
- **Answer:**
- [ ] Not relevant

### Q-A15. Is there a staging environment, and is `backup.cestaky.sh` scheduled outside the repo? (analysis: §8 Open question 15)
- **Answer:**
- [ ] Not relevant

## Other notes

- **Notes:**
