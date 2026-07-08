# Tối ưu "vấn đề lọc" — wf / Supabase / GitHub

Ngày lập: 2026-07-08

Mục tiêu: bộ lọc (Bộ phận, Khu vực, Thời gian) nhanh, nhất quán và có **một nguồn
chân lý duy nhất**, thay vì regex phía client lặp lại và refetch nặng mỗi lần poll.

## 1. Chẩn đoán gốc

> **Về cột:** Sheet vận hành rộng hơn 37 cột. 37 cột canonical (`values_json`) chỉ
> là tập chuẩn; có 2 chiều bộ phận: `bo_phan_goc` ("Bộ phận quản lý", cột 5 trong 37)
> và `bo_phan_thuc_hien_goc` ("Bộ phận thực hiện thẩm định", cột **phụ ngoài 37**, lưu
> ở `source_sheet_data`). Cột thực hiện mới là chỗ "1 hạng mục thuộc nhiều bộ phận".

| Vấn đề | Trước | Ảnh hưởng |
| --- | --- | --- |
| Tách bộ phận (cả 2 chiều quản lý + thực hiện) | `parseDepts()` regex ở frontend, chạy mỗi lần `enrich()`/grouping | 2 bản logic (JS) dễ lệch, không index được, không đẩy filter xuống DB |
| Chuẩn hoá khu vực | quét toàn bộ `acts` ở client dựng `areaOptions` | phụ thuộc dữ liệu thô, chưa trim chuẩn ở DB |
| Đọc dashboard | RPC trả **toàn bộ** năm kèm `_raw` | payload lớn; mọi filter làm ở client |
| Poll 20s | refetch full + `JSON.stringify` cả mảng để so chữ ký | tốn CPU/băng thông kể cả khi không đổi |

## 2. Đã triển khai trong lượt này

### wf / Supabase (migration `20260708160000_dashboard_dept_normalization_and_watermark.sql`)

- `vmp_parse_depts(text)` — **bản SQL của `parseDepts`**, nguồn chân lý ở server.
- **Hai** cột + **GIN index**, precompute **1 lần lúc sync** trong
  `rpc_sync_vmp_sheet_snapshot_with_extras` (bọc `exception` → không bao giờ làm
  rollback snapshot canonical):
  - `departments text[]` ← `bo_phan_goc` (cột 5), có fallback dept đối tượng.
  - `execution_departments text[]` ← `bo_phan_thuc_hien_goc` (cột phụ ngoài 37),
    **không** fallback (rỗng = Sheet chưa ghi) — khớp `deptGroup()`.
- `rpc_get_vmp_dashboard` trả sẵn `depts` + `exec_depts` (ưu tiên cột đã lưu →
  fallback tính tại chỗ), đồng nhất với `enrich()` / `CompletionDashboard`.
- `rpc_get_vmp_watermark(year)` — count + `max(updated_at)`, cực nhẹ.

> Tập 37 cột canonical (`values_json`), checksum và số đếm hậu kiểm **không đổi**.
> Cột `departments`/`execution_departments` là dữ liệu DẪN XUẤT thêm vào
> `vmp_plan_items`, không thuộc 37 cột. n8n Code node / apply-canonical-snapshot.sql
> **không cần sửa** vì chuẩn hoá đã dời hẳn về read-model Supabase (không redeploy
> workflow live).

### Frontend

- `enrich()` ưu tiên `a.depts` từ RPC; `parseDepts` chỉ còn là fallback (đường n8n).
- `CompletionDashboard.deptGroup()` nhận mảng precomputed: `department` dùng
  `activity.depts`, `executionDepartment` dùng `activity.exec_depts` (fallback regex).
- `silentRefresh` so **watermark trước** → chỉ kéo payload khi thật sự đổi.

## 3. Đề xuất tối ưu GitHub (chưa triển khai — chờ duyệt)

### 3.1. Test parity JS ↔ SQL cho luật tách bộ phận (ưu tiên cao)

Rủi ro lớn nhất sau thay đổi này: `parseDepts` (JS) và `vmp_parse_depts` (SQL)
lệch nhau. Thêm một job CI so khớp trên tập chuỗi mẫu:

```yaml
# .github/workflows/ci.yml  (mới)
name: CI
on: [push, pull_request]
jobs:
  build-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npm run build
      # so parseDepts(JS) với vmp_parse_depts(SQL) trên cùng bộ chuỗi mẫu
      - run: node scripts/check-dept-parity.mjs
```

`scripts/check-dept-parity.mjs`: nạp danh sách chuỗi bộ phận thực tế (fixture lấy
từ Sheet, đã ẩn danh), chạy `parseDepts`, đối chiếu với bảng kỳ vọng. Khi có
Postgres trong CI (service container) thì chạy thêm `select vmp_parse_depts(...)`
để so trực tiếp — bắt lệch regex trước khi merge.

### 3.2. Kiểm định migration trên Postgres tạm (CI)

Job dựng Postgres service, `psql -f` tất cả `supabase/migrations/*.sql` theo thứ
tự → bắt lỗi cú pháp/thứ tự **trước khi** apply lên production (hiện migration
không được test tự động ở đâu cả).

### 3.3. Fixture dữ liệu lọc để review không cần Supabase

Thêm `docs/fixtures/filter-samples.json` (đã sanitize): các ca bộ phận khó
(`"QLCL"`, `"RD, QC"`, `"XSX / Cơ điện"`, ô trống). Vừa làm input cho test parity,
vừa giúp reviewer hiểu luật lọc ngay trên GitHub mà không cần đăng nhập DB.

### 3.4. Tài liệu data-contract cho filter

Bổ sung `docs/data-contract.md`: liệt kê field lọc mà RPC bảo đảm trả
(`depts: string[]`, `dept`, `area`, `st`, `state`, `target`) + bảng ánh xạ
chuỗi Sheet → mã bộ phận. Đặt cạnh nhau JS regex và SQL regex để dễ soát.

### 3.5. (Tùy chọn, khi dữ liệu lớn) đẩy filter xuống server

Cột `departments` + GIN index đã sẵn cho hướng này. Nếu sau này số hạng mục vượt
mức lọc-trong-bộ-nhớ còn mượt (hiện ~476 dòng vẫn rất nhẹ, **chưa cần**), thêm RPC
`rpc_get_vmp_dashboard` biến thể nhận `p_areas text[]`, `p_depts text[]` và lọc
bằng `departments && p_depts` (dùng GIN). Giữ mặc định `null = trả hết` để không
vỡ đường đọc hiện tại.

> Lưu ý UX: với ~476 dòng, lọc **trong bộ nhớ** cho trải nghiệm tức thì khi gạt
> filter; đẩy xuống server sẽ thêm round-trip mỗi lần gạt. Chỉ nên chuyển khi tập
> dữ liệu lớn đến mức lọc client giật.

## 4. Việc bạn cần làm để kích hoạt

1. Apply migration `20260708160000_...sql` lên Supabase (qua Supabase SQL editor
   hoặc `supabase db push`).
2. Chạy lại đồng bộ Sheet một lần (hoặc chờ schedule) để **điền cột
   `departments`**. Trước khi có bước này, RPC vẫn chạy đúng nhờ fallback tính
   tại chỗ — không downtime.
3. (Khuyến nghị) tạo `.github/workflows/ci.yml` mục 3.1–3.2 để khoá parity.
