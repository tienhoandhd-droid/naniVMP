import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("release entrypoint applies the reviewed transaction-owning schema chain before the exact-four manifest", async () => {
  const source = await read("scripts/apply-qa-rights-account-alignment.sql");
  const expectedChain = [
    "20260827090000_five_role_permission_hardening_current_preflight.sql",
    "20260826130000_catalog_progressed_deadline_override.sql",
    "20260826170000_manual_planned_deadline_edit.sql",
    "20260826180000_qa_manager_actual_date_principal_normalization.sql",
    "20260827100000_qa_rights_account_alignment.sql",
    "apply-qa-rights-account-manifest.sql",
  ];

  let previous = -1;
  for (const artifact of expectedChain) {
    const index = source.indexOf(artifact);
    assert.ok(index > previous, `${artifact} must appear once and in release order`);
    assert.equal(source.indexOf(artifact, index + artifact.length), -1);
    previous = index;
  }
  assert.match(source, /\\set ON_ERROR_STOP on/i);
  assert.match(source, /khoa_id is required/i);
  assert.match(source, /dat_id is required/i);
  assert.match(source, /viewer_ids is required/i);
  assert.match(source, /rpc_preview_catalog_change_v2\(uuid\)/,
    "schema-ready detection must use the deployed guarded preview RPC name");
  assert.doesNotMatch(source, /vmp_preview_catalog_change_v2\(uuid\)/,
    "the nonexistent legacy preview function would falsely rerun old migrations");
  assert.doesNotMatch(source, /apply-five-role-hardening\.sql/i);
  assert.doesNotMatch(source, /apply-five-role-account-manifest\.sql/i);
  assert.match(source,
    /begin;[\s\S]{0,300}20260827090000_five_role_permission_hardening_current_preflight\.sql[\s\S]{0,100}commit;/i,
    "the five-role migration consumes transaction-local guards and must be wrapped explicitly");
  assert.match(source,
    /9cfba864d7ea650370d6d76c33e2afcfbf941bb6918a90eeedec77f0513ab0db/,
    "schema-ready bypass must pin the installed item-rights definition");
  assert.match(source, /owner_name='postgres'[\s\S]*prosecdef[\s\S]*proacl=/,
    "schema-ready bypass must pin owner, SECURITY DEFINER and ACL metadata");
});

test("database runner proves exact-four rollback, checker, and idempotent rerun", async () => {
  const runner = await read("scripts/run-qa-rights-account-alignment-db-tests.sh");

  assert.match(runner, /QA_ALIGNMENT_INJECTED_AFTER_KHOA/);
  assert.match(runner, /ACCOUNT_MANIFEST_ASSIGNMENT_REFRESH_FAILED/);
  assert.match(runner, /manifest_state_hash/);
  assert.match(runner, /apply-qa-rights-account-alignment\.sql/);
  assert.match(runner, /check-qa-rights-account-alignment\.sql/);
  assert.match(runner, /exact-four atomic refresh checker and idempotent rerun/i);
});

test("current-preflight five-role migration changes only reviewed live locks", async () => {
  const oldSource = await read(
    "supabase/migrations/20260824120000_five_role_permission_hardening.sql",
  );
  const currentSource = await read(
    "supabase/migrations/20260827090000_five_role_permission_hardening_current_preflight.sql",
  );
  const body = (source) => source.slice(source.indexOf("\ndo $preconditions$") + 1);
  const restored = body(currentSource)
    .replaceAll("v_expected_blocker_count := 479;", "v_expected_blocker_count := 481;")
    .replaceAll("99a46e1c1a96ea8ea612056d6f596af3", "a987324be3986521ed2d26a183c4c318")
    .replaceAll("v_expected_warning_count := 14;", "v_expected_warning_count := 13;")
    .replaceAll("7bc0aa25501a745ddc161e13ef5dab9a", "1c6a661e271c910e7010e872a7ef52c1")
    .replaceAll("v_count <> 479", "v_count <> 481")
    .replaceAll("v_warning_count <> 14", "v_warning_count <> 13")
    .replace(
      "from public, anon, authenticated, service_role;",
      "from public, anon, authenticated;",
    );

  assert.equal(restored, body(oldSource),
    "forward copy may differ only in live locks and the reviewed trigger ACL normalization");
  assert.match(currentSource,
    /revoke execute on function public\.vmp_profile_authority_guard\(\)[\s\S]{0,100}from public, anon, authenticated, service_role;/i,
    "production default privileges must not leak trigger EXECUTE to service_role");
});

test("account manifest is exact-four, fail-closed, auditable, and refreshes assignments once", async () => {
  const source = await read("scripts/apply-qa-rights-account-manifest.sql");

  assert.match(source, /ACCOUNT_MANIFEST_REQUIRES_FOUR_UNIQUE_UUIDS/);
  assert.match(source, /ACCOUNT_MANIFEST_PROFILE_STATE_MISMATCH/);
  assert.match(source, /ACCOUNT_MANIFEST_PARTIAL_STATE_REFUSED/);
  assert.match(source, /begin;[\s\S]*commit;/i);
  assert.match(source, /from public\.profiles[\s\S]{0,400}for update/i);
  assert.match(source, /from public\.vmp_performers[\s\S]{0,400}for update/i);
  assert.match(source, /profile_role[\s\S]{0,800}qa_manager/i);
  assert.match(source, /performer_access_class[\s\S]{0,800}qa_manager/i);
  assert.match(source, /profile_role[\s\S]{0,800}department_user/i);
  assert.match(source, /performer_access_class[\s\S]{0,800}workshop_staff/i);
  assert.match(source, /performer_department[\s\S]{0,800}qc/i);
  assert.match(source, /assignment\.source/);
  assert.match(source, /owner_person_id/);
  assert.match(source, /support_person_id/);
  assert.equal(
    source.match(/public\.rpc_refresh_source_item_assignments\(\)/g)?.length,
    1,
    "the mutating path must invoke the canonical refresh exactly once",
  );
  assert.ok((source.match(/\\o \/dev\/null/g) ?? []).length >= 2,
    "claim setup and restoration must not print JWT contents");
  assert.doesNotMatch(source, /delete\s+from\s+(?:auth\.users|public\.profiles|public\.vmp_performers)/i);
  assert.doesNotMatch(source, /(?:[\w.+-]+@|[0-9a-f]{8}-[0-9a-f-]{27,})/i);
});

test("postflight checker is read-only and verifies roles, field rights, assignments, ACL, and preview mode", async () => {
  const source = await read("scripts/check-qa-rights-account-alignment.sql");

  assert.match(source, /begin read only;/i);
  assert.match(source, /rollback;/i);
  assert.match(source, /CHECK_FIVE_ROLE_MATRIX/);
  assert.match(source, /CHECK_QA_MANAGER_ACCOUNT/);
  assert.match(source, /CHECK_WORKSHOP_STAFF_ACCOUNT/);
  assert.match(source, /CHECK_NO_ACTIVE_VIEWER/);
  assert.match(source, /CHECK_QA_MANAGER_EIGHT_FIELDS/);
  assert.match(source, /CHECK_QA_STAFF_SEVEN_FIELDS/);
  assert.match(source, /CHECK_WORKSHOP_STAFF_ONE_FIELD/);
  assert.match(source, /CHECK_SOURCE_ASSIGNMENTS/);
  assert.match(source, /CHECK_PERMISSION_MODES/);
  assert.match(source, /CHECK_ACTIVE_ADMIN/);
  assert.match(source, /CHECK_SECURITY_ACL/);
  assert.doesNotMatch(source,
    /^\s*(?:insert|update|delete|truncate|alter|create|drop)\b/im,
    "the checker must not contain a top-level mutating statement");
  assert.doesNotMatch(source, /(?:[\w.+-]+@|[0-9a-f]{8}-[0-9a-f-]{27,})/i);
});
