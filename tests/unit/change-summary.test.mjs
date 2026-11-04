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
