import test from "node:test";
import assert from "node:assert/strict";

import { resolveProgressDeepLink } from "../../src/features/progress/progressDeepLink.ts";

const RIGHT = {
  validationCode: "V-001",
  editableFields: ["status_report"],
  reason: "assigned",
};

test("resolves by canonical validationCode and preserves the full Today link", () => {
  const rights = new Map([
    ["legacy-id", { ...RIGHT, validationCode: "legacy-id" }],
    ["V-001", RIGHT],
  ]);
  const link = Object.freeze({
    validationCode: "V-001",
    source: "today",
    reasons: Object.freeze(["overdue", "missing_owner"]),
  });
  const originalRights = [...rights.entries()];

  assert.deepEqual(resolveProgressDeepLink(rights, link), {
    status: "allowed",
    validationCode: "V-001",
    source: "today",
    reasons: ["overdue", "missing_owner"],
  });
  assert.deepEqual(link, {
    validationCode: "V-001",
    source: "today",
    reasons: ["overdue", "missing_owner"],
  });
  assert.deepEqual([...rights.entries()], originalRights);
});

test("returns a non-sensitive revoked result when canonical rights are absent", () => {
  assert.deepEqual(resolveProgressDeepLink(new Map(), {
    validationCode: "V-001",
    source: "today",
    reasons: ["overdue"],
  }), {
    status: "revoked",
    validationCode: "V-001",
  });
});
