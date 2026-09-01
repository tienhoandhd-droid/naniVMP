import { useMemo, useRef, useState } from "react";
import { UserRoundCog } from "lucide-react";

import ViewportDialog from "../../components/ui/ViewportDialog.tsx";
import { useToast } from "../../components/ui/ToastProvider.tsx";
import { C, FIELD, INP, LBL, TEXT, btnPrimary } from "../../constants/theme.ts";
import { usePerformers } from "../../hooks/index.ts";
import { useXacNhan } from "../../hooks/useXacNhan.tsx";
import { setItemPerformerById } from "../../lib/supabaseData.ts";
import type { Activity } from "../../types/domain.ts";
import {
  buildActivePerformerChoices,
  formatPerformerOptionLabel,
  resolvePerformerChoice,
  type PerformerSourceRow,
} from "../itemPermissions/performerSelection.ts";
import { prepareWorkloadOwnerTransfer } from "./workloadOwnerTransferModel.ts";

interface WorkloadOwnerTransferDialogProps {
  activity: Activity;
  onClose: () => void;
  onReload: () => void | Promise<void>;
  /** Điểm tiêm chỉ phục vụ render tĩnh/test; runtime đọc danh bạ chuẩn. */
  performers?: readonly PerformerSourceRow[];
}

function ownerPersonId(activity: Activity): string | null {
  const value = activity.ownerPersonId ?? activity._raw?.owner_person_id;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export default function WorkloadOwnerTransferDialog({
  activity,
  onClose,
  onReload,
  performers: suppliedPerformers,
}: WorkloadOwnerTransferDialogProps) {
  const directory = usePerformers(suppliedPerformers === undefined);
  const toast = useToast();
  const { xacNhan, hopXacNhan } = useXacNhan();
  const [nextPersonId, setNextPersonId] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const personRef = useRef<HTMLSelectElement | null>(null);
  const reasonRef = useRef<HTMLTextAreaElement | null>(null);

  const currentPersonId = ownerPersonId(activity);
  const choices = useMemo(
    () => buildActivePerformerChoices(suppliedPerformers ?? directory.performers)
      .filter((person) => person.personId !== currentPersonId),
    [currentPersonId, directory.performers, suppliedPerformers],
  );
  const selected = resolvePerformerChoice(nextPersonId, choices);

  const submit = async () => {
    if (savingRef.current) return;
    const prepared = prepareWorkloadOwnerTransfer({
      validationCode: activity.code,
      currentPersonId,
      nextPersonId,
      currentName: String(activity.owner || ""),
      nextName: selected?.fullName || "",
      reason,
    });
    if (!prepared.ok) {
      setError(prepared.error);
      if (prepared.error.includes("Lý do")) reasonRef.current?.focus();
      else personRef.current?.focus();
      return;
    }

    const confirmed = await xacNhan({
      title: "Xác nhận chuyển phụ trách?",
      description: prepared.confirmation,
      confirmLabel: "Chuyển người",
      cancelLabel: "Xem lại",
    });
    if (!confirmed || savingRef.current) return;

    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      await setItemPerformerById(
        prepared.input.validationCode,
        prepared.input.personId,
        prepared.input.reason,
      );
      toast.thanhCong(`Đã chuyển ${prepared.input.validationCode} sang ${selected?.fullName || "người mới"}.`);
      onClose();
      Promise.resolve(onReload()).catch(() => {
        toast.canhBao("Đã chuyển người nhưng chưa tải lại được bảng. Hãy bấm Làm mới.");
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Chuyển người phụ trách thất bại.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const requestClose = () => {
    if (!savingRef.current) onClose();
  };

  return (
    <ViewportDialog
      open
      title="Chuyển phụ trách"
      description="Thay đổi này được ghi vào Dữ liệu nguồn rồi đồng bộ xuống các hạng mục liên quan."
      icon={UserRoundCog}
      maxWidth={520}
      dismissDisabled={saving}
      onRequestClose={requestClose}
      footer={(
        <>
          <button type="button" disabled={saving} onClick={requestClose}
            style={{ ...btnPrimary, background: C.surface, color: C.plum,
              border: `1px solid ${C.line}`, boxShadow: "none" }}>
            Huỷ
          </button>
          <button type="button" data-workload-owner-submit disabled={saving || choices.length === 0}
            onClick={() => void submit()} style={btnPrimary}>
            {saving ? "Đang chuyển…" : "Xem lại thay đổi"}
          </button>
        </>
      )}
    >
      <div data-workload-owner-dialog style={{ display: "grid", gap: 16, fontFamily: TEXT }}>
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 16px",
          padding: 14, borderRadius: 14, background: C.surfaceSunk, border: `1px solid ${C.line}` }}>
          <span style={{ color: C.plumSoft, fontSize: 12, fontWeight: 700 }}>Hạng mục</span>
          <b style={{ color: C.plum, fontSize: 13 }}>{activity.code}</b>
          <span style={{ color: C.plumSoft, fontSize: 12, fontWeight: 700 }}>Hiện tại</span>
          <b style={{ color: C.plum, fontSize: 13 }}>{activity.owner || "Chưa phân công"}</b>
        </div>

        <div style={FIELD}>
          <label htmlFor="workload-owner-next" style={LBL}>Người phụ trách mới</label>
          <select id="workload-owner-next" ref={personRef} data-dialog-focus style={INP}
            value={nextPersonId} disabled={saving || choices.length === 0}
            aria-describedby="workload-owner-help"
            onChange={(event) => { setNextPersonId(event.target.value); setError(""); }}>
            <option value="">Chọn từ danh bạ đang hoạt động</option>
            {choices.map((person) => (
              <option key={person.personId} value={person.personId}>
                {formatPerformerOptionLabel(person)}
              </option>
            ))}
          </select>
        </div>

        <div style={FIELD}>
          <label htmlFor="workload-owner-reason" style={LBL}>Lý do chuyển phụ trách</label>
          <textarea id="workload-owner-reason" ref={reasonRef} value={reason} disabled={saving}
            aria-describedby="workload-owner-help" rows={3}
            style={{ ...INP, minHeight: 88, padding: "11px 14px", resize: "vertical" }}
            onChange={(event) => { setReason(event.target.value); setError(""); }} />
        </div>

        <p id="workload-owner-help" style={{ margin: 0, color: C.plumSoft, fontSize: 12, lineHeight: 1.55 }}>
          Chỉ thay QA phụ trách chính. Người hỗ trợ, deadline và tiến độ giữ nguyên.
        </p>
        {choices.length === 0 && (
          <p role="status" style={{ margin: 0, color: C.marigoldText, fontSize: 13, fontWeight: 700 }}>
            Không có người hoạt động khác để chuyển.
          </p>
        )}
        {error && <p role="alert" style={{ margin: 0, color: C.raspText, fontSize: 13, fontWeight: 700 }}>{error}</p>}
        {hopXacNhan}
      </div>
    </ViewportDialog>
  );
}
