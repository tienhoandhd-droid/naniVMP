# Task 2 — Catalog dialog and required-reason recovery

## Scope delivered

- Replaced the catalog impact preview's bespoke fixed overlay with `ViewportDialog` (`maxWidth={880}`), retaining all preview sections, the existing coordinator, and the approved mutation payload.
- Moved preview actions into the shared dialog footer. All close routes call the existing synchronous lock and reject close while applying.
- Added `requiredReasonState`, then used its result to keep Save available, render an inline alert with ARIA wiring, and focus the reason field when it is required but blank.
- Server failures remain inline in `CatalogRecordDialog`, with typed input and save payload preserved; the toast is no longer the sole recovery path.

## TDD evidence

### RED

`node --import tsx --test tests/unit/catalog-impact-preview.test.mjs tests/unit/catalog-record-dialog-ux.test.mjs`

- Exit 1 as expected: preview markup lacked `.lp-dialog`, `role="dialog"`, and `aria-modal`; the prior bespoke overlay contained `z-index:70`.
- Exit 1 as expected: `CatalogRecordDialog.tsx` did not export `requiredReasonState`.

The initial catalog E2E run also exposed the former title selector (`div` with exact text), which is incompatible with the shared dialog's semantic heading. The selector was updated to the shared `.lp-dialog__title` contract. A diagnostic hit-test confirmed chat covers the fixture's edit button at 1440×900, so the new assertion verifies the required coexistence state (chat + preview) rather than clicking through chat.

### GREEN

`node --import tsx --test tests/unit/catalog-impact-preview.test.mjs tests/unit/catalog-record-dialog-ux.test.mjs`

- Exit 0 — 7 pass, 0 fail.

`npm run typecheck`

- Exit 0.

`node --import tsx --test tests/unit/dialog-state.test.mjs`

- Exit 0 — 18 pass, 0 fail.

`bash scripts/with-preview.sh -- node tests/e2e/catalog-workspace.mjs`

- Exit 0 — `148 đạt · 0 hỏng · ĐẠT.` The V2 success flow includes the new shared-modal-over-chat footer hit-test and Tab-containment assertion.

## Files

- `src/components/catalog/CatalogImpactPreview.tsx`
- `src/features/catalogWorkspace/CatalogRecordDialog.tsx`
- `tests/unit/catalog-impact-preview.test.mjs`
- `tests/unit/catalog-record-dialog-ux.test.mjs`
- `tests/e2e/catalog-workspace.mjs`

## Self-review

- No changes to `createCatalogImpactApplyCoordinator`, `saveRecord`, payload formation, mutations, or toast API.
- Preview close is guarded both in its footer action and `ViewportDialog` close requests.
- `git diff --check` passed.

## Commit

`fix(catalog): make confirmation and reason recovery accessible`
