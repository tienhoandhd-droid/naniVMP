import test from "node:test";
import assert from "node:assert/strict";

import {
  buildTodayActionModel,
  isTodayActivityMine,
} from "../../src/features/today/todayModel.ts";

const HOM_NAY = new Date("2026-08-14T00:00:00+07:00");
const ID_A = "11111111-1111-1111-1111-111111111111";
const ID_B = "22222222-2222-2222-2222-222222222222";

const right = (validationCode, editableFields = ["actual_protocol_date"], reason = "Được phân công") => ({
  validationCode,
  editableFields,
  reason,
});

test("tích lũy nhiều lý do và giữ dòng quá hạn ở đúng section", () => {
  const model = buildTodayActionModel([{
    id: "legacy-id", validationCode: "V-MULTI", st: "prog", state: "active",
    dlProtocol: "2026-08-01", ownerPersonId: null, score: 9,
  }], {
    now: HOM_NAY,
    rights: new Map([["V-MULTI", right("V-MULTI")]]),
    rightsStatus: "ready",
  });
  assert.equal(model.sections.overdue[0].validationCode, "V-MULTI");
  assert.deepEqual(model.sections.overdue[0].reasons.map((reason) => reason.kind), [
    "overdue", "missing_owner",
  ]);
  assert.equal(model.kpis.dataQuality, 1);
  assert.equal(model.sections.incomplete.length, 0);
});

test("tách hạn hôm nay khỏi hạn trong 7 ngày và tìm deadline sau blocking stage", () => {
  const model = buildTodayActionModel([
    {
      id: "V-LATER", validationCode: "V-LATER", st: "prog", state: "active",
      dlProtocol: null, dlValidation: "2026-08-14", ownerPersonId: ID_A,
    },
    {
      id: "V-7D", validationCode: "V-7D", st: "todo", state: "active",
      dlProtocol: "2026-08-21", ownerPersonId: ID_A,
    },
  ], {
    now: HOM_NAY,
    rights: new Map(),
    rightsStatus: "ready",
  });
  const today = model.sections.today[0];
  assert.equal(today.validationCode, "V-LATER");
  assert.equal(today.blockingStage, "Đề cương");
  assert.equal(today.deadlineStage, "Thẩm định");
  assert.equal(today.daysRemaining, 0);
  assert.deepEqual(today.reasons.map((reason) => reason.kind), ["due_today"]);
  assert.equal(model.sections.upcoming[0].validationCode, "V-7D");
  assert.equal(model.sections.upcoming[0].daysRemaining, 7);
  assert.deepEqual(model.sections.upcoming[0].reasons.map((reason) => reason.kind), ["due_7d"]);
});

test("việc active chưa có deadline vào incomplete với lý do missing_schedule", () => {
  const model = buildTodayActionModel([{
    id: "V-NOPLAN", validationCode: "V-NOPLAN", st: "prog", state: "active",
    ownerPersonId: ID_A,
  }], {
    now: HOM_NAY,
    rights: new Map(),
    rightsStatus: "ready",
  });
  assert.equal(model.sections.incomplete[0].validationCode, "V-NOPLAN");
  assert.equal(model.sections.incomplete[0].deadlineStage, null);
  assert.deepEqual(model.sections.incomplete[0].reasons.map((reason) => reason.kind), ["missing_schedule"]);
});

test("loại done đầy đủ, cancelled và not_applicable; done thiếu ngày hoàn thành vẫn hiện", () => {
  const model = buildTodayActionModel([
    { id: "DONE", validationCode: "DONE", st: "done", state: "active", actVmp: "2026-08-01", ownerPersonId: ID_A },
    { id: "DONE-MISS", validationCode: "DONE-MISS", st: "done", state: "active", actVmp: null, ownerPersonId: ID_A },
    { id: "CANCEL", validationCode: "CANCEL", st: "prog", state: "cancelled", dlProtocol: "2026-08-01", ownerPersonId: ID_A },
    { id: "NA", validationCode: "NA", st: "prog", state: "not_applicable", dlProtocol: "2026-08-01", ownerPersonId: ID_A },
  ], { now: HOM_NAY, rights: new Map(), rightsStatus: "ready" });
  assert.deepEqual(model.rows.map((row) => row.validationCode), ["DONE-MISS"]);
  assert.deepEqual(model.sections.incomplete[0].reasons.map((reason) => reason.kind), ["missing_actual_completion"]);
});

test("chỉ person id chính tắc quyết định ownership, kể cả id trong _raw", () => {
  const activity = {
    id: "V-OWNER", validationCode: "V-OWNER", st: "prog", state: "active",
    owner: "Nguyễn Văn A", ownerPersonId: ID_A, supportPersonId: ID_B,
  };
  assert.equal(isTodayActivityMine(activity, ID_A), true);
  assert.equal(isTodayActivityMine(activity, ID_B), false);
  assert.equal(isTodayActivityMine({ ...activity, ownerPersonId: null, _raw: { owner_person_id: ID_A } }, ID_A), true);
  assert.equal(isTodayActivityMine({ ...activity, ownerPersonId: null, _raw: { support_person_id: ID_A } }, ID_A), false);
  assert.equal(isTodayActivityMine({ ...activity, ownerPersonId: null }, ID_A), false);
});

test("tra quyền theo validationCode, không theo activity.id", () => {
  const model = buildTodayActionModel([{
    id: "legacy-id", validationCode: "V-CODE", st: "prog", state: "active",
    dlProtocol: "2026-08-14", ownerPersonId: ID_A,
  }], {
    now: HOM_NAY,
    rights: new Map([["V-CODE", right("V-CODE", ["actual_protocol_date", "status_protocol"], "QA quản lý")]]),
    rightsStatus: "ready",
  });
  assert.equal(model.rows[0].canEditProgress, true);
  assert.deepEqual(model.rows[0].editableFields, ["actual_protocol_date", "status_protocol"]);
  assert.equal(model.rows[0].permissionReason, "QA quản lý");
});

test("quyền loading hoặc error không làm lộ khả năng sửa", () => {
  for (const rightsStatus of ["loading", "error"]) {
    const model = buildTodayActionModel([{
      id: "V-R", validationCode: "V-R", st: "prog", state: "active", dlProtocol: "2026-08-14",
      ownerPersonId: ID_A,
    }], {
      now: HOM_NAY,
      rights: new Map([["V-R", right("V-R")]]),
      rightsStatus,
    });
    assert.equal(model.rows[0].canEditProgress, false);
    assert.deepEqual(model.rows[0].editableFields, []);
  }
});

test("ưu tiên theo urgency rồi score, editability, số ngày và mã tiếng Việt", () => {
  const rows = [
    { id: "B", validationCode: "B", st: "prog", state: "active", dlProtocol: "2026-08-14", score: 9, ownerPersonId: ID_A },
    { id: "A", validationCode: "A", st: "prog", state: "active", dlProtocol: "2026-08-14", score: 9, ownerPersonId: ID_A },
    { id: "C", validationCode: "C", st: "prog", state: "active", dlProtocol: "2026-08-14", score: 5, ownerPersonId: ID_A },
    { id: "LATE", validationCode: "LATE", st: "prog", state: "active", dlProtocol: "2026-08-15", score: 9, ownerPersonId: ID_A },
  ];
  const model = buildTodayActionModel(rows, {
    now: HOM_NAY,
    rights: new Map([["B", right("B")], ["A", right("A")]]),
    rightsStatus: "ready",
  });
  assert.deepEqual(model.rows.map((row) => row.validationCode), ["A", "B", "C", "LATE"]);
  assert.equal(model.nextAction?.validationCode, "A");
});

test("KPI và rows dùng cùng tập dữ liệu, nextAction là dòng đầu tiên đã sort", () => {
  const model = buildTodayActionModel([
    { id: "O", validationCode: "O", st: "prog", state: "active", dlProtocol: "2026-08-01", ownerPersonId: ID_A },
    { id: "T", validationCode: "T", st: "todo", state: "active", dlProtocol: "2026-08-14", ownerPersonId: ID_A },
    { id: "U", validationCode: "U", st: "todo", state: "active", dlProtocol: "2026-08-20", ownerPersonId: ID_A },
    { id: "I", validationCode: "I", st: "prog", state: "active", ownerPersonId: ID_A },
  ], { now: HOM_NAY, rights: new Map(), rightsStatus: "ready" });
  assert.equal(model.rows.length, 4);
  assert.deepEqual(model.kpis, { overdue: 1, today: 1, upcoming: 1, dataQuality: 1 });
  assert.equal(model.nextAction?.validationCode, "O");
});
