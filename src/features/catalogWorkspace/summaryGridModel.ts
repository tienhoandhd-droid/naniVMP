/* =====================================================================
 *  summaryGridModel — logic thuần của "Bảng tổng quát" ở Dữ liệu nguồn
 *  ---------------------------------------------------------------------
 *  Một dòng = một hạng mục thẩm định trong năm, đủ cột để nhìn nhanh mà
 *  không phải lọc. Dữ liệu lấy từ danh sách hạng mục App đã tải sẵn
 *  (rpc_get_vmp_dashboard_v2, server đã lọc theo quyền) — không gọi
 *  thêm RPC nào, nên không có đường đọc/ghi mới phải kiểm quyền.
 *
 *  Tách khỏi component để test được bằng node:test (không cần trình duyệt).
 * ===================================================================== */
import { DEPTS, STATUS } from "../../constants/vmp.ts";
import type { Activity } from "../../types/domain.ts";

export interface SummaryStage {
  /** Nhãn hiển thị: Hoàn thành / Đang làm / Chưa làm. */
  label: string;
  done: boolean;
  /** Ngày thực tế yyyy-mm-dd, "" khi chưa có. */
  date: string;
}

export interface SummaryRow {
  validationCode: string;
  objectCode: string;
  objectName: string;
  type: string;
  department: string;
  area: string;
  line: string;
  frequency: number | null;
  owner: string;
  support: string;
  protocol: SummaryStage;
  validation: SummaryStage;
  report: SummaryStage;
  deadlineVmp: string;
  /** Trạng thái tổng do server kết luận: plan | todo | prog | done | over. */
  status: string;
  statusLabel: string;
  daysLeft: number | null;
  /** Trạng thái VMP = Hoàn thành nhưng chưa có ngày thực tế VMP (cần nhập bổ sung). */
  thieuNgayVmp: boolean;
  /** Hạng mục gốc — truyền nguyên cho ProgressEditModal khi bấm Sửa. */
  act: Activity;
}

export type SummarySortKey =
  | "validationCode" | "objectName" | "type" | "department" | "area" | "line"
  | "frequency" | "owner" | "support" | "protocol" | "validation" | "report"
  | "deadlineVmp" | "status";

const NHAN_GIAI_DOAN: Record<string, string> = {
  completed: "Hoàn thành",
  in_progress: "Đang làm",
  not_started: "Chưa làm",
};
const TEN_BO_PHAN: Record<string, string> = Object.fromEntries(DEPTS.map((d) => [d.id, d.name]));

function chu(value: unknown): string {
  return value === null || value === undefined ? "" : String(value).trim();
}

function giaiDoan(raw: Record<string, unknown>, tt: string, ngay: string): SummaryStage {
  const ma = chu(raw[tt]);
  return {
    label: NHAN_GIAI_DOAN[ma] ?? (ma || "Chưa làm"),
    done: ma === "completed",
    date: chu(raw[ngay]).slice(0, 10),
  };
}

export function buildSummaryRows(acts: readonly Activity[]): SummaryRow[] {
  return acts.map((act) => {
    const raw = (act._raw || {}) as Record<string, unknown>;
    const owner = chu(act.owner);
    const tanSuat = act.freq ?? raw.tan_suat;
    const status = chu(act.st);
    return {
      validationCode: chu(act.id),
      objectCode: chu(act.obj || act.code),
      objectName: chu(act.name || act.objName),
      type: chu(act.vtype || act.type),
      department: chu(raw.bo_phan) || TEN_BO_PHAN[chu(act.dept)] || chu(act.dept),
      area: chu(raw.khu_vuc || act.area),
      line: chu(raw.line || act.line),
      frequency: tanSuat === null || tanSuat === undefined || tanSuat === "" ? null : Number(tanSuat),
      /* Server trả "—" khi chưa gán QA; hiện như tên người thì sai nghĩa. */
      owner: owner === "—" ? "" : owner,
      support: chu(act.support),
      protocol: giaiDoan(raw, "tt_de_cuong", "ngay_de_cuong"),
      validation: giaiDoan(raw, "tt_tham_dinh", "ngay_tham_dinh"),
      report: giaiDoan(raw, "tt_bao_cao", "ngay_bao_cao"),
      deadlineVmp: chu(raw.dl_vmp || act.target).slice(0, 10),
      status,
      statusLabel: STATUS[status as keyof typeof STATUS]?.label ?? status,
      daysLeft: typeof act.daysLeft === "number" ? act.daysLeft : null,
      thieuNgayVmp: chu(raw.tt_vmp) === "completed" && !chu(raw.ngay_vmp),
      act,
    };
  });
}

/** Bỏ dấu + chữ thường để gõ "khi nen" vẫn ra "Khí nén". */
function chuanHoa(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
}

export function filterSummaryRows(rows: readonly SummaryRow[], query: string): SummaryRow[] {
  const q = chuanHoa(query.trim());
  if (!q) return [...rows];
  return rows.filter((row) => chuanHoa([
    row.validationCode, row.objectCode, row.objectName, row.type, row.department,
    row.area, row.line, row.owner, row.support, row.statusLabel,
  ].join(" ")).includes(q));
}

function giaTriSapXep(row: SummaryRow, key: SummarySortKey): string | number {
  switch (key) {
    case "frequency": return row.frequency ?? "";
    case "protocol": return row.protocol.date || row.protocol.label;
    case "validation": return row.validation.date || row.validation.label;
    case "report": return row.report.date || row.report.label;
    case "status": return row.statusLabel;
    default: return row[key];
  }
}

/** Sắp xếp ổn định trên bản sao. Ô trống luôn nằm cuối dù tăng hay giảm. */
export function sortSummaryRows(
  rows: readonly SummaryRow[], key: SummarySortKey, dir: "asc" | "desc",
): SummaryRow[] {
  const heSo = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = giaTriSapXep(a, key);
    const y = giaTriSapXep(b, key);
    if (x === "" && y === "") return 0;
    if (x === "") return 1;
    if (y === "") return -1;
    const ss = typeof x === "number" && typeof y === "number"
      ? x - y
      : String(x).localeCompare(String(y), "vi", { numeric: true });
    return ss * heSo;
  });
}

export function summaryCounts(rows: readonly SummaryRow[]) {
  const dem = { total: rows.length, done: 0, over: 0, prog: 0, todo: 0, plan: 0, thieuNgayVmp: 0 };
  for (const row of rows) {
    if (["done", "over", "prog", "todo", "plan"].includes(row.status)) dem[row.status as "done"] += 1;
    if (row.thieuNgayVmp) dem.thieuNgayVmp += 1;
  }
  return dem;
}

export function ngayVn(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/** Cột của bảng, theo thứ tự hiển thị. Mã thẩm định luôn hiện (chỗ bám khi cuộn). */
export const SUMMARY_COLUMNS: ReadonlyArray<{ key: SummarySortKey; ten: string; luonHien?: boolean }> = [
  { key: "validationCode", ten: "Mã thẩm định", luonHien: true },
  { key: "objectName", ten: "Đối tượng" },
  { key: "type", ten: "Loại" },
  { key: "department", ten: "Bộ phận" },
  { key: "area", ten: "Khu vực" },
  { key: "line", ten: "Line" },
  { key: "frequency", ten: "Tần suất" },
  { key: "owner", ten: "QA phụ trách" },
  { key: "support", ten: "QA hỗ trợ" },
  { key: "protocol", ten: "Đề cương" },
  { key: "validation", ten: "Thẩm định" },
  { key: "report", ten: "Báo cáo" },
  { key: "deadlineVmp", ten: "Hạn VMP" },
  { key: "status", ten: "Tình trạng" },
];

const KHOA_CO_THE_AN: ReadonlySet<string> = new Set(
  SUMMARY_COLUMNS.filter((c) => !c.luonHien).map((c) => c.key));

/** Đọc danh sách cột ẩn đã nhớ: bỏ khoá lạ, không bao giờ ẩn Mã thẩm định.
 *  Dữ liệu nhớ hỏng (không phải mảng) thì coi như hiện tất cả. */
export function chuanHoaCotAn(value: unknown): Set<SummarySortKey> {
  if (!Array.isArray(value)) return new Set();
  return new Set(value.filter((k): k is SummarySortKey =>
    typeof k === "string" && KHOA_CO_THE_AN.has(k)));
}

/* Mỗi cột Excel gắn với cột bảng (key) để ẩn trên bảng thì file cũng ẩn theo. */
const COT_XUAT: Array<[SummarySortKey, string, (r: SummaryRow) => string | number]> = [
  ["validationCode", "Mã thẩm định", (r) => r.validationCode],
  ["objectName", "Mã đối tượng", (r) => r.objectCode],
  ["objectName", "Tên đối tượng", (r) => r.objectName],
  ["type", "Loại", (r) => r.type],
  ["department", "Bộ phận", (r) => r.department],
  ["area", "Khu vực", (r) => r.area],
  ["line", "Line", (r) => r.line],
  ["frequency", "Tần suất (tháng)", (r) => r.frequency ?? ""],
  ["owner", "QA phụ trách", (r) => r.owner],
  ["support", "QA hỗ trợ", (r) => r.support],
  ["protocol", "Đề cương", (r) => r.protocol.label],
  ["protocol", "Ngày đề cương", (r) => ngayVn(r.protocol.date)],
  ["validation", "Thẩm định", (r) => r.validation.label],
  ["validation", "Ngày thẩm định", (r) => ngayVn(r.validation.date)],
  ["report", "Báo cáo", (r) => r.report.label],
  ["report", "Ngày báo cáo", (r) => ngayVn(r.report.date)],
  ["deadlineVmp", "Hạn VMP", (r) => ngayVn(r.deadlineVmp)],
  ["status", "Tình trạng", (r) => r.statusLabel],
];

/** Xuất đúng các cột đang hiện trên bảng (người dùng chốt 07/11/2026). */
export function summaryExportAoa(
  rows: readonly SummaryRow[], anCot: ReadonlySet<SummarySortKey> = new Set(),
): Array<Array<string | number>> {
  const cot = COT_XUAT.filter(([key]) => !anCot.has(key));
  return [cot.map(([, ten]) => ten), ...rows.map((row) => cot.map(([, , lay]) => lay(row)))];
}
