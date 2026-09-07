# Joyful Long Môn Implementation Plan

> **For agentic workers:** Use bounded sequential implementation with independent review; parallel workers own only the files listed below.

**Goal:** Ship a playful, accessible VMP refresh and two selectable Long Môn layouts without changing source information.
**Architecture:** Existing React/Vite/Supabase model remains authoritative. Add a pure presentation model for organic layout, connect it only in LongMonRace, and use CSS transforms for motion. Shared theme changes and log sanitization have independent file ownership.
**Tech Stack:** React 18, TypeScript, Vite 6, Node 24, node:test, Puppeteer, Playwright/axe.

## Global Constraints
Preserve all source data, permissions, status semantics, 60-day window, table alternative and existing release gates. No new runtime dependency, production-data test writes or database changes. Use original WebP artwork. User authorizes autonomous design/deploy.

## Task 1 — Long Môn (primary planner owns)
Files: create src/features/monitoring/longMonPresentation.ts, tests/unit/long-mon-presentation.test.mjs, tests/e2e/long-mon-presentation.mjs; edit LongMonRace.tsx and long-mon-race.css in that feature, .github/workflows/deploy.yml.
Interfaces: parseLongMonView(value: unknown): 'date'|'organic'; buildOrganicPlacements(fish: readonly LongMonRaceFish[]): Map<string,{xPct:number,yPct:number,rotateDeg:number,scale:number}>. Input is filtered output from existing buildLongMonRaceModel; never re-filter or mutate activities.
- [x] RED: node tests import missing model; assert malformed preference -> date; zero fish -> empty; 1/20/150 fish finite bounds, identity coverage, input unchanged, input reverse -> same placements, several distinct headings.
- [x] GREEN: stable ID sorting, distributed jittered positions, bounded offsets; map positions onto only artistic rendering. Preserve chronological attributes and positions in default mode.
- [x] Add labeled buttons with aria-pressed, try/catch preference read/write, pause control and visibility listener. Reuse fish nodes and callbacks. Add helper text distinguishing coordinate meaning and hide date guides only in artistic mode.
- [x] Add transform motion, pause on hover/focus/document hidden, reduced-motion stop, responsive styling. Keep interaction target stable while user interacts.
- [x] Browser RED before component edits, then GREEN: both modes same IDs/deadlines/count; reload preference; keyboard activation/detail; manual pause; reduced motion; mobile overflow contained; light/dark screenshots. Add this test to CI core gate.

## Task 2 — Shared joyful polish (bounded worker: terra)
Files owned: src/styles/lotus-tokens.css, src/styles/lotus-shell.css, src/styles/lotus-components.css only. Read actual sidebar classes before editing. No TS, no feature CSS.
- [x] Inspect current shell/screens; retain semantic palette/text contrast and Vietnamese font. Brighten canvas/sunken surfaces, tune brand accents within Lotus, create gentle section/nav selection treatment using existing tokens. Changes are reversible CSS; no implementation-mirroring tests.
- [x] Validate npm run drift, inspect diff; primary checks screenshots and axe for light/dark and mobile after integration.

## Task 3 — Private diagnostic payloads (bounded worker: sol)
Files owned: src/lib/baoLoi.ts, new src/lib/clientErrorPrivacy.ts, tests/unit/client-error-privacy.test.mjs. No auth/database/API architecture edits.
Interface: sanitizeClientError(message: string, stack: string|null, url: string): {message:string,stack:string|null,url:string}.
- [x] RED: fabricated recovery fragments/query tokens, Bearer/JWT, password/key assignments and emails absent after sanitization; stack line numbers and safe route preserved; limits and null stack covered.
- [x] GREEN: pure redaction and bounded safe route; use before dedup and RPC. Catch malformed URLs; do not forward arbitrary query/hash strings. Retain current missing-RPC disable and rate limits.
- [x] Run targeted tests, typecheck, report exact commands and RED/GREEN evidence. Primary inspects every diff and reruns tests.

## Task 4 — Review, verify, release (primary)
- [x] Review independent diffs and rerun tests; run typecheck, unit, build, drift, budget. Targeted browser and existing core/axe gates; record baseline failures separately.
- [x] Sol independent final review of change range, focused on privacy, safe filtering, controls, accessibility and release regressions. Resolve substantive findings and rerun relevant checks.
- [ ] Commit only planned files; confirm remote main unchanged; authorized fast-forward release with no force. If remote advances, integrate and rerun affected checks.
- [ ] Follow workflow through Pages deployment, verify production release and artifact. Store evidence and rollback instructions. No deploy success claim before live verification.
