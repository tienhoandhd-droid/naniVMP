-- =====================================================================
-- Thẩm định do thay đổi (22/10/2026)
--
-- Phiếu thay đổi (CC) cần thẩm định được n8n đọc từ sheet "Tổng hợp thay
-- đổi" của nhóm khác (CHỈ ĐỌC sheet), rồi đẩy vào đây qua
-- vmp_change_sync_ingest. Trên web, QA gắn phiếu với mã thiết bị và với các
-- đợt thẩm định của thiết bị đó.
--
-- Chỉ THÊM bảng/hàm mới. Không sửa dòng dữ liệu cũ, không đổi hàm cũ,
-- không thêm dòng vmp_screen_permissions (giao diện là một tab của màn
-- Dữ liệu nguồn).
--
-- Bảng bật RLS và không có policy: trình duyệt chỉ đi qua RPC bên dưới.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Bảng
-- ---------------------------------------------------------------------
create table if not exists public.vmp_change_records (
  id uuid primary key default gen_random_uuid(),
  -- Phần lấy từ sheet: mỗi lần đồng bộ ghi đè theo sheet.
  source_tab text not null check (btrim(source_tab) <> '' and char_length(source_tab) <= 100),
  change_code text not null check (btrim(change_code) <> '' and char_length(change_code) <= 100),
  source_row integer,
  opened_text text,
  department text,
  change_class text,
  change_type text,
  change_content text,
  sheet_status text,
  owner_text text,
  folder_link text,
  needs_validation boolean not null default true,
  validation_mark text,
  validation_content text,
  deadline_raw text,
  deadline_sheet date,
  source_hash text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  -- Sheet bỏ dấu cần thẩm định hoặc xoá dòng: không xoá phiếu, chỉ ghi mốc.
  removed_from_sheet_at timestamptz,
  -- Phần của web: đồng bộ không bao giờ ghi đè.
  deadline_override date check (deadline_override between date '2020-01-01' and date '2100-12-31'),
  handling_status text not null default 'cho_xu_ly'
    check (handling_status in ('cho_xu_ly', 'dang_tham_dinh', 'da_xong', 'khong_ap_dung')),
  note text check (char_length(note) <= 2000),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  unique (source_tab, change_code)
);

create table if not exists public.vmp_change_objects (
  change_id uuid not null references public.vmp_change_records(id) on delete cascade,
  object_code text not null references public.vmp_objects(code) on update cascade,
  added_by uuid,
  added_at timestamptz not null default now(),
  primary key (change_id, object_code)
);
create index if not exists vmp_change_objects_object_idx on public.vmp_change_objects(object_code);

create table if not exists public.vmp_change_plan_links (
  change_id uuid not null references public.vmp_change_records(id) on delete cascade,
  plan_item_id text not null references public.vmp_plan_items(id) on update cascade,
  linked_by uuid,
  linked_at timestamptz not null default now(),
  primary key (change_id, plan_item_id)
);
create index if not exists vmp_change_plan_links_plan_idx on public.vmp_change_plan_links(plan_item_id);

create table if not exists public.vmp_change_sync_runs (
  id uuid primary key default gen_random_uuid(),
  trigger_kind text not null check (trigger_kind in ('lich', 'nut')),
  requested_by uuid,
  requested_at timestamptz not null default now(),
  status text not null default 'cho' check (status in ('cho', 'dang_chay', 'xong', 'loi')),
  started_at timestamptz,
  finished_at timestamptz,
  summary jsonb,
  error text
);
create index if not exists vmp_change_sync_runs_status_idx on public.vmp_change_sync_runs(status, requested_at);

alter table public.vmp_change_records enable row level security;
alter table public.vmp_change_objects enable row level security;
alter table public.vmp_change_plan_links enable row level security;
alter table public.vmp_change_sync_runs enable row level security;
revoke all on public.vmp_change_records, public.vmp_change_objects,
  public.vmp_change_plan_links, public.vmp_change_sync_runs from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. Hàm nền
-- ---------------------------------------------------------------------

-- Đọc deadline trong ô sheet. Ô có thể là ngày ("30/10/2026") hoặc chữ
-- ("Nhịp 1: 10/2026 ... Cuối tháng 10/2026", "15/11/2026 - 30/11/2026").
-- Lấy NGÀY MUỘN NHẤT đọc được (chủ dự án chốt 22/10). "mm/yyyy" = cuối tháng.
-- Ngày không có thật (31/02) bị bỏ qua. Ngoài 2020..2100 bị bỏ qua.
create or replace function public.vmp_change_parse_deadline(p_text text)
returns date
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_text text := coalesce(p_text, '');
  v_best date;
  v_d date;
  m text[];
  y int; mo int; d int;
begin
  -- dd/mm/yyyy (cho phép / . -)
  for m in select regexp_matches(v_text, '(?<!\d)(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?!\d)', 'g') loop
    d := m[1]::int; mo := m[2]::int; y := m[3]::int;
    if mo between 1 and 12 and y between 2020 and 2100
       and d between 1 and extract(day from (make_date(y, mo, 1) + interval '1 month - 1 day'))::int then
      v_d := make_date(y, mo, d);
      v_best := greatest(v_best, v_d);
    end if;
  end loop;
  -- yyyy-mm-dd
  for m in select regexp_matches(v_text, '(\d{4})-(\d{1,2})-(\d{1,2})', 'g') loop
    y := m[1]::int; mo := m[2]::int; d := m[3]::int;
    if mo between 1 and 12 and y between 2020 and 2100
       and d between 1 and extract(day from (make_date(y, mo, 1) + interval '1 month - 1 day'))::int then
      v_d := make_date(y, mo, d);
      v_best := greatest(v_best, v_d);
    end if;
  end loop;
  -- mm/yyyy đứng riêng → cuối tháng. Không lấy đuôi của dd/mm/yyyy và "Q4/2026" (quý);
  -- vẫn đọc "T10/2026", "tháng10/2026", "10/2026-11/2026".
  for m in select regexp_matches(v_text, '(?<![\d/.Qq])(\d{1,2})/(\d{4})(?![\d/])', 'g') loop
    mo := m[1]::int; y := m[2]::int;
    if mo between 1 and 12 and y between 2020 and 2100 then
      v_d := (make_date(y, mo, 1) + interval '1 month - 1 day')::date;
      v_best := greatest(v_best, v_d);
    end if;
  end loop;
  return v_best;
end
$$;

-- Tiêu đề cột: bỏ khoảng trắng thừa/xuống dòng, chữ thường, NFC.
create or replace function public.vmp_change_header_key(p_text text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select lower(btrim(regexp_replace(normalize(coalesce(p_text, ''), NFC), '\s+', ' ', 'g')))
$$;

-- Ai được sửa phần web của phiếu: Admin, Quản lý QA, Nhân viên QA đang hoạt động.
create or replace function public.vmp_change_can_edit(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    public.vmp_is_active_session(p_uid)
    and public.vmp_business_role(p_uid) in ('admin', 'qa_manager', 'qa_staff'),
    false)
$$;

-- Ai tạo được đợt thẩm định mới: đúng luật của rpc_create_plan_item có sẵn
-- (quyền 'edit_catalog' theo vai đăng nhập) — không mở rộng thêm.
create or replace function public.vmp_change_can_create_plan(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    public.vmp_change_can_edit(p_uid)
    and public.duoc_phep('edit_catalog', (select p.role::text from public.profiles p where p.id = p_uid)),
    false)
$$;

-- Ai xem được một phiếu: QA xem tất cả; xưởng chỉ xem phiếu có thiết bị
-- mà họ xem được ít nhất một đợt thẩm định (cùng biên với màn Tiến độ).
create or replace function public.vmp_change_can_view(p_uid uuid, p_change_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    public.vmp_is_active_session(p_uid)
    and case public.vmp_business_role(p_uid)
      when 'admin' then true
      when 'qa_manager' then true
      when 'qa_staff' then true
      when 'workshop_manager' then exists (
        select 1 from public.vmp_change_objects co
        join public.vmp_plan_items p on p.object_code = co.object_code and p.is_active
        where co.change_id = p_change_id
          and public.vmp_can_view_plan_item(p_uid, p.validation_code))
      when 'workshop_staff' then exists (
        select 1 from public.vmp_change_objects co
        join public.vmp_plan_items p on p.object_code = co.object_code and p.is_active
        where co.change_id = p_change_id
          and public.vmp_can_view_plan_item(p_uid, p.validation_code))
      else false
    end,
    false)
$$;

-- ---------------------------------------------------------------------
-- 3. Đồng bộ (chỉ n8n gọi, không mở cho web)
-- ---------------------------------------------------------------------

-- n8n gọi mỗi 2 phút. Trả 0 hoặc 1 dòng: lượt chạy cần làm ngay.
-- Có yêu cầu từ nút "Làm mới" → lấy yêu cầu đó.
-- Không có → nếu đã qua 06:00 giờ VN mà hôm nay chưa có lượt thành công
-- (và giờ qua chưa thử lượt lịch nào) → tạo lượt lịch.
create or replace function public.vmp_change_sync_next()
returns table (run_id uuid, trigger_kind text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_kind text;
  v_local timestamp := now() at time zone 'Asia/Ho_Chi_Minh';
begin
  if coalesce(auth.role(), '') not in ('', 'service_role') then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('vmp_change_sync', 0));

  update public.vmp_change_sync_runs
     set status = 'loi', finished_at = now(), error = 'Quá 15 phút chưa xong — coi như lỗi.'
   where status = 'dang_chay' and started_at < now() - interval '15 minutes';
  if exists (select 1 from public.vmp_change_sync_runs r where r.status = 'dang_chay') then
    return;
  end if;

  select r.id, r.trigger_kind into v_id, v_kind
    from public.vmp_change_sync_runs r
   where r.status = 'cho'
   order by r.requested_at
   limit 1
   for update;

  if v_id is null
     and v_local::time >= time '06:00'
     and not exists (
       select 1 from public.vmp_change_sync_runs r
        where r.status = 'xong'
          and (r.finished_at at time zone 'Asia/Ho_Chi_Minh') >= v_local::date + time '06:00')
     and not exists (
       select 1 from public.vmp_change_sync_runs r
        where r.trigger_kind = 'lich' and r.requested_at > now() - interval '1 hour') then
    insert into public.vmp_change_sync_runs(trigger_kind, status)
    values ('lich', 'cho')
    returning id, vmp_change_sync_runs.trigger_kind into v_id, v_kind;
  end if;

  if v_id is null then
    return;
  end if;
  update public.vmp_change_sync_runs set status = 'dang_chay', started_at = now() where id = v_id;
  run_id := v_id;
  trigger_kind := v_kind;
  return next;
end
$$;

-- Lối vượt có kiểm soát cho bước chặn "bỏ dấu hàng loạt": khi chủ dự án đã
-- kiểm sheet và xác nhận nhóm kia bỏ dấu thật, Admin chạy (SQL editor, quyền
-- service_role/postgres):  select public.vmp_change_sync_force_next('lý do');
-- Hàm xếp MỘT lượt được phép vượt ngưỡng; n8n chạy nó ở lần hỏi kế tiếp.
create or replace function public.vmp_change_sync_force_next(p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if coalesce(auth.role(), '') not in ('', 'service_role') then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 10 then
    return jsonb_build_object('ok', false, 'error', 'Ghi lý do ít nhất 10 ký tự.');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('vmp_change_sync', 0));
  insert into public.vmp_change_sync_runs(trigger_kind, status, summary)
  values ('nut', 'cho', jsonb_build_object('cho_phep_bo_hang_loat', true, 'ly_do', btrim(p_reason)))
  returning id into v_id;
  insert into public.audit_logs (id, user_id, action, table_name, record_id, new_data, change_reason, source)
  values (gen_random_uuid(), null, 'CONFIG_CHANGE'::audit_action, 'vmp_change_sync_runs', v_id::text,
    jsonb_build_object('cho_phep_bo_hang_loat', true), btrim(p_reason), 'vmp_change_sync_force_next');
  return jsonb_build_object('ok', true, 'run_id', v_id);
end
$$;

-- Ghi lỗi của n8n (không đọc được sheet, hết quyền Google...).
create or replace function public.vmp_change_sync_fail(p_run_id uuid, p_error text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(auth.role(), '') not in ('', 'service_role') then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  update public.vmp_change_sync_runs
     set status = 'loi', finished_at = now(),
         error = left(coalesce(nullif(btrim(p_error), ''), 'Lỗi không rõ khi đọc sheet.'), 1000)
   where id = p_run_id and status = 'dang_chay';
  return jsonb_build_object('ok', found);
end
$$;

-- Nhận nguyên kết quả Google Sheets values:batchGet:
--   {"valueRanges":[{"range":"'2026'!A1:AA2000","values":[[tiêu đề...],[...],...]}, ...]}
-- Kiểm hết rồi mới ghi. Sai dạng / thiếu cột / tab trống bất thường → lượt
-- chạy 'loi', KHÔNG đổi dữ liệu.
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
    validation_mark text, validation_content text, deadline_raw text
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
      for v_i in 0 .. coalesce(jsonb_array_length(v_header), 0) - 1 loop
        v_k := public.vmp_change_header_key(v_header ->> v_i);
        v_k := case
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
        from unnest(array['code', 'mark', 'vcontent', 'deadline', 'content']) x
       where not (v_idx ? x);
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
        if v_code is null then
          v_no_code := v_no_code + 1;
          continue;
        end if;
        insert into pg_temp.cc_rows values (
          v_tab, left(v_code, 100), v_rowno + 1,
          nullif(btrim(v_row ->> (v_idx ->> 'opened')::int), ''),
          nullif(btrim(v_row ->> (v_idx ->> 'dept')::int), ''),
          nullif(btrim(v_row ->> (v_idx ->> 'class')::int), ''),
          nullif(btrim(v_row ->> (v_idx ->> 'type')::int), ''),
          nullif(btrim(v_row ->> (v_idx ->> 'content')::int), ''),
          nullif(btrim(v_row ->> (v_idx ->> 'status')::int), ''),
          nullif(btrim(v_row ->> (v_idx ->> 'owner')::int), ''),
          nullif(btrim(v_row ->> (v_idx ->> 'link')::int), ''),
          v_mark,
          nullif(btrim(v_row ->> (v_idx ->> 'vcontent')::int), ''),
          nullif(btrim(v_row ->> (v_idx ->> 'deadline')::int), ''));
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
        validation_content, deadline_raw, deadline_sheet, source_hash)
      values (
        v_rec.source_tab, v_rec.change_code, v_rec.source_row, v_rec.opened_text, v_rec.department,
        v_rec.change_class, v_rec.change_type, v_rec.change_content, v_rec.sheet_status,
        v_rec.owner_text, v_rec.folder_link, true, v_rec.validation_mark, v_rec.validation_content,
        v_rec.deadline_raw, public.vmp_change_parse_deadline(v_rec.deadline_raw), v_rec.h);
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

-- ---------------------------------------------------------------------
-- 4. RPC cho web
-- ---------------------------------------------------------------------

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
                                          'department', o.department) order by o.code)
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

create or replace function public.rpc_change_list()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_can_edit boolean;
  v_last record;
begin
  if not public.vmp_is_active_session(v_uid) then
    return public.vmp_session_denial();
  end if;
  if public.vmp_business_role(v_uid) is null then
    return public.vmp_session_denial();
  end if;
  v_can_edit := public.vmp_change_can_edit(v_uid);
  -- Yêu cầu chờ quá 15 phút mà n8n chưa nhận → báo lỗi thay vì "đang cập nhật" mãi.
  select case when r.status = 'cho' and r.requested_at < now() - interval '15 minutes' then 'loi' else r.status end,
         r.trigger_kind, r.requested_at, r.finished_at,
         case when r.status = 'cho' and r.requested_at < now() - interval '15 minutes'
              then 'n8n chưa nhận yêu cầu sau 15 phút — kiểm tra workflow Vani VMP 8.' else r.error end,
         r.summary
    into v_last
    from public.vmp_change_sync_runs r
   order by r.requested_at desc
   limit 1;
  return jsonb_build_object(
    'ok', true,
    'can_edit', v_can_edit,
    'can_create_plan', public.vmp_change_can_create_plan(v_uid),
    'records', coalesce((
      select jsonb_agg(public.vmp_change_record_json(v_uid, c.id, v_can_edit)
                       order by (c.removed_from_sheet_at is not null),
                                coalesce(c.deadline_override, c.deadline_sheet) nulls last,
                                c.change_code)
        from public.vmp_change_records c
       where public.vmp_change_can_view(v_uid, c.id)), '[]'::jsonb),
    'sync', jsonb_build_object(
      'last_ok_at', (select max(r.finished_at) from public.vmp_change_sync_runs r where r.status = 'xong'),
      'last_status', v_last.status,
      'last_trigger', v_last.trigger_kind,
      'last_requested_at', v_last.requested_at,
      'last_finished_at', v_last.finished_at,
      -- Lỗi kỹ thuật chỉ hiện cho người sửa được.
      'last_error', case when v_can_edit then v_last.error end,
      'last_summary', case when v_can_edit then v_last.summary end));
end
$$;

-- Gợi ý mã thiết bị khi gõ (chỉ người sửa).
create or replace function public.rpc_change_search_objects(p_query text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_q text := btrim(coalesce(p_query, ''));
begin
  if not public.vmp_change_can_edit(auth.uid()) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  if char_length(v_q) < 2 then
    return '[]'::jsonb;
  end if;
  v_q := left(v_q, 80);
  return coalesce((
    select jsonb_agg(jsonb_build_object('code', o.code, 'name', o.name, 'department', o.department))
      from (select o.code, o.name, o.department
              from public.vmp_objects o
             where o.is_active
               and (o.code ilike '%' || v_q || '%' or o.name ilike '%' || v_q || '%')
             order by (o.code ilike v_q || '%') desc, o.code
             limit 20) o), '[]'::jsonb);
end
$$;

-- Lưu phần web của một phiếu trong MỘT lần: thiết bị, đợt thẩm định, hạn, trạng thái, ghi chú.
create or replace function public.rpc_change_save(
  p_change_id uuid,
  p_expected_version integer,
  p_object_codes text[],
  p_plan_item_ids text[],
  p_deadline_override date,
  p_handling_status text,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_role text := public.vmp_business_role(auth.uid());
  v_old public.vmp_change_records%rowtype;
  v_codes text[];
  v_plans text[];
  v_bad text[];
  v_old_objects text[];
  v_old_plans text[];
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_ver integer;
begin
  if not public.vmp_is_active_session(v_uid) then
    return public.vmp_session_denial();
  end if;
  if not public.vmp_change_can_edit(v_uid) then
    return jsonb_build_object('ok', false, 'error_code', 'FORBIDDEN',
      'error', 'Chỉ QA được sửa phiếu thay đổi.');
  end if;
  if p_expected_version is null then
    return jsonb_build_object('ok', false, 'error_code', 'VERSION_REQUIRED',
      'error', 'Thiếu phiên bản — tải lại rồi sửa.');
  end if;

  select * into v_old from public.vmp_change_records where id = p_change_id for update;
  if v_old.id is null then
    return jsonb_build_object('ok', false, 'error_code', 'NOT_FOUND', 'error', 'Không còn phiếu này.');
  end if;
  if v_old.version is distinct from p_expected_version then
    return jsonb_build_object('ok', false, 'error_code', 'VERSION_CONFLICT',
      'error', 'Người khác vừa sửa phiếu này. Tải lại rồi sửa tiếp.',
      'current_version', v_old.version);
  end if;

  if p_handling_status is null
     or p_handling_status not in ('cho_xu_ly', 'dang_tham_dinh', 'da_xong', 'khong_ap_dung') then
    return jsonb_build_object('ok', false, 'error_code', 'INVALID_INPUT',
      'error', 'Trạng thái xử lý không hợp lệ.');
  end if;
  if p_deadline_override is not null
     and p_deadline_override not between date '2020-01-01' and date '2100-12-31' then
    return jsonb_build_object('ok', false, 'error_code', 'INVALID_INPUT',
      'error', 'Hạn phải trong khoảng 2020–2100.');
  end if;
  if char_length(coalesce(v_note, '')) > 2000 then
    return jsonb_build_object('ok', false, 'error_code', 'INVALID_INPUT',
      'error', 'Ghi chú tối đa 2000 ký tự.');
  end if;

  -- Mã thiết bị: bỏ trống/trùng, so khớp đúng mã trong danh mục.
  select coalesce(array_agg(distinct btrim(x)) filter (where nullif(btrim(x), '') is not null), '{}')
    into v_codes from unnest(coalesce(p_object_codes, '{}')) x;
  if cardinality(v_codes) > 30 then
    return jsonb_build_object('ok', false, 'error_code', 'INVALID_INPUT',
      'error', 'Một phiếu gắn tối đa 30 thiết bị.');
  end if;
  -- Thiết bị đã gắn từ trước được giữ dù đã ngừng; thiết bị MỚI phải đang hoạt động.
  select array_agg(x order by x) into v_bad
    from unnest(v_codes) x
   where not exists (select 1 from public.vmp_objects o
                      where o.code = x
                        and (o.is_active or exists (select 1 from public.vmp_change_objects co
                                                     where co.change_id = p_change_id and co.object_code = x)));
  if v_bad is not null then
    return jsonb_build_object('ok', false, 'error_code', 'OBJECT_NOT_FOUND',
      'error', 'Chưa có trong danh mục: ' || array_to_string(v_bad, ', '),
      'codes', to_jsonb(v_bad));
  end if;

  -- Đợt thẩm định: phải có thật và thuộc một thiết bị đã gắn.
  select coalesce(array_agg(distinct btrim(x)) filter (where nullif(btrim(x), '') is not null), '{}')
    into v_plans from unnest(coalesce(p_plan_item_ids, '{}')) x;
  if cardinality(v_plans) > 100 then
    return jsonb_build_object('ok', false, 'error_code', 'INVALID_INPUT',
      'error', 'Một phiếu gắn tối đa 100 đợt thẩm định.');
  end if;
  select array_agg(x order by x) into v_bad
    from unnest(v_plans) x
   where not exists (select 1 from public.vmp_plan_items p
                      where p.id = x and p.object_code = any(v_codes)
                        and (p.is_active or exists (select 1 from public.vmp_change_plan_links l
                                                     where l.change_id = p_change_id and l.plan_item_id = x)));
  if v_bad is not null then
    return jsonb_build_object('ok', false, 'error_code', 'PLAN_NOT_IN_OBJECTS',
      'error', 'Đợt không thuộc thiết bị đã gắn: ' || array_to_string(v_bad, ', '),
      'plan_item_ids', to_jsonb(v_bad));
  end if;

  select coalesce(array_agg(object_code order by object_code), '{}') into v_old_objects
    from public.vmp_change_objects where change_id = p_change_id;
  select coalesce(array_agg(plan_item_id order by plan_item_id), '{}') into v_old_plans
    from public.vmp_change_plan_links where change_id = p_change_id;

  delete from public.vmp_change_plan_links
   where change_id = p_change_id and plan_item_id <> all(v_plans);
  delete from public.vmp_change_objects
   where change_id = p_change_id and object_code <> all(v_codes);
  insert into public.vmp_change_objects(change_id, object_code, added_by)
  select p_change_id, x, v_uid from unnest(v_codes) x
  on conflict do nothing;
  insert into public.vmp_change_plan_links(change_id, plan_item_id, linked_by)
  select p_change_id, x, v_uid from unnest(v_plans) x
  on conflict do nothing;

  update public.vmp_change_records
     set deadline_override = p_deadline_override,
         handling_status = p_handling_status,
         note = v_note,
         version = version + 1,
         updated_at = now(),
         updated_by = v_uid
   where id = p_change_id
  returning version into v_ver;

  insert into public.audit_logs (id, user_id, action, table_name, record_id,
    old_data, new_data, source, effective_business_role)
  values (gen_random_uuid(), v_uid, 'UPDATE'::audit_action, 'vmp_change_records', p_change_id::text,
    jsonb_build_object('change_code', v_old.change_code, 'objects', to_jsonb(v_old_objects),
      'plan_items', to_jsonb(v_old_plans), 'deadline_override', v_old.deadline_override,
      'handling_status', v_old.handling_status, 'note', v_old.note),
    jsonb_build_object('change_code', v_old.change_code, 'objects', to_jsonb(v_codes),
      'plan_items', to_jsonb(v_plans), 'deadline_override', p_deadline_override,
      'handling_status', p_handling_status, 'note', v_note),
    'rpc_change_save', v_role);

  return jsonb_build_object('ok', true, 'version', v_ver);
end
$$;

-- Tạo đợt tái thẩm định cho một thiết bị đã gắn rồi gắn luôn vào phiếu.
-- Việc tạo đi qua rpc_create_plan_item có sẵn (giữ nguyên mọi luật của nó).
create or replace function public.rpc_change_create_plan_item(
  p_change_id uuid,
  p_expected_version integer,
  p_object_code text,
  p_validation_type text,
  p_year integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_role text := public.vmp_business_role(auth.uid());
  v_rec public.vmp_change_records%rowtype;
  v_obj text := btrim(coalesce(p_object_code, ''));
  v_type text := btrim(coalesce(p_validation_type, ''));
  v_occ integer;
  v_prefix text;
  v_res jsonb;
  v_code text;
  v_ver integer;
begin
  if not public.vmp_is_active_session(v_uid) then
    return public.vmp_session_denial();
  end if;
  if not public.vmp_change_can_edit(v_uid) then
    return jsonb_build_object('ok', false, 'error_code', 'FORBIDDEN',
      'error', 'Chỉ QA được tạo đợt từ phiếu thay đổi.');
  end if;
  if not public.vmp_change_can_create_plan(v_uid) then
    return jsonb_build_object('ok', false, 'error_code', 'FORBIDDEN',
      'error', 'Chỉ Admin hoặc Quản lý QA được tạo đợt thẩm định mới.');
  end if;
  if p_expected_version is null then
    return jsonb_build_object('ok', false, 'error_code', 'VERSION_REQUIRED',
      'error', 'Thiếu phiên bản — tải lại rồi sửa.');
  end if;
  select * into v_rec from public.vmp_change_records where id = p_change_id for update;
  if v_rec.id is null then
    return jsonb_build_object('ok', false, 'error_code', 'NOT_FOUND', 'error', 'Không còn phiếu này.');
  end if;
  if v_rec.version is distinct from p_expected_version then
    return jsonb_build_object('ok', false, 'error_code', 'VERSION_CONFLICT',
      'error', 'Người khác vừa sửa phiếu này. Tải lại rồi sửa tiếp.',
      'current_version', v_rec.version);
  end if;
  if not exists (select 1 from public.vmp_change_objects
                  where change_id = p_change_id and object_code = v_obj) then
    return jsonb_build_object('ok', false, 'error_code', 'OBJECT_NOT_LINKED',
      'error', 'Gắn thiết bị vào phiếu và lưu trước khi tạo đợt.');
  end if;
  if p_year is null or p_year < 2020 or p_year > 2100 then
    return jsonb_build_object('ok', false, 'error_code', 'INVALID_INPUT',
      'error', 'Năm phải trong khoảng 2020–2100.');
  end if;

  -- Lần kế tiếp của cùng thiết bị/loại/năm: {mã}/{năm}.{NN}-{loại}
  perform pg_advisory_xact_lock(hashtextextended('vmp_plan_occurrence:' || v_obj || ':' || v_type || ':' || p_year, 0));
  v_prefix := v_obj || '/' || p_year || '.';
  select coalesce(max(substring(p.validation_code, char_length(v_prefix) + 1, 2)::int), 0) + 1
    into v_occ
    from public.vmp_plan_items p
   where p.object_code = v_obj
     and left(p.validation_code, char_length(v_prefix)) = v_prefix
     and substring(p.validation_code, char_length(v_prefix) + 1) =
         substring(p.validation_code, char_length(v_prefix) + 1, 2) || '-' || v_type
     and substring(p.validation_code, char_length(v_prefix) + 1, 2) ~ '^\d{2}$';

  v_res := public.rpc_create_plan_item(v_obj, v_type, p_year, v_occ, '{}'::jsonb);
  if (v_res ->> 'ok')::boolean is not true then
    return jsonb_build_object('ok', false, 'error_code', coalesce(v_res ->> 'error_code', 'CREATE_FAILED'),
      'error', coalesce(v_res ->> 'error', 'Không tạo được đợt thẩm định.'));
  end if;
  v_code := v_res ->> 'validation_code';

  insert into public.vmp_change_plan_links(change_id, plan_item_id, linked_by)
  values (p_change_id, v_code, v_uid)
  on conflict do nothing;
  update public.vmp_change_records
     set version = version + 1, updated_at = now(), updated_by = v_uid,
         handling_status = case when handling_status = 'cho_xu_ly' then 'dang_tham_dinh'
                                else handling_status end
   where id = p_change_id
  returning version into v_ver;

  insert into public.audit_logs (id, user_id, action, table_name, record_id,
    new_data, source, effective_business_role)
  values (gen_random_uuid(), v_uid, 'INSERT'::audit_action, 'vmp_change_plan_links', p_change_id::text,
    jsonb_build_object('change_code', v_rec.change_code, 'plan_item_id', v_code,
      'handling_status_old', v_rec.handling_status,
      'handling_status', (select handling_status from public.vmp_change_records where id = p_change_id)),
    'rpc_change_create_plan_item', v_role);

  return jsonb_build_object('ok', true, 'validation_code', v_code, 'version', v_ver);
end
$$;

-- Nút "Làm mới": xếp một yêu cầu cho n8n. Đã có lượt chờ/đang chạy thì
-- trả lượt đó, không xếp thêm.
create or replace function public.rpc_change_request_sync()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_status text;
begin
  if not public.vmp_is_active_session(v_uid) then
    return public.vmp_session_denial();
  end if;
  if not public.vmp_change_can_edit(v_uid) then
    return jsonb_build_object('ok', false, 'error_code', 'FORBIDDEN',
      'error', 'Chỉ QA được làm mới dữ liệu thay đổi.');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('vmp_change_sync', 0));
  update public.vmp_change_sync_runs
     set status = 'loi', finished_at = now(), error = 'n8n chưa nhận yêu cầu sau 15 phút.'
   where status = 'cho' and requested_at < now() - interval '15 minutes';
  select id, status into v_id, v_status from public.vmp_change_sync_runs
   where status in ('cho', 'dang_chay') order by requested_at limit 1;
  if v_id is not null then
    return jsonb_build_object('ok', true, 'run_id', v_id, 'status', v_status, 'already', true);
  end if;
  insert into public.vmp_change_sync_runs(trigger_kind, requested_by, status)
  values ('nut', v_uid, 'cho') returning id into v_id;
  insert into public.audit_logs (id, user_id, action, table_name, record_id, new_data, source,
    effective_business_role)
  values (gen_random_uuid(), v_uid, 'INSERT'::audit_action, 'vmp_change_sync_runs', v_id::text,
    jsonb_build_object('trigger_kind', 'nut'), 'rpc_change_request_sync', public.vmp_business_role(v_uid));
  return jsonb_build_object('ok', true, 'run_id', v_id, 'status', 'cho', 'already', false);
end
$$;

-- Nhãn "Do CC-..." trên màn Tiến độ: đợt nào được gắn với phiếu nào.
create or replace function public.rpc_change_plan_badges()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_all boolean;
begin
  if not public.vmp_is_active_session(v_uid) or public.vmp_business_role(v_uid) is null then
    return public.vmp_session_denial();
  end if;
  v_all := public.vmp_business_role(v_uid) in ('admin', 'qa_manager', 'qa_staff');
  return jsonb_build_object('ok', true, 'badges', coalesce((
    select jsonb_agg(jsonb_build_object('plan_item_id', l.plan_item_id,
                                        'change_codes', l.codes) order by l.plan_item_id)
      from (select pl.plan_item_id, jsonb_agg(c.change_code order by c.change_code) codes
              from public.vmp_change_plan_links pl
              join public.vmp_change_records c on c.id = pl.change_id
              join public.vmp_plan_items p on p.id = pl.plan_item_id
             where v_all or public.vmp_can_view_plan_item(v_uid, p.validation_code)
             group by pl.plan_item_id) l), '[]'::jsonb));
end
$$;

-- ---------------------------------------------------------------------
-- 5. Quyền thực thi
-- ---------------------------------------------------------------------
revoke all on function public.vmp_change_parse_deadline(text) from public, anon;
revoke all on function public.vmp_change_header_key(text) from public, anon;
revoke all on function public.vmp_change_can_edit(uuid) from public, anon, authenticated;
revoke all on function public.vmp_change_can_view(uuid, uuid) from public, anon, authenticated;
revoke all on function public.vmp_change_can_create_plan(uuid) from public, anon, authenticated;
revoke all on function public.vmp_change_record_json(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.vmp_change_sync_next() from public, anon, authenticated;
revoke all on function public.vmp_change_sync_fail(uuid, text) from public, anon, authenticated;
revoke all on function public.vmp_change_sync_force_next(text) from public, anon, authenticated;
grant execute on function public.vmp_change_sync_force_next(text) to service_role;
revoke all on function public.vmp_change_sync_ingest(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.vmp_change_sync_next() to service_role;
grant execute on function public.vmp_change_sync_fail(uuid, text) to service_role;
grant execute on function public.vmp_change_sync_ingest(uuid, jsonb) to service_role;

revoke all on function public.rpc_change_list() from public, anon;
revoke all on function public.rpc_change_search_objects(text) from public, anon;
revoke all on function public.rpc_change_save(uuid, integer, text[], text[], date, text, text) from public, anon;
revoke all on function public.rpc_change_create_plan_item(uuid, integer, text, text, integer) from public, anon;
revoke all on function public.rpc_change_request_sync() from public, anon;
revoke all on function public.rpc_change_plan_badges() from public, anon;
grant execute on function public.rpc_change_list() to authenticated, service_role;
grant execute on function public.rpc_change_search_objects(text) to authenticated, service_role;
grant execute on function public.rpc_change_save(uuid, integer, text[], text[], date, text, text) to authenticated, service_role;
grant execute on function public.rpc_change_create_plan_item(uuid, integer, text, text, integer) to authenticated, service_role;
grant execute on function public.rpc_change_request_sync() to authenticated, service_role;
grant execute on function public.rpc_change_plan_badges() to authenticated, service_role;
