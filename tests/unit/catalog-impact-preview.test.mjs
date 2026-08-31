import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  CatalogImpactPreviewContent,
  beginCatalogImpactPreviewLoad,
  closeCatalogImpactIfIdle,
  createCatalogImpactApplyCoordinator,
  failCatalogImpactPreviewLoad,
  finishCatalogImpactPreviewLoad,
} from "../../src/components/catalog/CatalogImpactPreview.tsx";
import { toggleDeadlineOverride } from "../../src/features/catalogWorkspace/catalogTimelineOverrideModel.ts";

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
    status_protocol: "planned",
    status_validation: "completed",
    status_report: "planned",
    status_vmp: "planned",
  },
  deadline_protocol_cu: "2026-01-10",
  deadline_protocol_moi: "2026-01-15",
  deadline_validation_cu: "2026-02-10",
  deadline_validation_moi: "2026-02-15",
  deadline_report_cu: "2026-03-10",
  deadline_report_moi: "2026-03-15",
  deadline_vmp_cu: "2026-04-10",
  deadline_vmp_moi: "2026-04-15",
  ...overrides,
});

const preview = (overrides = {}) => ({
  ok: true,
  change_id: "change-1",
  timeline_revision: 11,
  tao: [],
  sua: [],
  dung: [],
  giu_nguyen: [],
  canh_bao: [],
  deadline_overrides: [candidate()],
  ...overrides,
});

function renderContent(overrides = {}) {
  return renderToStaticMarkup(React.createElement(CatalogImpactPreviewContent, {
    preview: preview(),
    loading: false,
    error: null,
    reason: "",
    reasonError: null,
    selected: [],
    confirmed: false,
    applying: false,
    onClose: () => {},
    onReason: () => {},
    onToggleOverride: () => {},
    onConfirmed: () => {},
    onApply: () => {},
    ...overrides,
  }));
}

test("progressed deadline preview shows four old-to-new deadlines and real-progress evidence", () => {
  const html = renderContent();

  assert.match(html, /class="lp-dialog"/);
  assert.match(html, /role="dialog"/);
  assert.match(html, /aria-modal="true"/);
  assert.doesNotMatch(html, /z-index:\s*70/i);
  assert.match(html, /CCTB01\/2026\.01-PQ/);
  for (const date of ["10/01/2026", "15/01/2026", "10/02/2026", "15/02/2026", "10/03/2026", "15/03/2026", "10/04/2026", "15/04/2026"]) {
    assert.match(html, new RegExp(date));
  }
  assert.match(html, /actual_validation_date: 20\/03\/2026/);
  assert.match(html, /Có thể cập nhật riêng deadline kế hoạch; ngày thực tế và trạng thái giữ nguyên\./);
  assert.match(html, /type="checkbox"[^>]*aria-label="Chọn cập nhật deadline CCTB01\/2026\.01-PQ"(?![^>]*checked)/);
});

test("blocked progressed candidate names the exact blocker and has no selection checkbox", () => {
  const html = renderContent({
    preview: preview({
      deadline_overrides: [candidate({
        eligible: false,
        blocker_reason: "Hạng mục đã bị hủy",
        missing: ["Tháng thẩm định đầu tiên"],
      })],
    }),
  });

  assert.match(html, /Không thể cập nhật deadline/);
  assert.match(html, /Hạng mục đã bị hủy/);
  assert.match(html, /Không thể áp — thiếu: Tháng thẩm định đầu tiên/);
  assert.doesNotMatch(html, /aria-label="Chọn cập nhật deadline CCTB01\/2026\.01-PQ"/);
});

test("a failed replacement preview clears the prior change before it can be applied", () => {
  const loaded = finishCatalogImpactPreviewLoad("change-1", preview({ tao: [{ validation_code: "old", validation_type: "PQ", deadline_vmp: "2026-04-15", thieu: [] }] }));
  assert.equal(loaded.preview?.timeline_revision, 11);

  assert.deepEqual(beginCatalogImpactPreviewLoad("change-2"), { changeId: "change-2", preview: null, loading: true, error: null });
  assert.deepEqual(finishCatalogImpactPreviewLoad("change-2", { ok: false, error: "Không xem trước được change-2" }), {
    changeId: "change-2",
    preview: null,
    loading: false,
    error: "Không xem trước được change-2",
  });
  assert.deepEqual(failCatalogImpactPreviewLoad("change-2", new Error("Mạng bị ngắt")), {
    changeId: "change-2",
    preview: null,
    loading: false,
    error: "Mạng bị ngắt",
  });
});

test("override submission sends the selected code and previewed item version once", async () => {
  const selected = toggleDeadlineOverride([], candidate());
  const calls = [];
  const coordinator = createCatalogImpactApplyCoordinator();

  const outcome = await coordinator.run({
    changeId: "change-1",
    reason: "  Đồng bộ kế hoạch mới  ",
    expectedTimelineRevision: 11,
    deadlineOverrides: selected,
    overrideConfirmed: true,
    normalChangeCount: 0,
    mutate: async (input) => { calls.push(input); return { ok: true }; },
  });

  assert.equal(outcome.kind, "applied");
  assert.deepEqual(calls, [{
    changeId: "change-1",
    reason: "Đồng bộ kế hoạch mới",
    expectedTimelineRevision: 11,
    deadlineOverrides: [{ validation_code: "CCTB01/2026.01-PQ", expected_item_version: 7 }],
    overrideConfirmed: true,
  }]);
});

test("server rejection keeps the dialog state and exposes missing/detail evidence", async () => {
  const selected = toggleDeadlineOverride([], candidate());
  const outcome = await createCatalogImpactApplyCoordinator().run({
    changeId: "change-1",
    reason: "Đồng bộ kế hoạch",
    expectedTimelineRevision: 11,
    deadlineOverrides: selected,
    overrideConfirmed: true,
    normalChangeCount: 0,
    mutate: async () => ({
      ok: false,
      error: "Không tính đủ deadline cho CCTB01/2026.01-PQ",
      missing: [{ validation_code: "CCTB01/2026.01-PQ", fields: ["Tháng thẩm định đầu tiên"] }],
      details: [{ message: "Nguồn chưa được duyệt" }],
    }),
  });

  assert.deepEqual(outcome, {
    kind: "rejected",
    message: "Không tính đủ deadline cho CCTB01/2026.01-PQ — thiếu: Tháng thẩm định đầu tiên — Nguồn chưa được duyệt",
  });
  const html = renderContent({
    error: outcome.message,
    reason: "Đồng bộ kế hoạch",
    selected,
    confirmed: true,
  });
  assert.match(html, /Không tính đủ deadline cho CCTB01\/2026\.01-PQ — thiếu: Tháng thẩm định đầu tiên — Nguồn chưa được duyệt/);
  assert.match(html, /value="Đồng bộ kế hoạch"/);
  assert.match(html, /checked=""/);
});

test("in-flight guard allows exactly one mutation and locks dialog close and submit", async () => {
  const selected = toggleDeadlineOverride([], candidate());
  let resolve;
  let calls = 0;
  const pending = new Promise((done) => { resolve = done; });
  const coordinator = createCatalogImpactApplyCoordinator();
  const input = {
    changeId: "change-1",
    reason: "Đồng bộ kế hoạch",
    expectedTimelineRevision: 11,
    deadlineOverrides: selected,
    overrideConfirmed: true,
    normalChangeCount: 0,
    mutate: async () => { calls += 1; await pending; return { ok: true }; },
  };

  const first = coordinator.run(input);
  assert.deepEqual(await coordinator.run(input), { kind: "busy" });
  assert.equal(calls, 1);
  let closed = 0;
  closeCatalogImpactIfIdle(coordinator.isBusy, () => { closed += 1; });
  assert.equal(closed, 0, "a close click racing React's rerender must still be locked");
  const html = renderContent({ applying: true, reason: input.reason, selected, confirmed: true });
  assert.match(html, /aria-label="Đóng"/);
  assert.match(html, />Để sau<\/button>/);
  assert.match(html, /<button[^>]*disabled=""[^>]*>[\s\S]*Đang áp…<\/button>/);
  resolve();
  assert.deepEqual(await first, { kind: "applied" });
});
