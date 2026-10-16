# Kế hoạch nâng cấp toàn diện VMP Monitor — sau rà soát 16/10/2026

> Nguồn: rà soát người dùng trên bản publish `e9d1c7f` (deploy 08/10), đọc
> production chỉ-đọc, thử migration trên bản sao production, chạy lại toàn bộ
> CI trên máy. Nhánh làm việc: `fix/audit-2026-10-16`.
> Quy ước: **[CHỦ DỰ ÁN]** = việc cần anh/chị quyết hoặc tự làm (quyền
> production, chi phí, quyết định thiết kế); còn lại Claude làm được.

## Hiện trạng sau đợt sửa 16/10 (đã xong trên nhánh, CHƯA deploy)

| # | Việc | Bằng chứng |
|---|---|---|
| 1 | Điện thoại/tablet: câu dẫn "Việc hôm nay" co còn 0px; bảng việc vỡ ở 820px | luong-gia-lap 3q (28 màn × 2 cỡ) |
| 2 | Gói in PDF tách khỏi `cloud.js`: 1,6 MB → 225 KB (gzip 615 → 59 KB) | build + kiểm tải theo yêu cầu |
| 3 | 3 lỗ hổng thư viện high → 0; CI chặn lỗ hổng runtime high+ | `npm audit` |
| 4 | Chữ 8–11px ở Tổng quan → 12px | đo 14 màn × 2 cỡ |
| 5 | Đăng nhập: thương hiệu bị cắt, ô email hai viền, focus lạc khi sai mật khẩu | luong-gia-lap 1b |
| 6 | Bỏ thuật ngữ "Supabase" khỏi câu người dùng; nhãn cho 4 ô nhập | — |
| 7 | Migration sửa policy tái thẩm định + đóng 13 policy mở | bản sao production, 4 vai |
| 8 | Bộ kiểm "bom hẹn giờ" `timeline-deadline-edit` — CI sẽ chặn deploy kế tiếp | gốc hỏng / bản vá 39 đạt |
| 9 | `npm run drift:db` — phát hiện production lệch repo | chạy thật: 6 migration tồn đọng |

---

## Giai đoạn 0 — Đưa đợt sửa lên production (ưu tiên cao nhất)

**0.1 [CHỦ DỰ ÁN] Duyệt và merge nhánh** → CI tự deploy GitHub Pages.
Kiểm sau deploy: mở web trên điện thoại thật, màn Việc hôm nay.

**0.2 [CHỦ DỰ ÁN] Áp 8 migration** theo `docs/runbooks/2026-10-16-ap-migration-ton-dong.md`.
Hệ quả mở khoá ngay: tab Tái thẩm định, nhập Excel có xem trước, báo lỗi
phía người dùng, đóng 6 bảng PII + 13 policy mở, sửa lệch ngày 0h–7h.
Sau khi áp: `npm run drift:db` phải ra mã thoát 0.

**0.3 Đồng bộ máy làm việc**: `main` cục bộ chậm 877 commit so với GitHub —
pull trước khi làm gì tiếp trên máy này (tránh sửa trên code cũ như rà soát
ngày 12/08 từng dính).

## Giai đoạn 1 — Không để production "lệch âm thầm" lần nữa (1–2 ngày)

Bài học lớn nhất đợt này: 6 migration nằm chờ 6 tuần, web gọi tới mà không ai biết.

1.1 Chạy `drift:db` **định kỳ**. GitHub hiện cố ý không giữ credential DB
production, nên đề xuất chạy từ n8n (đã có kết nối Postgres) mỗi sáng, báo
lỗi qua kênh cảnh báo sẵn có; hoặc cron trên máy chủ nội bộ. **[CHỦ DỰ ÁN]** chọn nơi chạy.
1.2 Sau khi 0.2 xong: đọc bảng `vmp_client_errors` hàng tuần (thẻ ở Cấu hình hệ thống) — đây là lần đầu có dữ liệu lỗi thật từ người dùng.
1.3 Quy trình: migration nào merge kèm runbook phải có dòng "ĐÃ ÁP ngày…/người áp" trong runbook; PR template nhắc việc này.

## Giai đoạn 2 — Bảo mật & phân quyền (1–2 tuần, nhiều việc cần chủ dự án)

2.1 **Bật `item_permissions_mode = enforced`** — hiện `preview`, nên lọc theo phạm vi hạng mục chưa có hiệu lực ở vài RPC tổng hợp (thử trên bản sao: tổng Tổng quan của nhân viên xưởng = của admin). Chặn bởi 461 hạng mục chưa có canonical scope (thiết kế 24/08). Việc: báo cáo hạng mục thiếu scope → **[CHỦ DỰ ÁN]** QA gán bộ phận/xưởng → thử enforce trên bản sao production → bật.
2.2 Rà 15 policy `true` còn lại (bảng cấu hình: phòng ban, quy tắc hạn, cấu hình Vali, `vmp_kb_*`, `vmp_objects`, `vmp_danh_gia_anh_huong`…) — xác nhận từng bảng "ai đọc cũng được" là đúng ý.
2.3 **[CHỦ DỰ ÁN]** Checklist 31/08 còn mở: đổi mật khẩu Postgres production, giới hạn IP; bật CAPTCHA cho Auth; kiểm n8n xác thực JWT; giới hạn tần suất webhook chat (token n8n nằm công khai trong bundle — có chủ ý, nhưng cần rate limit).
2.4 Bắt buộc MFA cho vai admin (hiện là opt-in, migration 29/09).
2.5 Một tài khoản (profiles) không có vai nghiệp vụ — rà và vô hiệu hoá hoặc gán vai.

## Giai đoạn 3 — Tuân thủ GMP cho hệ thống máy tính (Annex 11 / Part 11 tinh gọn)

VMP Monitor theo dõi kế hoạch thẩm định gốc — dữ liệu này vào hồ sơ GMP, nên
nên có bộ hồ sơ thẩm định hệ thống máy tính (CSV) tối thiểu:

3.1 **Đánh giá rủi ro & URS rút gọn**: liệt kê chức năng ghi dữ liệu GMP (đã có `docs/testing/2026-10-08-data-write-inventory.md` — dùng làm khung).
3.2 **Bằng chứng kiểm thử tự động làm OQ**: CI đã chạy ~1.000 unit + ~25 bộ E2E mỗi lần deploy; sinh báo cáo kết quả có mã commit/ngày, lưu làm hồ sơ (job `upload-artifact` khi thành công, không chỉ khi lỗi).
3.3 **Audit trail**: xác nhận mọi thay đổi ngày/trạng thái có ai/khi nào/giá trị cũ-mới/lý do (đã có cho deadline kế hoạch) — kiểm đủ cho các luồng ghi còn lại; đợt này đã đóng lỗ `vmp_progress_events` cho INSERT tự do.
3.4 **Sao lưu & khôi phục**: **[CHỦ DỰ ÁN]** kiểm PITR Supabase; diễn tập khôi phục lên bản sao (quy trình bản sao production đã chạy được ngày 16/10).
3.5 **Rà soát định kỳ quyền truy cập** (periodic review): báo cáo quý từ `profiles` + vai.

## Giai đoạn 4 — Chất lượng bộ kiểm (2–3 ngày)

4.1 **Quét "bom hẹn giờ"**: `gia-lap-supabase.mjs` dùng ngày cố định (deadline 2026-09…); mọi bộ kiểm phụ thuộc cửa sổ "quanh Hôm nay" sẽ hỏng dần. Chuyển fixture sang ngày tương đối, hoặc đóng băng đồng hồ mặc định trong `caiGiaLap`.
4.2 Lỗi chập chờn `catalog-workspace` (qa_manager) khi máy tải nặng — tăng ổn định chờ thay vì tăng timeout.
4.3 `scripts/check-qualification-bundle.mjs` hỏng sẵn từ trước (không nằm trong CI) — sửa hoặc xoá.
4.4 Axe hiện chỉ chặn critical/serious → nâng dần lên moderate.
4.5 Mở rộng phép đo "chữ bị ép" (3q) và "chữ <12px" thành gate cho mọi màn, gồm chế độ tối.
4.6 **[CHỦ DỰ ÁN]** Project Supabase staging tách khỏi production — mở khoá bộ E2E đăng nhập thật (`npm run e2e`) và Đợt B Lotus Pearl.

## Giai đoạn 5 — Trải nghiệm & hiệu năng

5.1 **[CHỦ DỰ ÁN]** Long Môn (Timeline): nhãn ngày/tuần 9–10px — khó đọc; trước đây được khoanh ngoài phạm vi. Quyết: nâng lên 12px (cần chỉnh bố cục tranh) hay giữ.
5.2 Vòng năm ở Tổng quan trên điện thoại: chữ giữa vòng sát mép — thu nhỏ số % ở màn hẹp.
5.3 Kiểm thật trên thiết bị xưởng (máy tính bảng): mở phân hệ Thẩm định thực tế sau khi deploy đợt PDF.
5.4 **[CHỦ DỰ ÁN]** Ảnh `long-mon-vmp-racecourse-v15.webp` (221 KB) không còn được dùng, giữ làm tham chiếu — xoá khỏi `public/` (chuyển sang `docs/`) nếu đồng ý.
5.5 `exceljs` 940 KB (chỉ tải khi bấm Excel) — giữ; xem lại khi có bản nhẹ hơn.

## Giai đoạn 6 — Nợ kỹ thuật

6.1 `npm run gen:types` — 64 chỗ `as never` vì `database.ts` cũ (cần 0.2 xong trước).
6.2 Tách file >1.000 dòng: `index.css` (2.976), `supabaseData.ts`, `Primitives.tsx`, `AuthenticatedApp.tsx`.
6.3 `index.css` đưa vào phạm vi `npm run drift` (đợt này nó bỏ sót chữ 8–11px).
6.4 Dọn ~18 worktree cũ trong `.worktrees/` sau khi xác nhận đã merge.

## Thứ tự đề xuất

0 → 1 → 4.1 → 2 → 3 → 5 → 6. Giai đoạn 0 và 1 chặn rủi ro đang có; 4.1 ngăn
CI tự hỏng theo lịch; 2 và 3 cần thời gian của chủ dự án và QA.
