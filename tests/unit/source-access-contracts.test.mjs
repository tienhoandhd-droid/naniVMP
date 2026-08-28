import test from "node:test";
import assert from "node:assert/strict";

import {
  decodeSourceQaCandidatesResponse,
  decodeSourceObjectListResponse,
  decodeWorkshopScopeGrantResponse,
} from "../../src/features/sourceAccess/contracts.ts";

const PERSON_A = "aaaaaaaa-1111-4111-8111-111111111111";
const PERSON_B = "bbbbbbbb-2222-4222-8222-222222222222";

const candidate = {
  person_id: PERSON_A,
  performer_name: "QA A",
  normalized_full_name: "qa a",
  email: "qa-a@example.test",
  department: "QA",
  role_name: "qa_staff",
};

const SOURCE_ID = "cccccccc-3333-4333-8333-333333333333";
const sourceListRow = {
  id: SOURCE_ID,
  object_kind: "Thiết bị",
  object_code: "TB-001",
  source_tab: "Nguồn",
  source_row: 1,
  extra: { imported: true },
  created_at: "2026-08-28T00:00:00.000Z",
  updated_at: "2026-08-28T00:00:00.000Z",
  is_active: true,
  edited_on_web: false,
  criticality_source: "auto",
  version: 1,
  timeline_revision: 0,
  timeline_applied_revision: 0,
  object_name: null,
  department: null,
  area_code: null,
  line: null,
  status: null,
  show_flag: null,
  validate_flag: null,
  validate_reason: null,
  report_class: null,
  critical_point: null,
  note: null,
  owner_name: null,
  support_name: null,
  work_group: null,
  frequency_months: null,
  workdays: null,
  first_month: null,
  year_ref: null,
  complexity_score: null,
  quality_impact_score: null,
  criticality_score: null,
  updated_by: null,
  owner_person_id: null,
  support_person_id: null,
};

test("candidate contract decodes an authorized page and an ineligible current selection", () => {
  const result = decodeSourceQaCandidatesResponse({
    ok: true,
    rows: [candidate],
    included_current: [{
      person_id: PERSON_B,
      performer_name: "Former QA",
      normalized_full_name: "former qa",
      email: null,
      department: "QA",
      eligible: false,
      ineligibility_reason: "ACCOUNT_DISABLED",
    }],
    authorized_total: 1,
    next_cursor: { normalized_full_name: "qa a", person_id: PERSON_A },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.rows, [{
    personId: PERSON_A,
    fullName: "QA A",
    normalizedFullName: "qa a",
    email: "qa-a@example.test",
    department: "QA",
    roleName: "qa_staff",
  }]);
  assert.equal(result.includedCurrent[0].ineligibilityReason, "ACCOUNT_DISABLED");
  assert.equal(result.nextCursor?.personId, PERSON_A);
});

test("candidate contract keeps an RPC failure distinct from successful zero rows", () => {
  const empty = decodeSourceQaCandidatesResponse({
    ok: true, rows: [], included_current: [], authorized_total: 0, next_cursor: null,
  });
  assert.equal(empty.ok, true);
  if (empty.ok) assert.equal(empty.rows.length, 0);

  const failure = decodeSourceQaCandidatesResponse({
    ok: false, error_code: "FORBIDDEN", error: "Không có quyền",
  });
  assert.deepEqual(failure, { ok: false, errorCode: "FORBIDDEN", error: "Không có quyền" });
});

test("Source list contract accepts only the locked 38-field wire shape", () => {
  const decoded = decodeSourceObjectListResponse({
    ok: true,
    rows: [sourceListRow],
    authorized_total: 1,
    next_cursor: { object_code: "TB-001", id: SOURCE_ID },
  });
  assert.equal(decoded.ok, true);
  if (!decoded.ok) return;
  assert.equal(decoded.rows[0].objectKind, "Thiết bị");
  assert.equal(decoded.rows[0].extra.imported, true);
  assert.equal(decoded.nextCursor?.id, SOURCE_ID);
});

test("Source list and workshop grant contracts fail closed on malformed fields", () => {
  assert.throws(
    () => decodeSourceObjectListResponse({ ok: true, rows: "not-an-array", next_cursor: null }),
    /Source list response/i,
  );
  assert.throws(
    () => decodeSourceObjectListResponse({
      ok: true, rows: [{ ...sourceListRow, object_kind: "Tự nghĩ" }], authorized_total: 1, next_cursor: null,
    }),
    /object_kind/i,
  );
  assert.throws(
    () => decodeSourceObjectListResponse({
      ok: true, rows: [{ ...sourceListRow, unreviewed: true }], authorized_total: 1, next_cursor: null,
    }),
    /exactly 38/i,
  );
  assert.deepEqual(
    decodeSourceObjectListResponse({ ok: false, error_code: "CURSOR_EXPIRED", error: "Hết hạn" }),
    { ok: false, errorCode: "CURSOR_EXPIRED", error: "Hết hạn" },
  );
  assert.throws(
    () => decodeSourceObjectListResponse({ ok: false, error_code: "FORBIDDEN", error: "Sai hợp đồng" }),
    /error_code/i,
  );
  assert.throws(
    () => decodeSourceQaCandidatesResponse({
      ok: true, rows: [candidate], included_current: [], authorized_total: "1", next_cursor: null,
    }),
    /authorized_total/i,
  );
  assert.deepEqual(
    decodeWorkshopScopeGrantResponse({ ok: true, grant_id: SOURCE_ID, version: 1, is_active: true }),
    { ok: true, grantId: SOURCE_ID, version: 1, isActive: true },
  );
  assert.throws(() => decodeWorkshopScopeGrantResponse({
    ok: true, grant_id: SOURCE_ID, version: 0, is_active: true,
  }), /version/i);
  assert.deepEqual(
    decodeWorkshopScopeGrantResponse({
      ok: false, error_code: "VERSION_CONFLICT", error: "Xung đột", current_version: 2,
    }),
    { ok: false, errorCode: "VERSION_CONFLICT", error: "Xung đột", currentVersion: 2 },
  );
  assert.deepEqual(
    decodeWorkshopScopeGrantResponse({ ok: false, error_code: "VERSION_CONFLICT", error: "Xung đột" }),
    { ok: false, errorCode: "VERSION_CONFLICT", error: "Xung đột" },
  );
});
