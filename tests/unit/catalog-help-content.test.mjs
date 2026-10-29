import assert from "node:assert/strict";
import test from "node:test";
import { CATALOG_HELP_CONTENT, getCatalogHelp } from "../../src/features/catalogWorkspace/catalogHelpContent.ts";

const expectedRegions = ["objects", "coverage", "products", "alerts", "revalidation", "changes", "deviations", "import", "pending", "history"];

test("contextual guide covers every authorized catalog workspace region", () => {
  assert.deepEqual(Object.keys(CATALOG_HELP_CONTENT), expectedRegions);
  for (const region of expectedRegions) {
    const guide = getCatalogHelp(region);
    assert.ok(guide.title);
    assert.ok(guide.summary);
    assert.ok(guide.steps.length >= 1, `${region} needs an actionable step`);
    // Trợ giúp gọn: tối đa 3 câu thân (bước + lưu ý), không liệt kê lại tên cột.
    assert.ok(guide.steps.length + (guide.caution ? 1 : 0) <= 3, `${region} help must stay short`);
  }
});

test("source and pending guidance preserves the audited timeline workflow", () => {
  const objects = getCatalogHelp("objects").steps.join(" ");
  assert.match(objects, /lý do/i);
  assert.match(objects, /Chờ áp dụng/);
  const pending = getCatalogHelp("pending").steps.join(" ");
  assert.match(pending, /xem ảnh hưởng/i);
  assert.match(pending, /lý do/i);
  assert.match(pending, /tiến độ/i);
  assert.match(pending, /xác nhận riêng/i);
  assert.match(getCatalogHelp("pending").caution, /toàn bộ/i);
  assert.match(getCatalogHelp("pending").caution, /ngày thực tế giữ nguyên/i);
});

test("import help points to the template instead of re-listing its columns", () => {
  const imported = getCatalogHelp("import").steps.join(" ");
  assert.match(imported, /DU_LIEU/);
  assert.doesNotMatch(imported, /Loại đối tượng, Mã đối tượng/);
  assert.match(getCatalogHelp("import").caution, /chưa ghi/i);
  assert.match(getCatalogHelp("history").caution, /không sửa, không xoá/i);
});

test("help content never carries permission notes", () => {
  for (const region of expectedRegions) {
    const guide = getCatalogHelp(region);
    assert.equal("readerNote" in guide, false);
    assert.equal("editorNote" in guide, false);
  }
});

test("help permissions match each region instead of generic catalog edit", async () => {
  const { canChangeCatalogHelpRegion } = await import("../../src/features/catalogWorkspace/catalogHelpContent.ts");
  const rights = { manager: true, canEdit: false, canManageWorkshopScope: true, canGenerateTimeline: true };
  assert.equal(canChangeCatalogHelpRegion("coverage", rights), true);
  assert.equal(canChangeCatalogHelpRegion("objects", rights), false);
  assert.equal(canChangeCatalogHelpRegion("pending", rights), false);
  assert.equal(canChangeCatalogHelpRegion("revalidation", rights), true);
  assert.equal(canChangeCatalogHelpRegion("changes", rights), false, "Thay đổi theo vai QA, không theo quyền danh mục");
  assert.equal(canChangeCatalogHelpRegion("changes", { ...rights, manager: false, qaEditor: true }), true);
  assert.equal(canChangeCatalogHelpRegion("history", { ...rights, canEdit: true }), false);
  assert.equal(canChangeCatalogHelpRegion("pending", { ...rights, canEdit: true }), true);
  assert.equal(canChangeCatalogHelpRegion("pending", { ...rights, canEdit: true, canGenerateTimeline: false }), false);
  assert.equal(canChangeCatalogHelpRegion("products", { ...rights, manager: false, canEdit: true }), false);
});
