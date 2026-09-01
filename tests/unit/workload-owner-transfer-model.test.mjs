import test from "node:test";
import assert from "node:assert/strict";

import {
  canTransferWorkloadOwner,
  prepareWorkloadOwnerTransfer,
} from "../../src/features/workload/workloadOwnerTransferModel.ts";

test("chỉ Admin và Quản lý QA được chuyển người từ Khối lượng", () => {
  assert.equal(canTransferWorkloadOwner("admin"), true);
  assert.equal(canTransferWorkloadOwner("qa_manager"), true);
  for (const role of ["qa_staff", "workshop_manager", "workshop_staff", null]) {
    assert.equal(canTransferWorkloadOwner(role), false);
  }
});

test("từ chối khi chưa chọn người mới", () => {
  assert.deepEqual(prepareWorkloadOwnerTransfer({
    validationCode: "PQ-01",
    currentPersonId: "old",
    nextPersonId: "",
    currentName: "QA cũ",
    nextName: "",
    reason: "Điều phối tải",
  }), { ok: false, error: "Chọn người phụ trách mới." });
});

test("từ chối khi chọn lại người đang phụ trách", () => {
  assert.deepEqual(prepareWorkloadOwnerTransfer({
    validationCode: "PQ-01",
    currentPersonId: "same",
    nextPersonId: "same",
    currentName: "QA hiện tại",
    nextName: "QA hiện tại",
    reason: "Điều phối tải",
  }), { ok: false, error: "Người được chọn đang là người phụ trách." });
});

test("từ chối lý do chỉ có khoảng trắng", () => {
  assert.deepEqual(prepareWorkloadOwnerTransfer({
    validationCode: "PQ-01",
    currentPersonId: null,
    nextPersonId: "new",
    currentName: "",
    nextName: "QA mới",
    reason: "   ",
  }), { ok: false, error: "Nhập lý do chuyển phụ trách." });
});

test("chuẩn hóa payload UUID và nội dung xác nhận", () => {
  assert.deepEqual(prepareWorkloadOwnerTransfer({
    validationCode: " PQ-01 ",
    currentPersonId: "old",
    nextPersonId: "new",
    currentName: "QA cũ",
    nextName: "QA mới",
    reason: "  Điều phối   tải  ",
  }), {
    ok: true,
    input: {
      validationCode: "PQ-01",
      personId: "new",
      reason: "Điều phối tải",
    },
    confirmation: "PQ-01: QA cũ → QA mới. Lý do: Điều phối tải",
  });
});

test("dùng nhãn Chưa phân công khi hạng mục chưa có chủ", () => {
  const result = prepareWorkloadOwnerTransfer({
    validationCode: "IQ-02",
    currentPersonId: null,
    nextPersonId: "new",
    currentName: "",
    nextName: "QA mới",
    reason: "Phân công ban đầu",
  });
  assert.equal(result.ok, true);
  assert.match(result.confirmation, /Chưa phân công → QA mới/);
});
