/* =====================================================================
 * TodayCommandCenter — hàng đợi hành động quyền-aware cho màn Hôm nay.
 * =================================================================== */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import MetricGrid from "../../components/ui/MetricGrid.tsx";
import StateBoundary from "../../components/ui/StateBoundary.tsx";
import { createProgressRightsGenerationGate, fetchMyEditableProgressRights } from "../../lib/supabaseData.ts";
import { createVisibleRefreshController } from "../../lib/visibleRefresh.ts";
import type { Activity } from "../../types/domain.ts";
import { indexEditableProgressRights, type EditableProgressRight } from "../progress/editableProgressRights.ts";
import { buildTodayActionModel, type ProgressDeepLink, type TodayActionModel, type TodayActionRow, type TodaySection } from "./todayModel.ts";

export interface TodayCommandCenterProps {
  acts: Activity[];
  scopeLabel?: string;
  updatedLabel?: string;
  state?: "loading" | "error" | "ready";
  onRetry?: () => void;
  onOpenProgress: (link: ProgressDeepLink) => void;
  now?: Date;
  hasScopeFilters?: boolean;
  onClearScope?: () => void;
}

type RightsState =
  | { status: "loading"; rights: ReadonlyMap<string, EditableProgressRight>; error: "" }
  | { status: "ready"; rights: ReadonlyMap<string, EditableProgressRight>; error: "" }
  | { status: "error"; rights: ReadonlyMap<string, EditableProgressRight>; error: string };

export interface TodayCommandCenterContentProps {
  model: TodayActionModel;
  rightsState: RightsState;
  scopeLabel?: string;
  updatedLabel?: string;
  hasScopeFilters?: boolean;
  onClearScope?: () => void;
  onOpenProgress: (link: ProgressDeepLink) => void;
  onRetryRights: () => void;
}

const EMPTY_RIGHTS: ReadonlyMap<string, EditableProgressRight> = new Map();
const SECTION_META: Record<TodaySection, { label: string; tone: "danger" | "warning" | "info" }> = {
  overdue: { label: "Quá hạn", tone: "danger" },
  today: { label: "Đến hạn hôm nay", tone: "warning" },
  upcoming: { label: "Trong 7 ngày tới", tone: "warning" },
  incomplete: { label: "Hồ sơ cần hoàn thiện", tone: "info" },
};

function rightsLoadingState(): RightsState { return { status: "loading", rights: EMPTY_RIGHTS, error: "" }; }
function bangkokDayKey(now: Date): string { return new Date(now.getTime() + 7 * 3_600_000).toISOString().slice(0, 10); }
function dateForBangkokDay(day: string): Date { return new Date(`${day}T00:00:00+07:00`); }
function detailId(row: TodayActionRow): string {
  const safeCode = row.validationCode.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "item";
  return `today-detail-${row.section}-${safeCode}`;
}
function progressLink(row: TodayActionRow): ProgressDeepLink {
  return { validationCode: row.validationCode, source: "today", reasons: row.reasons.map((reason) => reason.kind) };
}
/** Tên mốc đang chặn — cột "Mốc" trong bảng. */
function tenMoc(row: TodayActionRow): string {
  return row.deadlineStage ? row.deadlineStage : `Chờ ${row.blockingStage}`;
}
/** Số ngày còn/trễ — cột "Trễ" trong bảng. */
function soNgay(row: TodayActionRow): { chu: string; loai: "tre" | "homnay" | "con" | "trong" } {
  if (!row.deadlineStage || row.daysRemaining === null) return { chu: "—", loai: "trong" };
  if (row.daysRemaining < 0) return { chu: `trễ ${Math.abs(row.daysRemaining)} ngày`, loai: "tre" };
  if (row.daysRemaining === 0) return { chu: "hạn hôm nay", loai: "homnay" };
  return { chu: `còn ${row.daysRemaining} ngày`, loai: "con" };
}
function deadlineFact(row: TodayActionRow): string {
  if (!row.deadlineStage || row.daysRemaining === null) return `Đang chờ ${row.blockingStage}`;
  if (row.daysRemaining < 0) return `mốc ${row.deadlineStage} · trễ ${Math.abs(row.daysRemaining)} ngày`;
  if (row.daysRemaining === 0) return `mốc ${row.deadlineStage} · hạn hôm nay`;
  return `mốc ${row.deadlineStage} · còn ${row.daysRemaining} ngày`;
}

export type TodayValiMood = "urgent" | "concern" | "focus" | "guide" | "celebrate";

export interface TodayValiState {
  mood: TodayValiMood;
  nhan: string;
  loi: string;
}

/** Lời Vali mở đầu trang — dựng từ model, không bịa số. */
export function getTodayValiState(model: TodayActionModel): TodayValiState {
  const dau = model.nextAction;
  if (model.rows.length === 0) {
    return { mood: "celebrate", nhan: "nhẹ nhõm", loi: "Hôm nay nhẹ: không còn việc gấp nào trong phạm vi này." };
  }
  if (model.kpis.overdue >= 3 && dau) {
    return { mood: "urgent", nhan: "rất lo",
      loi: `Có ${model.kpis.overdue} việc quá hạn — mình đang rất lo. Xử lý ngay ${dau.validationCode} — ${dau.title}, ${deadlineFact(dau)}.` };
  }
  if (model.kpis.overdue > 0 && dau) {
    return { mood: "concern", nhan: "đang lo",
      loi: `Mình đếm được ${model.kpis.overdue} việc quá hạn. Nên bắt đầu từ ${dau.validationCode} — ${dau.title}, ${deadlineFact(dau)}.` };
  }
  if (model.kpis.today > 0 && dau) {
    return { mood: "focus", nhan: "tập trung",
      loi: `Hôm nay có ${model.kpis.today} việc đến hạn. Mình tập trung trước vào ${dau.validationCode} — ${dau.title}, ${deadlineFact(dau)}.` };
  }
  if (dau) {
    return { mood: "guide", nhan: "dẫn đường",
      loi: `Không có việc quá hạn. Gần nhất là ${dau.validationCode} — ${dau.title}, ${deadlineFact(dau)}.` };
  }
  return { mood: "guide", nhan: "dẫn đường", loi: "Mình đã xếp việc theo hạn, mức độ quan trọng và quyền cập nhật." };
}

function TodayRightsNotice({ status, error, onRetry }: Pick<RightsState, "status" | "error"> & { onRetry: () => void }) {
  if (status === "ready") return null;
  if (status === "loading") return <p className="hn-quyen hn-quyen--loading" role="status">Đang kiểm tra quyền cập nhật.</p>;
  return <div className="hn-quyen hn-quyen--error" role="alert">
    <p><b>Chưa xác minh được quyền cập nhật.</b> {error || "Không thể xác nhận quyền cập nhật tiến độ."}</p>
    <button type="button" className="hn-quyen__thu-lai" onClick={onRetry}>Thử lại quyền</button>
  </div>;
}

function TodayRowDetails({ row, id, hidden }: { row: TodayActionRow; id: string; hidden?: boolean }) {
  return <div id={id} className="hn-muc__chi-tiet hn-muc__chi-tiet--inline" role="region"
    aria-label={`Chi tiết ${row.validationCode}`} hidden={hidden}>
    <dl className="hn-chi-tiet__facts">
      <div><dt>Người phụ trách</dt><dd>{row.ownerName}</dd></div>
      <div><dt>Phòng ban</dt><dd>{row.department || "Chưa xác định"}</dd></div>
      <div><dt>Mức độ quan trọng</dt><dd>{row.criticality || "Chưa xếp hạng"}</dd></div>
      <div><dt>Đang chờ</dt><dd>{row.blockingStage}</dd></div>
      <div><dt>Hạn xử lý</dt><dd>{deadlineFact(row)}</dd></div>
      <div><dt>Quyền cập nhật</dt><dd>{row.permissionReason}</dd></div>
    </dl>
    <div className="hn-ly-do" aria-label={`Lý do ưu tiên ${row.validationCode}`}>
      {row.reasons.map((reason) => <span key={reason.kind} className="hn-ly-do__badge">{reason.label}</span>)}
    </div>
  </div>;
}

function TodayQueueRow({ row, expanded, onToggle, onOpenProgress }: {
  row: TodayActionRow; expanded: boolean; onToggle: () => void; onOpenProgress: (link: ProgressDeepLink) => void;
}) {
  const id = detailId(row);
  return <li className="hn-muc">
    <div className="hn-muc__tom-tat">
      <button type="button" className="hn-muc__mo hn-muc__mo--inline" aria-expanded={expanded} aria-controls={id} onClick={onToggle}>
        <b className="hn-muc__ma">{row.validationCode}</b><span className="hn-muc__ten">{row.title}</span>
      </button>
      <button type="button" className="hn-muc__mo hn-muc__mo--desktop" aria-expanded={expanded}
        aria-controls="today-supporting-pane" onClick={onToggle}>
        <b className="hn-muc__ma">{row.validationCode}</b><span className="hn-muc__ten">{row.title}</span>
      </button>
      <div className="hn-muc__thong-tin">
        <span className="hn-muc__moc">{tenMoc(row)}</span>
        <span className="hn-muc__nguoi"><b>{row.ownerName}</b></span>
        <span className={`hn-muc__tre hn-muc__tre--${soNgay(row).loai}`}>{soNgay(row).chu}</span>
        {/* Chuỗi gộp giữ trong DOM cho phần chi tiết và trình đọc màn hình. */}
        <span className="hn-muc__han">{deadlineFact(row)}</span><span className="hn-muc__chu-so-huu">{row.ownerName}</span>
        <span className="hn-muc__muc-do">{row.criticality || "Chưa xếp hạng"}</span>
        <span className="hn-muc__cho">Đang chờ {row.blockingStage}</span>
        <div className="hn-ly-do">{row.reasons.map((reason) => <span key={reason.kind} className="hn-ly-do__badge">{reason.label}</span>)}</div>
      </div>
      {row.canEditProgress
        ? <button type="button" className="hn-muc__nut" onClick={() => onOpenProgress(progressLink(row))}>Cập nhật tiến độ</button>
        : <button type="button" className="hn-muc__nut" onClick={onToggle}>Xem chi tiết</button>}
    </div>
    <TodayRowDetails row={row} id={id} hidden={!expanded} />
  </li>;
}

function TodayQueueSection({ section, rows, expandedCode, onToggle, onOpenProgress }: {
  section: TodaySection; rows: readonly TodayActionRow[]; expandedCode: string | null;
  onToggle: (code: string) => void; onOpenProgress: (link: ProgressDeepLink) => void;
}) {
  if (rows.length === 0) return null;
  const meta = SECTION_META[section];
  return <section className={`hn-nhom hn-nhom--${section} lp-tone--${meta.tone}`}>
    <h2 className="hn-nhom__ten">{meta.label} <span className="hn-nhom__dem">{rows.length}</span><span className="hn-nhom__phu">xếp theo hạn, mức độ quan trọng và quyền cập nhật</span></h2>
    {/* Hàng tiêu đề cột (đúng bản thiết kế) — chỉ để nhìn, bảng thật vẫn là danh sách có nút. */}
    <div className="hn-cot" aria-hidden="true"><span>Mã</span><span>Hạng mục</span><span>Mốc</span><span>QA phụ trách</span><span>Trễ</span><span></span></div>
    <ul className="hn-ds" aria-label={meta.label}>{rows.map((row) => <TodayQueueRow key={row.validationCode} row={row}
      expanded={expandedCode === row.validationCode} onToggle={() => onToggle(row.validationCode)} onOpenProgress={onOpenProgress} />)}</ul>
  </section>;
}

export function TodaySupportingPane({ row, onOpenProgress, onClearSelection }: {
  row: TodayActionRow | null;
  onOpenProgress: (link: ProgressDeepLink) => void;
  onClearSelection: () => void;
}) {
  return <aside id="today-supporting-pane" className={`hn-pane${row ? "" : " hn-pane--trong"}`} aria-label="Chi tiết việc đang chọn">
    {row ? <div className="hn-pane__the">
      <span className={`hn-pane__nhom lp-tone--${SECTION_META[row.section].tone}`}>{SECTION_META[row.section].label}</span>
      <b className="hn-pane__ma">{row.validationCode}</b><p className="hn-pane__ten">{row.title}</p>
      <TodayRowDetails row={row} id={`today-pane-${detailId(row)}`} />
      {row.canEditProgress && <button type="button" className="hn-muc__nut" onClick={() => onOpenProgress(progressLink(row))}>Cập nhật tiến độ</button>}
      <button type="button" className="hn-muc__nut" onClick={onClearSelection}>Bỏ chọn</button>
    </div> : null}
  </aside>;
}

export function TodayCommandCenterContent({
  model, rightsState, scopeLabel, updatedLabel, hasScopeFilters = false, onClearScope, onOpenProgress, onRetryRights,
}: TodayCommandCenterContentProps) {
  const [expandedCode, setExpandedCode] = useState<string | null>(null);
  const selectedRow = model.rows.find((row) => row.validationCode === expandedCode) ?? null;
  useEffect(() => { if (expandedCode !== null && selectedRow === null) setExpandedCode(null); }, [expandedCode, selectedRow]);
  const toggle = useCallback((code: string) => setExpandedCode((current) => current === code ? null : code), []);
  /* Vali đọc tình hình cùng người dùng (thiết kế 30/08): 5 mức riêng của
     màn Hôm nay, từ rất lo khi có >= 3 việc quá hạn đến nhẹ nhõm khi trống. */
  const vali = getTodayValiState(model);
  /* Bộ lọc theo nhóm (anh Hoàn chốt 30/08): bấm ô số liệu để chỉ xem nhóm đó,
     bấm lại để bỏ. Không lọc thì vẫn thấy đủ bốn nhóm như trước. */
  const [locNhom, setLocNhom] = useState<TodaySection | null>(null);
  const chonNhom = useCallback((section: TodaySection) => setLocNhom((current) => current === section ? null : section), []);
  const oSo = (id: TodaySection, label: string, value: number, tone: "danger" | "warning" | "info", hint: string) => ({
    id, label, value, tone, hint, selected: locNhom === id, onActivate: () => chonNhom(id),
  });
  const nhomHien = (Object.keys(SECTION_META) as TodaySection[]).filter((section) => locNhom === null || section === locNhom);
  const dau = model.nextAction;
  return <div className="hn-lotus">
    <section className="hn-hero" aria-label="Vali tóm tắt hôm nay">
      <div className="hn-hero__vali">
        <div className={`hn-vali hn-vali--${vali.mood}`} role="img" aria-label={`Công chúa Vali ${vali.nhan}`} />
        <span className="hn-vali__nhan">Vali · {vali.nhan}</span>
      </div>
      <div className="hn-hero__loi">
        <p className="hn-loi">{vali.loi}</p>
        <p className="hn-mota">Hàng đợi gồm việc quá hạn, đến hạn hôm nay, trong bảy ngày tới và hồ sơ cần hoàn thiện.
          {scopeLabel && <span className="hn-mota__pham-vi">Phạm vi: {scopeLabel}</span>}
          {updatedLabel && <span className="hn-mota__moc">{updatedLabel}</span>}</p>
        {/* "Làm trước tiên" gộp vào hero thành một nút (anh Hoàn chốt 30/08) —
            cùng đích với thẻ ưu tiên cũ: mở Cập nhật tiến độ đúng hạng mục;
            không có quyền sửa thì chỉ hiện chữ, không thành nút. */}
        {dau && <div className="hn-hero__uu-tien">
          <span className="hn-hero__eyebrow">Làm trước tiên</span>
          {dau.canEditProgress
            ? <button type="button" className="hn-hero__cta" title={`Ưu tiên theo hạn, mức độ quan trọng và quyền cập nhật. ${deadlineFact(dau)}`}
                onClick={() => onOpenProgress(progressLink(dau))}>
                Cập nhật {dau.validationCode}</button>
            : <span className="hn-hero__cta hn-hero__cta--chu" title={`Ưu tiên theo hạn, mức độ quan trọng và quyền cập nhật. ${deadlineFact(dau)}`}>{dau.validationCode} · {dau.title}</span>}
        </div>}
      </div>
      {/* Bốn ô số nằm NGAY TRONG hero (đúng bản thiết kế): ô "Quá hạn" là số
          lớn, ba ô còn lại xếp cột bên cạnh; vẫn là MetricGrid, vẫn bấm lọc. */}
      <div className="hn-hero__so">
        <MetricGrid label="Việc hôm nay" items={[
          oSo("overdue", "Quá hạn", model.kpis.overdue, "danger", "cần xử lý trước tiên"),
          oSo("today", "Hạn hôm nay", model.kpis.today, "warning", "cần theo dõi trong ngày"),
          oSo("upcoming", "Trong 7 ngày", model.kpis.upcoming, "warning", "chuẩn bị trước hạn"),
          oSo("incomplete", "Hồ sơ cần hoàn thiện", model.kpis.dataQuality, "info", "bổ sung thông tin còn thiếu"),
        ]} />
      </div>
    </section>
    <TodayRightsNotice status={rightsState.status} error={rightsState.error} onRetry={onRetryRights} />
    {model.rows.length === 0 ? (hasScopeFilters
      ? <StateBoundary state="filtered-empty" title="Không có việc trong phạm vi đã lọc"
          description={scopeLabel ? `Phạm vi hiện tại: ${scopeLabel}.` : "Phạm vi hiện tại không có việc phù hợp."} onClearFilters={onClearScope} />
      : <StateBoundary state="empty" title="Không còn việc gấp nào" description="Không có hạng mục quá hạn, đến hạn hôm nay, trong bảy ngày tới hoặc cần hoàn thiện." />
    ) : <div className="lp-supporting-layout hn-bo-cuc"><div className="hn-chinh">
      {locNhom !== null && model.sections[locNhom].length === 0 && <StateBoundary state="filtered-empty"
        title={`Nhóm "${SECTION_META[locNhom].label}" đang trống`} description="Bấm lại ô số liệu hoặc xoá bộ lọc để xem đủ bốn nhóm."
        onClearFilters={() => setLocNhom(null)} />}
      {nhomHien.map((section) => <TodayQueueSection key={section} section={section}
        rows={model.sections[section]} expandedCode={expandedCode} onToggle={toggle} onOpenProgress={onOpenProgress} />)}
    </div><TodaySupportingPane row={selectedRow} onOpenProgress={onOpenProgress}
      onClearSelection={() => setExpandedCode(null)} /></div>}
  </div>;
}

export default function TodayCommandCenter({
  acts, scopeLabel, updatedLabel, state = "ready", onRetry, onOpenProgress, now, hasScopeFilters, onClearScope,
}: TodayCommandCenterProps) {
  const rightsGate = useRef(createProgressRightsGenerationGate());
  const [rightsState, setRightsState] = useState<RightsState>(rightsLoadingState);
  const reloadRights = useCallback(async () => {
    const request = rightsGate.current.begin();
    setRightsState(rightsLoadingState());
    try {
      const rights = indexEditableProgressRights(await fetchMyEditableProgressRights());
      if (!rightsGate.current.isCurrent(request)) return;
      setRightsState({ status: "ready", rights, error: "" });
    } catch (cause) {
      if (!rightsGate.current.isCurrent(request)) return;
      setRightsState({ status: "error", rights: EMPTY_RIGHTS,
        error: cause instanceof Error ? cause.message : "Không thể xác nhận quyền cập nhật tiến độ" });
    }
  }, []);
  useEffect(() => {
    const controller = createVisibleRefreshController({ isVisible: () => document.visibilityState !== "hidden", refresh: reloadRights, coalesceMs: 1000 });
    void reloadRights();
    window.addEventListener("focus", controller.request);
    document.addEventListener("visibilitychange", controller.request);
    return () => { rightsGate.current.invalidate(); window.removeEventListener("focus", controller.request); document.removeEventListener("visibilitychange", controller.request); };
  }, [reloadRights]);
  const dayKey = bangkokDayKey(now ?? new Date());
  const modelNow = useMemo(() => dateForBangkokDay(dayKey), [dayKey]);
  const model = useMemo(() => buildTodayActionModel(acts, { now: modelNow, rights: rightsState.rights, rightsStatus: rightsState.status }),
    [acts, modelNow, rightsState.rights, rightsState.status]);
  if (state === "loading") return <StateBoundary state="loading" title="Đang tải việc hôm nay" skeletonRows={4} />;
  if (state === "error") return <StateBoundary state="error" title="Chưa tải được dữ liệu"
    description="Không đọc được danh sách hạng mục. Thử lại, hoặc kiểm tra kết nối." onRetry={onRetry} />;
  return <TodayCommandCenterContent model={model} rightsState={rightsState} scopeLabel={scopeLabel} updatedLabel={updatedLabel}
    hasScopeFilters={hasScopeFilters} onClearScope={onClearScope} onOpenProgress={onOpenProgress} onRetryRights={() => { void reloadRights(); }} />;
}
