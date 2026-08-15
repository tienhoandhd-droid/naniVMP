/* =====================================================================
 *  ngan-sach-asset.test.mjs — ngân sách dung lượng asset (nghiên cứu đợt 2)
 *  ---------------------------------------------------------------------
 *  Hiến pháp Atelier đặt ngân sách theo LOẠI asset; unit test này biến nó
 *  thành cửa chặn tự động — thêm một ảnh Vali 300KB là đỏ ngay ở CI,
 *  không đợi ai nhớ ra luật.
 *      · Vali (brand raster): ≤ 80KB / trạng thái
 *      · SVG minh hoạ/motif:  ≤ 40KB / file
 * ===================================================================== */
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const GOC = new URL("../../src/assets", import.meta.url).pathname;

function quetFile(thuMuc) {
  const kq = [];
  for (const ten of readdirSync(thuMuc)) {
    const duong = join(thuMuc, ten);
    if (statSync(duong).isDirectory()) kq.push(...quetFile(duong));
    else kq.push(duong);
  }
  return kq;
}

const NGAN_SACH = [
  { duoi: [".webp", ".png", ".jpg", ".jpeg"], toiDa: 80 * 1024, nhan: "raster brand ≤ 80KB" },
  { duoi: [".svg"], toiDa: 40 * 1024, nhan: "SVG ≤ 40KB" },
];

test("mọi asset trong src/assets nằm trong ngân sách Atelier", () => {
  const loi = [];
  for (const f of quetFile(GOC)) {
    const luat = NGAN_SACH.find((n) => n.duoi.includes(extname(f).toLowerCase()));
    if (!luat) continue;
    const kb = statSync(f).size;
    if (kb > luat.toiDa) loi.push(`${f} = ${(kb / 1024).toFixed(1)}KB vượt ${luat.nhan}`);
  }
  assert.deepEqual(loi, []);
});
