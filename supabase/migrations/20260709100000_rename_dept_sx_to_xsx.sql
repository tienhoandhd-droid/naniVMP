-- =====================================================================
--  Đổi mã bộ phận "Xưởng sản xuất": sx -> xsx
--  ---------------------------------------------------------------------
--  Yêu cầu nghiệp vụ: mã bộ phận của Xưởng sản xuất là 'xsx' (không phải 'sx').
--  departments.id là PK, được vmp_objects.department & profiles.department tham
--  chiếu (FK KHÔNG cascade) → phải thêm 'xsx', repoint con, rồi xóa 'sx'.
--  Idempotent: chạy lại/trên DB mới không có 'sx' là no-op.
-- =====================================================================

-- 1. Thêm hàng departments 'xsx' (sao từ 'sx', chuẩn short_name = 'XSX').
insert into public.departments (id, name, short_name, manager_id, email, is_active, sort_order)
select 'xsx', name, 'XSX', manager_id, email, is_active, sort_order
from public.departments where id = 'sx'
on conflict (id) do nothing;

-- 2. Repoint các bảng con (FK) sang 'xsx'.
update public.vmp_objects set department = 'xsx' where department = 'sx';
update public.profiles     set department = 'xsx' where department = 'sx';

-- 3. Xóa hàng cũ 'sx' (giờ không còn ai tham chiếu).
delete from public.departments where id = 'sx';

-- 4. Cập nhật các mảng đã precompute trong vmp_plan_items.
update public.vmp_plan_items
set departments = array_replace(departments, 'sx', 'xsx')
where departments @> array['sx'];

update public.vmp_plan_items
set execution_departments = array_replace(execution_departments, 'sx', 'xsx')
where execution_departments @> array['sx'];

-- 5. Cập nhật hàm tách bộ phận: XSX / "Xưởng sản xuất" -> 'xsx'.
create or replace function public.vmp_parse_depts(p_raw text)
returns text[]
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  x text := lower(coalesce(p_raw, ''));
  s text[] := '{}';
begin
  -- LƯU Ý: array_append (không dùng s || 'xx' -> Postgres coi là nối mảng-mảng).
  if x ~ '(\yxsx\y|xưởng|xuong|sản xuất|san xuat|\ysx\y)' then s := array_append(s, 'xsx'); end if;
  if x ~ '(cơ điện|co dien|\ycd\y|cđ)'                     then s := array_append(s, 'cd'); end if;
  if x ~ '(\ykho\y|warehouse)'                             then s := array_append(s, 'kho'); end if;
  if x ~ '(\yrd\y|r&d|nghiên cứu|nghien cuu|research)'     then s := array_append(s, 'rd'); end if;
  if x ~ '(\yqc\y|kiểm nghiệm|kiem nghiem)'                then s := array_append(s, 'qc'); end if;
  if x ~ 'qlcl'  then s := array_append(s, 'qa'); s := array_append(s, 'qc'); end if; -- QLCL = QA + QC
  if x ~ '(\yqa\y|đảm bảo|dam bao)'                        then s := array_append(s, 'qa'); end if;
  return array(select distinct e from unnest(s) as e);
end;
$$;
