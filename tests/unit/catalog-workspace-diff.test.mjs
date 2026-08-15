/* =====================================================================
 *  catalog-workspace-diff.test.mjs — so bản ghi và dựng patch
 *  ---------------------------------------------------------------------
 *  Trọng tâm là ba cái bẫy khiến form gửi lên những thay đổi KHÔNG có
 *  thật: ô nhập trả chuỗi, ô trống trả "" thay vì null, và trường không
 *  sửa được lọt vào patch.
 * ===================================================================== */
import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCatalogPatch, diffCatalogRecord, chuanHoa, canLyDo, thieuTruongBatBuoc,
} from "../../src/features/catalogWorkspace/diff.ts";

/** `code` là khoá nghiệp vụ nên không sửa được. */
const FIELDS = [
  { key: "code", label: "Mã", kind: "text", readonly: true },
  { key: "days", label: "Số ngày", kind: "number" },
  { key: "note", label: "Ghi chú", kind: "text" },
  { key: "enabled", label: "Đang dùng", kind: "boolean", reasonRequired: true },
];

/* ---- Ba cái bẫy ------------------------------------------------------ */

test("patch chỉ gồm trường ghi được và THẬT SỰ đổi", () => {
  assert.deepEqual(
    buildCatalogPatch(FIELDS,
      { code: "P1", days: 5, note: null, enabled: false },
      { code: "P2", days: "7", note: "", enabled: false }),
    { days: 7 },
  );
});

test("số đi qua ô nhập thành chuỗi KHÔNG phải là thay đổi", () => {
  assert.deepEqual(
    buildCatalogPatch(FIELDS, { days: 5 }, { days: "5" }), {},
    "5 và \"5\" là cùng một giá trị",
  );
});

test("ô trống và null là cùng nghĩa, không phải thay đổi", () => {
  assert.deepEqual(buildCatalogPatch(FIELDS, { note: null }, { note: "" }), {});
  assert.deepEqual(buildCatalogPatch(FIELDS, { note: "" }, { note: null }), {});
  assert.deepEqual(buildCatalogPatch(FIELDS, { note: "  " }, { note: null }), {});
});

test("khoảng trắng thừa hai đầu không tính là sửa", () => {
  assert.deepEqual(buildCatalogPatch(FIELDS, { note: "abc" }, { note: "  abc  " }), {});
});

test("trường readonly không bao giờ lọt vào patch", () => {
  assert.deepEqual(buildCatalogPatch(FIELDS, { code: "A" }, { code: "B" }), {});
});

/* ---- Chuẩn hoá theo kiểu --------------------------------------------- */

test("số: chuỗi thành số, chuỗi rác thành null", () => {
  assert.equal(chuanHoa("number", "7"), 7);
  assert.equal(chuanHoa("number", " 7 "), 7);
  assert.equal(chuanHoa("number", "bảy"), null);
  assert.equal(chuanHoa("number", ""), null);
});

test("boolean nhận cả dạng người Việt hay gõ", () => {
  for (const v of [true, "true", "1", "y", "Có"]) assert.equal(chuanHoa("boolean", v), true, String(v));
  for (const v of [false, "false", "0", "n", "Không"]) assert.equal(chuanHoa("boolean", v), false, String(v));
});

test("ngày chỉ giữ phần ngày, bỏ giờ", () => {
  assert.equal(chuanHoa("date", "2026-08-15T09:30:00Z"), "2026-08-15");
  assert.equal(chuanHoa("date", "2026-08-15"), "2026-08-15");
});

test("giờ khác nhau trong cùng một ngày không tính là sửa", () => {
  const f = [{ key: "d", label: "Ngày", kind: "date" }];
  assert.deepEqual(
    buildCatalogPatch(f, { d: "2026-08-15T00:00:00Z" }, { d: "2026-08-15T23:59:00Z" }), {});
});

/* ---- Bảng đối chiếu --------------------------------------------------- */

test("bảng đối chiếu giữ ĐỦ trường và ĐÚNG thứ tự đã khai", () => {
  const rows = diffCatalogRecord(FIELDS, { days: 5 }, { days: "7" });
  assert.deepEqual(rows.map((r) => r.key), ["code", "days", "note", "enabled"]);
});

test("chỉ trường đổi mới được đánh dấu changed", () => {
  const rows = diffCatalogRecord(FIELDS,
    { code: "P1", days: 5, note: "x", enabled: true },
    { code: "P1", days: "7", note: "x", enabled: true });
  assert.deepEqual(rows.filter((r) => r.changed).map((r) => r.key), ["days"]);
});

test("bảng đối chiếu giữ giá trị GỐC để người duyệt đọc, không phải bản đã chuẩn hoá", () => {
  const rows = diffCatalogRecord(FIELDS, { days: 5 }, { days: "7" });
  const d = rows.find((r) => r.key === "days");
  assert.equal(d.before, 5);
  assert.equal(d.after, "7");
});

test("bản ghi rỗng hoặc null không làm vỡ", () => {
  assert.equal(diffCatalogRecord(FIELDS, null, null).length, 4);
  assert.deepEqual(buildCatalogPatch(FIELDS, null, null), {});
  assert.deepEqual(buildCatalogPatch(FIELDS, undefined, { days: "3" }), { days: 3 });
});

/* ---- Lý do và trường bắt buộc ---------------------------------------- */

test("đổi trường đòi lý do thì phải hỏi lý do", () => {
  assert.equal(canLyDo(FIELDS, { enabled: false }), true);
  assert.equal(canLyDo(FIELDS, { days: 7 }), false);
  assert.equal(canLyDo(FIELDS, {}), false);
});

test("trường bắt buộc để trống bị nêu tên, không im lặng gửi đi", () => {
  const f = [
    { key: "ma", label: "Mã đối tượng", kind: "text", required: true },
    { key: "ten", label: "Tên", kind: "text", required: true },
    { key: "note", label: "Ghi chú", kind: "text" },
  ];
  assert.deepEqual(thieuTruongBatBuoc(f, { ma: "TB-1", ten: "", note: "" }), ["Tên"]);
  assert.deepEqual(thieuTruongBatBuoc(f, { ma: "TB-1", ten: "Máy dập" }), []);
  assert.deepEqual(thieuTruongBatBuoc(f, {}), ["Mã đối tượng", "Tên"]);
});
