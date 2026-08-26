import test from "node:test";
import assert from "node:assert/strict";

import {
  canPresentPlannedDeadlineEdit,
  isExactPlannedDeadlineSnapshot,
  isIsoCalendarDate,
  plannedSnapshot,
  preparePlannedDeadlineUpdate,
  protectedSnapshot,
  resultMessage,
  validatePlannedDeadlineDraft,
} from "../../src/features/timeline/plannedDeadlineEditModel.ts";

const before = {
  deadline_protocol: "2026-01-01",
  deadline_validation: "2026-01-02",
  deadline_report: "2026-01-03",
  deadline_vmp: "2026-01-04",
};

function validate(next, overrides = {}) {
  return validatePlannedDeadlineDraft({
    validationCode: "TB-001",
    before,
    next,
    reason: "Điều chỉnh theo biên bản",
    confirmed: true,
    version: 7,
    ...overrides,
  });
}

test("gate chỉ admin/qa_manager khi env đúng", () => {
  assert.equal(canPresentPlannedDeadlineEdit("true", "admin"), true);
  assert.equal(canPresentPlannedDeadlineEdit("true", "qa_manager"), true);
  assert.equal(canPresentPlannedDeadlineEdit("true", "qa_staff"), false);
  assert.equal(canPresentPlannedDeadlineEdit("false", "qa_manager"), false);
  assert.equal(canPresentPlannedDeadlineEdit(undefined, "admin"), false);
});

test("draft cần version, lý do, xác nhận và thay đổi hợp lệ", () => {
  assert.match(validate(before), /Không có/);
  assert.match(
    validate({ ...before, deadline_protocol: null }),
    /Không được/,
  );
  assert.match(
    validate({ ...before, deadline_protocol: "2026-02-01" }),
    /thứ tự/,
  );
  assert.match(
    validate({ ...before, deadline_vmp: "2026-01-05" }, { version: NaN }),
    /phiên bản/,
  );
  assert.equal(
    validate({ ...before, deadline_vmp: "2026-01-05" }),
    null,
  );
});

test("submit validation rejects a blank identity and a snapshot with extra keys", () => {
  const draft = { ...before, deadline_vmp: "2026-01-05", injected: "must-not-send" };

  assert.match(
    validate(draft, { validationCode: "  " }),
    /mã hạng mục/,
  );
  assert.match(
    validate(draft),
    /bốn deadline/,
  );
});

test("validation precedence is identity, version, exact shape, then user fields", () => {
  assert.match(validate(before, { validationCode: "", version: -1 }), /mã hạng mục/);
  assert.match(validate(before, { version: -1 }), /phiên bản/);
  assert.match(validate({ ...before, extra: "x" }, { reason: "" }), /bốn deadline/);
  assert.match(validate({ ...before, deadline_vmp: "2026-01-05" }, { reason: "" }), /lý do/);
  assert.match(validate({ ...before, deadline_vmp: "2026-01-05" }, { confirmed: false }), /xác nhận/);
});

test("exact snapshot needs four own string-or-null keys and calendar dates are real", () => {
  const inherited = Object.create(before);
  assert.equal(isExactPlannedDeadlineSnapshot(inherited), false);
  assert.equal(isExactPlannedDeadlineSnapshot({ ...before, extra: null }), false);
  assert.equal(isExactPlannedDeadlineSnapshot({ ...before, deadline_vmp: undefined }), false);
  assert.equal(isExactPlannedDeadlineSnapshot(before), true);
  assert.equal(isIsoCalendarDate("2028-02-29"), true);
  assert.equal(isIsoCalendarDate("2026-02-29"), false);
  assert.equal(isIsoCalendarDate("2026-02-30"), false);
  assert.match(validate({ ...before, deadline_vmp: "2026-02-30" }), /ngày ISO/);
});

test("null gaps are legal, but erasure and nondecreasing ordering are not", () => {
  const withGaps = {
    deadline_protocol: "2026-01-01",
    deadline_validation: null,
    deadline_report: "2026-01-03",
    deadline_vmp: null,
  };
  assert.equal(
    validatePlannedDeadlineDraft({
      validationCode: "TB-001",
      before: withGaps,
      next: { ...withGaps, deadline_report: "2026-01-04" },
      reason: "Điều chỉnh hợp lệ",
      confirmed: true,
      version: 0,
    }),
    null,
  );
  assert.match(validate({ ...before, deadline_report: null }), /Không được xoá/);
  assert.match(validate({ ...before, deadline_validation: "2026-01-05" }), /thứ tự/);
});

test("prepared input trims identity/reason and recreates exactly four deadline keys", () => {
  const prepared = preparePlannedDeadlineUpdate({
    validationCode: "  TB-001  ",
    before,
    next: { ...before, deadline_vmp: "2026-01-05" },
    reason: "  Theo biên bản QA  ",
    confirmed: true,
    version: 7,
  });

  assert.deepEqual(prepared, {
    ok: true,
    input: {
      validationCode: "TB-001",
      deadlines: {
        deadline_protocol: "2026-01-01",
        deadline_validation: "2026-01-02",
        deadline_report: "2026-01-03",
        deadline_vmp: "2026-01-05",
      },
      reason: "Theo biên bản QA",
      expectedVersion: 7,
      confirmed: true,
    },
  });
});

test("snapshot reads direct, raw, then legacy for all planned and protected fields", () => {
  const activity = {
    dlProtocol: "2026-01-01",
    actProtocol: "2025-01-01",
    _raw: {
      dl_tham_dinh: "2026-01-02",
      deadline_report: "2026-01-03",
      dl_vmp: "2026-01-04",
      actual_protocol_date: "ignored-by-direct",
      ngay_tham_dinh: "2025-01-02",
      actual_report_date: "2025-01-03",
      ngay_vmp: "2025-01-04",
      status_protocol: "completed",
      tt_tham_dinh: "completed",
      status_report: "planned",
      tt_vmp: "planned",
    },
  };

  assert.deepEqual(plannedSnapshot(activity), before);
  assert.deepEqual(protectedSnapshot(activity), {
    actual_protocol_date: "2025-01-01",
    actual_validation_date: "2025-01-02",
    actual_report_date: "2025-01-03",
    actual_vmp_date: "2025-01-04",
    status_protocol: "completed",
    status_validation: "completed",
    status_report: "planned",
    status_vmp: "planned",
  });
});

test("conflict text preserves both exact server versions", () => {
  assert.equal(resultMessage({
    ok: false,
    error_code: "VERSION_CONFLICT",
    error: "Dữ liệu đã đổi",
    expected_version: 7,
    current_version: 9,
  }), "Dữ liệu đã đổi (phiên bản đã tải 7; hiện tại 9)");
});
