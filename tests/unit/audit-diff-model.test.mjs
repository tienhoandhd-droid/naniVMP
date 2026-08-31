import assert from "node:assert/strict";
import { test } from "node:test";
import { dungBangDiff } from "../../src/features/audit/auditDiffModel.ts";

test("đi theo changed_fields khi có — kể cả trường hai vế in giống nhau", () => {
  const rows = dungBangDiff(
    { status_vmp: "in_progress", note: "a", version: 3 },
    { status_vmp: "completed", note: "a", version: 4 },
    ["status_vmp", "version", "note"],
  );
  assert.deepEqual(rows.map((r) => r.field), ["note", "status_vmp", "version"]);
  const st = rows.find((r) => r.field === "status_vmp");
  assert.equal(st.cu, "in_progress");
  assert.equal(st.moi, "completed");
});

test("không có changed_fields → tự so key hai phía, chỉ giữ khác nhau", () => {
  const rows = dungBangDiff(
    { a: 1, b: "x", c: "bi-xoa" },
    { a: 1, b: "y", d: "moi" },
    null,
  );
  assert.deepEqual(rows.map((r) => r.field), ["b", "c", "d"]);
  assert.equal(rows.find((r) => r.field === "c").moi, null); // giá trị bị xoá
  assert.equal(rows.find((r) => r.field === "d").cu, null);
});

test("giá trị object in JSON gọn; old/new không phải object không nổ", () => {
  const rows = dungBangDiff(null, { scope: { areas: ["A"] } }, ["scope"]);
  assert.equal(rows[0].cu, null);
  assert.equal(rows[0].moi, '{"areas":["A"]}');
});
