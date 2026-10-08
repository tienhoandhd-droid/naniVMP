import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { stripTypeScriptTypes } from "node:module";
import { buildCatalogPatch } from "../../src/lib/catalogForm.ts";

// Execute the production RPC boundary, replacing only the remote transport.
// Isolate the exported function to avoid browser session initialization.
const source = readFileSync(new URL("../../src/lib/supabaseData.ts", import.meta.url), "utf8");
const start = source.indexOf("export async function saveCatalogObject(");
assert.ok(start >= 0);
const end = source.indexOf("\n}\n", start) + 3;
const js = stripTypeScriptTypes(source.slice(start, end).replace(/^export /, ""));
function boundary(result = { data: { ok: true, id: "source-id", version: 1 }, error: null }) {
  const calls = [];
  const context = vm.createContext({
    supabase: { async rpc(name, args) { calls.push(JSON.parse(JSON.stringify({ name, args }))); return result; } },
    asShape: (value) => value,
  });
  vm.runInContext(js, context);
  return { save: context.saveCatalogObject, calls };
}

test("new-object form sends its business key separately from allowed attributes", async () => {
  const { save, calls } = boundary();
  const patch = buildCatalogPatch({ object_code: "TB-NEW", object_name: "Máy mới", department: "xsx", validate_flag: "n" });
  const before = structuredClone(patch);
  const result = await save("Thiết bị", "TB-NEW", patch, "Tạo mới từ form", null);
  assert.equal(result.ok, true);
  assert.deepEqual(calls, [{ name: "rpc_save_catalog_object", args: {
    p_object_kind: "Thiết bị", p_object_code: "TB-NEW",
    p_patch: { object_name: "Máy mới", department: "xsx", validate_flag: "n" },
    p_reason: "Tạo mới từ form", p_expected_version: null,
  } }]);
  assert.deepEqual(patch, before);
});

test("existing-object edit preserves version, reason and explicit clears", async () => {
  const { save, calls } = boundary();
  await save("Thiết bị", "TB-OLD", { note: null, workdays: 0 }, "Sửa ghi chú", 7);
  assert.deepEqual(calls[0].args, { p_object_kind: "Thiết bị", p_object_code: "TB-OLD", p_patch: { note: null, workdays: 0 }, p_reason: "Sửa ghi chú", p_expected_version: 7 });
});

test("a different code cannot be silently discarded or sent to the create upsert", async () => {
  const { save, calls } = boundary();
  const result = await save("Thiết bị", "TB-OLD", { object_code: "TB-NEW" }, "Đổi mã", 7);
  assert.equal(result.ok, false);
  assert.equal(result.error_code, "OBJECT_CODE_CHANGE_REQUIRES_RENAME");
  assert.equal(calls.length, 0);
});

test("server denial remains a denial and transport failure remains visible", async () => {
  const denied = boundary({ data: { ok: false, error_code: "FORBIDDEN" }, error: null });
  assert.equal((await denied.save("Thiết bị", "TB-NEW", { object_name: "Máy" }, null, null)).error_code, "FORBIDDEN");
  const network = boundary({ data: null, error: { message: "offline" } });
  await assert.rejects(network.save("Thiết bị", "TB-NEW", { object_name: "Máy" }, null, null), /offline/);
});
