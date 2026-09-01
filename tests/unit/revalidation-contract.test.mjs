import test from "node:test";
import assert from "node:assert/strict";

import {
  decodeRevalidationDecisionResult,
  decodeRevalidationProposals,
  validateRevalidationDecision,
} from "../../src/features/revalidation/contracts.ts";
import { decideRevalidationViaRpc } from "../../src/features/revalidation/api.ts";

const proposal = {
  id: "11111111-1111-4111-8111-111111111111",
  plan_item_id: "rv-item-12",
  validation_code: "RV-12/2024.01-PQ",
  object_code: "RV-12",
  validation_type: "PQ",
  actual_completed_date: "2024-02-29",
  frequency_months: 12,
  due_date: "2025-02-28",
  status: "pending",
  version: 3,
  created_plan_validation_code: null,
  decision_reason: null,
  decided_at: null,
  created_at: "2026-09-01T01:00:00.000Z",
  updated_at: "2026-09-01T01:00:00.000Z",
};

test("decoder proposal exact map đúng snake_case sang camelCase", () => {
  assert.deepEqual(decodeRevalidationProposals([proposal]), [{
    id: proposal.id,
    planItemId: "rv-item-12",
    validationCode: "RV-12/2024.01-PQ",
    objectCode: "RV-12",
    validationType: "PQ",
    actualCompletedDate: "2024-02-29",
    frequencyMonths: 12,
    dueDate: "2025-02-28",
    status: "pending",
    version: 3,
    createdPlanValidationCode: null,
    decisionReason: null,
    decidedAt: null,
    createdAt: "2026-09-01T01:00:00.000Z",
    updatedAt: "2026-09-01T01:00:00.000Z",
  }]);
});

test("decoder từ chối extra key, UUID/date/status/version sai", () => {
  assert.throws(() => decodeRevalidationProposals([{ ...proposal, email: "leak" }]), /exact/i);
  assert.throws(() => decodeRevalidationProposals([{ ...proposal, id: "not-uuid" }]), /id/i);
  assert.throws(() => decodeRevalidationProposals([{ ...proposal, due_date: "28\/02\/2025" }]), /due_date/i);
  assert.throws(() => decodeRevalidationProposals([{ ...proposal, status: "approved" }]), /status/i);
  assert.throws(() => decodeRevalidationProposals([{ ...proposal, version: 0 }]), /version/i);
});

test("decision bắt reason đã trim tối thiểu 5 ký tự và expectedVersion dương", () => {
  assert.deepEqual(validateRevalidationDecision({
    proposalId: proposal.id,
    reason: "  Đủ hồ sơ chu kỳ  ",
    expectedVersion: 3,
  }), {
    proposalId: proposal.id,
    reason: "Đủ hồ sơ chu kỳ",
    expectedVersion: 3,
  });
  for (const reason of ["", "   ", "abcd"] ) {
    assert.throws(() => validateRevalidationDecision({
      proposalId: proposal.id, reason, expectedVersion: 3,
    }), /lý do/i);
  }
  assert.throws(() => validateRevalidationDecision({
    proposalId: proposal.id, reason: "Đủ lý do", expectedVersion: 1.5,
  }), /version/i);
});

test("conflict giữ current_version để UI tải lại đúng dòng", () => {
  assert.deepEqual(decodeRevalidationDecisionResult({
    ok: false,
    error_code: "VERSION_CONFLICT",
    current_version: 4,
  }), {
    ok: false,
    errorCode: "VERSION_CONFLICT",
    currentVersion: 4,
  });
});

test("API quyết định chỉ gửi đúng proposal, reason đã trim và version", async () => {
  const calls = [];
  const result = await decideRevalidationViaRpc(async (name, args) => {
    calls.push({ name, args });
    return {
      data: { ok: true, proposal_id: proposal.id, validation_code: "RV-12/2025.01-PQ", version: 4 },
      error: null,
    };
  }, "confirm", {
    proposalId: proposal.id,
    reason: "  Đã đối chiếu hồ sơ  ",
    expectedVersion: 3,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(calls, [{
    name: "rpc_confirm_revalidation_proposal",
    args: {
      p_proposal_id: proposal.id,
      p_reason: "Đã đối chiếu hồ sơ",
      p_expected_version: 3,
    },
  }]);
});
