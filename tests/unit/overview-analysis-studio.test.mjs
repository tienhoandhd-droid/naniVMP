import assert from "node:assert/strict";
import test from "node:test";

import { buildCompletionFlow } from "../../src/features/overview/analysisStudioModel.ts";

function activity(id, { protocol, validation, report, vmp, state = "active" }) {
  return {
    id,
    state,
    st: vmp ? "done" : "in_progress",
    _raw: {
      tt_de_cuong: protocol ? "completed" : "not_started",
      tt_tham_dinh: validation ? "completed" : "not_started",
      tt_bao_cao: report ? "completed" : "not_started",
      tt_vmp: vmp ? "completed" : "not_started",
    },
  };
}

test("dòng chảy giữ đúng bốn giai đoạn và chỉ ra điểm tụt lớn nhất", () => {
  const flow = buildCompletionFlow([
    activity("A", { protocol: true, validation: true, report: true, vmp: true }),
    activity("B", { protocol: true, validation: true, report: false, vmp: false }),
    activity("C", { protocol: true, validation: false, report: false, vmp: false }),
    activity("ARCHIVE", { protocol: false, validation: false, report: false, vmp: false, state: "inactive" }),
  ]);

  assert.deepEqual(flow.stages.map((stage) => stage.id), [
    "protocol", "validation", "report", "vmp",
  ]);
  assert.deepEqual(flow.stages.map((stage) => stage.rate), [100, 67, 33, 33]);
  assert.deepEqual(flow.stages.map((stage) => stage.deltaFromPrevious), [null, -33, -34, 0]);
  assert.deepEqual(flow.bottleneck, {
    from: "validation",
    to: "report",
    fromRate: 67,
    toRate: 33,
    drop: 34,
  });
});

test("dòng chảy rỗng không bịa điểm nghẽn hoặc phần trăm", () => {
  const flow = buildCompletionFlow([]);

  assert.deepEqual(flow.stages.map((stage) => ({
    done: stage.done,
    total: stage.total,
    rate: stage.rate,
    deltaFromPrevious: stage.deltaFromPrevious,
  })), [
    { done: 0, total: 0, rate: 0, deltaFromPrevious: null },
    { done: 0, total: 0, rate: 0, deltaFromPrevious: 0 },
    { done: 0, total: 0, rate: 0, deltaFromPrevious: 0 },
    { done: 0, total: 0, rate: 0, deltaFromPrevious: 0 },
  ]);
  assert.equal(flow.bottleneck, null);
});
