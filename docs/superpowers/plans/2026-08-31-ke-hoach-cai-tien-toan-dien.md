# Kế hoạch cải tiến toàn diện VMP Monitor — 31/08/2026

Nguồn: soi chuyên sâu 6 mảng (chức năng · dữ liệu · bảo mật · UX/UI · hiệu năng · vận hành) trên HEAD `6fdfe01`.
Chấp nhận sửa lớn theo yêu cầu chủ dự án. Mỗi đợt độc lập, có gate kiểm chứng riêng.

## Chấm điểm hiện trạng

| Mảng | Điểm | Nhận định một dòng |
|---|---|---|
| Chức năng | 7/10 | Đường ghi chuẩn ALCOA+, nhưng thiếu hồ sơ đính kèm/phê duyệt điện tử |
| Dữ liệu | 6/10 | Audit trail tốt; schema gốc KHÔNG có trong repo; 4 định nghĩa "quá hạn" song song |
| Bảo mật | 6/10 | Kiến trúc allowlist xuất sắc; nhưng 6 bảng hở policy `true`, 1 RPC không lọc phạm vi, mật khẩu DB yếu |
| UX/UI | 5.5/10 | Nền tảng tốt (StateBoundary, token màu) nhưng phủ 4/14 màn; mobile gần như bỏ trống |
| Hiệu năng | 7/10 | Chunk tách tốt; CSS 304KB chặn render, 45% index.css là code chết, 5.2MB PNG chết trong dist |
| Vận hành | 4/10 | Runbook GxP xuất sắc nhưng một-lần; KHÔNG giám sát production, KHÔNG staging, KHÔNG backup dữ liệu, bus factor = 1 |

## ĐỢT 0 — KHẨN CẤP (hôm nay, thao tác tay của chủ dự án, KHÔNG phải code)

- [ ] **Đổi mật khẩu Postgres production** trên Supabase Dashboard → chuỗi ngẫu nhiên ≥32 ký tự.
      Lý do: `.env.local:8` chứa mật khẩu yếu đoán được (tên + năm), vai `postgres` bypass RLS, pooler 6543 mở Internet.
- [ ] Đổi `E2E_PASSWORD` (tài khoản viewer production).
- [ ] Bật Network Restrictions / IP allowlist cho DB nếu gói Supabase cho phép.
- [ ] Kiểm tra Supabase: PITR/daily backup đã bật chưa; Redirect URL allowlist của Auth chỉ chứa domain Pages + localhost.
- [ ] Xác minh workflow n8n chat/AI có verify JWT không hay chỉ kiểm token tĩnh `x-vmp-chat` (token này nằm công khai trong bundle).

## ĐỢT 1 — Bịt lỗ hổng bảo mật DB (tuần 1)

1. **Migration siết 6 bảng policy fallback `true`** (`20260824120000...:764-767` sinh policy "mọi phiên hoạt động"):
   `vmp_staff_emails`, `vmp_email_cho_phep`, `vmp_source_rows`, `vmp_chat_loi_cho`, `data_quality_issues`, `vmp_assignment_matrix`.
   Mô hình: theo đúng pattern enforce của `20260828150000` (policy theo `vmp_business_role` + phạm vi). PII (danh bạ email) → admin/QA-only qua RPC.
2. **Sửa `rpc_team_overview_summary`**: lọc qua `vmp_visible_plan_items()`; thêm vào allowlist `vmp_unfiltered_security_definer_item_readers()` nếu cần giữ; thêm file vào `coreDbFiles` của `scripts/verify-source-access-db-evidence.mjs`.
3. **Commit schema gốc vào repo**: `pg_dump --schema-only` → `supabase/schema.sql` + export thân các `*__five_role_impl_*`. Đây là nền GAMP 5/IQ — không có nó thì không tái dựng, không audit tĩnh được.
4. Xoá `writeAuditLog` chết (`supabaseClient.ts:228-247`); sửa màn Nhật ký `App.tsx:669-680` dùng `rpc_get_audit_logs` (hiện query thẳng bảng đã revoke → màn luôn lỗi).
5. Bật CAPTCHA + khai `[auth]`/rate-limit trong `config.toml`; thêm meta-CSP vào `index.html`; CI dùng `npm ci --ignore-scripts` + gọi patch script tường minh.

Gate: chạy lại bộ test DB 5 vai; probe persona xác nhận workshop_staff không còn đọc được `vmp_staff_emails`.

## ĐỢT 2 — Nền vận hành (tuần 2–3)

1. **Giám sát production** (rủi ro rẻ nhất để đóng): `window.onerror` + `unhandledrejection` → RPC ghi vào bảng lỗi Supabase (hoặc Sentry free tier); uptime check bằng GitHub Actions cron ping trang + query đếm lỗi 24h.
2. **Staging**: project Supabase thứ hai (free tier đủ), nạp `supabase/schema.sql` từ Đợt 1 + seed ẩn danh. Mở khoá luôn bộ `npm run e2e` 7 file đang không chạy được vì "chỉ có production".
3. **Runbook migration TỔNG QUÁT** (thay 5 runbook một-lần): preflight → backup (schema + DATA các bảng sắp đụng) → apply → postflight → reload PostgREST. Kèm **diễn tập restore** một lần và ghi biên bản.
4. **CI mở rộng**: thêm `a11y` + `visual` + nhóm E2E mock còn lại vào gate PR; `actions/upload-artifact` screenshot khi fail; script canh bundle budget (fail nếu CSS đường găng > ngưỡng).

## ĐỢT 3 — Hợp nhất logic nghiệp vụ (SỬA LỚN 1, tuần 3–5)

Vấn đề gốc: mọi KPI/cảnh báo/trạng thái tính lại ở client, lệch với hàm server nuôi email n8n; "quá hạn" có 4 định nghĩa (`vmpDeadlineModel.ts:89`, `progressWorkspaceModel.ts:104`, `helpers.ts:79-116`, `computed_status` DB).

1. Chốt **server là nguồn sự thật**: `computed_status` + view/RPC trả trạng thái, mốc thời gian (`vmp_tinh_moc_thoi_gian`), KPI. Client chỉ hiển thị + lọc.
2. Thay dần suy trạng thái regex tiếng Việt (`helpers.ts:124-176`) bằng enum từ DB; regex chỉ còn ở tầng import dữ liệu nguồn, kèm cảnh báo "không phân loại được" thay vì đoán âm thầm.
3. Sửa lệch múi giờ: RPC `current_date` (UTC) → `(now() at time zone 'Asia/Bangkok')::date` (`20260827130000:501-507`) — ca 00:00–07:00 đang không nhập được ngày hôm nay. Sửa luôn `vmpToday()` (`constants/vmp.ts:208`) về Bangkok.
4. Dọn: trọng số `PROG` over(75) > prog(55) vô lý; nhánh outbox `if false`; comment sai ở `CatalogPage.tsx:5-7`.

Gate: `ServerChecksPage` hai tab client/server phải ra số TRÙNG NHAU; thêm unit test đối chiếu.

## ĐỢT 4 — Tái cấu trúc frontend (SỬA LỚN 2, tuần 5–8)

1. **Tách `App.tsx`** (2.249 dòng, 40 useState, chứa 4 view nội tuyến): mỗi view ra file riêng; state chia theo context nhỏ hoặc Zustand; cân nhắc React Query cho data fetching (thay chữ ký `JSON.stringify` mảng 630KB).
2. **CSS đại tu**:
   - Xoá 3.462 dòng chết trong `index.css` (416/656 lớp mồ côi — đã đo, xoá thẳng được).
   - Tách CSS theo route: import trong component lazy → Vite tự sinh CSS chunk; entry chỉ giữ `index.css` gọn + `lotus-*`. Mục tiêu CSS đường găng 304KB → ~120KB.
   - Bổ sung **token spacing (thang 4pt) + type scale** vào `lotus-tokens.css`; quy tắc tối thiểu 12px cho chữ (hiện 66 chỗ dưới 12px); chuẩn hoá breakpoint về 4 mốc.
   - Sửa `long-mon-race.css` (29 hex cứng, không dark mode) về token; đưa vào `PHAM_VI` của check drift.
3. **Hiệu năng**: chuyển 5.2MB PNG nguồn ra khỏi `public/` (dist nhẹ 55%); `useMemo` cho `now` + `scopeControl` ở `TimelinePage.tsx:573,655` và memo `LongMonRace` (hiện model 761 dòng chạy lại mỗi render); prefetch chunk màn kế bằng `requestIdleCallback`; preload 3 webp Long Môn + chỉnh preload font (thêm 600-vietnamese, 400-latin).

## ĐỢT 5 — UX phủ đều (tuần 8–10)

1. **Dòng thời gian: thêm chế độ `Ngư đồ | Bảng`** — nâng danh sách trong `LongMonRaceGuard` (đang giấu sau error boundary, `TimelinePage.tsx:530-564`) thành view chính thức: sắp theo hạn, lọc trạng thái, bỏ `slice(0,200)`, nhớ lựa chọn localStorage. Giữ tranh làm mặc định (bản sắc sản phẩm).
2. **Phủ `StateBoundary` lên 10 màn còn thiếu** (Alerts, Timeline, Workload, Reports, PhanQuyen, ActiveRules, ServerChecks, Catalog, SourceCatalog, QRM).
3. **Thay 6 `window.confirm` + 4 `alert`** bằng `ShellConfirmDialog` sẵn có; hành động thu hồi quyền/phân công thêm bước xem-trước-ảnh-hưởng.
4. **Mobile**: dùng `MobileTaskList` (hoặc pattern thẻ) cho các bảng ưu tiên người xưởng xem (Cảnh báo, Tiến độ, Phân công); thêm Playwright project viewport 390px cho visual + a11y.
5. **A11y**: mở rộng quét từ 6 → 14 màn + mở modal chính (`ProgressEditModal`); thêm `aria-invalid`/`aria-describedby` cho form nhập tiến độ; focus-visible cho nhóm inline-style.

## ĐỢT 6 — Chức năng GMP mở rộng (tuần 10+, thiết kế trước khi làm)

Theo thứ tự giá trị: (1) đính kèm hồ sơ qua Supabase Storage (bằng chứng thẩm định vào hệ thống); (2) luồng phê duyệt QA điện tử (cột `qa_approved_by/at` đã có sẵn, chưa có UI); (3) ghi audit `EXPORT` mỗi lần xuất Excel/CSV/HTML + snapshot báo cáo bất biến (`vmp_report_snapshots` đang rỗng); (4) nhắc việc tự động trong app (bảng `vmp_notifications` đang chết); (5) người phụ trách xem được lịch sử hạng mục của mình; (6) lịch tái thẩm định tự sinh từ `freq`.

## Nguyên tắc xuyên suốt

- Mỗi đợt một nhánh, PR riêng, gate CI xanh mới merge; migration nào cũng qua staging (từ Đợt 2) trước production.
- Không đụng dữ liệu đã ban hành mà không cảnh báo; mọi thay đổi hành vi RPC ghi vào runbook.
- Trạng thái tiến độ cập nhật vào chính file này (đánh dấu ✅ theo đợt).
