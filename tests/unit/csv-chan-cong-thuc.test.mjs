import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { chanCongThucCsv } from "../../src/lib/csvAnToan.ts";

/* Ô CSV bắt đầu bằng = + - @ tab CR thì Excel hiểu là công thức (CSV
   injection). Thêm dấu ' phía trước để Excel hiện nguyên chữ. */

test("ô chữ bắt đầu bằng ký tự công thức được thêm tiền tố '", () => {
  for (const s of ["=HYPERLINK(\"http://x\")", "+1+1", "-2+3", "@SUM(A1)", "\t=1", "\r=1"]) {
    assert.equal(chanCongThucCsv(s), `'${s}`, JSON.stringify(s));
  }
});

test("chữ thường, rỗng, null giữ nguyên", () => {
  assert.equal(chanCongThucCsv("TĐ-001 Máy dập viên"), "TĐ-001 Máy dập viên");
  assert.equal(chanCongThucCsv("a=b"), "a=b");
  assert.equal(chanCongThucCsv(""), "");
  assert.equal(chanCongThucCsv(null), "");
  assert.equal(chanCongThucCsv(undefined), "");
});

test("số thật (kể cả âm) giữ nguyên là số, không biến thành chữ", () => {
  assert.equal(chanCongThucCsv(-5), "-5");
  assert.equal(chanCongThucCsv(12), "12");
});

test("mọi chỗ xuất CSV đều đi qua chanCongThucCsv", () => {
  for (const f of [
    "src/pages/AlertsPage.tsx",
    "src/components/dashboard/ChiTietKyModal.tsx",
    "src/components/catalog/KhongThamDinhCard.tsx",
  ]) {
    const src = readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");
    assert.match(src, /import \{ chanCongThucCsv \} from "[./]+lib\/csvAnToan\.ts";/, f);
    assert.match(src, /chanCongThucCsv\(v\)/, f);
    assert.doesNotMatch(src, /String\(v \?\? ""\)\.replace|const s = String\(v \?\? ""\);/,
      `${f} còn tự chuyển ô sang chữ mà không chặn công thức`);
  }
});
