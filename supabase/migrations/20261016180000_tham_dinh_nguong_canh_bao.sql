-- =====================================================================
-- 20261016180000_tham_dinh_nguong_canh_bao.sql — NGƯỠNG CẢNH BÁO / HÀNH ĐỘNG
-- ---------------------------------------------------------------------
-- Gói 4 nâng cấp Thẩm định thực tế. Annex 1 §6.13, §9.9: alert level đặt từ
-- dữ liệu thẩm định, xem lại định kỳ; §6.14: vượt alert phải ghi nhận, vượt
-- action phải điều tra. Quyết định chủ dự án 16/10: Admin nhập ngưỡng (có
-- phiên bản, ngày hiệu lực, lý do); máy chỉ GỢI Ý từ lịch sử, không tự áp.
--
-- Mỗi lần đặt/đổi ngưỡng là một dòng mới (phiên bản tăng dần cho cùng khoá
-- hệ thống/biểu mẫu/chỉ tiêu/điểm) — không UPDATE, không DELETE, để lịch sử
-- ngưỡng luôn truy vết được. point_id rỗng = áp cho mọi điểm của chỉ tiêu.
-- =====================================================================

begin;

create table if not exists cpc1_private.trend_limits (
  id bigint generated always as identity primary key,
  system text not null check (system in ('steam', 'air', 'nitrogen')),
  form text not null check (form ~ '^bm0[1-7]$'),
  metric text not null check (metric ~ '^[a-z0-9_]{1,40}$'),
  point_id text not null default '' check (length(point_id) <= 80),
  unit text not null check (length(unit) between 1 and 20),
  direction text not null check (direction in ('max', 'min')),
  alert_level numeric not null,
  action_level numeric not null,
  hieu_luc_tu date not null,
  ly_do text not null check (length(btrim(ly_do)) between 1 and 500),
  phien_ban integer not null,
  actor_id uuid not null,
  created_at timestamptz not null default now(),
  unique (system, form, metric, point_id, phien_ban),
  check ((direction = 'max' and alert_level < action_level) or (direction = 'min' and alert_level > action_level))
);
alter table cpc1_private.trend_limits enable row level security;
revoke all on table cpc1_private.trend_limits from public, anon, authenticated;

create or replace function cpc1_private.trend_limits_immutable() returns trigger
language plpgsql set search_path = '' as $function$
begin
  raise exception 'Ngưỡng đã lưu không được sửa hay xoá — đặt phiên bản mới.' using errcode = '42501';
end
$function$;
drop trigger if exists trend_limits_immutable on cpc1_private.trend_limits;
create trigger trend_limits_immutable before update or delete on cpc1_private.trend_limits
  for each row execute function cpc1_private.trend_limits_immutable();

create or replace function public.cpc1_trend_limits(p_system text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare u uuid := cpc1_private.viewer();
begin
  if p_system not in ('steam', 'air', 'nitrogen') then
    raise exception 'Hệ thống không hợp lệ.' using errcode = '22023';
  end if;
  -- co_the_dat: web chỉ hiện ô nhập ngưỡng cho Admin (máy chủ vẫn tự chặn ở cpc1_trend_limit_set).
  return jsonb_build_object('ok', true, 'co_the_dat', public.vmp_business_role(u) is not distinct from 'admin', 'rows', coalesce((
    select jsonb_agg(jsonb_build_object(
             'form', t.form, 'metric', t.metric, 'point_id', t.point_id, 'unit', t.unit,
             'direction', t.direction, 'alert', t.alert_level, 'action', t.action_level,
             'hieu_luc_tu', t.hieu_luc_tu, 'ly_do', t.ly_do, 'phien_ban', t.phien_ban,
             'nguoi', coalesce(p.full_name, 'Không rõ'), 'luc', t.created_at,
             'hien_hanh', t.phien_ban = (select max(x.phien_ban) from cpc1_private.trend_limits x
                                         where x.system = t.system and x.form = t.form and x.metric = t.metric and x.point_id = t.point_id)
           ) order by t.form, t.metric, t.point_id, t.phien_ban desc)
    from cpc1_private.trend_limits t
    left join public.profiles p on p.id = t.actor_id
    where t.system = p_system
  ), '[]'::jsonb));
end
$function$;

create or replace function public.cpc1_trend_limit_set(
  p_system text, p_form text, p_metric text, p_point_id text, p_unit text, p_direction text,
  p_alert numeric, p_action numeric, p_hieu_luc_tu date, p_ly_do text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  u uuid := cpc1_private.viewer();
  v_phien_ban integer;
begin
  if public.vmp_business_role(u) is distinct from 'admin' then
    return jsonb_build_object('ok', false, 'error_code', 'FORBIDDEN', 'error', 'Chỉ Admin được đặt ngưỡng cảnh báo/hành động.');
  end if;
  if nullif(btrim(coalesce(p_ly_do, '')), '') is null then
    return jsonb_build_object('ok', false, 'error_code', 'REASON_REQUIRED', 'error', 'Cần ghi lý do (vd căn cứ thống kê, quyết định QA).');
  end if;
  if p_direction not in ('max', 'min') or p_alert is null or p_action is null
     or (p_direction = 'max' and not p_alert < p_action) or (p_direction = 'min' and not p_alert > p_action) then
    return jsonb_build_object('ok', false, 'error_code', 'INVALID_LEVELS',
      'error', 'Ngưỡng cảnh báo phải chặt hơn ngưỡng hành động (≤: cảnh báo < hành động; ≥: cảnh báo > hành động).');
  end if;
  if p_hieu_luc_tu is null then
    return jsonb_build_object('ok', false, 'error_code', 'DATE_REQUIRED', 'error', 'Cần ngày hiệu lực.');
  end if;
  perform pg_advisory_xact_lock(hashtext(p_system || '|' || p_form || '|' || p_metric || '|' || coalesce(p_point_id, '')));
  select coalesce(max(phien_ban), 0) + 1 into v_phien_ban from cpc1_private.trend_limits
  where system = p_system and form = p_form and metric = p_metric and point_id = coalesce(p_point_id, '');
  insert into cpc1_private.trend_limits(system, form, metric, point_id, unit, direction, alert_level, action_level, hieu_luc_tu, ly_do, phien_ban, actor_id)
  values (p_system, p_form, p_metric, coalesce(p_point_id, ''), p_unit, p_direction, p_alert, p_action, p_hieu_luc_tu, btrim(p_ly_do), v_phien_ban, u);
  insert into public.audit_logs(user_id, action, table_name, record_id, changed_fields, change_reason, new_data, source, effective_business_role)
  values (u, 'CONFIG_CHANGE'::public.audit_action, 'cpc1_trend_limits',
          p_system || '/' || p_form || '/' || p_metric || '/' || coalesce(nullif(p_point_id, ''), '*') || '/v' || v_phien_ban,
          array['alert_level', 'action_level'], btrim(p_ly_do),
          jsonb_build_object('alert', p_alert, 'action', p_action, 'direction', p_direction, 'unit', p_unit, 'hieu_luc_tu', p_hieu_luc_tu),
          'cpc1_trend_limit_set', 'admin');
  return jsonb_build_object('ok', true, 'phien_ban', v_phien_ban);
end
$function$;

revoke all on function public.cpc1_trend_limits(text) from public, anon;
revoke all on function public.cpc1_trend_limit_set(text, text, text, text, text, text, numeric, numeric, date, text) from public, anon;
grant execute on function public.cpc1_trend_limits(text) to authenticated;
grant execute on function public.cpc1_trend_limit_set(text, text, text, text, text, text, numeric, numeric, date, text) to authenticated;

commit;
