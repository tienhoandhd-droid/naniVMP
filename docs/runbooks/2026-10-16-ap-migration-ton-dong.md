# Runbook tổng — áp 8 migration tồn đọng lên production (16/10/2026)

## Vì sao có runbook này

Rà soát 16/10 so **thân hàm thật** trên production với repo: 6 migration đợt
31/08–01/09 được ghi "CHỜ CHỦ DỰ ÁN APPLY" nhưng **chưa từng được áp**. Web đang
publish (commit `e9d1c7f`, deploy 08/10) đã gọi tới chúng, nên người dùng thật đang gặp:

| Migration | Hậu quả khi chưa áp |
|---|---|
| `20260831160000_fix_bangkok_current_date` | Cập nhật tiến độ 0h–7h sáng (giờ VN) lấy ngày UTC → lệch 1 ngày |
| `20260831170000_client_error_log` | Web không ghi được lỗi phía người dùng; thẻ lỗi ở Cấu hình hệ thống trống |
| `20260831180000_close_true_policies` | 6 bảng PII (email nhân sự, allowlist…) mở cho mọi tài khoản |
| `20260901090000_catalog_import_server_preview` | Nhập danh mục từ Excel dừng ở bước xem trước ("Server chưa có RPC") |
| `20260901110000_canonical_dashboard_read_model` | Dashboard chạy đường dự phòng v1 |
| `20260901120000_revalidation_proposals` | Tab "Tái thẩm định" báo lỗi tải |

Thêm hai migration mới viết 16/10:

| Migration | Nội dung |
|---|---|
| `20261016090000_revalidation_policy_current_scope` | Sửa lỗi của `20260901120000`: policy gọi hàm `vmp_can_view_item` mà authenticated không có quyền → mọi người đọc bảng bị `permission denied` |
| `20261016100000_close_open_ai_progress_policies` | Đóng 13 policy `true` còn sót (lịch sử hỏi Vali, sự kiện tiến độ cho GHI tự do…) |

**Lưu ý:** bảng `supabase_migrations.schema_migrations` KHÔNG phản ánh đúng thực
tế (áp bằng `psql -f` không ghi vào đó). Đối chiếu bằng thân hàm, không bằng bảng này.
Công cụ: `npm run drift:db` (`scripts/check-migration-drift.mjs`) — chạy định kỳ,
nhất là sau mỗi lần deploy có migration.

## 0 · Trước khi áp

1. Xác nhận backup/PITR của Supabase còn hiệu lực (Dashboard → Database → Backups).
2. Ghi lại bằng chứng TRƯỚC (read-only), lưu vào hồ sơ:
   ```bash
   psql "$SUPABASE_DB_URL" -X -A -c "begin read only;
     select tablename, policyname, cmd, coalesce(qual, with_check) from pg_policies
     where schemaname='public' order by 1,2; rollback;" > truoc-ap-policies.txt
   ```
3. Chọn giờ ít người dùng. Mỗi file chạy dưới 1 giây trên bản sao production.

## 1 · Áp — ĐÚNG thứ tự, dừng ngay khi một file lỗi

```bash
for f in \
  20260831160000_fix_bangkok_current_date \
  20260831170000_client_error_log \
  20260831180000_close_true_policies \
  20260901090000_catalog_import_server_preview \
  20260901110000_canonical_dashboard_read_model \
  20260901120000_revalidation_proposals \
  20261016090000_revalidation_policy_current_scope \
  20261016100000_close_open_ai_progress_policies
do
  echo "== $f"
  psql "$SUPABASE_DB_URL" -X -v ON_ERROR_STOP=1 -c "set lock_timeout='3s'" \
    -f "supabase/migrations/$f.sql" || { echo "DỪNG tại $f"; break; }
done
psql "$SUPABASE_DB_URL" -X -c "notify pgrst, 'reload schema';"
```

Mỗi file có PRECONDITION/POSTCONDITION riêng và nằm trong `begin…commit`: lỗi ở
đâu thì file đó không đổi gì. Các file trước đó đã COMMIT — xem mục 3.

## 2 · Kiểm sau khi áp

Theo runbook riêng của từng file (`docs/runbooks/`), tối thiểu:

- Đăng nhập admin: Dữ liệu nguồn → **Tái thẩm định** hiện bảng (không lỗi).
- Dữ liệu nguồn → **Nhập Excel**: chọn file mẫu → bước xem trước hiện bảng đối chiếu.
- Cấu hình hệ thống: thẻ lỗi phía người dùng hiện (có thể rỗng, không báo "chưa áp").
- Tài khoản xưởng: không thấy danh bạ email ở màn Cảnh báo; Vali vẫn trả lời.
- `npm run drift:db` (cần `SUPABASE_DB_URL`, chỉ đọc) — kỳ vọng `✓ … khớp production`, mã thoát 0.

## 3 · Lùi

Không có "undo" chung — mỗi runbook riêng có mục forward-recovery. Nguyên tắc:
siết quyền oan → nới đúng bảng đó theo runbook, ghi hồ sơ sự cố; KHÔNG khôi phục
policy `using (true)`.

## Bằng chứng thử trên bản sao production (16/10)

Bản sao dựng từ `pg_dump` production (schema `public` + `cpc1_private`), cả 8 file áp
thành công theo đúng thứ tự trên; kiểm theo vai admin / qa_staff / workshop_manager /
workshop_staff. Chi tiết trong báo cáo rà soát.

## Hồ sơ áp

**ĐÃ ÁP 16/10/2026 ~11:25 (giờ VN)** — Claude Code theo uỷ quyền của chủ dự án.

- Sao lưu trước khi áp: `pg_dump` schema `public` + `cpc1_private` (93 MB, 80 bảng,
  có dấu "dump complete"), lưu ngoài repo tại `/home/admin1/VMP/.backups/` (quyền 600).
- Bằng chứng trước/sau (danh sách policy, `drift:db`) lưu cùng chỗ, thư mục
  `ho-so-ap-migration-20261016/`.
- Kết quả: cả 8 file `exit=0`, mỗi file 0,5–1,6 giây, không lỗi.
- Sau khi áp: `notify pgrst, 'reload schema'`; `npm run drift:db` →
  `✓ 130 hàm trong repo khớp production` (mã thoát 0); 0 policy `true` trên 15
  bảng đã đóng; 16 policy `true` còn lại đều ở bảng cấu hình (giai đoạn 2.2 của
  kế hoạch nâng cấp).

**Bổ sung 16/10 ~13:00:** áp thêm `20261016110000_schema_fingerprint` (hàm mã băm cho
workflow `db-drift.yml`) và `20261016120000_mfa_pre_request_anon_fix` (hook MFA chặn
nhầm mọi request anon — đã so hook cũ/mới trên production trong giao dịch ROLLBACK
trước khi áp). Sau áp: `drift:db` 131/131 khớp, cả chế độ psql lẫn anon REST; anon
vẫn bị từ chối đọc bảng (`vmp_plan_items` → HTTP 401).
