# Leaves Rewrite Spec — Client answers

- **Exported:** 2026-11-04

## 5. Skipped questions (for client)

### Q-S1. Can an admin approve or reject their own leave? (interview: Leave rules; analysis: §2.3)
- **Answer:** Yes he can approve/reject
- [ ] Not relevant

### Q-S2. Should approve / reject be allowed only on PENDING leaves (no re-approving a REJECTED leave)? (interview: Leave rules; analysis: §2.5 approveLeave)
- **Answer:** Lets make reapproving possible from rejected state
- [ ] Not relevant

### Q-S3. Can a user delete their own leave after it is APPROVED, or only while PENDING? (interview: Leave rules; analysis: §8 Open question 6)
- **Answer:** Yes user can delete his approved leave
- [ ] Not relevant

### Q-S4. Leave types SICKNESS, DOCTOR, MATERNITY are health-related and visible to all employees. Is that acceptable under GDPR, or should the type be hidden from non-admins? (input NFR: Data privacy and compliance; interview: Visibility)
- **Answer:** it is acceptable to show such a info
- [ ] Not relevant

### Q-S5. What retention period applies to leaves, audit log entries and deactivated users? (input NFR: Data privacy and compliance)
- **Answer:** 2 months, but should be configurable
- [ ] Not relevant

### Q-S6. Security hardening was not selected: disable API explorer in prod, restrict CORS, constant-time M2M credential compare, rate limiting. Are these required? (input NFR: Security; interview: Security)
- **Answer:** yes those are all required except rate limiting
- [ ] Not relevant

### Q-S7. Which frontend libraries: UI kit, state / data fetching, calendar component? (interview: Target tech stack › Frontend)
- **Answer:** Lets use Tailwind on FE, React query and some react calendar component
- [ ] Not relevant

### Q-S8. Which backend libraries for email, dates / timezones and Slovak holidays, and which test tooling (unit, E2E)? (interview: Target tech stack › Backend, Tests)
- **Answer:** use vitest for testing and playwright for E2E testing. For dates use date-fns. For emails use what is popular and secure.
- [ ] Not relevant

### Q-S9. Which Slovak public holiday list is authoritative? The old data is from 2017; recent law changes may differ. (analysis: §2.6 Working day, §8 Outdated dependencies)
- **Answer:** old data from 2017 is no longer valid. we need refresh our data
- [ ] Not relevant

### Q-S10. What is the default UI language, and how is the email language chosen (recipient preference or fixed)? (input NFR: Localization)
- **Answer:** ENG is default language for UI and emails. Lets make emails only in ENG
- [ ] Not relevant

### Q-S11. What URL will the new app use? Should old `/leaves/*` links and the `/cestaky` prefix redirect to it? (interview: Migration strategy; analysis: §5 Deployment)
- **Answer:** no redirects are necessary
- [ ] Not relevant

### Q-S12. Attendance output is keyed by SSO name and duplicate names collide. Keep 1:1, or does the M2M consumer accept a fix? (interview: Attendance; analysis: §2.6 Attendance)
- **Answer:** keep 1:1
- [ ] Not relevant

### Q-S13. Should the new-leave email go only to `APPROVAL_MAIL_RECEIVER`, or to all admins? (interview: Notifications; analysis: §2.7)
- **Answer:** only to receiver mail
- [ ] Not relevant

### Q-S14. Existing users still pending (`approved=false`) in the old DB: activate them during migration, or skip them? (interview: Auto-approval, Data clean)
- **Answer:** yes lets migrate them by setting approved = true
- [ ] Not relevant

## 6. Open questions (from analysis)

### Q-A5. Is the old add-leave form actually blocked at runtime? How are leaves created today? (analysis: §8 Open question 5)
- **Answer:** it is not blocked.....it works fine
- [ ] Not relevant

### Q-A6. Should a summary include PENDING / REJECTED leaves? Should admins approve their own leave, and users delete APPROVED leaves? (analysis: §8 Open question 6; summary answered: APPROVED only)
- **Answer:** sumary should not include pending/rejected leaves. Admins should be able to approve their own leaves and user should be able to delete approved or pending or rejected own leaves.
- [ ] Not relevant

### Q-A7. What is the SSO endpoint contract (keys, `employee` values, `contractType` meaning)? (analysis: §8 Open question 7)
- **Answer:**
- [x] Not relevant

### Q-A8. Toggl: is `end_date` inclusive? How should entries crossing midnight be attributed? (analysis: §8 Open question 8)
- **Answer:** Yes it is inclusive.
- [ ] Not relevant

### Q-A14. Which timezone does the container run in? Does the global moment-timezone default affect day boundaries? (analysis: §8 Open question 14)
- **Answer:**
- [x] Not relevant

### Q-A15. Is there a staging environment, and is `backup.cestaky.sh` scheduled outside the repo? (analysis: §8 Open question 15)
- **Answer:**
- [x] Not relevant

## Other notes

- **Notes:**
    - Use `pnpm` as a package manager
    - Use latest `node` version
