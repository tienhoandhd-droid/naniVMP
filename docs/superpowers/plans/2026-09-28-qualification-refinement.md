# Second UI pass — task-first, quiet workspace

User rejects previous aesthetics as generic. Keep local-only and all server/Auth/PDF behavior. No business decisions missing; user already authorizes autonomous design choices.

## Diagnosis and design
Previous catalogue is a long promotional page with an unnecessary sidebar, repeated system lists/library, counters and headings. Forms have excessive vertical height, a large enclosing card and equally prominent metadata. Gas connection/version occupy several rows. The revision uses a single compact header, a functional searchable library with system filters, clean white canvas and mostly monochrome controls. One muted forest accent remains for selected/focus states. Prefer flatter rows and precise type over badges, repeated uppercase labels and rounded containers.

Entry workspace keeps an understated left navigation and open white content. Active selection uses a narrow marker, not filled outlined tiles. Form title/status/action area remains clear. Put calculation actions at the top in normal document flow, eliminating bottom floating overlays; narrow-screen actions wrap into a deliberate two-column layout. Three steam measurement trials sit side by side on wide screens. Device/report metadata becomes explicitly labelled native disclosures, preserving every field/node/value. On error any disclosure containing an invalid field opens. No hiding essential error/record status.

## Ownership/dependencies
Primary: shared CSS, steam/gas HTML, app/gas UI card helpers, workspace.js. One bounded catalogue worker: index.html/home.css/home.js only, filter/search UI, no API. Primary inspects every diff. Reviewer independent read-only. No DB/migration/API/PDF/permissions edits. Existing pending release files remain untouched.

## Verification
Snapshot current local UI files for rollback and size baseline. RED tests for system filtering and explicit metadata disclosure; retain all18×7 populated browser regression, keyboard/errors/retention/axe. New functional filter test, report metadata expands with values, input payload unaffected. Compare resource bytes and document height; do not claim network speed without measurements. Build/typecheck/budget, protected backend hashes and served byte identity. No new real Supabase sessions/writes needed because backend unchanged and already smoke tested today. Headless only.

## Rollback / review
Restore only this pass from private snapshot; never overwrite pending release changes. Review screenshots at1440 and390, independently inspect focus/disclosures/filtering. Update PROJECT-STATE and local guide. User UAT pending; no push/deploy.

## Final clarification / evidence
Steam BM05 is primarily report metadata plus computed summary, so it remains expanded; only supplementary metadata is disclosed. Header helper text hidden in this pass is duplicated in the visible input-area notes; source SOP and approval caveats remain visible. Reviewer verified these distinctions.

Additional existing UX bug demonstrated RED: loading another gas record retained the previous invalid summary. Both render functions now clear stale validation before replacing DOM; evaluate reapplies fresh server validation afterwards. Independent review confirmed no request/payload/auth change.

Final: 126 populated form/width checks; catalogue filters/search; metadata retention; desktop/mobile focus; mocked load/save/PDF callback and server validation display; axe7screens all clear. 11unit, typecheck,build,budget pass. Backend7protectedhashes unchanged;9UIassets matchpublic/dist/localHTTP. Resource comparison is local fixture evidence, not network latency: catalogue font54604→36052bytes,6→4files; catalogueCSS29076→26784bytes; page heights catalogue2445→1263,steam2831→1601,air2463→1091 at1440wide. Snapshots/logs private. UAT pending, no publication.
