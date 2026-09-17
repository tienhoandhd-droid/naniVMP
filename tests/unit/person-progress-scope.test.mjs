import assert from "node:assert/strict";
import test from "node:test";

const {
  buildPersonProgressChoices,
  canSelectPersonProgressScope,
} = await import("../../src/lib/personProgressScope.ts");
const { filterTodayScope } = await import("../../src/features/today/todayScope.ts");

test("only Admin and QA Manager can select another person's progress", () => {
  assert.equal(canSelectPersonProgressScope("admin"), true);
  assert.equal(canSelectPersonProgressScope("qa_manager"), true);
  assert.equal(canSelectPersonProgressScope("qa_staff"), false);
  assert.equal(canSelectPersonProgressScope("workshop_manager"), false);
  assert.equal(canSelectPersonProgressScope("workshop_staff"), false);
  assert.equal(canSelectPersonProgressScope(null), false);
});

test("builds canonical owner and support choices without merging duplicate names", () => {
  const activities = [{
    id: "item-1",
    owner: "Nguyễn QA",
    support: "Trần QA",
    _raw: {
      owner_person_id: "11111111-1111-4111-8111-111111111111",
      support_person_id: "22222222-2222-4222-8222-222222222222",
      support_name: "Nguyễn QA",
    },
  }, {
    id: "item-2",
    owner_name: "Nguyễn QA",
    ownerPersonId: "33333333-3333-4333-8333-333333333333",
    supportPersonId: "22222222-2222-4222-8222-222222222222",
    support: "Trần QA",
  }, {
    id: "cancelled-item",
    state: "cancelled",
    owner: "Người đã ngừng",
    ownerPersonId: "44444444-4444-4444-8444-444444444444",
  }];

  assert.deepEqual(buildPersonProgressChoices(activities), [
    {
      personId: "11111111-1111-4111-8111-111111111111",
      fullName: "Nguyễn QA",
      label: "Nguyễn QA · ID …11111111",
    },
    {
      personId: "33333333-3333-4333-8333-333333333333",
      fullName: "Nguyễn QA",
      label: "Nguyễn QA · ID …33333333",
    },
    {
      personId: "22222222-2222-4222-8222-222222222222",
      fullName: "Trần QA",
      label: "Trần QA · ID …22222222",
    },
  ]);
});

test("personal scope keeps canonical matches regardless of the remembered target period", () => {
  const personId = "11111111-1111-4111-8111-111111111111";
  const activity = {
    id: "overdue-vmp", ownerPersonId: personId, supportPersonId: null,
    area: "QA", dept: "qa", target: "2026-01-15", state: "active",
  };
  assert.deepEqual(filterTodayScope([activity], {
    areas: ["QA"], departments: ["qa"], onlyMine: true, currentPersonId: personId,
  }), [activity]);
});

test("workshop manager overview uses authorized globally filtered items, not QA ownership", async () => {
  const { selectOverviewActivities } = await import("../../src/lib/personProgressScope.ts");
  const first = { id: "xsx-1", ownerPersonId: "qa-person", area: "C1" };
  const second = { id: "xsx-2", ownerPersonId: "other-qa", area: "C2" };
  assert.deepEqual(selectOverviewActivities("workshop_manager", "mai", null, [first], [first, second]), [first]);
});

test("overview preserves QA personal scope and privileged optional selection", async () => {
  const { selectOverviewActivities } = await import("../../src/lib/personProgressScope.ts");
  const mine = { id: "mine", ownerPersonId: "qa-person" };
  const other = { id: "other", ownerPersonId: "other-qa" };
  assert.deepEqual(selectOverviewActivities("qa_staff", "qa-person", null, [], [mine, other]), [mine]);
  assert.deepEqual(selectOverviewActivities("qa_staff", null, null, [other], [other]), []);
  assert.deepEqual(selectOverviewActivities("qa_manager", "manager", null, [other], [mine, other]), [other]);
  assert.deepEqual(selectOverviewActivities("admin", "admin", "qa-person", [], [mine, other]), [mine]);
  assert.deepEqual(selectOverviewActivities("workshop_staff", "mai", null, [other], [other]), []);
});
