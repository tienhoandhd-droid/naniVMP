# Sidebar tone implementation plan

**Goal:** Make VMP's vertical navigation lighter and calmer while keeping the current navigation hierarchy and keyboard access.

**Architecture:** Keep Sidebar and QualificationNavigation routing/state intact. Replace the dark sidebar overrides in lotus-shell.css with existing theme tokens; normalize navigation typography in the existing components. No new dependencies, data writes or authorization changes.

**Tech stack:** React, TypeScript, CSS theme tokens, existing headless Puppeteer E2E harness.

## Design

Use the existing warm ivory navigation surface in light mode and the theme's neutral surface in dark mode. Use plum text on soft rose for the current page, with a slim inset marker; hover uses the existing subtle surface. Group headings become plain muted labels with spacing instead of bordered dark boxes. Menu text uses weight 500, current page 650, group/system labels 600; icons use stroke 1.8. Preferences and account panels use the same surface family. Preserve 248/72px widths and minimum 44px navigation targets.

Considered alternatives: reduce saturation of the dark gradient (still visually dominant); solid white (less consistent with the warm design). Theme tokens offer the best consistency and dark-mode support.

## Sequential tasks and checkpoints

- [x] Extend tests/e2e/qualification-shell-navigation.mjs to check light surface and readable text, record baseline screenshot and RED before editing application code. Use the existing strict network mock with populated fixture.
- [x] Update src/styles/lotus-shell.css and sidebar-only typography in src/components/layout/Layout.tsx and QualificationNavigation.tsx. Keep routing, access, formulas and printed forms intact. Rerun focused E2E for GREEN, inspect desktop/dark/mobile screenshots, exercise collapse/expand and keyboard focus.
- [x] Run typecheck, build (through npm run build plus a task-owned preview; with-preview requires unused E2E credentials absent from local configuration), targeted navigation unit contracts and design drift. Have an independent read-only reviewer inspect exactly these files and evidence, then resolve findings sequentially.
- [x] Update root PROJECT-STATE.md with local/push/deployment status. Commit only this task's files; keep the pre-existing untracked September 23 plan untouched. Deliver this new edit locally. Prior deployment authorization in the handoff refers to the completed September 29 release; this request does not ask for a new push/deployment.

Rollback: revert only this UI commit to restore previous sidebar styling. No database migration or operational rollback is needed. Primary owns every implementation file; reviewer has no write ownership.

## Verification result

- RED before app changes: `light-mode sidebar must be a light surface`.
- GREEN on production build: focused navigation E2E passed light/dark/current/hover text and icon contrast, TEAM contrast, visible focus, collapse/expand, qualification hierarchy, mobile and access boundaries.
- Targeted navigation unit contracts: 22 passed. Typecheck/build/design drift passed; focused overview axe scan 1/1 passed after fixing TEAM contrast.
- Independent read-only reviewer `sidebar_review`: APPROVED. Primary inspected the diff and final screenshots.
- Local delivery only; no push/deploy/database actions. Evidence stored outside Git at `/home/admin1/VMP/.cpc1/sidebar-20260930/`. Task preview is stopped at delivery.
