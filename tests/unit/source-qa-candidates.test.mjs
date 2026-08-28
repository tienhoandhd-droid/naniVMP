import test from "node:test";
import assert from "node:assert/strict";

import { initialSourceQaCandidatesState, reduceSourceQaCandidates } from "../../src/features/sourceAccess/sourceAccessModel.ts";

const PERSON_A = "aaaaaaaa-1111-4111-8111-111111111111";
const PERSON_B = "bbbbbbbb-2222-4222-8222-222222222222";

const row = (personId, name) => ({
  personId, fullName: name, normalizedFullName: name.toLowerCase(),
  email: null, department: "QA", roleName: "qa_staff",
});

const successfulPage = (rows, cursor = null) => ({
  ok: true,
  rows,
  includedCurrent: [],
  authorizedTotal: rows.length,
  nextCursor: cursor,
});

test("candidate model starts idle, becomes loading, then preserves successful zero rows", () => {
  let state = initialSourceQaCandidatesState([]);
  assert.equal(state.status, "idle");
  state = reduceSourceQaCandidates(state, { type: "start", requestId: 1, search: "missing", append: false });
  assert.equal(state.status, "loading");
  state = reduceSourceQaCandidates(state, {
    type: "resolve", requestId: 1, result: successfulPage([]), append: false,
  });
  assert.equal(state.status, "ready");
  assert.deepEqual(state.rows, []);
  assert.equal(state.error, null);
});

test("candidate model suppresses a stale response and appends only the current cursor page", () => {
  let state = initialSourceQaCandidatesState([]);
  state = reduceSourceQaCandidates(state, { type: "start", requestId: 1, search: "a", append: false });
  state = reduceSourceQaCandidates(state, { type: "start", requestId: 2, search: "ab", append: false });
  state = reduceSourceQaCandidates(state, {
    type: "resolve", requestId: 1, result: successfulPage([row(PERSON_A, "Old")]), append: false,
  });
  assert.equal(state.status, "loading");
  assert.deepEqual(state.rows, []);
  state = reduceSourceQaCandidates(state, {
    type: "resolve", requestId: 2,
    result: successfulPage([row(PERSON_A, "New")], { normalizedFullName: "new", personId: PERSON_A }),
    append: false,
  });
  state = reduceSourceQaCandidates(state, { type: "start", requestId: 3, search: "ab", append: true });
  state = reduceSourceQaCandidates(state, {
    type: "resolve", requestId: 3, result: successfulPage([row(PERSON_B, "Next")]), append: true,
  });
  assert.deepEqual(state.rows.map((person) => person.personId), [PERSON_A, PERSON_B]);
});

test("candidate model keeps an ineligible current person visible and exposes errors for Retry", () => {
  let state = initialSourceQaCandidatesState([PERSON_B]);
  state = reduceSourceQaCandidates(state, { type: "start", requestId: 1, search: "", append: false });
  state = reduceSourceQaCandidates(state, {
    type: "resolve",
    requestId: 1,
    append: false,
    result: {
      ok: true,
      rows: [row(PERSON_A, "Eligible")],
      includedCurrent: [{
        ...row(PERSON_B, "Disabled"), eligible: false, ineligibilityReason: "ACCOUNT_DISABLED",
      }],
      authorizedTotal: 1,
      nextCursor: null,
    },
  });
  assert.equal(state.status, "ready");
  assert.equal(state.includedCurrent[0].eligible, false);
  state = reduceSourceQaCandidates(state, { type: "start", requestId: 2, search: "", append: false });
  state = reduceSourceQaCandidates(state, {
    type: "resolve", requestId: 2, append: false,
    result: { ok: false, errorCode: "FORBIDDEN", error: "Không có quyền" },
  });
  assert.equal(state.status, "error");
  assert.equal(state.error?.errorCode, "FORBIDDEN");
});
