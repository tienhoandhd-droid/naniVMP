# Runbook — Source import server preview

## Trạng thái

Migration `20260901090000_catalog_import_server_preview.sql` mới chỉ được tạo
và kiểm tra local. Chưa apply production. Việc apply/rollback cần chủ dự án
xác nhận riêng.

## Quyền sau migration

| Thao tác Dữ liệu nguồn | Admin | Quản lý QA | Vai trò khác |
|---|---:|---:|---:|
| Xem trong phạm vi | Có | Có | Có |
| Thêm/sửa | Có | Có | Không |
| Tải file/nhập/commit | Có | Có | Không |
| Xuất Excel | Có | Có | Không |
| Xem preview batch | Batch của mình | Batch của mình | Không |

Guard nằm ở RPC. Frontend chỉ phản chiếu quyền để giao diện gọn hơn.

## Preflight

Chạy bằng tài khoản vận hành có quyền đọc metadata, trước khi apply:

```powershell
psql $env:VMP_DATABASE_URL -v ON_ERROR_STOP=1 -f scripts/check-catalog-import-preview-preflight.sql
```

Kết quả bắt buộc: `PASS CATALOG_IMPORT_PREVIEW_PREFLIGHT`.

## Apply

Chỉ chạy sau khi đã được xác nhận deploy/migration:

```powershell
psql $env:VMP_DATABASE_URL -v ON_ERROR_STOP=1 -f supabase/migrations/20260901090000_catalog_import_server_preview.sql
```

Migration đổi tên implementation xuất hiện tại, tạo wrapper manager-only và
tạo RPC preview owner-scoped. Không sửa dữ liệu staging đã có.

## Postflight

```powershell
psql $env:VMP_DATABASE_URL -v ON_ERROR_STOP=1 -f scripts/check-catalog-import-preview.sql
psql $env:VMP_DATABASE_URL -v ON_ERROR_STOP=1 -f tests/sql/catalog-import-preview-security.sql
```

Hai marker bắt buộc:

- `PASS CATALOG_IMPORT_PREVIEW_POSTFLIGHT`
- `PASS CATALOG_IMPORT_PREVIEW_SECURITY`

Security harness cần sẵn hai tài khoản active thuộc `admin`/`qa_manager` và
một tài khoản active thuộc vai trò thấp hơn. Toàn bộ fixture nằm trong
transaction rồi rollback.

## Kiểm tra thủ công tối thiểu

1. Admin nhập file Source, thấy đúng tổng create/update/unchanged/error.
2. Quản lý QA nhập file và chỉ đọc được batch vừa tạo bởi chính mình.
3. Một Admin khác không dò được batch đó (`BATCH_NOT_FOUND`).
4. QA staff/workshop vẫn xem được bảng đúng phạm vi nhưng không thấy nút
   thêm, sửa, nhập, tải dữ liệu hiện tại hoặc xuất Excel.
5. Gọi trực tiếp RPC preview/export bằng vai trò thấp hơn trả `FORBIDDEN`.

## Rollback

Rollback chỉ gỡ RPC preview và wrapper xuất, sau đó đổi implementation xuất
về tên cũ và phục hồi ACL trước Wave 3:

```powershell
psql $env:VMP_DATABASE_URL -v ON_ERROR_STOP=1 -f scripts/rollback-catalog-import-preview.sql
```

Sau rollback, chạy lại smoke test Source của bản trước. Lưu ý rollback cũng
khôi phục việc xuất Excel theo phạm vi cho vai trò thấp hơn; đây là hành vi cũ,
không phải trạng thái quyền mục tiêu.
