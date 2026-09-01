import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");
const paths = {
  migration: "supabase/migrations/20260901090000_catalog_import_server_preview.sql",
  preflight: "scripts/check-catalog-import-preview-preflight.sql",
  postflight: "scripts/check-catalog-import-preview.sql",
  rollback: "scripts/rollback-catalog-import-preview.sql",
};

const stripComments = (sql) => sql
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*--.*$/gm, "")
  .trim();

const count = (value, pattern) => value.match(pattern)?.length ?? 0;

test("migration tạo đúng RPC owner-scoped, keyset pagination và ACL kín", async () => {
  const sql = stripComments(await read(paths.migration));
  assert.match(sql, /create\s+or\s+replace\s+function\s+public\.rpc_catalog_import_preview\s*\(\s*p_batch_id\s+uuid\s*,\s*p_cursor\s+integer\s+default\s+0\s*,\s*p_limit\s+integer\s+default\s+100/i);
  assert.match(sql, /returns\s+jsonb[\s\S]*security\s+definer[\s\S]*set\s+search_path\s*=\s*public\s*,\s*pg_temp/i);
  assert.match(sql, /batch\.uploaded_by\s*=\s*auth\.uid\s*\(\s*\)/i);
  assert.match(sql, /v_role\s*(?:=\s*any\s*\([^)]*|in\s*\()[\s\S]{0,180}'admin'[\s\S]{0,180}'qa_manager'/i);
  assert.match(sql, /row_number\s*>\s*p_cursor/i);
  assert.match(sql, /p_limit\s*>\s*200/i);
  assert.match(sql, /revoke\s+all\s+on\s+function\s+public\.rpc_catalog_import_preview\s*\(\s*uuid\s*,\s*integer\s*,\s*integer\s*\)\s+from\s+public\s*,\s*anon/i);
  assert.match(sql, /grant\s+execute\s+on\s+function\s+public\.rpc_catalog_import_preview\s*\(\s*uuid\s*,\s*integer\s*,\s*integer\s*\)\s+to\s+authenticated\s*,\s*service_role/i);
  assert.match(sql, /alter\s+function\s+public\.rpc_export_source_objects[\s\S]*rename\s+to\s+rpc_export_source_objects__manager_lock_impl_20260901/i);
  assert.match(sql, /create\s+(?:or\s+replace\s+)?function\s+public\.rpc_export_source_objects/i);
  assert.match(sql, /FORBIDDEN[\s\S]{0,300}Admin[\s\S]{0,100}Quản lý QA/i);
});

test("wire payload không khai báo ba khóa dữ liệu nội bộ bị cấm", async () => {
  const sql = stripComments(await read(paths.migration));
  assert.doesNotMatch(sql, /['"]uploaded_by['"]/i);
  assert.doesNotMatch(sql, /['"]expected_version['"]/i);
  assert.doesNotMatch(sql, /['"]input['"]/i);
  for (const key of [
    "object_code", "object_name", "department", "area_code", "line", "validate_flag",
    "frequency_months", "first_month", "year_ref", "report_class", "work_group",
    "workdays", "complexity_score", "quality_impact_score", "note", "is_active",
  ]) assert.match(sql, new RegExp(`'${key}'`, "i"));
});

test("mọi release artifact sở hữu transaction và checker có PASS marker", async () => {
  for (const path of Object.values(paths)) {
    const sql = stripComments(await read(path));
    assert.equal(count(sql, /^\s*begin(?:\s+read\s+only)?\s*;\s*$/gim), 1, path);
    assert.equal(count(sql, /^\s*(?:commit|rollback)\s*;\s*$/gim), 1, path);
  }
  for (const path of [paths.preflight, paths.postflight]) {
    const sql = stripComments(await read(path));
    assert.match(sql, /^begin\s+read\s+only\s*;/i, path);
    assert.match(sql, /rollback\s*;\s*select\s+'PASS\b[^']*'/is, path);
  }
});

test("preflight khóa schema drift và postflight chứng minh cô lập batch", async () => {
  const preflight = await read(paths.preflight);
  const postflight = await read(paths.postflight);
  for (const relation of ["vmp_catalog_import_batches", "vmp_catalog_import_rows"]) {
    assert.match(preflight, new RegExp(relation, "i"));
  }
  for (const column of ["uploaded_by", "classification", "current_snapshot", "patch", "errors", "row_reason"]) {
    assert.match(preflight, new RegExp(column, "i"));
  }
  assert.match(postflight, /BATCH_NOT_FOUND/i);
  assert.match(postflight, /service_role/i);
  assert.match(postflight, /next_cursor/i);
  assert.match(postflight, /uploaded_by\|expected_version\|input/i);
});

test("rollback gỡ preview, phục hồi RPC export và không chạm bảng staging hoặc RPC commit", async () => {
  const rollback = stripComments(await read(paths.rollback));
  assert.match(rollback, /drop\s+function\s+if\s+exists\s+public\.rpc_catalog_import_preview\s*\(\s*uuid\s*,\s*integer\s*,\s*integer\s*\)/i);
  assert.match(rollback, /drop\s+function\s+if\s+exists\s+public\.rpc_export_source_objects/i);
  assert.match(rollback, /alter\s+function\s+public\.rpc_export_source_objects__manager_lock_impl_20260901[\s\S]*rename\s+to\s+rpc_export_source_objects/i);
  assert.doesNotMatch(rollback, /drop\s+table/i);
  assert.doesNotMatch(rollback, /rpc_commit_catalog_import/i);
});
