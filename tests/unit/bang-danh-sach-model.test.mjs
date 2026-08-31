import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildBangDanhSach,
  NHAN_TINH_TRANG,
} from "../../src/features/monitoring/bangDanhSachModel.ts";

/* Mốc "bây giờ" cố định: 2026-08-31 05:00 UTC = 12:00 trưa Bangkok. */
const NOW = new Date("2026-08-31T05:00:00Z");
const SOON = 7;

const act = (over) => ({
  id: "x", code: "PQ-000", obj: "OBJ", type: "PQ", st: "todo", ...over,
});

const MAU = [
  act({ id: "1", code: "PQ-001", name: "Nồi hấp A", dlVmp: "2026-08-20" }),        // quá hạn
  act({ id: "2", code: "PQ-002", name: "Tủ sấy B", dlVmp: "2026-08-31" }),         // hôm nay
  act({ id: "3", code: "PQ-003", name: "Kho C", dlVmp: "2026-09-03" }),            // sắp (≤7 ngày)
  act({ id: "4", code: "PQ-004", name: "Line D", dlVmp: "2026-12-01" }),           // còn xa
  act({ id: "5", code: "PQ-005", name: "HVAC E", dlVmp: "2026-08-01", st: "done" }), // đã xong
  act({ id: "6", code: "PQ-006", name: "Máy F" }),                                  // chưa có hạn
];

test("đếm theo tình trạng đúng và đủ 6 nhóm", () => {
  const { counts, total } = buildBangDanhSach(MAU, NOW, SOON);
  assert.equal(total, 6);
  assert.deepEqual(counts, {
    overdue: 1, today: 1, soon: 1, future: 1, done: 1, missing: 1,
  });
});

test("sắp xếp: quá hạn trước, rồi hôm nay/sắp/xa, thiếu hạn và đã xong cuối", () => {
  const { rows } = buildBangDanhSach(MAU, NOW, SOON);
  assert.deepEqual(rows.map((r) => r.code),
    ["PQ-001", "PQ-002", "PQ-003", "PQ-004", "PQ-006", "PQ-005"]);
});

test("KHÔNG cắt danh sách — đủ mọi hạng mục kể cả khi rất đông", () => {
  const dong = Array.from({ length: 450 }, (_, i) =>
    act({ id: String(i), code: `PQ-${i}`, dlVmp: "2026-09-10" }));
  const { rows } = buildBangDanhSach(dong, NOW, SOON);
  assert.equal(rows.length, 450); // LongMonRaceGuard cũ slice(0,200) — bảng thì không
});

test("lọc theo tình trạng giữ nguyên counts tổng thể", () => {
  const ds = buildBangDanhSach(MAU, NOW, SOON, "overdue");
  assert.deepEqual(ds.rows.map((r) => r.code), ["PQ-001"]);
  assert.equal(ds.counts.soon, 1); // counts đếm TRƯỚC lọc để nút lọc hiện số
});

test("daysRemaining âm cho quá hạn, 0 cho hôm nay", () => {
  const { rows } = buildBangDanhSach(MAU, NOW, SOON);
  assert.equal(rows.find((r) => r.code === "PQ-001").daysRemaining, -11);
  assert.equal(rows.find((r) => r.code === "PQ-002").daysRemaining, 0);
});

test("nhãn tiếng Việt đủ cho mọi tình trạng", () => {
  for (const k of ["overdue", "today", "soon", "future", "missing", "done"]) {
    assert.ok(NHAN_TINH_TRANG[k], k);
  }
});
