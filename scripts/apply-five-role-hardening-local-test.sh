#!/usr/bin/env bash

set -euo pipefail

mode="${1:-apply}"
if [[ "$mode" != "apply" && "$mode" != "check" ]]; then
  echo "Usage: $0 [apply|check]" >&2
  exit 2
fi

if [[ -z "${SUPABASE_DB_URL:-}" || -z "${VMP_TEST_DB_URL:-}" || -z "${VMP_LOCAL_ACCOUNT_IDS:-}" ]]; then
  echo "SUPABASE_DB_URL, VMP_TEST_DB_URL and VMP_LOCAL_ACCOUNT_IDS are required." >&2
  exit 2
fi

uuid_pattern='[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'
if [[ ! "$VMP_LOCAL_ACCOUNT_IDS" =~ ^${uuid_pattern}(,${uuid_pattern}){6}$ ]]; then
  echo "VMP_LOCAL_ACCOUNT_IDS must contain exactly seven comma-separated UUIDs." >&2
  exit 2
fi

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
local_tmp_dir="$(mktemp -d)"
trap 'unset LOCAL_PGHOST LOCAL_PGPORT LOCAL_PGUSER LOCAL_PGPASSWORD LOCAL_PGDATABASE; rm -rf -- "$local_tmp_dir"' EXIT

if node "$repo_dir/scripts/parse-five-role-local-db.mjs" >"$local_tmp_dir/connection"; then
  :
else
  exit "$?"
fi
while IFS= read -r -d '' local_key && IFS= read -r -d '' local_value; do
  export "$local_key=$local_value"
done <"$local_tmp_dir/connection"

if [[ "$mode" == "apply" ]]; then
  entrypoint="scripts/apply-five-role-hardening-local-test.sql"
  local_mode_line=""
else
  entrypoint="scripts/check-five-role-permission-state.sql"
  local_mode_line="\\set five_role_local_test 1"
fi

{
  printf '\\set account_ids %s\n' "$VMP_LOCAL_ACCOUNT_IDS"
  printf '\\set five_role_local_test_contract loopback-54322-postgres\n'
  if [[ -n "$local_mode_line" ]]; then printf '%s\n' "$local_mode_line"; fi
  printf '\\ir %s\n' "$entrypoint"
} | env -i PATH="$PATH" \
  PGHOST="$LOCAL_PGHOST" PGPORT="$LOCAL_PGPORT" PGUSER="$LOCAL_PGUSER" \
  PGPASSWORD="$LOCAL_PGPASSWORD" PGDATABASE="$LOCAL_PGDATABASE" \
  psql -X -v ON_ERROR_STOP=1
