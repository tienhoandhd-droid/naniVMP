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
