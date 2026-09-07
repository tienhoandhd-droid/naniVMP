# Joyful Long Môn release evidence

Base production commit: `86d8745684e52f8698e54a0b7b77ca93683dae54`.
User authorized autonomous design, implementation and deployment on 2026-09-07.

## Delivered behavior
- Long Môn has “Theo ngày” and “Bơi tự nhiên”, operating on the exact same authorized 60-day fish model. Original status/deadline calculations and detail actions are preserved.
- Display-only preference uses guarded localStorage. Organic placement is deterministic, with varied heading/scale, subtle drifting and ripples. Pauses on user control, pointer/focus interaction, hidden document, and reduced-motion preference.
- All fish remain in the scrollable scene; dense scenes grow vertically. Mobile keeps a minimum 380px pond and contained horizontal scrolling. Legend labels wrap; light and dark legend surfaces follow theme tokens.
- Shared canvas, navigation and tables use a warmer ivory/rose finish. Original success/danger/warning/info colors are retained.
- Client diagnostics redact common credential formats, email addresses, URL query/hash and URL userinfo before deduplication and RPC submission. Existing rate limits and missing-RPC fail-safe are preserved. Logs retain pathname only; they intentionally omit route fragments and search/filter values. This is defense in depth, not a claim of arbitrary-secret detection.
- Release CI runs the new Long Môn browser test within the existing quality gate. No DB migration, source-data edit, production account change or dependency addition.

## Verified locally
Node 24.18.0; isolated mock Supabase endpoint; all browser writes intercepted in memory.

- Baseline: 808 passed, 0 failed, 1 skipped.
- Final unit suite: 821 passed, 0 failed, 1 skipped. The skip is pre-existing.
- RED/GREEN: missing presentation model; missing mode controls; quoted JSON/plain credential leaks; pause accessible-name mismatch; dark legend contrast (1.09:1 before repair).
- Pure organic model: empty, 1, 20, 150 and 500 fish; identity coverage, input immutability, finite bounds and input-order invariance.
- Browser: identical IDs/deadlines across modes, keyboard details including the last dense fish, preference reload, blocked storage read/write, pause, reduced motion, light/dark axe, explicit legend contrast >=4.5, mobile overflow/height and 50/150-fish scene bounds.
- Typecheck, design drift and diff whitespace checks passed.
- Runtime dependencies: `npm audit --omit=dev` reported 0 known vulnerabilities.
- Bundle: CSS entry 177.8 KB / 200 KB; initial JS gzip 169.2 KB / 220 KB; total dist 3.63 MB / 6 MB. Existing Vite warnings for public relative font URLs remain; fonts are present in public/fonts and loaded by browser screenshots.
- Sealed PostgreSQL 17 Source access evidence verified; no SQL files changed.
- Independent reviewer (gpt-5.6-sol) reviewed privacy, data preservation, accessibility, CSS and CI. Pause-label finding fixed with browser RED/GREEN; final scoped review found no blocker. Dark legend/mobile follow-up also independently reviewed.

## Frozen local release gate
`VMP_E2E_URL=http://127.0.0.1:4173/ VITE_MANUAL_PLANNED_DEADLINES_ENABLED=true bash scripts/with-preview.sh -- bash -c 'node tests/e2e/long-mon-presentation.mjs && npm run e2e:gialap && npm run e2e:catalog && npm run e2e:source-access && npm run e2e:progress-rights && npm run e2e:admin && npm run shell && npm run a11y && npm run budget'`

Exit 0. Main flow 149, recovery 19, deadline editing 39, catalog 151, admin 80, shell 29 assertions passed; Source access, progress-rights, account visibility and access-transition race passed. Axe: 20/20 passed. Final Long Môn browser scenarios and bundle budget passed. Relevant CSS/model unit rerun: 50/50 passed after final legend/mobile repair.

## Release / rollback
Publish only after the full frozen preview suite and GitHub quality gates pass. Remote main must still descend from the recorded base; never force-push.
Rollback: revert the upgrade commit on current main, rerun the same Quality and Deploy workflow, then verify Pages. No database rollback is necessary.
