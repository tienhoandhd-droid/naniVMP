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

test("assigned-progress release pins the reviewed 514-blocker production baseline", async () => {
  const [checker, runbook] = await Promise.all([
    read("scripts/check-assigned-progress-visibility.sql"),
    read("docs/runbooks/2026-08-27-assigned-progress-visibility.md"),
  ]);

  for (const source of [checker, runbook]) {
    assert.match(source, /514/);
    assert.match(source, /82020b2908015d95f228f6caacf90f3a/);
    assert.match(source, /14/);
    assert.match(source, /7bc0aa25501a745ddc161e13ef5dab9a/);
    assert.doesNotMatch(source, /479 blocker|v_count\s*<>\s*479/i);
  }
});

test("assigned-progress workshop probe selects a real assignment before evaluating batch rights", async () => {
  const source = await read("scripts/check-assigned-progress-visibility.sql");
  const selection = source.match(
    /select performer\.user_id into v_workshop[\s\S]*?order by[\s\S]*?limit 1;/i,
  )?.[0];

  assert.ok(selection, "checker must select an active workshop assignment fixture");
  assert.match(selection, /assignment\.assignment_kind='equipment_department'/);
  assert.match(selection, /assignment\.is_active/);
  assert.match(selection, /performer\.is_active/);
  assert.match(selection, /item\.is_active/);
  assert.match(selection, /vmp_business_role\(performer\.user_id\)='workshop_staff'/);
  assert.doesNotMatch(selection, /vmp_item_rights|rights\.can_view/i,
    "a broken resolver must fail the batch assertion, not turn a real fixture into assignments=0");
  assert.match(source,
    /if v_workshop is null then[\s\S]*assignments=0[\s\S]*rpc_my_editable_progress_rights\(\)[\s\S]*\["actual_validation_date"\]/i);
});

test("assigned-progress checker and recovery pin both session-helper definitions, metadata, and ACL", async () => {
  const [checker, recovery] = await Promise.all([
    read("scripts/check-assigned-progress-visibility.sql"),
    read("scripts/forward-recover-assigned-progress-visibility.sql"),
  ]);
  const helperContracts = [
    [
      "public.vmp_is_active_session(uuid)",
      "e52a0cece430ad8b8319819b633fd4fc8aa92bc2d2fac083a33b22f609e1f417",
      "c15c1a154cce836fd7c53553da6b8694837818bd489a7bb5654cfb65bc9b2cd6",
    ],
    [
      "public.vmp_session_denial()",
      "8ff11d9d103ea62dd1c8786b1aa766bcfe6386bf6d4ec5b3729062c850609ad1",
      "4cf828cdcd9d7121ff65b0ce2042a37468fba5a603a9b7c4da5f7645c7fbe6ab",
    ],
  ];

  for (const [signature, definitionHash, metadataHash] of helperContracts) {
    for (const literal of [signature, definitionHash, metadataHash]) {
      assert.match(checker, new RegExp(literal.replaceAll(/[().]/g, "\\$&")));
      assert.ok(recovery.split(literal).length >= 3,
        `${signature} contract must be pinned in recovery pre- and postconditions`);
    }
  }
  assert.match(checker,
    /has_function_privilege\('public','public\.vmp_is_active_session\(uuid\)','EXECUTE'\)[\s\S]*has_function_privilege\('service_role','public\.vmp_is_active_session\(uuid\)','EXECUTE'\)/i);
  assert.match(checker,
    /has_function_privilege\('public','public\.vmp_session_denial\(\)','EXECUTE'\)[\s\S]*has_function_privilege\('authenticated','public\.vmp_session_denial\(\)','EXECUTE'\)/i);
  assert.match(recovery, /ASSIGNED_PROGRESS_RECOVERY_POSTCONDITION_HELPER_ACL/);
});

test("assigned-progress checker requires all five persona IDs to be pairwise distinct", async () => {
  const source = await read("scripts/check-assigned-progress-visibility.sql");

  assert.match(source,
    /count\(distinct persona_id\)[\s\S]*unnest\(array\[v_admin,v_manager,v_assigned_qa,v_unassigned_qa,v_thien_my\]\)/i);
  assert.match(source, /<>\s*5/);
});

test("assigned-progress runbook pushes and verifies exact feature and main SHAs with unambiguous workflow and Pages evidence", async () => {
  const source = await read("docs/runbooks/2026-08-27-assigned-progress-visibility.md");
  const ordered = (...needles) => {
    let previous = -1;
    for (const needle of needles) {
      const index = source.indexOf(needle);
      assert.ok(index > previous, `${needle} must exist in release order`);
      previous = index;
    }
  };

  ordered(
    'git push origin "$REVIEWED_RELEASE_SHA:refs/heads/$FEATURE_BRANCH"',
    'refs/heads/$FEATURE_BRANCH',
    "gh workflow run deploy.yml",
    "QUALITY_RUN_ID",
    "REMOTE_MAIN_BEFORE",
    'git push origin "$REVIEWED_RELEASE_SHA:refs/heads/main"',
    "PAGES_RUN_ID",
    "PAGES_DEPLOYMENT_ID",
    "PAGE_HTTP_STATUS",
    "ASSET_HTTP_STATUS",
  );
  assert.match(source, /created_at[\s\S]*QUALITY_DISPATCH_AT/,
    "quality run discovery must exclude old runs");
  assert.match(source, /created_at[\s\S]*PAGES_PUSH_AT/,
    "push run discovery must exclude old runs");
  assert.match(source, /merge-base --is-ancestor "\$REMOTE_MAIN_BEFORE" "\$REVIEWED_RELEASE_SHA"/);
  assert.match(source, /PAGES_DEPLOYMENT_ID[\s\S]*github-pages[\s\S]*REVIEWED_RELEASE_SHA/);
  assert.match(source, /PAGE_HTTP_STATUS[\s\S]*= 200/);
  assert.match(source, /ASSET_HTTP_STATUS[\s\S]*= 200/);
  assert.doesNotMatch(source, /git (?:checkout|switch|merge|rebase) main/,
    "release must never depend on the unrelated local main branch");
});

test("assigned-progress runbook proves the linked project and exact remote migration JSON before repair", async () => {
  const source = await read("docs/runbooks/2026-08-27-assigned-progress-visibility.md");

  assert.match(source, /EXPECTED_PROJECT_REF='ivembmikfhtyzhtqebgh'/);
  assert.match(source, /supabase\/\.temp\/project-ref/);
  assert.match(source, /supabase\/\.temp\/linked-project\.json/);
  assert.match(source, /PGSERVICE_HOST/);
  assert.match(source, /PGSERVICE_USER/);
  assert.ok((source.match(/migration list --linked --output json/g) ?? []).length >= 2);
  assert.match(source, /jq[\s\S]*\.remote/);
  assert.match(source, /select\(\.remote\s*==\s*\$version\)/);
  assert.doesNotMatch(source, /rg -c '20260827130000'/);
});
