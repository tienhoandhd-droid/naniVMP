# Kiến trúc dữ liệu VMP Monitor — cập nhật 2026-07-04

## Quyết định: Google Sheet là nguồn dữ liệu chuẩn

Luồng dữ liệu nghiệp vụ VMP là một chiều:

```
Google Sheet 6.Timeline VMP ──webhook instant + snapshot 5 phút──▶ Supabase ──realtime/read-only──▶ Dashboard
```

- **Google Sheet** là nơi lưu và chỉnh sửa dữ liệu nghiệp vụ chuẩn.
- **Supabase** là bản chiếu chỉ đọc cho browser, phục vụ RLS, audit, realtime và các tác vụ phụ trợ.
- Browser roles không có `INSERT`, `UPDATE`, `DELETE` trên `vmp_plan_items`/`vmp_objects` và không được gọi các RPC ghi nghiệp vụ.
- Chỉ n8n/Postgres service được ghi snapshot canonical.
- Workflow này không ghi ngược dữ liệu vào Google Sheet.

## Đồng bộ canonical

Workflow live: `VMP WF-04: Google Sheet → Supabase canonical sync`
(`LArr1nhj3jzFjJLs`).

Nhánh canonical:

1. `Trigger: Sheet changed (instant)` nhận webhook Apps Script có Header Auth; `Schedule (5 phút)` là fallback.
2. `1. Download Canonical Sheet CSV` đọc tab `6.Timeline VMP`, gid `1252715724`.
3. `2. Parse Canonical Sheet CSV` kiểm tra 37 cột, khóa bắt buộc và ngưỡng số dòng.
4. `3. Apply Canonical Snapshot` so checksum; snapshot không đổi được bỏ qua.
5. Snapshot thay đổi được backup và áp dụng nguyên tử qua
   `rpc_sync_vmp_sheet_snapshot`. Nếu một bước lỗi, transaction tự rollback.

Snapshot đầu ngày 2026-07-04 đã thay thế dữ liệu cũ:

- Raw Sheet: 479 dòng.
- `vmp_plan_items`: 476 ID duy nhất.
- `vmp_objects`: 214 mã đối tượng.
- Ba ID trùng dùng dòng xuất hiện cuối; toàn bộ 479 dòng vẫn được lưu trong
  `vmp_sheet_rows` để đối chiếu.

Backup trước reset được gắn với sync run
`5a5144f8-f076-4f8e-a1c0-21133bef60ea`, gồm 1.215 hạng mục, 243 đối tượng và
30 data-quality issue. Có thể khôi phục nguyên tử bằng
`rpc_rollback_vmp_sheet_sync(sync_run_id)` khi thật sự cần.

## Hàng rào an toàn

- Khóa advisory ngăn hai snapshot ghi đồng thời.
- Từ chối snapshot sai 37 cột, thiếu ID/mã đối tượng hoặc giảm dưới ngưỡng an toàn.
- Mỗi lần thay đổi đều lưu raw rows, checksum và backup trước khi ghi.
- Hậu kiểm bắt buộc số `vmp_plan_items` và `vmp_objects` bằng số ID/mã duy nhất
  của Sheet.
- Data-quality issue chưa xử lý có khóa chống trùng.
- Không dùng lại `rpc_reconcile_orphan_objects` cũ; exact-set sync đã thay thế nó.
- Các HTTP RPC bootstrap/probe cũ đã bị gỡ; n8n gọi RPC service-only qua Postgres credential.
- Frontend có lớp chặn ghi dự phòng và hiển thị rõ dữ liệu chỉ sửa tại Google Sheet.
