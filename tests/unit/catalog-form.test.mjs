import test from "node:test";
import assert from "node:assert/strict";

import {
  validateCatalogForm,
  buildCatalogPatch,
  truongDangHien,
  coThamDinh,
  canLyDo,
  TRUONG_FORM,
  BO_PHAN_CHUAN,
  MA_BO_PHAN_KHAC,
  truongThieuDauTien,
} from "../../src/lib/catalogForm.ts";

const hopLe = {
  object_code: "TB-001",
  object_name: "Máy dập viên",
  department: "xsx",
  validate_flag: "y",
  first_month: "3",
  frequency_months: "12",
  report_class: "Hóa lý",
};

test("form hợp lệ thì không có lỗi nào", () => {
  assert.deepEqual(validateCatalogForm(hopLe), {});
});

test("trường bắt buộc để trống thì báo đúng chỗ", () => {
  assert.equal(
    validateCatalogForm({ ...hopLe, object_code: "" }).object_code,
    "Phải nhập mã đối tượng",
  );
  assert.equal(
    validateCatalogForm({ ...hopLe, first_month: "" }).first_month,
    "Phải chọn tháng thẩm định đầu tiên",
  );
});

test("không thẩm định thì không đòi tháng thẩm định", () => {
  // Bắt điền tháng cho đối tượng vừa khai là không thẩm định là vô nghĩa.
  const khongTD = { object_code: "TB-002", object_name: "Bàn thao tác", department: "xsx", validate_flag: "n" };
  assert.equal(coThamDinh(khongTD), false);
  assert.deepEqual(validateCatalogForm(khongTD), {});
  assert.equal(truongDangHien(khongTD).some((t) => t.nhom === "ke_hoach"), false);
  assert.equal(truongDangHien(hopLe).some((t) => t.nhom === "ke_hoach"), true);
});

test("giá trị ngoài danh sách và chữ ở ô số đều bị chặn", () => {
  assert.match(validateCatalogForm({ ...hopLe, frequency_months: "ba" }).frequency_months, /phải là số/i);
  assert.match(validateCatalogForm({ ...hopLe, report_class: "Tự nghĩ" }).report_class, /trong danh sách/i);
  assert.match(validateCatalogForm({ ...hopLe, first_month: "13" }).first_month, /từ 1 đến 12/i);
});

test("tên người gõ tay mà không có ID thì bị từ chối", () => {
  // Tên trùng nhau là chuyện thường; gán theo tên là gán nhầm người.
  const loi = validateCatalogForm({ ...hopLe, owner_name: "Nguyễn Văn A" });
  assert.match(loi.owner_person_id, /chọn người từ danh bạ/i);

  const oke = validateCatalogForm({
    ...hopLe, owner_name: "Nguyễn Văn A", owner_person_id: "aaaaaaaa-1111-4111-8111-111111111111",
  });
  assert.equal(oke.owner_person_id, undefined);
});

test("patch chỉ chứa trường ĐÃ ĐỔI", () => {
  const banGoc = { object_code: "TB-001", object_name: "Máy dập viên", department: "xsx",
    validate_flag: "y", first_month: 3, frequency_months: 12, report_class: "Hóa lý" };

  // Không đổi gì thì patch rỗng — nếu gửi cả form, mọi lần lưu đều trông
  // như sửa tần suất và timeline_revision sẽ tăng oan.
  assert.deepEqual(buildCatalogPatch(hopLe, banGoc), {});

  const doiTen = buildCatalogPatch({ ...hopLe, object_name: "Máy dập viên xoay" }, banGoc);
  assert.deepEqual(doiTen, { object_name: "Máy dập viên xoay" });

  const doiTanSuat = buildCatalogPatch({ ...hopLe, frequency_months: "6" }, banGoc);
  assert.deepEqual(doiTanSuat, { frequency_months: 6 });
});

test("patch không bao giờ mang theo tên người", () => {
  const patch = buildCatalogPatch({
    ...hopLe, owner_name: "Nguyễn Văn A", owner_person_id: "aaaaaaaa-1111-4111-8111-111111111111",
  }, {});
  assert.equal("owner_name" in patch, false);
  assert.equal("support_name" in patch, false);
  assert.equal(patch.owner_person_id, "aaaaaaaa-1111-4111-8111-111111111111");
});

test("ô số rỗng gửi null chứ không gửi chuỗi rỗng", () => {
  const patch = buildCatalogPatch({ ...hopLe, workdays: "" }, { workdays: 5 });
  assert.equal(patch.workdays, null);
});

test("chỉ đòi lý do khi đụng thứ ảnh hưởng timeline", () => {
  assert.equal(canLyDo({ object_name: "tên mới" }, false), false);
  assert.equal(canLyDo({ note: "ghi chú" }, false), false);
  assert.equal(canLyDo({ frequency_months: 6 }, false), true);
  assert.equal(canLyDo({ owner_person_id: "x" }, false), true);
  // Tạo mới thì lý do là "tạo mới từ form", không bắt người dùng gõ.
  assert.equal(canLyDo({ frequency_months: 6 }, true), false);
});

test("mã đối tượng khoá sau khi tạo", () => {
  const ma = TRUONG_FORM.find((t) => t.key === "object_code");
  assert.equal(ma.khoaSauKhiTao, true);
  assert.equal(ma.batBuoc, true);
});

test("bốn nhóm đều có trường, và phân công dùng ID chứ không dùng tên", () => {
  for (const nhom of ["chinh", "ke_hoach", "phan_cong", "nang_cao"]) {
    assert.ok(TRUONG_FORM.some((t) => t.nhom === nhom), `nhóm ${nhom} phải có trường`);
  }
  const phanCong = TRUONG_FORM.filter((t) => t.nhom === "phan_cong" && t.chonNguoi);
  assert.deepEqual(phanCong.map((t) => t.key), ["owner_person_id", "support_person_id"]);
});

test("sáu bộ phận chuẩn khớp danh mục đã khai ở workspace", () => {
  assert.deepEqual(BO_PHAN_CHUAN.map((b) => b.ma),
    ["xsx", "cd", "kho", "qc", "rd", "qa"]);
});

test("mã 'bộ phận khác' không trùng với bất kỳ mã chuẩn nào", () => {
  // Đây là giá trị NỘI BỘ của giao diện, không bao giờ được ghi xuống DB —
  // trùng với một mã thật sẽ khiến "bộ phận khác" bị hiểu nhầm thành mã đó.
  assert.equal(BO_PHAN_CHUAN.some((b) => b.ma === MA_BO_PHAN_KHAC), false);
});

test("bộ phận ngoài danh sách chuẩn vẫn hợp lệ", () => {
  // Dữ liệu di trú từ Sheet có bộ phận không nằm trong sáu mã trên. Chặn
  // nó ở form nghĩa là người dùng không sửa nổi bản ghi cũ nào — mà cũng
  // không ai được phép âm thầm đổi bộ phận của hồ sơ đã ban hành.
  const f = { object_code: "TB-9", object_name: "Máy", department: "Tổ điện lạnh", validate_flag: "n" };
  assert.deepEqual(validateCatalogForm(f), {});
});

test("bộ phận để trống vẫn bị chặn", () => {
  const f = { object_code: "TB-9", object_name: "Máy", department: "", validate_flag: "n" };
  assert.equal(validateCatalogForm(f).department, "Phải nhập bộ phận quản lý");
});

test("truongThieuDauTien trả key của ô bắt buộc trống đầu tiên", () => {
  assert.equal(truongThieuDauTien({ object_code: "", object_name: "", department: "xsx" }),
    "object_code");
  assert.equal(truongThieuDauTien({ object_code: "TB-1", object_name: "", department: "xsx" }),
    "object_name");
  assert.equal(
    truongThieuDauTien({ object_code: "TB-1", object_name: "Máy", department: "xsx", validate_flag: "n" }),
    null);
});
