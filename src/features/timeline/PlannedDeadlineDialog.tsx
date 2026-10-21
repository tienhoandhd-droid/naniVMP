import { useRef, useState } from "react";

import ViewportDialog from "../../components/ui/ViewportDialog.tsx";
import { useToast } from "../../components/ui/ToastProvider.tsx";
import { updatePlannedDeadlines } from "../../lib/supabaseData.ts";
import type { Activity } from "../../types/domain.ts";
import { progressValidationCode } from "../progress/editableProgressRights.ts";
import {
  DEADLINE_KEYS,
  PLANNED_DEADLINE_SUCCESS_TOAST,
  PROTECTED_KEYS,
  createPlannedDeadlineDialogController,
  plannedSnapshot,
  plannedDeadlineErrorFocusId,
  preparePlannedDeadlineUpdate,
  protectedSnapshot,
  resultMessage,
  validatePlannedDeadlineDraft,
} from "./plannedDeadlineEditModel.ts";
import type { PlannedDeadlineKey, ProtectedKey } from "./plannedDeadlineEditModel.ts";

const DEADLINE_LABELS: Record<PlannedDeadlineKey, string> = {
  deadline_protocol: "Hạn đề cương",
  deadline_validation: "Hạn thẩm định",
  deadline_report: "Hạn báo cáo",
  deadline_vmp: "Đích VMP",
};

const PROTECTED_LABELS: Record<ProtectedKey, string> = {
  actual_protocol_date: "Ngày xong đề cương",
  actual_validation_date: "Ngày xong thẩm định",
  actual_report_date: "Ngày xong báo cáo",
  actual_vmp_date: "Ngày xong VMP",
  status_protocol: "Trạng thái đề cương",
  status_validation: "Trạng thái thẩm định",
  status_report: "Trạng thái báo cáo",
  status_vmp: "Trạng thái VMP",
};

interface PlannedDeadlineDialogProps {
  a: Activity;
  onClose: () => void;
  onReload: () => void;
}

export default function PlannedDeadlineDialog({
  a,
  onClose,
  onReload,
}: PlannedDeadlineDialogProps) {
  const toast = useToast();
  // `a.code` có thể là mã đối tượng (dữ liệu bảng điều khiển v1) — server
  // cần mã hạng mục, nên lấy qua cùng hàm với hộp cập nhật tiến độ.
  const validationCode = progressValidationCode(a);
  const before = plannedSnapshot(a);
  const protectedValues = protectedSnapshot(a);
  const [draft, setDraft] = useState(before);
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState(false);

  const callbacks = useRef({
    onClose,
    onReload,
    onSuccess: () => toast.thanhCong(PLANNED_DEADLINE_SUCCESS_TOAST),
  });
  callbacks.current = {
    onClose,
    onReload,
    onSuccess: () => toast.thanhCong(PLANNED_DEADLINE_SUCCESS_TOAST),
  };

  const controller = useRef(createPlannedDeadlineDialogController({
    mutate: updatePlannedDeadlines,
    onSuccess: () => callbacks.current.onSuccess(),
    onClose: () => callbacks.current.onClose(),
    onReload: () => callbacks.current.onReload(),
  })).current;

  const localError = validatePlannedDeadlineDraft({
    validationCode,
    before,
    next: draft,
    reason,
    confirmed,
    version: a.version,
  });

  const save = async () => {
    if (controller.isBusy()) return;

    const prepared = preparePlannedDeadlineUpdate({
      validationCode,
      before,
      next: draft,
      reason,
      confirmed,
      version: a.version,
    });
    if (!prepared.ok) {
      setConflict(false);
      setError(prepared.error);
      document.getElementById(plannedDeadlineErrorFocusId(prepared.error))?.focus();
      return;
    }

    setBusy(true);
    try {
      const outcome = await controller.submit(prepared.input);
      if (outcome.kind === "failure") {
        setError(resultMessage(outcome.result));
        setConflict(outcome.result.error_code === "VERSION_CONFLICT");
      } else if (outcome.kind === "transport_error") {
        console.error("Lưu hạn kế hoạch thất bại:", outcome.message);
        setConflict(false);
        setError("Chưa lưu được. Thử lại.");
      }
    } finally {
      setBusy(false);
    }
  };

  const requestClose = () => {
    controller.requestClose();
  };

  const reloadConflict = () => {
    controller.reloadConflict();
  };

  return (
    <ViewportDialog
      open
      title="Chỉnh hạn kế hoạch"
      onRequestClose={requestClose}
      footer={(
        <>
          <button type="button" disabled={busy} onClick={requestClose}>Đóng</button>
          <button
            data-planned-deadline-submit
            type="button"
            disabled={busy}
            aria-describedby="planned-deadline-action-description"
            onClick={() => void save()}
          >
            Lưu
          </button>
        </>
      )}
    >
      <div data-planned-deadline-dialog>
        <p data-planned-deadline-identity>{validationCode}</p>

        <div className="planned-deadline-grid">
          {DEADLINE_KEYS.map((key) => (
            <label key={key}>
              {DEADLINE_LABELS[key]}
              <span>Hiện tại: {before[key] || "—"}</span>
              <input
                id={`planned-deadline-${key}`}
                data-planned-deadline-input={key}
                aria-describedby="planned-deadline-action-description"
                type="date"
                value={draft[key] || ""}
                disabled={busy}
                onChange={(event) => {
                  setError("");
                  setDraft((current) => ({
                    ...current,
                    [key]: event.target.value || null,
                  }));
                }}
              />
            </label>
          ))}
        </div>

        <h3>Không đổi</h3>
        <div className="planned-deadline-protected">
          {PROTECTED_KEYS.map((key) => (
            <p key={key} data-planned-deadline-protected={key}>
              {PROTECTED_LABELS[key]}: <b>{protectedValues[key] || "—"}</b>
            </p>
          ))}
        </div>

        <label>
          Lý do
          <input
            id="planned-deadline-reason"
            data-dialog-focus
            aria-label="Lý do chỉnh hạn kế hoạch"
            aria-describedby="planned-deadline-action-description"
            value={reason}
            disabled={busy}
            onChange={(event) => { setReason(event.target.value); setError(""); }}
          />
        </label>

        <label>
          <input
            id="planned-deadline-confirmation"
            data-planned-deadline-confirmation
            type="checkbox"
            checked={confirmed}
            disabled={busy}
            aria-describedby="planned-deadline-action-description"
            onChange={(event) => { setConfirmed(event.target.checked); setError(""); }}
          />
          Tôi xác nhận chỉ đổi bốn hạn kế hoạch.
        </label>

        <p id="planned-deadline-action-description">
          {localError}
        </p>

        {error && <p data-planned-deadline-error role="alert">{error}</p>}
        {conflict && (
          <button
            data-planned-deadline-reload
            type="button"
            disabled={busy}
            onClick={reloadConflict}
          >
            Tải lại hạng mục
          </button>
        )}
      </div>
    </ViewportDialog>
  );
}
