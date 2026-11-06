import assert from "node:assert/strict";
import test from "node:test";
import { summarizeChanges } from "../../src/features/changeValidation/changeSummary.ts";

const phieu = (over = {}) => ({
  recordKind: "thay_doi",
  deadline: "2026-10-30",
  handlingStatus: "cho_xu_ly",
  removedFromSheetAt: null,
  ...over,
});

const TODAY = "2026-11-04";

test("tỉ lệ hoàn thành = đã xong / tổng, tách riêng thay đổi và sai lệch", () => {
  const s = summarizeChanges([
    phieu({ handlingStatus: "da_xong" }),
    phieu({ handlingStatus: "dang_tham_dinh", deadline: "2026-12-30" }),
    phieu({ handlingStatus: "cho_xu_ly" }), // hạn 30/10 đã qua → quá hạn
    phieu({ recordKind: "sai_lech", handlingStatus: "da_xong" }),
  ], 2026, TODAY);
  assert.deepEqual(s.thay_doi, { total: 3, done: 1, open: 2, overdue: 1, noDeadline: 0, rate: 33 });
  assert.deepEqual(s.sai_lech, { total: 1, done: 1, open: 0, overdue: 0, noDeadline: 0, rate: 100 });
});

test("chỉ đếm phiếu có hạn trong năm đang chọn; phiếu chưa có hạn đếm riêng", () => {
  const s = summarizeChanges([
    phieu({ deadline: "2025-12-31" }),
    phieu({ deadline: "2027-01-01" }),
    phieu({ deadline: null }),
    phieu({ deadline: "2026-01-01", handlingStatus: "da_xong" }),
  ], 2026, TODAY);
  assert.equal(s.thay_doi.total, 1);
  assert.equal(s.thay_doi.done, 1);
  assert.equal(s.thay_doi.noDeadline, 1);
});

test("bỏ phiếu 'Không áp dụng' và phiếu đã gỡ khỏi sổ", () => {
  const s = summarizeChanges([
    phieu({ handlingStatus: "khong_ap_dung" }),
    phieu({ removedFromSheetAt: "2026-10-01T00:00:00Z" }),
    phieu({ removedFromSheetAt: "2026-10-01T00:00:00Z", deadline: null }),
    phieu({ handlingStatus: "khong_ap_dung", deadline: null }),
  ], 2026, TODAY);
  assert.deepEqual(s.thay_doi, { total: 0, done: 0, open: 0, overdue: 0, noDeadline: 0, rate: null });
});

test("không có phiếu thì tỉ lệ là null, không phải 0%", () => {
  const s = summarizeChanges([], 2026, TODAY);
  assert.equal(s.thay_doi.rate, null);
  assert.equal(s.sai_lech.rate, null);
});

/* Bước 2 (06/11/2026): phiếu chưa gắn đợt thẩm định được tính như một hạng mục VMP. */
import { countUnlinkedChanges, vmpRateWithChanges } from "../../src/features/changeValidation/changeSummary.ts";

const CA_NAM = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const gan = (linked) => ({ planItems: [{ linked }] });

test("chỉ đếm phiếu CHƯA gắn đợt, cả thay đổi lẫn sai lệch; phiếu đã gắn đợt không đếm trùng", () => {
  const c = countUnlinkedChanges([
    phieu({ handlingStatus: "da_xong", planItems: [] }),
    phieu({ recordKind: "sai_lech", deadline: "2026-12-30", planItems: [] }),
    phieu({ ...gan(false) }), // có đợt gợi ý nhưng chưa gắn → vẫn đếm; hạn 30/10 → quá hạn
    phieu({ handlingStatus: "da_xong", ...gan(true) }), // đã gắn đợt → bỏ
  ], 2026, CA_NAM, TODAY);
  assert.deepEqual(c, { total: 3, done: 1, overdue: 1 });
});

test("lọc theo kỳ: chỉ tháng thuộc kỳ của đúng năm; bỏ Không áp dụng, gỡ khỏi sổ, chưa có hạn", () => {
  const rows = [
    phieu({ deadline: "2026-07-15", planItems: [] }),
    phieu({ deadline: "2026-09-30", handlingStatus: "da_xong", planItems: [] }),
    phieu({ deadline: "2026-10-01", planItems: [] }),
    phieu({ deadline: "2025-08-01", planItems: [] }),
    phieu({ deadline: null, planItems: [] }),
    phieu({ deadline: "2026-08-01", handlingStatus: "khong_ap_dung", planItems: [] }),
    phieu({ deadline: "2026-08-01", removedFromSheetAt: "2026-10-01T00:00:00Z", planItems: [] }),
  ];
  assert.deepEqual(countUnlinkedChanges(rows, 2026, [7, 8, 9], TODAY), { total: 2, done: 1, overdue: 1 });
  assert.deepEqual(countUnlinkedChanges(rows, 2026, CA_NAM, TODAY), { total: 3, done: 1, overdue: 2 });
});

test("tỉ lệ gộp = (VMP xong + phiếu xong) ÷ (VMP tổng + phiếu tổng)", () => {
  assert.deepEqual(
    vmpRateWithChanges({ done: 40, over: 10, total: 100 }, { total: 20, done: 14, overdue: 3 }),
    { done: 54, over: 13, todo: 53, total: 120, rate: 45 },
  );
  // Không có phiếu → giữ nguyên số VMP.
  assert.deepEqual(
    vmpRateWithChanges({ done: 1, over: 0, total: 3 }, { total: 0, done: 0, overdue: 0 }),
    { done: 1, over: 0, todo: 2, total: 3, rate: 33 },
  );
  // Cả hai đều rỗng → 0%, giống tally().
  assert.equal(vmpRateWithChanges({ done: 0, over: 0, total: 0 }, { total: 0, done: 0, overdue: 0 }).rate, 0);
});
