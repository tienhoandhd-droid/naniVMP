/* =====================================================================
 *  vali-assets.test.mjs — luật chọn ảnh theo mood của Vali (V2, phương án C)
 *  ---------------------------------------------------------------------
 *  Ba mood là API cố định; ảnh thì đến dần (chủ dự án cấp). Mood chưa có
 *  ảnh RIÊNG phải rơi về guide — không bao giờ vỡ ảnh, không bao giờ đổi
 *  API. Khi có ảnh mới chỉ cần thêm tên vào MOOD_CO_ANH.
 * ===================================================================== */
import test from "node:test";
import assert from "node:assert/strict";

import { chonFileVali, MOOD_CO_ANH } from "../../src/components/brand/valiAssets.ts";

test("guide luôn có ảnh riêng — là mỏ neo fallback", () => {
  assert.ok(MOOD_CO_ANH.includes("guide"));
  assert.equal(chonFileVali("guide"), "guide");
});

test("mood chưa có ảnh riêng rơi về guide, có ảnh thì dùng ảnh mình", () => {
  for (const mood of ["concern", "celebrate"]) {
    const kyVong = MOOD_CO_ANH.includes(mood) ? mood : "guide";
    assert.equal(chonFileVali(mood), kyVong);
  }
});

test("giá trị lạ (phòng dữ liệu bẩn) cũng rơi về guide", () => {
  assert.equal(chonFileVali("khong-ton-tai"), "guide");
});
