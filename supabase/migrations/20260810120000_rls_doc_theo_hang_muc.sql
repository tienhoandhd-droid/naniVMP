/* RLS và mọi đường đọc SECURITY DEFINER cùng dùng một lõi quyền hạng mục. */

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1
    from public.profiles profile
    where profile.id = auth.uid()
      and profile.role::text = 'admin'
      and coalesce(profile.is_active, true)
  )
$fn$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;

create or replace function public.vmp_visible_plan_items()
returns setof public.vmp_plan_items
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select item.*
  from public.vmp_plan_items item
  where public.item_permissions_mode() = 'preview'
     or auth.role() = 'service_role'
     or public.vmp_can_view_item(auth.uid(), item.validation_code)
     or public.is_admin()
$fn$;

revoke all on function public.vmp_visible_plan_items() from public, anon;
grant execute on function public.vmp_visible_plan_items() to authenticated, service_role;

drop policy if exists plan_select on public.vmp_plan_items;
drop policy if exists vmp_plan_items_select_item_permissions on public.vmp_plan_items;
create policy vmp_plan_items_select_item_permissions
on public.vmp_plan_items
for select
to authenticated
using (
  public.item_permissions_mode() = 'preview'
  or public.vmp_can_view_item(auth.uid(), validation_code)
  or public.is_admin()
);

drop policy if exists vmp_item_assignments_select_authenticated
  on public.vmp_item_assignments;
drop policy if exists vmp_item_assignments_select_item_permissions
  on public.vmp_item_assignments;
create policy vmp_item_assignments_select_item_permissions
on public.vmp_item_assignments
for select
to authenticated
using (
  public.item_permissions_mode() = 'preview'
  or public.vmp_can_view_item(auth.uid(), validation_code)
  or public.is_admin()
);

/*
 * Audit trả đúng các SECURITY DEFINER còn đọc trực tiếp vmp_plan_items.
 * Allowlist chỉ chứa trigger audit, lõi quyền/admin và đường ghi/sync; mỗi
 * signature có lý do để một RPC đọc mới không thể được miễn trừ ngầm.
 */
create or replace function public.vmp_unfiltered_security_definer_item_readers()
returns table (signature text)
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  with allowed(signature, reason) as (
    values
      ('audit_plan_item_changes()', 'trigger audit, không trả dữ liệu cho trình duyệt'),
      ('audit_plan_item_changes_v2()', 'trigger audit, không trả dữ liệu cho trình duyệt'),
      ('ly_do_khong_sua_duoc(text,uuid)', 'helper kiểm quyền ghi legacy'),
      ('vmp_item_rights(uuid,text)', 'lõi tính quyền phải đọc hạng mục đích'),
      ('rpc_item_permission_preflight()', 'admin-only, kiểm độ đầy đủ trước enforced'),
      ('rpc_luat_xem()', 'admin/QA-only, chỉ nhắc tên bảng trong metadata policy'),
      ('rpc_apply_assignments(boolean)', 'RPC ghi đồng bộ người phụ trách'),
      ('rpc_apply_sheet_sync(text,text,jsonb)', 'RPC ghi service sync'),
      ('rpc_create_plan_item(text,text,integer,integer,jsonb)', 'RPC ghi tạo hạng mục'),
      ('rpc_delete_plan_item(text,text)', 'RPC ghi xóa mềm hạng mục'),
      ('rpc_generate_timeline(integer,boolean)', 'RPC ghi sinh timeline'),
      ('rpc_recalc_criticality(boolean)', 'RPC ghi tính lại độ trọng yếu'),
      ('rpc_reconcile_orphan_objects(text[])', 'RPC ghi đối soát dữ liệu nguồn'),
      ('rpc_refresh_computed_status()', 'RPC ghi tính lại trạng thái'),
      ('rpc_refresh_source_item_assignments()', 'RPC ghi đồng bộ phân công nguồn'),
      ('rpc_register_alert(text,text,text,text,text,text,text)', 'RPC ghi cảnh báo'),
      ('rpc_resolve_missing(text,text,text)', 'RPC ghi xử lý hạng mục thiếu'),
      ('rpc_rollback_vmp_sheet_sync(uuid)', 'RPC service khôi phục snapshot'),
      ('rpc_set_item_assignment(uuid,text,text,text,text)', 'RPC ghi phân công'),
      ('rpc_set_item_performer(text,text)', 'RPC ghi người thực hiện'),
      ('rpc_set_item_state(text,text,text)', 'RPC ghi trạng thái nghiệp vụ'),
      ('rpc_sync_vmp_sheet_snapshot(text,text,text,jsonb,jsonb)', 'RPC service đồng bộ snapshot'),
      ('rpc_sync_vmp_sheet_snapshot_with_extras(text,text,text,jsonb,jsonb)', 'RPC service đồng bộ dữ liệu mở rộng'),
      ('rpc_update_progress(text,jsonb,text,jsonb,integer)', 'RPC ghi tiến độ đã kiểm quyền trường')
  ), candidates as (
    select p.oid::regprocedure::text as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and pg_get_functiondef(p.oid) ilike '%vmp_plan_items%'
      and pg_get_functiondef(p.oid) not ilike '%vmp_can_view_item%'
      and pg_get_functiondef(p.oid) not ilike '%vmp_visible_plan_items%'
  )
  select candidate.signature
  from candidates candidate
  left join allowed on allowed.signature = candidate.signature
  where allowed.signature is null
  order by candidate.signature
$fn$;

revoke all on function public.vmp_unfiltered_security_definer_item_readers()
  from public, anon, authenticated;
grant execute on function public.vmp_unfiltered_security_definer_item_readers()
  to service_role;

/*
 * Giữ nguyên signature/body của các RPC đọc hiện hữu, chỉ thay nguồn bảng
 * trực tiếp trong FROM/JOIN bằng helper có predicate. Cách này cũng phủ các
 * câu SELECT dựng động trong họ rpc_ai_* mà không dựa vào RLS của owner.
 */
do $rewrite_readers$
declare
  reader record;
  old_definition text;
  new_definition text;
begin
  for reader in
    select audit.signature
    from public.vmp_unfiltered_security_definer_item_readers() audit
  loop
    select pg_get_functiondef(reader.signature::regprocedure)
    into old_definition;

    new_definition := regexp_replace(
      old_definition,
      '(\mfrom[[:space:]]+)(public\.)?vmp_plan_items\M',
      '\1public.vmp_visible_plan_items()',
      'gi'
    );
    new_definition := regexp_replace(
      new_definition,
      '(\mjoin[[:space:]]+)(public\.)?vmp_plan_items\M',
      '\1public.vmp_visible_plan_items()',
      'gi'
    );
    if reader.signature = 'rpc_alert_context(text,integer)' then
      new_definition := replace(
        new_definition,
        $old_text$'Không tìm thấy mã: ' || p_validation_code$old_text$,
        $new_text$'Không tìm thấy hạng mục'$new_text$
      );
    end if;
    if reader.signature = 'rpc_get_vmp_dashboard(integer,boolean,boolean)' then
      new_definition := replace(
        new_definition,
        $old_dashboard$'lich_td', i.scheduled_date,$old_dashboard$,
        $new_dashboard$'lich_td', i.scheduled_date,
          'scheduled_at', i.scheduled_at,$new_dashboard$
      );
      if position(
        $scheduled_at$'scheduled_at', i.scheduled_at$scheduled_at$
        in new_definition
      ) = 0 then
        raise exception 'Không thể bổ sung scheduled_at vào rpc_get_vmp_dashboard';
      end if;
    end if;

    if new_definition = old_definition then
      raise exception 'Không thể gắn lọc hạng mục vào %', reader.signature;
    end if;
    execute new_definition;
  end loop;
end
$rewrite_readers$;

create or replace function public.rpc_item_permission_preflight()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_actor_role text;
  v_blocking jsonb;
  v_warnings jsonb;
begin
  select role::text into v_actor_role
  from public.profiles
  where id = auth.uid() and coalesce(is_active, true);
  if v_actor_role <> 'admin' then
    return jsonb_build_object('ok', false, 'error', 'Chỉ Admin chạy được tiền kiểm');
  end if;

  with errors as (
    select jsonb_build_object(
      'code', 'INCOMPLETE_ACTIVE_PERSON',
      'record_id', person.id,
      'message', 'Nhân viên hoạt động thiếu bộ phận, phân loại, phạm vi hoặc khu vực'
    ) as error
    from public.vmp_performers person
    where person.is_active and (
      nullif(btrim(person.performer_name), '') is null
      or nullif(btrim(coalesce(person.department, '')), '') is null
      or person.access_class is null
      or cardinality(person.scope_departments) = 0
      or cardinality(person.access_areas) = 0
    )

    union all

    select jsonb_build_object(
      'code', 'DUPLICATE_NORMALIZED_NAME',
      'record_id', duplicate.normalized_full_name,
      'message', 'Tên trùng phải được nối tay trước khi bật quyền'
    )
    from (
      select normalized_full_name
      from public.vmp_performers
      where is_active
      group by normalized_full_name
      having count(*) > 1
    ) duplicate

    union all

    select jsonb_build_object(
      'code', 'UNRESOLVED_ASSIGNMENT',
      'record_id', assignment.id,
      'message', 'Phân công chưa nối duy nhất với tài khoản'
    )
    from public.vmp_item_assignments assignment
    where assignment.is_active and assignment.unresolved_reason is not null

    union all

    select jsonb_build_object(
      'code', 'INVALID_QA_CLASS_DEPARTMENT',
      'record_id', person.id,
      'message', 'Phân loại QA đang cấp cho người ngoài QA'
    )
    from public.vmp_performers person
    where person.is_active
      and person.access_class in ('qa_progress_editor', 'qa_manager')
      and person.department is distinct from 'qa'

    union all

    select jsonb_build_object(
      'code', 'ITEM_MISSING_PERMISSION_DIMENSION',
      'record_id', item.validation_code,
      'message', 'Hạng mục thiếu bộ phận quản lý hoặc khu vực/line'
    )
    from public.vmp_plan_items item
    join public.vmp_objects object on object.code = item.object_code
    where item.is_active and (
      nullif(btrim(coalesce(object.department, '')), '') is null
      or (
        nullif(btrim(coalesce(object.area, '')), '') is null
        and nullif(btrim(coalesce(object.line, '')), '') is null
      )
    )

    union all

    select jsonb_build_object(
      'code', 'UNFILTERED_SECURITY_DEFINER_RPC',
      'record_id', audit.signature,
      'message', 'SECURITY DEFINER đọc hạng mục chưa dùng lõi quyền/allowlist'
    )
    from public.vmp_unfiltered_security_definer_item_readers() audit
  )
  select jsonb_agg(error) into v_blocking from errors;

  with warnings as (
    select jsonb_build_object(
      'code', 'EMPLOYEE_CODE_MISSING',
      'record_id', person.id,
      'message', 'Mã nhân viên chưa có; được phép bổ sung sau'
    ) as warning
    from public.vmp_performers person
    where person.is_active and nullif(btrim(coalesce(person.employee_code, '')), '') is null
  )
  select jsonb_agg(warning) into v_warnings from warnings;

  return jsonb_build_object(
    'ok', true,
    'mode', public.item_permissions_mode(),
    'blocking_errors', coalesce(v_blocking, '[]'::jsonb),
    'warnings', coalesce(v_warnings, '[]'::jsonb)
  );
end
$fn$;

revoke execute on function public.rpc_item_permission_preflight() from public, anon;
grant execute on function public.rpc_item_permission_preflight() to authenticated, service_role;

do $verify$
begin
  if public.item_permissions_mode() <> 'preview' then
    raise exception 'Migration RLS không được tự bật enforced';
  end if;
  if exists (select 1 from public.vmp_unfiltered_security_definer_item_readers()) then
    raise exception 'Còn SECURITY DEFINER đọc hạng mục chưa lọc';
  end if;
end
$verify$;
