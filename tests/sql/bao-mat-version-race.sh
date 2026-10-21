#!/usr/bin/env bash
# Kiểm khoá lạc quan khi HAI người lưu cùng lúc (migration 20261021120000, mục 2).
# HAI phiên psql thật, cùng p_expected_version: phiên A lưu rồi giữ giao dịch
# 3 giây; phiên B lưu trong lúc đó. Đúng: B CHỜ A rồi nhận VERSION_CONFLICT
# (hoặc VERSION_REQUIRED với ca cùng tạo một mã mới).
# CHỈ chạy trên DB THỬ dùng một lần: thay đổi được COMMIT.
# Cần tài khoản thử a8210210-…-01 (admin) và …-02 (qa_manager) như
# audit-db/02-seed-users.sql. Dùng PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE;
# từ chối host khác 127.0.0.1/localhost.
set -euo pipefail

if [[ "${PGHOST:-}" != "127.0.0.1" && "${PGHOST:-}" != "localhost" ]]; then
  echo "Chỉ chạy trên DB thử cục bộ (PGHOST=127.0.0.1)." >&2
  exit 2
fi

PSQL=(psql -X -q -At -v ON_ERROR_STOP=1)
claims() { # $1 = số cuối user id
  echo "select set_config('request.jwt.claims', json_build_object('sub','a8210210-0000-4000-8000-00000000000$1','role','authenticated')::text, false) is null;"
}
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
fail=0

# $1 = tên ca, $2 = câu gọi của A, $3 = câu gọi của B, $4 = mã lỗi B phải nhận
race() {
  "${PSQL[@]}" >"$tmp/a" 2>&1 <<SQL &
set role authenticated;
$(claims 2)
begin;
select $2;
select pg_sleep(3);
commit;
SQL
  local pid_a=$!
  sleep 1
  local start end out_b waited
  start=$(date +%s.%N)
  out_b=$("${PSQL[@]}" 2>&1 <<SQL
set role authenticated;
$(claims 1)
set statement_timeout = '20s';
select $3;
SQL
) || true
  end=$(date +%s.%N)
  wait "$pid_a"
  waited=$(awk "BEGIN{printf \"%.1f\", $end-$start}")
  echo "[$1] A: $(grep -v '^t$' "$tmp/a" | tr '\n' ' ')"
  echo "[$1] B sau ${waited}s: $(grep -v '^t$' <<<"$out_b" | tr '\n' ' ')"
  if [[ "$out_b" == *"\"error_code\": \"$4\""* ]] && awk "BEGIN{exit !($waited >= 1.5)}"; then
    echo "PASS [$1]: B chờ A rồi nhận $4"
  else
    echo "FAIL [$1]: B không bị chặn ($4)"
    fail=1
  fi
}

bfo=$("${PSQL[@]}" -c "select bfo_code from public.vmp_products_gmp order by bfo_code limit 1")
pv=$("${PSQL[@]}" -c "select version from public.vmp_products_gmp where bfo_code = '$bfo'")
race "san pham GMP" \
  "public.rpc_save_product_gmp('$bfo', '{\"note\":\"race A\"}'::jsonb, null, $pv)" \
  "public.rpc_save_product_gmp('$bfo', '{\"note\":\"race B\"}'::jsonb, null, $pv)" \
  VERSION_CONFLICT

rid=$("${PSQL[@]}" -c "select id from public.vmp_alert_recipients order by id limit 1")
rv=$("${PSQL[@]}" -c "select version from public.vmp_alert_recipients where id = '$rid'")
race "nguoi nhan canh bao" \
  "public.rpc_save_alert_recipient('$rid', '{\"note\":\"race A\"}'::jsonb, null, $rv)" \
  "public.rpc_save_alert_recipient('$rid', '{\"note\":\"race B\"}'::jsonb, null, $rv)" \
  VERSION_CONFLICT

new="RACE-$(date +%s)"
race "cung tao ma moi" \
  "public.rpc_save_product_gmp('$new', '{\"product_name\":\"race A\"}'::jsonb, null, null)" \
  "public.rpc_save_product_gmp('$new', '{\"product_name\":\"race B\"}'::jsonb, null, null)" \
  VERSION_REQUIRED

exit $fail
