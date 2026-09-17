# Workshop overview repair

Goal: workshop_manager sees all server-authorized workshop activities in Overview, respecting global filters and excluding QC through existing server scope.
Evidence: production browser shows filtered-empty even after clearing filters; login and dashboard RPC return 234 activities. App.tsx applies QA owner/support identity filtering to all roles that cannot select another person. Workshop manager is such a role but is not a QA owner.
Design: extract current Overview selection into a pure helper in personProgressScope.ts; workshop_manager returns globally filtered activities. Preserve admin/QA manager optional personal selection and other roles' existing personal behavior. No database changes, expanded grants, or person-selector permission changes.
Primary owns App.tsx, helper and unit tests sequentially; independent security reviewer reads final diff. No new dependencies or shared database state. Existing isolated clean worktree is joyful-long-mon-20260907.
- [x] RED: helper regression reproduces workshop manager empty result for activities owned by QA; test global filters and existing QA/manager behavior.
- [x] GREEN: only workshop_manager bypasses QA personal filtering.
- [x] Targeted unit tests, typecheck, build, browser on local build with real scoped account; verify visible overview and no QC data.
- [x] Independent review, inspect diff, fix findings and rerun affected checks.
- [ ] Release only with explicit deployment authorization; rollback by reverting these three code/test files to previous commit. Until release, production retains current bug.

Verification: 5/5 targeted unit tests, typecheck and build passed. Real-account local browser shows data-overview-total=223 and no filtered-empty boundary. Independent gpt-5.6-sol reviewer approved; primary inspected final diff. User authorized commit and web release on 2026-09-17.
