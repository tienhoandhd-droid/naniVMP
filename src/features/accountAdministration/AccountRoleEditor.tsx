import { useEffect, useMemo, useRef, useState } from "react";
import { BUSINESS_ROLE_CATALOG, BUSINESS_ROLE_IDS, businessRoleLabel } from "../../lib/businessRoles.ts";
import type { BusinessRole } from "../../lib/businessRoles.ts";
import type { setBusinessRole } from "../../lib/supabaseData.ts";
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
      ? { kind: "written_unverified", message: messageFrom(error, "Đã ghi thay đổi nhưng chưa đối chiếu lại được.") }
      : { kind: "stale" };
  }
  if (!isCurrent(draft.targetUserId)) return { kind: "stale" };
  if (!reloaded || reloaded.userId !== draft.targetUserId) {
    return { kind: "written_unverified", message: "Đã ghi thay đổi nhưng chưa đối chiếu lại được." };
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

function messageFrom(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function scopeDescription(role: BusinessRole): string {
  const scopeMode = BUSINESS_ROLE_CATALOG[role].scopeMode;
  if (scopeMode === "role_policy") return "Theo chính sách vai";
  if (scopeMode === "qa_assignment") return "Theo phân công QA";
  return "Theo bộ phận, xưởng, khu vực và dây chuyền canonical";
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
  const initialRole = row.businessRole ?? "qa_staff";
  const [nextRole, setNextRole] = useState<BusinessRole>(initialRole);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const currentUserId = useRef<string | null>(row.userId);
  currentUserId.current = row.userId;

  useEffect(() => {
    setNextRole(row.businessRole ?? "qa_staff");
    setReason("");
    setSaving(false);
    setMessage("");
  }, [row.key, row.businessRole]);

  const plan = useMemo(() => planBusinessRoleChange(row, nextRole), [nextRole, row]);
  const canSave = canEdit && plan.canSave && Boolean(reason.trim()) && !saving;

  const cancel = () => {
    setNextRole(row.businessRole ?? "qa_staff");
    setReason("");
    setMessage("");
  };

  const save = async () => {
    if (!canSave) return;
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
        <select className="pq-o" aria-label="Vai nghiệp vụ mới" value={nextRole}
          disabled={!canEdit || saving}
          onChange={(event) => { setNextRole(event.target.value as BusinessRole); setMessage(""); }}>
          {BUSINESS_ROLE_IDS.map((role) => (
            <option key={role} value={role}>{BUSINESS_ROLE_CATALOG[role].label}</option>
          ))}
        </select>
      </label>
      <p className="ip-help">
        {businessRoleLabel(row.businessRole)} → <b>{businessRoleLabel(nextRole)}</b>. {scopeDescription(nextRole)}.
      </p>
      {plan.blocker && <p className="ip-message" role="alert">{plan.blocker}</p>}
      <label>Lý do <span aria-hidden="true">(bắt buộc)</span>
        <textarea className="pq-o" aria-label="Lý do đổi vai" value={reason} rows={2} required
          disabled={!canEdit || saving}
          onChange={(event) => { setReason(event.target.value); setMessage(""); }} />
      </label>
      <div className="ip-actions">
        <button type="button" className="pq-nut" disabled={saving} onClick={cancel}>Hủy</button>
        <button type="button" className="pq-nut la-chinh" disabled={!canSave} onClick={() => { void save(); }}>
          {saving ? "Đang lưu…" : "Lưu thay đổi"}
        </button>
      </div>
      {message && <div className="ip-message" role="status">{message}</div>}
    </section>
  );
}
