import assert from "node:assert/strict";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, relative } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { parse } from "@babel/parser";

const CLASSIFICATION_START = "-- SOURCE_RPC_INVENTORY_BEGIN";
const CLASSIFICATION_END = "-- SOURCE_RPC_INVENTORY_END";
const CATALOG_V2_REVIEWED_RPC = new Map([
  ["rpc_preview_catalog_change_v2", {
    identity: "rpc_preview_catalog_change_v2(uuid)",
    classification: "guarded_explicit",
  }],
  ["rpc_apply_catalog_change_v2", {
    identity: "rpc_apply_catalog_change_v2(uuid,text,integer,jsonb,boolean)",
    classification: "guarded_explicit",
  }],
]);
const MANUAL_DEADLINE_REVIEWED_RPC = new Map([
  ["rpc_update_planned_deadlines", {
    identity: "rpc_update_planned_deadlines(text,jsonb,text,integer,boolean)",
    classification: "guarded_explicit",
  }],
]);
const ASSIGNED_PROGRESS_REVIEWED_RPC = new Map([
  ["rpc_my_editable_progress_rights", {
    identity: "rpc_my_editable_progress_rights()",
    classification: "guarded_explicit",
  }],
]);
const LOCAL_ACCOUNT_IDS = [1, 2, 3, 4, 5, 6, 7]
  .map((suffix) => `71000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`)
  .join(",");

function sourceFiles(root) {
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if ([".js", ".jsx", ".ts", ".tsx"].includes(extname(entry.name))) files.push(path);
    }
  };
  visit(root);
  return files.sort();
}

function visitAst(node, visitor) {
  if (!node || typeof node !== "object") return;
  visitor(node);
  for (const [key, value] of Object.entries(node)) {
    if (["loc", "start", "end", "extra", "leadingComments", "trailingComments", "innerComments"].includes(key)) continue;
    if (Array.isArray(value)) {
      for (const child of value) visitAst(child, visitor);
    } else if (value && typeof value === "object" && typeof value.type === "string") {
      visitAst(value, visitor);
    }
  }
}

function unwrapExpression(node) {
  while (node && [
    "ParenthesizedExpression",
    "TSAsExpression",
    "TSNonNullExpression",
    "TSSatisfiesExpression",
    "TSTypeAssertion",
    "TypeCastExpression",
  ].includes(node.type)) node = node.expression;
  return node;
}

function memberName(node) {
  const member = unwrapExpression(node);
  if (!member || !["MemberExpression", "OptionalMemberExpression"].includes(member.type)) return null;
  if (member.computed) return member.property.type === "StringLiteral" ? member.property.value : null;
  return member.property.type === "Identifier" ? member.property.name : null;
}

function isRpcMember(node) {
  return memberName(node) === "rpc";
}

function isRpcBind(node) {
  const call = unwrapExpression(node);
  if (call?.type !== "CallExpression" || memberName(call.callee) !== "bind") return false;
  return isRpcMember(unwrapExpression(call.callee).object);
}

function extractRpcCalls(file, source) {
  const ast = parse(source, {
    sourceFilename: file,
    sourceType: "module",
    plugins: ["typescript", ...(file.endsWith("x") ? ["jsx"] : [])],
  });
  const calls = [];
  const aliases = new Set();
  const wrappers = new Set();
  const factories = new Set();
  const wrapperDelegates = new Set();

  visitAst(ast.program, (node) => {
    if (node.type === "VariableDeclarator"
        && node.id.type === "Identifier" && isRpcBind(node.init)) {
      aliases.add(node.id.name);
    }
    if (node.type !== "FunctionDeclaration" || !node.id || !node.body) return;
    const firstParameter = node.params[0]?.type === "Identifier" ? node.params[0].name : null;
    visitAst(node.body, (child) => {
      if (child.type === "ReturnStatement" && isRpcBind(child.argument)) {
        factories.add(node.id.name);
      }
      if (firstParameter && child.type === "CallExpression" && isRpcMember(child.callee)) {
        const firstArgument = unwrapExpression(child.arguments[0]);
        if (firstArgument?.type === "Identifier" && firstArgument.name === firstParameter) {
          wrappers.add(node.id.name);
          wrapperDelegates.add(child);
        }
      }
    });
  });

  visitAst(ast.program, (node) => {
    if (node.type !== "CallExpression" && node.type !== "OptionalCallExpression") return;
    const callee = unwrapExpression(node.callee);
    const direct = isRpcMember(callee);
    const aliasOrWrapper = callee?.type === "Identifier"
      && (aliases.has(callee.name) || wrappers.has(callee.name));
    const factory = callee?.type === "CallExpression"
      && unwrapExpression(callee.callee)?.type === "Identifier"
      && factories.has(unwrapExpression(callee.callee).name);
    if (!direct && !aliasOrWrapper && !factory) return;
    const first = unwrapExpression(node.arguments[0]);
    if (first?.type !== "StringLiteral") {
      if (wrapperDelegates.has(node)) return;
      assert.fail(`non-literal RPC target at ${file}:${node.loc.start.line}`);
    }
    calls.push({ name: first.value, file, line: node.loc.start.line });
  });

  return calls;
}

function sourceRpcInventory(root = "src") {
  const calls = sourceFiles(root).flatMap((file) =>
    extractRpcCalls(relative(".", file), readFileSync(file, "utf8"))
  );
  const byName = new Map();
  for (const call of calls) {
    const locations = byName.get(call.name) ?? [];
    locations.push(`${call.file}:${call.line}`);
    byName.set(call.name, locations);
  }
  return byName;
}

function reviewedMigrationInventory(source) {
  const start = source.indexOf(CLASSIFICATION_START);
  const end = source.indexOf(CLASSIFICATION_END);
  assert.notEqual(start, -1, "migration is missing the reviewed source RPC inventory start marker");
  assert.notEqual(end, -1, "migration is missing the reviewed source RPC inventory end marker");
  assert.ok(end > start, "migration source RPC inventory markers are out of order");

  const block = source.slice(start + CLASSIFICATION_START.length, end);
  const rows = new Map();
  const rowPattern = /\('([^']+)',\s*'([^']+)',\s*'(guarded_wrapper|guarded_explicit|service_only)'\)/g;
  for (const match of block.matchAll(rowPattern)) {
    assert.equal(rows.has(match[1]), false, `duplicate migration RPC classification: ${match[1]}`);
    rows.set(match[1], { identity: match[2], classification: match[3] });
  }
  return rows;
}

test("AST extraction sees literal RPC targets through TypeScript call syntax", () => {
  const calls = extractRpcCalls("fixture.ts", `
    supabase.rpc("rpc_direct");
    (supabase.rpc as unknown as (name: string) => unknown)("rpc_casted");
    const bound = supabase.rpc.bind(supabase);
    bound("rpc_bound");
    function callRpc(name: string, args: object) { return supabase.rpc(name, args); }
    callRpc("rpc_local_wrapper", {});
    function rpcFactory() { return supabase.rpc.bind(supabase); }
    rpcFactory()("vmp_factory", {});
    supabase.rpc("item_permissions_mode" as never);
    supabase.rpc("nonprefixed_rpc");
    const notACall = "rpc_string_only";
  `);

  assert.deepEqual(
    [...new Set(calls.map(({ name }) => name))].sort(),
    [
      "item_permissions_mode",
      "nonprefixed_rpc",
      "rpc_bound",
      "rpc_casted",
      "rpc_direct",
      "rpc_local_wrapper",
      "vmp_factory",
    ],
  );
});

test("AST extraction rejects unreviewable dynamic RPC targets", () => {
  assert.throws(
    () => extractRpcCalls("fixture.ts", "supabase.rpc(runtimeName);"),
    /non-literal RPC target at fixture\.ts:1/,
  );
});

test("every source RPC call has exactly one reviewed migration classification", () => {
  const sourceInventory = sourceRpcInventory();
  const migrationInventory = reviewedMigrationInventory(readFileSync(
    "supabase/migrations/20260824120000_five_role_permission_hardening.sql",
    "utf8",
  ));
  const catalogV2Migration = readFileSync(
    "supabase/migrations/20260826130000_catalog_progressed_deadline_override.sql",
    "utf8",
  );
  const manualDeadlineMigration = readFileSync(
    "supabase/migrations/20260826170000_manual_planned_deadline_edit.sql",
    "utf8",
  );
  const assignedProgressMigration = readFileSync(
    "supabase/migrations/20260827130000_assigned_progress_visibility.sql",
    "utf8",
  );
  for (const name of [
    ...CATALOG_V2_REVIEWED_RPC.keys(),
    ...MANUAL_DEADLINE_REVIEWED_RPC.keys(),
    ...ASSIGNED_PROGRESS_REVIEWED_RPC.keys(),
  ]) {
    assert.equal(migrationInventory.has(name), false, `${name} must remain additive to the sealed five-role baseline`);
  }
  const reviewedInventory = new Map([
    ...migrationInventory,
    ...CATALOG_V2_REVIEWED_RPC,
    ...MANUAL_DEADLINE_REVIEWED_RPC,
    ...ASSIGNED_PROGRESS_REVIEWED_RPC,
  ]);
  const sourceNames = [...sourceInventory.keys()].sort();
  const reviewedNames = [...reviewedInventory.keys()].sort();

  assert.equal(sourceNames.length, 66, "reviewed source HEAD must expose 66 literal RPC targets");
  assert.deepEqual(reviewedNames, sourceNames, [
    "source RPC inventory differs from the reviewed migration classification",
    ...sourceNames.map((name) => `${name}: ${sourceInventory.get(name).join(", ")}`),
  ].join("\n"));
  assert.deepEqual(CATALOG_V2_REVIEWED_RPC, new Map([
    ["rpc_preview_catalog_change_v2", { identity: "rpc_preview_catalog_change_v2(uuid)", classification: "guarded_explicit" }],
    ["rpc_apply_catalog_change_v2", { identity: "rpc_apply_catalog_change_v2(uuid,text,integer,jsonb,boolean)", classification: "guarded_explicit" }],
  ]));
  assert.match(catalogV2Migration, /create function public\.rpc_preview_catalog_change_v2\(p_change_id uuid\)/i);
  assert.match(catalogV2Migration, /create function public\.rpc_apply_catalog_change_v2\(\s*p_change_id uuid,\s*p_reason text,\s*p_expected_timeline_revision integer,\s*p_deadline_overrides jsonb,\s*p_override_confirmed boolean\s*\)/is);
  assert.match(catalogV2Migration, /grant execute on function public\.rpc_preview_catalog_change_v2\(uuid\) to authenticated,service_role;/i);
  assert.match(catalogV2Migration, /grant execute on function public\.rpc_apply_catalog_change_v2\(uuid,text,integer,jsonb,boolean\) to authenticated,service_role;/i);
  assert.deepEqual(MANUAL_DEADLINE_REVIEWED_RPC, new Map([
    ["rpc_update_planned_deadlines", { identity: "rpc_update_planned_deadlines(text,jsonb,text,integer,boolean)", classification: "guarded_explicit" }],
  ]));
  assert.match(manualDeadlineMigration, /create function public\.rpc_update_planned_deadlines\(\s*p_validation_code text,\s*p_deadlines jsonb,\s*p_reason text,\s*p_expected_version integer,\s*p_confirmed boolean\s*\)/is);
  assert.match(manualDeadlineMigration, /grant execute on function public\.rpc_update_planned_deadlines\(\s*text\s*,\s*jsonb\s*,\s*text\s*,\s*integer\s*,\s*boolean\s*\)\s*to authenticated\s*,\s*service_role;/is);
  assert.deepEqual(ASSIGNED_PROGRESS_REVIEWED_RPC, new Map([
    ["rpc_my_editable_progress_rights", { identity: "rpc_my_editable_progress_rights()", classification: "guarded_explicit" }],
  ]));
  assert.match(assignedProgressMigration, /create or replace function public\.rpc_my_editable_progress_rights\(\)\s*returns jsonb\s*language plpgsql\s*stable\s*security definer\s*set search_path=public,pg_temp/is);
  assert.match(assignedProgressMigration, /alter function public\.rpc_my_editable_progress_rights\(\)\s*set search_path=public,pg_temp;/is);
  assert.match(assignedProgressMigration, /revoke all on function public\.rpc_my_editable_progress_rights\(\)\s*from public,anon,authenticated,service_role;/is);
  assert.match(assignedProgressMigration, /grant execute on function public\.rpc_my_editable_progress_rights\(\)\s*to service_role;/is);
  assert.match(assignedProgressMigration, /grant execute on function public\.rpc_my_editable_progress_rights\(\)\s*to authenticated;/is);
});

test("database browser surface is the reviewed 60 plus four exact RLS helpers", () => {
  const source = readFileSync(
    "supabase/migrations/20260824120000_five_role_permission_hardening.sql",
    "utf8",
  );
  const inventory = reviewedMigrationInventory(source);
  const counts = [...inventory.values()].reduce((result, row) => {
    result[row.classification] = (result[row.classification] ?? 0) + 1;
    return result;
  }, {});

  assert.deepEqual(counts, {
    guarded_wrapper: 53,
    guarded_explicit: 7,
    service_only: 2,
  });
  assert.equal(
    [...inventory.values()].filter(({ classification }) => classification !== "service_only").length,
    60,
  );
  for (const identity of [
    "is_admin()",
    "is_admin_or_qa()",
    "vmp_current_session_is_active()",
    "vmp_can_view_my_item(text)",
  ]) {
    assert.match(source, new RegExp(`\\('${identity.replace(/[()]/g, "\\$&")}\\'\\)`));
  }
  assert.match(source, /3dd77d7f46c8b01fdcd39f96996f87d2/);
  assert.match(source, /e5631441c030967069e172ca6a68ebe1/);
  assert.match(source, /b60d876fedc438540890578da071a693/);
  assert.match(source, /revoke execute on all functions in schema public\s+from public, anon, authenticated/i);
  assert.match(source,
    /grant execute on function public\.%.+ to authenticated, service_role/i);
});

test("production apply has one immutable approved account digest", () => {
  const source = readFileSync("scripts/apply-five-role-hardening.sql", "utf8");

  assert.match(source, /2c09501166eb45c3676451084230340e/);
  assert.doesNotMatch(
    source,
    /:\{\?expected_account_digest\}|:'expected_account_digest'|\\set\s+expected_account_digest|1f8213f705d26bd656781baa08cb1f42/,
  );
});

function makeFakePsql() {
  const root = mkdtempSync(join(tmpdir(), "vmp-five-role-local-apply-"));
  const bin = join(root, "bin");
  const marker = join(root, "psql.txt");
  mkdirSync(bin);
  const psql = join(bin, "psql");
  writeFileSync(psql, `#!/usr/bin/env bash
{
  printf 'ARGS\\n'
  printf '%s\\n' "$@"
  printf 'ENV\\n'
  printf 'PGHOST=%s\\nPGPORT=%s\\nPGUSER=%s\\nPGDATABASE=%s\\n' "\${PGHOST:-}" "\${PGPORT:-}" "\${PGUSER:-}" "\${PGDATABASE:-}"
  printf 'PGSERVICE=%s\\nPGSERVICEFILE=%s\\nPGHOSTADDR=%s\\nPGOPTIONS=%s\\n' "\${PGSERVICE:-}" "\${PGSERVICEFILE:-}" "\${PGHOSTADDR:-}" "\${PGOPTIONS:-}"
  printf 'SUPABASE_DB_URL=%s\\nVMP_TEST_DB_URL=%s\\n' "\${SUPABASE_DB_URL:-}" "\${VMP_TEST_DB_URL:-}"
  printf 'STDIN\\n'
  cat
} > ${JSON.stringify(marker)}
`);
  chmodSync(psql, 0o755);
  return { bin, marker, root };
}

test("local apply entrypoint rejects unsafe targets before psql", () => {
  for (const VMP_TEST_DB_URL of [
    "postgresql://postgres:postgres@remote.example:54322/postgres",
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres?host=remote.example",
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres#override",
  ]) {
    const { bin, marker, root } = makeFakePsql();
    try {
      const result = spawnSync("bash", ["scripts/apply-five-role-hardening-local-test.sh"], {
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          SUPABASE_DB_URL: "postgresql://u:p@production.example/vmp",
          VMP_LOCAL_ACCOUNT_IDS: LOCAL_ACCOUNT_IDS,
          VMP_TEST_DB_URL,
        },
      });
      assert.equal(result.status, 3, VMP_TEST_DB_URL);
      assert.equal(existsSync(marker), false, VMP_TEST_DB_URL);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("local apply and checker pass only validated connection fields to psql", () => {
  const { bin, marker, root } = makeFakePsql();
  const baseEnv = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    SUPABASE_DB_URL: "postgresql://u:p@production.example/vmp",
    VMP_LOCAL_ACCOUNT_IDS: LOCAL_ACCOUNT_IDS,
    VMP_TEST_DB_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    PGSERVICE: "production",
    PGSERVICEFILE: "/tmp/production-service.conf",
    PGHOSTADDR: "203.0.113.10",
    PGOPTIONS: "-c search_path=unsafe",
  };

  try {
    const applied = spawnSync("bash", ["scripts/apply-five-role-hardening-local-test.sh", "apply"], {
      encoding: "utf8",
      env: baseEnv,
    });
    assert.equal(applied.status, 0, `${applied.stdout}\n${applied.stderr}`);
    let invocation = readFileSync(marker, "utf8");
    assert.match(invocation, /PGHOST=127\.0\.0\.1/);
    assert.match(invocation, /PGPORT=54322/);
    assert.match(invocation, /PGUSER=postgres/);
    assert.match(invocation, /PGDATABASE=postgres/);
    assert.match(invocation, /PGSERVICE=$/m);
    assert.match(invocation, /PGSERVICEFILE=$/m);
    assert.match(invocation, /PGHOSTADDR=$/m);
    assert.match(invocation, /PGOPTIONS=$/m);
    assert.match(invocation, /SUPABASE_DB_URL=$/m);
    assert.match(invocation, /VMP_TEST_DB_URL=$/m);
    assert.doesNotMatch(invocation.slice(0, invocation.indexOf("STDIN")), /postgresql:\/\//);
    assert.match(invocation, /apply-five-role-hardening-local-test\.sql/);

    const checked = spawnSync("bash", ["scripts/apply-five-role-hardening-local-test.sh", "check"], {
      encoding: "utf8",
      env: baseEnv,
    });
    assert.equal(checked.status, 0, `${checked.stdout}\n${checked.stderr}`);
    invocation = readFileSync(marker, "utf8");
    assert.match(invocation, /five_role_local_test 1/);
    assert.match(invocation, /check-five-role-permission-state\.sql/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
