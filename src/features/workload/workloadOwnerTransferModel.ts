import type { BusinessRole } from "../../lib/access.ts";

export interface WorkloadOwnerTransferInput {
  validationCode: string;
  currentPersonId: string | null;
  nextPersonId: string;
  currentName: string;
  nextName: string;
  reason: string;
}

export interface PreparedWorkloadOwnerTransfer {
  validationCode: string;
  personId: string;
  reason: string;
}

export type WorkloadOwnerTransferResult =
  | { ok: false; error: string }
  | {
    ok: true;
    input: PreparedWorkloadOwnerTransfer;
    confirmation: string;
  };

export function canTransferWorkloadOwner(role: BusinessRole | null): boolean {
  return role === "admin" || role === "qa_manager";
}

export function prepareWorkloadOwnerTransfer(
  input: WorkloadOwnerTransferInput,
): WorkloadOwnerTransferResult {
  const validationCode = input.validationCode.trim();
  const reason = input.reason.trim().replace(/\s+/g, " ");
  if (!input.nextPersonId) {
    return { ok: false, error: "Chọn người phụ trách mới." };
  }
  if (input.nextPersonId === input.currentPersonId) {
    return { ok: false, error: "Người được chọn đang là người phụ trách." };
  }
  if (!reason) {
    return { ok: false, error: "Nhập lý do chuyển phụ trách." };
  }
  return {
    ok: true,
    input: {
      validationCode,
      personId: input.nextPersonId,
      reason,
    },
    confirmation: `${validationCode}: ${input.currentName || "Chưa phân công"} → ${input.nextName}. Lý do: ${reason}`,
  };
}
