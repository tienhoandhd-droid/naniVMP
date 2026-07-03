# Kiến trúc dữ liệu VMP Monitor — cập nhật 2026-07

## Quyết định: Supabase là nguồn sự thật duy nhất

Từ 2026-07-03, luồng dữ liệu chuyển sang **một chiều về mặt chỉnh sửa**:

```
Google Sheet (KHÓA, chỉ đọc)  ──một lần/thủ công──▶  Supabase (source of truth)  ◀──sửa──  Dashboard (GitHub Pages)
```

- **Google Sheet**: bị **khóa** — chỉ dùng để nạp dữ liệu ban đầu. **Không bao giờ ghi vào Sheet.**
- **Supabase**: kho chính + phân quyền (RLS) + audit + realtime. Mọi chỉnh sửa đi qua RPC.
- **Dashboard (GitHub Pages)**: **nơi chỉnh sửa duy nhất**; đọc/ghi trực tiếp Supabase.

## Thay đổi kèm theo

### n8n — workflow WF-04 (`Nhóm-VMP WF-04`)
Đã **tắt** các node sau (để thực thi chính sách khóa Sheet + tránh ghi đè ngược):
- `Schedule (4h)`, `Trigger: Sheet changed (instant)` — dừng sync Sheet → Supabase.
- `Schedule (1 phút)`, `6. Update Sheet Row`, `3. Update Sheet Row` — dừng mọi thao tác ghi Sheet.
- **Giữ lại**: nhánh cảnh báo email hằng ngày (7h) và đường đọc Supabase.

### GitHub Actions Variables
- **Đã xóa** `VITE_N8N_WRITE_URL` → dashboard không còn mirror ghi sang Sheet
  (`pushToSheet()` trả `skipped` khi biến trống). Chỉnh sửa chỉ ghi Supabase.
- Lưu ý: biến đọc bị gõ sai tên `ITE_VMP_READ_URL` (thiếu chữ "V"); không ảnh
  hưởng vì đã đọc thẳng Supabase. Đổi tên thành `VITE_VMP_READ_URL` nếu cần fallback.

## Sự cố đã sửa (2026-07-03)
Một lần WF-04 đọc Sheet **thiếu** đã khiến `rpc_reconcile_orphan_objects` tắt nhầm
236/243 đối tượng và gắn cờ `missing_from_sheet` cho 771/1217 hạng mục → dashboard
chỉ hiển thị 7 đối tượng. Đã khôi phục: bật lại đối tượng có hạng mục sống, xóa cờ
missing, và xóa 2 dòng lệch dòng (`PCTB504/2026.02-OQ` thuộc PCTB509,
`PCTB504/2026.02-PQ` thuộc PCTB510). Sau sửa: **243 đối tượng / 1215 hạng mục.**

> ⚠️ Không bật lại `rpc_reconcile_orphan_objects` nguyên trạng: nó tắt mọi mã vắng
> khỏi danh sách truyền vào. Nếu cần nạp bổ sung từ Sheet, sửa để CHỈ THÊM, không TẮT.
