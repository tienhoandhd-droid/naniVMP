#!/usr/bin/env bash

set -euo pipefail

if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
  echo "SUPABASE_DB_URL is required to clone the public schema." >&2
  exit 2
fi

supabase start -x studio,imgproxy,edge-runtime,logflare,vector,supavisor >/dev/null 2>&1

status_env="$(supabase status -o env 2>/dev/null)"
VMP_TEST_DB_URL="$(printf '%s\n' "$status_env" | awk -F= '$1 == "DB_URL" { sub(/^[^=]*=/, ""); print; exit }')"
VMP_TEST_DB_URL="${VMP_TEST_DB_URL#\"}"
VMP_TEST_DB_URL="${VMP_TEST_DB_URL%\"}"

if [[ -z "$VMP_TEST_DB_URL" ]]; then
  echo "Supabase did not report a local DB_URL." >&2
  exit 4
fi

export VMP_TEST_DB_URL
tmp_dir="$(mktemp -d)"
trap 'unset SOURCE_DB_URL PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE PGSSLMODE LOCAL_PGHOST LOCAL_PGPORT LOCAL_PGUSER LOCAL_PGPASSWORD LOCAL_PGDATABASE; rm -rf "$tmp_dir"' EXIT

if node scripts/parse-five-role-local-db.mjs >"$tmp_dir/local-connection"; then
  :
else
  exit "$?"
fi
while IFS= read -r -d '' local_key && IFS= read -r -d '' local_value; do
  export "$local_key=$local_value"
done <"$tmp_dir/local-connection"

export SOURCE_DB_URL="$SUPABASE_DB_URL"
while IFS= read -r -d '' pg_key && IFS= read -r -d '' pg_value; do
  export "$pg_key=$pg_value"
done < <(node <<'NODE'
try {
  const source = new URL(process.env.SOURCE_DB_URL);
  const database = decodeURIComponent(source.pathname).replace(/^\/+/, "").split("/")[0];
  if (!/^postgres(?:ql)?:$/.test(source.protocol) || !source.hostname || !database) process.exit(1);

  const pairs = [
    ["PGHOST", source.hostname],
    ["PGPORT", source.port || "5432"],
    ["PGUSER", decodeURIComponent(source.username)],
    ["PGPASSWORD", decodeURIComponent(source.password)],
    ["PGDATABASE", database],
  ];
  const sslmode = source.searchParams.get("sslmode");
  if (sslmode) pairs.push(["PGSSLMODE", sslmode]);
  process.stdout.write(pairs.flat().join("\0") + "\0");
} catch {
  process.exit(1);
}
NODE
)
unset SOURCE_DB_URL

if [[ -z "${PGHOST:-}" || -z "${PGDATABASE:-}" || -z "${PGUSER:-}" ]]; then
  echo "SUPABASE_DB_URL is not a valid PostgreSQL URL." >&2
  exit 2
fi

docker_args=(run --rm --network host -e PGHOST -e PGPORT -e PGUSER -e PGPASSWORD -e PGDATABASE)
if [[ -n "${PGSSLMODE:-}" ]]; then
  docker_args+=(-e PGSSLMODE)
fi
docker "${docker_args[@]}" -v "$tmp_dir:/out" postgres:17 \
  pg_dump --schema-only --schema=public --no-owner --file /out/schema.sql

sed -i '/^ALTER DEFAULT PRIVILEGES /d' "$tmp_dir/schema.sql"

run_local_psql() {
  if ! env -u PGSERVICE -u PGSERVICEFILE -u PGHOSTADDR -u PGOPTIONS -u PGSSLMODE \
    PGHOST="$LOCAL_PGHOST" PGPORT="$LOCAL_PGPORT" PGUSER="$LOCAL_PGUSER" \
    PGPASSWORD="$LOCAL_PGPASSWORD" PGDATABASE="$LOCAL_PGDATABASE" \
    psql "$@" >"$tmp_dir/psql.log" 2>&1; then
    cat "$tmp_dir/psql.log" >&2
    return 1
  fi
}

run_local_psql -X -v ON_ERROR_STOP=1 -c 'drop schema public cascade;'
run_local_psql -X -v ON_ERROR_STOP=1 -c 'create extension if not exists vector with schema extensions;'
run_local_psql -X -v ON_ERROR_STOP=1 -c 'create extension if not exists unaccent with schema extensions;'
run_local_psql -X -v ON_ERROR_STOP=1 -c 'create extension if not exists pg_trgm with schema extensions;'
run_local_psql -X -v ON_ERROR_STOP=1 -f "$tmp_dir/schema.sql"

echo "Local disposable schema clone is ready. Export VMP_TEST_DB_URL from Supabase status before running npm run test:db:five-role."
