import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import LongMonRace, {
  LONG_MON_BACKGROUND_URL,
  LONG_MON_SPECIES_SHEET_URL,
} from "../../src/features/monitoring/LongMonRace.tsx";
import {
  buildLongMonRaceModel,
  LONG_MON_COLLISION_HEIGHT_PX,
  LONG_MON_COLLISION_WIDTH_PX,
  longMonStageOf,
} from "../../src/features/monitoring/longMonRaceModel.ts";
import { LONG_MON_DENSITY_SCENARIOS } from "../fixtures/long-mon-density-fixtures.mjs";

const NOW = new Date("2026-08-31T04:00:00.000Z");
const SCENE_WIDTH = 820;
const SCENE_HEIGHT = 560;

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

test("atlas V16 và vùng va chạm giữ đàn cá nhỏ gọn", () => {
  assert.equal(
    LONG_MON_BACKGROUND_URL,
    "/art/monitoring/long-mon-vmp-racecourse-60-days-v17.webp",
  );
  assert.equal(
    LONG_MON_SPECIES_SHEET_URL,
    "/art/monitoring/long-mon-six-species-v16.webp",
  );
  assert.ok(LONG_MON_COLLISION_WIDTH_PX <= 64);
  assert.ok(LONG_MON_COLLISION_HEIGHT_PX <= 56);
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

test("Ngư đồ hiển thị 30 ngày đã qua và 30 ngày sắp tới quanh Hôm nay", () => {
  const midMonthNow = new Date("2026-08-17T04:00:00.000Z");
  const model = buildLongMonRaceModel([
    activity("start", "2026-07-18"),
    activity("last", "2026-09-15"),
    activity("before", "2026-07-17"),
    activity("outside", "2026-09-16"),
  ], midMonthNow);

  assert.deepEqual(
    model.bands.map(({ year, month }) => [year, month]),
    [[2026, 7], [2026, 8], [2026, 9]],
  );
  assert.deepEqual(
    model.fish.map((fish) => fish.activity.id).sort(),
    ["last", "start"],
  );
  assert.equal(model.todayPct, 50);
  assert.deepEqual(model.periods, [
    { id: "past", label: "30 ngày đã qua", startPct: 0, widthPct: 50 },
    { id: "future", label: "30 ngày sắp tới", startPct: 50, widthPct: 50 },
  ]);
});

function overlappingPairs(fish, sceneWidth = SCENE_WIDTH, sceneHeight = SCENE_HEIGHT) {
  const boxes = fish.map((item) => {
    const centerX = item.xPct / 100 * sceneWidth;
    const centerY = item.yPct / 100 * sceneHeight;
    const width = Math.max(44, LONG_MON_COLLISION_WIDTH_PX * item.renderScale + 8);
    const height = Math.max(44, LONG_MON_COLLISION_HEIGHT_PX * item.renderScale + 10);
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

function overlappingPairsInModel(model) {
  return overlappingPairs(
    model.fish,
    model.sceneWidthPx ?? SCENE_WIDTH,
    model.sceneHeightPx ?? SCENE_HEIGHT,
  );
}

test("trường đua phủ đúng 60 ngày quanh Hôm nay và loại hạn ngoài khoảng", () => {
  const model = buildLongMonRaceModel([
    activity("start", "2026-08-01"),
    activity("same-a", "2026-08-31"),
    activity("same-b", "2026-08-31"),
    activity("same-c", "2026-08-31"),
    activity("end", "2026-09-29"),
    activity("outside", "2026-09-30"),
    activity("before", "2026-07-31"),
    activity("missing", null),
  ], NOW);

  assert.deepEqual(
    model.bands.map(({ year, month }) => [year, month]),
    [[2026, 8], [2026, 9]],
  );
  assert.equal(model.fish.some((fish) => fish.activity.id === "outside"), false);
  assert.equal(model.fish.some((fish) => fish.activity.id === "before"), false);
  assert.equal(model.missingDeadlineCount, 1);
  assert.equal(model.weeks.length, 10);
  assert.equal(model.weeks[0].key, "2026-07-27");
  assert.equal(model.weeks[9].key, "2026-09-28");
  assert.match(model.weeks[0].label, /^\d{2}\/\d{2}–\d{2}\/\d{2}$/);

  const start = model.fish.find((fish) => fish.activity.id === "start");
  const end = model.fish.find((fish) => fish.activity.id === "end");
  assert.equal(start.deadlinePct, 0);
  assert.equal(end.deadlinePct, 59 / 60 * 100);
  assert.ok(start.renderXPct >= start.ownerStartPct && start.renderXPct <= start.ownerEndPct);
  assert.ok(end.renderXPct >= end.ownerStartPct && end.renderXPct <= end.ownerEndPct);

  const sameDate = model.fish.filter((fish) => fish.deadline === "2026-08-31");
  assert.equal(new Set(sameDate.map((fish) => fish.weekKey)).size, 1);
  assert.equal(new Set(sameDate.map((fish) => fish.deadlinePct)).size, 1);
  assert.ok(new Set(sameDate.map((fish) => fish.renderXPct)).size > 1);
});

test("mật độ không làm méo chiều rộng tuần trên trục tuyến tính", () => {
  const model = buildLongMonRaceModel(
    Array.from({ length: 12 }, (_, index) =>
      activity(`weighted-${index}`, "2026-09-02")),
    NOW,
    { audience: "team" },
  );
  const fullWeeks = model.weeks.filter((week) => week.widthPct > 11);
  assert.ok(fullWeeks.length >= 7);
  assert.ok(fullWeeks.every((week) => Math.abs(week.widthPct - 7 / 60 * 100) < .001));
  assert.ok(Math.abs(model.weeks.reduce((sum, week) => sum + week.widthPct, 0) - 100) < .001);
  const todayWeek = model.weeks.find((week) => week.key === "2026-08-31");
  assert.ok(model.todayPct >= todayWeek.startPct
    && model.todayPct <= todayWeek.startPct + todayWeek.widthPct,
  "vạch hôm nay phải đi theo tỷ lệ tuần mới");
});

test("mật độ cá không đẩy ranh giới quá khứ và tương lai khỏi tâm", () => {
  const midMonthNow = new Date("2026-08-17T04:00:00.000Z");
  const model = buildLongMonRaceModel([
    activity("past", "2026-08-01"),
    ...Array.from({ length: 20 }, (_, index) =>
      activity(`future-${index}`, "2026-09-01")),
  ], midMonthNow);

  const pastEdge = model.weeks.find((week) => week.key === "2026-08-10");
  const futureStart = model.weeks.find((week) => week.key === "2026-08-17");
  assert.ok(Math.abs(pastEdge.startPct + pastEdge.widthPct - 50) < .001,
    `miền đã qua phải kết thúc ở 50%, hiện là ${pastEdge.startPct + pastEdge.widthPct}`);
  assert.ok(Math.abs(futureStart.startPct - 50) < .001,
    `miền sắp tới phải bắt đầu ở 50%, hiện là ${futureStart.startPct}`);
});

test("trục 60 ngày tuyến tính giữ Hôm nay ở giữa dù mật độ lệch", () => {
  const model = buildLongMonRaceModel([
    activity("linear-start", "2026-08-01"),
    ...Array.from({ length: 20 }, (_, index) =>
      activity(`linear-dense-${index}`, "2026-09-01")),
    activity("linear-last", "2026-09-29"),
  ], NOW, { audience: "team" });

  assert.equal(model.todayPct, 50);
  assert.ok(Math.abs(model.weeks.reduce((sum, week) => sum + week.widthPct, 0) - 100) < .001);
  assert.ok(model.weeks.every((week) => week.widthPct <= 7 / 60 * 100 + .001));
  assert.equal(model.fish.find((fish) => fish.deadline === "2026-08-01").deadlinePct, 0);
  assert.equal(model.fish.find((fish) => fish.deadline === "2026-09-01").deadlinePct, 31 / 60 * 100);
});

test("đàn 1 5 12 24 40 cá chọn đúng họ và không rời vùng deadline", () => {
  const cases = [
    [1, "solo", 2],
    [5, "arc", 5],
    [12, "double-stream", 7.5],
    [24, "teardrop", 10],
    [40, "branches", 14],
  ];
  for (const [count, formation, maxHalfSpan] of cases) {
    const model = buildLongMonRaceModel(
      Array.from({ length: count }, (_, index) =>
        activity(`${formation}-${index}`, "2026-09-05")),
      NOW,
      { audience: "team" },
    );
    assert.equal(model.fish.length, count);
    assert.ok(model.fish.every((fish) => fish.schoolFormation === formation));
    assert.equal(new Set(model.fish.map((fish) => fish.deadlinePct)).size, 1);
    assert.ok(model.fish.every((fish) => fish.renderXPct >= fish.ownerStartPct
      && fish.renderXPct <= fish.ownerEndPct));
    assert.ok(model.fish.every((fish) =>
      Math.abs(fish.renderXPct - fish.deadlinePct) <= maxHalfSpan + 4),
    `${count} cá phải giữ đàn quanh deadline thay vì trải hết 60 ngày`);
    assert.deepEqual(overlappingPairsInModel(model), []);
  }
});

test("mô phỏng mật độ 1 đến 126 cá giữ đủ hồ sơ và bố trí xác định", () => {
  for (const scenario of LONG_MON_DENSITY_SCENARIOS) {
    const model = buildLongMonRaceModel(scenario.activities, NOW, { audience: "team" });
    const reversed = buildLongMonRaceModel([...scenario.activities].reverse(), NOW, { audience: "team" });

    assert.equal(model.fish.length, scenario.expectedCount, scenario.label);
    assert.ok(model.fish.every((fish) => fish.renderXPct >= fish.ownerStartPct
      && fish.renderXPct <= fish.ownerEndPct), `${scenario.label}: cá vượt vùng deadline`);
    assert.ok(model.fish.every((fish) => !(fish.renderXPct === 0 && fish.renderYPct === 0)),
      `${scenario.label}: cá rơi về tọa độ mặc định`);
    assert.ok(model.fish.every((fish) => {
      const width = Math.max(44, LONG_MON_COLLISION_WIDTH_PX * fish.renderScale + 8);
      const height = Math.max(44, LONG_MON_COLLISION_HEIGHT_PX * fish.renderScale + 10);
      const x = fish.renderXPct / 100 * model.sceneWidthPx;
      const y = fish.renderYPct / 100 * model.sceneHeightPx;
      return x - width / 2 >= 0 && x + width / 2 <= model.sceneWidthPx
        && y - height / 2 >= 0 && y + height / 2 <= model.sceneHeightPx;
    }), `${scenario.label}: cá bị cắt ở mép canvas`);
    assert.deepEqual(overlappingPairsInModel(model), [], `${scenario.label}: cá chồng nhau`);
    assert.deepEqual(
      model.fish.map((fish) => ({
        id: fish.activity.id,
        deadlinePct: fish.deadlinePct,
        renderXPct: fish.renderXPct,
        renderYPct: fish.renderYPct,
        formation: fish.schoolFormation,
      })),
      reversed.fish.map((fish) => ({
        id: fish.activity.id,
        deadlinePct: fish.deadlinePct,
        renderXPct: fish.renderXPct,
        renderYPct: fish.renderYPct,
        formation: fish.schoolFormation,
      })),
      `${scenario.label}: layout đổi khi đảo input`,
    );
    if (scenario.expectedFormation) {
      assert.ok(model.fish.every((fish) => fish.schoolFormation === scenario.expectedFormation));
    }
    assert.ok(model.sceneHeightPx >= 560 && model.sceneHeightPx <= 2240);
  }

  const adjacent = LONG_MON_DENSITY_SCENARIOS.find((scenario) => scenario.id === "adjacent-18-18");
  const adjacentModel = buildLongMonRaceModel(adjacent.activities, NOW, { audience: "team" });
  const left = adjacentModel.fish.filter((fish) => fish.deadline === "2026-09-05");
  const right = adjacentModel.fish.filter((fish) => fish.deadline === "2026-09-06");
  assert.equal(new Set(left.map((fish) => fish.deadlinePct)).size, 1);
  assert.equal(new Set(right.map((fish) => fish.deadlinePct)).size, 1);
  assert.ok(left[0].deadlinePct < right[0].deadlinePct);
  assert.equal(left[0].ownerEndPct, right[0].ownerStartPct);
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
  assert.ok(model.fish.every((fish) => fish.renderXPct >= fish.ownerStartPct
    && fish.renderXPct <= fish.ownerEndPct),
  "tâm cá phải nằm trong vùng sở hữu deadline chính xác");
  assert.deepEqual(overlappingPairsInModel(model), []);
  assert.ok(model.fish.every((fish) => fish.yPct >= 0 && fish.yPct <= 100));

  const roundedScales = new Set(model.fish.map((fish) => fish.renderScale.toFixed(2)));
  const roundedAngles = new Set(model.fish.map((fish) => Math.round(fish.renderRotateDeg)));
  assert.ok(roundedScales.size >= 4,
    "đàn cá phải có nhiều cỡ nhỏ lệch nhau thay vì cùng một tỷ lệ");
  assert.ok(roundedAngles.size >= 4,
    "đàn cá phải có nhiều tư thế bơi thay vì nghiêng gần như giống nhau");
  assert.ok(model.fish.every((fish) => Math.abs(fish.renderRotateDeg) <= 12));
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
  assert.deepEqual(overlappingPairsInModel(first), []);
  assert.ok(first.fish.some((fish) => Math.abs(fish.renderRotateDeg) >= .5));
});

test("hai tuần đông liền kề dùng va chạm toàn cục và không phụ thuộc thứ tự input", () => {
  const input = [
    ...Array.from({ length: 8 }, (_, index) => activity(`left-${index}`, "2026-09-06")),
    ...Array.from({ length: 8 }, (_, index) => activity(`right-${index}`, "2026-09-07")),
  ];
  const first = buildLongMonRaceModel(input, NOW, { audience: "team" });
  const reversed = buildLongMonRaceModel([...input].reverse(), NOW, { audience: "team" });

  assert.deepEqual(overlappingPairsInModel(first), []);
  assert.deepEqual(
    first.fish.map(({ activity: { id }, xPct, yPct }) => ({ id, xPct, yPct })),
    reversed.fish.map(({ activity: { id }, xPct, yPct }) => ({ id, xPct, yPct })),
  );
});

test("đàn thưa trên nhiều tuần vẫn bơi rải theo chiều sâu thay vì dồn sát hai mép", () => {
  const input = Array.from({ length: 18 }, (_, index) => {
    const dayOffset = Math.floor(index * 20 / 17);
    const deadline = new Date(Date.UTC(2026, 7, 24 + dayOffset)).toISOString().slice(0, 10);
    return activity(`sparse-${index}`, deadline);
  });
  const model = buildLongMonRaceModel(input, NOW, { audience: "team" });
  const edgeFish = model.fish.filter((fish) => fish.yPct < 15 || fish.yPct > 85);
  const depthBands = new Set(model.fish.map((fish) => Math.floor(fish.yPct / 10)));

  assert.ok(edgeFish.length <= 5,
    `không được dồn ${edgeFish.length}/${model.fish.length} cá sát mép trên/dưới`);
  assert.ok(depthBands.size >= 6,
    `đàn cá phải dùng ít nhất sáu dải chiều sâu, hiện có ${depthBands.size}`);
  assert.deepEqual(overlappingPairsInModel(model), []);
});

test("bốn mươi tám cá trong cửa sổ 60 ngày nằm trọn scene cố định", () => {
  const input = Array.from({ length: 48 }, (_, index) => {
    const dayOffset = Math.floor(index * 20 / 47);
    const deadline = new Date(Date.UTC(2026, 7, 24 + dayOffset)).toISOString().slice(0, 10);
    return activity(`team-${index}`, deadline);
  });
  const model = buildLongMonRaceModel(input, NOW, { audience: "team" });

  assert.equal(model.fish.length, 48);
  assert.deepEqual(overlappingPairsInModel(model), []);
  assert.ok(model.fish.every((fish) => fish.xPct >= 0 && fish.xPct <= 100));
  assert.ok(model.fish.every((fish) => fish.yPct >= 0 && fish.yPct <= 100));
  /* Ràng buộc thật là KHÔNG VA CHẠM (đã kiểm ở trên) + không teo quá bậc
     giữa của thang TEAM_DENSITY_LEVELS. */
  assert.ok(model.densityScale >= .5 && model.densityScale <= 1);
});

test("sự cố production 31/08: 126 cá trong 60 ngày không được ném lỗi", () => {
  /* Dữ liệu đông làm sập bản deploy đầu: ba cụm lớn cạn cả tám bậc mật độ ở hồ 560px và model
     ném Error làm trắng màn. Hợp đồng mới: hết bậc mật độ thì hồ SÂU
     THÊM (TEAM_HEIGHT_LEVELS), không bao giờ ném vì đông cá. */
  const input = [];
  for (let i = 0; i < 80; i += 1) input.push(activity(`p80-${i}`, `2026-09-0${1 + (i % 6)}`));
  for (let i = 0; i < 18; i += 1) input.push(activity(`p18-${i}`, `2026-09-2${8 + (i % 2)}`));
  for (let i = 0; i < 28; i += 1) input.push(activity(`p28-${i}`, i % 2 ? "2026-09-27" : "2026-09-29"));

  const model = buildLongMonRaceModel(input, NOW, { audience: "team" });
  assert.equal(model.fish.length, 126);
  assert.deepEqual(overlappingPairsInModel(model), []);
  assert.ok(model.fish.every((fish) => fish.xPct >= 0 && fish.xPct <= 100
    && fish.yPct >= 0 && fish.yPct <= 100));
  // Hồ được phép sâu hơn 560 nhưng không phi mã.
  assert.ok(model.sceneHeightPx >= 560 && model.sceneHeightPx <= 2240,
    `hồ sâu ${model.sceneHeightPx}px`);
});

test("nhóm đông giữ hồ vừa một màn hình", () => {
  for (const count of [20, 30, 40]) {
    const model = buildLongMonRaceModel(
      Array.from({ length: count }, (_, index) =>
        activity(`dense-${count}-${index}`, "2026-09-02")),
      NOW,
      { audience: "team" },
    );

    assert.equal(model.sceneWidthPx, 960, `${count} cá phải dùng hồ nhóm vừa màn hình`);
    assert.ok(model.sceneHeightPx >= SCENE_HEIGHT,
      `${count} cá không được làm scene thấp hơn ${SCENE_HEIGHT}px`);
    assert.equal(model.fish.filter((fish) => fish.xPct === 0 && fish.yPct === 0).length, 0,
      `${count} cá không được rơi về tọa độ mặc định`);
    assert.deepEqual(overlappingPairsInModel(model), [],
      `${count} cá không được chồng sau khi mở rộng scene`);
  }
});

test("tám mươi cá cùng deadline chỉ tăng một bậc chiều sâu", () => {
  const model = buildLongMonRaceModel(
    Array.from({ length: 80 }, (_, index) =>
      activity(`overflow-${index}`, "2026-09-02")),
    NOW,
    { audience: "team" },
  );

  assert.equal(model.fish.length, 80);
  assert.equal(model.sceneWidthPx, 960);
  assert.ok(model.sceneHeightPx >= SCENE_HEIGHT && model.sceneHeightPx <= 700);
  assert.deepEqual(overlappingPairsInModel(model), []);
});

test("cá nhân tự bố trí trung tâm, vòng cung và chữ S ổn định", () => {
  const one = buildLongMonRaceModel([activity("solo", "2026-09-05")], NOW, { audience: "personal" });
  assert.equal(one.sceneWidthPx, SCENE_WIDTH);
  assert.equal(one.sceneHeightPx, SCENE_HEIGHT);
  assert.ok(one.fish[0].yPct >= 42 && one.fish[0].yPct <= 58);

  const fourInput = Array.from({ length: 4 }, (_, index) =>
    activity(`arc-${index}`, `2026-09-0${index + 1}`));
  const four = buildLongMonRaceModel(fourInput, NOW, { audience: "personal" });
  assert.deepEqual(overlappingPairsInModel(four), []);
  assert.ok(Math.max(...four.fish.map((fish) => fish.yPct))
    - Math.min(...four.fish.map((fish) => fish.yPct)) >= 18);

  const tenInput = Array.from({ length: 10 }, (_, index) =>
    activity(`s-${index}`, `2026-09-${String(index + 1).padStart(2, "0")}`));
  const ten = buildLongMonRaceModel(tenInput, NOW, { audience: "personal" });
  const team = buildLongMonRaceModel(tenInput, NOW, { audience: "team" });
  assert.deepEqual(overlappingPairsInModel(ten), []);
  assert.notDeepEqual(
    ten.fish.map(({ xPct, yPct }) => ({ xPct, yPct })),
    team.fish.map(({ xPct, yPct }) => ({ xPct, yPct })),
  );
  assert.deepEqual(ten, buildLongMonRaceModel(tenInput, NOW, { audience: "personal" }));
});

test("trường đua kể hành trình 60 ngày, cá có tên truy cập và legend sáu loài", () => {
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

  assert.match(html, /aria-label="Dòng thời gian VMP 60 ngày quanh Hôm nay"/);
  assert.match(html, /aria-label="60 ngày VMP quanh Hôm nay/);
  assert.match(html, /data-long-mon-period="past"/);
  assert.match(html, /30 ngày đã qua/);
  assert.match(html, /data-long-mon-period="future"/);
  assert.match(html, /30 ngày sắp tới/);
  assert.match(html, /Bấm cá để xem hạn và hồ sơ/);
  assert.doesNotMatch(html, /Dòng nước/);
  assert.match(html, /08\/2026/);
  assert.match(html, /09\/2026/);
  assert.doesNotMatch(html, /07\/2026/);
  assert.match(html, /<button[^>]+data-long-mon-fish="dc-01"/);
  assert.match(html, /data-deadline="2026-09-05"/);
  assert.match(html, /data-week="2026-08-31"/);
  assert.match(html, /data-anchor-x="[\d.]+"/);
  assert.match(html, /data-render-x="[\d.]+"/);
  assert.match(html, /data-owner-start="[\d.]+"/);
  assert.match(html, /data-owner-end="[\d.]+"/);
  assert.match(html, /data-school-formation="solo"/);
  assert.match(html, /data-motion-profile="(?:glide|rise|s-curve|stream-tilt|follow|tail-drift)"/);
  assert.match(html, /class="long-mon-race__fish-body"/);
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

test("component truyền audience và kích thước scene thích ứng", async () => {
  const html = renderToStaticMarkup(React.createElement(LongMonRace, {
    activities: [activity("fixed", "2026-09-05")],
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
  const teamHtml = renderToStaticMarkup(React.createElement(LongMonRace, {
    activities: [activity("team-fixed", "2026-09-05")],
    now: NOW,
    onOpen: () => {},
    scopeControl: {
      canChooseAudience: true,
      audience: "team",
      scopeLabel: "Cả nhóm QA",
      people: [],
      selectedPersonId: null,
      onAudienceChange: () => {},
      onPersonChange: () => {},
    },
  }));
  const source = await readFile(new URL("../../src/features/monitoring/LongMonRace.tsx", import.meta.url), "utf8");

  assert.match(html, /long-mon-race__canvas long-mon-race__canvas--adaptive-scene/);
  assert.match(html, /data-density-scale="[\d.]+"/);
  assert.match(html, /data-scene-width="820"/);
  assert.match(html, /data-scene-height="560"/);
  assert.match(html, /--long-mon-scene-width:820px/);
  assert.match(html, /--long-mon-scene-height:560px/);
  assert.match(teamHtml, /data-scene-width="960"/);
  assert.match(html, /--long-mon-y:[\d.]+%/);
  /* 31/08: model được memo hoá — audience tách ra biến riêng làm dep của
     useMemo, nên regex khớp theo hai vế: (1) audience lấy từ scopeControl
     với mặc định "team", (2) buildLongMonRaceModel nhận đúng biến đó. */
  assert.match(source, /const audience = scopeControl\?\.audience \?\? "team"/);
  assert.match(source, /buildLongMonRaceModel\(activities, now, \{ audience \}\)/);
  assert.doesNotMatch(source, /laneCount\s*\*\s*78/);
});

test("sáu loài giữ sprite riêng, cá bơi nhịp chậm và tắt được chuyển động", async () => {
  const css = await readFile(new URL("../../src/features/monitoring/long-mon-race.css", import.meta.url), "utf8");
  for (const species of ["catfish", "betta", "carp", "angelfish", "arowana", "puffer"]) {
    assert.match(css, new RegExp(`\\.long-mon-race__fish--${species} \\.long-mon-race__sprite`));
  }
  const fishRule = css.match(/\.long-mon-race__fish\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
  const spriteRule = css.match(/\.long-mon-race__sprite\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.doesNotMatch(fishRule, /scale\(var\(--school-scale\)\)/,
    "không được scale cả button vì sẽ làm vùng bấm nhỏ hơn 44px");
  assert.match(spriteRule, /scale:\s*var\(--school-scale\)/,
    "chỉ hình cá được thay đổi tỷ lệ trong vùng bấm cố định");
  /* 31/08 — chủ dự án yêu cầu "thể hiện được cá đang bơi": luật cấm
     animation cũ thay bằng ba ràng buộc chặt hơn — có nhịp bơi
     long-mon-swim, mỗi con lệch pha riêng (--swim-*), và
     prefers-reduced-motion tắt được toàn bộ. */
  assert.match(css, /@keyframes long-mon-swim/);
  assert.match(css, /var\(--swim-dur/);
  assert.match(css, /\.long-mon-race__fish:hover \.long-mon-race__fish-body[\s\S]*?animation-play-state:\s*paused/);
  assert.match(css, /\.long-mon-race__fish:focus-visible \.long-mon-race__fish-body[\s\S]*?animation-play-state:\s*paused/);
  const reduced = css.split("@media (prefers-reduced-motion: reduce)")[1] ?? "";
  assert.match(reduced, /\.long-mon-race__fish-body[\s\S]*?animation:\s*none/);
});

test("Timeline dùng Long Môn làm lớp nhìn chính và không lặp year rail cũ", async () => {
  const source = await readFile(new URL("../../src/pages/TimelinePage.tsx", import.meta.url), "utf8");
  const main = await readFile(new URL("../../src/main.tsx", import.meta.url), "utf8");

  assert.match(source, /import LongMonRace from "\.\.\/features\/monitoring\/LongMonRace\.tsx"/);
  /* 31/08: màn Dòng thời gian thu gọn còn mỗi Ngư đồ — workspace switch và
     view state đã bỏ, chỉ cần Long Môn là lớp nhìn duy nhất. */
  assert.doesNotMatch(source, /useState\("timeline"\)/);
  assert.match(source, /currentPersonId\?: string \| null/);
  assert.match(source, /filterLongMonScopeActivities/);
  assert.match(source, /<LongMonRace[\s\S]*activities=\{longMonActivities\}[\s\S]*scopeControl=/);
  assert.doesNotMatch(source, /view === "year" \? \(\s*<TimelineRangeRail/);
  /* B5 (31/08): CSS Long Môn RỜI entry, đi theo chunk màn Timeline — người
     không mở màn này không phải tải. Hợp đồng đổi chiều: main.tsx KHÔNG
     được import nữa, TimelinePage PHẢI import. */
  assert.doesNotMatch(main, /features\/monitoring\/long-mon-race\.css/);
  assert.match(source, /import "\.\.\/features\/monitoring\/long-mon-race\.css"/);
});
