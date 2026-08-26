import test from "node:test";
import assert from "node:assert/strict";
import { access } from "node:fs/promises";

const PAGE_ONLY_FILES = [
  "../../src/pages/OperationalPeoplePage.tsx",
  "../../src/features/operationalPeople/OperationalPeopleWorkspace.tsx",
  "../../src/features/operationalPeople/operational-people.css",
];

test("ba asset chỉ thuộc page Nhân sự đã bị xoá khỏi frontend", async () => {
  for (const path of PAGE_ONLY_FILES) {
    await assert.rejects(
      () => access(new URL(path, import.meta.url)),
      { code: "ENOENT" },
      `${path} phải không còn tồn tại`,
    );
  }
});
