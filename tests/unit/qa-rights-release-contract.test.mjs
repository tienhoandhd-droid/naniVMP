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

test("assigned-progress postflight is fail-closed, read-only, sanitized, and pins every release boundary", async () => {
  const source = await read("scripts/check-assigned-progress-visibility.sql");

  assert.match(source, /\\set ON_ERROR_STOP on/i);
  assert.match(source, /begin read only;/i);
  assert.match(source, /set local lock_timeout\s*=\s*'3s'/i);
  assert.match(source, /set local statement_timeout\s*=\s*'60s'/i);
  assert.match(source, /rollback;/i);
  for (const marker of [
    "CHECK_ASSIGNED_PROGRESS_PERMISSION_MODES",
    "CHECK_ASSIGNED_PROGRESS_FUNCTION_CONTRACT",
    "CHECK_ASSIGNED_PROGRESS_ACL",
    "CHECK_ASSIGNED_PROGRESS_WRITER_GUARDS",
    "CHECK_ASSIGNED_PROGRESS_SOURCE_DATA_UNCHANGED",
    "CHECK_ASSIGNED_PROGRESS_ADMIN_NINE_FIELDS",
    "CHECK_ASSIGNED_PROGRESS_QA_MANAGER_EIGHT_FIELDS",
    "CHECK_ASSIGNED_PROGRESS_QA_STAFF_SEVEN_FIELDS",
    "CHECK_ASSIGNED_PROGRESS_WORKSHOP_ONE_FIELD",
    "CHECK_ASSIGNED_PROGRESS_UNASSIGNED_HIDDEN",
    "CHECK_ASSIGNED_PROGRESS_THIEN_MY_HT02_HIDDEN",
  ]) assert.match(source, new RegExp(marker));
  for (const hash of [
    "a769f237d9f92c52ca9bfb5c5f6511a3b96078dd3015678bc6e78003f7243f6b",
    "d0df69bd8e9f7a2d8cfa5f5f87bd15e4559599d05c125e0b35f038ca5b25865a",
    "7e36d2360211c68d203e1fc47f8b9ab5794e6a2a88b21c2fea24cefcac6b5f8e",
    "55f7f86442b88a12c39e1f3cb6dd867d0aae0a684db78365bcef673a473e2644",
    "9cfba864d7ea650370d6d76c33e2afcfbf941bb6918a90eeedec77f0513ab0db",
    "235d5d2e4ff760a7640e2687be430a8a188a56d380b7cf7b72e6018bc71d9a3c",
    "a4bd208fc467a14b9d0383d6af486f59a66f52d8b68d4bc614b92627a73524e7",
  ]) assert.match(source, new RegExp(hash));
  assert.match(source, /rpc_save_catalog_object\(text,text,jsonb,text,integer\)/);
  assert.match(source, /HT-02/);
  assert.match(source, /assignments=0/);
  assert.doesNotMatch(source,
    /^\s*(?:insert|update|delete|truncate|alter|create|drop|notify|grant|revoke)\b/im,
    "the postflight must contain no top-level database mutation");
  assert.doesNotMatch(source, /(?:[\w.+-]+@|[0-9a-f]{8}-[0-9a-f-]{27,})/i);
});

test("assigned-progress forward recovery restores only the reviewed public writer wrapper", async () => {
  const source = await read("scripts/forward-recover-assigned-progress-visibility.sql");

  assert.match(source, /\\set ON_ERROR_STOP on/i);
  assert.match(source, /begin;[\s\S]*commit;/i);
  assert.match(source, /set local lock_timeout\s*=\s*'3s'/i);
  assert.match(source, /set local statement_timeout\s*=\s*'120s'/i);
  assert.match(source,
    /return public\.rpc_update_progress__five_role_impl_20260824\(/i);
  assert.match(source, /da25f8acbcc5aa3e029e581acb79f210cf1d6c61ab0e8458e4ff89146e75f4a0/);
  assert.match(source, /7e36d2360211c68d203e1fc47f8b9ab5794e6a2a88b21c2fea24cefcac6b5f8e/);
  assert.match(source, /a769f237d9f92c52ca9bfb5c5f6511a3b96078dd3015678bc6e78003f7243f6b/);
  assert.match(source, /d0df69bd8e9f7a2d8cfa5f5f87bd15e4559599d05c125e0b35f038ca5b25865a/);
  assert.match(source, /ASSIGNED_PROGRESS_RECOVERY_PRECONDITION/);
  assert.match(source, /ASSIGNED_PROGRESS_RECOVERY_POSTCONDITION/);
  assert.doesNotMatch(source, /drop\s+function/i,
    "the additive batch boundary and owner-only implementation remain installed");
  assert.doesNotMatch(source,
    /^\s*(?:insert|update|delete|truncate)\b/im,
    "recovery must not change modes, roles, assignments, or Source Data rows");
});

test("assigned-progress runbook pins artifacts and orders backup, apply, postflight, cache reload, and frontend release", async () => {
  const source = await read("docs/runbooks/2026-08-27-assigned-progress-visibility.md");

  for (const artifact of [
    "supabase/migrations/20260827130000_assigned_progress_visibility.sql",
    "scripts/check-assigned-progress-visibility.sql",
    "scripts/forward-recover-assigned-progress-visibility.sql",
  ]) assert.match(source, new RegExp(artifact.replaceAll(".", "\\.")));
  assert.match(source, /REVIEWED_RELEASE_SHA/);
  assert.match(source, /EXPECTED_MIGRATION_SHA256/);
  assert.match(source, /EXPECTED_CHECKER_SHA256/);
  assert.match(source, /EXPECTED_RECOVERY_SHA256/);
  assert.match(source, /PREVIOUS_PAGES_SHA/);
  assert.match(source, /PGSERVICEFILE/);
  assert.match(source, /postgres:17/);
  assert.match(source, /0700/);
  assert.match(source, /0600/);
  assert.match(source, /postflight-before-reload\.log/);
  assert.match(source, /notify pgrst, 'reload schema'/i);
  assert.match(source, /postflight-after-reload\.log/);
  assert.match(source, /migration repair --status applied 20260827130000/);
  assert.match(source, /e2e:progress-rights/);
  assert.match(source, /item_permissions_mode[^\n]*preview/i);
  assert.match(source, /forward-recover-assigned-progress-visibility\.sql/);
  assert.doesNotMatch(source, /REPLACE_WITH|UUID_DA_DOI_CHIEU|TODO|TBD/i);
});
