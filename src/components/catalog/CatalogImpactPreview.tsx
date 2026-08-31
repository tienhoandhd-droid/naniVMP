import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowRight, Check, Lock, Plus } from "lucide-react";
import { C, TEXT } from "../../constants/theme.ts";
import ViewportDialog from "../ui/ViewportDialog.tsx";
import { applyCatalogChangeV2, previewCatalogChangeV2 } from "../../lib/supabaseData.ts";
import type { AnhHuongTimelineV2, ApplyCatalogChangeV2Input, KetQuaApDung } from "../../lib/supabaseData.ts";
import { candidateHasDeadlineChange, canApplyCatalogImpact, catalogApplyErrorMessage, toggleDeadlineOverride } from "../../features/catalogWorkspace/catalogTimelineOverrideModel.ts";
import type { DeadlineOverrideSelection, ProgressedDeadlineCandidate } from "../../features/catalogWorkspace/catalogTimelineOverrideModel.ts";

type ApplyV2Result = KetQuaApDung & { so_ghi_de_deadline?: number; da_ap_truoc_do?: boolean };
type Mutation = (input: ApplyCatalogChangeV2Input) => Promise<ApplyV2Result>;
export type CatalogImpactApplyOutcome = { kind: "applied" } | { kind: "busy" } | { kind: "rejected"; message: string };

export interface CatalogImpactPreviewLoadState {
  changeId: string;
  preview: AnhHuongTimelineV2 | null;
  loading: boolean;
  error: string | null;
}

export function beginCatalogImpactPreviewLoad(changeId: string): CatalogImpactPreviewLoadState {
  return { changeId, preview: null, loading: true, error: null };
}

export function finishCatalogImpactPreviewLoad(changeId: string, result: AnhHuongTimelineV2): CatalogImpactPreviewLoadState {
  return result.ok
    ? { changeId, preview: result, loading: false, error: null }
    : { changeId, preview: null, loading: false, error: result.error ?? "Không xem trước được" };
}

export function failCatalogImpactPreviewLoad(changeId: string, error: unknown): CatalogImpactPreviewLoadState {
  return {
    changeId,
    preview: null,
    loading: false,
    error: error instanceof Error ? error.message : String(error),
  };
}

/** Synchronous lock: React state alone cannot prevent two rapid clicks before rerender. */
export function createCatalogImpactApplyCoordinator() {
  let busy = false;
  return {
    isBusy: () => busy,
    async run(input: ApplyCatalogChangeV2Input & { normalChangeCount: number; mutate: Mutation }): Promise<CatalogImpactApplyOutcome> {
      const validation = canApplyCatalogImpact({ normalChangeCount: input.normalChangeCount, selected: input.deadlineOverrides, reason: input.reason, confirmed: input.overrideConfirmed });
      if (!validation.ok) return { kind: "rejected", message: validation.reason };
      if (busy) return { kind: "busy" };
      busy = true;
      try {
        const result = await input.mutate({
          changeId: input.changeId,
          reason: input.reason.trim(),
          expectedTimelineRevision: input.expectedTimelineRevision,
          deadlineOverrides: input.deadlineOverrides,
          overrideConfirmed: input.overrideConfirmed,
        });
        return result.ok ? { kind: "applied" } : { kind: "rejected", message: catalogApplyErrorMessage(result) };
      } catch (error) {
        return { kind: "rejected", message: error instanceof Error ? error.message : String(error) };
      } finally {
        busy = false;
      }
    },
  };
}

export function closeCatalogImpactIfIdle(isLocked: () => boolean, onClose: () => void): void {
  if (!isLocked()) onClose();
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

function normalChangeCount(preview: AnhHuongTimelineV2 | null): number {
  return (preview?.tao?.length ?? 0) + (preview?.sua?.length ?? 0) + (preview?.dung?.length ?? 0);
}

function candidateCanBeSelected(candidate: ProgressedDeadlineCandidate): boolean {
  return candidate.eligible && candidate.missing.length === 0 && candidateHasDeadlineChange(candidate);
}

function isSelected(selected: readonly DeadlineOverrideSelection[], candidate: ProgressedDeadlineCandidate): boolean {
  return selected.some((selection) => selection.validation_code === candidate.validation_code && selection.expected_item_version === candidate.item_version);
}

function ProgressEvidence({ candidate }: { candidate: ProgressedDeadlineCandidate }) {
  const dates: Array<[string, string | null]> = [
    ["actual_protocol_date", candidate.progress.actual_protocol_date],
    ["actual_validation_date", candidate.progress.actual_validation_date],
    ["actual_report_date", candidate.progress.actual_report_date],
    ["actual_vmp_date", candidate.progress.actual_vmp_date],
  ];
  const statuses: Array<[string, string]> = [
    ["status_protocol", candidate.progress.status_protocol],
    ["status_validation", candidate.progress.status_validation],
    ["status_report", candidate.progress.status_report],
    ["status_vmp", candidate.progress.status_vmp],
  ];
  return <div style={{ fontSize: 12, color: C.plumSoft, margin: "5px 0" }}>
    {dates.filter(([, value]) => value).map(([label, value]) => <div key={label}>{label}: {formatDate(value)}</div>)}
    {statuses.filter(([, value]) => value).map(([label, value]) => <div key={label}>{label}: {value}</div>)}
  </div>;
}

function DeadlineCandidate({ candidate, selected, applying, onToggle }: {
  candidate: ProgressedDeadlineCandidate;
  selected: readonly DeadlineOverrideSelection[];
  applying: boolean;
  onToggle: (candidate: ProgressedDeadlineCandidate) => void;
}) {
  const selectable = candidateCanBeSelected(candidate);
  const pairs: Array<[string, string | null, string | null]> = [
    ["Protocol", candidate.deadline_protocol_cu, candidate.deadline_protocol_moi],
    ["Thẩm định", candidate.deadline_validation_cu, candidate.deadline_validation_moi],
    ["Báo cáo", candidate.deadline_report_cu, candidate.deadline_report_moi],
    ["VMP", candidate.deadline_vmp_cu, candidate.deadline_vmp_moi],
  ];
  return <article style={{ padding: "10px 0", borderTop: `1px solid ${C.pinkSoft}` }}>
    <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
      {selectable && <input type="checkbox" aria-label={`Chọn cập nhật deadline ${candidate.validation_code}`} checked={isSelected(selected, candidate)} disabled={applying} onChange={() => onToggle(candidate)} />}
      <div>
        <b>{candidate.validation_code}</b>
        {selectable ? <p style={{ margin: "3px 0", fontSize: 12, color: C.mintText }}>Có thể cập nhật riêng deadline kế hoạch; ngày thực tế và trạng thái giữ nguyên.</p> : <div style={{ fontSize: 12, color: C.raspText, marginTop: 3 }}>
          <b>Không thể cập nhật deadline</b>
          {candidate.blocker_reason && <div>{candidate.blocker_reason}</div>}
          {candidate.missing.length > 0 && <div>Không thể áp — thiếu: {candidate.missing.join(", ")}</div>}
          {!candidate.blocker_reason && candidate.missing.length === 0 && !candidateHasDeadlineChange(candidate) && <div>Không có deadline kế hoạch thay đổi.</div>}
        </div>}
        <ProgressEvidence candidate={candidate} />
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto 1fr", gap: "3px 7px", fontSize: 12 }}>
          {pairs.map(([label, oldDate, newDate]) => <div key={label} style={{ display: "contents" }}><span style={{ fontWeight: 700 }}>{label}</span><span style={{ color: C.plumSoft }}>{formatDate(oldDate)}</span><ArrowRight size={12} /><span style={{ fontWeight: 700 }}>{formatDate(newDate)}</span></div>)}
        </div>
      </div>
    </div>
  </article>;
}

export function CatalogImpactPreviewContent({ preview, loading, error, reason, reasonError, selected, confirmed, applying, onClose, isCloseLocked = () => false, onReason, onToggleOverride, onConfirmed, onApply }: {
  preview: AnhHuongTimelineV2 | null;
  loading: boolean;
  error: string | null;
  reason: string;
  reasonError: string | null;
  selected: readonly DeadlineOverrideSelection[];
  confirmed: boolean;
  applying: boolean;
  onClose: () => void;
  isCloseLocked?: () => boolean;
  onReason: (reason: string) => void;
  onToggleOverride: (candidate: ProgressedDeadlineCandidate) => void;
  onConfirmed: (confirmed: boolean) => void;
  onApply: () => void;
}) {
  const tao = preview?.tao ?? [];
  const sua = preview?.sua ?? [];
  const dung = preview?.dung ?? [];
  const giu = preview?.giu_nguyen ?? [];
  const canhBao = preview?.canh_bao ?? [];
  const deadlineOverrides = preview?.deadline_overrides ?? [];
  const normalCount = normalChangeCount(preview);
  const canApply = canApplyCatalogImpact({ normalChangeCount: normalCount, selected, reason, confirmed });
  const khongCoGi = !loading && !error && normalCount === 0 && deadlineOverrides.length === 0;
  const showApplyForm = normalCount > 0 || deadlineOverrides.length > 0;
  const card = (label: string, count: number, color: string) => <div style={{ padding: "8px 14px", borderRadius: 12, background: color, minWidth: 96 }}><div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.1 }}>{count}</div><div style={{ fontSize: 12, fontWeight: 600, color: C.plumSoft }}>{label}</div></div>;
  const close = () => { if (!applying) closeCatalogImpactIfIdle(isCloseLocked, onClose); };

  return <ViewportDialog
    open
    title="Ảnh hưởng tới timeline"
    description="Danh mục đã lưu rồi. Timeline chỉ đổi sau khi bạn xác nhận ở đây."
    maxWidth={880}
    onRequestClose={close}
    footer={<>
      <button type="button" onClick={close} disabled={applying} style={{ padding: "10px 16px", borderRadius: 12, cursor: applying ? "not-allowed" : "pointer", fontFamily: TEXT, fontWeight: 700, border: `1.5px solid ${C.pinkSoft}`, background: C.surface, color: C.plum }}>Để sau</button>
      <button type="button" onClick={onApply} disabled={applying || loading || !canApply.ok} style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 18px", borderRadius: 12, cursor: applying || loading || !canApply.ok ? "not-allowed" : "pointer", fontFamily: TEXT, fontWeight: 800, border: "none", background: applying || loading || !canApply.ok ? C.pinkSoft : C.pink, color: applying || loading || !canApply.ok ? C.plumSoft : "#fff" }}><Check size={16} /> {applying ? "Đang áp…" : "Áp vào timeline"}</button>
    </>}
  >
      {loading && <p style={{ color: C.plumSoft }}>Đang tính ảnh hưởng…</p>}
      {error && <div role="alert" style={{ display: "flex", gap: 8, padding: 10, borderRadius: 10, background: C.raspSoft, color: C.raspText, marginBottom: 12 }}><AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} /><span style={{ fontSize: 13 }}>{error}</span></div>}
      {preview && !loading && <>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>{card("Tạo mới", tao.length, C.mintSoft)}{card("Đổi deadline", sua.length, C.marigoldSoft)}{card("Dừng", dung.length, C.lavSoft)}{card("Giữ nguyên", giu.length, C.pinkSoft)}</div>
        {khongCoGi && <div style={{ display: "flex", gap: 8, padding: 10, borderRadius: 10, background: C.mintSoft, color: C.mintText, marginBottom: 14 }}><Check size={16} style={{ flexShrink: 0, marginTop: 2 }} /><span style={{ fontSize: 13 }}><b>Không có gì phải áp</b> — timeline đã khớp đúng dữ liệu danh mục hiện tại rồi.</span></div>}
        {canhBao.length > 0 && <div style={{ padding: 10, borderRadius: 10, background: C.marigoldSoft, color: C.marigoldText, marginBottom: 14, fontSize: 13 }}><b>Thiếu dữ liệu, mốc thời gian sẽ để trống:</b> {canhBao.join(" · ")}</div>}
        {sua.length > 0 && <section style={{ marginBottom: 14 }}><div style={{ fontSize: 13, fontWeight: 800, marginBottom: 6 }}>Deadline sẽ đổi</div>{sua.slice(0, 12).map((item) => <div key={item.validation_code} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, padding: "3px 0" }}><span style={{ minWidth: 210, fontWeight: 600 }}>{item.validation_code}</span><span style={{ color: C.plumSoft }}>{formatDate(item.deadline_vmp_cu)}</span><ArrowRight size={13} /><span style={{ fontWeight: 700 }}>{formatDate(item.deadline_vmp_moi)}</span></div>)}</section>}
        {tao.length > 0 && <section style={{ marginBottom: 14 }}><div style={{ fontSize: 13, fontWeight: 800, marginBottom: 6 }}>Hạng mục sẽ được tạo</div>{tao.slice(0, 12).map((item) => <div key={item.validation_code} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, padding: "3px 0" }}><Plus size={13} color={C.mintText} /><span style={{ minWidth: 210, fontWeight: 600 }}>{item.validation_code}</span><span style={{ color: C.plumSoft }}>{formatDate(item.deadline_vmp)}</span></div>)}</section>}
        {giu.length > 0 && <section style={{ marginBottom: 14, padding: 12, borderRadius: 12, background: C.bg2 }}><div style={{ fontSize: 13, fontWeight: 800, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}><Lock size={14} /> Giữ nguyên vì đã có tiến độ</div><p style={{ margin: "0 0 6px", fontSize: 12, color: C.plumSoft }}>Các hạng mục này chỉ đổi deadline kế hoạch khi được xác nhận đặc biệt bên dưới; ngày thực tế và trạng thái không bị thay đổi.</p>{giu.slice(0, 10).map((item) => <div key={item.validation_code} style={{ fontSize: 13, padding: "2px 0" }}><b>{item.validation_code}</b><span style={{ color: C.plumSoft }}> — {item.ly_do}</span></div>)}</section>}
        {deadlineOverrides.length > 0 && <section style={{ marginBottom: 14, padding: 12, borderRadius: 12, background: C.bg2 }}><div style={{ fontSize: 13, fontWeight: 800, marginBottom: 6 }}>Deadline của hạng mục đã có tiến độ</div>{deadlineOverrides.map((candidate) => <DeadlineCandidate key={`${candidate.validation_code}:${candidate.item_version}`} candidate={candidate} selected={selected} applying={applying} onToggle={onToggleOverride} />)}</section>}
        {showApplyForm && <label style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 14 }}><span style={{ fontSize: 12, fontWeight: 700 }}>Lý do áp <span style={{ color: C.raspText }}>*</span></span><input value={reason} disabled={applying} onChange={(event) => onReason(event.target.value)} placeholder="Câu này đi vào nhật ký, người sau đọc để hiểu vì sao timeline đổi." style={{ padding: "8px 10px", borderRadius: 10, fontFamily: TEXT, fontSize: 14, border: `1.5px solid ${reasonError ? C.rasp : C.pinkSoft}` }} />{reasonError && <span style={{ fontSize: 12, color: C.raspText, fontWeight: 600 }}>{reasonError}</span>}</label>}
        {selected.length > 0 && <label style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 14, fontSize: 13 }}><input type="checkbox" checked={confirmed} disabled={applying} onChange={(event) => onConfirmed(event.target.checked)} /><span>Tôi xác nhận chỉ cập nhật các deadline kế hoạch đã chọn; ngày thực tế và trạng thái giữ nguyên.</span></label>}
      </>}
  </ViewportDialog>;
}

export default function CatalogImpactPreview({ changeId, onClose, onApplied }: { changeId: string; onClose: () => void; onApplied: () => void }) {
  const [loadState, setLoadState] = useState<CatalogImpactPreviewLoadState>(() => beginCatalogImpactPreviewLoad(changeId));
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [selected, setSelected] = useState<DeadlineOverrideSelection[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [applying, setApplying] = useState(false);
  const coordinator = useRef(createCatalogImpactApplyCoordinator());
  const preview = loadState.changeId === changeId ? loadState.preview : null;
  const loading = loadState.changeId === changeId ? loadState.loading : true;
  const error = loadState.changeId === changeId ? loadState.error : null;

  useEffect(() => {
    let current = true;
    setLoadState(beginCatalogImpactPreviewLoad(changeId)); setReasonError(null); setSelected([]); setConfirmed(false); setReason("");
    previewCatalogChangeV2(changeId).then((result) => { if (current) setLoadState(finishCatalogImpactPreviewLoad(changeId, result)); }).catch((loadError: unknown) => { if (current) setLoadState(failCatalogImpactPreviewLoad(changeId, loadError)); });
    return () => { current = false; };
  }, [changeId]);

  const apply = async () => {
    if (coordinator.current.isBusy()) return;
    const normalCount = normalChangeCount(preview);
    const validation = canApplyCatalogImpact({ normalChangeCount: normalCount, selected, reason, confirmed });
    if (!validation.ok) { setReasonError(validation.reason); return; }
    setApplying(true); setLoadState((current) => ({ ...current, error: null })); setReasonError(null);
    const outcome = await coordinator.current.run({ changeId, reason, expectedTimelineRevision: preview?.timeline_revision ?? null, deadlineOverrides: selected, overrideConfirmed: confirmed, normalChangeCount: normalCount, mutate: applyCatalogChangeV2 });
    if (outcome.kind === "applied") onApplied();
    else if (outcome.kind === "rejected") setLoadState((current) => ({ ...current, error: outcome.message }));
    setApplying(false);
  };

  return <CatalogImpactPreviewContent preview={preview} loading={loading} error={error} reason={reason} reasonError={reasonError} selected={selected} confirmed={confirmed} applying={applying} onClose={onClose} isCloseLocked={() => coordinator.current.isBusy()} onReason={setReason} onToggleOverride={(candidate) => setSelected((current) => toggleDeadlineOverride(current, candidate))} onConfirmed={setConfirmed} onApply={() => { void apply(); }} />;
}
