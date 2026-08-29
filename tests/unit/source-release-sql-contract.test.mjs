import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

const RELEASE_SQL_ARTIFACTS = [
  "supabase/migrations/20260828140000_source_qa_workshop_access_expand.sql",
  "supabase/migrations/20260828150000_source_qa_workshop_access_enforce.sql",
  "scripts/check-source-qa-workshop-access-preflight.sql",
  "scripts/check-source-qa-workshop-access.sql",
  "scripts/forward-recover-source-qa-workshop-access.sql",
];

const stripSqlComments = (sql) => sql
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*--.*$/gm, "")
  .trim();

const stripSqlLiterals = (sql) => sql
  .replace(/'(?:''|[^'])*'/g, "''")
  .replace(/"(?:""|[^"])*"/g, '""');

const countMatches = (value, expression) => value.match(expression)?.length ?? 0;

const SHARED_SOURCE_RPCS = [
  "rpc_list_source_objects",
  "rpc_source_object_facets",
  "rpc_export_source_objects",
  "rpc_source_qa_candidates",
  "rpc_list_source_workshop_coverage",
  "rpc_source_workshop_scope_choices",
  "rpc_set_source_workshop_scope_grant",
];

test("all five Source release SQL artifacts are pure SQL with owned transactions", async () => {
  for (const path of RELEASE_SQL_ARTIFACTS) {
    const sql = await read(path);
    const noComments = stripSqlComments(sql);

    assert.doesNotMatch(sql, /^\s*\\[a-z]/im,
      `${path} must not contain psql meta commands`);
    assert.doesNotMatch(sql,
      /(?<!:):(\{\??[A-Za-z_][A-Za-z0-9_]*\}|['"][A-Za-z_][A-Za-z0-9_]*['"])/m,
      `${path} must not contain psql variable syntax`);
    assert.doesNotMatch(stripSqlLiterals(noComments),
      /(?<!:):(?!:)[A-Za-z_][A-Za-z0-9_]*/m,
      `${path} must not contain plain psql variable syntax`);

    assert.equal(countMatches(noComments,
      /^\s*BEGIN(?:\s+READ\s+ONLY)?\s*;\s*$/gim), 1,
    `${path} must own exactly one transaction start`);
    assert.equal(countMatches(noComments,
      /^\s*(?:COMMIT|ROLLBACK)\s*;\s*$/gim), 1,
    `${path} must own exactly one transaction end`);
  }
});

test("read-only Source preflight and postflight end with an explicit SELECT PASS marker", async () => {
  for (const path of [
    "scripts/check-source-qa-workshop-access-preflight.sql",
    "scripts/check-source-qa-workshop-access.sql",
  ]) {
    const sql = stripSqlComments(await read(path));

    assert.match(sql, /^BEGIN\s+READ\s+ONLY\s*;/im,
      `${path} must begin a read-only transaction`);
    assert.match(sql,
      /ROLLBACK\s*;\s*SELECT\s+'PASS\b[^']*'\s*(?:AS\s+[A-Za-z_][A-Za-z0-9_]*)?\s*;\s*$/is,
      `${path} must finish with ROLLBACK followed by a SELECT PASS marker`);
  }
});

test("Source checkers use explicit active profile predicates for every persona", async () => {
  for (const path of [
    "supabase/migrations/20260828140000_source_qa_workshop_access_expand.sql",
    "scripts/check-source-qa-workshop-access-preflight.sql",
    "scripts/check-source-qa-workshop-access.sql",
  ]) {
    const sql = await read(path);

    assert.doesNotMatch(sql, /coalesce\s*\(\s*profile\.is_active\s*,\s*true\s*\)/i,
      `${path} must not treat a NULL profile active flag as active`);
    assert.doesNotMatch(sql,
      /\bprofile\.is_active\b(?!\s+IS\s+TRUE\b)/i,
      `${path} must use profile.is_active IS TRUE for every persona predicate`);
  }
});

test("expand policy fingerprints are stable across PostgreSQL role OIDs", async () => {
  const expand = await read(
    "supabase/migrations/20260828140000_source_qa_workshop_access_expand.sql",
  );

  assert.match(expand,
    /unnest\s*\(\s*policy_row\.polroles\s*\)[\s\S]{0,240}pg_roles/i,
    "policy fingerprints must resolve role OIDs to stable role names");
  assert.doesNotMatch(expand,
    /array_to_string\s*\(\s*policy_row\.polroles/i,
    "policy fingerprints must not hash environment-specific role OIDs");
});

test("expand pins reviewed historical triggers equally in production and fixtures", async () => {
  const expand = await read(
    "supabase/migrations/20260828140000_source_qa_workshop_access_expand.sql",
  );

  assert.match(expand,
    /'vmp_plan_items'[\s\S]{0,520}\b9\s*,\s*'0289cb83a680a78b4c5a9eabee77b0ef7b455d404d8268cab93018158db63209'/i);
  assert.match(expand,
    /'vmp_item_assignments'[\s\S]{0,520}\b2\s*,\s*'904cf755231a0dbb158d5e0019c9383f3cf2ce5c53a976ab8fc4c190fffc99e1'/i);
  assert.doesNotMatch(expand,
    /v_expected\.relation_name\s*=\s*'vmp_(?:plan_items|item_assignments)'\s+and\s+v_is_fixture/i,
    "reviewed historical triggers must not be fixture-only exceptions");

  assert.match(expand,
    /'audit_logs'[\s\S]{0,300}\b3\s*,\s*'962219063d18ca9459155e690dd9644fc6b26a1a75bb23368e43adcc74839525'/i);
  assert.doesNotMatch(expand,
    /v_expected\.relation_name\s*=\s*'audit_logs'\s+and\s+v_is_fixture/i,
    "the reviewed audit constraint set must not be a fixture-only exception");

  assert.doesNotMatch(expand, /\bv_is_fixture\b/i,
    "the exact dependency contract must not branch on a stale fixture marker");
  for (const hash of [
    "f1d5c93ff47de4563100f1ce9a54ada9d7b6d0ee908a9914f14327f2fa7af849",
    "81fbd19e43d3859cd28cb958fc311f1f8b693f659aca9371155433a0b70a1d29",
    "9cfba864d7ea650370d6d76c33e2afcfbf941bb6918a90eeedec77f0513ab0db",
    "7e36d2360211c68d203e1fc47f8b9ab5794e6a2a88b21c2fea24cefcac6b5f8e",
    "4f69863a23c5353fda09332a04f7643c58b8d9e0ceb126b52790e4b61162ba4c",
    "7d129948d001e7587adea78028a726f9dafa730b749b05d4912b9526aae4d686",
  ]) {
    assert.match(expand, new RegExp(hash));
  }
});

test("Source preflight blocks Source-item mismatch while reporting repair inventory", async () => {
  const preflight = await read("scripts/check-source-qa-workshop-access-preflight.sql");

  assert.match(preflight, /\bvmp_plan_items\b[\s\S]*\bvmp_source_objects\b/i);
  assert.match(preflight,
    /(?:count\s*\(\s*source_object\.id\s*\)\s*<>\s*1|NOT\s+EXISTS[\s\S]{0,700}vmp_source_objects|count\s*\(\s*\*\s*\)[^;]{0,240}>\s*1)/i,
    "preflight must detect zero or multiple active Source matches per item");
  assert.match(preflight,
    /RAISE\s+EXCEPTION[\s\S]{0,2200}SOURCE_ACCESS_PREFLIGHT_[A-Z0-9_]*(?:MAPPING|MISMATCH|SOURCE_ITEM)/i,
    "a Source-item mismatch must be a release blocker");

  assert.match(preflight, /projection[_ ]missing/i,
    "preflight must expose projection-missing inventory");
  assert.match(preflight, /(?:primary[_ ]conflicts?|assignment[_ ]conflicts?)/i,
    "preflight must expose assignment-conflict evidence");
  assert.match(preflight, /unresolved[_ ]active[_ ]performers/i,
    "preflight must expose unresolved active performer inventory");
  assert.doesNotMatch(preflight, /repairable[_ ]gaps?/i,
    "a Source-item mismatch must not be mislabeled as repairable inventory");
  assert.match(preflight,
    /RAISE\s+NOTICE[\s\S]{0,900}projection[_ ]missing[\s\S]{0,500}primary[_ ]conflicts?[\s\S]{0,500}unresolved[_ ]active[_ ]performers/i,
    "all repair inventory counts must be reported together, not silently discarded");
});

test("Source preflight requires an unambiguous master-object canonical mapping", async () => {
  const preflight = await read("scripts/check-source-qa-workshop-access-preflight.sql");

  assert.match(preflight, /public\.vmp_objects\b/i,
    "preflight must inspect the canonical master-object relation");
  assert.match(preflight,
    /(?:NOT\s+EXISTS[\s\S]{0,900}vmp_objects|count\s*\(\s*\*\s*\)[^;]{0,300}(?:vmp_objects|master_object)[^;]{0,100}(?:<>|!=|=\s*0|>\s*1))/i,
    "preflight must detect a missing or ambiguous master object");
  assert.match(preflight,
    /RAISE\s+EXCEPTION[\s\S]{0,2600}SOURCE_ACCESS_PREFLIGHT_[A-Z0-9_]*(?:MAPPING|MASTER|CANONICAL)/i,
    "master-object canonical drift must be a preflight blocker");
});

test("expand reconciler inventories ineligible existing relations without granting canonical QA access", async () => {
  const expand = await read(
    "supabase/migrations/20260828140000_source_qa_workshop_access_expand.sql",
  );
  const preflight = await read("scripts/check-source-qa-workshop-access-preflight.sql");

  assert.match(expand, /ineligible[_ ]current[_ ]relations/i,
    "expand must classify existing ineligible relations as sanitized inventory");
  assert.match(preflight, /ineligible[_ ]current[_ ]relations/i,
    "preflight must report existing ineligible relations without blocking them");
  assert.match(expand, /v_(?:owner|support)_eligible/i,
    "reconciler must distinguish eligible from ineligible linked performers");
  assert.match(expand,
    /(?:zero|count\s*\(\s*\*\s*\)[^;]{0,500}(?:source_owner|source_support))[\s\S]{0,1800}(?:ineligible|not\s+v_(?:owner|support)_eligible)/i,
    "reconciler must prove zero active canonical assignments for ineligible relations");
  assert.doesNotMatch(expand,
    /SOURCE_ACCESS_RECONCILE_INVALID_(?:OWNER|SUPPORT)_PRINCIPAL/i,
    "ineligible existing relations must not be rejected by the reconciler");
});

test("forward recovery increments authorization revision and proves that increment", async () => {
  const recovery = stripSqlComments(
    await read("scripts/forward-recover-source-qa-workshop-access.sql"),
  );

  assert.match(recovery,
    /UPDATE\s+public\.vmp_authorization_revision[\s\S]{0,400}\brevision\s*=\s*revision\s*\+\s*1\b/i,
    "recovery must advance the authorization revision");

  const postcondition = recovery.match(
    /DO\s+\$[A-Za-z0-9_]*recovery_postcondition[A-Za-z0-9_]*\$([\s\S]*?)\$[A-Za-z0-9_]*recovery_postcondition[A-Za-z0-9_]*\$/i,
  )?.[1];
  assert.ok(postcondition, "recovery must have a named postcondition block");
  assert.ok(countMatches(postcondition, /\b(?:revision|v_revision_[A-Za-z0-9_]*)\b/gi) >= 3,
    "recovery postcondition must inspect revision before/after the change");
  assert.match(postcondition,
    /\bIF\b[\s\S]*(?:\brevision\b|\bv_revision_[A-Za-z0-9_]*\b)[\s\S]*(?:<>|<=|>=|<|>|IS\s+DISTINCT\s+FROM|IS\s+NOT\s+DISTINCT\s+FROM)/i,
    "recovery postcondition must reject an unexpected revision value");
});

test("forward recovery pins the reviewed reconciler and uses fail-closed persona probes", async () => {
  const recovery = await read(
    "scripts/forward-recover-source-qa-workshop-access.sql",
  );

  assert.match(recovery, new RegExp(
    "vmp_reconcile_source_qa_projection\\(uuid\\)'::regprocedure\\)[\\s\\S]{0,100}"
      + "<> 'ddbfc4df2615f6dffc6bc087b3a19bc2bca07b01a72bf2cca9dfa3a450c9434f'",
  ),
    "recovery must pin the reviewed PostgreSQL 17 reconciler hash");
  assert.doesNotMatch(recovery, /\bv_hash\b/,
    "recovery must not carry an unused function-hash variable");
  assert.doesNotMatch(recovery,
    /\bprofile\.is_active\b(?!\s+IS\s+TRUE\b)/i,
    "recovery persona probes must require profile.is_active IS TRUE");
});

test("forward recovery retains manager execution, closes direct reads, and probes lower roles", async () => {
  const recovery = await read(
    "scripts/forward-recover-source-qa-workshop-access.sql",
  );

  for (const relation of [
    "vmp_source_objects",
    "vmp_plan_items",
    "vmp_source_workshop_scope_grants",
    "vmp_item_assignments",
  ]) {
    assert.match(recovery,
      new RegExp(`REVOKE\\s+SELECT[\\s\\S]{0,180}public\\.${relation}[\\s\\S]{0,260}FROM authenticated`, "i"),
      `${relation} direct SELECT must remain closed to authenticated`);
    assert.match(recovery,
      new RegExp(`aclexplode[\\s\\S]{0,220}public\\.${relation}[\\s\\S]{0,180}grantee=0[\\s\\S]{0,100}privilege_type='SELECT'`, "i"),
      `${relation} must reject a direct PUBLIC SELECT ACL`);
  }
  for (const rpc of [
    "rpc_list_source_objects",
    "rpc_save_catalog_object",
  ]) {
    assert.doesNotMatch(recovery,
      new RegExp(`REVOKE\\s+[^;]*ON\\s+FUNCTION\\s+public\\.${rpc}\\b[^;]*\\bauthenticated\\b`, "i"),
      `${rpc} must retain authenticated execution for managers`);
  }
  assert.match(recovery,
    /role_name\s+IN\s*\(\s*'admin'\s*,\s*'qa_manager'\s*\)/i,
    "recovery predicate must retain Admin and QA Manager");
  assert.match(recovery,
    /SOURCE_ACCESS_RECOVERY_LOWER_SOURCE_LIST_NOT_FORBIDDEN/i,
    "recovery must probe lower QA Source-list denial");
  assert.match(recovery,
    /SOURCE_ACCESS_RECOVERY_LOWER_WORKSHOP_LIST_NOT_FORBIDDEN/i,
    "recovery must probe workshop Source-list denial");
  assert.match(recovery,
    /SOURCE_ACCESS_RECOVERY_MANAGER_SOURCE_LIST_NOT_ALLOWED[\s\S]{0,700}SOURCE_ACCESS_RECOVERY_MANAGER_READ_NOT_ALLOWED/i,
    "recovery must exercise both manager Source-list and manager-read paths");
});

test("PG17 source DB runner exposes a recovery phase with final SELECT verification", async () => {
  const runner = await read("scripts/run-source-qa-workshop-access-db-tests.sh");

  assert.match(runner,
    /phase expand\|enforce-failure-before-repair\|enforce-failure-after-repair\|behavior\|security\|performance\|recovery/,
    "runner usage must expose recovery");
  assert.match(runner,
    /recovery_artifact="\$repo_dir\/scripts\/forward-recover-source-qa-workshop-access\.sql"/,
    "recovery must name the reviewed artifact");
  assert.match(runner,
    /psql\s+-X\s+-qAt\s+-v ON_ERROR_STOP=1[\s\S]{0,180}-f "\$recovery_artifact"[\s\S]{0,300}PASS SOURCE_ACCESS_RECOVERY/,
    "recovery must execute the artifact with ON_ERROR_STOP and require its final PASS");
  assert.match(runner,
    /phase=recovery disposable forward-only suite/,
    "recovery must not be mislabeled as rollback-only");
});

test("forward recovery preserves authenticated execution of shared Source RPCs and never changes data or passwords", async () => {
  const recovery = stripSqlComments(
    await read("scripts/forward-recover-source-qa-workshop-access.sql"),
  );

  for (const rpc of SHARED_SOURCE_RPCS) {
    const revokeAuthenticated = new RegExp(
      `REVOKE\\s+[^;]*\\bON\\s+FUNCTION\\s+public\\.${rpc}\\b[^;]*\\bFROM\\s+[^;]*\\bauthenticated\\b[^;]*;`,
      "i",
    );
    assert.doesNotMatch(recovery, revokeAuthenticated,
      `${rpc} must retain authenticated execution during recovery`);
  }

  assert.doesNotMatch(recovery,
    /\bDELETE\s+FROM\b|\bDROP\s+(?:TABLE|SCHEMA|DATABASE|OWNED)\b|\b(?:ALTER|CREATE)\s+(?:ROLE|USER)\b[^;]*\bPASSWORD\b|\bSET\s+PASSWORD\b|\bpg_authid\b/i,
    "recovery must not delete data or change credentials");
});

test("postflight discovers personas from the database and conditionally probes only discovered identities", async () => {
  const postflight = stripSqlComments(await read("scripts/check-source-qa-workshop-access.sql"));

  assert.match(postflight,
    /\b(?:SELECT|WITH)\b[\s\S]{0,1400}\b(?:profiles|vmp_performers)\b[\s\S]{0,1000}\b(?:vmp_business_role|role)\b/i,
    "postflight must discover persona identities from database state");
  assert.match(postflight,
    /\bIF\s+v_(?:[A-Za-z0-9_]*(?:id|persona)|admin|manager|owner|support|unrelated|workshop)[A-Za-z0-9_]*\s+IS\s+NOT\s+NULL\b[\s\S]{0,1400}\b(?:PERFORM|SELECT|rpc_)/i,
    "postflight must guard probes when an optional persona is absent");
});

test("postflight reports the actual number of non-object surface probes", async () => {
  const postflight = await read("scripts/check-source-qa-workshop-access.sql");

  assert.doesNotMatch(postflight,
    /NON_OBJECT_SURFACES_FORBIDDEN\s+count\s*=\s*2/i,
    "postflight must not claim two probes when personas are optional");
  assert.match(postflight,
    /NON_OBJECT_SURFACES_FORBIDDEN\s+count\s*=%['\s,)]/i,
    "postflight must print a dynamic non-object probe count");
});
