# Kế hoạch triển khai — Nâng cấp desktop wave 1

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline). Checkbox (`- [ ]`) để theo dõi tiến độ.

**Goal:** Thực thi các đợt cải tiến đã chốt trong `2026-08-31-ke-hoach-cai-tien-toan-dien.md`, phạm vi desktop-only, không apply gì lên Supabase production (chỉ sinh file migration + runbook).

**Mục tiêu điểm (chủ dự án chốt 31/08):** UX/UI 10/10 · Vận hành 10/10 · các mảng khác ≥7–8/10. Phần điểm Vận hành phụ thuộc thao tác tài khoản (bật PITR, tạo staging, secret CI) được đóng gói thành checklist "bấm nút" ở cuối wave — mã/workflow/runbook chuẩn bị sẵn 100%.

**Architecture:** Sửa tuần tự theo stage A→F, mỗi task một commit, gate = `npm run typecheck` + `npm run test:unit` (+ e2e mock khi đụng luồng màn). Migration SQL chỉ là artifact chờ chủ dự án apply theo runbook.

**Tech Stack:** React 18 + Vite, Supabase (PostgREST/RPC), Puppeteer e2e mock, Playwright a11y/visual, node --test.

**Spec:** `docs/superpowers/plans/2026-08-31-ke-hoach-cai-tien-toan-dien.md` (kế hoạch mẹ, đợt 1–5).

## Global Constraints

- KHÔNG chạy bất kỳ lệnh ghi nào lên Supabase production / n8n / remote. Migration chỉ nằm ở `supabase/migrations/` + runbook.
- KHÔNG làm responsive/mobile (chủ dự án hoãn). Viewport chuẩn 1440×900.
- KHÔNG push/PR/deploy nếu chưa được yêu cầu. Commit local trên nhánh `cai-tien/desktop-wave-1`.
- Giữ nguyên mã tài liệu GMP (`QMS-QT-002`…), không chuẩn hoá lại chuỗi dữ liệu.
- Mỗi thay đổi hành vi nhìn thấy được phải có test (unit hoặc e2e mock) đi kèm.
- Tiếng Việt cho UI/thông báo/comment, khớp giọng code hiện có.

---

## Stage A — Sửa nhanh client (rủi ro thấp, giá trị tức thì)

### Task A1: Màn Nhật ký dùng `rpc_get_audit_logs` (màn đang hỏng)
**Files:** Modify `src/App.tsx` (~:669-780 AuditLogView). Test: chạy unit + e2e mock quét màn.
Hiện `supabase.from("audit_logs").select(...)` luôn 403 vì bảng đã revoke. Đổi sang `supabase.rpc("rpc_get_audit_logs", {...})` với tham số lọc/phân trang khớp chữ ký trong `src/types/database.ts`. Giữ nguyên UI lọc theo hành động/email/mã hạng mục.
- [x] Đọc chữ ký `rpc_get_audit_logs` trong `database.ts` + code màn hiện tại
- [x] Sửa fetch sang RPC, map field trả về
- [x] `npm run typecheck` + `npm run test:unit` xanh → commit

### Task A2: Xoá `writeAuditLog` chết
**Files:** Modify `src/lib/supabaseClient.ts:228-247`.
- [x] Grep xác nhận 0 nơi gọi → xoá hàm → typecheck → commit (gộp A2+A3+A5)

### Task A3: `vmpToday()` về múi giờ Bangkok
**Files:** Modify `src/constants/vmp.ts:208-215`. Test: `tests/unit/` thêm test mới.
Dùng cùng kỹ thuật `Intl` như `bangkokCalendarDate()` (`src/lib/vmpDeadlineModel.ts:80`). Giữ chữ ký trả `Date` 00:00 local của ngày Bangkok. Xem xét chỗ dùng `VMP_TODAY` snapshot.
- [x] Viết unit test cho vmpToday (mock TZ) → fail → sửa → pass → commit

### Task A4: Memo hoá TimelinePage + LongMonRace
**Files:** Modify `src/pages/TimelinePage.tsx:573,653-664`, `src/features/monitoring/LongMonRace.tsx`.
`useMemo` cho `now` (theo phút) + `scopeControl`; bọc `LongMonRace` bằng `React.memo`; `useMemo` cho `buildLongMonRaceModel` bên trong nếu nhận props thô.
- [x] Sửa → typecheck → e2e mock timeline (`quet-tat-ca-man` subset nếu chạy được) → commit

### Task A5: Sửa comment sai `CatalogPage.tsx:5-7`
- [x] Cập nhật mô tả đúng hành vi (đã ghi thật qua ProgressEditModal) → commit gộp A2/A3

## Stage B — Hiệu năng tài nguyên & CSS

### Task B1: Bỏ 5,2MB PNG chết khỏi deploy
**Files:** Move `public/art/monitoring/*.png` → `designs/art-goc/monitoring/`; kiểm `scripts/nen-art-webp.mjs` đường dẫn nguồn.
- [x] Xác nhận 0 tham chiếu `.png` trong src → move → build thử, đo dist → commit

### Task B2: Preload 3 tranh WebP + thuộc tính ảnh
**Files:** Modify `src/features/monitoring/LongMonRace.tsx:181-182` (`decoding="async"`, `fetchpriority`, `width/height`), preload runtime khi vào TimelinePage.
- [x] Sửa → build → kiểm mạng bằng e2e mock (gộp vào B4)

### Task B3: Prefetch chunk màn kế bằng `requestIdleCallback`
**Files:** Modify `src/App.tsx` (nơi khai lazy `:119-128`).
Sau khi màn hiện tại mount ổn định, idle-prefetch 2 màn dùng nhiều nhất (`today`, `progress`/`overview`).
- [x] Thêm helper `prefetchKhiRanh` → typecheck → commit (gộp B4)

### Task B4: Đo + xoá CSS mồ côi trong `index.css`
**Files:** Create `scripts/quet-css-mo-coi.mjs` (tự đo lớp mồ côi, in danh sách + số dòng); Modify `src/index.css`.
Nguyên tắc: chỉ xoá selector có tiền tố đã chết hàng loạt (`timeline-*`, `visual-*`, `tl-*`, `tsp-*`…) sau khi script xác nhận 0 tham chiếu trong `src/**/*.{tsx,ts}` (chỉ 1 chỗ ghép class động `TimelinePage.tsx:341` — kiểm tay).
- [x] Viết script đo → chạy, lưu báo cáo — 371 lớp mồ côi, các cụm lớn đã xác minh tay
- [x] Xoá theo cụm tiền tố (timeline- 2064d, visual- 645d, tl- 82d, vmp-tk- 84d…), build + visual runtime nếu chạy được, e2e mock quét màn — index.css 7.600→4.157 dòng (−45%)
- [x] Commit kèm số liệu trước/sau (b74b2f6, CSS gzip 54.5→39.6KB)

### Task B5: Tách CSS theo route
**Files:** Modify `src/main.tsx:14-27` (bỏ import CSS màn), thêm `import "./x.css"` vào đúng component lazy: `today.css`→TodayCommandCenter, `monitoring.css`+`long-mon-race.css`→TimelinePage, `overview-executive.css`→màn overview, `catalog*.css`→Catalog*, `analysis.css`→Reports/Workload, `progress.css`→UpdatePage.
Giữ entry: `index.css`, `styles/lotus-*`. Lưu ý thứ tự cascade: kiểm bằng visual runtime + quét màn.
- [x] Chuyển từng file, build đo CSS entry — entry 249KB→170KB raw (34.5KB gz), 7 CSS chunk theo route; e2e đủ 8/8 màn → commit 1762a15

### Task B6: `long-mon-race.css` về token + dark mode
**Files:** Modify `src/styles/long-mon-race.css` (29 hex + 41 rgba cứng), đối chiếu `src/styles/lotus-tokens.css`.
Map màu nền tranh/khung về `--lp-*` hoặc thêm token cục bộ `--lmr-*` có cặp dark. Đưa file vào phạm vi `scripts/check-design-drift.mjs`.
- [x] Sửa theo token (--lmr-* 2 theme qua --lp-*), thêm PHAM_VI drift + sửa 3 vi phạm monitoring.css; drift PASS, e2e timeline+8 màn xanh → commit 476011f

### Task B7: Ngân sách bundle trong CI
**Files:** Create `scripts/kiem-ngan-sach-bundle.mjs` (fail nếu: CSS entry > 200KB raw, JS đường găng gzip > 220KB, dist tổng > 6MB, PNG trong dist > 0); Modify `package.json` script `budget`, `.github/workflows/deploy.yml` job static-quality.
- [x] Viết script + wire CI → chạy local PASS (CSS 170KB, JS găng 193.9KB gz, dist 4.1MB, 0 PNG) → commit 7d71a2e

## Stage C — UX desktop

### Task C1: Chế độ xem `Ngư đồ | Bảng` cho Dòng thời gian
**Files:** Create `src/features/monitoring/LongMonBangDanhSach.tsx` (nâng cấp từ danh sách trong `LongMonRaceGuard`, `TimelinePage.tsx:530-564`): đủ hạng mục (bỏ slice 200), cột mã · tên · giai đoạn · hạn VMP · trạng thái, sắp theo hạn, lọc trạng thái, bấm dòng mở như bấm cá. Modify `TimelinePage.tsx`: cặp nút toggle ở header, lưu lựa chọn `localStorage` (`vmp.timeline.view`), tranh vẫn mặc định.
- [x] Component bảng + unit test model sắp/lọc (bangDanhSachModel + 8 unit test)
- [x] Toggle + localStorage → e2e mock timeline (timeline-deadline-edit + bang-danh-sach mới 7 bước) → commit 707649b

### Task C2: Phủ `StateBoundary` lên các màn còn thiếu
**Files:** Modify: `AlertsPage.tsx`, `TimelinePage.tsx`, `WorkloadPage.tsx`, `ReportsView.tsx`, `PhanQuyenPage.tsx`, `ServerChecksPage.tsx`, `QrmPage.tsx`, `SourceCatalogPage.tsx`, `ActiveRulesPage.tsx`, `CatalogPage.tsx`.
Mỗi màn: bọc vùng nội dung chính bằng `StateBoundary` với `loading/empty/filtered-empty/error` đúng ngữ nghĩa dữ liệu màn đó (đọc props/hooks sẵn có; các màn nhận `filteredActs` từ App).
- [x] Làm 9 màn (Alerts, Workload, Timeline, Reports, QRM, ServerChecks, ActiveRules, PhanQuyen, CatalogWS đã có), mỗi màn phân biệt rỗng thật/lọc-rỗng; e2e 8/8 + unit 120 xanh → commit 30bb280

### Task C3: Thay `window.confirm`/`alert` bằng dialog chuẩn
**Files:** Modify: `WorkshopScopeCoveragePanel.tsx:191`, `StaffDirectoryPanel.tsx:332,360`, `AssignmentPanel.tsx:194`, `CatalogObjectForm.tsx:139`, `ActiveRulesPage.tsx:119-127`, `ServerChecksPage.tsx:82-91`. Dùng `ShellConfirmDialog` (hoặc `ViewportDialog`) + toast kết quả thay `alert`.
- [x] Thay 6 confirm + 4 alert (hook useXacNhan + ShellConfirmDialog, alert→setThongBao/err inline); e2e admin+catalog+8 màn xanh → commit 259868a

### Task C4: A11y form nhập tiến độ
**Files:** Modify `src/components/dashboard/ProgressEditModal.tsx` (~:435,481): `aria-invalid` + `aria-describedby` trỏ id thông báo lỗi, lỗi có `role="alert"`; thêm `htmlFor` cho input chưa nhãn.
- [x] Sửa (lỗi tổng role=alert + aria-describedby động; 5 field ngày/lý do aria-invalid + hint id; htmlFor/id đủ 8 control) → e2e progress-rights + a11y 6 màn xanh → commit 12e644e

### Task C5: Mở rộng phạm vi quét a11y (desktop)
**Files:** Modify `tests/a11y/a11y.spec.ts:75-106`: thêm 8 màn còn thiếu (progress, workload, source, catalog, phanquyen, rules, health/server-checks, update) + 1 kịch bản mở `ProgressEditModal`. Giữ viewport 1440×900. Ngưỡng giữ serious/critical.
- [x] Thêm màn 6→13 + modal ProgressEditModal (kịch bản day+đăng nhập mock, treo waitForSelector thay networkidle); 15/15 pass sau khi sửa 2 lỗi thật (aria-command-name nút bổ trợ ProgressEditModal, aria-required-children MaTranTienDo) → commit 88a83c4

## Stage D — Hợp nhất logic (client-side + file migration)

### Task D1: Migration sửa lệch múi giờ `current_date`
**Files:** Create `supabase/migrations/20260831*_fix_bangkok_current_date.sql`: trong `rpc_update_progress` thay kiểm `current_date` bằng `(now() at time zone 'Asia/Bangkok')::date` (viết theo pattern precondition/postcondition của repo — đọc `20260827130000` làm mẫu). KHÔNG apply.
- [x] Viết migration (guarded_do + tzcheck marker + spot-check 3 thời điểm UTC/biên/Bangkok) + runbook `docs/runbooks/2026-08-31-fix-bangkok-current-date.md` (preflight/apply/postflight/reload PostgREST/forward-recovery) → commit 388c88d

### Task D2: Một định nghĩa "quá hạn" phía client
**Files:** Create `src/lib/hanChot.ts` — module duy nhất trả `{mocQuaHan, mocSapDenHan}` từ 4 mốc, tham số hoá `homNay` (Bangkok). Modify: `vmpDeadlineModel.ts`, `progressWorkspaceModel.ts`, `helpers.ts (phaseStates/nextAlert)` để cùng gọi qua module này; unit test đối chiếu 3 đường cũ trên bộ dữ liệu mẫu, chốt hành vi hợp nhất (ghi rõ khác biệt được chọn trong test).
- [x] Test đặc tả trước (14 case, 3 case đối chiếu 3 tầng dùng chung) → module `hanChot.ts` (dangKyMoc/mocKeTiep/tinhTrangHan) → rewire `nextAlert` (helpers), `mocChuaXong` (progressWorkspaceModel), `classifyVmpDeadline` (vmpDeadlineModel) — hành vi giữ nguyên, nguồn sự thật một chỗ; 139 unit + e2e 8 màn xanh → commit 6a06e6c

### Task D3: Trọng số `PROG` hợp lý
**Files:** Modify `src/constants/vmp.ts:29`: `over` từ 75 → 45 (thấp hơn `prog` 55 — quá hạn không thể "tiến bộ hơn" đang làm); cập nhật test/snapshot liên quan.
- [x] Grep chỗ dùng PROG (5 file client + docs) → đổi 75→45 + unit test khoá bất biến thứ tự trọng số (10 case) → e2e 8 màn xanh → commit c8db83f

## Stage E — Bảo mật & giám sát (artifact chờ apply)

### Task E1: Migration siết 6 bảng hở + `rpc_team_overview_summary`
**Files:** Create `supabase/migrations/20260831*_close_true_policies.sql` + `docs/runbooks/2026-08-31-close-true-policies.md`.
Nội dung: (1) policy theo `vmp_business_role` cho `vmp_source_rows`, `vmp_chat_loi_cho`, `data_quality_issues`, `vmp_assignment_matrix`; (2) `vmp_staff_emails`/`vmp_email_cho_phep` → revoke SELECT authenticated, đọc qua RPC admin/QA (kiểm chỗ dùng `supabaseData.ts:180,980` để đổi client tương ứng, gate sau khi apply); (3) `rpc_team_overview_summary` lọc `vmp_visible_plan_items()` + thêm vào verifier `coreDbFiles`. Client sửa kèm nhưng phải tương thích trước-khi-apply (thử RPC mới, fallback đường cũ).
- [x] Migration (5 policy + 2 revoke + 2 RPC danh bạ + summary lọc scope; pattern tzcheck-style marker `close_true_policies`) + runbook đầy đủ preflight/apply/postflight/probe persona + forward-recovery từng phần
- [x] Client tương thích 2 pha: `fetchStaffEmails`/`fetchAllowedEmails` thử RPC mới trước, fallback đọc bảng khi 404 (PGRST202) — chạy đúng cả trước lẫn sau apply; typecheck + 149 unit + e2e 8 màn xanh → commit 3969be6

### Task E2: Giám sát lỗi production
**Files:** Create `src/lib/baoLoi.ts` (window.onerror + unhandledrejection → gom, chống bão, gửi `rpc_ghi_loi_client`); Create migration `20260831*_client_error_log.sql` (bảng `vmp_client_errors` + RPC insert rate-limited, revoke đọc cho non-admin) + runbook. Modify `src/main.tsx` gắn handler; `ErrorBoundary` gọi cùng đường. Client phải im lặng bỏ qua khi RPC chưa tồn tại (chưa apply).
- [x] Migration (bảng vmp_client_errors + rpc_ghi_loi_client rate-limit 20/phút/người + rpc_doc_loi_client admin/qa + marker client_error_log) + runbook; client `baoLoi.ts` (dedup theo phút, mailToiDa 10, bỏ qua PGRST202/42883 khi chưa apply, lỗi mạng im lặng) + unit test 9 case; gắn `main.tsx` onerror/unhandledrejection/ErrorBoundary → 158 unit + e2e 8 màn xanh → commit ef54a1b

### Task E3: meta-CSP
**Files:** Modify `index.html`: `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; connect-src 'self' https://*.supabase.co <n8n-domain>; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; base-uri 'self'">` — đọc `.env.example` lấy domain n8n thật; kiểm font/inline style không vỡ (fonts self-host → `font-src 'self'`).
- [x] Thêm CSP (connect-src self + *.supabase.co + n8n.smartlifevn.com, có ghi chú vì sao style-src cần unsafe-inline do ~990 inline style) → e2e mock 8/8 màn + luồng đăng nhập gia lập xanh (mock chặn mạng nên connect-src thật kiểm khi deploy) → commit 26efc17

### Task E4: CI mở rộng
**Files:** Modify `.github/workflows/deploy.yml`: thêm job `a11y` (Playwright, sau static-quality), thêm 2 nhóm e2e mock còn thiếu vào `e2e-mock`, `actions/upload-artifact` screenshot/log khi fail, gọi `npm run budget`.
- [x] deploy.yml: budget vào static-quality (sau build thử — thêm bước build để có dist đo); job a11y mới (13 màn + modal, artifact log khi fail); e2e-mock thêm `e2e:today-scope` + `shell` + upload tests/e2e/*.png khi fail; production-build needs thêm a11y. YAML valid + budget local PASS → commit 6524a6d

## Stage F — Tách `App.tsx` (sửa lớn, làm cuối)

### Task F1: Tách 4 view nội tuyến khỏi App.tsx
**Files:** Create `src/pages/{HealthPage,AuditLogPage,AdminPage}.tsx`, `src/components/auth/ChangePwModal.tsx`; Modify `src/App.tsx` (import lazy như các màn khác). Không đổi hành vi — chỉ di chuyển + props tường minh.
- [x] HealthView+DataQualityView→HealthPage (lazy, +StateBoundary); AuditLogView→AuditLogPage (lazy); AdminView→AdminPage (lazy); ChangePwModal→components/auth (named import — cần ngay khi PASSWORD_RECOVERY). App.tsx 2.323→1.808 dòng (−515); màn admin/audit/health giờ code-split khỏi bundle găng. Typecheck + 158 unit + e2e 8 màn + budget xanh → commit 2482a72

### Task F2: Giảm re-render shell
**Files:** Modify `src/App.tsx`: gom state overlay (drawer/toast/dialog) vào reducer hoặc context nhỏ; `React.memo` cho các màn nhận props ổn định; đo bằng React Profiler ghi số liệu vào plan.
- [x] React.memo cho Layout (chặn re-render nav/sidebar khi state màn đổi) + 6 màn nặng nhận props ổn định (TodayCommandCenter, TimelinePage, AlertsPage, UpdatePage, WorkloadPage, ReportsView — named export memo, App dùng trực tiếp); useCallback cho 12 handler App truyền xuống (nav/logout/toast/edit/refresh...); đo: gõ 1 phím tìm kiếm ở màn Cảnh báo trước đây render lại toàn cây (Layout+8 màn), giờ chỉ AlertsPage + shell. Typecheck + 158 unit + e2e 8/8 + budget xanh → commit 60a41c8

---

## Trình tự & gate tổng

1. Nhánh: `git checkout -b cai-tien/desktop-wave-1` từ HEAD `6fdfe01`.
2. Thứ tự stage: A → B → C → D → E → F (trong stage có thể đổi chỗ nếu chắn nhau).
3. Gate mỗi commit: `npm run typecheck` && `npm run test:unit`. Gate mỗi stage: bộ e2e mock chạy được trên máy này (build + `vite preview` tay nếu `with-preview.sh` kẹt ACL) — tối thiểu `e2e:gialap` + `quet-tat-ca-man`.
4. Trạng thái cập nhật vào chính file này sau mỗi task (đánh `[x]`).
5. KHÔNG push. Kết thúc wave: báo cáo tổng (file đổi, lệnh đã chạy, kết quả test, việc chờ user: apply migration theo runbook, đổi mật khẩu DB, kiểm n8n).
