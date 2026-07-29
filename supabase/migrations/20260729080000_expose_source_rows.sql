-- =====================================================================
-- Mở các tab thô cho web xem và sửa
--
-- vmp_source_rows chứa toàn bộ 13 tab của workbook nhưng bật RLS mà KHÔNG
-- có policy select, nên trình duyệt không đọc được dòng nào. Vì vậy 5 tab
-- (Giao việc, Rule VMP state, 0.Rule timeline VMP, Mail_Log, Mail_Log_Index)
-- tuy đã nằm trên Supabase vẫn không hiện lên web.
--
-- Mở đọc cho NGƯỜI ĐĂNG NHẬP (không mở cho anon: đây là dữ liệu thô nội bộ,
-- gồm cả nhật ký email). Ghi vẫn qua RPC có kiểm quyền như mọi bảng khác.
--
-- Các tab có số cột rất khác nhau (1 đến 38) nên không dựng bảng riêng cho
-- từng tab; giữ nguyên payload jsonb và để giao diện tự sinh cột.
-- =====================================================================

drop policy if exists source_rows_select_authenticated on public.vmp_source_rows;
create policy source_rows_select_authenticated
  on public.vmp_source_rows for select
  to authenticated
  using (true);

grant select on public.vmp_source_rows to authenticated;

-- ---------------------------------------------------------------------
-- Danh sách tab + số dòng, để giao diện dựng bộ chọn mà không phải kéo
-- toàn bộ dữ liệu về đếm.
-- ---------------------------------------------------------------------
create or replace function public.rpc_list_source_tabs()
returns jsonb
language sql stable security definer set search_path = public
as $fn$
  select coalesce(jsonb_agg(t order by t ->> 'source_tab'), '[]'::jsonb)
  from (
    select jsonb_build_object(
             'source_tab', source_tab,
             'rows', count(*),
             'columns', (
               select count(distinct k)
               from public.vmp_source_rows r2, jsonb_object_keys(r2.payload) k
               where r2.source_tab = r.source_tab
             )
           ) as t
    from public.vmp_source_rows r
    group by source_tab
  ) s;
$fn$;

-- ---------------------------------------------------------------------
-- Ghi một dòng thô. p_row_number = NULL nghĩa là thêm mới (tự lấy số kế tiếp).
-- ---------------------------------------------------------------------
create or replace function public.rpc_upsert_source_row(
  p_source_tab  text,
  p_row_number  integer,
  p_payload     jsonb
) returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare
  v_role text;
  v_tab  text := nullif(btrim(p_source_tab), '');
  v_rn   integer := p_row_number;
begin
  select role into v_role from profiles where id = auth.uid();
  if v_role is null then
    return jsonb_build_object('ok', false, 'error', 'Không xác định được người dùng');
  end if;
  if v_role not in ('admin','qa_manager') then
    return jsonb_build_object('ok', false, 'error', 'Chỉ admin hoặc QA được sửa dữ liệu thô');
  end if;
  if v_tab is null then
    return jsonb_build_object('ok', false, 'error', 'Thiếu tên tab');
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    return jsonb_build_object('ok', false, 'error', 'Nội dung dòng phải là đối tượng JSON');
  end if;

  if v_rn is null then
    select coalesce(max(row_number), 1) + 1 into v_rn
    from public.vmp_source_rows where source_tab = v_tab;
  end if;

  insert into public.vmp_source_rows (source_tab, row_number, payload)
  values (v_tab, v_rn, p_payload)
  on conflict (source_tab, row_number) do update set payload = excluded.payload;

  return jsonb_build_object('ok', true, 'source_tab', v_tab, 'row_number', v_rn,
                            'msg', 'Đã lưu dòng');
exception when others then
  return jsonb_build_object('ok', false, 'error', sqlerrm);
end;
$fn$;

create or replace function public.rpc_delete_source_row(
  p_source_tab text,
  p_row_number integer
) returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare v_role text; v_n integer;
begin
  select role into v_role from profiles where id = auth.uid();
  if v_role not in ('admin','qa_manager') then
    return jsonb_build_object('ok', false, 'error', 'Không có quyền xoá');
  end if;
  delete from public.vmp_source_rows
   where source_tab = p_source_tab and row_number = p_row_number;
  get diagnostics v_n = row_count;
  return case when v_n > 0
    then jsonb_build_object('ok', true, 'msg', 'Đã xoá dòng')
    else jsonb_build_object('ok', false, 'error', 'Không tìm thấy dòng') end;
end;
$fn$;

-- ---------------------------------------------------------------------
-- Quyền: xem mục 8b HANDOVER — Supabase cấp EXECUTE thẳng cho anon trên mọi
-- function mới, nên phải revoke khỏi CẢ anon lẫn public rồi cấp lại đích danh.
-- ---------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'public.rpc_list_source_tabs()',
    'public.rpc_upsert_source_row(text, integer, jsonb)',
    'public.rpc_delete_source_row(text, integer)'
  ] loop
    execute format('revoke execute on function %s from anon',   f);
    execute format('revoke execute on function %s from public', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

-- Hậu kiểm: RPC ghi không được để hở cho anon.
do $$
declare v_left text;
begin
  select string_agg(p.proname, ', ') into v_left
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('rpc_upsert_source_row', 'rpc_delete_source_row')
    and has_function_privilege('anon', p.oid, 'execute');
  if v_left is not null then
    raise exception 'Vẫn còn RPC ghi mở cho anon: %', v_left;
  end if;
end $$;
