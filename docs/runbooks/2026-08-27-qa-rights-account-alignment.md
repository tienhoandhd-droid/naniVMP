# Runbook hiệu chỉnh quyền QA và bốn tài khoản QA/QC

**Ngày soạn:** 2026-08-27

**Nguồn chuẩn ban đầu:** `origin/main@45d6c53075d17fa52effcab69eb25850bb28d060`

**Trạng thái:** người dùng đã phê duyệt hoàn tất đến production và deploy trong phiên thực hiện ngày 2026-08-27; người vận hành vẫn phải lưu bằng chứng cửa sổ thay đổi và postflight.

Runbook này chỉ áp dụng cho bốn UUID đã được đối chiếu ngoài Git:

- Đỗ Đắc Anh Khoa: Quản lý QA;
- Lê Hoàng Đạt: Nhân viên xưởng thuộc bộ phận Kiểm nghiệm, mã canonical `qc`;
- hai profile Viewer thử nghiệm còn lại: chuyển sang không hoạt động.

Không dùng tên hoặc email để chọn bản ghi ghi. Không xóa vật lý Auth user, profile, hồ sơ nhân sự, audit hoặc lịch sử phân công. Giá trị enum legacy `viewer` tiếp tục tồn tại nhưng không phải vai trò nghiệp vụ hiệu lực.

## 1. Chốt an toàn bắt buộc

Chỉ tiếp tục khi có một phê duyệt production riêng ghi rõ database, cửa sổ thay đổi, người thực hiện, người quan sát và bốn UUID mục tiêu. Việc duyệt code hoặc runbook không đồng nghĩa với duyệt ghi production.

Các điều kiện bắt buộc:

1. checkout phát hành xuất phát từ SHA nguồn chuẩn nêu trên và mọi artifact khớp bảng SHA-256 ở mục 2;
2. file UUID nằm ngoài repository, quyền file `0600`, thư mục cha `0700`;
3. preflight chỉ đọc khớp trạng thái đã review;
4. backup hoàn tất và có thể đọc bằng công cụ PostgreSQL 17;
5. `screen_access_mode = enforced`, `item_permissions_mode = preview`;
6. tuyệt đối không gọi `scripts/apply-five-role-hardening.sql` hoặc `scripts/apply-five-role-account-manifest.sql`, vì hai file đó dùng manifest bảy tài khoản ngoài phạm vi lần này;
7. không bật `item_permissions_mode = enforced` trong cửa sổ này.

## 2. Nguồn và hash được duyệt

Chạy từ repository root. So sánh đúng từng ký tự; lệch một hash thì dừng và review lại, không tự cập nhật bảng tại cửa sổ production.

| Artifact | SHA-256 được duyệt |
|---|---|
| `supabase/migrations/20260824120000_five_role_permission_hardening.sql` | `82c321e40f73152bb1131a5b73067e0efc790d39d7926ac2da4b0bd191ccaf08` |
| `supabase/migrations/20260826130000_catalog_progressed_deadline_override.sql` | `818ee26a963b53c4977b0604d65ecb4779922bc4d009d0ae1965c1f51d8d16fc` |
| `supabase/migrations/20260826170000_manual_planned_deadline_edit.sql` | `2eddcf0141260acd7f613608871e5b4e057715645337ec0adc82fd30b9437a01` |
| `supabase/migrations/20260826180000_qa_manager_actual_date_principal_normalization.sql` | `d8066924f3268b283310a324aa6430301d4bb2c7c29ad1066e3572e5f517dcaa` |
| `supabase/migrations/20260827100000_qa_rights_account_alignment.sql` | `99975799b9a5995fe7dd6c969a2e63a4e9522dbff14ac1ec6977d93ceb1db355` |
| `scripts/apply-qa-rights-account-alignment.sql` | `ce81b16d7b17bf2752d649f9c285031955422857714779387614f35ae6ea095b` |
| `scripts/apply-qa-rights-account-manifest.sql` | `6d22c0bfb83a3add51ad2a8707421e5eefdc2160f8e39c397507909d3ee695ba` |
| `scripts/check-qa-rights-account-alignment.sql` | `a73d3fb4dedab257de3d9f78462995f5309a0d77ddeb466fab5d08482ec25e05` |

Lệnh kiểm:

```bash
sha256sum \
  supabase/migrations/20260824120000_five_role_permission_hardening.sql \
  supabase/migrations/20260826130000_catalog_progressed_deadline_override.sql \
  supabase/migrations/20260826170000_manual_planned_deadline_edit.sql \
  supabase/migrations/20260826180000_qa_manager_actual_date_principal_normalization.sql \
  supabase/migrations/20260827100000_qa_rights_account_alignment.sql \
  scripts/apply-qa-rights-account-alignment.sql \
  scripts/apply-qa-rights-account-manifest.sql \
  scripts/check-qa-rights-account-alignment.sql
```

Ghi thêm `git rev-parse HEAD` vào biên bản phát hành. Nếu SHA tích hợp cuối chưa có trong biên bản review độc lập thì dừng.

## 3. Chuẩn bị bí mật và kết nối

Tạo thủ công một file ngoài repository, ví dụ `/secure/vmp/qa-rights-account-ids.psql`, với đúng ba dòng `psql` sau và không thêm tên/email:

```text
\set khoa_id 'UUID_DA_DOI_CHIEU'
\set dat_id 'UUID_DA_DOI_CHIEU'
\set viewer_ids 'UUID_VIEWER_THU_NGHIEM_1,UUID_VIEWER_THU_NGHIEM_2'
```

Sau đó:

```bash
chmod 600 /secure/vmp/qa-rights-account-ids.psql
export PGSERVICEFILE='/secure/vmp/qa-rights-pg-service.conf'
export PGSERVICE='vmp_qa_alignment'
export QA_ALIGNMENT_ID_FILE='/secure/vmp/qa-rights-account-ids.psql'
export QA_ALIGNMENT_BACKUP_DIR='/secure/vmp/backups/qa-rights-2026-08-27'
chmod 600 "$PGSERVICEFILE"
umask 077
install -d -m 700 "$QA_ALIGNMENT_BACKUP_DIR"
```

`$PGSERVICEFILE` phải là file PostgreSQL service `0600` chứa host, port,
database, user, password và `sslmode=require` dưới section
`[vmp_qa_alignment]`. Không truyền URI chứa mật khẩu trên command line; các
lệnh dưới đây chỉ truyền tên service không nhạy cảm.

Không đưa URL, UUID, email, tên hoặc nội dung backup vào terminal log dùng chung, ticket công khai hay Git.

## 4. Preflight hoàn toàn chỉ đọc

Mở một kết nối mới. Đoạn dưới chỉ trả các số đếm và cờ boolean, không trả UUID, email hoặc tên:

```bash
psql "service=$PGSERVICE" -X -v ON_ERROR_STOP=1 \
  -f "$QA_ALIGNMENT_ID_FILE" <<'SQL'
begin read only;

with targets(kind,id) as (
  select 'khoa', :'khoa_id'::uuid
  union all select 'dat', :'dat_id'::uuid
  union all
  select 'viewer', btrim(value)::uuid
  from regexp_split_to_table(:'viewer_ids', ',') value
)
select jsonb_build_object(
  'target_count', count(*),
  'unique_target_count', count(distinct id),
  'profile_count', count(profile.id),
  'active_target_count', count(*) filter (where coalesce(profile.is_active,true))
)
from targets left join public.profiles profile on profile.id=targets.id;

select jsonb_build_object(
  'screen_mode', public.screen_access_mode(),
  'item_mode', public.item_permissions_mode(),
  'screen_matrix_rows', (select count(*) from public.vmp_screen_permissions),
  'viewer_matrix_rows', (select count(*) from public.vmp_screen_permissions
                         where business_role='viewer'),
  'active_admins', (select count(*) from public.profiles
                    where role::text='admin' and coalesce(is_active,true)),
  'active_viewers', (select count(*) from public.profiles
                     where role::text='viewer' and coalesce(is_active,true))
);

select jsonb_build_object(
  'active_items', count(*) filter (where is_active),
  'owner_person_items', count(*) filter (where is_active and owner_person_id is not null),
  'support_person_items', count(*) filter (where is_active and support_person_id is not null),
  'items_without_owner_or_support', count(*) filter (
    where is_active and owner_person_id is null and support_person_id is null),
  'assignment_rows', (select count(*) from public.vmp_item_assignments)
)
from public.vmp_plan_items;

select jsonb_build_object(
  'khoa_legacy_state', exists (
    select 1 from public.profiles profile
    join public.vmp_performers performer
      on performer.user_id=profile.id and performer.is_active
    where profile.id=:'khoa_id'::uuid and profile.role::text='department_user'
      and profile.department='QA' and coalesce(profile.is_active,true)
      and performer.access_class='qa_progress_editor'
      and performer.department='QA'),
  'dat_legacy_state', exists (
    select 1 from public.profiles profile
    join public.vmp_performers performer
      on performer.user_id=profile.id and performer.is_active
    where profile.id=:'dat_id'::uuid and profile.role::text='viewer'
      and profile.department='qc' and coalesce(profile.is_active,true)
      and performer.access_class is null and performer.department='qc'),
  'viewer_test_legacy_count', (
    select count(*) from public.profiles profile
    where profile.id=any(array(
      select btrim(value)::uuid from regexp_split_to_table(:'viewer_ids', ',') value))
      and profile.role::text='viewer' and coalesce(profile.is_active,true))
);

rollback;
SQL
```

Trạng thái đã review ngày 2026-08-27 là: bốn UUID duy nhất; 102 dòng ma trận, 17 dòng Viewer; ba Viewer hoạt động; Khoa ở trạng thái Nhân viên QA; Đạt là Viewer có performer `qc` và `access_class` rỗng; 461 hạng mục hoạt động; 281 có `owner_person_id`; 126 có `support_person_id`; 180 thiếu cả hai; bảng phân công có 0 dòng. Nếu khác, dừng và review lại manifest cũng như dữ liệu nguồn. Không sửa dữ liệu để ép preflight đạt.

## 5. Backup trước ghi

Backup chứa dữ liệu cá nhân và phải ở vùng mã hóa, quyền hạn chế:

```bash
pg_dump --dbname="service=$PGSERVICE" --format=custom --no-owner \
  --schema=public --schema=auth \
  --file="$QA_ALIGNMENT_BACKUP_DIR/pre-release.dump"

psql "service=$PGSERVICE" -X -v ON_ERROR_STOP=1 \
  -o "$QA_ALIGNMENT_BACKUP_DIR/function-definitions.txt" \
  -c "select p.oid::regprocedure, pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('vmp_business_role','vmp_item_rights','vmp_my_item_rights','vmp_allowed_timeline_fields','rpc_update_progress','rpc_refresh_source_item_assignments') order by p.oid::regprocedure::text"

pg_restore --list "$QA_ALIGNMENT_BACKUP_DIR/pre-release.dump" \
  >"$QA_ALIGNMENT_BACKUP_DIR/pre-release.list"
```

Xác nhận cả hai lệnh cuối exit 0. Không tiếp tục chỉ vì file backup có tồn tại.

## 6. Apply một lần sau phê duyệt riêng

Entrypoint chạy schema trước rồi mới chạy manifest bốn tài khoản:

```bash
psql "service=$PGSERVICE" -X -v ON_ERROR_STOP=1 \
  -f "$QA_ALIGNMENT_ID_FILE" \
  -f scripts/apply-qa-rights-account-alignment.sql \
  >"$QA_ALIGNMENT_BACKUP_DIR/apply.log" 2>&1
```

Ranh giới transaction phải được hiểu đúng:

- entrypoint bọc migration five-role trong transaction riêng vì migration đó dùng guard transaction-local; bốn migration schema sau tự sở hữu `BEGIN`/`COMMIT`, nên các migration đã commit trước không tự hoàn tác nếu migration sau lỗi;
- manifest bốn tài khoản, bốn audit và đúng một lần `rpc_refresh_source_item_assignments()` nằm trong một transaction riêng; lỗi ở bất kỳ bước nào trước `COMMIT` của manifest sẽ hoàn tác toàn bộ phần tài khoản/audit/phân công;
- `ON_ERROR_STOP` dừng ở lỗi đầu tiên; nó không biến chuỗi migration thành một transaction chung.

Nếu lệnh lỗi, không chạy tiếp checker, không tự chạy lại mù quáng và không dùng manifest bảy tài khoản. Chuyển sang mục 10.

## 7. Postflight trên kết nối mới

Không tái sử dụng connection apply:

```bash
psql "service=$PGSERVICE" -X -v ON_ERROR_STOP=1 \
  -f "$QA_ALIGNMENT_ID_FILE" \
  -f scripts/check-qa-rights-account-alignment.sql \
  >"$QA_ALIGNMENT_BACKUP_DIR/postflight.log" 2>&1
```

Checker tự mở `BEGIN READ ONLY`, xác minh và `ROLLBACK`. Tất cả marker sau phải có `PASS`:

- modes vẫn `enforced/preview`;
- ma trận 85 dòng, đúng năm vai, không còn Viewer hiệu lực;
- Khoa giải thành `qa_manager`;
- Đạt giải thành `workshop_staff` tại `qc`;
- hai Viewer thử nghiệm không hoạt động và không còn Viewer hoạt động;
- còn Admin hoạt động;
- quyền tám trường của Quản lý QA, bảy trường của Nhân viên QA, một trường của Nhân viên xưởng;
- owner/support hợp lệ được materialize, hạng mục thiếu cả hai không nhận phân công QA nguồn;
- Đạt không có quyền trên một hạng mục không được phân công;
- đúng bốn audit tài khoản và ACL bảo mật không mở rộng.

Nếu checker thiếu một persona có phân công để probe, không tự cấp phân công giả trên production. Dừng để người phụ trách nghiệp vụ chọn một hạng mục thật và phê duyệt phân công cụ thể qua đường quản trị hiện có, sau đó chạy lại checker.

## 8. Reload schema cache và persona probes

Chỉ sau khi checker đạt, yêu cầu PostgREST nạp lại metadata:

```bash
psql "service=$PGSERVICE" -X -v ON_ERROR_STOP=1 \
  -c "notify pgrst, 'reload schema'"
```

Đăng xuất mọi session cũ rồi mở session mới cho từng persona. Không dùng Admin để thay cho probe vai thấp hơn.

1. Quản lý QA: mở một hạng mục hoạt động bất kỳ; tám trường tiến độ mở, gồm Ngày thẩm định thực tế; lịch thẩm định kế hoạch và deadline vẫn không thuộc tám trường này.
2. Nhân viên QA: hạng mục có phân công mở đúng bảy trường; Ngày thẩm định thực tế bị khóa; hạng mục không phân công không cho ghi.
3. Nhân viên xưởng có phân công cụ thể: chỉ Ngày thẩm định thực tế mở; hạng mục không phân công không cho ghi.
4. Đạt: hiện đúng Nhân viên xưởng/`qc`, không nhận toàn bộ hạng mục QC chỉ vì bộ phận.
5. Hai Viewer thử nghiệm: login/session cũ không còn quyền và profile không xuất hiện trong danh sách tài khoản hoạt động.
6. Admin: vẫn có quyền và còn ít nhất một Admin hoạt động.

Kiểm Network: mọi ghi tiến độ đi qua RPC máy chủ; payload Nhân viên QA không có `actual_validation_date`. Thử payload trộn trường hợp lệ với `actual_validation_date` trên môi trường kiểm thử, không thử phá trên production.

## 9. Điều kiện giữ `preview`

Release này luôn giữ `item_permissions_mode = preview`. Sau refresh, chạy preflight quyền bằng đường quản trị hiện có và lưu kết quả vào biên bản. Chỉ lập một thay đổi khác để cân nhắc `enforced` khi đồng thời thỏa:

- mọi `owner_person_id`/`support_person_id` hợp lệ đã thành assignment canonical;
- 180 hạng mục thiếu cả hai đã được nghiệp vụ duyệt và phân công thủ công hoặc chấp nhận chưa có quyền Nhân viên QA;
- không còn blocker bảo mật/quyền trong preflight;
- persona probes và reviewer độc lập đạt;
- có phê duyệt production riêng cho việc đổi mode.

Không gộp phê duyệt hiệu chỉnh tài khoản với phê duyệt bật enforced.

## 10. Xử lý lỗi và rollback

### Lỗi trước commit của một migration schema

Migration đó tự rollback. Các migration trước có thể đã commit. Dừng, ghi lại migration cuối đạt, hash định nghĩa hàm/mode/matrix và lỗi đầu tiên. Sửa bằng forward migration đã review; không sửa migration cũ tại chỗ và không giả định toàn chuỗi đã rollback.

### Lỗi trong manifest tài khoản hoặc refresh phân công

Transaction manifest tự rollback cả Khoa, Đạt, hai Viewer, bốn audit và thay đổi phân công của lần gọi refresh. Mở kết nối mới, chạy lại preflight chỉ đọc để chứng minh hash/trạng thái tài khoản/phân công/audit không đổi. Chỉ chạy lại sau khi nguyên nhân đã được sửa và review.

### Lỗi sau commit manifest hoặc postflight

Không restore toàn database khi chưa đánh giá dữ liệu phát sinh sau release. Chuẩn bị một forward correction riêng từ backup đã khóa, chọn bằng đúng UUID, ghi audit và có phê duyệt riêng. Không mở lại Viewer, không cấp lại `actual_validation_date` cho Nhân viên QA và không hard-delete lịch sử.

Nếu chỉ một tài khoản bị chọn nhầm, khôi phục riêng profile/performer đó về snapshot trước release bằng RPC quản trị hoặc SQL forward đã review; không áp lại manifest exact-four cho một tập UUID khác. Nếu assignment nguồn sai, sửa nguồn `person_id`/resolution canonical rồi gọi refresh qua service path; không gán rộng theo `qc`.

### Schema đã commit nhưng manifest chưa commit

Five-role có thể đã loại Viewer khỏi resolver/ma trận trong khi ba profile Viewer cũ vẫn còn hoạt động nhưng không giải được vai. Đây là trạng thái dừng an toàn, không phải hoàn tất. Giữ `item_permissions_mode = preview`, chặn rollout UI nếu cần, sửa lỗi bằng forward change rồi hoàn tất manifest hoặc áp một kế hoạch khôi phục đã review. Không gọi entrypoint bảy tài khoản để “chữa nhanh”.

## 11. Bằng chứng bàn giao

Lưu trong vùng bảo mật, không commit dữ liệu production:

- phê duyệt riêng và SHA tích hợp cuối;
- output `sha256sum`;
- kết quả preflight chỉ đọc;
- danh sách backup và kiểm tra `pg_restore --list`;
- apply exit code và migration cuối đạt;
- postflight từ connection mới;
- kết quả reload schema cache;
- ảnh/chứng cứ persona probes không chứa dữ liệu nhạy cảm;
- kết quả preflight quyền sau refresh và quyết định giữ `preview`;
- review độc lập bảo mật và xác minh cuối của primary.
