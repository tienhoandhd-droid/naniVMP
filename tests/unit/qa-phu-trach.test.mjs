import test from "node:test";
import assert from "node:assert/strict";
import { docDanhSachQaPhuTrach } from "../../src/features/qaPhuTrach/api.ts";

test("đọc đúng danh sách QA phụ trách", () => {
  const rows = docDanhSachQaPhuTrach({
    ok: true,
    rows: [
      { performer_id: "a", performer_name: "Một", trong_danh_sach: true, vai: "qa_staff", ly_do_chua_them_duoc: null },
      { performer_id: "b", performer_name: "Hai", trong_danh_sach: false, vai: null, ly_do_chua_them_duoc: "Chưa có tài khoản" },
    ],
  });
  assert.deepEqual(rows.map((r) => [r.performerName, r.trongDanhSach, r.lyDoChuaThemDuoc]),
    [["Một", true, null], ["Hai", false, "Chưa có tài khoản"]]);
});

test("server từ chối hoặc sai dạng thì báo lỗi, không trả bảng rỗng", () => {
  assert.throws(() => docDanhSachQaPhuTrach({ ok: false, error: "Chỉ Admin được xem" }), /Chỉ Admin/);
  assert.throws(() => docDanhSachQaPhuTrach(null), /không trả dữ liệu/);
  assert.throws(() => docDanhSachQaPhuTrach({ ok: true, rows: [{ performer_id: 1 }] }), /Dòng 1 sai định dạng/);
});
