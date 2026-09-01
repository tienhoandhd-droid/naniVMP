import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../../src/features/catalogWorkspace/CatalogExcelImport.tsx", import.meta.url), "utf8");

test("Source uses server preview and never invents the old server classification", () => {
  assert.match(source, /fetchCatalogImportPreview/);
  assert.match(source, /CatalogImportPreviewTable/);
  assert.match(source, /appendCatalogImportPreviewPage/);
  assert.doesNotMatch(source, /loai:\s*["']server["']/);
  assert.doesNotMatch(source, /Máy chủ đối chiếu/);
});

test("commit is actionable, focuses the batch reason and preserves recovery state", () => {
  assert.match(source, /id=["']cw-import-batch-reason["']/);
  assert.match(source, /catalogImportCommitBlock/);
  assert.match(source, /focusId/);
  assert.match(source, /disabled=\{dangGhi\}/);
  assert.match(source, /STALE_VERSION|VERSION_CONFLICT/);
  assert.match(source, /Thử lại bản xem trước/);
});

test("successful commit keeps a traceable receipt with copy and pending action", () => {
  assert.match(source, /data-cw-import-receipt/);
  assert.match(source, /navigator\.clipboard\.writeText/);
  assert.match(source, /formatBangkokDateTime/);
  assert.match(source, /onOpenPending/);
});
