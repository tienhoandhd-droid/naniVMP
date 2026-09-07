import assert from "node:assert/strict";
import test from "node:test";

import { buildFlowConclusion } from "../../src/components/dashboard/CompletionDashboard.tsx";

test("flow conclusion does not call independently measured stages even when no stage drops", () => {
  const conclusion = buildFlowConclusion([
    { id: "protocol", label: "Hoàn thành đề cương", short: "Đề cương", done: 0, total: 4, rate: 0, deltaFromPrevious: null },
    { id: "validation", label: "Thẩm định thực tế", short: "Thực tế", done: 0, total: 4, rate: 0, deltaFromPrevious: 0 },
    { id: "report", label: "Hoàn thành hồ sơ", short: "Hồ sơ", done: 0, total: 4, rate: 0, deltaFromPrevious: 0 },
    { id: "vmp", label: "Hoàn thành VMP", short: "VMP", done: 1, total: 4, rate: 25, deltaFromPrevious: 25 },
  ]);

  assert.match(conclusion.chinh, /Không ghi nhận mức giảm giữa các giai đoạn/);
  assert.doesNotMatch(conclusion.chinh, /đi đều nhau/);
});
