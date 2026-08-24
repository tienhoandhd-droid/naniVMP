#!/usr/bin/env bash

set -euo pipefail

if [[ -z "${SUPABASE_DB_URL:-}" || -z "${VMP_TEST_DB_URL:-}" ]]; then
  echo "SUPABASE_DB_URL and VMP_TEST_DB_URL are required." >&2
  exit 2
fi

normalize_target() {
  node - "$1" <<'NODE'
const value = process.argv[2];
try {
  const url = new URL(value);
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  const database = decodeURIComponent(url.pathname)
    .replace(/^\/+/, "")
    .split("/")[0]
    .toLowerCase();

  if (!host || !database) process.exit(1);
  process.stdout.write(`${host}\t${database}`);
} catch {
  process.exit(1);
}
NODE
}

production_target="$(normalize_target "$SUPABASE_DB_URL")" || {
  echo "SUPABASE_DB_URL is not a valid PostgreSQL URL." >&2
  exit 2
}
test_target="$(normalize_target "$VMP_TEST_DB_URL")" || {
  echo "VMP_TEST_DB_URL is not a valid PostgreSQL URL." >&2
  exit 2
}

if [[ "$production_target" == "$test_target" ]]; then
  echo "Refusing to run database tests against the production host and database." >&2
  exit 3
fi

psql "$VMP_TEST_DB_URL" -X -v ON_ERROR_STOP=1 \
  -f tests/sql/five-role-hardening.sql
