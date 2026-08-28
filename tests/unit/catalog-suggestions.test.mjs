/* =====================================================================
 *  catalog-suggestions.test.mjs — gom giá trị đã có thành gợi ý nhập
 *  ---------------------------------------------------------------------
 *  Trọng tâm: gợi ý phải bỏ rỗng, dẹp khoảng trắng thừa, nhưng KHÔNG được
 *  tự gộp hoa/thường — trong hồ sơ GMP đó có thể là hai mã thật khác nhau.
 * ===================================================================== */
import test from "node:test";
import assert from "node:assert/strict";

import {
  collectCatalogSuggestionPages,
  decodeCatalogSuggestionPage,
  gomGoiY,
} from "../../src/features/catalogWorkspace/suggestions.ts";

test("gom giá trị distinct, bỏ rỗng, sắp theo bảng chữ cái", () => {
  const rows = [
    { line: "Line 1", area_code: "KV-A" },
    { line: "Line 2", area_code: "" },
    { line: "Line 1", area_code: null },
  ];
  assert.deepEqual(gomGoiY(rows, ["line", "area_code"]),
    { line: ["Line 1", "Line 2"], area_code: ["KV-A"] });
});

test("cắt khoảng trắng thừa và gộp giá trị chỉ khác nhau ở khoảng trắng", () => {
  // Đúng thứ combobox sinh ra để dẹp: 'Line 1' và 'Line 1 ' là một.
  const rows = [{ line: " Line 1" }, { line: "Line 1 " }];
  assert.deepEqual(gomGoiY(rows, ["line"]), { line: ["Line 1"] });
});

test("KHÔNG gộp giá trị khác nhau ở chữ hoa thường", () => {
  // Hồ sơ GMP: 'KV-A' và 'kv-a' có thể là hai mã khác nhau thật. Gợi ý
  // hiện cả hai để người dùng nhìn thấy sự lệch mà tự quyết, chứ máy không
  // được tự chọn hộ một cái rồi bỏ cái kia.
  const rows = [{ area_code: "KV-A" }, { area_code: "kv-a" }];
  assert.deepEqual(gomGoiY(rows, ["area_code"]), { area_code: ["KV-A", "kv-a"] });
});

test("số cũng thành gợi ý dạng chuỗi", () => {
  assert.deepEqual(gomGoiY([{ batch_size: 1000 }], ["batch_size"]), { batch_size: ["1000"] });
});

test("không có dòng nào thì mỗi khoá là mảng rỗng", () => {
  assert.deepEqual(gomGoiY([], ["line"]), { line: [] });
});

test("gợi ý Source giải mã đúng page server và chặn wire shape lạ", () => {
  assert.deepEqual(decodeCatalogSuggestionPage({
    ok: true,
    rows: [{ value: "Line 1", count: 2 }],
    next_cursor: { value: "Line 1" },
  }), {
    ok: true,
    rows: [{ value: "Line 1", count: 2 }],
    nextCursor: { value: "Line 1" },
  });
  assert.throws(() => decodeCatalogSuggestionPage({
    ok: true, rows: [{ value: "Line 1", count: -1 }], next_cursor: null,
  }), /count/i);
  assert.deepEqual(decodeCatalogSuggestionPage({
    ok: false, error_code: "FORBIDDEN", error: "Không có quyền",
  }), { ok: false, errorCode: "FORBIDDEN", error: "Không có quyền" });
});

test("collector gợi ý đi hết cursor, không lặp và không nuốt lỗi server", async () => {
  const values = await collectCatalogSuggestionPages(async (cursor) => cursor === null
    ? { ok: true, rows: [{ value: "A", count: 2 }], nextCursor: { value: "A" } }
    : { ok: true, rows: [{ value: "B", count: 1 }], nextCursor: null });
  assert.deepEqual(values, ["A", "B"]);

  await assert.rejects(() => collectCatalogSuggestionPages(async () => ({
    ok: false, errorCode: "FORBIDDEN", error: "Không có quyền",
  })), /FORBIDDEN/);
  await assert.rejects(() => collectCatalogSuggestionPages(async () => ({
    ok: true, rows: [{ value: "A", count: 1 }], nextCursor: { value: "A" },
  })), /cursor/i);
});
