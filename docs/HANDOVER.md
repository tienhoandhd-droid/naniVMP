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
| **Bộ SQL dựng DB từ đầu** (schema + RLS/grant + seed cấu hình) | `supabase/bootstrap/` — xem README trong đó |
| Snapshot schema DB thực tế (đối chiếu) | `supabase/schema-snapshot-2026-07-23.sql` (46 hàm, đủ bộ `rpc_*`) |
| Google Sheet nguồn | id `1MPG6YbR6m-YrENqb8u7uS3O8RUYk7GCYuzQRbShtqP8`, tab `6.Timeline VMP` (gid 1252715724) |

## 3. WF-04 — hệ nào dùng, hệ nào không

WF-04 gộp 5 nhánh trong 1 workflow. Node bị `disabled` là **tắt có chủ đích**, khi import lại đừng bật:

**Đang dùng (khi workflow được publish):**
1. **Sync Sheet → Supabase đường CSV**: webhook `/webhook/vmp-sheet-changed` (Apps Script gọi) + Schedule 5 phút → Download CSV → Parse CSV → `rpc_apply_sheet_sync`. Toàn bộ logic upsert nằm trong SQL.
2. **Email cảnh báo đến hạn**: Schedule 7h sáng + `/webhook/vmp-alert-now` → `rpc_due_alerts` → Claude AI soạn → Gmail.
3. **Error Trigger**: ghi `workflow_runs` + email admin khi lỗi.

**Không dùng (legacy, node disabled):**
4. Đường sync cũ dùng node Google Sheets + Diff Engine (Router → INSERT/UPDATE/MARK MISSING/CONFLICT) — đã thay bằng đường CSV.
5. Chiều ghi ngược App → Sheet (`/webhook/vmp-write` + outbox drain 1 phút) — node ghi Sheet bị tắt; dữ liệu hiện chảy **một chiều** Sheet → Supabase.

## 4. Trạng thái tại thời điểm bàn giao (2026-07-23)

- **WF-04 đang `active: false` (chưa publish)** → không có sync nào chạy.
- Lần sync thành công cuối: **2026-07-08 22:21 UTC** (463 dòng). Dữ liệu Supabase đứng từ đó.
- `vmp_plan_items`: 460 dòng; `vmp_objects`: 217; `vmp_sheet_sync_runs`: 203 lần chạy.
- Các workflow BMS/EM/HEPA khác trên cùng n8n **không thuộc** hệ VMP này.

**Khôi phục vận hành:** vào n8n publish WF-04 → sync 5 phút tự bắt kịp, hoặc POST `/webhook/vmp-sheet-changed` với header `x-vmp-sync-token` để sync ngay.

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
