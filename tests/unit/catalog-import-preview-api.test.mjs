import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("API preview gọi đúng RPC, wire args và decoder fail-closed", async () => {
  const source = await read("src/features/catalogWorkspace/api.ts");
  assert.match(source, /export\s+async\s+function\s+fetchCatalogImportPreview/i);
  assert.match(source, /rpc\s*\(\s*["']rpc_catalog_import_preview["']/i);
  assert.match(source, /p_batch_id\s*:\s*input\.batchId/i);
  assert.match(source, /p_cursor\s*:\s*input\.cursor\s*\?\?\s*0/i);
  assert.match(source, /p_limit\s*:\s*input\.limit\s*\?\?\s*100/i);
  assert.match(source, /decodeCatalogImportPreview\s*\(\s*data\s*\)/i);
  assert.match(source, /catch[\s\S]{0,300}MALFORMED_RESPONSE/i);
});

test("database type khai báo đúng signature RPC preview", async () => {
  const source = await read("src/types/database.ts");
  assert.match(source, /rpc_catalog_import_preview\s*:\s*\{\s*Args\s*:\s*\{[^}]*p_batch_id\s*:\s*string[^}]*p_cursor\?\s*:\s*number[^}]*p_limit\?\s*:\s*number[^}]*\}\s*Returns\s*:\s*Json/is);
});
