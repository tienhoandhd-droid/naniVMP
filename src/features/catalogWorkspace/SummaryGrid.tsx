/* =====================================================================
 *  SummaryGrid — "Bảng tổng quát" trong Dữ liệu nguồn
 *  ---------------------------------------------------------------------
 *  Mở ra là thấy MỌI hạng mục trong năm, không cần lọc. Tìm nhanh, bấm
 *  tiêu đề cột để sắp xếp, tiêu đề + cột mã luôn dính khi cuộn.
 *
 *  Sửa: nút "Sửa" mở đúng ProgressEditModal của màn Cập nhật tiến độ.
 *  Không truyền permissionMode → hộp tự hỏi server quyền từng ô
 *  (fetchTimelineFieldPermission), nên bảng này không mở lối ghi mới.
 * ===================================================================== */
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Download, Pencil, Search } from "lucide-react";
import ProgressEditModal from "../../components/dashboard/ProgressEditModal.tsx";
import { useToast } from "../../components/ui/ToastProvider.tsx";
import { xuatExcelAoa } from "../../lib/xuatExcel.ts";
import { progressValidationCode } from "../progress/editableProgressRights.ts";
import type { Activity } from "../../types/domain.ts";
import {
  buildSummaryRows, filterSummaryRows, ngayVn, sortSummaryRows, summaryCounts, summaryExportAoa,
  type SummaryRow, type SummarySortKey, type SummaryStage,
} from "./summaryGridModel.ts";

type OnUpdate = (
  id: string, patch: Record<string, unknown>, userName?: string, reason?: string, expectedVersion?: number,
) => unknown;

export interface SummaryGridProps {
  acts: readonly Activity[];
  /** "loading" | "ok" | "error"… lấy từ trạng thái tải dashboard của App. */
  loadStatus?: string;
  loadError?: string;
  onUpdate?: OnUpdate;
  onReload?: () => void;
  canChonNguoiThucHien?: boolean;
  canDoiTrangThai?: boolean;
  canAssignWorkshop?: boolean;
  /** Cùng luật với Xuất Excel ở tab Đối tượng: chỉ Admin/Quản lý QA. */
  canExport?: boolean;
}

const COT: Array<{ key: SummarySortKey; ten: string }> = [
  { key: "validationCode", ten: "Mã thẩm định" },
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

const CHIP: Array<{ id: "done" | "prog" | "over" | "todo" | "plan"; ten: string }> = [
  { id: "done", ten: "Hoàn thành" },
  { id: "prog", ten: "Đang thực hiện" },
  { id: "over", ten: "Quá hạn" },
  { id: "todo", ten: "Chưa thực hiện" },
  { id: "plan", ten: "Kế hoạch" },
];

function OGiaiDoan({ g }: { g: SummaryStage }) {
  return (
    <span className={`cw-tq-gd${g.done ? " is-xong" : g.label === "Đang làm" ? " is-dang" : ""}`}>
      {g.label}
      {g.date && <small>{ngayVn(g.date)}</small>}
    </span>
  );
}

export default function SummaryGrid({
  acts, loadStatus, loadError, onUpdate, onReload,
  canChonNguoiThucHien, canDoiTrangThai, canAssignWorkshop, canExport = false,
}: SummaryGridProps) {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [sapXep, setSapXep] = useState<{ key: SummarySortKey; dir: "asc" | "desc" }>({ key: "deadlineVmp", dir: "asc" });
  const [edit, setEdit] = useState<Activity | null>(null);
  const [dangXuat, setDangXuat] = useState(false);

  const tatCa = useMemo(() => buildSummaryRows(acts), [acts]);
  const dangThay = useMemo(
    () => sortSummaryRows(filterSummaryRows(tatCa, q), sapXep.key, sapXep.dir),
    [tatCa, q, sapXep],
  );
  const dem = useMemo(() => summaryCounts(dangThay), [dangThay]);

  const bamCot = (key: SummarySortKey) => setSapXep((cu) => (
    cu.key === key ? { key, dir: cu.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }
  ));

  const xuat = async () => {
    if (!canExport || dangXuat) return;
    setDangXuat(true);
    const progress = toast.dangChay("Đang xuất Excel…");
    try {
      await xuatExcelAoa([{ ten: "Bảng tổng quát", dong: summaryExportAoa(dangThay) }],
        `VMP_Bang_tong_quat_${new Date().toISOString().slice(0, 10)}.xlsx`);
      progress.xong(`Đã xuất ${dangThay.length} hạng mục.`);
    } catch (cause) {
      console.error("[Bảng tổng quát] Không xuất được Excel:", cause);
      progress.hong("Không xuất được Excel.");
    } finally {
      setDangXuat(false);
    }
  };

  /* Đủ 4 trạng thái: đang tải, lỗi, rỗng, có dữ liệu. */
  if (loadStatus === "loading" && tatCa.length === 0) {
    return <p className="cw-trong" role="status" data-cw-summary-state="loading">Đang tải hạng mục…</p>;
  }
  if (loadStatus === "error" && tatCa.length === 0) {
    return (
      <p className="cw-loi" role="alert" data-cw-summary-state="error">
        Chưa tải được hạng mục{loadError ? `: ${loadError}` : "."}{" "}
        {onReload && <button type="button" className="cw-nut cw-nut--phu" onClick={onReload}>Tải lại</button>}
      </p>
    );
  }
  if (tatCa.length === 0) {
    return <p className="cw-trong" data-cw-summary-state="empty">Chưa có hạng mục nào trong phạm vi được xem.</p>;
  }

  return (
    <div className="cw-tq" data-cw-summary-state="ready">
      <div className="cw-tq__thanh">
        <div className="cw-tim">
          <Search size={15} aria-hidden="true" className="cw-tim__icon" />
          <input className="cw-tim__o" aria-label="Tìm trong bảng tổng quát"
            placeholder="Tìm mã, tên, QA, bộ phận…" value={q}
            onChange={(e) => setQ(e.target.value)} />
        </div>
        {canExport && (
          <button type="button" className="cw-nut" onClick={xuat} disabled={dangXuat} aria-busy={dangXuat}>
            <Download size={15} aria-hidden="true" /> {dangXuat ? "Đang xuất…" : "Xuất Excel"}
          </button>
        )}
      </div>

      <p className="cw-tq__dem" data-cw-summary-count={dem.total}>
        <strong>{dem.total}</strong> hạng mục
        {CHIP.filter((c) => dem[c.id] > 0).map((c) => (
          <span key={c.id} className={`cw-tq-chip is-${c.id}`}>{c.ten} {dem[c.id]}</span>
        ))}
      </p>

      <div className="cw-tq__cuon">
        <table className="cw-tq__bang">
          <caption className="lp-visually-hidden">Bảng tổng quát hạng mục thẩm định</caption>
          <thead>
            <tr>
              {COT.map((c) => {
                const dang = sapXep.key === c.key;
                return (
                  <th key={c.key} scope="col"
                    aria-sort={dang ? (sapXep.dir === "asc" ? "ascending" : "descending") : "none"}>
                    <button type="button" className="cw-tq__th" onClick={() => bamCot(c.key)}>
                      {c.ten}
                      {dang && (sapXep.dir === "asc"
                        ? <ArrowUp size={12} aria-hidden="true" />
                        : <ArrowDown size={12} aria-hidden="true" />)}
                    </button>
                  </th>
                );
              })}
              <th scope="col"><span className="lp-visually-hidden">Thao tác</span></th>
            </tr>
          </thead>
          <tbody>
            {dangThay.length === 0 ? (
              <tr><td colSpan={COT.length + 1} className="cw-trong">Không có hạng mục khớp “{q}”.</td></tr>
            ) : dangThay.map((r: SummaryRow) => (
              <tr key={r.validationCode} className={`is-${r.status}`} data-cw-summary-row={r.validationCode}>
                <th scope="row" className="cw-tq__ma">{r.validationCode}</th>
                <td><span className="cw-tq__ten">{r.objectName}</span><small>{r.objectCode}</small></td>
                <td>{r.type}</td>
                <td>{r.department}</td>
                <td>{r.area}</td>
                <td>{r.line}</td>
                <td className="cw-tq__so">{r.frequency ?? ""}</td>
                <td>{r.owner}</td>
                <td>{r.support}</td>
                <td><OGiaiDoan g={r.protocol} /></td>
                <td><OGiaiDoan g={r.validation} /></td>
                <td><OGiaiDoan g={r.report} /></td>
                <td className="cw-tq__so">{ngayVn(r.deadlineVmp)}</td>
                <td><span className={`cw-tq-chip is-${r.status}`}>{r.statusLabel}</span></td>
                <td>
                  {onUpdate && (
                    <button type="button" className="cw-nut cw-nut--phu" aria-label={`Sửa ${r.validationCode}`}
                      onClick={() => setEdit(r.act)}>
                      <Pencil size={14} aria-hidden="true" /> Sửa
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {edit && onUpdate && (
        <ProgressEditModal
          key={progressValidationCode(edit)}
          act={edit}
          canChonNguoiThucHien={canChonNguoiThucHien}
          canDoiTrangThai={canDoiTrangThai}
          canAssignWorkshop={canAssignWorkshop}
          onClose={() => setEdit(null)}
          onReload={onReload}
          onSave={onUpdate}
        />
      )}
    </div>
  );
}
