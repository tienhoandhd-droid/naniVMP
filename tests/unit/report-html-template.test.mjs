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

test("bản in có khối Thay đổi / Sai lệch cạnh tỉ lệ hoàn thành VMP", () => {
  const ky = periodNow();
  const base = {
    scopeLabel: "Toàn nhà máy",
    ytd: ytdSummary([]),
    monthly: periodSummary([], ky, 50),
    bottleneck: stageBottleneck([]),
    nextMonth: periodWork([], nextPeriod(ky)),
    quality: [],
  };
  const html = buildManagementReportHTML({
    ...base,
    changes: {
      year: 2026,
      summary: {
        thay_doi: { total: 4, done: 3, open: 1, overdue: 1, noDeadline: 0, rate: 75 },
        sai_lech: { total: 0, done: 0, open: 0, overdue: 0, noDeadline: 2, rate: null },
      },
    },
  });
  assert.match(html, /Thay đổi hoàn thành 2026/);
  assert.match(html, /75%/);
  assert.match(html, /3\/4 đã xong · quá hạn 1/);
  assert.match(html, /Sai lệch hoàn thành 2026/);
  assert.match(html, /2 phiếu chưa có hạn/);

  const loi = buildManagementReportHTML({ ...base, changes: { year: 2026, summary: null, note: "Không tải được danh sách thay đổi. Thử lại." } });
  assert.match(loi, /Không tải được danh sách thay đổi/);
  // Không truyền changes (bản gọi cũ) thì không có khối này.
  assert.doesNotMatch(buildManagementReportHTML(base), /Thay đổi hoàn thành/);
});

test("bản in ghi rõ tỉ lệ Hoàn thành VMP đã gồm hay chưa gồm phiếu thay đổi/sai lệch", () => {
  const ky = periodNow();
  const base = {
    scopeLabel: "Toàn nhà máy",
    ytd: { ...ytdSummary([]), vmp: { done: 54, over: 13, todo: 53, total: 120, rate: 45 } },
    monthly: periodSummary([], ky, 50),
    bottleneck: stageBottleneck([]),
    nextMonth: periodWork([], nextPeriod(ky)),
    quality: [],
  };
  assert.match(buildManagementReportHTML({ ...base, vmpChangeNote: "gồm 20 phiếu thay đổi/sai lệch" }),
    /Hoàn thành VMP \(54\/120 · gồm 20 phiếu thay đổi\/sai lệch\)/);
  assert.match(buildManagementReportHTML({ ...base, vmpChangeNote: "chưa gồm phiếu thay đổi/sai lệch (đang lọc)" }),
    /Hoàn thành VMP \(54\/120 · chưa gồm phiếu thay đổi\/sai lệch \(đang lọc\)\)/);
  // Không có phiếu nào (ghi chú rỗng) → giữ nguyên dạng cũ.
  assert.match(buildManagementReportHTML({ ...base, vmpChangeNote: "" }), /Hoàn thành VMP \(54\/120\)</);
});
