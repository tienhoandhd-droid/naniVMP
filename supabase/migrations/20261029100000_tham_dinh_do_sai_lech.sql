-- =====================================================================
-- Thẩm định do sai lệch (29/10/2026)
--
-- Thêm nguồn thứ hai cho "Thẩm định do thay đổi": tab "Sổ quản lý sai lệch
-- (2026)" của sheet "Tổng hợp Sai lệch 2026" (nhóm QMS quản lý, CHỈ ĐỌC).
-- n8n VMP 8 đọc tab này cùng lượt với sheet thay đổi rồi gửi chung vào
-- vmp_change_sync_ingest. Chỉ lấy dòng có cột "Có cần thông báo team VQ
-- thẩm định thiết bị/nhà xưởng hay không?" ghi "Có".
--
-- Tab sai lệch nhận ra bằng tiêu đề "Mã sai lệch". Cột sai lệch ghi vào các
-- cột sẵn có của vmp_change_records:
--   Mã sai lệch → change_code          Ngày phát hiện → opened_text
--   Bộ phận liên quan → department     Tên sản phẩm + Số lô → change_class
--   Phân loại mức độ sai lệch → change_type
--   Nội dung sai lệch → change_content Trạng thái tổng thể → sheet_status
--   Folder tập hợp bằng chứng → folder_link
--   CAPA → validation_content          Deadline thực hiện CAPA → deadline_raw
--
-- Chỉ THÊM cột record_kind (phiếu cũ = 'thay_doi') và thay thân 2 hàm:
-- vmp_change_sync_ingest, vmp_change_record_json. Quyền giữ nguyên.
-- =====================================================================

alter table public.vmp_change_records
  add column if not exists record_kind text not null default 'thay_doi'
    check (record_kind in ('thay_doi', 'sai_lech'));

create or replace function public.vmp_change_sync_ingest(p_run_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_range jsonb;
  v_tab text;
  v_values jsonb;
  v_header jsonb;
  v_keys text[];
  v_idx jsonb;
  v_k text;
  v_i int;
  v_missing text[];
  v_errors text[] := '{}';
  v_tabs text[] := '{}';
  v_row jsonb;
  v_rowno int;
  v_code text;
  v_mark text;
  v_kind text;
  v_start int;
  v_rec record;
  v_created int := 0;
  v_updated int := 0;
  v_unchanged int := 0;
  v_removed int := 0;
  v_old_hash text;
  v_old_removed timestamptz;
  v_dup_cols text[];
  v_force boolean;
  v_active int;
  v_drop int;
  v_dup int := 0;
  v_no_code int := 0;
  v_seen int := 0;
  v_summary jsonb;
  v_status text;
begin
  if coalesce(auth.role(), '') not in ('', 'service_role') then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  select status, coalesce((summary ->> 'cho_phep_bo_hang_loat')::boolean, false)
    into v_status, v_force
    from public.vmp_change_sync_runs where id = p_run_id for update;
  if v_status is distinct from 'dang_chay' then
    return jsonb_build_object('ok', false, 'error_code', 'RUN_NOT_RUNNING',
      'error', 'Lượt đồng bộ không ở trạng thái đang chạy.');
  end if;

  create temp table if not exists pg_temp.cc_rows (
    source_tab text, change_code text, source_row int,
    opened_text text, department text, change_class text, change_type text, change_content text,
    sheet_status text, owner_text text, folder_link text,
    validation_mark text, validation_content text, deadline_raw text, record_kind text
  ) on commit drop;
  truncate pg_temp.cc_rows;

  if jsonb_typeof(p_payload -> 'valueRanges') is distinct from 'array'
     or jsonb_array_length(p_payload -> 'valueRanges') = 0 then
    v_errors := array_append(v_errors, 'Dữ liệu từ sheet sai dạng (không có valueRanges).');
  else
    for v_range in select * from jsonb_array_elements(p_payload -> 'valueRanges') loop
      -- "'2026 (2)'!A1:W2000" → 2026 (2)
      v_tab := regexp_replace(coalesce(v_range ->> 'range', ''), '^''?(.*?)''?![^!]*$', '\1');
      v_tab := replace(v_tab, '''''', '''');
      v_values := v_range -> 'values';
      -- Dòng đầu của vùng đọc ("…!A2:AE3000" → 2): để số dòng khớp sheet.
      v_start := coalesce(substring(coalesce(v_range ->> 'range', '') from '![A-Z]+([0-9]+)'), '1')::int;
      if btrim(v_tab) = '' then
        v_errors := array_append(v_errors, 'Không đọc được tên tab.');
        continue;
      end if;
      v_tabs := v_tabs || v_tab;
      if jsonb_typeof(v_values) is distinct from 'array' or jsonb_array_length(v_values) = 0 then
        v_errors := array_append(v_errors, format('Tab "%s" trống.', v_tab));
        continue;
      end if;
      if jsonb_array_length(v_values) > 5001 then
        v_errors := array_append(v_errors, format('Tab "%s" có quá 5000 dòng.', v_tab));
        continue;
      end if;

      -- Ghép tiêu đề → vị trí cột (theo TÊN, không theo chữ cái cột).
      v_header := v_values -> 0;
      if jsonb_typeof(v_header) is distinct from 'array' then
        v_errors := array_append(v_errors, format('Tab "%s": dòng tiêu đề sai dạng.', v_tab));
        continue;
      end if;
      if exists (select 1 from jsonb_array_elements(v_values) r where jsonb_typeof(r) is distinct from 'array') then
        v_errors := array_append(v_errors, format('Tab "%s": có dòng sai dạng.', v_tab));
        continue;
      end if;
      v_idx := '{}'::jsonb;
      v_dup_cols := '{}';
      -- Tab sổ sai lệch nhận ra bằng cột "Mã sai lệch"; còn lại là tab thay đổi.
      v_kind := case when exists (select 1 from jsonb_array_elements_text(v_header) h
                                   where public.vmp_change_header_key(h) = 'mã sai lệch')
                     then 'sai_lech' else 'thay_doi' end;
      for v_i in 0 .. coalesce(jsonb_array_length(v_header), 0) - 1 loop
        v_k := public.vmp_change_header_key(v_header ->> v_i);
        v_k := case
          when v_kind = 'sai_lech' then case
            when v_k = 'mã sai lệch' then 'code'
            when v_k like 'có cần thông báo team vq%' then 'mark'
            when v_k = 'nội dung sai lệch' then 'content'
            when v_k = 'capa' then 'vcontent'
            when v_k = 'deadline thực hiện capa' then 'deadline'
            when v_k = 'phân loại mức độ sai lệch' then 'type'
            when v_k = 'tên sản phẩm' then 'class'
            when v_k = 'số lô' then 'lot'
            when v_k = 'ngày phát hiện' then 'opened'
            when v_k = 'bộ phận liên quan' then 'dept'
            when v_k = 'trạng thái tổng thể' then 'status'
            when v_k = 'folder tập hợp bằng chứng' then 'link'
            else null end
          when v_k = 'mã thay đổi' then 'code'
          when v_k like 'có cần tiến hành thẩm định%' then 'mark'
          when v_k like 'nội dung thẩm định%' then 'vcontent'
          when v_k like 'deadline thẩm định%' then 'deadline'
          when v_k = 'nội dung thay đổi' then 'content'
          when v_k = 'loại thay đổi' then 'type'
          when v_k = 'phân loại thay đổi' then 'class'
          when v_k in ('thời gian', 'ngày mở hồ sơ') then 'opened'
          when v_k like 'phòng ban%' then 'dept'
          when v_k = 'tình trạng' or v_k like 'tình trạng hồ sơ%' then 'status'
          when v_k in ('người phụ trách', 'chuyển chuyên viên qa phụ trách') then 'owner'
          when v_k like 'link folder thay đổi%' then 'link'
          else null end;
        -- Mỗi cột cần lấy chỉ được có MỘT. Hai cột cùng tên (vd. nhóm kia chèn
        -- thêm cột "Có cần tiến hành thẩm định…") → không đoán, dừng lượt.
        if v_k is not null and (v_idx ? v_k) then
          v_dup_cols := array_append(v_dup_cols, v_header ->> v_i);
        elsif v_k is not null then
          v_idx := v_idx || jsonb_build_object(v_k, v_i);
        end if;
      end loop;
      if cardinality(v_dup_cols) > 0 then
        v_errors := array_append(v_errors, format('Tab "%s" có cột trùng tên: %s.', v_tab,
          array_to_string(v_dup_cols, ', ')));
        continue;
      end if;
      select array_agg(x) into v_missing
        from unnest(case when v_kind = 'sai_lech' then array['code', 'mark', 'content']
                         else array['code', 'mark', 'vcontent', 'deadline', 'content'] end) x
       where not (v_idx ? x);
      if v_missing is not null and v_kind = 'sai_lech' then
        v_errors := array_append(v_errors, format('Tab "%s" thiếu cột: %s.', v_tab, array_to_string(
          array(select case x when 'code' then 'Mã sai lệch'
                              when 'mark' then 'Có cần thông báo team VQ thẩm định thiết bị/nhà xưởng hay không?'
                              else 'Nội dung sai lệch' end
                from unnest(v_missing) x), ', ')));
        continue;
      end if;
      if v_missing is not null then
        v_errors := array_append(v_errors, format('Tab "%s" thiếu cột: %s.', v_tab, array_to_string(
          array(select case x when 'code' then 'Mã thay đổi'
                              when 'mark' then 'Có cần tiến hành thẩm định không?'
                              when 'vcontent' then 'Nội dung thẩm định'
                              when 'deadline' then 'Deadline thẩm định'
                              else 'Nội dung thay đổi' end
                from unnest(v_missing) x), ', ')));
        continue;
      end if;

      for v_rowno in 1 .. jsonb_array_length(v_values) - 1 loop
        v_row := v_values -> v_rowno;
        v_code := nullif(btrim(v_row ->> (v_idx ->> 'code')::int), '');
        v_mark := nullif(btrim(v_row ->> (v_idx ->> 'mark')::int), '');
        if v_code is not null then
          v_seen := v_seen + 1;
        end if;
        -- Ô "Có cần thẩm định" để trống hoặc ghi rõ là không → không lấy.
        if v_mark is null
           or lower(normalize(v_mark, NFC)) ~ '^(không|khong|ko|no|n|-|0|false)([^[:alnum:]]|$)' then
          continue;
        end if;
        -- Sổ sai lệch: chỉ lấy khi cột VQ ghi "Có" (chủ dự án chốt 29/10).
        if v_kind = 'sai_lech' and lower(normalize(v_mark, NFC)) !~ '^(có|co)([^[:alnum:]]|$)' then
          continue;
        end if;
        if v_code is null then
          v_no_code := v_no_code + 1;
          continue;
        end if;
        insert into pg_temp.cc_rows (source_tab, change_code, source_row, opened_text, department,
          change_class, change_type, change_content, sheet_status, owner_text, folder_link,
          validation_mark, validation_content, deadline_raw, record_kind) values (
          v_tab, left(v_code, 100), v_rowno + v_start,
          nullif(btrim(v_row ->> (v_idx ->> 'opened')::int), ''),
          nullif(btrim(v_row ->> (v_idx ->> 'dept')::int), ''),
          -- Sai lệch: "Tên sản phẩm · Lô số lô".
          nullif(concat_ws(' · ', nullif(btrim(v_row ->> (v_idx ->> 'class')::int), ''),
            'Lô ' || nullif(btrim(v_row ->> (v_idx ->> 'lot')::int), '')), ''),
          nullif(btrim(v_row ->> (v_idx ->> 'type')::int), ''),
          nullif(btrim(v_row ->> (v_idx ->> 'content')::int), ''),
          nullif(btrim(v_row ->> (v_idx ->> 'status')::int), ''),
          nullif(btrim(v_row ->> (v_idx ->> 'owner')::int), ''),
          nullif(btrim(v_row ->> (v_idx ->> 'link')::int), ''),
          v_mark,
          nullif(btrim(v_row ->> (v_idx ->> 'vcontent')::int), ''),
          nullif(btrim(v_row ->> (v_idx ->> 'deadline')::int), ''),
          v_kind);
      end loop;

      -- Chặn tab bỗng trống: trước có phiếu đang theo dõi mà nay không còn
      -- dòng nào có mã thay đổi → nghi sheet bị xoá/đổi cấu trúc.
      if not exists (select 1 from jsonb_array_elements(v_values) with ordinality e(r, n)
                      where n > 1 and nullif(btrim(r ->> (v_idx ->> 'code')::int), '') is not null)
         and exists (select 1 from public.vmp_change_records c
                      where c.source_tab = v_tab and c.removed_from_sheet_at is null) then
        v_errors := array_append(v_errors, format('Tab "%s" không còn dòng nào có mã thay đổi.', v_tab));
      end if;
    end loop;
  end if;

  if cardinality(v_errors) > 0 then
    update public.vmp_change_sync_runs
       set status = 'loi', finished_at = now(), error = left(array_to_string(v_errors, ' '), 1000)
     where id = p_run_id;
    return jsonb_build_object('ok', false, 'error_code', 'SHEET_REJECTED',
      'error', array_to_string(v_errors, ' '));
  end if;

  -- Chặn bỏ hàng loạt: một lần đọc mà hơn nửa số phiếu đang theo dõi của một tab
  -- (từ 5 phiếu trở lên) mất dấu → nghi đọc sai cột, dừng để người kiểm.
  for v_tab in select unnest(v_tabs) loop
    select count(*) into v_active from public.vmp_change_records c
     where c.source_tab = v_tab and c.removed_from_sheet_at is null;
    select count(*) into v_drop from public.vmp_change_records c
     where c.source_tab = v_tab and c.removed_from_sheet_at is null
       and not exists (select 1 from pg_temp.cc_rows r
                        where r.source_tab = c.source_tab and r.change_code = c.change_code);
    if v_drop >= 5 and v_drop * 2 > v_active and not v_force then
      v_errors := array_append(v_errors, format(
        'Tab "%s": %s/%s phiếu bỗng mất dấu cần thẩm định — dừng để kiểm tra sheet.', v_tab, v_drop, v_active));
    end if;
  end loop;
  if cardinality(v_errors) > 0 then
    update public.vmp_change_sync_runs
       set status = 'loi', finished_at = now(), error = left(array_to_string(v_errors, ' '), 1000)
     where id = p_run_id;
    return jsonb_build_object('ok', false, 'error_code', 'SHEET_REJECTED',
      'error', array_to_string(v_errors, ' '));
  end if;

  -- Mã trùng trong cùng một tab: dòng dưới thắng (như cách đọc sheet nguồn).
  select count(*) - count(distinct (source_tab, change_code)) into v_dup from pg_temp.cc_rows;

  for v_rec in
    select distinct on (r.source_tab, r.change_code) r.*,
      -- Không tính số dòng: xoá/chèn dòng phía trên không phải là sửa phiếu.
      md5(concat_ws(E'\x1f', r.opened_text, r.department, r.change_class, r.change_type,
        r.change_content, r.sheet_status, r.owner_text, r.folder_link, r.validation_mark,
        r.validation_content, r.deadline_raw)) as h
    from pg_temp.cc_rows r
    order by r.source_tab, r.change_code, r.source_row desc
  loop
    select c.source_hash, c.removed_from_sheet_at into v_old_hash, v_old_removed
      from public.vmp_change_records c
     where c.source_tab = v_rec.source_tab and c.change_code = v_rec.change_code
     for update;
    if found then
      if v_old_hash is distinct from v_rec.h or v_old_removed is not null then
        -- Nhật ký GMP: giữ giá trị cũ của phần lấy từ sheet trước khi ghi đè.
        insert into public.audit_logs (id, user_id, action, table_name, record_id,
          old_data, new_data, source)
        select gen_random_uuid(), null, 'UPDATE'::audit_action, 'vmp_change_records', c.id::text,
          jsonb_build_object('change_code', c.change_code, 'change_content', c.change_content,
            'opened_text', c.opened_text, 'department', c.department, 'change_class', c.change_class,
            'change_type', c.change_type, 'folder_link', c.folder_link, 'validation_mark', c.validation_mark,
            'sheet_status', c.sheet_status, 'owner_text', c.owner_text,
            'validation_content', c.validation_content, 'deadline_raw', c.deadline_raw,
            'deadline_sheet', c.deadline_sheet, 'removed_from_sheet_at', c.removed_from_sheet_at),
          jsonb_build_object('change_code', v_rec.change_code, 'change_content', v_rec.change_content,
            'opened_text', v_rec.opened_text, 'department', v_rec.department, 'change_class', v_rec.change_class,
            'change_type', v_rec.change_type, 'folder_link', v_rec.folder_link, 'validation_mark', v_rec.validation_mark,
            'sheet_status', v_rec.sheet_status, 'owner_text', v_rec.owner_text,
            'validation_content', v_rec.validation_content, 'deadline_raw', v_rec.deadline_raw,
            'deadline_sheet', public.vmp_change_parse_deadline(v_rec.deadline_raw),
            'removed_from_sheet_at', null, 'sync_run_id', p_run_id),
          'vmp_change_sync_ingest'
        from public.vmp_change_records c
        where c.source_tab = v_rec.source_tab and c.change_code = v_rec.change_code;
        update public.vmp_change_records c set
          source_row = v_rec.source_row,
          opened_text = v_rec.opened_text,
          department = v_rec.department,
          change_class = v_rec.change_class,
          change_type = v_rec.change_type,
          change_content = v_rec.change_content,
          sheet_status = v_rec.sheet_status,
          owner_text = v_rec.owner_text,
          folder_link = v_rec.folder_link,
          needs_validation = true,
          validation_mark = v_rec.validation_mark,
          validation_content = v_rec.validation_content,
          deadline_raw = v_rec.deadline_raw,
          deadline_sheet = public.vmp_change_parse_deadline(v_rec.deadline_raw),
          source_hash = v_rec.h,
          last_seen_at = now(),
          removed_from_sheet_at = null,
          updated_at = now()
        where c.source_tab = v_rec.source_tab and c.change_code = v_rec.change_code;
        v_updated := v_updated + 1;
      else
        update public.vmp_change_records c set last_seen_at = now(), source_row = v_rec.source_row
         where c.source_tab = v_rec.source_tab and c.change_code = v_rec.change_code;
        v_unchanged := v_unchanged + 1;
      end if;
    else
      insert into public.vmp_change_records (
        source_tab, change_code, source_row, opened_text, department, change_class, change_type,
        change_content, sheet_status, owner_text, folder_link, needs_validation, validation_mark,
        validation_content, deadline_raw, deadline_sheet, source_hash, record_kind)
      values (
        v_rec.source_tab, v_rec.change_code, v_rec.source_row, v_rec.opened_text, v_rec.department,
        v_rec.change_class, v_rec.change_type, v_rec.change_content, v_rec.sheet_status,
        v_rec.owner_text, v_rec.folder_link, true, v_rec.validation_mark, v_rec.validation_content,
        v_rec.deadline_raw, public.vmp_change_parse_deadline(v_rec.deadline_raw), v_rec.h,
        v_rec.record_kind);
      insert into public.audit_logs (id, user_id, action, table_name, record_id, new_data, source)
      select gen_random_uuid(), null, 'INSERT'::audit_action, 'vmp_change_records', c.id::text,
        jsonb_build_object('change_code', c.change_code, 'source_tab', c.source_tab,
          'validation_content', c.validation_content, 'deadline_raw', c.deadline_raw,
          'deadline_sheet', c.deadline_sheet, 'sync_run_id', p_run_id),
        'vmp_change_sync_ingest'
      from public.vmp_change_records c
      where c.source_tab = v_rec.source_tab and c.change_code = v_rec.change_code;
      v_created := v_created + 1;
    end if;
  end loop;

  -- Phiếu của các tab vừa đọc mà không còn dấu cần thẩm định → đánh dấu, KHÔNG xoá.
  insert into public.audit_logs (id, user_id, action, table_name, record_id, old_data, new_data, source)
  select gen_random_uuid(), null, 'STATUS_CHANGE'::audit_action, 'vmp_change_records', c.id::text,
    jsonb_build_object('change_code', c.change_code, 'needs_validation', true, 'removed_from_sheet_at', null),
    jsonb_build_object('change_code', c.change_code, 'needs_validation', false,
      'removed_from_sheet_at', now(), 'sync_run_id', p_run_id),
    'vmp_change_sync_ingest'
  from public.vmp_change_records c
  where c.source_tab = any(v_tabs)
    and c.removed_from_sheet_at is null
    and not exists (select 1 from pg_temp.cc_rows r
                     where r.source_tab = c.source_tab and r.change_code = c.change_code);
  update public.vmp_change_records c
     set needs_validation = false, removed_from_sheet_at = now(), updated_at = now()
   where c.source_tab = any(v_tabs)
     and c.removed_from_sheet_at is null
     and not exists (select 1 from pg_temp.cc_rows r
                      where r.source_tab = c.source_tab and r.change_code = c.change_code);
  get diagnostics v_removed = row_count;

  v_summary := jsonb_build_object(
    'cho_phep_bo_hang_loat', v_force,
    'tabs', to_jsonb(v_tabs), 'rows_with_code', v_seen, 'created', v_created,
    'updated', v_updated, 'unchanged', v_unchanged, 'flagged_removed', v_removed,
    'duplicates', v_dup, 'marked_without_code', v_no_code);
  update public.vmp_change_sync_runs
     set status = 'xong', finished_at = now(), summary = v_summary, error = null
   where id = p_run_id;
  return jsonb_build_object('ok', true) || v_summary;
end
$$;

create or replace function public.vmp_change_record_json(p_uid uuid, p_id uuid, p_can_edit boolean)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id', c.id, 'record_kind', c.record_kind, 'source_tab', c.source_tab, 'change_code', c.change_code,
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
