import assert from "node:assert/strict";
import test from "node:test";
import { CATALOG_HELP_CONTENT, getCatalogHelp } from "../../src/features/catalogWorkspace/catalogHelpContent.ts";

const expectedRegions = ["objects", "coverage", "products", "alerts", "revalidation", "import", "pending", "history"];

test("contextual guide covers every authorized catalog workspace region", () => {
  assert.deepEqual(Object.keys(CATALOG_HELP_CONTENT), expectedRegions);
  for (const region of expectedRegions) {
    const guide = getCatalogHelp(region);
    assert.ok(guide.title);
    assert.ok(guide.summary);
    assert.ok(guide.steps.length >= 2, `${region} needs actionable steps`);
  }
});

test("source and pending guidance preserves the audited timeline workflow", () => {
  const objects = getCatalogHelp("objects").fields.join(" ");
  assert.match(objects, /Có thẩm định/);
  assert.match(objects, /Tần suất \(tháng\)/);
  assert.match(objects, /Người phụ trách/);
  assert.match(objects, /lý do/i);
  const pending = getCatalogHelp("pending").steps.join(" ");
  assert.match(pending, /đã lưu ở Dữ liệu nguồn/i);
  assert.match(pending, /xem ảnh hưởng/i);
  assert.match(pending, /lý do/i);
  assert.match(pending, /không đổi mốc thời gian/i);
  assert.match(pending, /tiến độ/i);
  assert.match(pending, /xác nhận đặc biệt/i);
  assert.match(getCatalogHelp("pending").caution, /toàn bộ/i);
});

test("dataset and workbook guidance describes validation contracts instead of label-only chips", () => {
  assert.match(getCatalogHelp("products").fields.join(" "), /Bắt buộc.*Mã BFO.*Tên sản phẩm/i);
  assert.match(getCatalogHelp("alerts").fields.join(" "), /tên@miền\.tld/i);
  assert.match(getCatalogHelp("alerts").fields.join(" "), /Ngưỡng.*số/i);
  const imported = getCatalogHelp("import").steps.join(" ");
  assert.match(imported, /DU_LIEU/);
  assert.match(imported, /Loại đối tượng/);
  assert.match(imported, /Mã BFO/);
  assert.match(imported, /không đổi tên.*không di chuyển/i);
  assert.match(imported, /Ô trống.*không có giá trị/i);
  assert.doesNotMatch(getCatalogHelp("history").steps.join(" "), /tìm kiếm/i);
});

test("read-only help remains explanatory and never promises edit access", () => {
  const guide = getCatalogHelp("import");
  assert.match(guide.readerNote, /chỉ đọc/i);
  assert.doesNotMatch(guide.readerNote, /bạn có thể lưu/i);
});

test("help permissions match each region instead of generic catalog edit", async () => {
  const { canChangeCatalogHelpRegion } = await import("../../src/features/catalogWorkspace/catalogHelpContent.ts");
  const rights = { manager: true, canEdit: false, canManageWorkshopScope: true, canGenerateTimeline: true };
  assert.equal(canChangeCatalogHelpRegion("coverage", rights), true);
  assert.equal(canChangeCatalogHelpRegion("objects", rights), false);
  assert.equal(canChangeCatalogHelpRegion("pending", rights), false);
  assert.equal(canChangeCatalogHelpRegion("revalidation", rights), true);
  assert.equal(canChangeCatalogHelpRegion("history", { ...rights, canEdit: true }), false);
  assert.equal(canChangeCatalogHelpRegion("pending", { ...rights, canEdit: true }), true);
  assert.equal(canChangeCatalogHelpRegion("pending", { ...rights, canEdit: true, canGenerateTimeline: false }), false);
  assert.equal(canChangeCatalogHelpRegion("products", { ...rights, manager: false, canEdit: true }), false);
});
