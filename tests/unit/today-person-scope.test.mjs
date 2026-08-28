import assert from "node:assert/strict";
import test from "node:test";

const {
  canUsePersonalTodayScope,
  defaultTodayPersonScope,
  presentTodayPersonScope,
} = await import("../../src/features/today/todayPersonScope.ts");

test("defaults Today person scope from QA staff role and linked person", () => {
  const cases = [
    ["qa_staff", "person-a", "mine"],
    ["qa_manager", "person-a", "team"],
    ["admin", "person-a", "team"],
    ["qa_staff", null, "team"],
    [null, "person-a", "team"],
  ];

  for (const [businessRole, currentPersonId, expected] of cases) {
    assert.equal(defaultTodayPersonScope(businessRole, currentPersonId), expected);
  }
});

test("recognizes a usable linked person ID", () => {
  assert.equal(canUsePersonalTodayScope(" person-a "), true);
  assert.equal(canUsePersonalTodayScope(""), false);
});

test("presents Today scope labels and unlinked-account warning", () => {
  assert.deepEqual(presentTodayPersonScope("mine", "person-a"), {
    heading: "Việc hôm nay của tôi", actionLabel: "Xem việc cả đội", warning: null,
  });
  assert.deepEqual(presentTodayPersonScope("team", null), {
    heading: "Việc hôm nay của cả đội",
    actionLabel: "Chỉ xem việc của tôi",
    warning: "Tài khoản chưa liên kết nhân sự; nhờ Admin nối hồ sơ.",
  });
});
