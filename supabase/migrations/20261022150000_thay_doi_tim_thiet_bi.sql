-- =====================================================================
-- Thẩm định do thay đổi — tìm thiết bị dễ nhận hơn (22/10/2026, chiều)
--
-- Chủ dự án: deadline lấy thẳng từ sheet (web bỏ ô chọn hạn); ô tìm thiết bị
-- phải kèm tên để khỏi gắn nhầm. Danh mục có nhiều tên gần giống nhau
-- ("Tank 1000 Mix (Tank 1)", "(Tank 3)") nên trả thêm khu + line, và cho
-- gõ không dấu ("may nghien" → "Máy nghiền").
--
-- Chỉ thay 2 hàm của migration 20261022100000 (cùng ngày, chưa ai phụ thuộc).
-- Không đổi bảng, không đổi dữ liệu, không đổi quyền.
-- =====================================================================

-- Gợi ý thiết bị: tìm theo mã, tên, khu, line; không phân biệt hoa/thường và dấu.
create or replace function public.rpc_change_search_objects(p_query text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_q text := btrim(coalesce(p_query, ''));
  v_k text;
begin
  if not public.vmp_change_can_edit(auth.uid()) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  if char_length(v_q) < 2 then
    return '[]'::jsonb;
  end if;
  v_q := left(v_q, 80);
  -- Bỏ ký tự đại diện của LIKE để chữ người dùng gõ chỉ là chữ.
  v_k := '%' || replace(replace(replace(lower(extensions.unaccent(v_q)), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  return coalesce((
    select jsonb_agg(jsonb_build_object('code', o.code, 'name', o.name, 'department', o.department,
                                        'area', o.area, 'line', o.line))
      from (select o.code, o.name, o.department, o.area, o.line
              from public.vmp_objects o
             where o.is_active
               and lower(extensions.unaccent(concat_ws(' ', o.code, o.name, o.area, o.line))) like v_k
             order by (lower(o.code) like lower(v_q) || '%') desc, o.name, o.code
             limit 20) o), '[]'::jsonb);
end
$$;

-- Một phiếu dạng jsonb (dùng chung cho danh sách).
create or replace function public.vmp_change_record_json(p_uid uuid, p_id uuid, p_can_edit boolean)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id', c.id, 'source_tab', c.source_tab, 'change_code', c.change_code,
    'source_row', c.source_row, 'opened_text', c.opened_text, 'department', c.department,
    'change_class', c.change_class, 'change_type', c.change_type,
    'change_content', c.change_content, 'sheet_status', c.sheet_status,
    'owner_text', c.owner_text, 'folder_link', c.folder_link,
    'needs_validation', c.needs_validation, 'validation_content', c.validation_content,
    'deadline_raw', c.deadline_raw, 'deadline_sheet', c.deadline_sheet,
    'deadline_override', c.deadline_override,
    'deadline', coalesce(c.deadline_override, c.deadline_sheet),
    'removed_from_sheet_at', c.removed_from_sheet_at,
    'handling_status', c.handling_status, 'note', c.note, 'version', c.version,
    'updated_at', c.updated_at,
    'objects', coalesce((
      select jsonb_agg(jsonb_build_object('code', o.code, 'name', o.name,
                                          'department', o.department, 'area', o.area,
                                          'line', o.line) order by o.code)
        from public.vmp_change_objects co join public.vmp_objects o on o.code = co.object_code
       where co.change_id = c.id), '[]'::jsonb),
    -- Đợt thẩm định của các thiết bị đã gắn. Người sửa thấy cả đợt chưa gắn
    -- (để chọn); xưởng chỉ thấy đợt đã gắn mà họ được xem.
    'plan_items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id, 'validation_code', p.validation_code, 'object_code', p.object_code,
               'validation_type', p.validation_type, 'year', p.year,
               'computed_status', p.computed_status, 'deadline_validation', p.deadline_validation,
               'linked', l.plan_item_id is not null)
             order by p.year desc, p.object_code, p.validation_code)
        from public.vmp_plan_items p
        left join public.vmp_change_plan_links l on l.change_id = c.id and l.plan_item_id = p.id
       where (l.plan_item_id is not null
              or (p_can_edit and p.is_active
                  and p.object_code in (select co.object_code from public.vmp_change_objects co
                                         where co.change_id = c.id)
                  and p.year >= extract(year from now())::int - 1))
         and (p_can_edit or public.vmp_can_view_plan_item(p_uid, p.validation_code))), '[]'::jsonb)
  )
  from public.vmp_change_records c
  where c.id = p_id
$$;
