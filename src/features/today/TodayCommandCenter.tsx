/* =====================================================================
 * TodayCommandCenter — hàng đợi hành động quyền-aware cho màn Hôm nay.
 * =================================================================== */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import MetricGrid from "../../components/ui/MetricGrid.tsx";
import PriorityStrip from "../../components/ui/PriorityStrip.tsx";
import StateBoundary from "../../components/ui/StateBoundary.tsx";
import ValiIllustration from "../../components/brand/ValiIllustration.tsx";
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
function deadlineFact(row: TodayActionRow): string {
  if (!row.deadlineStage || row.daysRemaining === null) return `Đang chờ ${row.blockingStage}`;
  if (row.daysRemaining < 0) return `mốc ${row.deadlineStage} · trễ ${Math.abs(row.daysRemaining)} ngày`;
  if (row.daysRemaining === 0) return `mốc ${row.deadlineStage} · hạn hôm nay`;
  return `mốc ${row.deadlineStage} · còn ${row.daysRemaining} ngày`;
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
        <span className="hn-muc__han">{deadlineFact(row)}</span><span className="hn-muc__chu-so-huu">{row.ownerName}</span>
        <span className="hn-muc__phong">{row.department || "Chưa xác định phòng ban"}</span><span className="hn-muc__muc-do">{row.criticality || "Chưa xếp hạng"}</span>
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
    <h2 className="hn-nhom__ten">{meta.label} <span className="hn-nhom__dem">{rows.length}</span></h2>
    <ul className="hn-ds" aria-label={meta.label}>{rows.map((row) => <TodayQueueRow key={row.validationCode} row={row}
      expanded={expandedCode === row.validationCode} onToggle={() => onToggle(row.validationCode)} onOpenProgress={onOpenProgress} />)}</ul>
  </section>;
}

function TodaySupportingPane({ row, onOpenProgress }: { row: TodayActionRow | null; onOpenProgress: (link: ProgressDeepLink) => void }) {
  return <aside id="today-supporting-pane" className="hn-pane" aria-label="Chi tiết việc đang chọn">
    {row ? <div className="hn-pane__the">
      <span className={`hn-pane__nhom lp-tone--${SECTION_META[row.section].tone}`}>{SECTION_META[row.section].label}</span>
      <b className="hn-pane__ma">{row.validationCode}</b><p className="hn-pane__ten">{row.title}</p>
      <TodayRowDetails row={row} id={`today-pane-${detailId(row)}`} />
      {row.canEditProgress && <button type="button" className="hn-muc__nut" onClick={() => onOpenProgress(progressLink(row))}>Cập nhật tiến độ</button>}
    </div> : <div className="hn-pane__trong"><ValiIllustration mood="guide" size="small" />
      <p className="hn-pane__goi-y">Chọn một việc để xem các thông tin hỗ trợ trước khi cập nhật tiến độ.</p>
    </div>}
  </aside>;
}

export function TodayCommandCenterContent({
  model, rightsState, scopeLabel, updatedLabel, hasScopeFilters = false, onClearScope, onOpenProgress, onRetryRights,
}: TodayCommandCenterContentProps) {
  const [expandedCode, setExpandedCode] = useState<string | null>(null);
  const selectedRow = model.rows.find((row) => row.validationCode === expandedCode) ?? null;
  useEffect(() => { if (expandedCode !== null && selectedRow === null) setExpandedCode(null); }, [expandedCode, selectedRow]);
  const toggle = useCallback((code: string) => setExpandedCode((current) => current === code ? null : code), []);
  return <div className="hn-lotus">
    <p className="hn-mota">Hàng đợi gồm việc quá hạn, đến hạn hôm nay, trong bảy ngày tới và hồ sơ cần hoàn thiện.
      {scopeLabel && <span className="hn-mota__pham-vi">Phạm vi: {scopeLabel}</span>}
      {updatedLabel && <span className="hn-mota__moc">{updatedLabel}</span>}</p>
    <TodayRightsNotice status={rightsState.status} error={rightsState.error} onRetry={onRetryRights} />
    <MetricGrid label="Việc hôm nay" items={[
      { id: "overdue", label: "Quá hạn", value: model.kpis.overdue, tone: "danger", hint: "cần xử lý trước tiên" },
      { id: "today", label: "Hạn hôm nay", value: model.kpis.today, tone: "warning", hint: "cần theo dõi trong ngày" },
      { id: "upcoming", label: "Trong 7 ngày", value: model.kpis.upcoming, tone: "warning", hint: "chuẩn bị trước hạn" },
      { id: "incomplete", label: "Hồ sơ cần hoàn thiện", value: model.kpis.dataQuality, tone: "info", hint: "bổ sung thông tin còn thiếu" },
    ]} />
    {model.nextAction && <PriorityStrip label="Làm trước tiên" items={[{
      id: model.nextAction.validationCode, tone: SECTION_META[model.nextAction.section].tone, value: model.nextAction.validationCode,
      label: model.nextAction.title, hint: `Ưu tiên theo hạn, mức độ quan trọng và quyền cập nhật. ${deadlineFact(model.nextAction)}`,
      ...(model.nextAction.canEditProgress ? { onActivate: () => onOpenProgress(progressLink(model.nextAction!)) } : {}),
    }]} />}
    {model.rows.length === 0 ? (hasScopeFilters
      ? <StateBoundary state="filtered-empty" title="Không có việc trong phạm vi đã lọc"
          description={scopeLabel ? `Phạm vi hiện tại: ${scopeLabel}.` : "Phạm vi hiện tại không có việc phù hợp."} onClearFilters={onClearScope} />
      : <StateBoundary state="empty" title="Không còn việc gấp nào" description="Không có hạng mục quá hạn, đến hạn hôm nay, trong bảy ngày tới hoặc cần hoàn thiện." />
    ) : <div className="lp-supporting-layout hn-bo-cuc"><div className="hn-chinh">
      {(Object.keys(SECTION_META) as TodaySection[]).map((section) => <TodayQueueSection key={section} section={section}
        rows={model.sections[section]} expandedCode={expandedCode} onToggle={toggle} onOpenProgress={onOpenProgress} />)}
    </div><TodaySupportingPane row={selectedRow} onOpenProgress={onOpenProgress} /></div>}
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
