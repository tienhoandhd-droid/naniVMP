import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import LongMonRace from "../../src/features/monitoring/LongMonRace.tsx";
import {
  buildLongMonRaceModel,
  LONG_MON_COLLISION_HEIGHT_PX,
  LONG_MON_COLLISION_WIDTH_PX,
  longMonStageOf,
} from "../../src/features/monitoring/longMonRaceModel.ts";

const NOW = new Date("2026-08-31T04:00:00.000Z");
const SCENE_WIDTH = 820;
const SCENE_HEIGHT = 520;

function activity(id, deadline, raw = {}, extra = {}) {
  return {
    id,
    code: id.toUpperCase(),
    obj: `TB-${id}`,
    name: `Thiết bị ${id}`,
    type: "PQ",
    st: "prog",
    state: "active",
    dlVmp: deadline,
    _raw: {
      dl_vmp: deadline,
      tt_de_cuong: "not_started",
      tt_tham_dinh: "not_started",
      tt_bao_cao: "not_started",
      tt_vmp: "not_started",
      ...raw,
    },
    ...extra,
  };
}

test("Long Môn ánh xạ sáu tiến độ bằng sáu loài khác nhau", () => {
  const fixtures = [
    activity("catfish", "2026-09-05"),
    activity("betta", "2026-09-06", { tt_de_cuong: "completed" }),
    activity("carp", "2026-09-07", {
      tt_de_cuong: "completed",
      tt_tham_dinh: "completed",
    }),
    activity("angelfish", "2026-09-08", {
      tt_de_cuong: "completed",
      tt_tham_dinh: "completed",
      tt_bao_cao: "completed",
    }),
    activity("arowana", "2026-07-08", {
      tt_de_cuong: "completed",
      tt_tham_dinh: "completed",
      tt_bao_cao: "completed",
      tt_vmp: "completed",
    }, { st: "done" }),
    activity("puffer", "2026-08-01", { tt_de_cuong: "completed" }),
  ];

  assert.deepEqual(
    fixtures.map((item) => longMonStageOf(item, NOW)),
    ["catfish", "betta", "carp", "angelfish", "arowana", "puffer"],
  );
});

test("VMP đã hoàn tất giữ cá rồng dù deadline đã qua", () => {
  const done = activity("done", "2026-07-01", { tt_vmp: "completed" }, { st: "done" });
  assert.equal(longMonStageOf(done, NOW), "arowana");
});

test("tiến độ nhận cả ngày thực tế chuẩn hoá và cờ legacy", () => {
  const protocol = activity("actual-protocol", "2026-09-10", {}, { actProtocol: "2026-08-01" });
  const validation = activity("actual-validation", "2026-09-11", {}, {
    actProtocol: "2026-08-01",
    actValidation: "2026-08-10",
  });
  const report = activity("legacy-report", "2026-09-12", {
    protocol_done: true,
    validation_done: true,
    report_done: true,
  });

  assert.deepEqual(
    [protocol, validation, report].map((item) => longMonStageOf(item, NOW)),
    ["betta", "carp", "angelfish"],
  );
});

function overlappingPairs(fish) {
  const boxes = fish.map((item) => {
    const centerX = item.xPct / 100 * SCENE_WIDTH;
    const centerY = item.yPct / 100 * SCENE_HEIGHT;
    const width = LONG_MON_COLLISION_WIDTH_PX * item.renderScale;
    const height = LONG_MON_COLLISION_HEIGHT_PX * item.renderScale;
    return {
      id: item.activity.id,
      left: centerX - width / 2,
      right: centerX + width / 2,
      top: centerY - height / 2,
      bottom: centerY + height / 2,
    };
  });
  const overlaps = [];
  for (let left = 0; left < boxes.length; left += 1) {
    for (let right = left + 1; right < boxes.length; right += 1) {
      const a = boxes[left];
      const b = boxes[right];
      if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) {
        overlaps.push(`${a.id}/${b.id}`);
      }
    }
  }
  return overlaps;
}

test("trường đua dùng đúng ba tháng và chia dòng sông thành vùng tuần", () => {
  const model = buildLongMonRaceModel([
    activity("start", "2026-07-01"),
    activity("same-a", "2026-08-31"),
    activity("same-b", "2026-08-31"),
    activity("same-c", "2026-08-31"),
    activity("end", "2026-09-30"),
    activity("outside", "2026-10-01"),
    activity("missing", null),
  ], NOW);

  assert.deepEqual(
    model.bands.map(({ year, month }) => [year, month]),
    [[2026, 7], [2026, 8], [2026, 9]],
  );
  assert.equal(model.fish.some((fish) => fish.activity.id === "outside"), false);
  assert.equal(model.missingDeadlineCount, 1);
  assert.ok(model.weeks.length >= 13 && model.weeks.length <= 15);
  assert.match(model.weeks[0].label, /^\d{2}\/\d{2}–\d{2}\/\d{2}$/);

  const start = model.fish.find((fish) => fish.activity.id === "start");
  const end = model.fish.find((fish) => fish.activity.id === "end");
  assert.ok(start.xPct < 10, `tuần đầu phải gần mép trái: ${start.xPct}`);
  assert.ok(end.xPct > 90, `tuần cuối phải gần mép phải: ${end.xPct}`);

  const sameDate = model.fish.filter((fish) => fish.deadline === "2026-08-31");
  assert.equal(new Set(sameDate.map((fish) => fish.weekKey)).size, 1);
  assert.ok(new Set(sameDate.map((fish) => fish.xPct)).size > 1);
});

test("mười hai cá trong một tuần được xếp linh động mà không va chạm", () => {
  const deadlines = [
    "2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03",
    "2026-09-04", "2026-09-05", "2026-09-06",
  ];
  const model = buildLongMonRaceModel(
    Array.from({ length: 12 }, (_, index) => activity(
      `school-${index + 1}`,
      deadlines[index % deadlines.length],
    )),
    NOW,
  );

  assert.equal(new Set(model.fish.map((fish) => fish.weekKey)).size, 1);
  assert.ok(new Set(model.fish.map((fish) => fish.xPct)).size >= 8,
    "tọa độ ngang phải phân tán như một đàn cá, không lặp hai cột");
  assert.ok(new Set(model.fish.map((fish) => Math.round(fish.yPct * 10))).size >= 8,
    "tọa độ dọc phải tạo nhiều cao độ thay vì các hàng thẳng");
  assert.deepEqual(overlappingPairs(model.fish), []);
  assert.ok(model.fish.every((fish) => fish.yPct >= 0 && fish.yPct <= 100));
});

test("ngày cùng tuần chung vùng, tuần liền kề không va chạm và layout ổn định", () => {
  const input = ["2026-09-01", "2026-09-06", "2026-09-07"].flatMap((deadline, group) =>
    Array.from({ length: 3 }, (_, index) => activity(`g${group}-${index}`, deadline)));
  const first = buildLongMonRaceModel(input, NOW);
  const second = buildLongMonRaceModel(input, NOW);

  assert.deepEqual(first.fish.map(({ deadline, weekKey, xPct, yPct, renderScale, renderRotateDeg }) => ({
    deadline, weekKey, xPct, yPct, renderScale, renderRotateDeg,
  })), second.fish.map(({ deadline, weekKey, xPct, yPct, renderScale, renderRotateDeg }) => ({
    deadline, weekKey, xPct, yPct, renderScale, renderRotateDeg,
  })));

  const groups = Map.groupBy(first.fish, (fish) => fish.deadline);
  assert.equal(groups.get("2026-09-01")[0].weekKey, groups.get("2026-09-06")[0].weekKey);
  assert.notEqual(groups.get("2026-09-06")[0].weekKey, groups.get("2026-09-07")[0].weekKey);
  assert.deepEqual(overlappingPairs(first.fish), []);
  assert.ok(first.fish.some((fish) => Math.abs(fish.renderRotateDeg) >= .5));
});

test("hai tuần đông liền kề dùng va chạm toàn cục và không phụ thuộc thứ tự input", () => {
  const input = [
    ...Array.from({ length: 8 }, (_, index) => activity(`left-${index}`, "2026-09-06")),
    ...Array.from({ length: 8 }, (_, index) => activity(`right-${index}`, "2026-09-07")),
  ];
  const first = buildLongMonRaceModel(input, NOW, { audience: "team" });
  const reversed = buildLongMonRaceModel([...input].reverse(), NOW, { audience: "team" });

  assert.deepEqual(overlappingPairs(first.fish), []);
  assert.deepEqual(
    first.fish.map(({ activity: { id }, xPct, yPct }) => ({ id, xPct, yPct })),
    reversed.fish.map(({ activity: { id }, xPct, yPct }) => ({ id, xPct, yPct })),
  );
});

test("bốn mươi tám cá nằm trọn scene cố định", () => {
  const input = Array.from({ length: 48 }, (_, index) => {
    const dayOffset = Math.floor(index * 90 / 47);
    const deadline = new Date(Date.UTC(2026, 6, 1 + dayOffset)).toISOString().slice(0, 10);
    return activity(`team-${index}`, deadline);
  });
  const model = buildLongMonRaceModel(input, NOW, { audience: "team" });

  assert.equal(model.fish.length, 48);
  assert.deepEqual(overlappingPairs(model.fish), []);
  assert.ok(model.fish.every((fish) => fish.xPct >= 0 && fish.xPct <= 100));
  assert.ok(model.fish.every((fish) => fish.yPct >= 0 && fish.yPct <= 100));
  assert.ok(model.densityScale >= .82 && model.densityScale <= 1);
});

test("trường đua trình bày ba tháng, cá có tên truy cập và legend sáu loài", () => {
  const html = renderToStaticMarkup(React.createElement(LongMonRace, {
    activities: [
      activity("dc-01", "2026-09-05"),
      activity("tre-01", "2026-08-01", { tt_de_cuong: "completed" }),
      activity("missing", null),
    ],
    now: NOW,
    onOpen: () => {},
    scopeControl: {
      canChooseAudience: true,
      audience: "team",
      scopeLabel: "Cả nhóm QA",
      people: [{ personId: "qa-a", fullName: "QA A", label: "QA A" }],
      selectedPersonId: null,
      onAudienceChange: () => {},
      onPersonChange: () => {},
    },
  }));

  assert.match(html, /aria-label="Trường đua hạn VMP ba tháng"/);
  assert.match(html, /07\/2026/);
  assert.match(html, /08\/2026/);
  assert.match(html, /09\/2026/);
  assert.match(html, /<button[^>]+data-long-mon-fish="dc-01"/);
  assert.match(html, /data-deadline="2026-09-05"/);
  assert.match(html, /data-week="2026-08-31"/);
  assert.match(html, /data-long-mon-week="2026-08-31"/);
  assert.match(html, /--school-x:[^;]+;--school-y:[^;]+;--school-scale:[^;]+;--school-rotate:/);
  assert.match(html, /data-long-mon-audience="team"/);
  assert.match(html, /data-long-mon-audience="personal"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /DC-01 · Chưa hoàn thành đề cương · hạn VMP 05\/09\/2026/);
  assert.equal((html.match(/data-long-mon-legend=/g) || []).length, 6);
  assert.match(html, /1 hạng mục chưa có hạn VMP/);
});

test("nhân viên QA chỉ thấy nhãn Ngư đồ của tôi, không có điều khiển cả nhóm", () => {
  const html = renderToStaticMarkup(React.createElement(LongMonRace, {
    activities: [activity("mine", "2026-09-05")],
    now: NOW,
    onOpen: () => {},
    scopeControl: {
      canChooseAudience: false,
      audience: "personal",
      scopeLabel: "Ngư đồ của tôi",
      people: [],
      selectedPersonId: "qa-a",
      onAudienceChange: () => {},
      onPersonChange: () => {},
    },
  }));

  assert.match(html, /data-long-mon-personal-only="true"/);
  assert.match(html, /Ngư đồ của tôi/);
  assert.doesNotMatch(html, /data-long-mon-audience=/);
  assert.doesNotMatch(html, /Chọn người QA/);
});

test("sáu loài có sáu dáng bơi tĩnh và không dùng animation", async () => {
  const css = await readFile(new URL("../../src/features/monitoring/long-mon-race.css", import.meta.url), "utf8");
  for (const species of ["catfish", "betta", "carp", "angelfish", "arowana", "puffer"]) {
    assert.match(css, new RegExp(`\\.long-mon-race__fish--${species} \\.long-mon-race__sprite`));
  }
  assert.doesNotMatch(css, /@keyframes\s+long-mon-/);
  assert.doesNotMatch(css, /animation-name:\s*long-mon-/);
});

test("Timeline dùng Long Môn làm lớp nhìn chính và không lặp year rail cũ", async () => {
  const source = await readFile(new URL("../../src/pages/TimelinePage.tsx", import.meta.url), "utf8");
  const main = await readFile(new URL("../../src/main.tsx", import.meta.url), "utf8");

  assert.match(source, /import LongMonRace from "\.\.\/features\/monitoring\/LongMonRace\.tsx"/);
  assert.match(source, /const \[workspace, setWorkspace\] = useState\("timeline"\)/);
  assert.match(source, /const \[view, setView\] = useState\("month"\)/);
  assert.match(source, /currentPersonId\?: string \| null/);
  assert.match(source, /filterLongMonScopeActivities/);
  assert.match(source, /<LongMonRace[\s\S]*activities=\{longMonActivities\}[\s\S]*scopeControl=/);
  assert.doesNotMatch(source, /view === "year" \? \(\s*<TimelineRangeRail/);
  assert.match(main, /features\/monitoring\/long-mon-race\.css/);
});
