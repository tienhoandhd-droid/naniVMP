import test from "node:test";
import assert from "node:assert/strict";

import {
  candidateHasDeadlineChange,
  toggleDeadlineOverride,
  canApplyCatalogImpact,
  catalogApplyErrorMessage,
} from "../../src/features/catalogWorkspace/catalogTimelineOverrideModel.ts";

const candidate = (overrides = {}) => ({
  validation_code: "CCTB01/2026.01-PQ",
  item_version: 7,
  eligible: true,
  blocker_code: null,
  blocker_reason: null,
  missing: [],
  progress: {
    actual_protocol_date: null,
    actual_validation_date: "2026-03-20",
    actual_report_date: null,
    actual_vmp_date: null,
    status_protocol: "completed",
    status_validation: "completed",
    status_report: "not_started",
    status_vmp: "not_started",
  },
  deadline_protocol_cu: "2026-06-30",
  deadline_protocol_moi: "2026-06-30",
  deadline_validation_cu: "2026-07-31",
  deadline_validation_moi: "2026-07-31",
  deadline_report_cu: "2026-08-15",
  deadline_report_moi: "2026-08-15",
  deadline_vmp_cu: "2026-08-31",
  deadline_vmp_moi: "2026-09-30",
  ...overrides,
});

test("candidate hợp lệ có delta được chọn bằng mã và item version đã xem", () => {
  const item = candidate();
  assert.equal(candidateHasDeadlineChange(item), true);
  assert.deepEqual(toggleDeadlineOverride([], item), [{
    validation_code: "CCTB01/2026.01-PQ",
    expected_item_version: 7,
  }]);
});

test("candidate thiếu Tháng thẩm định đầu tiên không được chọn", () => {
  const item = candidate({
    eligible: false,
    missing: ["Tháng thẩm định đầu tiên"],
    blocker_code: "MISSING_SOURCE_DATA",
  });
  assert.deepEqual(toggleDeadlineOverride([], item), []);
});

test("candidate không có delta deadline không được chọn", () => {
  const item = candidate({
    deadline_protocol_moi: "2026-06-30",
    deadline_validation_moi: "2026-07-31",
    deadline_report_moi: "2026-08-15",
    deadline_vmp_moi: "2026-08-31",
  });
  assert.equal(candidateHasDeadlineChange(item), false);
  assert.deepEqual(toggleDeadlineOverride([], item), []);
});

test("toggle cùng candidate bỏ chọn và đổi version thì gửi version mới", () => {
  const item = candidate();
  const selected = [{ validation_code: item.validation_code, expected_item_version: item.item_version }];
  assert.deepEqual(toggleDeadlineOverride(selected, item), []);
  assert.deepEqual(toggleDeadlineOverride(
    [{ validation_code: item.validation_code, expected_item_version: 6 }],
    item,
  ), [{ validation_code: item.validation_code, expected_item_version: 7 }]);
});

test("apply bị chặn khi không có thao tác, lý do rỗng hoặc chưa xác nhận override", () => {
  assert.deepEqual(canApplyCatalogImpact({
    normalChangeCount: 0, selected: [], reason: "", confirmed: false,
  }), { ok: false, reason: "Không có thay đổi để áp" });
  assert.deepEqual(canApplyCatalogImpact({
    normalChangeCount: 1, selected: [], reason: "   ", confirmed: false,
  }), { ok: false, reason: "Lý do là bắt buộc" });
  assert.deepEqual(canApplyCatalogImpact({
    normalChangeCount: 0,
    selected: [{ validation_code: "CCTB01/2026.01-PQ", expected_item_version: 7 }],
    reason: "Điều chỉnh theo nguồn mới",
    confirmed: false,
  }), { ok: false, reason: "Cần xác nhận đặc biệt để áp deadline đã có tiến độ" });
  assert.deepEqual(canApplyCatalogImpact({
    normalChangeCount: 0,
    selected: [{ validation_code: "CCTB01/2026.01-PQ", expected_item_version: 7 }],
    reason: "Điều chỉnh theo nguồn mới",
    confirmed: true,
  }), { ok: true });
});

test("lỗi thiếu dữ liệu nêu đúng trường thiếu", () => {
  assert.equal(catalogApplyErrorMessage({
    ok: false,
    error_code: "MISSING_SOURCE_DATA",
    error: "Không tính đủ deadline cho CCTB01/2026.01-PQ",
    missing: [{ validation_code: "CCTB01/2026.01-PQ", fields: ["Tháng thẩm định đầu tiên"] }],
  }), "Không tính đủ deadline cho CCTB01/2026.01-PQ — thiếu: Tháng thẩm định đầu tiên");
});

test("lỗi server giữ nguyên chi tiết theo error code", () => {
  const errors = {
    VERSION_CONFLICT: "Timeline đã đổi — xem trước lại (đã xem v3, hiện tại v4)",
    ITEM_STATE_CHANGED: "CCTB01/2026.01-PQ đã đổi trạng thái validation — xem trước lại",
    INVALID_OVERRIDE_ITEM: "Mã ghi đè không hợp lệ: CCTB99/2026.01-PQ",
    FORBIDDEN: "Chỉ Admin và Quản lý QA được cập nhật deadline của hạng mục đã có tiến độ",
    NETWORK: "Chưa ghi dữ liệu vì máy chủ không phản hồi; dữ liệu cũ còn nguyên",
  };
  for (const [error_code, error] of Object.entries(errors)) {
    assert.equal(catalogApplyErrorMessage({ ok: false, error_code, error }), error);
  }
});

test("lỗi dùng details khi server không có error và có fallback khi payload rỗng", () => {
  assert.equal(catalogApplyErrorMessage({
    ok: false,
    error_code: "INVALID_OVERRIDE_ITEM",
    details: ["CCTB99/2026.01-PQ", "CCTB98/2026.01-PQ"],
  }), "CCTB99/2026.01-PQ · CCTB98/2026.01-PQ");
  assert.equal(catalogApplyErrorMessage(null), "Áp vào timeline thất bại");
  assert.equal(catalogApplyErrorMessage({ ok: false, error_code: "NETWORK" }), "Áp vào timeline thất bại");
});
