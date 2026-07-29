# Tài liệu bàn giao hệ thống VMP Monitor

_Cập nhật: 2026-07-23. Dành cho người tiếp nhận nghiên cứu/vận hành tiếp._

## 0. Bàn giao gọn — 3 bước

1. **Quyền:** người bàn giao mời người nhận vào 4 chỗ: GitHub repo này, Supabase project `ivembmikfhtyzhtqebgh`, n8n `n8n.cpc1hn.com`, Google Sheet `6.Timeline VMP` (Editor + xem Apps Script).
2. **Bí mật:** chuyển đúng **1 gói** qua kênh an toàn (password manager / tin nhắn tự hủy): nội dung `.env` + `.env.local` (mẫu: `.env.example`, `.env.local.example`) và token webhook `x-vmp-sync-token` mới (đặt trong n8n Header Auth + Script Properties của Apps Script, khóa `VMP_SYNC_TOKEN`).
3. **Người nhận tự nghiệm thu:** clone repo → điền 2 file env → chạy `bash scripts/handover-check.sh` (kiểm tra npm, env, kết nối Supabase, tải CSV Sheet, n8n sống — in ✅/❌ kèm cách sửa) → `npm install && npm run dev`. 5/5 ✅ là bàn giao xong phần kỹ thuật; còn lại đọc tài liệu này.

Chi tiết từng phần ở các mục dưới.

## 1. Kiến trúc tổng thể

```
Google Sheet "6.Timeline VMP"
        │  (Apps Script gọi webhook instant + Schedule 5 phút fallback)
        ▼
n8n WF-04 (n8n.cpc1hn.com) — tải CSV thô → parse → rpc_apply_sheet_sync
        ▼
Supabase (project ivembmikfhtyzhtqebgh) — read model, RPC dashboard
        ▼
Frontend React/Vite (repo này) — ưu tiên đọc Supabase, fallback webhook n8n
```

Chi tiết kiến trúc: `docs/architecture-2026-07.md`, hợp đồng dữ liệu: `docs/data-contract.md`.

## 2. Các thành phần và vị trí trong repo

| Thành phần | Vị trí / định danh |
|---|---|
| Frontend React + Vite | `src/` (chạy: `npm install && npm run dev`) |
| Workflow n8n WF-04 (export đầy đủ) | `n8n/wf-04-canonical-sync/workflow.full.json` (id n8n: `LArr1nhj3jzFjJLs`) |
| Code node chính của WF-04 (bản rời để đọc) | `n8n/wf-04-canonical-sync/parse-sheet-csv.js`, `apply-canonical-snapshot.sql` |
| Apps Script gắn với Sheet | `n8n/apps-script/vmp-sheet-sync.gs` |
| Migration Supabase (forward-only, nguồn chân lý) | `supabase/migrations/*.sql` |
| **Bộ SQL dựng DB từ đầu** (schema + RLS/grant + seed cấu hình) | `supabase/bootstrap/` — cách dùng ở mục 2b ngay dưới |
| Google Sheet nguồn | id `1MPG6YbR6m-YrENqb8u7uS3O8RUYk7GCYuzQRbShtqP8`, tab `6.Timeline VMP` (gid 1252715724) |

### 2b. Dựng lại database từ đầu (`supabase/bootstrap/`)

Dựng toàn bộ DB VMP trên project Supabase mới (hoặc Postgres 17+ bất kỳ), không cần chạy lần lượt migration lịch sử:

```bash
# 1. Schema: 19 bảng, 46 hàm (đủ bộ rpc_*), view, index, trigger, RLS policy + GRANT
psql "$SUPABASE_DB_URL" --single-transaction -f supabase/bootstrap/01_schema_full.sql
# 2. Dữ liệu cấu hình: departments (5), vmp_deadline_rules (4), system_config (12)
psql "$SUPABASE_DB_URL" --single-transaction -f supabase/bootstrap/02_seed_config.sql
```

- **Dữ liệu nghiệp vụ KHÔNG cần restore** — publish WF-04 (hoặc POST `/webhook/vmp-sheet-changed`) để sync từ Sheet, vì Sheet là nguồn chuẩn.
- Chạy ngoài Supabase (Neon/Postgres thường): tạo trước 3 role `anon`, `authenticated`, `service_role`; bảng `profiles` tham chiếu `auth.users` nên tài khoản phải tạo qua Supabase Auth (không seed được).
- Dump từ DB thật ngày 2026-07-23 (`pg_dump --schema-only --no-owner`). Migrations vẫn là nguồn chân lý khi sửa schema tiếp; migration mới hơn 2026-07-23 áp bình thường sau khi bootstrap.

## 3. WF-04 — hệ nào dùng, hệ nào không

WF-04 gộp 5 nhánh trong 1 workflow. Node bị `disabled` là **tắt có chủ đích**, khi import lại đừng bật:

**Đang dùng (khi workflow được publish):**
1. **Sync Sheet → Supabase đường CSV**: webhook `/webhook/vmp-sheet-changed` (Apps Script gọi) + Schedule 5 phút → Download CSV → Parse CSV → `rpc_apply_sheet_sync`. Toàn bộ logic upsert nằm trong SQL.
2. **Email cảnh báo đến hạn**: Schedule 7h sáng + `/webhook/vmp-alert-now` → `rpc_due_alerts` → Claude AI soạn → Gmail.
3. **Error Trigger**: ghi `workflow_runs` + email admin khi lỗi.

**Không dùng (legacy, node disabled):**
4. Đường sync cũ dùng node Google Sheets + Diff Engine (Router → INSERT/UPDATE/MARK MISSING/CONFLICT) — đã thay bằng đường CSV.
5. Chiều ghi ngược App → Sheet (`/webhook/vmp-write` + outbox drain 1 phút) — node ghi Sheet bị tắt; dữ liệu hiện chảy **một chiều** Sheet → Supabase.

## 4. Trạng thái hệ thống (kiểm chứng 2026-07-29)

> ⚠️ Mục này chép trạng thái nên **mục rữa theo thời gian**. Đừng tin số ở đây —
> chạy `bash scripts/handover-check.sh` để lấy trạng thái thật trong ~1 phút.

- **WF-04 `active: true`**, Schedule 5 phút đang chạy.
- Lần sync thành công cuối: **2026-07-29 00:54 UTC** — 464 dòng nguồn → 461 ID duy nhất, 217 đối tượng, 3 ID trùng.
- `vmp_plan_items`: 461; `vmp_objects`: 217; `vmp_sheet_sync_runs`: 204 lần chạy.
- Các workflow BMS/EM/HEPA khác trên cùng n8n **không thuộc** hệ VMP này.

**Khôi phục vận hành:** vào n8n publish WF-04 → sync 5 phút tự bắt kịp, hoặc POST `/webhook/vmp-sheet-changed` với header `x-vmp-sync-token` để sync ngay.

### 4b. Sự cố 2026-07-08 → 2026-07-29: sync đứng 21 ngày trong im lặng

Đáng đọc vì nó chỉ ra một điểm mù còn nguyên trong thiết kế cảnh báo.

**Diễn biến.** Tab `6.Timeline VMP` bị dán trùng nội dung 21 lượt → 9.724 dòng nhưng chỉ 461 ID duy nhất. Guard `VMP_SYNC_ROW_GUARD` chặn snapshot, đúng như thiết kế, nên **Supabase không bị ghi đè** — hàng rào an toàn đã làm tròn việc. Sau khi Sheet được dọn về 464 dòng, sync tự bắt kịp ngay ở lần chạy kế tiếp, không cần can thiệp tay.

**Điểm mù.** Suốt 21 ngày đó, Error Trigger vẫn nổ **mỗi 5 phút** và vẫn gửi mail đều đặn. Nhưng vì mọi mail giống hệt nhau nên không ai đọc, và dashboard vẫn hiển thị bình thường — **không có dấu hiệu nào cho người dùng biết dữ liệu đã cũ 21 ngày**.

**Bài học.** Cảnh báo khi *có lỗi* là chưa đủ; phải cảnh báo khi *thiếu thành công*. Mục 3b của `scripts/handover-check.sh` nay làm việc này (dead-man's switch, ngưỡng mặc định 30 phút, chỉnh bằng `VMP_SYNC_MAX_LAG_MIN`). Câu truy vấn cốt lõi:

```sql
select now() - max(created_at) as do_tre
from public.vmp_sheet_sync_runs where status = 'completed';
```

Nên gắn thêm vào dashboard một banner "dữ liệu cập nhật lúc …" để độ trễ luôn hiển thị trước mắt người dùng — hiện **chưa có**.

**Việc còn để ngỏ:** ngưỡng guard `450..5000` giữ nguyên (đúng); migration `20260729020000_row_guard_diagnostic_message.sql` chỉ làm thông báo lỗi tự chẩn đoán hơn — xem mục 8.

## 5. Quyền truy cập cần bàn giao kèm

| Tài nguyên | Ghi chú |
|---|---|
| GitHub repo | `tienhoandhd-droid/naniVMP` |
| n8n instance | `https://n8n.cpc1hn.com` (kèm credential Gmail, Postgres, Anthropic trong n8n — **không** nằm trong export JSON) |
| Supabase project VMP | `ivembmikfhtyzhtqebgh` — kết nối bằng `SUPABASE_DB_URL` trong `.env.local` (gitignored, phải chuyển riêng qua kênh an toàn) |
| Google Sheet + Apps Script | Sheet id ở mục 2; Apps Script gắn trong Sheet (Extensions → Apps Script) |
| Frontend env | Xem `src/lib/config.js` / `src/lib/supabaseClient.js`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON`, `VITE_VMP_READ_URL`, `VITE_VMP_WRITE_URL` |

## 6. Ràng buộc kỹ thuật quan trọng (dễ vấp)

1. **Luật tách bộ phận có 2 bản phải đồng bộ**: `parseDepts()` trong `src/utils/helpers.js` (JS) và `public.vmp_parse_depts(text)` (SQL trong migration). Sửa một nơi phải sửa nơi kia. Mã bộ phận Xưởng sản xuất là `xsx` (không phải `sx`).
2. **Sheet rộng hơn 37 cột canonical** — 2 chiều bộ phận khác nhau: `bo_phan_goc` (cột 5 trong 37, → `depts`) và `bo_phan_thuc_hien_goc` (cột phụ ngoài 37, lưu `source_sheet_data`, → `exec_depts`). `values_json` luôn đúng 37 phần tử (có guard).
3. **Supabase là read model**: chỉ n8n/Postgres service được ghi snapshot (migration `enforce_sheet_canonical_read_only`). Đổi schema chỉ qua migration mới trong `supabase/migrations/`, áp bằng `psql --single-transaction -f`.
4. **Parse CSV thô, không dùng node Google Sheets** trong n8n cho đường sync — node Sheets làm sai kiểu dữ liệu ngày/số.

## 7. ⚠️ Bảo mật — việc cần làm ngay khi tiếp nhận

- Token webhook `x-vmp-sync-token` cũ (`tienhoan2025`) **đã lộ trong lịch sử git** — dù code hiện tại đã đọc token từ Script Properties (khóa `VMP_SYNC_TOKEN`), vẫn **bắt buộc đặt token MỚI** khi tiếp nhận: đổi trong n8n (Header Auth của WF-04) + đặt Script Property trong Apps Script. Không ghi token vào code nữa.
- `.env.local` chứa chuỗi kết nối role postgres (bypass RLS) — tuyệt đối không commit, chuyển giao qua kênh riêng.
- Anon key Supabase xuất hiện trong workflow JSON là key công khai (by design), không phải rò rỉ.
- ⚠️ **Repo `tienhoandhd-droid/naniVMP` đang ở chế độ PUBLIC.** Cân nhắc chuyển sang private, hoặc ít nhất đừng ghi chuỗi token thật vào tài liệu — viết "token cũ đã lộ, tra bằng `git log --all -S`" là đủ.

## 8. Migration chờ áp (chưa chạy trên production)

| File | Nội dung | Trạng thái |
|---|---|---|
| `supabase/migrations/20260729020000_row_guard_diagnostic_message.sql` | `VMP_SYNC_ROW_GUARD` in thêm số ID duy nhất + tỉ lệ lặp + hướng xử lý | ✅ Đã kiểm thử trong transaction rollback; ❌ **chưa áp** |

Thông báo cũ → mới:

```
cũ:  VMP_SYNC_ROW_GUARD: source row count 9724 is outside 450..5000
mới: VMP_SYNC_ROW_GUARD: 9724 dong / 461 ID duy nhat (ti le lap 21.1x)
     - ngoai khoang 450..5000. Sheet bi dan trung: DON SHEET, KHONG noi nguong guard.
```

Chỉ đổi phần thông báo lỗi — ngưỡng và logic giữ nguyên; phần chẩn đoán chỉ chạy khi sắp raise nên đường chạy bình thường không tốn thêm. Áp bằng:

```bash
psql "$SUPABASE_DB_URL" --single-transaction -f supabase/migrations/20260729020000_row_guard_diagnostic_message.sql
```

## 9. Danh mục nguồn trên Supabase (2026-07-29)

Trước đây chỉ tab `6.Timeline VMP` có mặt trên Supabase. Nay 5 tab danh mục nguồn + tab sản phẩm GMP đã được đưa lên, phục vụ việc chuyển Supabase thành nơi lưu dữ liệu gốc.

| Bảng | Số dòng | Nội dung |
|---|---|---|
| `vmp_source_objects` | 264 | Đối tượng thẩm định gộp từ 5 tab, đã khử trùng (dòng xuất hiện sau thắng — cùng quy tắc timeline dùng) |
| `vmp_source_rows` | 310 | Bản thô mọi dòng mọi tab, giữ cả dòng thiếu mã để đối chiếu |
| `vmp_products_gmp` | 31 | Danh mục sản phẩm/cỡ lô từ tab `DM TDQTSX show GMP` |

Migration: `supabase/migrations/20260729030000_source_catalogs.sql` (đã áp).
Nạp dữ liệu: `python3 scripts/import-source-catalogs.py` — chạy lại được, thay toàn bộ trong một transaction; `--dry-run` chỉ sinh SQL.

**Nghiệm thu:** 217 đối tượng có `validate_flag='y'` — **khớp chính xác** 217 dòng của `vmp_objects` sinh từ timeline. Chuỗi Sheet → luật → timeline → Supabase nhất quán đầu-cuối.

### 9b. Luật sinh timeline — nguồn chân lý

**Tab `0.Rule timeline VMP` KHÔNG phải luật chuẩn.** Luật chuẩn là node `Code in JavaScript1` của workflow n8n `VMP01-Tạo timeline VMP` (id `Dr5zFBSIjAvVFTCq`). Đã kiểm chứng 2026-07-29 bằng cách dựng lại thuật toán và so với dữ liệu thật: **439/439 ID khớp, 0 thiếu**. 22 dòng chênh là `DQ`/`FAT-SAT`/`IQ` — loại một-lần mà cơ chế `daTungIQ()` cố ý không sinh lại; đúng thiết kế.

**Dữ liệu nguồn còn thiếu (5 đối tượng, gây chuỗi `"Không xác định do thiếu…"` trong cột ngày của timeline):**

| Loại | Mã | Tên | Thiếu |
|---|---|---|---|
| Quy trình | `TDSX-X5-R011` | Ketofen-Drop | Tháng thẩm định đầu tiên |
| Quy trình | `TDSX-X5-024` | Cafein | Tháng thẩm định đầu tiên |
| Quy trình | `TDSX-X5-R007` | Moxieye | Tháng thẩm định đầu tiên |
| Quy trình | `TDSX-X5-123` | Sugam | Tháng thẩm định đầu tiên |
| Vận chuyển | `S1` | Thẩm định phương tiện vận chuyển: xe ô tô | Tháng thẩm định đầu tiên |

Điền cột này trong Sheet nguồn là 5 dòng đó tự tính được đầy đủ mốc thời gian.
