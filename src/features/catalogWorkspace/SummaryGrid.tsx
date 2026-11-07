/* =====================================================================
 *  SummaryGrid — "Bảng tổng quát" trong Dữ liệu nguồn
 *  ---------------------------------------------------------------------
 *  Mở ra là thấy MỌI hạng mục trong năm, không cần lọc. Tìm nhanh, bấm
 *  tiêu đề cột để sắp xếp, tiêu đề + cột mã luôn dính khi cuộn.
 *
 *  Sửa (07/11/2026 — ghi thẳng dữ liệu thật, mọi màn cùng đổi):
 *   · "Tiến độ" mở ProgressEditModal của màn Cập nhật tiến độ. Không truyền
 *     permissionMode → hộp tự hỏi server quyền từng ô.
 *   · "Đối tượng" nhờ Shell mở form Danh mục (QA, tần suất, bộ phận…) —
 *     chỉ hiện khi người xem có quyền sửa Danh mục.
 *  Lưu xong App tải lại dữ liệu nên bảng và các màn khác thấy giá trị mới.
 *  Hiện/ẩn cột: nhớ riêng trên máy người xem (localStorage).
 *  Bấm ô đếm (Quá hạn, Thiếu ngày VMP…) để chỉ xem nhóm đó; bấm lại để bỏ.
 * ===================================================================== */
import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Boxes, Columns3, Download, Pencil, Search } from "lucide-react";
import ProgressEditModal from "../../components/dashboard/ProgressEditModal.tsx";
import { useToast } from "../../components/ui/ToastProvider.tsx";
import { xuatExcelAoa } from "../../lib/xuatExcel.ts";
import { progressValidationCode } from "../progress/editableProgressRights.ts";
import type { Activity } from "../../types/domain.ts";
import {
  SUMMARY_COLUMNS, buildSummaryRows, chuanHoaCotAn, filterSummaryRows, locTheoNhom, ngayVn,
  nhomLocHieuLuc, sortSummaryRows, summaryCounts, summaryExportAoa,
  type SummaryGroup, type SummaryRow, type SummarySortKey, type SummaryStage,
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
  /** Có hàm này (người xem được sửa Danh mục) thì mỗi dòng có nút "Đối tượng". */
  onSuaDoiTuong?: (objectCode: string) => void;
}

const KHOA_NHO_COT = "vmp-bang-tong-quat-cot-an";

/* Lựa chọn cột là tiện ích riêng từng máy: đọc/ghi hỏng (trình duyệt chặn)
   thì vẫn hiện đủ cột, chỉ ghi cảnh báo — không chặn người dùng. */
function docCotAn(): Set<SummarySortKey> {
  try {
    const raw = window.localStorage.getItem(KHOA_NHO_COT);
    return chuanHoaCotAn(raw ? JSON.parse(raw) : null);
  } catch (cause) {
    console.warn("[Bảng tổng quát] Không đọc được lựa chọn cột đã nhớ:", cause);
    return new Set();
  }
}
function ghiCotAn(an: ReadonlySet<SummarySortKey>) {
  try {
    window.localStorage.setItem(KHOA_NHO_COT, JSON.stringify([...an]));
  } catch (cause) {
    console.warn("[Bảng tổng quát] Không nhớ được lựa chọn cột:", cause);
  }
}

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

/** Nội dung một ô theo cột (Mã thẩm định vẽ riêng làm tiêu đề dòng). */
function veO(r: SummaryRow, key: SummarySortKey) {
  switch (key) {
    case "objectName": return <><span className="cw-tq__ten">{r.objectName}</span><small>{r.objectCode}</small></>;
    case "type": return r.type;
    case "department": return r.department;
    case "area": return r.area;
    case "line": return r.line;
    case "frequency": return r.frequency ?? "";
    case "owner": return r.owner;
    case "support": return r.support;
    case "protocol": return <OGiaiDoan g={r.protocol} />;
    case "validation": return <OGiaiDoan g={r.validation} />;
    case "report": return <OGiaiDoan g={r.report} />;
    case "vmp": return <OGiaiDoan g={r.vmp} />;
    case "deadlineVmp": return ngayVn(r.deadlineVmp);
    case "status": return (
      <>
        <span className={`cw-tq-chip is-${r.status}`}>{r.statusLabel}</span>
        {r.thieuNgayVmp && <span className="cw-tq-chip is-over" data-cw-summary-missing-vmp-date
          title="Trạng thái VMP Hoàn thành nhưng chưa có ngày thực tế — bấm Tiến độ để nhập">Thiếu ngày VMP</span>}
      </>
    );
    default: return r.validationCode;
  }
}

export default function SummaryGrid({
  acts, loadStatus, loadError, onUpdate, onReload,
  canChonNguoiThucHien, canDoiTrangThai, canAssignWorkshop, canExport = false, onSuaDoiTuong,
}: SummaryGridProps) {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [sapXep, setSapXep] = useState<{ key: SummarySortKey; dir: "asc" | "desc" }>({ key: "deadlineVmp", dir: "asc" });
  const [edit, setEdit] = useState<Activity | null>(null);
  const [dangXuat, setDangXuat] = useState(false);
  const [nhom, setNhom] = useState<SummaryGroup | null>(null);
  const [anCot, setAnCot] = useState<Set<SummarySortKey>>(docCotAn);
  useEffect(() => { ghiCotAn(anCot); }, [anCot]);
  const cotHien = useMemo(() => SUMMARY_COLUMNS.filter((c) => !anCot.has(c.key)), [anCot]);
  const hien = (key: SummarySortKey) => !anCot.has(key);
  const doiCot = (key: SummarySortKey) => setAnCot((cu) => {
    const moi = new Set(cu);
    if (moi.has(key)) moi.delete(key); else moi.add(key);
    return moi;
  });

  const tatCa = useMemo(() => buildSummaryRows(acts), [acts]);
  /* Ô đếm đếm theo kết quả tìm (chưa lọc nhóm) để các nhóm khác vẫn hiện số và bấm chuyển được. */
  const theoTim = useMemo(() => filterSummaryRows(tatCa, q), [tatCa, q]);
  const dem = useMemo(() => summaryCounts(theoTim), [theoTim]);
  const nhomDangLoc = nhomLocHieuLuc(nhom, dem);
  const dangThay = useMemo(
    () => sortSummaryRows(locTheoNhom(theoTim, nhomDangLoc), sapXep.key, sapXep.dir),
    [theoTim, nhomDangLoc, sapXep],
  );
  const bamNhom = (id: SummaryGroup) => setNhom(nhomDangLoc === id ? null : id);

  const bamCot = (key: SummarySortKey) => setSapXep((cu) => (
    cu.key === key ? { key, dir: cu.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }
  ));

  const xuat = async () => {
    if (!canExport || dangXuat) return;
    setDangXuat(true);
    const progress = toast.dangChay("Đang xuất Excel…");
    try {
      await xuatExcelAoa([{ ten: "Bảng tổng quát", dong: summaryExportAoa(dangThay, anCot) }],
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
        <details className="cw-tq-cot" data-cw-summary-columns>
          <summary className="cw-nut">
            <Columns3 size={15} aria-hidden="true" /> Cột{anCot.size > 0 ? ` (ẩn ${anCot.size})` : ""}
          </summary>
          <div className="cw-tq-cot__khung" role="group" aria-label="Chọn cột hiển thị">
            {SUMMARY_COLUMNS.map((c) => (
              <label key={c.key} className="cw-tq-cot__muc">
                <input type="checkbox" checked={hien(c.key)} disabled={c.luonHien}
                  onChange={() => doiCot(c.key)} data-cw-summary-col={c.key} />
                {c.ten}
              </label>
            ))}
            <button type="button" className="cw-nut cw-nut--phu" disabled={anCot.size === 0}
              onClick={() => setAnCot(new Set())}>Hiện tất cả</button>
          </div>
        </details>
        {canExport && (
          <button type="button" className="cw-nut" onClick={xuat} disabled={dangXuat} aria-busy={dangXuat}>
            <Download size={15} aria-hidden="true" /> {dangXuat ? "Đang xuất…" : "Xuất Excel"}
          </button>
        )}
      </div>

      <p className="cw-tq__dem" data-cw-summary-count={dangThay.length}>
        <strong>{dangThay.length}</strong> hạng mục
        {CHIP.filter((c) => dem[c.id] > 0).map((c) => (
          <button key={c.id} type="button" data-cw-summary-group={c.id}
            className={`cw-tq-chip is-${c.id} cw-tq-chip--nut${nhomDangLoc === c.id ? " is-chon" : ""}`}
            aria-pressed={nhomDangLoc === c.id} onClick={() => bamNhom(c.id)}>
            {c.ten} {dem[c.id]}
          </button>
        ))}
        {dem.thieuNgayVmp > 0 && (
          <button type="button" data-cw-summary-missing-filter={dem.thieuNgayVmp}
            className={`cw-tq-chip is-over cw-tq-chip--nut${nhomDangLoc === "thieuNgayVmp" ? " is-chon" : ""}`}
            aria-pressed={nhomDangLoc === "thieuNgayVmp"} onClick={() => bamNhom("thieuNgayVmp")}>
            ⚠ Thiếu ngày VMP {dem.thieuNgayVmp}
          </button>
        )}
        {nhomDangLoc && (
          <button type="button" className="cw-nut cw-nut--phu" onClick={() => setNhom(null)}>Bỏ lọc</button>
        )}
      </p>

      <div className="cw-tq__cuon">
        <table className="cw-tq__bang">
          <caption className="lp-visually-hidden">Bảng tổng quát hạng mục thẩm định</caption>
          <thead>
            <tr>
              {cotHien.map((c) => {
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
              <tr><td colSpan={cotHien.length + 1} className="cw-trong">
                {q.trim() ? `Không có hạng mục khớp “${q.trim()}”.` : "Không có hạng mục nào."}
              </td></tr>
            ) : dangThay.map((r: SummaryRow) => (
              <tr key={r.validationCode} className={`is-${r.status}`} data-cw-summary-row={r.validationCode}>
                {cotHien.map((c) => c.key === "validationCode"
                  ? <th key={c.key} scope="row" className="cw-tq__ma">{r.validationCode}</th>
                  : <td key={c.key} className={c.key === "frequency" || c.key === "deadlineVmp" ? "cw-tq__so" : undefined}>
                      {veO(r, c.key)}
                    </td>)}
                <td>
                  <span className="cw-tq__hanh-dong">
                    {onUpdate && (
                      <button type="button" className="cw-nut cw-nut--phu" aria-label={`Sửa tiến độ ${r.validationCode}`}
                        onClick={() => setEdit(r.act)}>
                        <Pencil size={14} aria-hidden="true" /> Tiến độ
                      </button>
                    )}
                    {onSuaDoiTuong && r.objectCode && (
                      <button type="button" className="cw-nut cw-nut--phu" aria-label={`Sửa đối tượng ${r.objectCode}`}
                        data-cw-summary-object={r.objectCode} onClick={() => onSuaDoiTuong(r.objectCode)}>
                        <Boxes size={14} aria-hidden="true" /> Đối tượng
                      </button>
                    )}
                  </span>
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
