/* =====================================================================
 *  progressWorkspaceModel.ts — model thuần của màn Tiến độ (Đợt B Task 12)
 *  ---------------------------------------------------------------------
 *  MỘT nơi tính KPI, vấn đề hồ sơ, dải ưu tiên, facet giai đoạn và danh
 *  sách dòng cho CẢ bảng desktop lẫn thẻ mobile. Hai bản trình bày đọc
 *  cùng một mảng — nên không thể có chuyện desktop nói 12 mà mobile nói
 *  11.
 *
 *  Luật đã chốt trong kế hoạch Đợt B Task 12:
 *   · "Có người phụ trách" CHỈ tính bằng ownerPersonId. Tên hiển thị,
 *     tên trùng nhau, hay supportPersonId không bao giờ được tính thay —
 *     tên là bản sao legacy, còn phân công thật đi bằng person_id.
 *   · Quá hạn = mốc CHƯA XONG gần nhất đứng trước hôm-nay-giờ-Bangkok.
 *   · needsAction đếm dòng active có ít nhất một vấn đề.
 *   · Độ hoàn thiện = % các phép kiểm bắt buộc đạt trên dòng active:
 *     có ownerPersonId, có deadline VMP, và (chỉ với dòng đã xong) có
 *     ngày VMP thực tế.
 *   · Facet giai đoạn đếm SAU tìm kiếm/trạng thái/ưu tiên nhưng TRƯỚC
 *     bộ lọc giai đoạn — bấm ô nào cũng ra đúng số ghi trên ô.
 *
 *  Không React, không Supabase — `node --test` chạy thẳng.
 * ===================================================================== */

import { mocKeTiep } from "../../lib/hanChot.ts";

export type ProgressIssue =
  | "missing_owner" | "missing_deadline" | "done_without_actual_vmp" | "stage_mismatch";

export type ProgressStageId = "protocol" | "validation" | "report" | "vmp" | "done";

export interface ProgressWorkspaceRow {
  validationCode: string;
  objectCode: string;
  title: string;
  objectType: string;
  ownerLabel: string;
  deadline: string | null;
  stageId: ProgressStageId;
  status: string;
  overdueDays: number;
  issues: readonly ProgressIssue[];
  canQuickDone: boolean;
}

export interface ProgressWorkspaceFilters {
  now: Date;
  query: string;
  status: string;               // "all" | "done" | "prog" | "todo" | …
  stage: string;                // "all" | ProgressStageId
  priority: string;             // "all" | "can_xu_ly"
}

export interface ProgressWorkspaceModel {
  kpis: {
    inProgress: number;
    needsAction: number;
    overdue: number;
    completenessPercent: number;
  };
  priorityRows: ProgressWorkspaceRow[];
  desktopRows: ProgressWorkspaceRow[];
  mobileRows: ProgressWorkspaceRow[];
  rowsBeforeStageFilter: ProgressWorkspaceRow[];
  facets: Record<"all" | ProgressStageId, number>;
}

/* Hàng vào là Activity đã enrich, nhưng model chỉ đòi phần nó dùng —
 * fixture của bộ kiểm không phải vác đủ 30 trường. */
export interface ProgressActivityLike {
  id?: string;
  validationCode?: string;
  code?: string;
  objectCode?: string;
  obj?: string;
  name?: string;
  type?: string;
  vtype?: string;
  st?: string;
  state?: string;
  owner?: string;
  ownerPersonId?: string | null;
  supportPersonId?: string | null;
  target?: string | null;
  dlProtocol?: string | null;
  dlValidation?: string | null;
  dlReport?: string | null;
  mismatch?: string | null;
  _raw?: Record<string, unknown> | null;
}

/** Ngày (YYYY-MM-DD) của mốc `now` theo giờ Bangkok — múi giờ vận hành. */
export function ngayBangkok(now: Date): string {
  return new Date(now.getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

const soNgayTre = (han: string, homNay: string): number =>
  Math.round((Date.parse(homNay) - Date.parse(han)) / 86_400_000);

function laActive(a: ProgressActivityLike): boolean {
  const st = a.state ?? (a._raw?.state as string | undefined) ?? "active";
  return st === "active";
}

function coOwnerId(a: ProgressActivityLike): boolean {
  const id = a.ownerPersonId ?? (a._raw?.owner_person_id as string | undefined);
  return id !== null && id !== undefined && String(id).trim() !== "";
}

/** Mốc CHƯA XONG gần nhất — nguồn của "quá hạn". Chọn mốc uỷ quyền cho
 *  mocKeTiep (lib/hanChot.ts, D2 31/08) — cùng một luật với các màn khác. */
function mocChuaXong(a: ProgressActivityLike): string | null {
  const raw = a._raw ?? {};
  const moc = mocKeTiep([
    { id: "protocol", hanISO: a.dlProtocol ?? null, xong: !!raw.protocol_done },
    { id: "validation", hanISO: a.dlValidation ?? null, xong: !!raw.validation_done },
    { id: "report", hanISO: a.dlReport ?? null, xong: !!raw.report_done },
    { id: "vmp", hanISO: a.target ?? null, xong: a.st === "done" },
  ]);
  return moc?.hanISO ?? null;
}

function giaiDoanCua(a: ProgressActivityLike): ProgressStageId {
  if (a.st === "done") return "done";
  const raw = a._raw ?? {};
  if (!raw.protocol_done) return "protocol";
  if (!raw.validation_done) return "validation";
  if (!raw.report_done) return "report";
  return "vmp";
}

function dungDong(a: ProgressActivityLike, homNay: string): ProgressWorkspaceRow {
  const issues: ProgressIssue[] = [];
  if (!coOwnerId(a)) issues.push("missing_owner");
  if (!a.target) issues.push("missing_deadline");
  if (a.st === "done" && !(a._raw?.ngay_vmp)) issues.push("done_without_actual_vmp");
  if (a.mismatch) issues.push("stage_mismatch");

  const moc = a.st === "done" ? null : mocChuaXong(a);
  const tre = moc && moc < homNay ? soNgayTre(moc, homNay) : 0;

  const stageId = giaiDoanCua(a);
  return {
    validationCode: String(a.validationCode ?? a.id ?? ""),
    objectCode: String(a.objectCode ?? a.obj ?? a.code ?? ""),
    title: String(a.name ?? a.code ?? a.validationCode ?? ""),
    objectType: String(a.vtype ?? a.type ?? ""),
    ownerLabel: String(a.owner ?? "").trim() || "Chưa phân công",
    deadline: a.target ?? null,
    stageId,
    status: String(a.st ?? "todo"),
    overdueDays: tre,
    issues,
    canQuickDone: laActive(a) && stageId !== "done",
  };
}

export function buildProgressWorkspaceModel(
  acts: readonly ProgressActivityLike[],
  loc: ProgressWorkspaceFilters,
): ProgressWorkspaceModel {
  const homNay = ngayBangkok(loc.now);

  /* Hạng mục đóng băng (không áp dụng / đã huỷ) đứng ngoài mọi con số:
     chúng không phải việc, đếm vào chỉ làm KPI kêu sai. */
  const active = acts.filter(laActive);
  const rows = active.map((a) => dungDong(a, homNay));

  /* ---- KPI trên toàn bộ dòng active (trước bộ lọc màn hình) ---- */
  let datDuoc = 0;
  let tongKiem = 0;
  for (const r of rows) {
    tongKiem += 2 + (r.status === "done" ? 1 : 0);
    if (!r.issues.includes("missing_owner")) datDuoc += 1;
    if (!r.issues.includes("missing_deadline")) datDuoc += 1;
    if (r.status === "done" && !r.issues.includes("done_without_actual_vmp")) datDuoc += 1;
  }
  const kpis = {
    inProgress: rows.filter((r) => r.status === "prog").length,
    needsAction: rows.filter((r) => r.issues.length > 0).length,
    overdue: rows.filter((r) => r.status !== "done" && r.overdueDays > 0).length,
    completenessPercent: tongKiem === 0 ? 100 : Math.round((datDuoc / tongKiem) * 100),
  };

  /* ---- Dải ưu tiên: vấn đề hồ sơ trước, trễ nặng trước, hạn gần trước ---- */
  const uuTien = rows
    .filter((r) => r.issues.length > 0 || r.overdueDays > 0)
    .sort((a, b) =>
      (b.issues.length > 0 ? 1 : 0) - (a.issues.length > 0 ? 1 : 0)
      || b.overdueDays - a.overdueDays
      || (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999")
      || a.validationCode.localeCompare(b.validationCode))
    .slice(0, 5);

  /* ---- Bộ lọc màn hình: tìm kiếm → trạng thái → ưu tiên → giai đoạn ---- */
  const kw = loc.query.trim().toLowerCase();
  const sauLoc = rows.filter((r) => {
    if (kw && ![r.validationCode, r.objectCode, r.title, r.ownerLabel, r.objectType]
      .some((x) => x.toLowerCase().includes(kw))) return false;
    if (loc.status !== "all" && r.status !== loc.status) return false;
    if (loc.priority === "can_xu_ly" && r.issues.length === 0) return false;
    return true;
  });

  const facets: ProgressWorkspaceModel["facets"] = {
    all: sauLoc.length, protocol: 0, validation: 0, report: 0, vmp: 0, done: 0,
  };
  for (const r of sauLoc) facets[r.stageId] += 1;

  const cuoiCung = loc.stage === "all"
    ? sauLoc
    : sauLoc.filter((r) => r.stageId === loc.stage);

  return {
    kpis,
    priorityRows: uuTien,
    desktopRows: cuoiCung,
    mobileRows: cuoiCung,
    rowsBeforeStageFilter: sauLoc,
    facets,
  };
}
