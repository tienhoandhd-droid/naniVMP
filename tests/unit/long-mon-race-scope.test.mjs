import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canChooseLongMonAudience,
  filterLongMonScopeActivities,
  resolveLongMonAudience,
} from "../../src/features/monitoring/longMonRaceScope.ts";

function activity(id, ownerPersonId, supportPersonId = null, ownerName = "QA trùng tên") {
  return {
    id,
    code: id.toUpperCase(),
    obj: id,
    type: "PQ",
    st: "prog",
    state: "active",
    owner_name: ownerName,
    ownerPersonId,
    supportPersonId,
    _raw: {
      owner_person_id: ownerPersonId,
      support_person_id: supportPersonId,
      owner_name: ownerName,
    },
  };
}

const activities = [
  activity("owner-a", "qa-a"),
  activity("support-a", "qa-b", "qa-a"),
  activity("owner-b", "qa-b"),
  activity("same-name-not-a", "qa-c", null, "QA trùng tên"),
];

test("chỉ Admin và Quản lý QA được chuyển Cả nhóm/Cá nhân", () => {
  assert.equal(canChooseLongMonAudience("admin"), true);
  assert.equal(canChooseLongMonAudience("qa_manager"), true);
  assert.equal(canChooseLongMonAudience("qa_staff"), false);
  assert.equal(canChooseLongMonAudience("workshop_manager"), false);
});

test("Nhân viên QA luôn bị khóa về phạm vi cá nhân", () => {
  assert.equal(resolveLongMonAudience("qa_staff", "team"), "personal");
  assert.equal(resolveLongMonAudience("qa_staff", "personal"), "personal");
  assert.equal(resolveLongMonAudience("qa_manager", "team"), "team");
  assert.equal(resolveLongMonAudience("admin", "personal"), "personal");
});

test("Nhân viên QA chỉ nhận hạng mục phụ trách chính hoặc hỗ trợ theo person ID", () => {
  const visible = filterLongMonScopeActivities({
    activities,
    businessRole: "qa_staff",
    currentPersonId: "qa-a",
    audience: "team",
    selectedPersonId: "qa-b",
  });

  assert.deepEqual(visible.map((item) => item.id), ["owner-a", "support-a"]);
});

test("QA thiếu liên kết nhân sự fail-closed và không rơi về cả nhóm", () => {
  assert.deepEqual(filterLongMonScopeActivities({
    activities,
    businessRole: "qa_staff",
    currentPersonId: null,
    audience: "team",
    selectedPersonId: null,
  }), []);
});

test("Quản lý xem cả nhóm hoặc chọn đúng một cá nhân; không lọc bằng tên", () => {
  assert.equal(filterLongMonScopeActivities({
    activities,
    businessRole: "qa_manager",
    currentPersonId: "manager",
    audience: "team",
    selectedPersonId: null,
  }).length, 4);

  assert.deepEqual(filterLongMonScopeActivities({
    activities,
    businessRole: "qa_manager",
    currentPersonId: "manager",
    audience: "personal",
    selectedPersonId: "qa-a",
  }).map((item) => item.id), ["owner-a", "support-a"]);
});

test("vai trò khác giữ nguyên tập dữ liệu server đã cấp", () => {
  assert.equal(filterLongMonScopeActivities({
    activities,
    businessRole: "workshop_staff",
    currentPersonId: null,
    audience: "personal",
    selectedPersonId: "qa-a",
  }).length, activities.length);
});
