-- Sơ đồ xu hướng xem được đợt ĐANG NHẬP (migration 20261112100000).
-- Chạy trên BẢN SAO production có ít nhất một đợt đang mở đã lưu số liệu.
-- Chỉ đọc; mọi thứ tạm nằm trong MỘT giao dịch và ROLLBACK ở cuối. Đóng vai
-- bằng request.jwt.claims (như PostgREST) + role authenticated.
-- Mỗi ca in PASS/FAIL; cuối file raise nếu có ca FAIL (thoát mã ≠ 0).
\set ON_ERROR_STOP on
begin;

create temp table t_kq(stt serial primary key, ca text not null, dat boolean not null, chi_tiet text);
grant all on t_kq to authenticated;
grant usage on sequence t_kq_stt_seq to authenticated;

create function pg_temp.ok(p_ca text, p_dat boolean, p_chi_tiet text default null) returns void language plpgsql as $$
begin
  insert into t_kq(ca, dat, chi_tiet) values (p_ca, coalesce(p_dat, false), p_chi_tiet);
  raise notice '%', case when coalesce(p_dat, false) then 'PASS ' || p_ca
    else 'FAIL ' || p_ca || ' — ' || coalesce(left(p_chi_tiet, 600), '') end;
end $$;
create function pg_temp.as_user(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  select null::void;
$$;

-- Điều kiện của bản sao: phải có hồ sơ thuộc đợt đang mở đã lưu (bản > 1).
create temp table t_mo as
select i.record_id, i.system, i.scope, r.id as run_id, rec.version as ban_moi_nhat
from cpc1_private.run_items i
join cpc1_private.runs r on r.id = i.run_id
join public.cpc1_records rec on rec.id = i.record_id
where r.status = 'open' and rec.version > 1
  and not exists (select 1 from cpc1_private.history_imports h where h.record_id = i.record_id);
grant select on t_mo to authenticated;
select pg_temp.ok('00 bản sao có hồ sơ đợt đang mở đã lưu', (select count(*) from t_mo) > 0,
  'Bản sao không có đợt đang mở — không kiểm được.');
do $$ begin
  if (select count(*) from t_mo) = 0 then raise exception 'Bản sao không có đợt đang mở đã lưu.'; end if;
end $$;

-- Số liệu mong đợi của từng hồ sơ đang mở: đúng bản lưu mới nhất.
create temp table t_mong as
select m.record_id, m.ban_moi_nhat,
       cpc1_private.trend_rows(m.system, v.payload, v.evaluation, m.scope) as trend
from t_mo m join public.cpc1_revisions v on v.record_id = m.record_id and v.version = m.ban_moi_nhat;
grant select on t_mong to authenticated;

-- Kết quả theo LUẬT CŨ (chỉ đợt đã đóng, đúng bản chốt) của từng tài khoản,
-- để chứng minh phần đã đóng không đổi một chữ.
create temp table t_ai(uid uuid primary key, vai text);
insert into t_ai select id, public.vmp_business_role(id) from public.profiles where is_active;
grant select on t_ai to authenticated;
create temp table t_ra(uid uuid primary key, kq jsonb, loi text, quyen_mo uuid[]);
grant all on t_ra to authenticated;
create temp table t_cu(uid uuid primary key, dong jsonb);
grant all on t_cu to authenticated;

do $$
declare a record; cu jsonb;
begin
  for a in select * from t_ai loop
    perform set_config('request.jwt.claims', jsonb_build_object('sub', a.uid, 'role', 'authenticated')::text, true);
    select coalesce(jsonb_agg(x.dong order by x.dong->>'record_id', x.dong->>'version'), '[]') into cu from (
      select jsonb_build_object('record_id', h.record_id, 'version', h.version, 'run_id', h.run_id, 'system', h.system,
                                'period', h.period, 'trend', h.trend) as dong
      from cpc1_private.history_imports h join cpc1_private.runs r on r.id = h.run_id
      where cpc1_private.record_pq_right(h.record_id, false)
      union all
      select jsonb_build_object('record_id', i.record_id, 'version', v.version, 'run_id', r.id, 'system', i.system,
                                'period', date_trunc('month', r.started_on)::date,
                                'trend', cpc1_private.trend_rows(i.system, v.payload, v.evaluation, i.scope))
      from cpc1_private.run_items i join cpc1_private.runs r on r.id = i.run_id
      join public.cpc1_records rec on rec.id = i.record_id
      join public.cpc1_revisions v on v.record_id = rec.id and v.version = i.closed_revision
      where cpc1_private.record_pq_right(i.record_id, false) and r.status <> 'open' and v.version > 1
        and not exists (select 1 from cpc1_private.history_imports h where h.record_id = i.record_id)
    ) x;
    insert into t_cu values (a.uid, cu);
  end loop;
end $$;

grant execute on all functions in schema pg_temp to authenticated;
set local role authenticated;

-- Gọi hàm thật dưới vai từng tài khoản.
do $$
declare a record; kq jsonb; m text; q uuid[];
begin
  for a in select * from t_ai loop
    perform pg_temp.as_user(a.uid);
    begin
      kq := public.cpc1_history_list();
      insert into t_ra values (a.uid, kq, null, null);
    exception when others then
      get stacked diagnostics m = message_text;
      insert into t_ra values (a.uid, null, sqlstate || ' ' || m, null);
    end;
  end loop;
end $$;
reset role;

-- Quyền xem từng hồ sơ đang mở của từng tài khoản (tính bằng chính hàm quyền).
do $$
declare a record; q uuid[];
begin
  for a in select * from t_ai loop
    perform set_config('request.jwt.claims', jsonb_build_object('sub', a.uid, 'role', 'authenticated')::text, true);
    select coalesce(array_agg(m.record_id order by m.record_id), '{}') into q
    from t_mo m where cpc1_private.record_pq_right(m.record_id, false);
    update t_ra set quyen_mo = q where uid = a.uid;
  end loop;
end $$;

-- Các dòng "đang nhập" mà từng tài khoản nhận được.
create temp table t_dong as
select ra.uid, (d->>'record_id')::uuid as record_id, (d->>'version')::int as version,
       d->'trend' as trend, d->>'run_id' as run_id, d->>'period' as period, d as dong
from t_ra ra cross join lateral jsonb_array_elements(coalesce(ra.kq, '[]')) d
where d->>'in_progress' = 'true';

-- 01. Có người thấy đợt đang nhập (RED trước migration).
select pg_temp.ok('01 có tài khoản thấy hồ sơ của đợt đang nhập', (select count(*) from t_dong) > 0,
  'Không tài khoản nào nhận được dòng in_progress.');

-- 02. Thấy ĐÚNG và ĐỦ theo quyền: ai có quyền xem hồ sơ thì thấy, ai không thì không.
select pg_temp.ok('02 hồ sơ đang nhập hiện đúng theo quyền xem của từng tài khoản',
  not exists (
    select 1 from t_ra ra
    where ra.kq is not null
      and coalesce((select array_agg(d.record_id order by d.record_id) from t_dong d where d.uid = ra.uid), '{}')
          is distinct from ra.quyen_mo),
  (select string_agg(ra.uid::text, ', ') from t_ra ra where ra.kq is not null
     and coalesce((select array_agg(d.record_id order by d.record_id) from t_dong d where d.uid = ra.uid), '{}')
         is distinct from ra.quyen_mo));

-- 03. Có ít nhất một tài khoản KHÔNG có quyền và không thấy gì (ca đối chứng có thật).
select pg_temp.ok('03 có tài khoản không quyền và không thấy hồ sơ đang nhập',
  exists (select 1 from t_ra ra where ra.kq is not null and cardinality(ra.quyen_mo) = 0
          and not exists (select 1 from t_dong d where d.uid = ra.uid)),
  'Không có tài khoản nào gọi được hàm mà không có quyền — thiếu ca đối chứng.');

-- 04. Lấy đúng bản lưu mới nhất, không lấy bản cũ.
select pg_temp.ok('04 hồ sơ đang nhập dùng bản lưu mới nhất',
  (select count(*) from t_dong) > 0
  and not exists (select 1 from t_dong d join t_mong g on g.record_id = d.record_id where d.version <> g.ban_moi_nhat),
  (select string_agg(d.record_id || ' v' || d.version, ', ') from t_dong d join t_mong g on g.record_id = d.record_id
    where d.version <> g.ban_moi_nhat));

-- 05. Số liệu trùng khít với số tính từ bản lưu mới nhất.
select pg_temp.ok('05 số liệu đang nhập khớp bản lưu mới nhất',
  (select count(*) from t_dong) > 0
  and not exists (select 1 from t_dong d join t_mong g on g.record_id = d.record_id where d.trend is distinct from g.trend));

-- 06. Có số liệu thật để vẽ (không rỗng).
select pg_temp.ok('06 hồ sơ đang nhập có số liệu để vẽ',
  exists (select 1 from t_dong d where jsonb_array_length(d.trend) > 0));

-- 07. Dòng đang nhập gắn đúng đợt đang mở và có đủ các trường giao diện dùng.
select pg_temp.ok('07 dòng đang nhập gắn đúng đợt mở, đủ trường',
  (select count(*) from t_dong) > 0
  and not exists (
    select 1 from t_dong d left join t_mo m on m.record_id = d.record_id
    where m.record_id is null or d.run_id is distinct from m.run_id::text or d.period is null
       or not (d.dong ?& array['id','run_id','record_id','version','system','period','comparison','trend','issues','sources'])));

-- 08. Phần ĐÃ ĐÓNG không đổi: bỏ dòng đang nhập đi thì giống hệt luật cũ, với mọi tài khoản.
select pg_temp.ok('08 dữ liệu đợt đã đóng giống hệt trước khi sửa (mọi tài khoản)',
  not exists (
    select 1 from t_ra ra join t_cu cu on cu.uid = ra.uid
    where ra.kq is not null and (
      select coalesce(jsonb_agg(jsonb_build_object('record_id', d->'record_id', 'version', d->'version', 'run_id', d->'run_id',
               'system', d->'system', 'period', d->'period', 'trend', d->'trend')
               order by d->>'record_id', d->>'version'), '[]')
      from jsonb_array_elements(ra.kq) d where coalesce(d->>'in_progress', 'false') <> 'true'
    ) is distinct from cu.dong),
  'Có tài khoản nhận dữ liệu đợt đã đóng khác luật cũ.');

-- 09. Không hồ sơ nào xuất hiện hai lần trong cùng một kết quả.
select pg_temp.ok('09 không trùng hồ sơ trong một kết quả',
  not exists (
    select 1 from t_ra ra cross join lateral jsonb_array_elements(coalesce(ra.kq, '[]')) d
    group by ra.uid, d->>'record_id', d->>'version' having count(*) > 1));

-- 10. Hồ sơ đợt mở chưa lưu gì (chỉ có bản 1) không hiện.
select pg_temp.ok('10 hồ sơ đang nhập luôn là bản > 1',
  not exists (select 1 from t_dong d where d.version <= 1));

-- 11. Tài khoản không hợp lệ không nhận được gì.
set local role authenticated;
do $$
declare kq jsonb; st text;
begin
  perform pg_temp.as_user('00000000-0000-4000-8000-000000000001');
  begin
    kq := public.cpc1_history_list();
    perform pg_temp.ok('11 tài khoản lạ không thấy hồ sơ nào', jsonb_array_length(kq) = 0, left(kq::text, 300));
  exception when others then
    get stacked diagnostics st = returned_sqlstate;
    perform pg_temp.ok('11 tài khoản lạ không thấy hồ sơ nào', true, st);
  end;
end $$;
reset role;

-- 12. Quyền gọi hàm không đổi: anon không gọi được.
select pg_temp.ok('12 anon không gọi được cpc1_history_list',
  not has_function_privilege('anon', 'public.cpc1_history_list()', 'execute'));
select pg_temp.ok('13 authenticated vẫn gọi được cpc1_history_list',
  has_function_privilege('authenticated', 'public.cpc1_history_list()', 'execute'));


-- =====================================================================
-- PHẦN 2 — ca biên dựng ngay trong giao dịch (sửa dữ liệu bản sao rồi ROLLBACK).
-- So NGUYÊN VĂN, GIỮ THỨ TỰ với hàm cũ (bản 20260929120000) đặt dưới tên tạm.
-- Cần vì trên bản sao mọi đợt đã đóng đều là hồ sơ import: nếu không dựng thêm
-- thì nhánh bị sửa không có dòng "đã đóng" nào để so.
-- =====================================================================
create function public.zz_history_list_cu() returns jsonb language plpgsql stable security definer set search_path to '' as $function$
declare u uuid:=cpc1_private.viewer();historical jsonb;fresh jsonb;begin
 historical:=coalesce((select jsonb_agg(jsonb_build_object('id',h.id,'run_id',h.run_id,'record_id',h.record_id,'version',h.version,'system',h.system,'period',h.period,'comparison',h.comparison,'trend',h.trend,'issues',coalesce(h.provenance->'issues','[]'),'imported_at',h.imported_at,'sources',h.source_manifest) order by h.period,h.system)
 from cpc1_private.history_imports h join cpc1_private.runs r on r.id=h.run_id where cpc1_private.record_pq_right(h.record_id,false)),'[]');
 select coalesce(jsonb_agg(jsonb_build_object('id',i.record_id,'run_id',r.id,'record_id',i.record_id,'version',v.version,'system',i.system,'period',date_trunc('month',r.started_on)::date,'comparison','[]'::jsonb,'trend',cpc1_private.trend_rows(i.system,v.payload,v.evaluation,i.scope),'issues','[]'::jsonb,'sources','[]'::jsonb) order by r.started_on),'[]') into fresh
 from cpc1_private.run_items i join cpc1_private.runs r on r.id=i.run_id join public.cpc1_records rec on rec.id=i.record_id join public.cpc1_revisions v on v.record_id=rec.id and v.version=coalesce(i.closed_revision,rec.version)
 where cpc1_private.record_pq_right(i.record_id,false) and r.status<>'open' and v.version=i.closed_revision and v.version>1 and not exists(select 1 from cpc1_private.history_imports h where h.record_id=i.record_id);
 return historical||fresh;
end$function$;
grant execute on function public.zz_history_list_cu() to authenticated;

create temp table t_kb(kb text, uid uuid, cu jsonb, moi jsonb, loi_cu text, loi_moi text);
grant all on t_kb to authenticated;
create function pg_temp.chay(p_kb text) returns void language plpgsql as $$
declare a record; c jsonb; m jsonb; lc text; lm text;
begin
  for a in select uid from t_ai loop
    perform set_config('request.jwt.claims', jsonb_build_object('sub', a.uid, 'role', 'authenticated')::text, true);
    c := null; m := null; lc := null; lm := null;
    begin c := public.zz_history_list_cu(); exception when others then lc := sqlstate; end;
    begin m := public.cpc1_history_list(); exception when others then lm := sqlstate; end;
    insert into t_kb values (p_kb, a.uid, c, m, lc, lm);
  end loop;
end $$;
-- Phần không in_progress của hàm mới (bỏ khoá in_progress, giữ thứ tự) = hàm cũ, với MỌI tài khoản.
create function pg_temp.giong_cu(p_kb text) returns boolean language sql as $$
  select count(*) > 0 and bool_and(
    k.loi_cu is not distinct from k.loi_moi
    and (select coalesce(jsonb_agg(x.d - 'in_progress' order by x.o), '[]')
         from jsonb_array_elements(coalesce(k.moi, '[]')) with ordinality x(d, o)
         where coalesce(x.d->>'in_progress', 'false') <> 'true') is not distinct from coalesce(k.cu, '[]'))
  from t_kb k where k.kb = p_kb;
$$;
-- Các dòng (hồ sơ:bản:in_progress) của một đợt mà tài khoản admin nhận được ở hàm mới.
create function pg_temp.dong(p_kb text, p_run uuid) returns text language sql as $$
  select coalesce(string_agg((x.d->>'system') || ':v' || (x.d->>'version') || ':' || coalesce(x.d->>'in_progress', '-'), ' '
                             order by x.d->>'system'), '')
  from t_kb k cross join lateral jsonb_array_elements(coalesce(k.moi, '[]')) x(d)
  where k.kb = p_kb and k.uid = (select uid from t_ai where vai = 'admin' order by uid limit 1)
    and x.d->>'run_id' = p_run::text;
$$;

-- Đợt đã đóng dùng để dựng ca: mọi hồ sơ đều có bản chốt >= 3 (để còn bản thấp hơn mà > 1).
create temp table t_run as
select (select r.id from cpc1_private.runs r
        where r.status <> 'open'
          and not exists (select 1 from cpc1_private.run_items i join public.cpc1_records rec on rec.id = i.record_id
                          where i.run_id = r.id and (i.closed_revision is null or i.closed_revision < 3 or rec.version <> i.closed_revision))
        order by r.started_on desc limit 1) as dong,
       (select run_id from t_mo order by record_id limit 1) as mo;
select pg_temp.ok('20 bản sao có đợt đã đóng đủ điều kiện dựng ca biên', (select dong is not null from t_run));
do $$ begin
  if (select dong is null from t_run) then raise exception 'Không có đợt đã đóng phù hợp để dựng ca biên.'; end if;
end $$;

set local session_replication_role = replica;

-- 0. Nguyên trạng.
select pg_temp.chay('0');
select pg_temp.ok('21 nguyên trạng: phần đã đóng giống hệt hàm cũ, giữ thứ tự', pg_temp.giong_cu('0'));

-- A. Đợt đã đóng KHÔNG import → nhánh bị sửa phải trả đúng bản chốt, in_progress=false.
delete from cpc1_private.history_imports where run_id = (select dong from t_run);
select pg_temp.chay('A');
select pg_temp.ok('22 A đợt đã đóng không import: giống hệt hàm cũ', pg_temp.giong_cu('A'));
select pg_temp.ok('23 A đợt đã đóng: có dòng, đúng bản chốt, không gắn nhãn đang nhập',
  pg_temp.dong('A', (select dong from t_run)) <> ''
  and pg_temp.dong('A', (select dong from t_run)) = (
    select string_agg(i.system || ':v' || i.closed_revision || ':false', ' ' order by i.system)
    from cpc1_private.run_items i where i.run_id = (select dong from t_run)),
  pg_temp.dong('A', (select dong from t_run)));

-- B. Trạng thái completed (không phải open) cũng coi là đã đóng.
update cpc1_private.runs set status = 'completed', close_reason = null where id = (select dong from t_run);
select pg_temp.chay('B');
select pg_temp.ok('24 B đợt completed: giống hệt hàm cũ, không gắn nhãn đang nhập',
  pg_temp.giong_cu('B') and pg_temp.dong('B', (select dong from t_run)) not like '%:true%'
  and pg_temp.dong('B', (select dong from t_run)) <> '', pg_temp.dong('B', (select dong from t_run)));

-- C. Bản chốt thấp hơn bản mới nhất → vẫn lấy bản CHỐT, không lấy bản mới nhất.
update cpc1_private.run_items set closed_revision = closed_revision - 1 where run_id = (select dong from t_run);
select pg_temp.chay('C');
select pg_temp.ok('25 C đợt đã đóng lấy bản chốt dù có bản mới hơn',
  pg_temp.giong_cu('C')
  and pg_temp.dong('C', (select dong from t_run)) = (
    select string_agg(i.system || ':v' || i.closed_revision || ':false', ' ' order by i.system)
    from cpc1_private.run_items i where i.run_id = (select dong from t_run)),
  pg_temp.dong('C', (select dong from t_run)));

-- E. Mở lại đợt (còn closed_revision cũ) → lấy bản MỚI NHẤT, gắn nhãn đang nhập.
update cpc1_private.runs set status = 'open', closed_at = null where id = (select dong from t_run);
select pg_temp.chay('E');
select pg_temp.ok('26 E đợt mở lại: lấy bản mới nhất và gắn nhãn đang nhập',
  pg_temp.giong_cu('E')
  and pg_temp.dong('E', (select dong from t_run)) = (
    select string_agg(i.system || ':v' || rec.version || ':true', ' ' order by i.system)
    from cpc1_private.run_items i join public.cpc1_records rec on rec.id = i.record_id
    where i.run_id = (select dong from t_run)),
  pg_temp.dong('E', (select dong from t_run)));

-- D. Đóng lại nhưng thiếu bản chốt (closed_revision null) → không hiện, như cũ.
update cpc1_private.runs set status = 'closed', closed_at = now(), close_reason = 'ca kiểm' where id = (select dong from t_run);
update cpc1_private.run_items set closed_revision = null where run_id = (select dong from t_run);
select pg_temp.chay('D');
select pg_temp.ok('27 D đợt đã đóng thiếu bản chốt: không hiện, giống hàm cũ',
  pg_temp.giong_cu('D') and pg_temp.dong('D', (select dong from t_run)) = '', pg_temp.dong('D', (select dong from t_run)));

-- F. Đợt đang mở, hồ sơ chỉ có bản 1 (chưa lưu gì) → không hiện.
update public.cpc1_records set version = 1 where id in (select record_id from t_mo where run_id = (select mo from t_run));
select pg_temp.chay('F');
select pg_temp.ok('28 F đợt đang mở chưa lưu gì (bản 1): không hiện',
  pg_temp.giong_cu('F') and pg_temp.dong('F', (select mo from t_run)) = '', pg_temp.dong('F', (select mo from t_run)));

-- Tổng kết.
do $$
declare n_fail int; n_all int;
begin
  select count(*) filter (where not dat), count(*) into n_fail, n_all from t_kq;
  raise notice 'TỔNG: % ca, % FAIL', n_all, n_fail;
  if n_fail > 0 then raise exception 'Có % ca FAIL', n_fail; end if;
end $$;
rollback;
