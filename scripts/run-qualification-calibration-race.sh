#!/usr/bin/env bash
# Kiểm race "đổi hạn thiết bị của đợt" vs "ký kiểm tra" (migration 20261021100000).
# HAI phiên psql thật: phiên A ký và giữ giao dịch 4 giây; phiên B đổi hạn
# thiết bị trong lúc đó. Đúng: B phải CHỜ A rồi bị chặn PT423.
# CHỈ chạy trên DB THỬ dùng một lần: fixture được COMMIT (đợt + hồ sơ thử).
# Dùng biến PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE; từ chối host khác 127.0.0.1/localhost.
set -euo pipefail

if [[ "${PGHOST:-}" != "127.0.0.1" && "${PGHOST:-}" != "localhost" ]]; then
  echo "Chỉ chạy trên DB thử cục bộ (PGHOST=127.0.0.1)." >&2
  exit 2
fi

PSQL=(psql -X -q -At -v ON_ERROR_STOP=1)
claims() { # $1 = số cuối user id; có amr mật khẩu (để ký)
  echo "select set_config('request.jwt.claims', jsonb_build_object('sub','a8210210-0000-4000-8000-00000000000$1','role','authenticated','aal','aal2','amr',jsonb_build_array(jsonb_build_object('method','password','timestamp',floor(extract(epoch from now()))::bigint)))::text, false) is null;"
}

# 1) Fixture: đợt khí nén một điểm, hồ sơ Đạt; Admin 1 trong danh sách QA phụ trách.
fixture=$("${PSQL[@]}" <<SQL
insert into public.vmp_qa_phu_trach(performer_id, ghi_chu)
select id, 'SQL race test only' from public.vmp_performers where user_id = 'a8210210-0000-4000-8000-000000000001'
on conflict do nothing;
set role authenticated;
$(claims 2)
do \$\$
declare pa text; scope jsonb; cal jsonb := '{}'; req jsonb; res jsonb; rec uuid; ld jsonb; d jsonb;
begin
  select x->'locations'->0->>'id' into pa from jsonb_array_elements(public.cpc1_gas_config('air')->'forms') x where x->>'id' = 'bm01';
  scope := jsonb_build_array(jsonb_build_object('system', 'air', 'forms', jsonb_build_object('bm01', jsonb_build_array(pa))));
  for req in select x from jsonb_array_elements(public.cpc1_run_requirements(scope)) x loop
    cal := cal || jsonb_build_object(req->>'key', jsonb_build_object('name', 'TB-RACE', 'due_on', '2027-06-30'));
  end loop;
  res := public.cpc1_run_create(jsonb_build_object('title', 'SQL race test', 'mode', 'single', 'started_on', '2026-10-21', 'scope', scope, 'calibration', cal), gen_random_uuid());
  rec := (res->'items'->0->>'record_id')::uuid;
  ld := public.cpc1_run_load((res->>'id')::uuid, rec);
  d := jsonb_set(ld->'data', '{forms}', jsonb_build_object('bm01', jsonb_build_object(pa, jsonb_build_object('p05', '100', 'p5', '0'))));
  res := public.cpc1_run_save((res->>'id')::uuid, d, rec, (ld->>'version')::integer, gen_random_uuid(), null) || jsonb_build_object('run', res->>'id');
  perform set_config('race.out', concat_ws('|', ld#>>'{run,id}', rec, ld#>>'{run,version}', res->>'version', jsonb_set(cal, array[(select k from jsonb_object_keys(cal) k limit 1), 'due_on'], '"2027-12-31"')::text), false);
end \$\$;
select current_setting('race.out');
SQL
)
IFS='|' read -r run rec run_version rec_version new_cal <<<"$(tail -n1 <<<"$fixture")"
echo "Đợt $run, hồ sơ $rec, phiên bản đợt $run_version"

# 2) Phiên A: ký kiểm tra, giữ giao dịch 4 giây.
"${PSQL[@]}" >"${TMPDIR:-/tmp}/race-a.$$" 2>&1 <<SQL &
set role authenticated;
$(claims 1)
begin;
select public.cpc1_record_sign('$rec', $rec_version, 'kiem_tra', null, 'DEV-RACE')->>'ok';
select pg_sleep(4);
commit;
SQL
pid_a=$!
sleep 1

# 3) Phiên B: đổi hạn thiết bị trong lúc A đang giữ khoá.
start=$(date +%s.%N)
set +e
out_b=$("${PSQL[@]}" 2>&1 <<SQL
\\set VERBOSITY verbose
set role authenticated;
$(claims 2)
set statement_timeout = '20s';
select public.cpc1_run_calibration_update('$run', $run_version, '$new_cal'::jsonb, 'Kiểm thử race', gen_random_uuid()) is not null;
SQL
)
rc_b=$?
set -e
end=$(date +%s.%N)
wait "$pid_a"
echo "Phiên A (ký): $(tr '\n' ' ' <"${TMPDIR:-/tmp}/race-a.$$")"
rm -f "${TMPDIR:-/tmp}/race-a.$$"
waited=$(awk "BEGIN{printf \"%.1f\", $end-$start}")
echo "Phiên B (đổi hạn) sau ${waited}s, mã thoát $rc_b: $(tr '\n' ' ' <<<"$out_b")"

if [[ $rc_b -ne 0 && "$out_b" == *"PT423"* ]] && awk "BEGIN{exit !($waited >= 2)}"; then
  echo "PASS race: phiên B chờ phiên A ký xong rồi bị chặn PT423"
else
  echo "FAIL race: phiên B không bị chặn sau khi chờ ký"
  exit 1
fi
