# Cestovné príkazy (Trips & Leaves) — Rewrite Specification — Client answers

## 5. Skipped questions (for client)

### S1. Which exchange-rate source should convert non-EUR diet tariffs (CZ, GB, US, CH, ...)? Options: free ECB reference rates with cache and fallback; keep the current currency-converter provider with the key moved to a secret; rates maintained by an admin in the app. _(interview: Integrations › FX source; analysis: §4 Integrations, open question 6)_

- **Answer:** Use the one that is used in "old" app. So simple rewrite
- [ ] Not relevant

### S2. Bugs are preserved 1:1, but the Angular "Add leave" button may be always disabled. If that is confirmed, preserving it blocks leave creation. Should the new app enable valid leave creation? _(interview: Rewrite goal › Other bugs; analysis: §8 Risks)_

- **Answer:** Yes enable creation
- [ ] Not relevant

### S3. Libraries not chosen in the interview: xlsx generation, mail, Google auth/JWT, dates/holidays, UI component kit, forms/state, i18n library, test frameworks, CI tool. Any client preference, or does Instea choose? _(interview: Target tech stack)_

- **Answer:** Instea will pick during implementation
- [ ] Not relevant

### S4. Module-by-module migration shares one MongoDB. The old app's Mongoose 4.13 driver cannot connect to MongoDB 8. Upgrade the database after the last module, or upgrade the old app's driver first? _(interview: Migration; interview: Database)_

- **Answer:** Module by module but 2 separate databases
- [ ] Not relevant

### S5. Users now see only their own trips and leaves, but security bugs are preserved: exports still accept any `userId` and `/download` files stay public. Is that acceptable, or should those be closed too? _(interview: Data visibility; interview: Rewrite goal › Security bugs)_

- **Answer:** keep as is for now
- [ ] Not relevant

### S6. Must the old URLs keep working (`/trips`, `/places`, `/users`, `/export`, `/leaves/list`, `/leaves/approval` used in the approval email)? _(interview: Target tech stack › Frontend; analysis: §2.4 Screens, §2.7 Notifications)_

- **Answer:** yes old URLs has to keep working
- [ ] Not relevant

### S7. Localization scope: should xlsx exports and emails also be in Slovak/English? Which language is the default? _(input NFR: Localization)_

- **Answer:** It should only be in English
- [ ] Not relevant

### S8. Audit log: how long is it kept, and who can view it (admin screen or logs only)? _(input NFR: Data privacy)_

- **Answer:** Audit log is only for Admins
- [ ] Not relevant

### S9. Personal data erasure: what happens to the erased user's trips and leaves (delete them, or keep them with the "Deleted" placeholder)? _(input NFR: Data privacy)_

- **Answer:** Lets delete them
- [ ] Not relevant

## 6. Open questions (from analysis)

### A1. Does `jwt-node` 0.1.9 populate `err.parsedBody` on signature mismatch? This decides whether `/refresh-jwt` is a full auth bypass. _(analysis: §8 Open questions 1)_

- **Answer:**
- [x] Not relevant

### A2. Is the Angular add-leave form always invalid in production (Angular 4.4.6 runtime check)? _(analysis: §8 Open questions 2)_

- **Answer:** No it works fine
- [ ] Not relevant

### A3. Was the SK diet for trips under 5 h meant to be 0 €? Should multi-day trips be split per day? _(analysis: §8 Open questions 3)_

- **Answer:**
- [x] Not relevant

### A4. Should PENDING/REJECTED leaves count in the detail export and summary? _(analysis: §8 Open questions 4)_

- **Answer:** Only accepted leaves should be counted
- [ ] Not relevant

### A5. Template names "upto19"/"upto31" vs code limits 9/15 trips: what do they mean? Is the `upto31` total `SUM(R7:R44)` intended? _(analysis: §8 Open questions 5)_

- **Answer:**
- [x] Not relevant

### A6. Is the currency-converter API still alive? What happens to the export if it fails? _(analysis: §8 Open questions 6)_

- **Answer:** I believe it is
- [ ] Not relevant

### A7. Production topology: Jenkins deploys via `docker-compose`, but code comments mention k8s. Which is current, and is Jenkins still active? _(analysis: §8 Open questions 7)_

- **Answer:** k8s is current, Jenkins is not active anymore
- [ ] Not relevant

### A8. Which SSO system sits behind `SSO_URI`, and what is its full key schema? _(analysis: §8 Open questions 8)_

- **Answer:**
- [x] Not relevant

### A9. Should the UI be Slovak? All UI copy is English except travel-type labels and placeholders. _(analysis: §8 Open questions 9)_

- **Answer:** UI should be by default in English
- [ ] Not relevant

### A10. Should regular users see all users' trips and leaves? _(analysis: §8 Open questions 10)_

- **Answer:** Yes
- [ ] Not relevant

### A11. CI status: there is no badge or status source in the repo, and the last Jenkins result is unknown. _(analysis: §8 Open questions 11)_

- **Answer:**
- [x] Not relevant
