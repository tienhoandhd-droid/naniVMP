-- Preserve the supplied plan-cancellation reason in the existing audit trigger.
-- Scoped context is restored so a later write cannot inherit this reason/source.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
do $$begin
 if md5(pg_get_functiondef('public.rpc_delete_plan_item__five_role_impl_20260824(text,text)'::regprocedure)) is distinct from '4c75013ecab984b5512c9bf8e6161681' then
  raise exception 'CRUD_PLAN_AUDIT_BASELINE_CHANGED';
 end if;
end$$;
CREATE OR REPLACE FUNCTION public.rpc_delete_plan_item__five_role_impl_20260824(p_validation_code text, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_role text;
  v_n    integer;
  v_previous_reason text := current_setting('app.audit_reason', true);
  v_previous_source text := current_setting('app.audit_source', true);
begin
  select role into v_role from profiles where id = auth.uid();
  if v_role is null then
    return jsonb_build_object('ok', false, 'error', 'Không xác định được người dùng');
  end if;
  if not public.duoc_phep('edit_catalog', v_role::text) then
    return jsonb_build_object('ok', false, 'error', 'Chỉ admin hoặc QA được xoá hạng mục');
  end if;
  if nullif(btrim(coalesce(p_reason,'')),'') is null then
    return jsonb_build_object('ok', false, 'error', 'Phải nhập lý do xoá');
  end if;

  perform set_config('app.audit_reason', btrim(p_reason), true);
  perform set_config('app.audit_source', 'rpc_delete_plan_item', true);
  update public.vmp_plan_items
     set is_active = false, item_state = 'cancelled', deleted_at = now(),
         delete_reason = btrim(p_reason), updated_by = auth.uid()
   where validation_code = p_validation_code and is_active = true;
  get diagnostics v_n = row_count;
  perform set_config('app.audit_reason', coalesce(v_previous_reason, ''), true);
  perform set_config('app.audit_source', coalesce(v_previous_source, 'trigger'), true);

  if v_n = 0 then
    return jsonb_build_object('ok', false, 'error',
      'Không tìm thấy hạng mục đang hoạt động: ' || p_validation_code);
  end if;
  return jsonb_build_object('ok', true, 'msg', 'Đã huỷ hạng mục');
end;
$function$;
commit;
