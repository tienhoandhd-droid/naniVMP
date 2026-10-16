-- =====================================================================
-- 20261016190000_tham_dinh_ky_duyet.sql — KIỂM TRA · DUYỆT · KÝ ĐIỆN TỬ · KHOÁ
-- ---------------------------------------------------------------------
-- Gói 3 nâng cấp Thẩm định thực tế (docs/superpowers/specs/2026-10-16-
-- tham-dinh-thuc-te-nang-cap.md). Quyết định chủ dự án 16/10:
--   Người nhập → Kiểm tra (QA khác, trong danh sách QA phụ trách) → Duyệt
--   (Admin). Ba người khác nhau. Ký = nhập lại mật khẩu + ý nghĩa ký.
--   Sau duyệt hồ sơ khoá; Admin mở lại phải ghi lý do, rồi kiểm tra + duyệt
--   lại. Chữ ký cũ giữ nguyên trong lịch sử.
--   Kết quả không đạt/chưa đủ: bắt ghi mã deviation khi ký kiểm tra.
-- Căn cứ: EU GMP Annex 11 §14 (chữ ký điện tử gắn với bản ghi, có thời
-- điểm), 21 CFR 11.50/11.70/11.200 (tên, thời điểm, ý nghĩa; hai thành
-- phần định danh), Annex 15 §2.8 (sai lệch phải được ghi nhận).
--
-- Nhập lại mật khẩu: web đăng nhập lại bằng mật khẩu trong một phiên riêng
-- rồi gọi RPC ký bằng phiên đó; máy chủ kiểm claim `amr` của JWT có lần xác
-- thực mật khẩu trong 5 phút gần nhất — không tin lời khai của trình duyệt.
-- =====================================================================

begin;

create table if not exists cpc1_private.record_signatures (
  id bigint generated always as identity primary key,
  record_id uuid not null,
  version integer not null,
  y_nghia text not null check (y_nghia in ('kiem_tra', 'duyet', 'mo_lai')),
  actor_id uuid not null,
  ho_ten text not null,
  vai text not null,
  ly_do text check (ly_do is null or length(btrim(ly_do)) between 1 and 1000),
  ma_deviation text check (ma_deviation is null or length(btrim(ma_deviation)) between 1 and 60),
  xac_thuc_luc timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  foreign key (record_id, version) references public.cpc1_revisions(record_id, version),
  check (y_nghia <> 'mo_lai' or ly_do is not null)
);
create index if not exists record_signatures_record_idx on cpc1_private.record_signatures(record_id, created_at);
alter table cpc1_private.record_signatures enable row level security;
revoke all on table cpc1_private.record_signatures from public, anon, authenticated;

create or replace function cpc1_private.record_signatures_immutable() returns trigger
language plpgsql set search_path = '' as $function$
begin
  raise exception 'Chữ ký đã lưu không được sửa hay xoá.' using errcode = '42501';
end
$function$;
drop trigger if exists record_signatures_immutable on cpc1_private.record_signatures;
create trigger record_signatures_immutable before update or delete on cpc1_private.record_signatures
  for each row execute function cpc1_private.record_signatures_immutable();

-- Trạng thái ký của MỘT phiên bản: chỉ tính chữ ký sau lần mở lại gần nhất.
create or replace function cpc1_private.record_sign_state(p_record_id uuid, p_version integer)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  with mo as (
    select max(created_at) luc from cpc1_private.record_signatures
    where record_id = p_record_id and y_nghia = 'mo_lai'
  ), ky as (
    select s.* from cpc1_private.record_signatures s, mo
    where s.record_id = p_record_id and s.version = p_version
      and s.y_nghia in ('kiem_tra', 'duyet') and s.created_at > coalesce(mo.luc, '-infinity'::timestamptz)
  )
  select jsonb_build_object(
    'trang_thai', case when exists (select 1 from ky where y_nghia = 'duyet') then 'da_duyet'
                       when exists (select 1 from ky where y_nghia = 'kiem_tra') then 'da_kiem_tra'
                       else 'chua_ky' end,
    'nguoi_kiem_tra', (select actor_id from ky where y_nghia = 'kiem_tra' order by created_at desc limit 1))
$function$;

-- Những người đã lưu hồ sơ từ sau phiên bản được duyệt gần nhất (trước bản đang xét).
create or replace function cpc1_private.record_authors(p_record_id uuid, p_version integer)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(array_agg(distinct rv.actor_id) filter (where rv.actor_id is not null), '{}')
  from public.cpc1_revisions rv
  where rv.record_id = p_record_id and rv.version <= p_version
    and rv.version > coalesce((select max(s.version) from cpc1_private.record_signatures s
                               where s.record_id = p_record_id and s.y_nghia = 'duyet' and s.version < p_version), 0)
$function$;

-- Luật ký dùng chung cho RPC ký và RPC xem (để web chỉ hiện nút khi được ký).
-- Trả null nếu được ký, ngược lại {error_code, error}.
create or replace function cpc1_private.record_sign_check(p_record_id uuid, p_version integer, p_actor uuid, p_y_nghia text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  st jsonb := cpc1_private.record_sign_state(p_record_id, p_version);
  v_role text := public.vmp_business_role(p_actor);
  loi jsonb;
begin
  if p_y_nghia = 'kiem_tra' then
    if st->>'trang_thai' <> 'chua_ky' then
      loi := jsonb_build_object('error_code', 'WRONG_STATE', 'error', 'Phiên bản này đã được kiểm tra.');
    elsif p_actor = any(cpc1_private.record_authors(p_record_id, p_version)) then
      loi := jsonb_build_object('error_code', 'SAME_PERSON', 'error', 'Người nhập không tự kiểm tra hồ sơ của mình.');
    elsif not exists (select 1 from public.vmp_qa_phu_trach q join public.vmp_performers p on p.id = q.performer_id
                      where p.user_id = p_actor and coalesce(p.is_active, true)) then
      loi := jsonb_build_object('error_code', 'NOT_REVIEWER', 'error', 'Chỉ QA trong danh sách QA phụ trách được ký kiểm tra.');
    end if;
  elsif p_y_nghia = 'duyet' then
    if v_role is distinct from 'admin' then
      loi := jsonb_build_object('error_code', 'FORBIDDEN', 'error', 'Chỉ Admin được ký duyệt.');
    elsif st->>'trang_thai' = 'da_duyet' then
      loi := jsonb_build_object('error_code', 'WRONG_STATE', 'error', 'Phiên bản này đã được duyệt.');
    elsif st->>'trang_thai' <> 'da_kiem_tra' then
      loi := jsonb_build_object('error_code', 'WRONG_STATE', 'error', 'Cần ký kiểm tra trước khi duyệt.');
    elsif p_actor = any(cpc1_private.record_authors(p_record_id, p_version)) then
      loi := jsonb_build_object('error_code', 'SAME_PERSON', 'error', 'Người nhập không tự duyệt hồ sơ của mình.');
    elsif p_actor = (st->>'nguoi_kiem_tra')::uuid then
      loi := jsonb_build_object('error_code', 'SAME_PERSON', 'error', 'Người kiểm tra không đồng thời duyệt.');
    end if;
  elsif p_y_nghia = 'mo_lai' then
    if v_role is distinct from 'admin' then
      loi := jsonb_build_object('error_code', 'FORBIDDEN', 'error', 'Chỉ Admin được mở lại hồ sơ đã duyệt.');
    elsif st->>'trang_thai' <> 'da_duyet' then
      loi := jsonb_build_object('error_code', 'WRONG_STATE', 'error', 'Chỉ mở lại hồ sơ đã duyệt.');
    end if;
  else
    loi := jsonb_build_object('error_code', 'INVALID_MEANING', 'error', 'Ý nghĩa ký không hợp lệ.');
  end if;
  return loi;
end
$function$;

-- Khoá: không cho lưu phiên bản mới khi phiên bản hiện hành đã duyệt và chưa mở lại.
-- Đặt ở trigger nên chặn MỌI đường lưu (cpc1_save, cpc1_run_save cả hai bản).
create or replace function cpc1_private.guard_record_lock() returns trigger
language plpgsql security definer set search_path = '' as $function$
begin
  if new.version > 1 and cpc1_private.record_sign_state(new.record_id, new.version - 1)->>'trang_thai' = 'da_duyet' then
    raise exception 'Hồ sơ đã duyệt và đang khoá. Admin mở lại (ghi lý do) trước khi sửa.' using errcode = 'PT423';
  end if;
  return new;
end
$function$;
drop trigger if exists cpc1_record_lock_guard on public.cpc1_revisions;
create trigger cpc1_record_lock_guard before insert on public.cpc1_revisions
  for each row execute function cpc1_private.guard_record_lock();

create or replace function public.cpc1_record_signatures(p_record_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  u uuid := cpc1_private.viewer();
  v_version integer;
  v_overall text;
begin
  perform cpc1_private.require_record_pq(p_record_id, false);
  select version into v_version from public.cpc1_records where id = p_record_id;
  select evaluation->>'overall' into v_overall from public.cpc1_revisions where record_id = p_record_id and version = v_version;
  return jsonb_build_object('ok', true, 'version', v_version, 'ket_qua', v_overall,
    'bat_buoc_deviation', coalesce(v_overall, '') <> 'pass')
    || cpc1_private.record_sign_state(p_record_id, v_version) - 'nguoi_kiem_tra'
    || jsonb_build_object(
      'co_the', jsonb_build_object(
        'kiem_tra', cpc1_private.record_sign_check(p_record_id, v_version, u, 'kiem_tra') is null,
        'duyet', cpc1_private.record_sign_check(p_record_id, v_version, u, 'duyet') is null,
        'mo_lai', cpc1_private.record_sign_check(p_record_id, v_version, u, 'mo_lai') is null),
      'rows', coalesce((select jsonb_agg(jsonb_build_object(
          'version', s.version, 'y_nghia', s.y_nghia, 'ho_ten', s.ho_ten, 'vai', s.vai,
          'ly_do', s.ly_do, 'ma_deviation', s.ma_deviation, 'luc', s.created_at) order by s.created_at)
        from cpc1_private.record_signatures s where s.record_id = p_record_id), '[]'::jsonb));
end
$function$;

create or replace function public.cpc1_record_sign(p_record_id uuid, p_version integer, p_y_nghia text, p_ly_do text default null, p_ma_deviation text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  u uuid := cpc1_private.viewer();
  v_role text := public.vmp_business_role(u);
  v_version integer;
  v_overall text;
  v_xac_thuc timestamptz;
  v_ten text;
  loi jsonb;
begin
  perform cpc1_private.require_record_pq(p_record_id, false);
  -- Nhập lại mật khẩu trong 5 phút gần nhất (claim amr do máy chủ xác thực cấp).
  select to_timestamp(max((a->>'timestamp')::double precision)) into v_xac_thuc
  from jsonb_array_elements(case when jsonb_typeof(auth.jwt()->'amr') = 'array' then auth.jwt()->'amr' else '[]'::jsonb end) a
  where a->>'method' = 'password' and a->>'timestamp' ~ '^[0-9]+(\.[0-9]+)?$';
  if v_xac_thuc is null or v_xac_thuc < now() - interval '5 minutes' or v_xac_thuc > now() + interval '1 minute' then
    return jsonb_build_object('ok', false, 'error_code', 'REAUTH_REQUIRED', 'error', 'Cần nhập lại mật khẩu để ký.');
  end if;
  select version into v_version from public.cpc1_records where id = p_record_id for update;
  if v_version is distinct from p_version then
    return jsonb_build_object('ok', false, 'error_code', 'STALE', 'error', 'Hồ sơ đã có phiên bản mới. Tải lại trước khi ký.');
  end if;
  loi := cpc1_private.record_sign_check(p_record_id, v_version, u, p_y_nghia);
  if loi is not null then
    return jsonb_build_object('ok', false) || loi;
  end if;
  select evaluation->>'overall' into v_overall from public.cpc1_revisions where record_id = p_record_id and version = v_version;
  if p_y_nghia = 'kiem_tra' and coalesce(v_overall, '') <> 'pass' and nullif(btrim(coalesce(p_ma_deviation, '')), '') is null then
    return jsonb_build_object('ok', false, 'error_code', 'DEVIATION_REQUIRED',
      'error', 'Hồ sơ có kết quả không đạt hoặc chưa đủ: ghi mã deviation trước khi ký.');
  end if;
  if p_y_nghia = 'mo_lai' and nullif(btrim(coalesce(p_ly_do, '')), '') is null then
    return jsonb_build_object('ok', false, 'error_code', 'REASON_REQUIRED', 'error', 'Ghi lý do mở lại hồ sơ.');
  end if;
  select full_name into v_ten from public.profiles where id = u;
  insert into cpc1_private.record_signatures(record_id, version, y_nghia, actor_id, ho_ten, vai, ly_do, ma_deviation, xac_thuc_luc)
  values (p_record_id, v_version, p_y_nghia, u, coalesce(nullif(btrim(v_ten), ''), 'Không rõ'), v_role,
          nullif(btrim(coalesce(p_ly_do, '')), ''),
          case when p_y_nghia = 'kiem_tra' then nullif(btrim(coalesce(p_ma_deviation, '')), '') end, v_xac_thuc);
  insert into public.audit_logs(user_id, action, table_name, record_id, changed_fields, change_reason, new_data, source, effective_business_role)
  values (u, 'APPROVAL'::public.audit_action, 'cpc1_record_signatures', p_record_id::text || '/v' || v_version,
          array['y_nghia'], nullif(btrim(coalesce(p_ly_do, '')), ''),
          jsonb_build_object('y_nghia', p_y_nghia, 'ma_deviation', nullif(btrim(coalesce(p_ma_deviation, '')), '')),
          'cpc1_record_sign', v_role);
  return jsonb_build_object('ok', true) || cpc1_private.record_sign_state(p_record_id, v_version) - 'nguoi_kiem_tra';
end
$function$;

revoke all on function public.cpc1_record_signatures(uuid) from public, anon;
revoke all on function public.cpc1_record_sign(uuid, integer, text, text, text) from public, anon;
grant execute on function public.cpc1_record_signatures(uuid) to authenticated;
grant execute on function public.cpc1_record_sign(uuid, integer, text, text, text) to authenticated;

commit;
