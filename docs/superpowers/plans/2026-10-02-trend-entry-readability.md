# Trend entry and readability implementation plan

> Execute bounded tasks sequentially for shared entry state; independent chart work and final independent review may use subagents per AGENTS. Use test-driven-development and verification-before-completion.

**Goal:** Improve reading charts and paste multiple measurements into existing qualification forms; deliver verified local upgrade.

**Architecture:** Static vanilla JS, SVG and existing saved-record APIs. A pure TSV validator consumes explicit permitted row targets and column descriptors; a separate dialog previews cell changes before adapters apply an all-or-nothing patch to the current unsaved form. No API or DB changes. Chart work owns disjoint runs/pq files.

**Tech stack:** Existing JavaScript, CSS, node:test and headless Playwright. No new dependencies.

## Global constraints

- Preserve evaluator, snapshot limits, raw precision, PQ versus statistical interpretation, permissions, closed locks, form/PDF and database.
- Plain Vietnamese labels, clear errors and no automatic save. Do not guess decimal separators: user selects comma or dot, never thousands grouping.
- Only fill blank fields; populated cells may match unchanged but different values require existing manual correction flow. No implicit change mode. Preserve source strings.
- Trial rows for steam BM01/03/04 use 1..3; BM02 and gas use trial 1. Only fields defined by existing form are eligible. Exclude derived T3 in steam BM04 and calibration metadata.
- Primary owns shared gas/app adapters and entry modules; chart implementer owns only chart files and its tests. Review read-only. No production business writes, no GUI.
- Reuse existing linked worktree on feat/tham-dinh-thuc-te. Keep unrelated Sep23 plan. Baseline3a689f0 local Desktop package is rollback.

## Task 1: Readable charts (independent bounded task)
Files: public/tham-dinh-thuc-te/{runs.js,runs.html,runs.css,pq-charts.js}, tests/e2e/qualification-trend-workspace.mjs, dedicated chart unit tests if needed.
- [x] RED: E2E expects “Số đo theo điểm”, “Phân bố số đo”, explicit history selector; switching selector changes historical unit/series independently. Capture failure on existing implementation.
- [x] Implement plain labels, visible unit/limit/scope, practical tooltip and error wording; keep detailed IQR explanation inside details. Preserve two aligned plots, no statistical change.
- [x] Add history metric selector with explicit form/metric/unit values; retain chosen metric if valid, choose and show first only as visible default. Never silently follow first filtered group.
- [x] GREEN: same targeted trend E2E, including all three systems, theme, mobile and axe. Save screenshots/receipt privately.

## Task 2: TSV validator and entry dialog (primary, sequential)
Files: new public/tham-dinh-thuc-te/entry-paste.js and entry-paste.css; tests/unit/qualification-entry-paste.test.mjs.
Interface: CPC1EntryPaste.parse(text,{columns:[{key,label,type}],targets:[{point,trial,values}],decimal}) -> {rows,changes,errors}. changes = [{point,trial,key,value}]; no mutation. CPC1EntryPaste.attach({get,apply}); get returns {identity,title,allowed,columns,targets}, apply(changes,identity) rechecks context and validates blank targets before atomic state replacement.
- [x] Write node:vm tests: missing module contract, valid tab-separated headers/rows, decimals and exact strings, zero/blank, duplicates, invalid point/trial/date, existing conflict, dangerous keys, row/size bounds. Run `node --test tests/unit/qualification-entry-paste.test.mjs` for RED.
- [x] Implement parser and template with exact headers “Điểm”, “Lần đo”, then Vietnamese field labels including units. Reject malformed shape/unknown headers, duplicates, >1000 data rows or >1MB, embedded tabs/newlines/quotes unsupported with readable error. Blank skips, same existing skips, different existing blocks entire apply.
- [x] Dialog: selected run/form visible, editable textarea and generated empty template, decimal convention select, preview table with row/column errors, disabled Apply on errors/no changes. Apply re-parses latest context and compares identity; never stores pasted data or sends network request. Fresh session/access guard and closed/bound loaded checks at apply. Focus/escape/mobile/reduced motion supported.
- [x] GREEN parser unit tests.

## Task 3: Entry adapters + meaningful browser flow (primary sequential)
Files: public/tham-dinh-thuc-te/{gas.js,app.js,gas.html,steam.html}; new tests/e2e/qualification-entry-paste.mjs.
- [x] RED browser actual pages with fixture backend: open input dialog, paste invalid point, preview error; correct and apply multiple points/trials; assert values/dirty state, save and reload. Copy existing local-route fixture pattern, block external traffic. Assert no save on paste.
- [x] Adapters build columns from configured form fields (gas), trialFields/bm02Fields (steam). Targets only run scope, use structured array paths; never split point IDs by dots. Build clone, validate all blank destinations, update state once, invalidate computed result/request ID and call existing render/recovery. Do not alter accepted baseline or correction modes.
- [x] Include delayed load, wrong run/record/version, closed/completed, no permissions, signout, changed draft since preview, manual preexisting values, failed save retains pasted values; manual correction continues unchanged.
- [x] GREEN entry E2E plus qualification-run-workspace regression; verify save→reload and saved chart input through fixture.

## Task 4: Independent review, verification, local delivery
- [x] Primary inspect every diff and rerun relevant tests. Reviewer separate, gpt-5.6-sol for entry integrity plus chart UX. Give diff file, plan and receipts. Fix important findings with RED/GREEN and scoped re-review.
- [x] Run units for paste/charts/entry-history/trend, entry+trend+run E2E, npm run typecheck, npm run build into private artifact, npm run drift and bundle budget. Do not overwrite active dist.
- [x] Verify built artifact E2E, record hashes. Build/commit only owned changes. No push required for local delivery.
- [x] Create Desktop versioned package from verified artifact, retain old package. Update existing launcher path after inspecting it; replace only task-owned loopback4173 server if needed. Verify HTTP hashes and headless smoke without GUI. Rollback: prior package+launcher+4173 startup.
- [x] Update root and specialist PROJECT-STATE and final local/push/deploy status, brief usage instructions.

## Execution evidence — 02/10/2026

Primary retained linked worktree. Chart implementation delegated in disjoint files, primary inspected diff and reran source E2E. Parser/button missing RED, steam trial3 sparse-array RED, inapplicable endotoxin RED, then GREEN. 50 scoped unit tests pass; run-workspace regression passes. Entry E2E covers gas/steam, raw zero/comma values, multiple points/trials, source → failed save → successful save → reload → saved chart values, manual corrections, deferred load/closed, stale input/session, mobile/dark/axe/200% dialog bounds.

Independent review identified cached access check: getSession does not force context refresh. Fixed with existing refreshAccess(system, archive-edit), then actor/identity/permission recheck before atomic patch. Preserve existing archive editor rights by using canSaveActive rather than adding can_enter restriction. RED with separate server/cached permission flags, GREEN including page replacement on revocation and close during pending refresh. No backend or permission rule change. Chart reviewer copy cleanup keeps technical terms in expanded stats.

Evidence folder: /home/admin1/VMP/.cpc1/trend-entry-20261002. Desktop package30/09 retained for rollback. Final artifact check and activation receipts to follow.

Independent final review ACCEPTED; no open findings. Final source and built E2E passed, 50 units passed, typecheck/build/drift/budget passed (5.81MB/6MB). 118-file Desktop package hashes match private artifact; ten edited static assets match source. Local activation follows; web not published.

Local delivery completed: application commit b371d21e090547db4c1e0546e3033a3c8bc5480e, Desktop VMP-XU-HUONG-2026-10-02, loopback4173 PID461637. All118 HTTP files match artifact; ten edited static files match Git commit. Launcher updated/trusted, prior package and shortcut backed up, no GUI or production changes. Root/specialist state updated. deployment-receipt.json records exact scope and rollback.
