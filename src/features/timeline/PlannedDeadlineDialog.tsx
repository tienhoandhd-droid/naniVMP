import { useRef, useState } from "react";

import ViewportDialog from "../../components/ui/ViewportDialog.tsx";
import { useToast } from "../../components/ui/ToastProvider.tsx";
import { updatePlannedDeadlines } from "../../lib/supabaseData.ts";
import type { Activity } from "../../types/domain.ts";
import {
  DEADLINE_KEYS,
  PLANNED_DEADLINE_SUCCESS_TOAST,
  PROTECTED_KEYS,
  createPlannedDeadlineDialogController,
  plannedSnapshot,
  preparePlannedDeadlineUpdate,
  protectedSnapshot,
  resultMessage,
  validatePlannedDeadlineDraft,
} from "./plannedDeadlineEditModel.ts";

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
    validationCode: a.code,
    before,
    next: draft,
    reason,
    confirmed,
    version: a.version,
  });

  const save = async () => {
    if (controller.isBusy()) return;

    const prepared = preparePlannedDeadlineUpdate({
      validationCode: a.code,
      before,
      next: draft,
      reason,
      confirmed,
      version: a.version,
    });
    if (!prepared.ok) {
      setConflict(false);
      setError(prepared.error);
      return;
    }

    setBusy(true);
    try {
      const outcome = await controller.submit(prepared.input);
      if (outcome.kind === "failure") {
        setError(resultMessage(outcome.result));
        setConflict(outcome.result.error_code === "VERSION_CONFLICT");
      } else if (outcome.kind === "transport_error") {
        setConflict(false);
        setError(outcome.message);
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
      title="Chỉnh kế hoạch thủ công"
      onRequestClose={requestClose}
      footer={(
        <>
          <button type="button" disabled={busy} onClick={requestClose}>Đóng</button>
          <button
            data-planned-deadline-submit
            type="button"
            disabled={busy || Boolean(localError)}
            onClick={() => void save()}
          >
            Lưu
          </button>
        </>
      )}
    >
      <div data-planned-deadline-dialog>
        <p data-planned-deadline-identity>{a.code}</p>
        <p data-planned-deadline-version>Phiên bản: {a.version ?? "—"}</p>

        <div className="planned-deadline-grid">
          {DEADLINE_KEYS.map((key) => (
            <label key={key}>
              {key}
              <span>Đã tải: {before[key] || "—"}</span>
              <input
                data-planned-deadline-input={key}
                type="date"
                value={draft[key] || ""}
                disabled={busy}
                onChange={(event) => setDraft((current) => ({
                  ...current,
                  [key]: event.target.value || null,
                }))}
              />
            </label>
          ))}
        </div>

        <h3>Ngày thực tế và trạng thái được bảo vệ</h3>
        <div className="planned-deadline-protected">
          {PROTECTED_KEYS.map((key) => (
            <p key={key} data-planned-deadline-protected={key}>
              {key}: <b>{protectedValues[key] || "—"}</b>
            </p>
          ))}
        </div>

        <label>
          Lý do
          <input
            data-dialog-focus
            aria-label="Lý do chỉnh deadline kế hoạch"
            value={reason}
            disabled={busy}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>

        <label>
          <input
            data-planned-deadline-confirmation
            type="checkbox"
            checked={confirmed}
            disabled={busy}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          Tôi xác nhận chỉ đổi bốn deadline kế hoạch; ngày thực tế, trạng thái,
          người thực hiện và mã hạng mục giữ nguyên.
        </label>

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
