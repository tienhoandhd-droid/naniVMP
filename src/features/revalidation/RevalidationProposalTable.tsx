import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarClock, CheckCircle2, RefreshCw, XCircle } from "lucide-react";

import SmartTable, { type SmartTableColumn } from "../../components/ui/SmartTable.tsx";
import StateBoundary from "../../components/ui/StateBoundary.tsx";
import ViewportDialog from "../../components/ui/ViewportDialog.tsx";
import { useToast } from "../../components/ui/ToastProvider.tsx";
import { formatBangkokDate } from "../../lib/formatBangkok.ts";
import {
  decideRevalidation,
  listRevalidationProposals,
  refreshRevalidationProposals,
  type RevalidationDecisionAction,
} from "./api.ts";
import type { RevalidationProposal, RevalidationProposalStatus } from "./contracts.ts";

const STATUS_LABEL: Record<RevalidationProposalStatus, string> = {
  pending: "Chờ quyết định",
  confirmed: "Đã tạo kỳ mới",
  dismissed: "Đã bỏ qua",
  obsolete: "Không còn hiệu lực",
};

type LoadState = "loading" | "ready" | "error";

export default function RevalidationProposalTable({ canManage = false }: { canManage?: boolean }) {
  const [status, setStatus] = useState<RevalidationProposalStatus | "all">("pending");
  const [rows, setRows] = useState<RevalidationProposal[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [decision, setDecision] = useState<{ row: RevalidationProposal; action: RevalidationDecisionAction } | null>(null);
  const sequence = useRef(0);
  const toast = useToast();

  const load = useCallback(async () => {
    const current = ++sequence.current;
    setLoadState("loading");
    try {
      const next = await listRevalidationProposals(status);
      if (current !== sequence.current) return;
      setRows(next);
      setError("");
      setLoadState("ready");
    } catch (cause) {
      if (current !== sequence.current) return;
      setRows([]);
      setError(cause instanceof Error ? cause.message : String(cause));
      setLoadState("error");
    }
  }, [status]);

  useEffect(() => { void load(); }, [load, tick]);

  const columns = useMemo<SmartTableColumn<RevalidationProposal>[]>(() => [
    {
      id: "code",
      header: "Mã / đối tượng",
      cell: (row) => (
        <div className="rv-code"><b>{row.validationCode}</b><span>{row.objectCode} · {row.validationType}</span></div>
      ),
      priority: "primary",
    },
    { id: "completed", header: "Hoàn thành gốc", cell: (row) => formatBangkokDate(row.actualCompletedDate) },
    { id: "cycle", header: "Chu kỳ", cell: (row) => <span className="rv-number">{row.frequencyMonths} tháng</span>, align: "end" },
    { id: "due", header: "Kỳ tiếp theo", cell: (row) => <b>{formatBangkokDate(row.dueDate)}</b> },
    {
      id: "status",
      header: "Trạng thái",
      cell: (row) => <span className={`rv-status rv-status--${row.status}`}>{STATUS_LABEL[row.status]}</span>,
    },
    {
      id: "actions",
      header: "Quyết định",
      align: "end",
      cell: (row) => row.status === "pending" && canManage ? (
        <div className="rv-actions" role="group" aria-label={`Quyết định cho ${row.validationCode}`}>
          <button type="button" className="cw-nut cw-nut--chinh" onClick={() => setDecision({ row, action: "confirm" })}>
            <CheckCircle2 size={14} aria-hidden="true" /> Xác nhận
          </button>
          <button type="button" className="cw-nut" onClick={() => setDecision({ row, action: "dismiss" })}>
            <XCircle size={14} aria-hidden="true" /> Bỏ qua
          </button>
        </div>
      ) : <span className="cw-nhe">{row.createdPlanValidationCode ?? "—"}</span>,
    },
  ], [canManage]);

  const refresh = async () => {
    if (!canManage || refreshing) return;
    setRefreshing(true);
    const progress = toast.dangChay("Đang đối chiếu kỳ tái thẩm định…");
    try {
      const result = await refreshRevalidationProposals();
      progress.xong(`Đã tạo ${result.created}, giữ nguyên ${result.unchanged}, hết hiệu lực ${result.obsolete}.`);
      setTick((value) => value + 1);
    } catch (cause) {
      progress.hong(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <section className="rv-panel" aria-labelledby="rv-heading">
      <header className="rv-toolbar">
        <div>
          <h3 id="rv-heading">Kỳ tái thẩm định</h3>
          <p>Ngày hoàn thành thực tế + chu kỳ trong Dữ liệu nguồn.</p>
        </div>
        <div className="rv-toolbar__actions">
          <label className="rv-filter" htmlFor="rv-status-filter">
            <span>Trạng thái</span>
            <select id="rv-status-filter" className="cw-o" value={status}
              onChange={(event) => setStatus(event.target.value as RevalidationProposalStatus | "all")}>
              <option value="pending">Chờ quyết định</option>
              <option value="confirmed">Đã tạo kỳ mới</option>
              <option value="dismissed">Đã bỏ qua</option>
              <option value="obsolete">Không còn hiệu lực</option>
              <option value="all">Tất cả</option>
            </select>
          </label>
          {canManage && (
            <button type="button" className="cw-nut" disabled={refreshing} onClick={refresh}>
              <RefreshCw size={15} aria-hidden="true" /> {refreshing ? "Đang đối chiếu…" : "Đối chiếu nguồn"}
            </button>
          )}
        </div>
      </header>

      {loadState === "loading" && <StateBoundary state="loading" title="Đang tải kỳ tái thẩm định" skeletonRows={5} />}
      {loadState === "error" && (
        <StateBoundary state="error" title="Chưa tải được kỳ tái thẩm định" description={error}
          onRetry={() => setTick((value) => value + 1)} />
      )}
      {loadState === "ready" && (
        <SmartTable caption="Danh sách kỳ tái thẩm định" rows={rows} rowKey={(row) => row.id}
          columns={columns} empty={status === "pending" ? "Không có kỳ nào đang chờ quyết định." : "Không có dữ liệu trong trạng thái này."} />
      )}

      {decision && (
        <DecisionDialog decision={decision} onClose={() => setDecision(null)} onSaved={() => {
          setDecision(null);
          setTick((value) => value + 1);
        }} />
      )}
    </section>
  );
}

function DecisionDialog({ decision, onClose, onSaved }: {
  decision: { row: RevalidationProposal; action: RevalidationDecisionAction };
  onClose: () => void;
  onSaved: () => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const toast = useToast();
  const confirm = decision.action === "confirm";

  const save = async () => {
    if (busy) return;
    const trimmed = reason.trim();
    if (trimmed.length < 5) {
      setError("Nhập lý do ít nhất 5 ký tự.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await decideRevalidation(decision.action, {
        proposalId: decision.row.id,
        reason: trimmed,
        expectedVersion: decision.row.version,
      });
      if (!result.ok) {
        if (result.errorCode === "VERSION_CONFLICT") {
          setError(`Dòng đã thay đổi trên máy chủ (v${result.currentVersion ?? "?"}). Đóng hộp thoại để tải lại.`);
        } else {
          setError(result.error ?? `Không ghi được quyết định (${result.errorCode}).`);
        }
        return;
      }
      toast.thanhCong(confirm
        ? `Đã tạo ${result.validationCode ?? "hạng mục kỳ mới"}.`
        : "Đã ghi nhận bỏ qua kỳ này.");
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ViewportDialog open icon={CalendarClock} maxWidth={540} dismissDisabled={busy}
      title={confirm ? "Xác nhận kỳ tái thẩm định" : "Bỏ qua kỳ tái thẩm định"}
      description={`${decision.row.validationCode} · kỳ ${formatBangkokDate(decision.row.dueDate)}`}
      onRequestClose={onClose}
      footer={<div className="cw-chan-nut">
        <button type="button" className="cw-nut" disabled={busy} onClick={onClose}>Huỷ</button>
        <button type="button" className="cw-nut cw-nut--chinh" disabled={busy} onClick={save}>
          {busy ? "Đang lưu…" : confirm ? "Xác nhận & tạo kỳ" : "Ghi nhận bỏ qua"}
        </button>
      </div>}>
      <label className="cw-truong" htmlFor="rv-decision-reason">
        <span className="cw-nhan">Lý do quyết định</span>
        <textarea id="rv-decision-reason" className="cw-o" rows={4} data-dialog-focus
          value={reason} onChange={(event) => setReason(event.target.value)}
          aria-describedby={error ? "rv-decision-error" : undefined} />
      </label>
      {error && <p id="rv-decision-error" className="cw-loi" role="alert">{error}</p>}
    </ViewportDialog>
  );
}
