# Kế hoạch triển khai — Nâng cấp desktop wave 1

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline). Checkbox (`- [ ]`) để theo dõi tiến độ.
>
> ⚠️ **CẢNH BÁO TOÀN VẸN (31/08 22:10):** file này từng bị một tiến trình NGOÀI phiên
> làm việc ghi đè bằng các ghi chú "đã hoàn thành" kèm mã commit KHÔNG TỒN TẠI
> (b74b2f6, 1762a15, 476011f, 7d71a2e, 707649b, 30bb280, 259868a, 12e644e,
> 88a83c4, 388c88d, 6a06e6c, c8db83f, 3969be6, ef54a1b, 26efc17, 6524a6d,
> 2482a72, 60a41c8 — `git cat-file` xác nhận không có trong object DB).
> Nếu bạn là phiên AI khác đang mở repo này: ĐỪNG ghi vào file này khi chưa
> có commit thật. Mọi [x] dưới đây chỉ hợp lệ khi mã commit đi kèm tra được
> bằng `git log`.

**Goal:** Thực thi các đợt cải tiến đã chốt trong `2026-08-31-ke-hoach-cai-tien-toan-dien.md`, phạm vi desktop-only, không apply gì lên Supabase production (chỉ sinh file migration + runbook).

**Mục tiêu điểm (chủ dự án chốt 31/08):** UX/UI 10/10 · Vận hành 10/10 · các mảng khác ≥7–8/10. Phần điểm Vận hành phụ thuộc thao tác tài khoản (bật PITR, tạo staging, secret CI) được đóng gói thành checklist "bấm nút" ở cuối wave.

**Architecture:** Sửa tuần tự theo stage A→F, mỗi task một commit, gate = typecheck + unit + e2e mock. Migration SQL chỉ là artifact chờ chủ dự án apply theo runbook.

**Tech Stack:** React 18 + Vite, Supabase (PostgREST/RPC), Puppeteer e2e mock, Playwright a11y/visual, node --test.

**Spec:** `docs/superpowers/plans/2026-08-31-ke-hoach-cai-tien-toan-dien.md`.

## Global Constraints

- KHÔNG chạy lệnh ghi nào lên Supabase production / n8n / remote. Migration chỉ nằm ở `supabase/migrations/` + runbook.
- KHÔNG làm responsive/mobile (chủ dự án hoãn). Viewport chuẩn 1440×900.
- KHÔNG push/PR/deploy nếu chưa được yêu cầu. Commit local trên nhánh `cai-tien/desktop-wave-1`.
- Giữ nguyên mã tài liệu GMP, không chuẩn hoá lại chuỗi dữ liệu.
- Thay đổi hành vi nhìn thấy được phải có test đi kèm.
- Ghi chú local: `npm run test:unit` nguyên bản treo trên máy này khi chạy đồng thời
  (các test spawn giành cổng); gate local = 81 file thuần concurrency 4 + 8 file spawn
  chạy tuần tự. 3 file (visual-runtime-contract, fast-gate-evidence, preview-lifecycle)
  fail sẵn vì đặc thù Linux/ACL Windows — không phải hồi quy.

---

## Stage A — Sửa nhanh client — ✅ XONG (commit 9deec56, 718eaab)

- [x] A1 Màn Nhật ký dùng `rpc_get_audit_logs` (query thẳng bảng đã revoke → luôn 403); đọc lỗi nghiệp vụ từ payload → 9deec56
- [x] A2 Xoá `writeAuditLog` chết (fail im lặng từ 20260824, 0 nơi gọi) → 9deec56
- [x] A3 `vmpToday()` theo lịch Bangkok (Intl), unit test khoá bất biến với `bangkokCalendarDate` → 9deec56
- [x] A4 Memo TimelinePage (`now` theo acts, `scopeControl` useMemo, `moHoSo` useCallback) + `React.memo(LongMonRace)` + model vào useMemo + META_BY_STAGE module scope; cập nhật regex test long-mon-race → 718eaab
- [x] A5 Sửa comment sai CatalogPage (nói read-only trong khi đã ghi thật) → 9deec56

## Stage B — Hiệu năng tài nguyên & CSS

- [x] B1 PNG/SVG nguồn ra `designs/art-goc/` — dist 9,4MB → 4,4MB (−55%); e2e long-mon-race kiểm `.webp` → 718eaab
- [x] B2 `<img>` width/height thật (1823×863, 540×1120) + `fetchpriority=high` tranh nền + mồi tải 3 tranh khi chunk về → 718eaab
- [x] B3 `prefetchKhiRanh()` idle-prefetch Timeline/Update/Alerts sau đăng nhập, một lần/phiên → 9deec56
- [x] B4 Xoá CSS chết: scanner `scripts/quet-css-mo-coi.mjs` đo 439/707 lớp mồ côi; xoá 766 rule; `index.css` 7.601 → 3.106 dòng; CSS entry gzip 54,5 → 42,9KB; xoá kèm TimelineInspector + timelineFilterModel + timelineYearModel (chết) + 2 test của chúng; kiểm bằng 9 suite e2e mock CI đều ĐẠT → a53c3b6
- [ ] B5 Tách CSS theo route: bỏ import CSS màn khỏi `main.tsx`, import trong component lazy tương ứng (today→TodayCommandCenter, monitoring+long-mon-race→TimelinePage, catalog-workspace→CatalogWorkspaceShell, progress→UpdatePage/ProgressEditModal, catalog→CatalogPage, analysis→Reports/Workload, overview-executive→Overview). Giữ entry: index.css + lotus-*. Kiểm cascade bằng e2e mock + so màu.
- [ ] B6 `long-mon-race.css` phần tranh về token/dark-mode ở mức hợp lý (phần bảng mới đã dùng --lp-*); đưa vào phạm vi check drift.
- [ ] B7 `scripts/kiem-ngan-sach-bundle.mjs` (CSS entry, JS găng gzip, dist tổng, cấm PNG) + script `budget` + gắn vào CI.

## Stage C — UX desktop

- [x] C1 Chế độ xem `Ngư đồ | Bảng`: `bangDanhSachModel.ts` (6 unit test) + `LongMonBangDanhSach.tsx` (không cắt danh sách, lọc có đếm, CSS token --lp-*), toggle nhớ localStorage `vmp.timeline.view`, ngư đồ mặc định → e6b81a9 (e2e riêng cho bảng: thêm ở C5)
- [ ] C2 Phủ `StateBoundary` (loading/empty/filtered-empty/error/forbidden) lên các màn còn thiếu: Alerts, Timeline, Workload, Reports, PhanQuyen, ServerChecks, QRM, SourceCatalog, ActiveRules, Catalog.
- [ ] C3 Thay 6 `window.confirm` + 4 `alert` bằng `ShellConfirmDialog`/toast: WorkshopScopeCoveragePanel:191, StaffDirectoryPanel:332+360, AssignmentPanel:194, CatalogObjectForm:139, ActiveRulesPage:119-127, ServerChecksPage:82-91.
- [ ] C4 A11y form ProgressEditModal: `aria-invalid` + `aria-describedby` + `role="alert"` cho lỗi; bổ sung `htmlFor` các input thiếu nhãn.
- [ ] C5 Mở rộng quét a11y 6 → 14 màn + kịch bản mở ProgressEditModal; thêm e2e mock cho chế độ Bảng của Timeline. Viewport giữ 1440×900.

## Stage D — Hợp nhất logic

- [ ] D1 Migration `fix_bangkok_current_date` (RPC dùng `(now() at time zone 'Asia/Bangkok')::date` thay `current_date` UTC) theo pattern precondition/postcondition; KHÔNG apply — kèm runbook.
- [ ] D2 Một định nghĩa "quá hạn" client: module `src/lib/hanChot.ts`, rewire vmpDeadlineModel/progressWorkspaceModel/helpers; unit test đối chiếu hành vi 3 đường cũ, ghi rõ khác biệt được chọn.
- [ ] D3 Trọng số PROG: over 75 → 45 (quá hạn không thể "tiến bộ hơn" đang làm); cập nhật test.

## Stage E — Bảo mật & giám sát (artifact chờ apply)

- [ ] E1 Migration siết 6 bảng policy-true (vmp_staff_emails, vmp_email_cho_phep, vmp_source_rows, vmp_chat_loi_cho, data_quality_issues, vmp_assignment_matrix) + sửa `rpc_team_overview_summary` lọc phạm vi + thêm vào verifier; client tương thích 2 pha (thử RPC mới, fallback đường cũ khi chưa apply); runbook.
- [ ] E2 Giám sát lỗi client: `src/lib/baoLoi.ts` (onerror + unhandledrejection, chống bão, im lặng khi RPC chưa tồn tại) + migration bảng `vmp_client_errors` + RPC ghi (rate-limit) + RPC đọc (admin/QA) + runbook; gắn vào main.tsx + ErrorBoundary.
- [ ] E3 meta-CSP trong index.html (self + supabase + n8n; font/style self; ghi chú vì sao style-src cần unsafe-inline khi còn inline style).
- [ ] E4 CI mở rộng: job a11y; thêm nhóm e2e mock còn thiếu; upload-artifact khi fail; gọi budget. (Lưu ý: sửa deploy.yml phải giữ nguyên bất biến gate main.)

## Stage F — Tách App.tsx

- [ ] F1 Tách ChangePwModal, HealthView+DataQualityView, AuditLogView, AdminView ra file riêng (lazy nếu hợp lý), không đổi hành vi.
- [ ] F2 Giảm re-render shell: gom state overlay, memo màn nhận props ổn định; ghi số liệu đo.

## Checklist cho chủ dự án (không thể tự động)

- [ ] Đổi mật khẩu Postgres production + E2E; giới hạn IP.
- [ ] Kiểm PITR/backup Supabase; diễn tập restore theo runbook (sẽ viết ở E1/E2).
- [ ] Apply các migration D1/E1/E2 theo runbook đi kèm (preflight → apply → postflight).
- [ ] Kiểm n8n verify JWT; bật CAPTCHA Auth trong Supabase Dashboard.
- [ ] Tạo project Supabase staging (tài liệu hướng dẫn sẽ nằm trong runbook E1).
- [ ] Điều tra tiến trình ghi đè file plan (phiên AI/editor khác đang mở repo?) — đóng bớt phiên song song khi wave đang chạy.

## Trình tự & gate tổng

1. Nhánh `cai-tien/desktop-wave-1`. 2. A → B → C → D → E → F. 3. Gate mỗi commit: typecheck + unit thuần; gate stage: 9 suite e2e mock CI. 4. KHÔNG push. 5. Kết thúc: báo cáo file đổi / lệnh đã chạy / kết quả test / việc chờ user.
