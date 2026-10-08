# Chạy lại bộ kiểm CRUD/quyền/audit

Chạy tại `MA-NGUON-HIEN-TAI`. Chỉ dùng clone dùng một lần, không dùng database production. Bản thử ngày08/10 được chuẩn bị từ backup riêng, đối chiếu 385 hàm với server, rồi áp ba migration mới local. Không chạy lại migration production cũ hoặc import lịch sử.

## PostgreSQL

Runner yêu cầu tên DB bắt đầu `vmp_crud_audit_` và comment chính xác `VMP_DISPOSABLE_CRUD_AUDIT`; kiểm marker trước mọi test write. Các suite dùng giao dịch rollback và dữ liệu synthetic riêng.

```sh
python3 scripts/run-crud-role-db-tests.py \
  --container supabase_db_vmp-five-role-hardening \
  --database vmp_crud_audit_20261008 \
  --evidence-dir /home/admin1/VMP/.cpc1/crud-audit-20261008/rerun-db
```

Runner trả exit khác0 nếu bất kỳ suite lỗi; xem `results.json` và từng log, không chỉ dòng PASS cuối. Chạy tuần tự vì các fixture có thể dùng cùng nhóm UUID và bảng chung. Clone cần cấu hình biểu mẫu/PQ hiện hành, Auth trigger/ACL và dữ liệu cấu trúc Source HT-12/13/14/15; đây không phải suite cho schema trống.

Các file migration mới có guard định nghĩa hàm trước sửa, cố ý từ chối chạy lại hoặc chạy trên baseline khác. Rollback tám hàm nằm bằng chứng riêng; đã diễn tập restore/reapply và so hash/ACL. Không tự bỏ guard khi khác hash.

## Browser → database thật

Private build được phục vụ loopback4173; PostgREST riêng loopback15431 trỏ clone. `browser-config.json` riêng chứa JWT thử, không commit. Những JWT đó chỉ có ý nghĩa với PostgREST thử; Auth/user bị giả lập, các request nghiệp vụ qua HTTP thật.

```sh
VMP_REAL_CONFIG=/home/admin1/VMP/.cpc1/crud-audit-20261008/browser-config.json \
  node tests/e2e/catalog-real-db.mjs
```

Có thể chẩn đoán riêng bằng `VMP_REAL_SECTION=source|products|alerts|denials`; kết quả một section không thay thế lượt `all` mặc định. Runner từ chối URL web không loopback và REST ngoài `http://127.0.0.1:15431`, chặn request ngoài tuyến thử. Nó tạo dữ liệu synthetic có prefix/runId trên clone; khi chạy lại dùng runId mới. SQL suites khác rollback nên không để lại dữ liệu nghiệp vụ thử.

Thành công phải gồm payload đúng, lưu thật, tải lại từng trường và readback trạng thái ngừng dùng. Không nới oracle chỉ vì thông báo UI hoặc RPC `ok:true`.

## Kiểm tĩnh và hồi quy UI

```sh
npm run typecheck
npm run test:unit
npm run drift
VITE_MANUAL_PLANNED_DEADLINES_ENABLED=true npm run build -- --outDir /home/admin1/VMP/.cpc1/crud-audit-20261008/dist
node tests/e2e/catalog-workspace.mjs
node tests/e2e/workload-owner-transfer.mjs
```

Không chạy build vào private dist khi browser đang dùng nó. Sau thay đổi migration chạy suite DB liên quan; sau thay đổi UI dựng lại đúng artifact trước browser. Mọi kết quả cần gắn hash file/source; không tái sử dụng receipt của artifact khác.

Clone được giữ riêng để tái hiện và rà soát. Chỉ dừng/xóa container, preview và database do đợt này tạo; không restart hoặc xóa các dịch vụ Supabase sẵn có. Xem trạng thái cuối trong PROJECT-STATE trước khi sử dụng lại môi trường.
