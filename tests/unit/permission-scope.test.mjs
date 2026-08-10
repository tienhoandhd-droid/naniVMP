import assert from "node:assert/strict";
import test from "node:test";

const catalog = {
  departments: [
    { id: "qa", code: "QA", label: "Đảm bảo chất lượng" },
    { id: "xsx", code: "XSX", label: "Xưởng sản xuất" },
  ],
  factories: [
    { id: "f-qa", code: "FQA", label: "Xưởng QA", parentId: "qa" },
    { id: "f-xsx", code: "FXSX", label: "Xưởng sản xuất", parentId: "xsx" },
  ],
  areas: [
    { id: "a-qa", code: "S1", label: "Khu vực S1", parentId: "f-qa" },
    { id: "a-xsx", code: "C1", label: "Khu vực C1", parentId: "f-xsx" },
  ],
  lines: [
    { id: "l-qa", code: "LQA", label: "Line QA", parentId: "a-qa" },
    { id: "l-xsx", code: "BFS", label: "BFS", parentId: "a-xsx" },
  ],
};

test("lọc hợp nhất lựa chọn từ nhiều bộ phận", async () => {
  const { filterScopeCatalog } = await import("../../src/features/itemPermissions/scopeHierarchy.ts");

  const filtered = filterScopeCatalog(catalog, {
    departments: ["qa", "xsx"],
    factories: ["f-qa", "f-xsx"],
    areas: ["a-qa", "a-xsx"],
    lines: [],
  });

  assert.deepEqual(filtered.factories.map((item) => item.id), ["f-qa", "f-xsx"]);
  assert.deepEqual(filtered.areas.map((item) => item.id), ["a-qa", "a-xsx"]);
  assert.deepEqual(filtered.lines.map((item) => item.id), ["l-qa", "l-xsx"]);
});

test("bỏ lựa chọn cha loại đúng các lựa chọn con mất liên kết", async () => {
  const { pruneInvalidScope } = await import("../../src/features/itemPermissions/scopeHierarchy.ts");

  const pruned = pruneInvalidScope(catalog, {
    departments: ["qa", "xsx"],
    factories: ["f-xsx"],
    areas: ["a-qa", "a-xsx"],
    lines: ["l-qa", "l-xsx"],
  });

  assert.deepEqual(pruned, {
    departments: ["qa", "xsx"],
    factories: ["f-xsx"],
    areas: ["a-xsx"],
    lines: ["l-xsx"],
  });
});

test("đổi mã danh mục thành ID ổn định không phân biệt hoa thường", async () => {
  const { resolveScopeCodes } = await import("../../src/features/itemPermissions/scopeHierarchy.ts");

  const result = resolveScopeCodes(catalog, {
    departments: ["xsx"], factories: ["fxsx"], areas: ["c1"], lines: ["bfs"],
  });

  assert.deepEqual(result, {
    ok: true,
    selection: {
      departments: ["xsx"], factories: ["f-xsx"], areas: ["a-xsx"], lines: ["l-xsx"],
    },
  });
});

test("từ chối mã phạm vi không tồn tại", async () => {
  const { resolveScopeCodes } = await import("../../src/features/itemPermissions/scopeHierarchy.ts");

  assert.deepEqual(resolveScopeCodes(catalog, {
    departments: ["xsx"], factories: ["không-có"], areas: ["c1"], lines: ["bfs"],
  }), { ok: false, error: "Mã phạm vi không tồn tại" });
});

test("từ chối đường liên kết cha con không hợp lệ", async () => {
  const { resolveScopeCodes } = await import("../../src/features/itemPermissions/scopeHierarchy.ts");

  assert.deepEqual(resolveScopeCodes(catalog, {
    departments: ["qa"], factories: ["fxsx"], areas: ["c1"], lines: ["bfs"],
  }), { ok: false, error: "Quan hệ phạm vi không hợp lệ" });
});
