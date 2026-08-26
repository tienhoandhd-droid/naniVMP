/* =====================================================================
 *  operational-copy.test.mjs — chuỗi hiển thị của workspace Danh mục
 *  ---------------------------------------------------------------------
 *  Hai chuỗi này là HỢP ĐỒNG với người dùng, không phải trang trí:
 *
 *   · NAV_SUBS.source hiện ngay dưới tiêu đề màn và là lời hứa về những
 *     gì màn làm được. Nó không được hứa "Người thực hiện" hay "Danh bạ
 *     nhân sự" nữa; hỗ trợ hồ sơ nhân sự được xử lý bởi quản trị viên,
 *     và không được gợi ý có xoá vật lý.
 *
 *   · LOAI_LOI.owner_no_email.sua là hướng dẫn sửa lỗi ở màn Sức khoẻ
 *     dữ liệu. Bản cũ chỉ đường tới "tab Người thực hiện" — tab đó đã bị
 *     gỡ, ai làm theo sẽ lạc; hướng dẫn phải chuyển người dùng tới quản
 *     trị viên có thẩm quyền cập nhật hồ sơ.
 *
 *  Kiểm bằng LITERAL đúng như kế hoạch Đợt B Task 6: đổi câu chữ là đổi
 *  hợp đồng, phải đổi cả test một cách có chủ ý.
 * ===================================================================== */
import test from "node:test";
import assert from "node:assert/strict";

import { NAV_SUBS, LOAI_LOI } from "../../src/constants/vmp.ts";
import { runDataQualityChecks } from "../../src/utils/helpers.ts";

test("NAV_SUBS.source nêu đúng sáu vùng của workspace, không hứa hẹn cũ", () => {
  assert.equal(
    NAV_SUBS.source,
    "Dữ liệu nguồn · Đối tượng · Sản phẩm GMP · Người nhận cảnh báo · Excel đúng mẫu · Chờ áp dụng · Lịch sử",
  );
});

test("NAV_SUBS.source không còn nhắc tới Người thực hiện, Danh bạ nhân sự hay xoá", () => {
  assert.ok(!NAV_SUBS.source.includes("Người thực hiện"));
  assert.ok(!NAV_SUBS.source.includes("Danh bạ nhân sự"));
  assert.ok(!NAV_SUBS.source.includes("xoá"));
});

test("hướng dẫn sửa owner_no_email yêu cầu liên hệ quản trị viên", () => {
  assert.equal(
    LOAI_LOI.owner_no_email.sua,
    "Liên hệ quản trị viên để bổ sung email cho hồ sơ nhân sự",
  );
});

test("lỗi thiếu email QA hướng dẫn liên hệ quản trị viên, không chỉ tab đã gỡ", () => {
  const issues = runDataQualityChecks([{
    id: "TB-101-IQ",
    code: "TB-101-IQ",
    obj: "TB-101",
    type: "IQ",
    vtype: "IQ",
    owner: "Nguyễn Thị QA",
    st: "todo",
    _raw: { email_qa: null },
  }]);

  assert.deepEqual(issues, [{
    type: "owner_no_email",
    severity: "info",
    id: "TB-101-IQ",
    msg: 'QA "Nguyễn Thị QA" chưa có email — không nhận được cảnh báo. Liên hệ quản trị viên để bổ sung email cho hồ sơ nhân sự.',
  }]);
});
