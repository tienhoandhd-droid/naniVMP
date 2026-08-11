#!/usr/bin/env bash
set -euo pipefail

repo_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)
if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
  set -a
  source "$repo_dir/.env.local"
  set +a
fi

shopt -s nullglob
migrations=(
  "$repo_dir"/supabase/migrations/20260810*.sql
  "$repo_dir"/supabase/migrations/20260811*.sql
)
IFS=$'\n' migrations=($(printf '%s\n' "${migrations[@]}" | sort))
unset IFS
args=(-X -v ON_ERROR_STOP=1 -c 'begin')
for file in "${migrations[@]}"; do
  args+=(-f "$file")
done
args+=(-f "$repo_dir/tests/sql/item-permissions.sql" -c 'rollback')

psql "$SUPABASE_DB_URL" "${args[@]}"
