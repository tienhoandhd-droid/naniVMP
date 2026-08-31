import test from "node:test";
import assert from "node:assert/strict";

import {
  decodeSourceWorkshopCoverageResponse,
  decodeSourceWorkshopScopeChoicesResponse,
  normalizeWorkshopScopeDraft,
} from "../../src/features/sourceAccess/contracts.ts";
import {
  initialWorkshopCoverageState,
  applyOptimisticWorkshopScopeGrant,
  clearWorkshopScopeEditor,
  initialWorkshopScopeChoicesState,
  reduceWorkshopCoverage,
  reduceWorkshopScopeChoices,
  workshopMutationForbiddenTransition,
  workshopCoverageRequestIsCurrent,
} from "../../src/features/sourceAccess/workshopScopeModel.ts";
import { validateWorkshopScopeAction } from "../../src/features/sourceAccess/WorkshopScopeCoveragePanel.tsx";

const PERSON_A = "aaaaaaaa-1111-4111-8111-111111111111";
const GRANT_A = "bbbbbbbb-2222-4222-8222-222222222222";

const grant = {
  id: GRANT_A,
  performer_id: PERSON_A,
  department: "Xưởng A",
  department_key: "xưởng a",
  area_code: "KV-01",
  area_key: "kv-01",
  line: null,
  line_key: null,
  valid_from: "2026-08-28T00:00:00.000Z",
  expires_at: null,
  is_active: true,
  version: 1,
  created_at: "2026-08-28T00:00:00.000Z",
  created_by: null,
  updated_at: "2026-08-28T00:00:00.000Z",
  updated_by: null,
  change_reason: "Phủ toàn khu vực",
};

const coveragePage = {
  ok: true,
  rows: [{
    person_id: PERSON_A,
    performer_name: "Nhân sự Xưởng A",
    normalized_full_name: "nhân sự xưởng a",
    email: "workshop-a@example.test",
    department: "Xưởng A",
    role_name: "workshop_staff",
    grants: [grant],
  }, {
    person_id: "cccccccc-3333-4333-8333-333333333333",
    performer_name: "Nhân sự chưa có phạm vi",
    normalized_full_name: "nhân sự chưa có phạm vi",
    email: null,
    department: "Xưởng B",
    role_name: "workshop_manager",
    grants: [],
  }],
  authorized_total: 2,
  next_cursor: { normalized_full_name: "nhân sự xưởng a", person_id: PERSON_A },
};

test("coverage decoder preserves an active workshop person with zero grants instead of treating it as empty", () => {
  const result = decodeSourceWorkshopCoverageResponse(coveragePage);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[1].grants.length, 0);
  assert.equal(result.rows[0].grants[0].line, null);
  assert.equal(result.nextCursor?.personId, PERSON_A);
});

test("coverage decoder keeps RPC failure distinct from a successful empty page", () => {
  const empty = decodeSourceWorkshopCoverageResponse({
    ok: true, rows: [], authorized_total: 0, next_cursor: null,
  });
  assert.equal(empty.ok, true);
  if (empty.ok) assert.deepEqual(empty.rows, []);

  assert.deepEqual(
    decodeSourceWorkshopCoverageResponse({ ok: false, error_code: "FORBIDDEN", error: "Không có quyền" }),
    { ok: false, errorCode: "FORBIDDEN", error: "Không có quyền" },
  );
});

test("scope choices preserve a blank line as the area-wide option and reject malformed tuples", () => {
  const choices = decodeSourceWorkshopScopeChoicesResponse({
    ok: true,
    rows: [
      { department: "Xưởng A", area_code: "KV-01", line: null },
      { department: "Xưởng A", area_code: "KV-01", line: "Dây 2" },
    ],
    next_cursor: null,
  });
  assert.equal(choices.ok, true);
  if (choices.ok) assert.equal(choices.rows[0].line, null);
  assert.throws(
    () => decodeSourceWorkshopScopeChoicesResponse({
      ok: true, rows: [{ department: "Xưởng A", area_code: "", line: null }], next_cursor: null,
    }),
    /area_code/i,
  );
});

test("coverage and scope-choice decoders fail closed when Source returns a blank non-null line", () => {
  assert.throws(
    () => decodeSourceWorkshopCoverageResponse({
      ...coveragePage,
      rows: [{ ...coveragePage.rows[0], grants: [{ ...grant, line: " ", line_key: " " }] }],
    }),
    /line/i,
  );
  assert.throws(
    () => decodeSourceWorkshopScopeChoicesResponse({
      ok: true, rows: [{ department: "Xưởng A", area_code: "KV-01", line: "  " }], next_cursor: null,
    }),
    /line/i,
  );
  assert.throws(
    () => decodeSourceWorkshopScopeChoicesResponse({
      ok: true, rows: [], next_cursor: { department: "Xưởng A", area_code: "KV-01", line: " " },
    }),
    /line/i,
  );
});

test("draft normalizer requires a reason and maps a blank line to area-wide coverage", () => {
  assert.deepEqual(
    normalizeWorkshopScopeDraft({
      department: " Xưởng A ", areaCode: " KV-01 ", line: "   ", reason: " Phân công mới ",
    }),
    { department: "Xưởng A", areaCode: "KV-01", line: null, reason: "Phân công mới" },
  );
  assert.throws(
    () => normalizeWorkshopScopeDraft({ department: "Xưởng A", areaCode: "KV-01", line: "", reason: " " }),
    /lý do/i,
  );
});

test("nút lưu phạm vi chỉ đúng lựa chọn đầu tiên còn thiếu thay vì bị khóa im lặng", () => {
  assert.deepEqual(validateWorkshopScopeAction({
    choicesStatus: "ready", department: "", areaCode: "", reason: "",
  }), { code: "department", message: "Chọn bộ phận Source.", focusId: "workshop-scope-department" });
  assert.deepEqual(validateWorkshopScopeAction({
    choicesStatus: "ready", department: "Xưởng A", areaCode: "", reason: "",
  }), { code: "area", message: "Chọn khu vực Source.", focusId: "workshop-scope-area" });
  assert.deepEqual(validateWorkshopScopeAction({
    choicesStatus: "ready", department: "Xưởng A", areaCode: "KV-01", reason: "",
  }), { code: "reason", message: "Nhập lý do thay đổi.", focusId: "workshop-scope-reason" });
  assert.equal(validateWorkshopScopeAction({
    choicesStatus: "ready", department: "Xưởng A", areaCode: "KV-01", reason: "Cấp theo hồ sơ",
  }), null);
});

test("coverage reducer fences an older page response after a newer retry begins", () => {
  const initial = initialWorkshopCoverageState();
  const first = reduceWorkshopCoverage(initial, { type: "start", requestId: 1, search: "a", append: false });
  const retry = reduceWorkshopCoverage(first, { type: "start", requestId: 2, search: "a", append: false });
  const stale = reduceWorkshopCoverage(retry, {
    type: "resolve", requestId: 1, append: false, result: decodeSourceWorkshopCoverageResponse(coveragePage),
  });

  assert.equal(stale.status, "loading");
  assert.equal(stale.rows.length, 0);
  assert.equal(workshopCoverageRequestIsCurrent({ generation: 2 }, { generation: 1 }), false);
});

test("optimistic revoke changes only the targeted grant until the authoritative refresh resolves", () => {
  const page = decodeSourceWorkshopCoverageResponse(coveragePage);
  assert.equal(page.ok, true);
  if (!page.ok) return;

  const next = applyOptimisticWorkshopScopeGrant(page.rows, {
    personId: PERSON_A,
    grant: { ...page.rows[0].grants[0], isActive: false, version: 2, changeReason: "Thu hồi" },
  });

  assert.equal(next[0].grants[0].isActive, false);
  assert.equal(next[0].grants[0].version, 2);
  assert.equal(next[1].grants.length, 0);
});

test("a denied load-more clears retained workshop coverage rather than exposing stale grants", () => {
  const page = decodeSourceWorkshopCoverageResponse(coveragePage);
  assert.equal(page.ok, true);
  if (!page.ok) return;
  const ready = reduceWorkshopCoverage(initialWorkshopCoverageState(), {
    type: "resolve", requestId: 0, append: false, result: page,
  });
  const loadingMore = reduceWorkshopCoverage(ready, { type: "start", requestId: 1, search: "", append: true });
  const denied = reduceWorkshopCoverage(loadingMore, {
    type: "resolve", requestId: 1, append: true,
    result: { ok: false, errorCode: "FORBIDDEN", error: "Quyền đã bị thu hồi" },
  });

  assert.equal(denied.status, "error");
  assert.equal(denied.rows.length, 0);
  assert.equal(denied.authorizedTotal, 0);
  assert.equal(denied.nextCursor, null);
});

test("a denied scope-choice response clears cached tuples while retaining the structured error", () => {
  const loading = reduceWorkshopScopeChoices(initialWorkshopScopeChoicesState(), { type: "start", requestId: 1, append: false });
  const ready = reduceWorkshopScopeChoices(loading, {
    type: "resolve", requestId: 1, append: false,
    result: decodeSourceWorkshopScopeChoicesResponse({
      ok: true, rows: [{ department: "Xưởng A", area_code: "KV-01", line: null }], next_cursor: null,
    }),
  });
  const loadingRetry = reduceWorkshopScopeChoices(ready, { type: "start", requestId: 2, append: false });
  const denied = reduceWorkshopScopeChoices(loadingRetry, {
    type: "resolve", requestId: 2, append: false,
    result: { ok: false, errorCode: "FORBIDDEN", error: "Quyền đã bị thu hồi" },
  });

  assert.equal(denied.rows.length, 0);
  assert.equal(denied.nextCursor, null);
  assert.deepEqual(denied.error, { errorCode: "FORBIDDEN", error: "Quyền đã bị thu hồi" });
});

test("editor reset never carries a prior reason into another person or a retry after unsafe failure", () => {
  assert.deepEqual(
    clearWorkshopScopeEditor({ editingGrantId: GRANT_A, department: "Xưởng A", areaCode: "KV-01", line: "Dây 2", reason: "Lý do cũ" }),
    { editingGrantId: null, department: "", areaCode: "", line: "", reason: "" },
  );
});

test("a mutation FORBIDDEN transition clears all cached protected coverage before any refresh", () => {
  const coverage = reduceWorkshopCoverage(initialWorkshopCoverageState(), {
    type: "resolve", requestId: 0, append: false, result: decodeSourceWorkshopCoverageResponse(coveragePage),
  });
  const choices = reduceWorkshopScopeChoices(
    reduceWorkshopScopeChoices(initialWorkshopScopeChoicesState(), { type: "start", requestId: 1, append: false }),
    {
      type: "resolve", requestId: 1, append: false,
      result: decodeSourceWorkshopScopeChoicesResponse({
        ok: true, rows: [{ department: "Xưởng A", area_code: "KV-01", line: null }], next_cursor: null,
      }),
    },
  );
  const next = workshopMutationForbiddenTransition({
    coverage, choices, selectedPersonId: PERSON_A,
    editor: { editingGrantId: GRANT_A, department: "Xưởng A", areaCode: "KV-01", line: "Dây 2", reason: "Lý do cũ" },
    error: "Quyền đã bị thu hồi",
  });

  assert.equal(next.coverage.rows.length, 0);
  assert.equal(next.coverage.authorizedTotal, 0);
  assert.equal(next.coverage.nextCursor, null);
  assert.equal(next.choices.rows.length, 0);
  assert.equal(next.choices.nextCursor, null);
  assert.equal(next.selectedPersonId, null);
  assert.equal(next.editor.reason, "");
});
