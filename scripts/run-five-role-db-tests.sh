#!/usr/bin/env bash

set -euo pipefail

if [[ -z "${SUPABASE_DB_URL:-}" || -z "${VMP_TEST_DB_URL:-}" ]]; then
  echo "SUPABASE_DB_URL and VMP_TEST_DB_URL are required." >&2
  exit 2
fi

tmp_dir="$(mktemp -d)"
trap 'unset LOCAL_PGHOST LOCAL_PGPORT LOCAL_PGUSER LOCAL_PGPASSWORD LOCAL_PGDATABASE; rm -rf "$tmp_dir"' EXIT

if node scripts/parse-five-role-local-db.mjs >"$tmp_dir/local-connection"; then
  :
else
  exit "$?"
fi
while IFS= read -r -d '' local_key && IFS= read -r -d '' local_value; do
  export "$local_key=$local_value"
done <"$tmp_dir/local-connection"

env -u PGSERVICE -u PGSERVICEFILE -u PGHOSTADDR -u PGOPTIONS -u PGSSLMODE \
  PGHOST="$LOCAL_PGHOST" PGPORT="$LOCAL_PGPORT" PGUSER="$LOCAL_PGUSER" \
  PGPASSWORD="$LOCAL_PGPASSWORD" PGDATABASE="$LOCAL_PGDATABASE" \
  psql -X -v ON_ERROR_STOP=1 \
  -f tests/sql/five-role-hardening.sql
