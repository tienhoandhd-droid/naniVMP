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

test("source list and workshop grant contracts fail closed on malformed payloads", () => {
  assert.throws(
    () => decodeSourceObjectListResponse({ ok: true, rows: "not-an-array", next_cursor: null }),
    /Source list response/i,
  );
  assert.throws(
    () => decodeSourceQaCandidatesResponse({
      ok: true, rows: [candidate], included_current: [], authorized_total: "1", next_cursor: null,
    }),
    /authorized_total/i,
  );
  assert.throws(
    () => decodeWorkshopScopeGrantResponse({ ok: true, grant: { id: "not-a-uuid" } }),
    /Workshop scope grant response/i,
  );
});
