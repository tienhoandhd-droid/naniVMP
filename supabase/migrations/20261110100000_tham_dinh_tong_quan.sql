-- Trang Tổng quan của Thẩm định thực tế (09/11/2026).
-- CHỈ ĐỌC: thêm hai hàm mới, không sửa hàm/bảng/dữ liệu đang có.
--  · cpc1_private.run_item_progress(run, system): tiến độ MỘT hệ thống trong
--    đợt. Cùng luật đếm với cpc1_private.run_progress (đếm theo scope, pass/fail
--    là đã có kết quả, kiểm mẫu đối chứng BM04 với khí). Test SQL kiểm tổng các
--    hệ thống = run_progress của cả đợt để hai hàm không lệch nhau.
--  · public.cpc1_overview(p_year): theo từng hệ thống — hạng mục PQ của năm
--    trong kế hoạch VMP và các đợt bắt đầu trong năm, kèm tiến độ + trạng thái ký.
--    Quyền: viewer() (QA/Admin) + chỉ trả hồ sơ có record_pq_right và hạng mục
--    PQ có pq_right — đúng luật đang dùng ở cpc1_run_list/cpc1_run_get.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

create function cpc1_private.run_item_progress(p_run uuid, p_system text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  item record; f text; pts jsonb; pid text; ev jsonb; st text;
  complete int := 0; total int := 0; failn int := 0; invalidn int := 0; controls_ok boolean := true;
begin
  for item in
    select i.*, r.version from cpc1_private.run_items i
    join public.cpc1_records r on r.id = i.record_id
    where i.run_id = p_run and i.system = p_system
  loop
    select evaluation into ev from public.cpc1_revisions
    where record_id = item.record_id and version = coalesce(item.closed_revision, item.version);
    for f, pts in select * from jsonb_each(item.scope) loop
      for pid in select * from jsonb_array_elements_text(pts) loop
        total := total + 1;
        st := case when item.system = 'steam' then ev #>> array['forms', f, 'locations', pid]
                   else ev #>> array['forms', f, 'rows', pid, 'status'] end;
        if st in ('pass', 'fail') then complete := complete + 1; end if;
        if st = 'fail' then failn := failn + 1; end if;
        if st = 'invalid' then invalidn := invalidn + 1; end if;
      end loop;
      if item.system <> 'steam' and f = 'bm04'
         and coalesce(ev #>> '{controls,status}', 'incomplete') not in ('pass', 'fail') then
        controls_ok := false;
      end if;
    end loop;
  end loop;
  return jsonb_build_object('total', total, 'complete', complete, 'fail', failn, 'invalid', invalidn,
    'controls_ready', controls_ok, 'ready', total > 0 and total = complete and controls_ok);
end
$function$;

create function public.cpc1_overview(p_year integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare u uuid := cpc1_private.viewer();
begin
  if p_year is null or p_year not between 2000 and 2100 then
    raise exception 'Năm không hợp lệ.' using errcode = '23514';
  end if;
  return jsonb_build_object('year', p_year, 'systems', (
    select jsonb_agg(jsonb_build_object(
      'system', s.system,
      'objects', (select jsonb_agg(o.object_code order by o.object_code)
                  from cpc1_private.pq_system_objects o where o.system = s.system),
      'pq_items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', p.id, 'object_code', p.object_code,
          'status_validation', p.status_validation, 'status_validation_text', p.status_validation_text,
          'status_vmp', p.status_vmp, 'deadline_vmp', p.deadline_vmp, 'actual_vmp_date', p.actual_vmp_date)
          order by p.object_code, p.id)
        from public.vmp_plan_items p
        join cpc1_private.pq_system_objects o on o.object_code = p.object_code and o.system = s.system
        where upper(btrim(p.validation_type)) = 'PQ' and p.year = p_year
          and p.is_active and p.item_state = 'active'
          and not coalesce(p.deleted_from_sheet, false)
          and cpc1_private.pq_right(array[p.id], false)), '[]'::jsonb),
      'runs', coalesce((
        select jsonb_agg(jsonb_build_object(
          'run_id', r.id, 'title', r.title, 'started_on', r.started_on, 'status', r.status,
          'closed_at', r.closed_at, 'record_id', i.record_id,
          'version', coalesce(i.closed_revision, rec.version),
          'progress', cpc1_private.run_item_progress(r.id, i.system),
          'sign_state', cpc1_private.record_sign_state(i.record_id, coalesce(i.closed_revision, rec.version)) -> 'trang_thai')
          order by r.started_on desc, r.created_at desc)
        from cpc1_private.run_items i
        join cpc1_private.runs r on r.id = i.run_id
        join public.cpc1_records rec on rec.id = i.record_id
        where i.system = s.system
          and extract(year from r.started_on) = p_year
          and cpc1_private.record_pq_right(i.record_id, false)), '[]'::jsonb)
    ) order by s.ord)
    from (values ('air', 1), ('nitrogen', 2), ('steam', 3)) s(system, ord)));
end
$function$;

revoke all on function cpc1_private.run_item_progress(uuid, text) from public, anon, authenticated;
revoke all on function public.cpc1_overview(integer) from public, anon, authenticated;
grant execute on function public.cpc1_overview(integer) to authenticated;
commit;
