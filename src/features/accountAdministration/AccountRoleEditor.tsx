import { useEffect, useMemo, useRef, useState } from "react";
import { BUSINESS_ROLE_CATALOG, BUSINESS_ROLE_IDS, businessRoleLabel } from "../../lib/businessRoles.ts";
import type { BusinessRole } from "../../lib/businessRoles.ts";
import type { setBusinessRole } from "../../lib/supabaseData.ts";
import { actionDescriptionId, firstActionBlock, type ActionBlock } from "../../components/ui/actionReadiness.ts";
import {
  planBusinessRoleChange,
  type AccountAdministrationRow,
} from "./accountAdministrationModel.ts";

export interface RoleDraft {
  targetUserId: string;
  originalRole: BusinessRole | null;
  nextRole: BusinessRole;
  department: string | null;
  reason: string;
}

export type RoleCommitOutcome =
  | { kind: "verified"; row: AccountAdministrationRow }
  | { kind: "stale" }
  | { kind: "rejected"; message: string }
  | { kind: "written_unverified"; message: string }
  | { kind: "mismatch"; actualRole: BusinessRole | null };

const WRITTEN_UNVERIFIED_MESSAGE = "Đã ghi thay đổi nhưng chưa đối chiếu lại được";

export async function commitRoleDraft({
  draft,
  mutate,
  reload,
  isCurrent,
}: {
  draft: RoleDraft;
  mutate: (userId: string, role: BusinessRole, department: string | null, reason: string) => Promise<{ ok: boolean; error?: string }>;
  reload: (userId: string) => Promise<AccountAdministrationRow | null>;
  isCurrent: (userId: string) => boolean;
}): Promise<RoleCommitOutcome> {
  if (!draft.reason.trim()) {
    return { kind: "rejected", message: "Cần nhập lý do để lưu thay đổi." };
  }
  if (!isCurrent(draft.targetUserId)) return { kind: "stale" };

  let mutation;
  try {
    mutation = await mutate(draft.targetUserId, draft.nextRole, draft.department, draft.reason);
  } catch (error) {
    return { kind: "rejected", message: messageFrom(error, "Đổi vai thất bại.") };
  }
  if (!mutation.ok) {
    return { kind: "rejected", message: mutation.error || "Đổi vai thất bại." };
  }

  let reloaded: AccountAdministrationRow | null;
  try {
    reloaded = await reload(draft.targetUserId);
  } catch (error) {
    return isCurrent(draft.targetUserId)
      ? { kind: "written_unverified", message: writtenUnverifiedMessage(error) }
      : { kind: "stale" };
  }
  if (!isCurrent(draft.targetUserId)) return { kind: "stale" };
  if (!reloaded || reloaded.userId !== draft.targetUserId) {
    return { kind: "written_unverified", message: WRITTEN_UNVERIFIED_MESSAGE };
  }
  if (reloaded.businessRole !== draft.nextRole) {
    return { kind: "mismatch", actualRole: reloaded.businessRole };
  }
  return { kind: "verified", row: reloaded };
}

export interface AccountRoleEditorProps {
  row: AccountAdministrationRow;
  canEdit: boolean;
  mutateRole: typeof setBusinessRole;
  reloadByUserId: (userId: string) => Promise<AccountAdministrationRow | null>;
  onVerified: (row: AccountAdministrationRow) => void;
}

export function validateRoleEditorDraft({
  canEdit,
  saving,
  nextRole,
  sameRole,
  reason,
  planBlocker,
}: {
  canEdit: boolean;
  saving: boolean;
  nextRole: BusinessRole | "";
  sameRole: boolean;
  reason: string;
  planBlocker?: string | null;
}): ActionBlock | null {
  return firstActionBlock([
    { blocked: !canEdit, code: "permission", message: "Bạn không có quyền đổi vai trò." },
    { blocked: saving, code: "busy", message: "Đang lưu thay đổi…" },
    { blocked: !nextRole, code: "role", message: "Chọn vai nghiệp vụ trước khi lưu.", focusId: "account-role-next" },
    { blocked: Boolean(planBlocker), code: "plan", message: planBlocker || "Không thể chuẩn bị thay đổi vai trò." },
    { blocked: sameRole, code: "change", message: "Chưa có thay đổi để lưu." },
    { blocked: !reason.trim(), code: "reason", message: "Nhập lý do đổi vai trước khi lưu.", focusId: "account-role-reason" },
  ]);
}

function messageFrom(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function writtenUnverifiedMessage(error: unknown): string {
  const detail = messageFrom(error, "");
  return detail ? `${WRITTEN_UNVERIFIED_MESSAGE}: ${detail}` : WRITTEN_UNVERIFIED_MESSAGE;
}

function scopeDescription(role: BusinessRole | ""): string {
  if (!role) return "Chọn vai nghiệp vụ để xem cách hiểu phạm vi";
  const scopeMode = BUSINESS_ROLE_CATALOG[role].scopeMode;
  if (scopeMode === "role_policy") return "Theo chính sách vai";
  if (scopeMode === "qa_assignment") return "Theo phân công QA";
  return "Theo bộ phận, xưởng, khu vực và dây chuyền canonical";
}

function selectedRoleLabel(role: BusinessRole | ""): string {
  return role ? businessRoleLabel(role) : "Chưa chọn vai nghiệp vụ";
}

function shortUserId(userId: string | null): string {
  if (!userId) return "Chưa có user_id";
  return userId.length <= 12 ? userId : `${userId.slice(0, 8)}…${userId.slice(-4)}`;
}

export default function AccountRoleEditor({
  row,
  canEdit,
  mutateRole,
  reloadByUserId,
  onVerified,
}: AccountRoleEditorProps) {
  const initialRole = row.businessRole ?? "";
  const [nextRole, setNextRole] = useState<BusinessRole | "">(initialRole);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const roleRef = useRef<HTMLSelectElement | null>(null);
  const reasonRef = useRef<HTMLTextAreaElement | null>(null);
  const currentUserId = useRef<string | null>(row.userId);
  currentUserId.current = row.userId;

  useEffect(() => {
    setNextRole(row.businessRole ?? "");
    setReason("");
    setSaving(false);
    setMessage("");
  }, [row.key, row.businessRole]);

  const plan = useMemo(
    () => nextRole ? planBusinessRoleChange(row, nextRole) : null,
    [nextRole, row],
  );
  const actionDescription = actionDescriptionId("doi vai");
  const actionBlock = validateRoleEditorDraft({
    canEdit,
    saving,
    nextRole,
    sameRole: Boolean(nextRole) && nextRole === row.businessRole,
    reason,
    planBlocker: plan?.blocker,
  });
  const saveDisabled = !canEdit || saving || actionBlock?.code === "plan" || actionBlock?.code === "change";

  const cancel = () => {
    setNextRole(row.businessRole ?? "");
    setReason("");
    setMessage("");
  };

  const save = async () => {
    if (actionBlock) {
      setMessage(actionBlock.message);
      if (actionBlock.focusId === "account-role-next") roleRef.current?.focus();
      if (actionBlock.focusId === "account-role-reason") reasonRef.current?.focus();
      return;
    }
    if (!plan || !nextRole) return;
    const draft: RoleDraft = {
      targetUserId: plan.userId,
      originalRole: row.businessRole,
      nextRole,
      department: plan.department,
      reason: reason.trim(),
    };
    setSaving(true);
    setMessage("");
    const outcome = await commitRoleDraft({
      draft,
      mutate: mutateRole,
      reload: reloadByUserId,
      isCurrent: (userId) => currentUserId.current === userId,
    });
    if (currentUserId.current !== draft.targetUserId) return;
    if (outcome.kind === "verified") {
      setReason("");
      setMessage("Đã lưu và đối chiếu lại vai trò.");
      onVerified(outcome.row);
    } else if (outcome.kind === "rejected" || outcome.kind === "written_unverified") {
      setMessage(outcome.message);
    } else if (outcome.kind === "mismatch") {
      setMessage(`Vai server trả về là ${businessRoleLabel(outcome.actualRole)}, khác vai đã chọn.`);
    }
    setSaving(false);
  };

  return (
    <section className="ip-panel" aria-labelledby="account-role-editor-title">
      <h3 id="account-role-editor-title">Đối chiếu thay đổi</h3>
      <p className="ip-help">
        <b>{row.name}</b>{row.email ? ` · ${row.email}` : ""} · user_id: {shortUserId(row.userId)}
      </p>
      <label>Vai mới
        <select ref={roleRef} id="account-role-next" className="pq-o" aria-label="Vai nghiệp vụ mới" value={nextRole}
          disabled={!canEdit || saving}
          aria-describedby={actionDescription}
          aria-invalid={message === "Chọn vai nghiệp vụ trước khi lưu." || undefined}
          onChange={(event) => { setNextRole(event.target.value as BusinessRole | ""); setMessage(""); }}>
          <option value="">Chọn vai nghiệp vụ</option>
          {BUSINESS_ROLE_IDS.map((role) => (
            <option key={role} value={role}>{BUSINESS_ROLE_CATALOG[role].label}</option>
          ))}
        </select>
      </label>
      <p className="ip-help">
        {businessRoleLabel(row.businessRole)} → <b>{selectedRoleLabel(nextRole)}</b>. {scopeDescription(nextRole)}.
      </p>
      {!nextRole && <p className="ip-message" role="alert">Chưa chọn vai nghiệp vụ.</p>}
      {plan?.blocker && <p className="ip-message" role="alert">{plan.blocker}</p>}
      <label>Lý do <span aria-hidden="true">(bắt buộc)</span>
        <textarea ref={reasonRef} id="account-role-reason" className="pq-o" aria-label="Lý do đổi vai" value={reason} rows={2} required
          disabled={!canEdit || saving}
          aria-describedby={actionDescription}
          aria-invalid={message === "Nhập lý do đổi vai trước khi lưu." || undefined}
          onChange={(event) => { setReason(event.target.value); setMessage(""); }} />
      </label>
      <p id={actionDescription} className="ip-help">
        {actionBlock?.message || "Sẵn sàng lưu và đối chiếu lại với máy chủ."}
      </p>
      <div className="ip-actions">
        <button type="button" className="pq-nut" disabled={saving} onClick={cancel}>Hủy</button>
        <button type="button" className="pq-nut la-chinh" disabled={saveDisabled}
          aria-describedby={actionDescription} onClick={() => { void save(); }}>
          {saving ? "Đang lưu…" : "Lưu thay đổi"}
        </button>
      </div>
      {message && <div className="ip-message" role="status">{message}</div>}
    </section>
  );
}
