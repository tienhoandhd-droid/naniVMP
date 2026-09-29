# VMP loading performance and final release plan

> **For agentic workers:** Use subagent-driven-development for bounded independent analysis/review; primary owns implementation and all database state.

**Goal:** Remove the demonstrated causes of slow loading and RPC timeouts, deploy the measured fix, verify real web functionality and record the complete handoff.

**Architecture:** Retain React/Vite, Supabase RPC authorization and the qualification iframe. Trace request triggers and time network versus database work before choosing a minimal correction. Never cache authority across identity/revision changes, weaken guards, increase timeouts to hide costs, or apply unrelated pending migrations.

**Tech Stack:** React 18, TypeScript, PostgreSQL 17, Supabase, Playwright headless, GitHub Pages.

## Constraints and ownership
- Source MA-NGUON-HIEN-TAI only, current deployed 969e9e8. Push/deploy authorized.
- No production business writes, restart, migration replay, formula/PDF changes or personnel updates. Preserve the old untracked Sep23 plan.
- Primary owns src/hooks/index.ts, shared supabaseData boundary, database changes and release scripts sequentially. Independent agents initially read only and write separate private reports.
- Evidence private .cpc1/performance-20260929; never commit credentials, raw user payloads or live screenshots.

## 1. Establish bounded diagnosis (before implementation)
- [x] Preserve successful 969e9e8 live receipt: reports, auth, qualification and PDF pass, earlier attempts had server statement timeouts.
- [ ] Frontend analyst traces getSession/SIGNED_IN, polling, focus, iframe cross-tab auth and dashboard request multiplication; report exact triggers and minimum regression test, no source edits.
- [ ] Primary captures current RPC definitions and sequential read-only timings with authenticated claims; capture narrow pg_stat_statements/metrics and timeout context. Compare dashboard, source list, rights, watermark and qualification context without stress testing production.
- [ ] Record hypothesis and measurable acceptance in this plan from evidence before implementing. Use clone for EXPLAIN/experiments/load; production read-only and bounded.

## 2. Implement demonstrated bottlenecks
- [ ] Add failing deterministic unit/headless reproduction for extra dashboard requests or hot query, preserving denial/revocation cases. Run RED and save output.
- [ ] Minimal fix only on identified paths, GREEN and targeted regression. If SQL change necessary: new migration version only, exact before/after result equivalence and role/resource denial tests on clone; primary owns SQL, independent critical reviewer checks semantics and rollout.
- [ ] Source review by independent reviewer; primary inspects every diff and reruns relevant verification. No speculative bulk refactor.

## 3. Release and verification
- [ ] Typecheck, unit suite and build/budget; applicable permission/race/browser gates because shared read boundary may change. Keep all existing required CI gates.
- [ ] If SQL needed: fresh read-only preflight/backup with restore verification, rehearsed atomic replacement and preserved grants; fingerprint business rows. Apply only after independent acceptance, then postflight. Function-only rollback restores exact captured definitions transactionally; never roll back already migrated qualification schema.
- [ ] Commit reviewed code; push authorized main and wait exact-SHA all CI/build/deploy success. Web rollback is previously verified 969e9e8 through normal CI if needed, retaining server compatibility.
- [ ] Download exact Pages artifact; compare real served bytes. Repeat measured cold/warm authenticated load and request counts; no timeouts in final probe, no writes, no JS errors. Verify reports plus qualification navigation/history/PDF on final web.
- [ ] Update root and specialized PROJECT-STATE, BAT-DAU/AGENTS handoff with exact local/push/applied/deployed state and before/after measurements. Completion only after real-web evidence, with limitations stated.

## Measured decision (29 September, 11:45 UTC)
- Production headless reports followed by four qualification pages generated five dashboard loads, each705290bytes, plus five watermarks in about10seconds. Same-token Auth BroadcastChannel confirmation is the trigger. Mock RED reproduces2 dashboard requests vs1 expected.
- Minimal change: effect-local DashboardSessionLoad deduplicates exact actor+token, sharing initial session and SIGNED_IN dispatch. Changed actor/token and signout invalidate pending data before loading; generation guards reject stale initial session reads. No data cache or authority cache; existing polling, realtime and explicit reload remain.
- Source files: src/lib/dashboardSessionLoad.ts, src/hooks/index.ts; unit tests dashboard-session-load.test.mjs; browser dashboard-session-load.mjs and required CI command.
- Acceptance: same navigation sequence has exactly one initial dashboard request (until unchanged existing20s poll), zero duplicate dashboard from peer confirmation, no errors/business writes. Actual cold/warm elapsed timing reported, with local asset timing distinguished from live Pages.
- Independent DB analysis recommends no SQL change: no index/spill evidence; repeated reads amplify CPU authorization work. No new migration or production database mutation for this performance fix.

## Local verification and known legacy test
- Unit984total:983pass/1skip; typecheck/build/drift passed. Clean build5.75MB, criticalJS115.4KB gzip, CSS142.4KB within unchanged budgets. External outDir was explicitly emptied to remove previous build hashes before measuring.
- New mock browser gate passed startup in-flight duplicate, repeated exact session, newtoken/newactor, signout clears shell and fresh reentry. Existing access-transition-race passed.
- Optional legacy thu-hoi-cache-phan-quyen test fails at181 identically on baseline969e9e8 and candidate. Its broad RPC matcher returns legacy JSON for v2, and later expectations require obsolete snapshotv2/n8n fallback. It is not a current CI gate; recorded without changing application to satisfy obsolete semantics. Current snapshot/authorization unit contracts pass.
- Candidate browser actual Supabase with local assets: one dashboard vsfive; RPCbytes2243359vs5149322. Coldreport2.858s vsbaseline live3.167s, complete sequence6.487s vs9.554s. Timing is provisional because local assets differ from Pages; final live measurement required.
