import test from "node:test";
import assert from "node:assert/strict";

import {
  validateProductForm,
  validateRecipientForm,
  validateDatasetForm,
  laTruongNangCao,
  laEmailHopLe,
  daDoiDataset,
} from "../../src/lib/datasetForm.ts";

test("sản phẩm GMP: mã BFO và tên là bắt buộc", () => {
  assert.deepEqual(validateProductForm({ bfo_code: "BFO-01", product_name: "Paracetamol 500" }), {});
  assert.equal(validateProductForm({ product_name: "X" }).bfo_code, "Phải nhập mã BFO");
  assert.equal(validateProductForm({ bfo_code: "BFO-01" }).product_name, "Phải nhập tên sản phẩm");
  // Khoảng trắng không tính là đã nhập.
  assert.equal(validateProductForm({ bfo_code: "   ", product_name: "X" }).bfo_code, "Phải nhập mã BFO");
});

test("người nhận mail: email sai thì chặn ngay", () => {
  // Sai một ký tự thì mail im lặng không tới ai, workflow vẫn báo thành công.
  assert.deepEqual(validateRecipientForm({ email: "qa@cpc1hn.vn" }), {});
  assert.equal(validateRecipientForm({}).email, "Phải nhập email nhận");
  assert.equal(validateRecipientForm({ email: "qa-cpc1hn.vn" }).email, "Email không hợp lệ");
  assert.equal(validateRecipientForm({ email: "qa@cpc1hn" }).email, "Email không hợp lệ");
  assert.equal(validateRecipientForm({ email: "a b@c.vn" }).email, "Email không hợp lệ");
});

test("kiểm email đủ dùng cho danh sách nội bộ", () => {
  for (const ok of ["a@b.vn", "nguyen.van.a@cpc1hn.com.vn", "x_y+z@sub.domain.org"]) {
    assert.equal(laEmailHopLe(ok), true, ok);
  }
  for (const sai of ["", "a@b", "a.b.vn", "@b.vn", "a@.vn", "a @b.vn"]) {
    assert.equal(laEmailHopLe(sai), false, sai);
  }
});

test("ngưỡng ngày phải là số", () => {
  assert.equal(validateRecipientForm({ email: "a@b.vn", threshold_days: "7" }).threshold_days, undefined);
  assert.equal(validateRecipientForm({ email: "a@b.vn", threshold_days: "bảy" }).threshold_days,
    "Ngưỡng ngày phải là số");
  // Để trống là hợp lệ — nghĩa là dùng mặc định.
  assert.equal(validateRecipientForm({ email: "a@b.vn", threshold_days: "" }).threshold_days, undefined);
});

test("phạm vi bộ phận hoặc đối tượng thì phải ghi rõ mã", () => {
  // Bỏ trống thì workflow không so khớp được với gì, người này không nhận
  // mail nào mà bảng vẫn hiện họ đang bật.
  const loi = validateRecipientForm({ email: "a@b.vn", scope_type: "department", scope: "" });
  assert.match(loi.scope, /phải ghi rõ mã/i);

  assert.equal(
    validateRecipientForm({ email: "a@b.vn", scope_type: "department", scope: "qa" }).scope,
    undefined);
  // Phạm vi "tất cả" thì không cần.
  assert.equal(
    validateRecipientForm({ email: "a@b.vn", scope_type: "all", scope: "" }).scope,
    undefined);
});

test("validateDatasetForm chọn đúng bộ luật", () => {
  assert.equal(validateDatasetForm("products", {}).bfo_code, "Phải nhập mã BFO");
  assert.equal(validateDatasetForm("alerts", {}).email, "Phải nhập email nhận");
  // Dataset chưa có luật thì không chặn gì.
  assert.deepEqual(validateDatasetForm("staff", {}), {});
});

test("nhóm nâng cao đúng theo thiết kế", () => {
  // Sản phẩm: mã, tên, dạng bào chế, hàm lượng, line luôn hiện.
  for (const chinh of ["bfo_code", "product_name", "dosage_form", "strength", "production_line"]) {
    assert.equal(laTruongNangCao("products", chinh), false, chinh);
  }
  for (const nangCao of ["ingredients", "batch_size", "mixing_tank", "note"]) {
    assert.equal(laTruongNangCao("products", nangCao), true, nangCao);
  }

  // Người nhận mail: email, tên, hai cờ bật/tắt luôn hiện.
  for (const chinh of ["email", "recipient_name", "is_enabled", "ai_report_enabled", "alert_kind"]) {
    assert.equal(laTruongNangCao("alerts", chinh), false, chinh);
  }
  for (const nangCao of ["scope_type", "scope", "threshold_days", "ai_report_schedule", "note"]) {
    assert.equal(laTruongNangCao("alerts", nangCao), true, nangCao);
  }
});

test("nhận ra form đã đổi để cảnh báo trước khi đóng", () => {
  const goc = { email: "a@b.vn", note: null, threshold_days: 7 };
  const keys = ["email", "note", "threshold_days"];

  assert.equal(daDoiDataset({ email: "a@b.vn", note: "", threshold_days: "7" }, goc, keys), false);
  assert.equal(daDoiDataset({ email: "c@d.vn", note: "", threshold_days: "7" }, goc, keys), true);
  assert.equal(daDoiDataset({ email: "a@b.vn", note: "ghi chú", threshold_days: "7" }, goc, keys), true);
});
