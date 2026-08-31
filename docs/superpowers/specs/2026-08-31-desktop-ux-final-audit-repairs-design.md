# Desktop UX Final Audit Repairs — Design

**Status:** Approved direction (Approach A)
**Date:** 2026-08-31
**Target:** VMP desktop web

## Objective

Repair every reproducible UX/UI defect from the final desktop audit without redesigning the product, changing business/data behavior, or touching the Timeline/Long Môn experience. Preserve the Lotus Pearl/Vali visual identity and the current information density.

## Fixed scope

- Desktop web only.
- Exclude the Timeline route, Long Môn components, timeline page styling, and mobile-specific redesign.
- Exclude SEO, database schema, Supabase RPC/RLS, authorization policy, and business calculations.
- Preserve current URLs, access control, filters, reporting calculations, save/apply payloads, and audit history behavior.
- Prefer existing Lotus Pearl tokens and shared primitives; do not introduce a second design system.
- Correct confirmed defects, not every automated warning. Microcopy below 12px is changed only where runtime evidence showed repeated readability harm (masthead and Monitoring Journey), not by a global typography sweep.

## Audit evidence and root causes

### 1. Theme contrast

The active Monitoring Journey card uses `--lp-gold` text over the theme-dependent `--lp-plum` background. In dark mode both resolve to light colors, producing about 1.06:1 contrast. The primary Alerts command CTA repeats the same light-on-light pairing. The enabled permission flag also falls below 4.5:1 for its 12px label.

**Design:** use semantic foreground/background pairs instead of assuming gold and plum are always opposites. Active Monitoring Journey content uses the matching `--lp-on-plum` foreground. Gold-filled controls use a dedicated dark foreground token that remains readable in both themes. Permission flags use a solid semantic success pair with sufficient text contrast. Decorative gold may remain on borders or accents where it does not carry text.

### 2. Keyboard focus

Several controls explicitly set `outline: none`, while no replacement appears on keyboard focus. The defect reproduces on Reports filters, Today/Overview selectors, Progress and Health search fields, and Audit filters.

**Design:** add one global `:focus-visible` safety net for native interactive controls using `--lp-focus`, while retaining more specific component focus styles. The safety net must override legacy inline `outline: none`, appear only for keyboard-style focus, and must not alter control geometry.

### 3. Dialog and overlay consistency

`CatalogImpactPreview` builds its own fixed overlay at z-index 70. Chat is z-index 90, so chat can cover or intercept the confirmation flow. The custom overlay also lacks the shared dialog's focus trap, focus return, inert background, and scroll-safe header/footer. Several non-Timeline routes still use the legacy `Modal`, creating two keyboard and scroll behaviors. Toasts live in the app root, which becomes inert while `ViewportDialog` is open, even though the toast is visually above the dialog.

**Design:**

- Rebuild `CatalogImpactPreview` on `ViewportDialog`, preserving all catalog mutation inputs and outcomes. Its title, description, body, loading/error states, and apply/cancel controls map to the shared header/body/footer contract.
- Migrate legacy modal callers on Alerts, Workload, Overview analysis, Progress editing, period detail, and AI mail to `ViewportDialog`. Do not modify the Timeline caller or Timeline files.
- Keep dialog-level recovery inside the dialog. A failed catalog save remains inline with `role="alert"`, retains entered data, and does not depend on an inert toast action. Live toast announcements remain supplementary and must not obscure or outrank modal interaction.
- Escape, backdrop, and close-button behavior continue to call each flow's existing close handler. Busy data-changing flows remain non-dismissible where their current coordinator lock requires it.

### 4. Interaction semantics and affordance

Alert rows are focusable faux buttons that contain a real `mailto:` link. The nested interaction gives ambiguous keyboard activation. Two destination links in Workload and Reports render only about 16.8px high. The required catalog edit reason silently disables Save without exposing the requirement to assistive technology. Active Rules uses native confirm/alert for a bulk data-changing action.

**Design:**

- Make the alert row a non-interactive layout containing one real detail button and a separate mail link. Preserve the current row appearance and make the detail action occupy the main row area; Enter/Space belongs only to the button.
- Give the Workload and Reports destination links an inline-flex hit area of at least 32px on desktop, a visible focus state, and no change to copy or destination.
- Expose the catalog change reason with `aria-required`; allow the Save action to validate an empty reason, show an inline `role="alert"`, mark the field invalid, and focus it. Save remains disabled only for busy, permission, or no-change states.
- Replace the Active Rules native confirmation/result alerts with the existing shell confirmation and in-app feedback pattern. The confirmation states the bulk action and affected scope before execution; failure preserves an actionable error in the page.

### 5. Information architecture and announcements

`CardTitle` is visually a section heading but renders a plain `div`. Some live data tables lack captions or header scopes. The asynchronous Alerts AI error is visual only.

**Design:**

- Extend `CardTitle` with an explicit semantic heading level, defaulting to `h2` for route sections. Use `h3` only where a card is nested beneath an existing `h2`; preserve all existing visual styles.
- Add concise visually hidden captions and missing `scope="col"`/`scope="row"` attributes to the audited Catalog, Overview completion, annual, and analysis tables. Do not edit Timeline tables.
- Give the Alerts AI error `role="alert"` and keep its current visual treatment.

### 6. Targeted readability

The masthead subtitle is 11px with wide tracking, and Monitoring Journey descriptions/metric labels/current badge are 10–11px. The same Monitoring Journey also carries the failed contrast pairing.

**Design:** raise these live repeated labels to a minimum 12px while preserving card dimensions through line-height and spacing adjustments. Do not apply a global font-size rewrite to dense analytical tables or mobile rules.

## Component boundaries

1. **Foundation:** semantic color token, global focus-visible fallback, `CardTitle` heading contract, and `ViewportDialog` use pattern.
2. **Monitoring/Alerts:** contrast, readability, alert-row interaction, and AI error announcement.
3. **Catalog/dialog flows:** impact preview migration, required-reason validation, and modal-safe recovery.
4. **Remaining desktop routes:** non-Timeline legacy modal migrations, link hit areas, Active Rules confirmation, and table semantics.

These units share only the existing primitives/tokens. No unit changes database calls or calculation models.

## Data and state flow

- All mutations continue through their current functions (`saveRecord`, catalog impact coordinator, progress save, recalculation call, and mail flow).
- UI changes wrap or expose existing state; they do not change payload fields, ordering, retry policy, or success criteria.
- Validation errors remain local to the open form. Server errors preserve form state and offer the same retry path.
- Dialog migration only changes presentation, focus, scroll containment, and dismissal routing.

## Testing strategy

Every behavior change follows RED → GREEN:

1. Add failing unit/render tests for semantic dialog output, required reason behavior, heading levels, alert-row interaction, and table names.
2. Add failing CSS/contract tests for theme-safe foreground pairs, global focus-visible behavior, minimum link hit area, and the 12px targeted labels.
3. Run the focused tests to prove each failure before implementation, then rerun them after the minimum fix.
4. Run TypeScript checks, all unit tests, design-drift checks, production build, desktop navigation/performance gates, and relevant mocked E2E/a11y suites.
5. Re-run desktop visual/runtime checks in light and dark mode, including keyboard focus and dialog-plus-chat stacking.
6. Verify the final diff contains no Timeline/Long Môn or mobile-specific files.

## Rollback and delivery

- Keep changes in the existing isolated feature worktree and commit by independently reviewable behavior group.
- A separate reviewer checks each group and a final reviewer checks the complete diff.
- If verification fails, do not push. Revert only the failing group through a normal follow-up commit; never rewrite shared history.
- After fresh verification succeeds, push the reviewed HEAD directly to `origin/main` as explicitly authorized, monitor the GitHub Actions deploy, and verify the deployed revision.

## Acceptance criteria

- Confirmed dark-mode text contrast failures meet WCAG AA for their rendered text size.
- Every audited native control has a visible keyboard focus indicator.
- Chat cannot cover the catalog impact confirmation; dialog focus is trapped and returned correctly.
- Non-Timeline modal flows use the shared accessible dialog behavior.
- Alert detail and email are separate valid interactive controls.
- Required reason is announced, validated inline, and focused when missing.
- Audited section headings and tables expose their information hierarchy programmatically.
- No visual/layout regression in desktop light/dark runs, no horizontal overflow, and performance remains within the existing budget.
- Timeline/Long Môn, mobile redesign, SEO, database, authorization, and business logic remain unchanged.
