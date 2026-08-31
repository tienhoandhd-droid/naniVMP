import assert from "node:assert/strict";
import { test } from "node:test";
import { taoBoGomLoi } from "../../src/lib/baoLoi.ts";

test("cùng thông điệp trong cùng cửa sổ chỉ gửi một lần", () => {
  const g = taoBoGomLoi({ mailToiDa: 10, cuaSoMs: 60_000 });
  assert.equal(g.nhan("TypeError: x is undefined", 0), true);
  assert.equal(g.nhan("TypeError: x is undefined", 30_000), false);
  assert.equal(g.nhan("TypeError: x is undefined", 61_000), true); // hết cửa sổ
});

test("thông điệp khác nhau không chặn nhau", () => {
  const g = taoBoGomLoi();
  assert.equal(g.nhan("loi A", 0), true);
  assert.equal(g.nhan("loi B", 0), true);
});

test("trần mỗi phiên: quá mailToiDa là im lặng tuyệt đối", () => {
  const g = taoBoGomLoi({ mailToiDa: 3, cuaSoMs: 1 });
  for (let i = 0; i < 3; i += 1) assert.equal(g.nhan(`loi ${i}`, i * 10), true);
  assert.equal(g.nhan("loi moi tinh", 999_999), false);
});

test("khoá dedupe cắt ở 200 ký tự — stack dài không làm Map phình", () => {
  const g = taoBoGomLoi();
  const dai = "x".repeat(500);
  assert.equal(g.nhan(dai, 0), true);
  assert.equal(g.nhan(dai + "-duoi-khac", 0), false); // 200 ký tự đầu trùng
});
