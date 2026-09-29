# VMP Quality Upgrade Implementation Plan

> **For agentic workers:** use subagent-driven-development for bounded separate-file work and independent review; shared authentication/state/database work is sequential under primary planner.

**Goal:** Resolve verified UX, accessibility, auth and performance gaps on the synchronized VMP, preserving data and permission contracts.

**Architecture:** Extend the existing React/Vite Lotus system. Retain Supabase Auth, report computations, route splitting and qualification integration. Verify existing functionality before adding code.

**Tech Stack:** React 18, TypeScript, Vite 6, Supabase JS 2, native SVG, Node test runner, Puppeteer/Playwright/axe.

## Global constraints

- Base SHA 683caaa; source /home/admin1/VMP/MA-NGUON-HIEN-TAI, existing linked worktree.
- Read design 2026-09-29-vmp-quality-upgrade-design.md; no historical migrations/import, no production data/identity changes, no qualification formulas/print changes; headless only.
- Never print secrets. Use existing fixtures; no production brute-force tests.
- At most two independent workers. Primary owns shared auth, App/hooks, styles, build, DB and release. Inspect every diff and rerun relevant verification.

### Task 1: Baseline and research (primary) — complete

- [x] Read current source, release receipt, Git status/main; verify current web artifact read-only.
- [x] Build isolated preview; collect populated login/reports light/dark/mobile axe, keyboard/reflow and console evidence; measure performance with Lighthouse and existing budgets.
- [x] Record findings and measured acceptance in docs; no assumed scores.

### Task 2: Reports interaction and guidance (bounded worker) — complete

**Own files:** src/components/dashboard/ReportsView.tsx; tests/e2e/reports-accessibility.mjs only. Do not edit shared CSS/primitives/auth or commit others' files.
**Consumes:** Sel already accepts nhan; existing moChiTiet and report model/export handlers. **Produces:** accessible report controls with unchanged data/export semantics.

- [x] Add runtime test using existing caiGiaLap/nhetPhien fixtures. Assert named selects, keyboard drilldown via real Enter/Space, visible dialog and return focus, named export actions and filter feedback. Use native button in table cell, retaining tr/table semantics. Expected RED: missing labels/keyboard trigger.
- [x] Run failing test against baseline preview and record exact failure.
- [x] Pass nhan to every report Sel; use native button for nonzero stage drilldown and keep zero noninteractive; add concise reading/export help and role=status for filter scope; aria-busy for async export controls, title explaining PDF/HTML. Do not introduce new chart/sort architecture: existing DetailList provides data search/sort.
- [x] Run GREEN plus reports-export-actions.mjs and desktop-reports-map-controls.mjs; report actual output, screenshot/reflow concern if any. Primary builds/reruns shared final checks.
- [x] Independent review before acceptance; primary inspects diff.

### Task 3: Auth security integration (primary; read-only specialist first)

**Files:** src/lib/loginForm.ts, src/lib/supabaseClient.ts, src/components/auth/LoginScreen.tsx; new auth security module/components/tests as justified. App.tsx/useAuth hook owned only by primary.

- [x] Inspect native Supabase rate limits/password/MFA docs, current auth listener and session races, available nonsecret configuration. Specialist supplies bounded recommendation for native MFA API and server enforcement; no mutations.
- [x] Write tests: 429 code/status => rate-limit message; network => retry message; invalid credentials remains generic; duplicate submit sends one request; MFA enrolled aal1 never mounts protected data; errors fail closed; reload and cancellation preserve account boundary.
- [x] Run RED, implement minimum native Auth flow, run GREEN. Preserve SDK error metadata; use ref mutex for concurrent submits; label loading state with role=status/aria-busy.
- [x] Add owner-driven TOTP enrollment/challenge and server enforcement only with reviewed complete flow; never auto-enroll/reset accounts. If production management credentials/settings are unavailable, document exact blocked operational step while finishing all local code/tests.
- [x] Validate recovery and expired-session regressions, then independent high-risk review.

### Task 4: Shared accessibility and measured performance (primary) — complete

Measured refinement: baseline unauthenticated startup transfers 592,876 decoded JS bytes, including authenticated shell code. Primary will move the existing protected shell verbatim into `src/AuthenticatedApp.tsx`, keep `src/App.tsx` as the auth/recovery/MFA entry with a lazy protected shell, and extract existing `useAuth` into `src/hooks/useAuth.ts` (re-export from hooks/index for compatibility). Providers remain outside the MFA boundary; formulas/data hooks stay inside the same verified access boundary. Update existing source-contract test paths to their moved implementation without weakening assertions. New `tests/e2e/login-cold-budget.mjs` must fail on baseline (>520 KiB) then pass with no protected/report/export chunk before login. Run auth/recovery/MFA + populated shell regressions and independent review. Roll back this split independently by reverting the move; no server/data change.

**Files:** src/components/layout/Layout.tsx, src/components/ui/Primitives.tsx, src/index.css, src/styles/lotus-*.css, src/main.tsx/vite.config.js only when measurement justifies; tests/e2e/quality-upgrade.mjs and audit docs.

- [x] Add failing browser checks for measured unnamed controls, busy status, insufficient contrast/reflow/focus. Avoid tests that merely mirror CSS source.
- [x] Fix proven defects using existing tokens/primitives; preserve theme, min touch sizes and reduced-motion behavior.
- [x] Optimize demonstrated startup cost; use existing lazy imports and CSS route boundaries, no broad dependency churn. Re-measure comparable baseline/after and budget.
- [x] Run populated axe light/dark, 320/390/768/1440, keyboard and enlargement; runtime console, API retry/expiry; include real report downloads.

### Task 5: Review, verify and deliver (primary + independent reviewer)

- [x] Review every diff including any external configuration; reconcile every user finding as fixed/already supported/verified/unverified operational dependency with evidence.
- [x] Run relevant unit suite, typecheck, build, budget, changed-area E2E and existing shared gates required by CI. Do not repeatedly run passing gates without changed inputs.
- [x] Independent final/security review; address actionable findings and rerun affected gates.
- [ ] Commit only scoped files; use existing release authorization for reviewed push/deploy after all gates. Never claim deployment until CI and exact web asset + read-only live UI checks pass.
- [ ] Update /home/admin1/VMP/PROJECT-STATE.md with actual local/pushed/applied/deployed statuses and handoff limitations. Frontend rollback is git revert of this change; no server schema rollback or historical migration replay.

## Final integration findings and release condition

- Native password reauthentication must use an isolated nonpersistent client; it must never demote the main AAL2 session. Bind the password mutation and assurance/factor decision to the exact checked access token. Reviewer discovered cross-account and mixed-assurance races; token-bound tests/review are required before release.
- Preserve same-user/same-AAL `USER_UPDATED` and `MFA_CHALLENGE_VERIFIED` form state while authoritative background reassessment runs. RED demonstrated lost password-success and unenrollment-error messages; event mismatches still invalidate.
- CI now includes e2e:quality and a hash-bound receipt for the new SQL/gateway rehearsal. Keep existing core gates intact.
- Production preflight is currently blocked by Supabase availability: pooler EAUTHQUERY timeout, management SQL544 and Auth health504; no new migration/Auth-setting/deployment has been applied. Complete local gates and branch CI; hold main rollout until service health, backup and pre/postflight are verified. User reports Supabase is operating normally. Preserve the service; investigate the discrepancy from this environment and do not restart without authorization.
