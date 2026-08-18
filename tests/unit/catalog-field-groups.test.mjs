import test from "node:test";
import assert from "node:assert/strict";

import { chiaNhomTruong } from "../../src/features/catalogWorkspace/definitions.ts";

const f = (key, extra = {}) => ({ key, label: key, kind: "text", ...extra });

test("trường bắt buộc luôn nằm ở nhóm chính, dù khai ở cuối", () => {
  // Đây là lý do hàm này tồn tại: bản trước cắt bằng slice(0,5) theo vị
  // trí, nên một ô bắt buộc khai thứ 9 nằm trong phần thu gọn — người dùng
  // bấm Lưu, nút mờ câm, và không thấy ô nào để điền.
  const ds = [f("a"), f("b"), f("c"), f("d"), f("e"), f("g"), f("h"), f("bb", { required: true })];
  const { chinh, nangCao } = chiaNhomTruong(ds);
  assert.ok(chinh.some((t) => t.key === "bb"));
  assert.ok(!nangCao.some((t) => t.key === "bb"));
});

test("giữ nguyên thứ tự khai trong từng nhóm", () => {
  const ds = [f("a"), f("b"), f("c"), f("d"), f("e"), f("g"), f("h", { required: true })];
  const { chinh, nangCao } = chiaNhomTruong(ds);
  assert.deepEqual(chinh.map((t) => t.key), ["a", "b", "c", "d", "e", "h"]);
  assert.deepEqual(nangCao.map((t) => t.key), ["g"]);
});

test("không trường nào lặp ở cả hai nhóm", () => {
  const ds = [f("a", { required: true }), f("b"), f("c"), f("d"), f("e"), f("g")];
  const { chinh, nangCao } = chiaNhomTruong(ds);
  const trung = chinh.filter((t) => nangCao.some((x) => x.key === t.key));
  assert.deepEqual(trung, []);
  assert.equal(chinh.length + nangCao.length, ds.length);
});

test("ít trường hơn ngưỡng thì không có nhóm nâng cao", () => {
  const ds = [f("a"), f("b")];
  assert.deepEqual(chiaNhomTruong(ds).nangCao, []);
});
