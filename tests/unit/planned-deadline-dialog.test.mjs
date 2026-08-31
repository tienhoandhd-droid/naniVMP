import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import PlannedDeadlineDialog from "../../src/features/timeline/PlannedDeadlineDialog.tsx";
import {
  PLANNED_DEADLINE_SUCCESS_TOAST,
  createPlannedDeadlineDialogController,
  plannedDeadlineErrorFocusId,
} from "../../src/features/timeline/plannedDeadlineEditModel.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const dialogSource = readFileSync(
  path.join(root, "src/features/timeline/PlannedDeadlineDialog.tsx"),
  "utf8",
);

const before = {
  deadline_protocol: "2026-01-01",
  deadline_validation: "2026-01-02",
  deadline_report: "2026-01-03",
  deadline_vmp: "2026-01-04",
};

const updateInput = {
  validationCode: "TB-001",
  deadlines: { ...before, deadline_vmp: "2026-01-05" },
  reason: "Theo biên bản QA",
  expectedVersion: 7,
  confirmed: true,
};

const success = {
  ok: true,
  validation_code: "TB-001",
  old_deadlines: before,
  new_deadlines: updateInput.deadlines,
  changed_fields: ["deadline_vmp"],
  previous_version: 7,
  current_version: 8,
  actor_id: null,
  effective_role: "admin",
  reason: updateInput.reason,
  protected_fields_preserved: true,
};

function activity() {
  return {
    id: "TB-001",
    code: "TB-001",
    obj: "TB",
    type: "PQ",
    st: "todo",
    version: 7,
    dlProtocol: before.deadline_protocol,
    dlValidation: before.deadline_validation,
    dlReport: before.deadline_report,
    dlVmp: before.deadline_vmp,
    actProtocol: "2025-12-01",
    actValidation: "2025-12-02",
    actReport: "2025-12-03",
    actVmp: "2025-12-04",
    _raw: {
      status_protocol: "completed",
      status_validation: "completed",
      status_report: "planned",
      status_vmp: "planned",
    },
  };
}

test("dialog renders exactly four editable deadlines and eight protected evidence values", () => {
  const html = renderToStaticMarkup(React.createElement(PlannedDeadlineDialog, {
    a: activity(),
    onClose: () => {},
    onReload: () => {},
  }));

  for (const key of [
    "deadline_protocol",
    "deadline_validation",
    "deadline_report",
    "deadline_vmp",
  ]) {
    assert.match(html, new RegExp(`data-planned-deadline-input="${key}"`));
  }
  for (const key of [
    "actual_protocol_date",
    "actual_validation_date",
    "actual_report_date",
    "actual_vmp_date",
    "status_protocol",
    "status_validation",
    "status_report",
    "status_vmp",
  ]) {
    assert.match(html, new RegExp(`data-planned-deadline-protected="${key}"`));
  }
  assert.match(html, /Tôi xác nhận chỉ đổi bốn deadline kế hoạch/);
  assert.match(html, /data-planned-deadline-submit="true"/);
  assert.doesNotMatch(html, /data-planned-deadline-submit="true"[^>]*disabled=""/);
  assert.match(html, /aria-describedby="planned-deadline-action-description"/);
});

test("lỗi deadline trỏ đúng ô cần sửa", () => {
  assert.equal(plannedDeadlineErrorFocusId("Phải nhập lý do điều chỉnh deadline kế hoạch"), "planned-deadline-reason");
  assert.equal(plannedDeadlineErrorFocusId("Phải xác nhận chỉ đổi bốn deadline kế hoạch"), "planned-deadline-confirmation");
  assert.equal(plannedDeadlineErrorFocusId("Không có deadline nào thay đổi"), "planned-deadline-deadline_protocol");
});

test("footer, X/Escape guard, and conflict reload share the synchronous busy close policy", async () => {
  let finishMutation;
  let mutationCalls = 0;
  let closed = 0;
  let reloaded = 0;
  const pending = new Promise((resolve) => { finishMutation = resolve; });
  const controller = createPlannedDeadlineDialogController({
    mutate: async () => {
      mutationCalls += 1;
      await pending;
      return success;
    },
    onSuccess: () => {},
    onClose: () => { closed += 1; },
    onReload: () => { reloaded += 1; },
  });

  const first = controller.submit(updateInput);
  assert.deepEqual(await controller.submit(updateInput), { kind: "busy" });
  assert.equal(mutationCalls, 1);
  assert.equal(controller.requestClose(), false, "footer/X/Escape must refuse while busy");
  assert.equal(controller.reloadConflict(), false, "reload cannot close or reload while busy");
  assert.equal(closed, 0);
  assert.equal(reloaded, 0);

  finishMutation();
  assert.deepEqual(await first, { kind: "success" });
  assert.deepEqual([closed, reloaded], [1, 1]);
  assert.match(dialogSource, /onRequestClose=\{requestClose\}/);
  assert.match(dialogSource, /onClick=\{requestClose\}>Đóng<\/button>/);
  assert.match(dialogSource, /onClick=\{reloadConflict\}/);
});

test("success toast, close, and reload happen once in that order", async () => {
  const events = [];
  const controller = createPlannedDeadlineDialogController({
    mutate: async () => success,
    onSuccess: () => { events.push(`toast:${PLANNED_DEADLINE_SUCCESS_TOAST}`); },
    onClose: () => { events.push("close"); },
    onReload: () => { events.push("reload"); },
  });

  assert.deepEqual(await controller.submit(updateInput), { kind: "success" });
  assert.deepEqual(events, [
    `toast:${PLANNED_DEADLINE_SUCCESS_TOAST}`,
    "close",
    "reload",
  ]);
  assert.match(dialogSource, /const toast = useToast\(\)/);
  assert.doesNotMatch(dialogSource, /onSuccess\??:\s*\(\)\s*=>\s*void/);
});

test("JSON failure and transport failure retain the caller-owned draft and require explicit reload", async () => {
  const conflict = {
    ok: false,
    error_code: "VERSION_CONFLICT",
    error: "Dữ liệu đã đổi",
    expected_version: 7,
    current_version: 9,
    requires_reload: true,
  };
  let closed = 0;
  let reloaded = 0;
  const controller = createPlannedDeadlineDialogController({
    mutate: async () => conflict,
    onSuccess: () => {},
    onClose: () => { closed += 1; },
    onReload: () => { reloaded += 1; },
  });

  assert.deepEqual(await controller.submit(updateInput), { kind: "failure", result: conflict });
  assert.deepEqual([closed, reloaded], [0, 0]);
  assert.equal(controller.reloadConflict(), true);
  assert.deepEqual([closed, reloaded], [1, 1]);

  const transport = createPlannedDeadlineDialogController({
    mutate: async () => { throw new Error("Mạng bị ngắt"); },
    onSuccess: () => {},
    onClose: () => { closed += 1; },
    onReload: () => { reloaded += 1; },
  });
  assert.deepEqual(await transport.submit(updateInput), {
    kind: "transport_error",
    message: "Mạng bị ngắt",
  });
  assert.match(dialogSource, /setDraft\(/, "failures do not replace the draft");
});
