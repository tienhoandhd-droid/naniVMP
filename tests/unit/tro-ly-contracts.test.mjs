import assert from "node:assert/strict";
import test from "node:test";
import { decodeHieu, decodeTraLoi, TroLyTuChoiError } from "../../src/features/assistant/contracts.ts";
import { doanNhanh } from "../../src/features/assistant/doanNhanh.ts";
import { HUONG_DAN_WEB, timHuongDan } from "../../src/features/assistant/huongDan.ts";

const traLoiMau = (over = {}) => ({
  ok: true,
  cong_cu: "qua_han",
  tham_so: { bo_phan: "xsx" },
  hieu_la: "Quá hạn · Xưởng sản xuất",
  tra_loi: "Có 2 hạng mục quá hạn đích VMP (Xưởng sản xuất).",
  bang: {
    cot: [{ key: "ma", nhan: "Mã thẩm định" }, { key: "han", nhan: "Hạn đích VMP" }],
    dong: [{ ma: "A/2026.01-OQ", han: "01/10/2026" }, { ma: "B/2026.01-PQ", han: null }],
    tong_dong: 2,
  },
  goi_y: [{ nhan: "Chia theo bộ phận", cong_cu: "tien_do", tham_so: { theo: "bo_phan" } }],
  nguon: "Kế hoạch VMP năm 2026",
  luc: "2026-10-22T08:00:00Z",
  ...over,
});

test("decodeTraLoi: đọc đủ câu trả lời, bảng, gợi ý; ô null hiện '—'", () => {
  const kq = decodeTraLoi(traLoiMau());
  assert.equal(kq.congCu, "qua_han");
  assert.deepEqual(kq.thamSo, { bo_phan: "xsx" });
  assert.equal(kq.bang?.tongDong, 2);
  assert.equal(kq.bang?.dong[1].han, "—");
  assert.equal(kq.goiY[0].congCu, "tien_do");
  assert.deepEqual(kq.hoiLai, []);
});

test("decodeTraLoi: server từ chối → TroLyTuChoiError mang lý do tiếng Việt", () => {
  assert.throws(() => decodeTraLoi({ ok: false, loi: "Số ngày phải từ 1 đến 180." }),
    (e) => e instanceof TroLyTuChoiError && e.message === "Số ngày phải từ 1 đến 180.");
  assert.throws(() => decodeTraLoi({ ok: false, error: "Tài khoản không hoạt động" }),
    (e) => e instanceof TroLyTuChoiError && e.message === "Tài khoản không hoạt động");
});

test("decodeTraLoi: sai dạng thì ném lỗi thường, không đoán", () => {
  assert.throws(() => decodeTraLoi(traLoiMau({ cong_cu: "xoa_het" })), (e) => !(e instanceof TroLyTuChoiError));
  assert.throws(() => decodeTraLoi(traLoiMau({ bang: { cot: "x", dong: [] } })));
  assert.throws(() => decodeTraLoi(traLoiMau({ tham_so: { a: { b: 1 } } })));
  assert.throws(() => decodeTraLoi(null));
});

test("decodeHieu: công cụ trong danh sách mới nhận, kiến thức rỗng thành null", () => {
  const h = decodeHieu({ ok: true, cong_cu: "kien_thuc", tham_so: {}, tra_loi_kien_thuc: "  IQ là… ", mo_hinh: "gemini-3.5-flash" });
  assert.equal(h.kienThuc, "IQ là…");
  assert.equal(decodeHieu({ ok: true, cong_cu: "tong_quan", tra_loi_kien_thuc: " " }).kienThuc, null);
  assert.throws(() => decodeHieu({ ok: true, cong_cu: "chay_sql" }));
  assert.throws(() => decodeHieu({ ok: false, loi: "AI_BAN" }), TroLyTuChoiError);
});

test("doanNhanh: bắt các câu phổ biến khi AI không phản hồi", () => {
  assert.deepEqual(doanNhanh("bao nhiêu hạng mục quá hạn"), { congCu: "qua_han", thamSo: {} });
  assert.deepEqual(doanNhanh("xưởng sản xuất có gì trễ hạn"), { congCu: "qua_han", thamSo: { bo_phan: "xsx" } });
  assert.deepEqual(doanNhanh("sắp đến hạn trong 14 ngày"), { congCu: "sap_den_han", thamSo: { so_ngay: 14 } });
  assert.deepEqual(doanNhanh("tuần này có gì đến hạn"), { congCu: "sap_den_han", thamSo: { so_ngay: 7 } });
  assert.deepEqual(doanNhanh("KNTB133 thế nào"), { congCu: "thiet_bi", thamSo: { tu_khoa: "KNTB133" } });
  assert.deepEqual(doanNhanh("các CC quá hạn"), { congCu: "thay_doi", thamSo: { loc: "qua_han" } });
  assert.deepEqual(doanNhanh("việc của tôi"), { congCu: "viec_cua_toi", thamSo: {} });
  assert.deepEqual(doanNhanh("tỷ lệ hoàn thành"), { congCu: "tong_quan", thamSo: {} });
  assert.equal(doanNhanh("chào bạn")?.congCu, "chao_hoi");
});

test("doanNhanh: câu mơ hồ trả null (mời bấm gợi ý thay vì đoán bừa)", () => {
  assert.equal(doanNhanh("CSA của FDA khác gì CSV"), null);
  assert.equal(doanNhanh("viết bài thơ"), null);
  assert.equal(doanNhanh(""), null);
  // "OQ12" không phải mã thiết bị
  assert.notEqual(doanNhanh("OQ12 là gì")?.congCu, "thiet_bi");
});

test("huongDan: đủ 8 chủ đề AI có thể chọn, id duy nhất, mỗi chủ đề có bước và vai", () => {
  const ids = HUONG_DAN_WEB.map((c) => c.id);
  assert.deepEqual([...ids].sort(), ["canh_bao", "cap_nhat_tien_do", "phan_quyen", "tham_dinh_thuc_te",
    "thay_doi", "tim_thiet_bi", "xem_viec_cua_toi", "xuat_bao_cao"]);
  for (const c of HUONG_DAN_WEB) {
    assert.ok(c.buoc.length >= 2 && c.vai.length > 10, c.id);
  }
  assert.equal(timHuongDan("khong_co"), null);
});
