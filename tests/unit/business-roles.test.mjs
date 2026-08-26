import test from "node:test";
import assert from "node:assert/strict";

test("catalog chỉ có đúng năm vai nghiệp vụ", async () => {
  const { BUSINESS_ROLE_IDS, BUSINESS_ROLE_CATALOG } = await import("../../src/lib/businessRoles.ts");
  assert.deepEqual(BUSINESS_ROLE_IDS, [
    "admin", "qa_manager", "qa_staff", "workshop_manager", "workshop_staff",
  ]);
  assert.equal(Object.values(BUSINESS_ROLE_CATALOG).some((role) => role.id === "viewer"), false);
  assert.equal(BUSINESS_ROLE_CATALOG.qa_staff.label, "Nhân viên QA");
  assert.equal(BUSINESS_ROLE_CATALOG.workshop_staff.scopeMode, "hierarchy");
});
