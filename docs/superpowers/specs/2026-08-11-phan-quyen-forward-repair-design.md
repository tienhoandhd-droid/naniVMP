# Thiết kế forward repair phân quyền QA

## Bối cảnh và trạng thái xác nhận

Migration `20260811100000_qa_theo_phan_cong_hang_muc.sql` đã bị chạy trực tiếp ngoài transaction trên database cấu hình trong `/home/admin1/VMP/.env.local`, trong khi prerequisite `20260810160000_pham_vi_xuong_khu_vuc_line_va_person_id.sql` chưa được áp.

Kiểm tra read-only sau sự cố xác nhận:

- `item_permissions_mode()` vẫn là `preview`.
- `vmp_item_assignments` có `0` dòng, nên các câu backfill assignment không đổi dữ liệu nghiệp vụ.
- Cột `assignment_role`, constraint/index QA và RPC sáu tham số đã tồn tại.
- Các bảng hierarchy `vmp_scope_factories`, `vmp_scope_areas`, `vmp_scope_lines` chưa tồn tại.
- Các cột hierarchy/person link của migration 1600 và helper `vmp_jsonb_uuid_array`, `vmp_item_scope_matches` còn thiếu.
- Chuỗi hàm quyền hiện có `vmp_item_rights_before_assignment_only_qa` và `vmp_item_rights`, nhưng thiếu lớp `vmp_item_rights_before_canonical_scope`.
- Không có fixture probe nào được chạy; migration history không có bản ghi `20260811100000`.

## Mục tiêu

Đưa database từ trạng thái partial về đúng ngữ nghĩa cuối của chuỗi migration `1600 → 111000`, vẫn giữ `preview`, không xóa dữ liệu và không tự bật enforced. Cùng lúc, source phải chứa một migration repair có thể chạy an toàn trên cả database partial hiện tại lẫn database sạch đã áp đúng chuỗi.

## Phương án được chọn

Sửa tiến bằng migration reconciliation mới, không rollback thủ công.

Migration repair sẽ:

1. Fail-closed nếu trạng thái đầu vào không thuộc một trong hai dạng được hỗ trợ: partial `111000` hoặc clean `1600 → 111000`.
2. Tạo có điều kiện ba bảng hierarchy, trigger, RLS, quyền service role, các cột/index person link và hierarchy còn thiếu.
3. Chạy backfill person ID đúng quy tắc “tên chuẩn hóa khớp duy nhất”, không suy đoán hierarchy và không sinh dòng catalog giả.
4. Tạo lại helper/RPC prerequisite của migration 1600 mà migration 111000 cần.
5. Khôi phục chuỗi quyền ba tầng:
   - `vmp_item_rights_before_canonical_scope`: implementation legacy trước canonical scope.
   - `vmp_item_rights_before_assignment_only_qa`: canonical hierarchy wrapper.
   - `vmp_item_rights`: wrapper cuối, QA assignment-only.
6. Reconcile dashboard/source writer/person-ID RPC và grants mà migration 1600 chịu trách nhiệm.
7. Recreate RPC phân công với lock performer trước khi snapshot account/activity; lock order phải tương thích RPC link/unlink.
8. Loại duplicate preflight error có cùng predicate.
9. Tự verify mode, object signatures, privileges, constraint/index, function chain và không có assignment/user fixture phát sinh.

## An toàn triển khai

- Trước DDL thật, tạo backup schema toàn database và data của các bảng bị tác động, file mode `0600` trong thư mục backup ngoài Git.
- Mọi dry-run dùng một phiên `psql` với `BEGIN`, `lock_timeout`, `statement_timeout`, include migration repair hai lần, assertions, rồi `ROLLBACK`.
- Chỉ khi dry-run và review độc lập đạt mới chạy cùng migration một lần trong transaction thật rồi `COMMIT`.
- Không drop bảng/cột hiện có, không truncate/delete, không tự đổi `preview` sang `enforced`.
- Nếu lock timeout, assertion hoặc trạng thái đầu vào sai, toàn transaction rollback.

## Hậu kiểm bắt buộc

- Mode vẫn `preview`.
- Ba bảng hierarchy và các helper/RPC canonical tồn tại với quyền tối thiểu.
- `rpc_upsert_item_permission_staff(uuid,jsonb,text,integer)` chạy được và không có overload legacy.
- `rpc_set_item_assignment(uuid,text,text,text,text,text)` khóa performer trước snapshot.
- Chuỗi ba hàm quyền tồn tại; QA không phân công fail-closed, non-QA đi qua hierarchy canonical.
- Không có hai QA primary, không có duplicate active QA person, không có fixture audit/performer/assignment.
- Source UI/tests, unit, E2E, typecheck và build phải xanh trước merge/push.

## Phương án không chọn

- Rollback tay migration 111000: phải phục hồi hàng loạt function/grant từ nhiều migration cũ và dễ làm mất invariant mới.
- Áp nguyên migration 1600 sau 111000: thứ tự rename/replace function sẽ làm sai chuỗi quyền và có thể xung đột object đã tồn tại.
- Bỏ nguyên trạng partial: RPC hiện tại tham chiếu cột/helper chưa tồn tại và có thể lỗi ngay khi người dùng lưu danh bạ.
