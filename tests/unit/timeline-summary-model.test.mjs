/* =====================================================================
 *  timeline-summary-model.test.mjs — dải tình trạng của Timeline (đợt 1
 *  áp nghiên cứu 2026-08-16-deep-research-timeline-3d.md)
 *  ---------------------------------------------------------------------
 *  Bốn dải PHÂN HOẠCH nhau (mỗi hạng mục active thuộc đúng một dải):
 *    quá hạn → sắp đến hạn (≤ SOON_DAYS) → đang thực hiện → còn lại
 *  cộng "hoàn thành" đứng riêng. Đây là nguồn số DUY NHẤT cho strip KPI
 *  và phải khớp từng con số với bộ lọc tình trạng của trang — bấm ô nào
 *  danh sách phải ra đúng bấy nhiêu dòng.
 * ===================================================================== */
import test from "node:test";
import assert from "node:assert/strict";

import {
  issueLevel, laSapDenHan, buildTimelineSummary,
} from "../../src/features/timeline/timelineSummaryModel.ts";

const NOW = new Date("2026-08-16T00:00:00+07:00");
const ngay = (lech) => {
  const d = new Date(NOW);
  d.setDate(d.getDate() + lech);
  return d.toISOString().slice(0, 10);
};

/* Mốc pha suy từ target (helpers.milestones): protocol = T−60,
 * validation = T−5−dep, report = T−5 — fixture phải tôn trọng luật đó. */
const FIXTURE = [
  // Quá hạn theo trạng thái tổng.
  { id: "T-OVER", st: "over", state: "active", target: ngay(-5), _raw: {} },
  // Quá hạn theo MỐC PHA: prog nhưng mốc thẩm định (T−7) đã trôi qua.
  { id: "T-PHASE-OVER", st: "prog", state: "active", target: ngay(3), _raw: {} },
  // Sắp đến hạn: prog, đích còn 20 ngày (≤ SOON_DAYS), mốc thẩm định chưa qua.
  { id: "T-SOON", st: "prog", state: "active", target: ngay(20), _raw: {} },
  // Đang thực hiện, hạn còn xa.
  { id: "T-PROG", st: "prog", state: "active", target: ngay(90), _raw: {} },
  // Kế hoạch xa — dải "còn lại", không có ô riêng.
  { id: "T-FAR", st: "todo", state: "active", target: ngay(120), _raw: {} },
  // Hoàn thành.
  { id: "T-DONE", st: "done", state: "active", target: ngay(-30), _raw: {} },
  // Đóng băng — đứng ngoài mọi con số.
  { id: "T-FROZEN", st: "over", state: "khong_ap_dung", target: ngay(-9), _raw: {} },
];

test("bốn dải + hoàn thành phân hoạch đúng fixture", () => {
  const kq = buildTimelineSummary(FIXTURE, NOW);
  assert.deepEqual(kq, {
    tong: 6,
    quaHan: 2,
    sapDenHan: 1,
    dangThucHien: 1,
    hoanThanh: 1,
    conLai: 1,
  });
});

test("issueLevel giữ nguyên luật cũ của trang (over theo pha thắng prog)", () => {
  assert.equal(issueLevel(FIXTURE[0]), "over");
  assert.equal(issueLevel(FIXTURE[1]), "over");
  assert.equal(issueLevel(FIXTURE[3]), "prog");
  assert.equal(issueLevel(FIXTURE[5]), "done");
});

test("sắp đến hạn: trong SOON_DAYS, không tính hạng mục đã quá hạn hay đã xong", () => {
  assert.equal(laSapDenHan(FIXTURE[2], NOW), true);
  assert.equal(laSapDenHan(FIXTURE[0], NOW), false);  // đã quá hạn
  assert.equal(laSapDenHan(FIXTURE[5], NOW), false);  // đã xong
  assert.equal(laSapDenHan(FIXTURE[4], NOW), false);  // còn xa
});

test("đích còn 8 ngày và mốc thẩm định chưa qua → sắp đến hạn, không phải quá hạn", () => {
  const sap = { id: "T-8D", st: "prog", state: "active", target: ngay(8), _raw: {} };
  assert.equal(laSapDenHan(sap, NOW), true);
  assert.equal(issueLevel(sap), "prog");
});
