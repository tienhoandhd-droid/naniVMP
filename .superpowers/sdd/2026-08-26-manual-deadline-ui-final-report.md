# Manual planned-deadline UI — final-wave report

Date: 2026-08-26
Scope: final Phase D UI/API/test readiness only. No database migration, QA SQL,
permission/catalog E2E, or `ProgressEditModal` change is included.

## Final behavior

- The dialog now obtains its success acknowledgement from `useToast()` and shows
  `Đã cập nhật deadline kế hoạch`; the former optional, unwired `onSuccess` prop
  is gone.
- Footer close, header X, Escape, backdrop, and explicit conflict reload use
  the same ref-backed `requestClose` policy. A busy mutation cannot dismiss or
  reload the dialog. Conflict reload closes first and performs exactly one
  refresh only after the user chooses it; failures retain the controlled draft.
- Local input preparation rejects a blank identity, an invalid version, and any
  runtime deadline object that is not exactly the four approved own keys. It
  also preserves the calendar-date, reason, confirmation, erasure, ordering,
  and no-op gates.
- The RPC boundary issues exactly one named five-parameter request, retains JSON
  `error_code` and conflict versions verbatim, and distinguishes transport
  failures from domain JSON results.
- The mock browser suite exercises both allowed responsive entry paths, denied
  role absence, protected evidence, all local/server/transport/conflict paths,
  explicit reload, and the deferred duplicate-submit/dismissal race. CI enables
  the feature only for its mock E2E step; the normal production build remains
  unset/fail-closed.

## Fresh verification (Node v24.18.0)

- `node --import tsx --test tests/unit/planned-deadline-edit-model.test.mjs tests/unit/planned-deadline-dialog.test.mjs tests/unit/planned-deadline-api.test.mjs tests/unit/e2e-suite-contract.test.mjs` — 24 pass, 0 fail.
- `npm run typecheck` — pass.
- `npm run build` with the feature flag unset — pass.
- `VITE_MANUAL_PLANNED_DEADLINES_ENABLED=true bash scripts/with-preview.sh -- node tests/e2e/timeline-deadline-edit.mjs` — 38 pass, 0 fail.
- `VITE_MANUAL_PLANNED_DEADLINES_ENABLED=true bash scripts/with-preview.sh -- npm run e2e:gialap` — existing flow 178 pass, account regression pass, deadline flow 38 pass, 0 failures.
- `git diff --check` — pass.

The Vite build continues to report the repository's existing unresolved local
font URL and mixed static/dynamic Supabase-import warnings; neither is caused
by this final-wave change.
