# Source create repair and requested extensions

**Goal:** Repair new-object submission for admin/QA manager; prepare the upcoming schedule and safe object-code editing design.

**Architecture:** Keep Source access decisions and SQL whitelist unchanged for the create repair. Separate the business key from mutable attributes at the existing saveCatalogObject RPC boundary. Never discard a different object code silently: reject rename until its own transactional endpoint is implemented. The UI continues to obtain the create key from the form patch.

**Dependencies / shared state:** Existing linked worktree feat/tham-dinh-thuc-te, baseline 9fa56c4. Preserve pending point-chart changes. Primary owns src/lib/supabaseData.ts and any extracted pure payload helper; reviewer is read-only. No production data writes. GitHub DNS and browser sandbox currently prevent release/browser checks.

## Task 1 — creation regression
- [x] Execute the actual saveCatalogObject function with a mocked transport only; pass buildCatalogPatch from a valid new-object form. Assert p_object_code contains the key, p_patch excludes object_code, unchanged fields and expected version retain values. Observe RED against current code.
- [x] Fix boundary serialization without widening the server allowlist; preserve input immutability and reject conflicting key changes.
- [x] Verify create/edit, failure and admin/qa_manager UI permission eligibility. Run targeted catalog unit suite, typecheck and build.
- [x] Independent reviewer checks diff and creation boundary, reruns tests; primary inspects findings.

## Task 2 — clarified requirement, database verification blocked
User clarified: completed previous VMP => next VMP for the same object, using existing server actual_vmp_date + Source frequency policy. No 90-day list. See ../specs/2026-10-08-source-next-vmp-and-rekey-design.md for current design and scope constraints.
Code changes require a dedicated authorized transaction: old/new code, source UUID, version, reason; global duplicate check; lock old/new identities; reconcile active relational references and pending changes; preserve historical snapshots and signed records; audit old/new and invalidate scoped reads. Inspect full dependency graph and live schema before implementation. Do not simply unlock current field or repurpose create-upsert.

## Review / rollback / delivery
Review boundary changes independently, SQL authorization changes need PostgreSQL role-matrix/race/rollback tests and read-only production preflight before applying. Roll back UI by reverting task commit, DB rollback only from reviewed migration design. Run existing required CI gates including trend E2E before authorized Pages release. Verify exact commit artifact/live hashes. Record local/push/production/deploy separately; never claim real account checks from mocked roles.

Verification: 34 unit/control-matrix tests, typecheck and private build passed. Read-only independent review accepted creation fix. Browser and actual role/SQL tests blocked by environment; no deployment claim.

## 08/10 — môi trường được mở, tiếp tục kiểm thử
Primary xác nhận network/Docker đã hoạt động. Chạy workflowdispatch exactf07f4a8 (nondeploy) và local trendE2E. Bounded worker được giao riêng tests/e2e/catalog-workspace.mjs để bổ sung luồng create admin/qa_manager với whitelist transport chặt, giữ dữ liệu nhập khi lỗi, retry/reload; không sửa app/mock toàn cục/SQL. Primary đọc diff, rerun targeted và full CI trước release. Reviewer độc lập đọc kết quả. Shared app/DB tiếp tục do primary sở hữu. Rollback commit revert; không bỏ E2E.

Local browser verification after unlock: trend E2E found steam8/8/1trial categorical over-allocation; fixed point footprint allocation, full18axe/light/dark/mobile GREEN. Paste E2E updated expected air bars/nitrogen dots, exact0/12.5assertions GREEN. Admin/qa_manager create failure/retry/list reload added, fullcatalog173pass. Fullunit1025pass/1existing skip, typecheck/drift/privatebuild/budget5.83MBpass. Independent point reviewer accepted chart/pastefix. Existing dispatchf07f4a8 cannot be release candidate because it lacks these follow-up fixes; run exact new SHA before main.
