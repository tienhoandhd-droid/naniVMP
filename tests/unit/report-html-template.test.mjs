import test from "node:test";
import assert from "node:assert/strict";

import { buildManagementReportHTML } from "../../src/lib/reportHtml.ts";
import {
  nextPeriod, periodNow, periodSummary, periodWork, stageBottleneck, ytdSummary,
} from "../../src/lib/reportModel.ts";

/* reportHtml.ts từng viết một chuỗi bằng ngoặc kép thường nên bản in hiện
   nguyên chữ "${esc(d.nextMonth.monthLabel)}" khi kỳ sau không có hạng mục. */
test("bản in không còn chuỗi ${...} chưa được thay giá trị", () => {
  const ky = periodNow();
  const nextMonth = periodWork([], nextPeriod(ky));
  const html = buildManagementReportHTML({
    scopeLabel: "Toàn nhà máy",
    ytd: ytdSummary([]),
    monthly: periodSummary([], ky, 50),
    bottleneck: stageBottleneck([]),
    nextMonth,
    quality: [],
  });
  assert.equal(html.includes("${"), false);
  assert.ok(html.includes(`Không có hạng mục nào đến hạn ${nextMonth.monthLabel} trong phạm vi này.`));
});
