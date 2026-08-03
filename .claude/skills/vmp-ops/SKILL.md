---
name: vmp-ops
description: Chẩn đoán và vận hành hệ VMP (Supabase là dữ liệu gốc → dashboard React; n8n lo AI/cảnh báo). Dùng khi được hỏi về dữ liệu cũ/không tải được, guard chặn snapshot, trạng thái hệ VMP, hoặc trước khi sửa schema/workflow của dự án này.
---

# Vận hành hệ VMP

## Luật bất di bất dịch

1. **SUPABASE LÀ DỮ LIỆU GỐC.** Chuyển đổi đã XONG, không còn "đang chuyển":
   người dùng đã đẩy dữ liệu lên Supabase và xác nhận ngày 2026-08-03. Nhập liệu
   và sửa đổi diễn ra trên dashboard, đi qua RPC có kiểm quyền phía server.
   Nhánh sync 5 phút Sheet → Supabase của WF-04 đã **tắt có chủ đích**.
2. **KHÔNG BAO GIỜ ghi vào Google Sheet**, và cũng đừng kéo dữ liệu từ nó về nữa.
   Sheet `6.Timeline VMP` nay là **bản tham chiếu/lưu trữ cũ**: vẫn là công sức
   nhập tay của người dùng nên không được đụng vào, nhưng nó **không còn là chân lý** —
   Sheet lệch với Supabase thì Supabase đúng. Chỉ được `curl` tải CSV/XLSX về đọc.
   ⚠️ Tài liệu và comment cũ trong repo có thể vẫn mô tả chiều Sheet → Supabase.
   Đó là kiến trúc CŨ. Gặp thì sửa, đừng tin theo.
3. **Đổi schema chỉ qua migration mới** trong `supabase/migrations/`, áp bằng
   `psql --single-transaction -f`. Không sửa trực tiếp trên DB.
4. **Hỏi trước khi áp migration lên production** hoặc sửa/publish workflow trên n8n.
   Sửa file trong repo thì không cần hỏi.

## Chẩn đoán nhanh — chạy trước khi phỏng đoán

```bash
bash scripts/handover-check.sh
```

7 mục, ~1 phút, chỉ đọc. Bao gồm dead-man's switch (độ trễ sync) và kiểm tra tỉ lệ
dòng/ID duy nhất của Sheet. Đa số sự cố lộ ra ngay ở đây.

## Cây quyết định khi "web không tải được dữ liệu"

**Đừng đi tìm sync trước.** Supabase là dữ liệu gốc, không còn đường sync nào phải
chạy — `vmp_sheet_sync_runs` đứng yên nhiều ngày là **bình thường**, không phải sự cố.
Tiền lệ 2026-08-03: bảng sync đứng 3 ngày trông rất giống nguyên nhân, nhưng lỗi thật
nằm ở phiên đăng nhập.

```
1. DB còn dữ liệu không?  bash scripts/handover-check.sh
   → 7/7 đạt → dữ liệu lành, lỗi nằm ở frontend/phiên. Đi bước 2.
   → hỏng → xem mục guard bên dưới.

2. Mở web bằng tài khoản thật rồi nhìn cho kỹ (tests/e2e/_repro có sẵn mẫu):
   → Rơi về màn đăng nhập  → đúng, chỉ cần đăng nhập lại.
   → Dựng đủ dashboard mà "0/0 hạng mục" + "Đang chờ đồng bộ…" + console SẠCH
     → phiên chết mà hồ sơ localStorage còn. Đã sửa 2026-08-03, có phép kiểm
       tests/e2e/phien-het-han.mjs canh. Tái phát thì xem lại useAuth.

3. Console có 401 / 42501 "permission denied for function rpc_*"?
   → chưa đăng nhập, hoặc vai `anon` bị siết đúng như thiết kế (migration
     20260801090000). Kiểm nhanh ngoài app:
     curl -X POST "$VITE_SUPABASE_URL/rest/v1/rpc/rpc_get_vmp_dashboard" \
       -H "apikey: $VITE_SUPABASE_ANON" -H "Authorization: Bearer $VITE_SUPABASE_ANON" \
       -H "Content-Type: application/json" -d '{"p_year":2026}'
     401 ở đây là ĐÚNG, không phải lỗi.

4. Email có trong danh sách cho phép không?
   psql "$SUPABASE_DB_URL" -c "select email,is_active from public.vmp_email_cho_phep;"
   Và có hồ sơ trong public.profiles chưa? (thiếu hồ sơ → tụt về vai viewer im lặng)

5. Banner "Dữ liệu cũ ~Nh" KHÔNG phải lỗi tải. Nó là watermark = max(updated_at)
   của vmp_plan_items, tức "lần cuối có người sửa dữ liệu". Không ai sửa mấy hôm
   thì nó kêu, dù mọi thứ khoẻ mạnh.
```

## Guard chặn snapshot — chẩn đoán đúng nguyên nhân

Guard `450..5000` dòng là **cố ý**, và nó đã từng cứu hệ thống. **Đừng nới ngưỡng như phản xạ.**

Cách phân biệt hai tình huống:

```bash
curl -sL "https://docs.google.com/spreadsheets/d/1MPG6YbR6m-YrENqb8u7uS3O8RUYk7GCYuzQRbShtqP8/export?format=csv&gid=1252715724" -o /tmp/s.csv
python3 -c "
import csv,unicodedata
r=list(csv.reader(open('/tmp/s.csv',encoding='utf-8')))
h=[unicodedata.normalize('NFC',x.strip().lower()) for x in r[0]]; i=h.index('id thẩm định')
ids=[x[i].strip() for x in r[1:] if i<len(x) and x[i].strip()]
print(f'{len(r)-1} dòng / {len(set(ids))} ID duy nhất → lặp {(len(r)-1)/len(set(ids)):.1f}x')"
```

- **Tỉ lệ lặp ≈ 1.0x** và số dòng thật sự tăng → dữ liệu phình thật, có thể bàn tới việc nới ngưỡng.
- **Tỉ lệ lặp > 1.1x** → Sheet bị dán trùng. **Việc đúng là dọn Sheet, không phải nới guard.**
  Báo cho người dùng, đừng tự sửa Sheet.

Tiền lệ: 2026-07-08→29 Sheet bị dán trùng 21 lần (9.724 dòng / 461 ID). Guard chặn đúng,
Supabase không hỏng. Sau khi Sheet được dọn, sync tự bắt kịp — không cần can thiệp tay.

## Luật sinh timeline — nguồn chân lý là CODE, không phải tài liệu

Tab **`0.Rule timeline VMP` KHÔNG phải luật chuẩn** (người dùng xác nhận). Luật chuẩn là
node `Code in JavaScript1` của workflow n8n **`VMP01-Tạo timeline VMP`** (id `Dr5zFBSIjAvVFTCq`).
Đối chiếu với tab Rule sẽ ra khác biệt giả — đừng báo đó là lỗi.

Tóm tắt luật (đã kiểm chứng khớp 100% với dữ liệu thật 2026-07-29):

```
Lọc:        chỉ dòng có Thẩm định = 'y' (so sánh sau trim/lower/NFC)
Loại sinh:  Thiết bị & Hệ thống phụ trợ → lần đầu (Năm nhập = năm thẩm định VÀ chưa từng
                                           có IQ) : DQ, FAT/SAT, IQ, OQ, PQ
                                         về sau  : OQ, PQ
            Quy trình → PV | Kho → GSP | Vận chuyển → GDP
ID:         {mã}/{năm}.{lần 2 chữ số}-{loại},  số lần = max(1, floor(12 / tần suất))
Mốc thời gian, tính LÙI từ T:
   T              = ngày cuối tháng của (tháng đầu tiên + (lần-1) × tần suất)
   báo cáo        = T − 5
   kết thúc TĐ    = báo cáo − (IQ/OQ ? 2 : theo Phân loại báo cáo)
                    không phụ thuộc 2 | hóa lý 2 | nhiễm khuẩn 7 | vô khuẩn 16
   bắt đầu TĐ     = kết thúc TĐ − Số ngày công thẩm định thực tế
   đề cương       = bắt đầu TĐ − 60
```

**Idempotent theo thiết kế:** `daTungIQ()` khiến các loại một-lần (DQ, FAT/SAT, IQ) không
bị sinh lại sau lần đầu. Nếu mô phỏng luật ra ít ID hơn Sheet đúng ở 3 loại này thì là
**đúng**, không phải thiếu.

**Bẫy dữ liệu:** thiếu `Tháng thẩm định đầu tiên trong năm` / `Phân loại báo cáo` /
`Số ngày công` → workflow ghi **chuỗi tiếng Việt** `"Không xác định do thiếu…"` vào cột
ngày. Vì vậy cột ngày trong timeline **không phải lúc nào cũng là ngày** — luôn phòng thủ
khi parse. (Đây là lý do có các migration `dashboard_raw_status_text`.)

## Danh mục nguồn trên Supabase

5 tab danh mục + tab sản phẩm GMP đã được đưa lên Supabase (2026-07-29):

| Bảng | Nội dung |
|---|---|
| `vmp_source_objects` | 264 đối tượng gộp từ 5 tab, đã khử trùng (dòng sau thắng). 217 có `validate_flag='y'` — khớp đúng `vmp_objects` |
| `vmp_source_rows` | 310 dòng thô mọi tab, giữ cả dòng thiếu mã. RLS bật, **không** mở cho browser |
| `vmp_products_gmp` | 31 sản phẩm từ tab `DM TDQTSX show GMP` (dữ liệu nền, không sinh timeline) |

Nạp lại: `python3 scripts/import-source-catalogs.py` (thay toàn bộ trong 1 transaction;
`--dry-run` để chỉ xem SQL). Ánh xạ cột trong script bám đúng VMP01 — sửa VMP01 thì sửa cả đây.

## Bẫy đã biết

- **`parseDepts()` có hai bản phải khớp nhau:** `src/utils/helpers.js` (JS) và
  `public.vmp_parse_depts(text)` (SQL). Sửa một bên phải sửa bên kia. Mã Xưởng sản xuất
  là **`xsx`**, không phải `sx`.
- **Sheet rộng hơn 37 cột canonical.** Hai chiều bộ phận khác nhau: `bo_phan_goc` (cột 5
  trong 37 → `depts`) và `bo_phan_thuc_hien_goc` (cột phụ ngoài 37, lưu trong
  `source_sheet_data` → `exec_depts`). `values_json` luôn đúng 37 phần tử.
- **Không dùng node Google Sheets cho đường sync** — nó làm sai kiểu dữ liệu ngày/số.
  Phải tải CSV thô rồi tự parse.
- **Project Supabase VMP `ivembmikfhtyzhtqebgh` KHÔNG có trong tài khoản Supabase MCP.**
  Truy vấn bằng `psql "$SUPABASE_DB_URL"` (đọc từ `.env.local`), không phải MCP tool.

## Retry: chỉ cho lỗi tạm thời

`1. Download Canonical Sheet CSV` có `retryOnFail: true` — đúng, vì HTTP hay lỗi tạm thời.
`3. Apply Canonical Snapshot` để `retryOnFail: false` — cũng đúng, vì guard là lỗi **tất định**;
retry chỉ nhân bản thất bại và mail nhiễu. Giữ nguyên cả hai.
