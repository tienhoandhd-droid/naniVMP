-- =====================================================================
-- 20261021120000_va_bao_mat_ra_soat.sql — VÁ BẢO MẬT THEO RÀ SOÁT 21/10
-- ---------------------------------------------------------------------
-- Tám mục, đánh số theo phiếu giao việc. Không sửa/xoá dữ liệu, không đổi
-- công thức hay tiêu chí. Các hàm bên dưới chép nguyên văn từ production
-- (pg_get_functiondef trên bản sao 21/10), chỉ đổi đúng chỗ có ghi chú
-- "VÁ 21/10". CREATE OR REPLACE giữ owner, ACL, SECURITY DEFINER và
-- search_path; không đổi chữ ký hàm nào (không đụng chốt chan_overload_rpc).
-- Chạy lại nhiều lần cho cùng kết quả (idempotent).
--
--  1. vmp_is_active_session / vmp_can_manage_revalidation trả NULL cho tài
--     khoản đang hoạt động nhưng không giải được vai nghiệp vụ (view_only…).
--     "if not NULL" không chạy nhánh từ chối → lọt ~74 cổng. Bọc
--     coalesce(…, false) tận gốc; ba RPC tái thẩm định và hai RPC cảnh báo
--     đổi sang "is not true" cho chắc.
--  2. rpc_save_product_gmp / rpc_save_alert_recipient: khoá dòng FOR UPDATE
--     trước khi so version; bản ghi đã có thì BẮT BUỘC version.
--  3. rpc_upsert_object / rpc_upsert_source_row / rpc_delete_source_row
--     (web không còn gọi): thu hồi EXECUTE của anon/authenticated/PUBLIC.
--     CHECK frequency_months 1..120 (NOT VALID, chỉ VALIDATE khi dữ liệu thoả).
--  4. rpc_update_progress: mọi trường ngày phải đúng định dạng (không
--     khoảng trắng, không epoch/infinity) và trong 01/01/2020 … hôm nay + 1 năm.
--     Version CHƯA bắt buộc vì web chưa luôn gửi (ProgressEditModal gửi
--     undefined khi thiếu version).
--  5. Bỏ quyền ghi thẳng (REST) vào vmp_deadline_rules, vmp_report_snapshots,
--     vmp_notifications, departments. Đọc giữ nguyên. Web không ghi các bảng
--     này; n8n ghi bằng kết nối postgres (chủ bảng) nên không bị ảnh hưởng.
--  6. rpc_create_plan_item: năm 2020..2100; loại thẩm định thuộc 8 loại
--     đang có trong dữ liệu và ValidationType (src/types/domain.ts).
--  7. 16 policy SELECT "cho tất cả" (USING true) thêm điều kiện phiên hoạt
--     động: tài khoản đã tắt không đọc được nữa. service_role (BYPASSRLS) và
--     postgres (chủ bảng) không qua RLS nên không đổi.
--  8. rpc_due_alerts / rpc_check_data_quality: vai xưởng chỉ nhận hạng mục
--     trong phạm vi đọc (vmp_can_view_plan_item — đúng hàm policy của
--     vmp_plan_items). Admin, Quản lý QA, QA và kết nối n8n không đổi.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Cổng phiên không được trả NULL
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.vmp_is_active_session(p_uid uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- VÁ 21/10: coalesce — vai nghiệp vụ NULL phải ra false, không ra NULL.
  select coalesce(
    p_uid is not null
     and exists (
       select 1 from public.profiles p
       where p.id = p_uid and coalesce(p.is_active, true)
         and p.role::text <> 'viewer'
     )
     and public.vmp_business_role(p_uid) in
       ('admin','qa_manager','qa_staff','workshop_manager','workshop_staff'),
    false)
$function$;

CREATE OR REPLACE FUNCTION public.vmp_can_manage_revalidation()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- VÁ 21/10: coalesce — không bao giờ trả NULL.
  select coalesce(
    coalesce(auth.role(), '') in ('', 'service_role')
    or (
      public.vmp_is_active_session(auth.uid())
      and public.vmp_business_role(auth.uid()) in ('admin', 'qa_manager')
    ),
    false)
$function$;

-- Ba RPC tái thẩm định: chép nguyên văn, chỉ đổi cổng quyền.

CREATE OR REPLACE FUNCTION public.rpc_refresh_revalidation_proposals(p_as_of date DEFAULT ((now() AT TIME ZONE 'Asia/Bangkok'::text))::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_created integer := 0;
  v_obsolete integer := 0;
  v_unchanged integer := 0;
begin
  -- VÁ 21/10: "is not true" — NULL cũng phải bị từ chối.
  if public.vmp_can_manage_revalidation() is not true then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  if p_as_of is null then
    raise exception using errcode = '22004', message = 'AS_OF_REQUIRED';
  end if;

  with current_cycles as materialized (
    select
      item.id as plan_item_id,
      item.validation_code,
      item.object_code,
      item.validation_type,
      item.actual_vmp_date as actual_completed_date,
      source.frequency_months,
      (item.actual_vmp_date + make_interval(months => source.frequency_months))::date as due_date
    from public.vmp_plan_items item
    join public.vmp_source_objects source
      on source.object_code = item.object_code and source.is_active
    where item.is_active
      and coalesce(item.item_state, 'active') = 'active'
      and item.actual_vmp_date is not null
      and source.frequency_months between 1 and 120
  )
  update public.vmp_revalidation_proposals proposal
  set status = 'obsolete',
      version = proposal.version + 1,
      updated_at = now()
  where proposal.status = 'pending'
    and not exists (
      select 1 from current_cycles cycle
      where cycle.plan_item_id = proposal.plan_item_id
        and cycle.due_date = proposal.due_date
    );
  get diagnostics v_obsolete = row_count;

  with current_cycles as materialized (
    select
      item.id as plan_item_id,
      item.validation_code,
      item.object_code,
      item.validation_type,
      item.actual_vmp_date as actual_completed_date,
      source.frequency_months,
      (item.actual_vmp_date + make_interval(months => source.frequency_months))::date as due_date
    from public.vmp_plan_items item
    join public.vmp_source_objects source
      on source.object_code = item.object_code and source.is_active
    where item.is_active
      and coalesce(item.item_state, 'active') = 'active'
      and item.actual_vmp_date is not null
      and source.frequency_months between 1 and 120
  )
  insert into public.vmp_revalidation_proposals(
    plan_item_id, validation_code, object_code, validation_type,
    actual_completed_date, frequency_months, due_date
  )
  select
    cycle.plan_item_id, cycle.validation_code, cycle.object_code, cycle.validation_type,
    cycle.actual_completed_date, cycle.frequency_months, cycle.due_date
  from current_cycles cycle
  on conflict (plan_item_id, due_date) do nothing;
  get diagnostics v_created = row_count;

  select count(*) - v_created into v_unchanged
  from public.vmp_revalidation_proposals proposal
  join public.vmp_plan_items item on item.id = proposal.plan_item_id
  join public.vmp_source_objects source
    on source.object_code = item.object_code and source.is_active
  where item.is_active
    and coalesce(item.item_state, 'active') = 'active'
    and item.actual_vmp_date is not null
    and source.frequency_months between 1 and 120
    and proposal.due_date = (
      item.actual_vmp_date + make_interval(months => source.frequency_months)
    )::date;

  return jsonb_build_object(
    'ok', true,
    'as_of', p_as_of,
    'created', v_created,
    'unchanged', greatest(v_unchanged, 0),
    'obsolete', v_obsolete
  );
end
$function$;

CREATE OR REPLACE FUNCTION public.rpc_dismiss_revalidation_proposal(p_proposal_id uuid, p_reason text, p_expected_version integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_current public.vmp_revalidation_proposals%rowtype;
begin
  -- VÁ 21/10: "is not true" — NULL cũng phải bị từ chối.
  if public.vmp_can_manage_revalidation() is not true then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 5 then
    return jsonb_build_object('ok', false, 'error_code', 'REASON_REQUIRED');
  end if;
  select * into v_current from public.vmp_revalidation_proposals
  where id = p_proposal_id for update;
  if not found then return jsonb_build_object('ok', false, 'error_code', 'NOT_FOUND'); end if;
  if v_current.version <> p_expected_version then
    return jsonb_build_object('ok', false, 'error_code', 'VERSION_CONFLICT', 'current_version', v_current.version);
  end if;
  if v_current.status <> 'pending' then
    return jsonb_build_object('ok', false, 'error_code', 'NOT_PENDING');
  end if;
  update public.vmp_revalidation_proposals
  set status = 'dismissed', version = version + 1,
      decision_reason = btrim(p_reason), decided_by = auth.uid(),
      decided_at = now(), updated_at = now()
  where id = p_proposal_id;
  return jsonb_build_object('ok', true, 'proposal_id', p_proposal_id, 'version', v_current.version + 1);
end
$function$;

CREATE OR REPLACE FUNCTION public.rpc_confirm_revalidation_proposal(p_proposal_id uuid, p_reason text, p_expected_version integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_proposal public.vmp_revalidation_proposals%rowtype;
  v_occurrence integer;
  v_create jsonb;
  v_code text;
begin
  -- VÁ 21/10: "is not true" — NULL cũng phải bị từ chối.
  if public.vmp_can_manage_revalidation() is not true then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  if p_proposal_id is null or p_expected_version is null then
    return jsonb_build_object('ok', false, 'error_code', 'INVALID_INPUT');
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 5 then
    return jsonb_build_object('ok', false, 'error_code', 'REASON_REQUIRED');
  end if;

  select * into v_proposal
  from public.vmp_revalidation_proposals
  where id = p_proposal_id
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'error_code', 'NOT_FOUND');
  end if;
  if v_proposal.version <> p_expected_version then
    return jsonb_build_object(
      'ok', false, 'error_code', 'VERSION_CONFLICT',
      'current_version', v_proposal.version
    );
  end if;
  if v_proposal.status <> 'pending' then
    return jsonb_build_object('ok', false, 'error_code', 'NOT_PENDING');
  end if;

  select count(*) + 1 into v_occurrence
  from public.vmp_plan_items
  where object_code = v_proposal.object_code
    and validation_type = v_proposal.validation_type
    and year = extract(year from v_proposal.due_date)::integer;
  if v_occurrence > 99 then
    return jsonb_build_object('ok', false, 'error_code', 'OCCURRENCE_LIMIT');
  end if;

  v_create := public.rpc_create_plan_item(
    v_proposal.object_code,
    v_proposal.validation_type,
    extract(year from v_proposal.due_date)::integer,
    v_occurrence,
    '{}'::jsonb
  );
  if coalesce((v_create->>'ok')::boolean, false) is not true then
    return jsonb_build_object(
      'ok', false, 'error_code', 'CREATE_FAILED',
      'error', coalesce(v_create->>'error', 'Không thể tạo hạng mục')
    );
  end if;
  v_code := v_create->>'validation_code';

  update public.vmp_revalidation_proposals
  set status = 'confirmed',
      version = version + 1,
      created_plan_validation_code = v_code,
      decision_reason = btrim(p_reason),
      decided_by = auth.uid(),
      decided_at = now(),
      updated_at = now()
  where id = v_proposal.id;

  insert into public.audit_logs(
    user_id, action, table_name, record_id, new_data,
    change_reason, source, validation_code, effective_business_role
  ) values (
    auth.uid(), 'APPROVAL', 'vmp_revalidation_proposals', v_proposal.id::text,
    jsonb_build_object(
      'proposal_id', v_proposal.id,
      'source_validation_code', v_proposal.validation_code,
      'created_validation_code', v_code,
      'due_date', v_proposal.due_date
    ),
    btrim(p_reason), 'dashboard', v_proposal.validation_code,
    coalesce(public.vmp_business_role(auth.uid()), 'service_role')
  );

  return jsonb_build_object(
    'ok', true,
    'proposal_id', v_proposal.id,
    'validation_code', v_code,
    'version', v_proposal.version + 1
  );
end
$function$;

-- ---------------------------------------------------------------------
-- 2. Khoá lạc quan sản phẩm GMP và người nhận cảnh báo
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_save_product_gmp__five_role_impl_20260824(p_bfo_code text, p_patch jsonb, p_reason text DEFAULT NULL::text, p_expected_version integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_role  text := public.vmp_business_role(auth.uid());
  v_patch jsonb := coalesce(p_patch, '{}'::jsonb);
  v_bad   text[];
  v_hien  public.vmp_products_gmp%rowtype;
  v_ket   jsonb;
  v_ver   integer;
  -- VÁ 21/10: rpc_upsert_product_gmp ghi theo mã đã btrim, nên đọc/khoá
  -- cũng phải theo mã đã btrim — không thì " X" bỏ qua được kiểm version.
  v_code  text := nullif(btrim(p_bfo_code), '');
begin
  -- Quyền hỏi resolver, không đọc bảng ma trận màn hình: bảng đó sửa
  -- được lúc chạy nên không thể là nguồn chân lý của quyền ghi.
  if coalesce(auth.role(), '') <> 'service_role'
     and v_role is distinct from 'admin'
     and v_role is distinct from 'qa_manager' then
    return jsonb_build_object('ok', false, 'error_code', 'FORBIDDEN',
      'error', 'Chỉ Admin và Quản lý QA được sửa danh mục sản phẩm GMP');
  end if;

  -- Khoá lạ là dấu hiệu client gửi sai, không phải thứ nên bỏ qua im lặng.
  select array_agg(key order by key) into v_bad
  from jsonb_object_keys(v_patch) key
  where key <> all(array[
    'product_name', 'ingredients', 'strength', 'production_line',
    'dosage_form', 'primary_pack', 'batch_size', 'note',
    'mixing_tank', 'final_batch_size', 'is_active'
  ]::text[]);
  if v_bad is not null then
    return jsonb_build_object('ok', false, 'error_code', 'PATCH_FIELD_NOT_ALLOWED',
      'error', 'Trường không được phép sửa: ' || array_to_string(v_bad, ', '));
  end if;

  -- VÁ 21/10: hai người lưu cùng lúc phải xếp hàng. Khoá tư vấn theo mã chặn
  -- cả trường hợp hai người cùng TẠO một mã; FOR UPDATE khoá dòng đã có.
  -- Người đến sau đọc lại version mới nhất và nhận VERSION_CONFLICT.
  perform pg_advisory_xact_lock(hashtextextended('vmp_products_gmp:' || coalesce(v_code, ''), 0));
  select * into v_hien from public.vmp_products_gmp where bfo_code = v_code for update;

  -- VÁ 21/10: sửa bản ghi đã có thì bắt buộc gửi version. Web luôn gửi
  -- version khi sửa; không có version nghĩa là đang TẠO một mã đã tồn tại.
  if v_hien.id is not null and p_expected_version is null then
    return jsonb_build_object('ok', false, 'error_code', 'VERSION_REQUIRED',
      'error', 'Mã đã tồn tại — tải lại để sửa bản hiện có.',
      'current_version', v_hien.version);
  end if;

  if v_hien.id is not null
     and v_hien.version is distinct from p_expected_version then
    return jsonb_build_object('ok', false, 'error_code', 'VERSION_CONFLICT',
      'error', 'Bản ghi đã được người khác sửa. Tải lại để xem thay đổi rồi lưu lại.',
      'current_version', v_hien.version);
  end if;

  -- Ngừng hoạt động một sản phẩm là quyết định có hệ quả: mọi báo cáo sau
  -- đó sẽ không còn nó. Phải nói vì sao.
  if v_hien.id is not null
     and (v_patch ? 'is_active')
     and coalesce((v_patch ->> 'is_active')::boolean, true) is false
     and nullif(btrim(coalesce(p_reason, '')), '') is null then
    return jsonb_build_object('ok', false, 'error_code', 'REASON_REQUIRED',
      'error', 'Ngừng hoạt động một sản phẩm thì phải nhập lý do');
  end if;

  -- Dùng lại đường ghi đã có: giữ nguyên chuẩn hoá và ràng buộc sẵn có,
  -- không chép luật sang đây.
  v_ket := public.rpc_upsert_product_gmp(p_bfo_code, v_patch);
  if coalesce((v_ket ->> 'ok')::boolean, false) is not true then
    return v_ket;
  end if;

  update public.vmp_products_gmp
  set version = coalesce(version, 1) + 1
  where bfo_code = v_code
  returning version into v_ver;

  insert into public.audit_logs (
    id, user_id, action, table_name, record_id,
    old_data, new_data, change_reason, source, effective_business_role)
  values (
    gen_random_uuid(), v_actor,
    (case when v_hien.id is null then 'INSERT' else 'UPDATE' end)::audit_action,
    'vmp_products_gmp', p_bfo_code,
    to_jsonb(v_hien), v_patch,
    nullif(btrim(coalesce(p_reason, '')), ''), 'rpc_save_product_gmp', v_role);

  return jsonb_build_object('ok', true, 'bfo_code', p_bfo_code, 'version', v_ver);
end
$function$;

CREATE OR REPLACE FUNCTION public.rpc_save_alert_recipient__five_role_impl_20260824(p_id uuid, p_patch jsonb, p_reason text DEFAULT NULL::text, p_expected_version integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_role  text := public.vmp_business_role(auth.uid());
  v_patch jsonb := coalesce(p_patch, '{}'::jsonb);
  v_bad   text[];
  v_hien  public.vmp_alert_recipients%rowtype;
  v_ket   jsonb;
  v_ver   integer;
  v_id    uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and v_role is distinct from 'admin'
     and v_role is distinct from 'qa_manager' then
    return jsonb_build_object('ok', false, 'error_code', 'FORBIDDEN',
      'error', 'Chỉ Admin và Quản lý QA được sửa danh sách nhận cảnh báo');
  end if;

  select array_agg(key order by key) into v_bad
  from jsonb_object_keys(v_patch) key
  where key <> all(array[
    'is_enabled', 'scope_type', 'scope', 'email', 'recipient_name',
    'alert_kind', 'threshold_days', 'note',
    'ai_report_enabled', 'ai_report_schedule'
  ]::text[]);
  if v_bad is not null then
    return jsonb_build_object('ok', false, 'error_code', 'PATCH_FIELD_NOT_ALLOWED',
      'error', 'Trường không được phép sửa: ' || array_to_string(v_bad, ', '));
  end if;

  -- VÁ 21/10: khoá dòng trước khi so version (hai người lưu cùng lúc).
  if p_id is not null then
    select * into v_hien from public.vmp_alert_recipients where id = p_id for update;
  end if;

  -- VÁ 21/10: sửa bản ghi đã có thì bắt buộc gửi version.
  if v_hien.id is not null and p_expected_version is null then
    return jsonb_build_object('ok', false, 'error_code', 'VERSION_REQUIRED',
      'error', 'Thiếu phiên bản của bản ghi. Tải lại rồi lưu lại.',
      'current_version', v_hien.version);
  end if;

  if v_hien.id is not null
     and v_hien.version is distinct from p_expected_version then
    return jsonb_build_object('ok', false, 'error_code', 'VERSION_CONFLICT',
      'error', 'Bản ghi đã được người khác sửa. Tải lại để xem thay đổi rồi lưu lại.',
      'current_version', v_hien.version);
  end if;

  -- Tắt một người nhận nghĩa là từ nay họ không nhận cảnh báo quá hạn
  -- nữa. Đó là thứ cần giải thích được về sau.
  if v_hien.id is not null
     and (v_patch ? 'is_enabled')
     and coalesce((v_patch ->> 'is_enabled')::boolean, true) is false
     and nullif(btrim(coalesce(p_reason, '')), '') is null then
    return jsonb_build_object('ok', false, 'error_code', 'REASON_REQUIRED',
      'error', 'Tắt một người nhận cảnh báo thì phải nhập lý do');
  end if;

  v_ket := public.rpc_upsert_alert_recipient(p_id, v_patch);
  if coalesce((v_ket ->> 'ok')::boolean, false) is not true then
    return v_ket;
  end if;

  v_id := coalesce(p_id, nullif(v_ket ->> 'id', '')::uuid);

  update public.vmp_alert_recipients
  set version = coalesce(version, 1) + 1
  where id = v_id
  returning version into v_ver;

  insert into public.audit_logs (
    id, user_id, action, table_name, record_id,
    old_data, new_data, change_reason, source, effective_business_role)
  values (
    gen_random_uuid(), v_actor,
    (case when v_hien.id is null then 'INSERT' else 'UPDATE' end)::audit_action,
    'vmp_alert_recipients', v_id::text,
    to_jsonb(v_hien), v_patch,
    nullif(btrim(coalesce(p_reason, '')), ''), 'rpc_save_alert_recipient', v_role);

  return jsonb_build_object('ok', true, 'id', v_id, 'version', v_ver);
end
$function$;

-- ---------------------------------------------------------------------
-- 3. Ba RPC ghi cũ: web không còn gọi (đã grep src/public/scripts/n8n).
--    Giữ cho service_role và postgres.
-- ---------------------------------------------------------------------
revoke execute on function public.rpc_upsert_object(text,text,text,text,text,text,integer,text) from public, anon, authenticated;
revoke execute on function public.rpc_upsert_source_row(text,integer,jsonb) from public, anon, authenticated;
revoke execute on function public.rpc_delete_source_row(text,integer) from public, anon, authenticated;
grant execute on function public.rpc_upsert_object(text,text,text,text,text,text,integer,text) to service_role;
grant execute on function public.rpc_upsert_source_row(text,integer,jsonb) to service_role;
grant execute on function public.rpc_delete_source_row(text,integer) to service_role;

-- Tần suất tái thẩm định 1..120 tháng (đúng khoảng rpc_refresh_revalidation_
-- proposals đang dùng). NOT VALID trước; chỉ VALIDATE khi dữ liệu hiện có
-- đều thoả — KHÔNG sửa dữ liệu. Không thoả thì báo NOTICE và để NOT VALID
-- (vẫn chặn mọi ghi mới).
do $$
declare
  r record;
  v_sai bigint;
begin
  for r in select * from (values
    ('public.vmp_objects', 'vmp_objects_frequency_months_range'),
    ('public.vmp_source_objects', 'vmp_source_objects_frequency_months_range')) v(bang, ten)
  loop
    if not exists (select 1 from pg_constraint
                   where conrelid = r.bang::regclass and conname = r.ten) then
      execute format('alter table %s add constraint %I check (frequency_months between 1 and 120) not valid',
                     r.bang, r.ten);
    end if;
    if exists (select 1 from pg_constraint
               where conrelid = r.bang::regclass and conname = r.ten and not convalidated) then
      execute format('select count(*) from %s where not (frequency_months between 1 and 120)', r.bang)
        into v_sai;
      if v_sai = 0 then
        execute format('alter table %s validate constraint %I', r.bang, r.ten);
      else
        raise notice '% còn % dòng tần suất ngoài 1..120: giữ % ở trạng thái NOT VALID, không sửa dữ liệu',
          r.bang, v_sai, r.ten;
      end if;
    end if;
  end loop;
end
$$;

-- ---------------------------------------------------------------------
-- 4. rpc_update_progress: chặn ngày ngoài khoảng (wrapper, trước mọi khoá)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_update_progress(p_validation_code text, p_patch jsonb, p_reason text DEFAULT NULL::text, p_sheet_patch jsonb DEFAULT NULL::jsonb, p_expected_version integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_actor uuid:=auth.uid();
  v_role text:=public.vmp_business_role(auth.uid());
  v_person_id uuid;
  v_source_id uuid;
  v_item_id text;
  v_hom_nay date:=(now() at time zone 'Asia/Bangkok')::date;
  v_tran date;
  v_khoa text;
  v_gia_tri jsonb;
  v_chu text;
  v_ngay date;
  v_sai_dang text[]:='{}';
  v_ngoai_khoang text[]:='{}';
begin
  if coalesce(auth.role(),'') not in ('','service_role')
     and public.vmp_is_active_session(v_actor) is not true then
    return public.vmp_session_denial();
  end if;

  -- VÁ 21/10: kiểm MỌI trường ngày mà hàm cài đặt bên dưới nhận
  -- (4 ngày thực tế + scheduled_at; scheduled_date là tên cũ của
  -- scheduled_at). Bỏ qua null/chuỗi rỗng (xoá ngày). Còn lại phải:
  --  · ngày thực tế: đúng 'YYYY-MM-DD' (web gửi đúng dạng này từ ô date);
  --  · lịch: 'YYYY-MM-DD', ISO 'YYYY-MM-DDTHH:MM[:SS[.ffffff]][Z|±HH[:MM]]'
  --    (web gửi toISOString()) hoặc 'dd/mm/yyyy[ hh:mm[:ss]]' — đúng các dạng
  --    vmp_parse_scheduled_at ghi nhận; không khoảng trắng thừa, không
  --    'epoch'/'infinity';
  -- rồi ngày (theo lịch Bangkok) nằm trong 01/01/2020 … hôm nay + 1 năm.
  v_tran := (v_hom_nay + interval '1 year')::date;
  if jsonb_typeof(p_patch)='object' then
    for v_khoa, v_gia_tri in
      select k.key, k.value from jsonb_each(p_patch) k
      where k.key in ('actual_protocol_date','actual_validation_date',
                      'actual_report_date','actual_vmp_date',
                      'scheduled_at','scheduled_date')
      order by k.key
    loop
      continue when jsonb_typeof(v_gia_tri)='null'
        or (jsonb_typeof(v_gia_tri)='string' and v_gia_tri #>> '{}' = '');
      v_chu := case when jsonb_typeof(v_gia_tri)='string' then v_gia_tri #>> '{}' end;
      v_ngay := null;
      if v_chu is null then
        null;  -- số/boolean/object: sai định dạng (ghi nhận bên dưới)
      elsif v_khoa like 'actual\_%' then
        if v_chu ~ '^\d{4}-\d{2}-\d{2}$' and pg_input_is_valid(v_chu,'date') then
          v_ngay := v_chu::date;
        end if;
      elsif v_chu ~ '^\d{4}-\d{2}-\d{2}$'
         or v_chu ~ '^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}(:?\d{2})?)?$'
         or v_chu ~ '^\d{1,2}/\d{1,2}/\d{4}( \d{1,2}:\d{2}(:\d{2})?)?$' then
        begin
          v_ngay := (public.vmp_parse_scheduled_at(v_chu) at time zone 'Asia/Bangkok')::date;
        exception when others then
          -- Ngày/giờ không tồn tại (vd 30/02): ghi vào danh sách sai định
          -- dạng và trả lỗi cho người dùng ngay bên dưới.
          v_ngay := null;
        end;
      end if;
      if v_ngay is null then
        v_sai_dang := v_sai_dang || v_khoa;
      elsif v_ngay < date '2020-01-01' or v_ngay > v_tran then
        v_ngoai_khoang := v_ngoai_khoang || v_khoa;
      end if;
    end loop;
  end if;
  if cardinality(v_sai_dang) > 0 then
    return jsonb_build_object('ok',false,'code','ngay_sai_dinh_dang',
      'error','Ngày không đúng định dạng (cần năm-tháng-ngày, ví dụ 2026-10-21) — trường: '
        || array_to_string(v_sai_dang, ', '));
  end if;
  if cardinality(v_ngoai_khoang) > 0 then
    return jsonb_build_object('ok',false,'code','ngay_ngoai_khoang',
      'error','Ngày phải từ 01/01/2020 đến '
        || to_char(v_tran,'DD/MM/YYYY')
        || ' (trường: ' || array_to_string(v_ngoai_khoang, ', ') || ')');
  end if;

  select source_object.id into v_source_id
  from public.vmp_plan_items item
  join public.vmp_objects master_object
    on master_object.code=item.object_code
  join public.vmp_source_objects source_object
    on source_object.object_code=master_object.code
   and source_object.is_active is true
  where item.validation_code=p_validation_code and item.is_active is true
  for key share of source_object;
  if not found then
    return jsonb_build_object('ok',false,'code','item_field_forbidden',
      'error','Hạng mục không có đúng một Source hoạt động',
      'forbidden_fields',coalesce((select jsonb_agg(key order by key)
        from jsonb_object_keys(coalesce(p_patch,'{}'::jsonb)) key),'[]'::jsonb),
      'allowed_fields','[]'::jsonb);
  end if;

  select performer.id into v_person_id
  from public.vmp_performers performer
  where performer.user_id=v_actor and performer.is_active;

  if v_role in ('workshop_manager','workshop_staff') then
    perform 1
    from public.vmp_source_workshop_scope_grants grant_row
    join public.vmp_source_objects source_object on source_object.id=v_source_id
    where grant_row.performer_id=v_person_id and grant_row.is_active
      and grant_row.valid_from<=transaction_timestamp()
      and (grant_row.expires_at is null
           or grant_row.expires_at>transaction_timestamp())
      and public.vmp_source_scope_key(source_object.department)=
          grant_row.department_key
      and public.vmp_source_scope_key(source_object.area_code)=grant_row.area_key
      and (grant_row.line_key is null or
           public.vmp_source_scope_key(source_object.line)=grant_row.line_key)
    order by grant_row.id for share of grant_row;
  end if;

  select item.id into v_item_id
  from public.vmp_plan_items item
  where item.validation_code=p_validation_code and item.is_active is true
  for update;
  if not found then
    return jsonb_build_object('ok',false,'code','item_field_forbidden',
      'error','Hạng mục không còn hoạt động',
      'forbidden_fields','[]'::jsonb,'allowed_fields','[]'::jsonb);
  end if;

  if v_role in ('workshop_manager','workshop_staff') then
    perform 1 from public.vmp_item_assignments assignment
    where assignment.validation_code=p_validation_code
      and assignment.performer_id=v_person_id
      and assignment.assignment_kind='equipment_department'
      and assignment.is_active
      and (assignment.expires_at is null
           or assignment.expires_at>transaction_timestamp())
    order by assignment.id for share;
  end if;

  return public.rpc_update_progress__assigned_impl_20260827(
    p_validation_code,p_patch,p_reason,p_sheet_patch,p_expected_version);
end
$function$;

-- ---------------------------------------------------------------------
-- 5. Không ghi thẳng qua REST vào 4 bảng (đọc giữ nguyên)
-- ---------------------------------------------------------------------
revoke insert, update, delete on table public.vmp_deadline_rules from public, anon, authenticated;
revoke insert, update, delete on table public.vmp_report_snapshots from public, anon, authenticated;
revoke insert, update, delete on table public.vmp_notifications from public, anon, authenticated;
revoke insert, update, delete on table public.departments from public, anon, authenticated;
-- Policy ghi không còn dùng: bỏ để lỡ có GRANT lại thì cũng không mở cửa.
drop policy if exists dl_rules_modify on public.vmp_deadline_rules;
drop policy if exists snapshot_insert on public.vmp_report_snapshots;
drop policy if exists snapshot_update on public.vmp_report_snapshots;
drop policy if exists notif_insert on public.vmp_notifications;
drop policy if exists dept_insert on public.departments;
drop policy if exists dept_update on public.departments;
drop policy if exists dept_delete on public.departments;

-- ---------------------------------------------------------------------
-- 6. rpc_create_plan_item: kiểm năm và loại thẩm định
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_create_plan_item__five_role_impl_20260824(p_object_code text, p_validation_type text, p_year integer DEFAULT NULL::integer, p_occurrence integer DEFAULT 1, p_patch jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_role text;
  v_year integer := coalesce(p_year, extract(year from now())::integer);
  v_code text;
  v_res  jsonb;
begin
  select role into v_role from profiles where id = auth.uid();
  if v_role is null then
    return jsonb_build_object('ok', false, 'error', 'Không xác định được người dùng');
  end if;
  if not public.duoc_phep('edit_catalog', v_role::text) then
    return jsonb_build_object('ok', false, 'error', 'Chỉ admin hoặc QA được thêm hạng mục');
  end if;
  if nullif(btrim(coalesce(p_object_code,'')),'') is null
     or nullif(btrim(coalesce(p_validation_type,'')),'') is null then
    return jsonb_build_object('ok', false, 'error', 'Thiếu mã đối tượng hoặc loại thẩm định');
  end if;
  -- VÁ 21/10: năm kế hoạch hợp lý.
  if v_year < 2020 or v_year > 2100 then
    return jsonb_build_object('ok', false, 'error', 'Năm phải trong khoảng 2020..2100');
  end if;
  -- VÁ 21/10: đúng 8 loại đang có trong vmp_plan_items và ValidationType
  -- (src/types/domain.ts). Thêm loại mới thì sửa cả hai nơi.
  if btrim(p_validation_type) <> all(array['DQ','FAT/SAT','IQ','OQ','PQ','PV','GSP','GDP']) then
    return jsonb_build_object('ok', false, 'error',
      'Loại thẩm định không hợp lệ (DQ, FAT/SAT, IQ, OQ, PQ, PV, GSP, GDP)');
  end if;
  if p_occurrence < 1 or p_occurrence > 99 then
    return jsonb_build_object('ok', false, 'error', 'Lần thẩm định phải trong khoảng 1..99');
  end if;
  if not exists (select 1 from public.vmp_objects where code = btrim(p_object_code)) then
    return jsonb_build_object('ok', false, 'error',
      'Chưa có đối tượng "' || btrim(p_object_code) || '" trong danh mục');
  end if;

  v_code := btrim(p_object_code) || '/' || v_year::text || '.'
            || lpad(p_occurrence::text, 2, '0') || '-' || btrim(p_validation_type);

  if exists (select 1 from public.vmp_plan_items where validation_code = v_code) then
    return jsonb_build_object('ok', false, 'error', 'Mã thẩm định đã tồn tại: ' || v_code);
  end if;

  insert into public.vmp_plan_items (
    id, validation_code, object_code, validation_type, year, created_by, updated_by)
  values (v_code, v_code, btrim(p_object_code), btrim(p_validation_type), v_year,
          auth.uid(), auth.uid());

  if p_patch is not null and p_patch <> '{}'::jsonb then
    v_res := public.rpc_update_progress(v_code, p_patch, 'Tạo hạng mục mới từ dashboard');
    if (v_res ->> 'ok')::boolean is not true then
      raise exception 'Tạo được hạng mục nhưng cập nhật chi tiết thất bại: %', v_res ->> 'error';
    end if;
  end if;

  return jsonb_build_object('ok', true, 'validation_code', v_code, 'msg', 'Đã tạo hạng mục');
end;
$function$;

-- ---------------------------------------------------------------------
-- 7. Policy đọc "cho tất cả" chỉ cho phiên đang hoạt động.
--    ALTER POLICY giữ tên, lệnh, vai; (select …) để tính một lần/truy vấn.
-- ---------------------------------------------------------------------
alter policy dept_select on public.departments using ((select public.vmp_current_session_is_active()));
alter policy vmp_ai_bi_danh_doc on public.vmp_ai_bi_danh using ((select public.vmp_current_session_is_active()));
alter policy bo_kiem_doc on public.vmp_ai_bo_kiem using ((select public.vmp_current_session_is_active()));
alter policy chv_doc on public.vmp_ai_cau_hoi_vang using ((select public.vmp_current_session_is_active()));
alter policy dong_nghia_doc on public.vmp_ai_dong_nghia using ((select public.vmp_current_session_is_active()));
alter policy giong_doc on public.vmp_ai_giong using ((select public.vmp_current_session_is_active()));
alter policy mo_hinh_doc on public.vmp_ai_mo_hinh using ((select public.vmp_current_session_is_active()));
alter policy assignment_rules_select on public.vmp_assignment_rules using ((select public.vmp_current_session_is_active()));
alter policy vmp_chat_giong_doc on public.vmp_chat_giong using ((select public.vmp_current_session_is_active()));
alter policy dg_ah_doc on public.vmp_danh_gia_anh_huong using ((select public.vmp_current_session_is_active()));
alter policy dl_rules_select on public.vmp_deadline_rules using ((select public.vmp_current_session_is_active()));
alter policy diem_cu_doc on public.vmp_diem_truoc_khi_doi using ((select public.vmp_current_session_is_active()));
alter policy kb_chunks_read on public.vmp_kb_chunks using ((select public.vmp_current_session_is_active()));
alter policy kb_docs_read on public.vmp_kb_documents using ((select public.vmp_current_session_is_active()));
alter policy obj_select on public.vmp_objects using ((select public.vmp_current_session_is_active()));
alter policy role_permissions_select on public.vmp_role_permissions using ((select public.vmp_current_session_is_active()));

-- ---------------------------------------------------------------------
-- 8. Cảnh báo hạn / lỗi dữ liệu theo phạm vi đọc của người gọi
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_due_alerts(p_year integer DEFAULT (EXTRACT(year FROM now()))::integer, p_soon_days integer DEFAULT 7)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_ket jsonb;
begin
  if coalesce(auth.role(), '') not in ('', 'service_role')
     and public.vmp_is_active_session(auth.uid()) is not true then
    return public.vmp_session_denial();
  end if;
  v_ket := public.rpc_due_alerts__five_role_impl_20260824(p_year, p_soon_days);
  -- VÁ 21/10: n8n (không JWT), service_role, Admin, Quản lý QA, QA giữ
  -- nguyên danh sách. Vai xưởng chỉ nhận hạng mục đọc được theo
  -- vmp_can_view_plan_item — cùng hàm với policy của vmp_plan_items.
  if coalesce(auth.role(), '') in ('', 'service_role')
     or public.vmp_business_role(auth.uid()) in ('admin', 'qa_manager', 'qa_staff') then
    return v_ket;
  end if;
  return coalesce((
    select jsonb_agg(x.value order by x.ordinality)
    from jsonb_array_elements(v_ket) with ordinality x(value, ordinality)
    where public.vmp_can_view_plan_item(auth.uid(), x.value ->> 'validation_code')
  ), '[]'::jsonb);
end
$function$;

CREATE OR REPLACE FUNCTION public.rpc_check_data_quality(p_year integer DEFAULT (EXTRACT(year FROM now()))::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_ket jsonb;
begin
  if coalesce(auth.role(), '') not in ('', 'service_role')
     and public.vmp_is_active_session(auth.uid()) is not true then
    return public.vmp_session_denial();
  end if;
  v_ket := public.rpc_check_data_quality__five_role_impl_20260824(p_year);
  -- VÁ 21/10: như rpc_due_alerts. "id" của mỗi lỗi là mã hạng mục
  -- (vmp_plan_items.id = validation_code).
  if coalesce(auth.role(), '') in ('', 'service_role')
     or public.vmp_business_role(auth.uid()) in ('admin', 'qa_manager', 'qa_staff') then
    return v_ket;
  end if;
  return coalesce((
    select jsonb_agg(x.value order by x.ordinality)
    from jsonb_array_elements(v_ket) with ordinality x(value, ordinality)
    where public.vmp_can_view_plan_item(auth.uid(), x.value ->> 'id')
  ), '[]'::jsonb);
end
$function$;

notify pgrst, 'reload schema';

commit;
