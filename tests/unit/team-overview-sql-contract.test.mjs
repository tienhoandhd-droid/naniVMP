import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("team summary RPC is a sealed SECURITY DEFINER aggregate with exact ACL", async () => {
  const sql = await read("supabase/migrations/20260829150000_team_overview_summary.sql");

  assert.match(sql, /create\s+or\s+replace\s+function\s+public\.rpc_team_overview_summary\s*\(\s*p_year\s+integer\s+default\s+extract\s*\(\s*year\s+from\s+now\s*\(\s*\)\s*\)\s*::\s*integer\s*\)\s*returns\s+jsonb/is);
  assert.match(sql, /security\s+definer/is);
  assert.match(sql, /set\s+search_path\s*=\s*public\s*,\s*pg_temp/is);
  assert.match(sql, /revoke\s+all\s+on\s+function\s+public\.rpc_team_overview_summary\s*\(\s*integer\s*\)\s+from\s+public\s*,\s*anon/is);
  assert.match(sql, /grant\s+execute\s+on\s+function\s+public\.rpc_team_overview_summary\s*\(\s*integer\s*\)\s+to\s+authenticated\s*,\s*service_role/is);
});

test("browser calls require an active session and explicit Overview view permission", async () => {
  const sql = await read("supabase/migrations/20260829150000_team_overview_summary.sql");

  assert.match(sql, /coalesce\s*\(\s*auth\.role\s*\(\s*\)\s*,\s*''\s*\)\s*=\s*'service_role'/is);
  assert.match(sql, /not\s+public\.vmp_is_active_session\s*\(\s*auth\.uid\s*\(\s*\)\s*\)[\s\S]{0,180}return\s+public\.vmp_session_denial\s*\(\s*\)/is);
  assert.match(sql, /v_role\s*:=\s*public\.vmp_business_role\s*\(\s*auth\.uid\s*\(\s*\)\s*\)/is);
  assert.match(sql, /from\s+public\.vmp_screen_permissions[\s\S]{0,300}business_role\s*=\s*v_role[\s\S]{0,180}screen_id\s*=\s*'overview'[\s\S]{0,180}can_view\s+is\s+true/is);
  assert.match(sql, /'ok'\s*,\s*false[\s\S]{0,120}'error_code'\s*,\s*'FORBIDDEN'/is);
});

test("aggregate population and completion use only canonical active plan rows", async () => {
  const sql = await read("supabase/migrations/20260829150000_team_overview_summary.sql");

  assert.match(sql, /from\s+public\.vmp_plan_items\s+(?:as\s+)?item/is);
  assert.match(sql, /item\.year\s*=\s*p_year/is);
  assert.match(sql, /item\.is_active\s+is\s+true/is);
  assert.match(sql, /item\.missing_from_sheet\s+is\s+not\s+true/is);
  assert.match(sql, /coalesce\s*\(\s*item\.item_state\s*,\s*'active'\s*\)\s*=\s*'active'/is);
  assert.match(sql, /item\.status_vmp\s*=\s*'completed'/is);
  assert.match(sql, /round\s*\([\s\S]{0,180}(?:completed|v_completed)[\s\S]{0,100}100[\s\S]{0,100}(?:total|v_total)/is);
});

test("success payload is exactly six aggregate fields and contains no detail collection", async () => {
  const sql = await read("supabase/migrations/20260829150000_team_overview_summary.sql");
  const success = [...sql.matchAll(/return\s+jsonb_build_object\s*\(([\s\S]*?)\)\s*;/gis)]
    .map((match) => match[1])
    .find((body) => /'updated_at'\s*,/i.test(body));

  assert.ok(success, "RPC must return one jsonb_build_object success payload");
  const keys = [...success.matchAll(/'([a-z_]+)'\s*,/g)].map((match) => match[1]);
  assert.deepEqual(keys, ["ok", "year", "total", "completed", "rate", "updated_at"]);
  assert.doesNotMatch(sql, /\b(?:jsonb?_agg|array_agg)\s*\(/i);
  assert.doesNotMatch(sql, /'(?:validation_code|object_code|object_name|owner|owner_name|person_id|rows|items)'\s*,/i);
});

test("SQL harness covers QA success, denials, service role, and exact keys", async () => {
  const sql = await read("supabase/tests/team_overview_summary.sql");

  for (const marker of [
    "TEAM_SUMMARY_QA_STAFF_SUCCESS",
    "TEAM_SUMMARY_INACTIVE_DENIAL",
    "TEAM_SUMMARY_NO_OVERVIEW_DENIAL",
    "TEAM_SUMMARY_SERVICE_ROLE_SUCCESS",
    "TEAM_SUMMARY_EXACT_KEYS",
  ]) assert.match(sql, new RegExp(marker));
  assert.match(sql, /jsonb_object_keys/is);
  assert.match(sql, /set_config\s*\(\s*'request\.jwt\.claims'/is);
  assert.match(sql, /insert\s+into\s+auth\.users/is);
  assert.match(sql, /insert\s+into\s+public\.profiles/is);
  assert.match(sql, /insert\s+into\s+public\.vmp_plan_items/is);
  assert.match(sql, /set\s+local\s+role\s+authenticated/is);
  assert.match(sql, /set\s+local\s+role\s+service_role/is);
  assert.match(sql, /error_code[\s\S]{0,120}ACCOUNT_DISABLED/is);
  assert.match(sql, /total'\s*=\s*'2'[\s\S]{0,240}completed'\s*=\s*'1'[\s\S]{0,240}rate'\s*=\s*'50'/is);
  assert.match(sql, /rollback\s*;/is);
});

test("compensating rollback revokes the RPC ACL and drops the function transactionally", async () => {
  const rollback = await read("scripts/rollback-team-overview-summary.sql");
  const verification = await read("supabase/tests/team_overview_summary_rollback.sql");

  assert.match(rollback, /^\s*begin\s*;/is);
  assert.match(rollback,
    /revoke\s+all\s+on\s+function\s+public\.rpc_team_overview_summary\s*\(\s*integer\s*\)\s+from\s+public\s*,\s*anon\s*,\s*authenticated\s*,\s*service_role\s*;/is);
  assert.match(rollback,
    /drop\s+function\s+public\.rpc_team_overview_summary\s*\(\s*integer\s*\)\s*;/is);
  assert.match(rollback, /commit\s*;\s*$/is);
  assert.doesNotMatch(rollback, /create\s+(?:or\s+replace\s+)?function/is);

  assert.match(verification, /to_regprocedure\s*\(\s*'public\.rpc_team_overview_summary\(integer\)'\s*\)\s+is\s+null/is);
  assert.match(verification,
    /values\s*\(\s*'anon'::text\s*\)\s*,\s*\(\s*'authenticated'::text\s*\)\s*,\s*\(\s*'service_role'::text\s*\)/is);
  assert.match(verification,
    /has_function_privilege\s*\(\s*role_name\s*,\s*target\.oid\s*,\s*'EXECUTE'\s*\)/is);
  assert.match(verification, /TEAM_SUMMARY_ROLLBACK_FUNCTION_ABSENT/is);
  assert.match(verification, /TEAM_SUMMARY_ROLLBACK_EXECUTE_ABSENT/is);
});
