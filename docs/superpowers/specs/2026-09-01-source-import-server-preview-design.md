# Wave 3 — Xem trước nhập Excel Dữ liệu nguồn do server xác nhận

**Ngày:** 01/09/2026  
**Trạng thái:** Đã được chủ dự án duyệt thiết kế; chưa triển khai production  
**Phạm vi:** Nhập Excel trong workspace Dữ liệu nguồn

## 1. Mục tiêu

Người duyệt phải biết chính xác từng dòng Excel sẽ tạo mới, cập nhật, giữ
nguyên hay bị từ chối trước khi commit. Kết luận này phải đến từ dữ liệu
staging phía server, không được frontend suy đoán từ một bản tải toàn bảng.

Luồng hoàn chỉnh:

`Chọn Excel → kiểm tra file → staging → xem trước từng dòng → lý do → commit → biên nhận`

## 2. Hiện trạng và vấn đề

`CatalogExcelImport` đã có vòng đời file, staging, commit, sổ lỗi và A3
trước–sau cho `products_gmp`. Với `source_objects`, giao diện hiện gắn mọi
dòng hợp lệ thành `Máy chủ đối chiếu` vì browser chủ ý không tải toàn bộ bảng
nguồn để tự đoán.

Database đã có:

- `vmp_catalog_import_batches` với tổng số tạo/sửa/không đổi/lỗi;
- `vmp_catalog_import_rows` với `classification`, `current_snapshot`, `patch`,
  `errors`, `expected_version` và `row_reason`;
- `rpc_stage_catalog_import`, `rpc_set_catalog_import_row_reason` và
  `rpc_commit_catalog_import`.

Khoảng trống là một read boundary an toàn để trả kết quả staging cho đúng
người đã tạo batch.

## 3. Nguyên tắc thiết kế

1. Server là nguồn sự thật cho phân loại và diff.
2. Frontend không tải toàn bộ Source chỉ để đối chiếu import.
3. Chỉ đọc batch của chính phiên đăng nhập đã tạo batch đó.
4. Payload trả về có allowlist chính xác; không trả raw row hoặc cột nội bộ
   ngoài hợp đồng.
5. Commit vẫn khóa lạc quan bằng `expected_version`; xem trước không làm yếu
   kiểm tra xung đột.
6. Lý do toàn lô bắt buộc. Lý do từng dòng là ngoại lệ có chủ đích và được
   lưu bằng RPC hiện có.
7. Không có fallback phân loại ở client khi RPC mới chưa tồn tại.
8. Chưa push, deploy hoặc apply migration trong Wave 3 local.

## 4. Boundary server mới

Tạo RPC:

```sql
public.rpc_catalog_import_preview(
  p_batch_id uuid,
  p_cursor integer default 0,
  p_limit integer default 100
) returns jsonb
```

### 4.1 Quyền truy cập

RPC là `SECURITY DEFINER`, `search_path=public,pg_temp`, và fail-closed:

- phiên phải active theo `vmp_is_active_session(auth.uid())`;
- batch phải có `uploaded_by = auth.uid()`;
- `service_role` chỉ được dùng cho migration test/postflight;
- tài khoản khác, kể cả Admin khác, không được xem batch;
- `anon` và `PUBLIC` không có EXECUTE;
- `authenticated` chỉ có EXECUTE qua các guard ở trên.

Không suy quyền bằng email và không nhận `uploaded_by` từ client.

### 4.2 Phân trang

- `p_limit` hợp lệ từ 1 đến 200;
- `p_cursor` là `row_number` cuối đã thấy, mặc định 0;
- query dùng `row_number > p_cursor order by row_number limit p_limit`;
- `next_cursor` là `row_number` cuối nếu còn trang, ngược lại `null`;
- không dùng offset để tránh trượt dòng.

### 4.3 Hợp đồng response

Thành công trả đúng hình dạng:

```json
{
  "ok": true,
  "batch": {
    "id": "uuid",
    "dataset": "source_objects",
    "status": "validated",
    "total": 3,
    "counts": {
      "created": 1,
      "updated": 1,
      "unchanged": 1,
      "errors": 0
    },
    "created_at": "timestamptz",
    "committed_at": null
  },
  "rows": [
    {
      "row_number": 2,
      "business_key": "TB-001",
      "object_kind": "equipment",
      "classification": "update",
      "current_snapshot": {},
      "patch": {},
      "errors": [],
      "row_reason": null
    }
  ],
  "next_cursor": null
}
```

Allowlist row chỉ gồm các khóa trên. `current_snapshot` và `patch` phải được
server dựng từ trường catalog được phép hiển thị; không trả `input`,
`expected_version`, UUID người dùng hoặc dữ liệu của batch khác.

Lỗi trả đúng một trong các mã:

- `INVALID_ARGUMENT`
- `SESSION_INACTIVE`
- `BATCH_NOT_FOUND`
- `FORBIDDEN`
- `BATCH_EXPIRED`

Response lỗi không chứa snapshot, patch hoặc thông tin chứng minh batch của
người khác có tồn tại. Với batch không thuộc người gọi, dùng cùng bề mặt
`BATCH_NOT_FOUND` để chống dò UUID.

## 5. Frontend contract và data flow

Tạo decoder thuần, exact-key, fail-closed cho response RPC. Mọi số đếm phải
là số nguyên không âm; tổng bốn nhóm phải bằng `batch.total`; dòng phải tăng
theo `row_number`; classification chỉ nhận:

- `create`
- `update`
- `unchanged`
- `error`

Luồng state:

1. Browser kiểm fingerprint, phiên bản mẫu, kích thước và lỗi cú pháp.
2. Browser gọi `rpc_stage_catalog_import` đúng một lần cho file hợp lệ.
3. Khi nhận `batch_id`, browser gọi preview trang đầu.
4. Summary dùng `batch.counts` từ server, không dùng phân loại local.
5. Các trang sau được tải khi người dùng bấm `Tải thêm`; không auto-fetch
   2.000 dòng nếu người dùng chỉ cần xem phần đầu.
6. Sửa lý do dòng gọi `rpc_set_catalog_import_row_reason`; chỉ cập nhật giao
   diện sau response thành công.
7. Commit gọi RPC hiện có. Nếu thành công, giữ biên nhận trên màn hình và tải
   lại workspace; nếu conflict, giữ batch và yêu cầu staging lại từ file.

## 6. Giao diện xem trước

Thay nhãn `Máy chủ đối chiếu` bằng command surface gồm:

- bốn số đếm server: Tạo mới, Cập nhật, Không đổi, Lỗi;
- tìm theo mã trong các dòng đã tải;
- lọc trạng thái trong các dòng đã tải;
- bảng cột: Dòng, Mã, Trạng thái, Thay đổi/Lỗi, Lý do ngoại lệ;
- nút `Tải thêm` khi còn `next_cursor`;
- trạng thái “đã tải X/Y dòng” để không tạo cảm giác đã xem hết.

Chi tiết từng loại:

- **Tạo mới:** mở rộng để xem các trường sẽ tạo; không có giá trị “trước”.
- **Cập nhật:** A3 liệt kê từng trường `trước → sau`, chỉ hiện trường đổi.
- **Không đổi:** mặc định thu gọn, không tạo audit thay đổi.
- **Lỗi:** hiện mã lỗi, mô tả và trường liên quan; được xuất vào sổ lỗi.

Tất cả hành động là native button. Hàng mở rộng dùng `aria-expanded` và
`aria-controls`; thông báo staging/commit dùng live region. Bảng nằm trong
container cuộn riêng ở viewport hẹp, không làm tràn toàn trang.

## 7. Lý do và điều kiện commit

Lý do toàn lô là bắt buộc và được trim. Nút commit chỉ khóa khi đang gửi hoặc
server chưa sẵn sàng. Nếu thiếu lý do, nút vẫn nhận click, hiện lỗi cạnh
textarea và focus đúng textarea theo hợp đồng action readiness của Wave 2.

Commit không được gửi khi:

- batch chưa `validated`;
- server báo còn dòng lỗi;
- preview RPC lỗi hoặc payload không hợp lệ;
- file/batch đã hết hạn;
- request khác đang chạy.

Lý do ngoại lệ từng dòng không thay thế lý do toàn lô. Khi lưu lý do dòng
thất bại, giữ bản nháp và cho phép thử lại.

## 8. Biên nhận sau commit

Sau thành công, không xóa toàn bộ bề mặt ngay. Hiển thị một biên nhận gồm:

- batch ID dạng rút gọn, có nút sao chép ID đầy đủ;
- số tạo mới/cập nhật/không đổi;
- thời gian commit theo Asia/Bangkok;
- trạng thái `Đã ghi`;
- số thay đổi timeline đang chờ và nút mở tab `Chờ áp dụng` nếu có.

Biên nhận lấy số liệu từ response commit và metadata batch đã được preview;
không tự tính lại từ những trang row đã tải.

## 9. Lỗi, conflict và phục hồi

- RPC preview chưa tồn tại: giữ bề mặt `BỊ CHẶN`, không fallback sang nhãn giả.
- Preview mạng lỗi: giữ batch ID, hiện `Thử lại`, không restage tự động.
- Decoder từ chối payload: fail-closed và không cho commit.
- `STALE_VERSION`/conflict khi commit: giữ lý do, thông báo dữ liệu nguồn đã
  đổi và yêu cầu chọn lại file để tạo batch mới.
- Batch hết hạn: vô hiệu commit, cho phép chọn lại cùng file.
- Commit đã ghi nhưng reload workspace lỗi: hiển thị `Đã ghi, chưa đối chiếu
  lại được`; không retry mutation.

## 10. Cấu trúc mã dự kiến

- Migration mới: tạo RPC preview, ACL, comment và rollback/preflight.
- `catalogImportPreviewContract.ts`: types và decoder exact-key.
- `catalogImportPreviewModel.ts`: reducer trang, lọc local, readiness và receipt.
- `CatalogImportPreviewTable.tsx`: summary, bảng, expansion, lý do dòng.
- `CatalogExcelImport.tsx`: điều phối file → stage → preview → commit.
- `api.ts`: `fetchCatalogImportPreview` dùng RPC mới.
- CSS workspace: table, diff A3, receipt và responsive overflow.

Không đưa SQL permission logic vào React và không để component tự diễn giải
wire payload chưa decode.

## 11. Kiểm thử bắt buộc

### Unit

- decoder chấp nhận payload chính xác và từ chối extra key/type/count sai;
- reducer không lặp dòng/cursor, không trộn hai batch;
- filter không thay đổi tổng server;
- readiness focus đúng lý do và không commit khi preview lỗi;
- receipt dùng số server và timestamp Bangkok.

### SQL/migration

- uploader active đọc được batch của mình;
- Admin/QA khác không đọc được batch;
- inactive, workshop roles và anon bị từ chối;
- service role postflight đọc được fixture;
- phân trang ổn định, limit bị chặn, exact response keys;
- không rò `input`, `expected_version`, `uploaded_by` hoặc batch khác;
- forward/rollback bảo toàn dữ liệu và ACL.

### E2E mock

- file có đủ create/update/unchanged/error;
- mở A3 update và create;
- tải thêm trang không lặp;
- lưu lý do dòng thành công/thất bại;
- thiếu lý do batch focus đúng trường;
- conflict giữ draft và không retry commit;
- commit thành công hiện biên nhận và link Chờ áp dụng;
- preview RPC thiếu thì fail-closed.

### Gate

- targeted unit và SQL contract;
- catalog workspace E2E;
- accessibility;
- typecheck, build, drift, budget;
- secret scan và `git diff --check`.

## 12. Ngoài phạm vi

- Apply migration lên production.
- Push/deploy trước khi toàn bộ Wave 3 được duyệt.
- Snapshot báo cáo bất biến và chữ ký điện tử.
- Thay đổi ma trận vai trò ngoài quyền đọc batch của chính người tạo.
- Thay đổi định dạng file Excel hoặc tăng giới hạn 5 MiB/2.000 dòng.

## 13. Tiêu chí nghiệm thu

Wave 3 đạt khi một người có quyền có thể chọn file Source, thấy phân loại và
diff server từng dòng, xử lý lỗi/lý do, commit đúng một lần và nhận biên nhận;
đồng thời người khác không thể dò hoặc đọc batch đó. Mọi lỗi server, payload
lạ và conflict đều phải fail-closed nhưng giữ được bản nháp cần thiết để phục
hồi.
