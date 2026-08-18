import test from "node:test";
import assert from "node:assert/strict";

import {
  themToast, chotToast, boToast, THOI_LUONG, TOI_DA,
} from "../../src/lib/toastQueue.ts";

const t = (id, loai, noiDung) => ({ id, loai, noiDung });

test("thêm toast xếp cuối hàng", () => {
  const ds = themToast(themToast([], t("1", "thanhCong", "Đã lưu")), t("2", "loi", "Hỏng"));
  assert.deepEqual(ds.map((x) => x.id), ["1", "2"]);
});

test("quá TOI_DA thì bỏ cái cũ nhất", () => {
  let ds = [];
  for (let i = 1; i <= TOI_DA + 2; i++) ds = themToast(ds, t(String(i), "thanhCong", "x"));
  assert.equal(ds.length, TOI_DA);
  assert.equal(ds[0].id, "3");
});

test("chốt đổi tại chỗ, không nhảy xuống cuối hàng", () => {
  // Toast 'đang lưu' phải biến thành 'đã lưu' ĐÚNG CHỖ NÓ ĐANG ĐỨNG.
  // Nếu bỏ đi rồi thêm mới, người dùng thấy dòng nhảy vị trí giữa lúc đọc.
  let ds = themToast(themToast([], t("a", "dang", "Đang lưu…")), t("b", "dang", "Đang ghi…"));
  ds = chotToast(ds, "a", "thanhCong", "Đã lưu TB-001");
  assert.deepEqual(ds.map((x) => x.id), ["a", "b"]);
  assert.equal(ds[0].loai, "thanhCong");
  assert.equal(ds[0].noiDung, "Đã lưu TB-001");
});

test("chốt một id không tồn tại thì thêm mới vào cuối", () => {
  const ds = chotToast([], "z", "loi", "Hỏng");
  assert.deepEqual(ds.map((x) => x.id), ["z"]);
});

test("bỏ toast theo id", () => {
  const ds = boToast([t("a", "loi", "x"), t("b", "loi", "y")], "a");
  assert.deepEqual(ds.map((x) => x.id), ["b"]);
});

test("lỗi ở lại lâu hơn thành công", () => {
  // Người dùng cần đủ thời gian đọc câu lỗi rồi mới quyết làm gì.
  assert.ok(THOI_LUONG.loi > THOI_LUONG.thanhCong);
  assert.equal(THOI_LUONG.dang, 0); // 0 = không tự tắt, chờ chốt
});
