import assert from "node:assert/strict";
import test from "node:test";

const { filterTodayScope } = await import("../../src/features/today/todayScope.ts");

const rows = [
  {
    validationCode: "OWNED",
    area: "Khu QA",
    depts: ["qa"],
    owner: "Tên trùng", // Display names are deliberately non-authoritative.
    ownerPersonId: "person-a",
    _raw: { owner_person_id: "person-a" },
  },
  {
    validationCode: "SUPPORTED",
    area: "Khu QA",
    dept: "qa",
    owner: "Một người khác",
    support: "Tên cũ không khớp",
    _raw: { owner_person_id: "person-other", support_person_id: "person-a" },
  },
  {
    validationCode: "OTHER",
    area: "Khu Xưởng",
    depts: ["xsx"],
    owner: "Tên trùng",
    ownerPersonId: "person-other",
    _raw: { owner_person_id: "person-other" },
  },
  {
    validationCode: "NO-TARGET",
    area: "Khu QA",
    depts: ["qa"],
    owner: "Không có mốc",
    ownerPersonId: "person-other",
    _raw: { owner_person_id: "person-other" },
  },
];

test("scopes personal Today work by canonical owner and support IDs", () => {
  assert.deepEqual(filterTodayScope(rows, {
    areas: [], departments: [], onlyMine: true, currentPersonId: "person-a",
  }).map((row) => row.validationCode), ["OWNED", "SUPPORTED"]);
});

test("keeps unrelated Today rows in team scope", () => {
  assert.deepEqual(filterTodayScope(rows, {
    areas: [], departments: [], onlyMine: false, currentPersonId: null,
  }).map((row) => row.validationCode), ["OWNED", "SUPPORTED", "OTHER", "NO-TARGET"]);
});

test("preserves shell area and department semantics without mutating input", () => {
  const before = structuredClone(rows);

  assert.deepEqual(filterTodayScope(rows, {
    areas: ["Khu QA"], departments: ["qa"], onlyMine: false, currentPersonId: null,
  }).map((row) => row.validationCode), ["OWNED", "SUPPORTED", "NO-TARGET"]);
  assert.deepEqual(rows, before);
});
