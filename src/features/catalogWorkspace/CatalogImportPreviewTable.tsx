import { useMemo, useState } from "react";
import type {
  CatalogImportClassification,
  CatalogImportPreviewRow,
} from "./catalogImportPreviewContract.ts";
import {
  filterCatalogImportRows,
  type CatalogImportPreviewState,
} from "./catalogImportPreviewModel.ts";
import { layDataset } from "./definitions.ts";

const STATUS: Record<CatalogImportClassification, string> = {
  create: "Tạo mới",
  update: "Cập nhật",
  unchanged: "Không đổi",
  error: "Lỗi",
};
const FIELD_LABELS = new Map(layDataset("objects").fields.map((field) => [field.key, field.label]));

export interface CatalogImportRowDiff {
  field: string;
  label: string;
  before: string;
  after: string;
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (value === true) return "Có";
  if (value === false) return "Không";
  return String(value);
}

export function catalogImportRowDiff(row: CatalogImportPreviewRow): CatalogImportRowDiff[] {
  return Object.entries(row.patch).map(([field, after]) => ({
    field,
    label: FIELD_LABELS.get(field) ?? field,
    before: displayValue(row.currentSnapshot?.[field]),
    after: displayValue(after),
  }));
}

export interface CatalogImportPreviewTableProps {
  state: CatalogImportPreviewState;
  loadingMore: boolean;
  onLoadMore: () => void;
  onSaveRowReason: (
    rowNumber: number,
    reason: string,
  ) => Promise<{ ok: boolean; error?: string }>;
}

function DiffDetail({ row }: { row: CatalogImportPreviewRow }) {
  if (row.classification === "error") {
    return (
      <ul className="cw-import-preview__errors">
        {row.errors.map((error, index) => (
          <li key={`${error.code}-${index}`}>
            <b>{error.code}</b>: {error.message}{error.field ? ` · ${FIELD_LABELS.get(error.field) ?? error.field}` : ""}
          </li>
        ))}
      </ul>
    );
  }
  if (row.classification === "unchanged") {
    return <p className="cw-nhe">Server xác nhận dòng này không làm thay đổi dữ liệu.</p>;
  }
  const changes = catalogImportRowDiff(row);
  if (changes.length === 0) return <p className="cw-nhe">Không có trường thay đổi để hiển thị.</p>;
  return (
    <dl className="cw-import-a3">
      {changes.map((change) => (
        <div className="cw-import-a3__dong" key={change.field}>
          <dt>{change.label}</dt>
          <dd>
            <span className="cw-import-a3__truoc">{change.before}</span>
            <span aria-hidden="true">→</span>
            <span className="cw-import-a3__sau">{change.after}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

export default function CatalogImportPreviewTable({
  state, loadingMore, onLoadMore, onSaveRowReason,
}: CatalogImportPreviewTableProps) {
  const [search, setSearch] = useState("");
  const [classification, setClassification] = useState<CatalogImportClassification | "all">("all");
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState<number | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<number, string>>({});
  const [rowSaved, setRowSaved] = useState<Record<number, boolean>>({});
  const rows = useMemo(() => filterCatalogImportRows(state.rows, { search, classification }), [state.rows, search, classification]);
  const batch = state.batch;
  if (!batch) return null;

  const toggle = (rowNumber: number) => setExpanded((current) => {
    const next = new Set(current);
    if (next.has(rowNumber)) next.delete(rowNumber); else next.add(rowNumber);
    return next;
  });
  const saveReason = async (row: CatalogImportPreviewRow) => {
    const reason = drafts[row.rowNumber] ?? row.rowReason ?? "";
    setSaving(row.rowNumber);
    setRowErrors((current) => ({ ...current, [row.rowNumber]: "" }));
    setRowSaved((current) => ({ ...current, [row.rowNumber]: false }));
    const result = await onSaveRowReason(row.rowNumber, reason.trim());
    setSaving(null);
    if (!result.ok) setRowErrors((current) => ({ ...current, [row.rowNumber]: result.error ?? "Không lưu được lý do" }));
    else setRowSaved((current) => ({ ...current, [row.rowNumber]: true }));
  };

  return (
    <section className="cw-import-preview" aria-labelledby="cw-import-preview-title">
      <div className="cw-import-preview__head">
        <div>
          <h3 id="cw-import-preview-title">Đối chiếu do máy chủ xác nhận</h3>
          <p className="cw-nhe" aria-live="polite">Đã tải {state.loaded}/{batch.total} dòng</p>
        </div>
        <div className="cw-import-preview__summary" aria-label="Tổng phân loại từ máy chủ">
          <span className="cw-import-preview__metric is-create" data-cw-preview-count="create"><span>Tạo mới</span><b>{batch.counts.created}</b></span>
          <span className="cw-import-preview__metric is-update" data-cw-preview-count="update"><span>Cập nhật</span><b>{batch.counts.updated}</b></span>
          <span className="cw-import-preview__metric" data-cw-preview-count="unchanged"><span>Không đổi</span><b>{batch.counts.unchanged}</b></span>
          <span className="cw-import-preview__metric is-error" data-cw-preview-count="error"><span>Lỗi</span><b>{batch.counts.errors}</b></span>
        </div>
      </div>

      <div className="cw-import-preview__filters">
        <label>Tìm dòng đã tải
          <input className="cw-o" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Mã hoặc loại đối tượng" />
        </label>
        <label>Trạng thái
          <select className="cw-o" value={classification} onChange={(event) => setClassification(event.target.value as CatalogImportClassification | "all")}>
            <option value="all">Tất cả</option>
            {Object.entries(STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
      </div>

      <div className="cw-import-preview__scroll">
        <table data-cw-import-preview-table>
          <caption>Chi tiết các dòng đã được máy chủ đối chiếu</caption>
          <thead><tr><th>Dòng</th><th>Mã</th><th>Trạng thái</th><th>Thay đổi / lỗi</th><th>Lý do ngoại lệ</th></tr></thead>
          <tbody>
            {rows.map((row) => {
              const isExpanded = expanded.has(row.rowNumber);
              const detailId = `cw-import-preview-row-${row.rowNumber}`;
              const draft = drafts[row.rowNumber] ?? row.rowReason ?? "";
              return [
                <tr key={`row-${row.rowNumber}`}>
                  <td>{row.rowNumber}</td>
                  <td><b className="cw-ma">{row.businessKey}</b><small>{row.objectKind ?? "—"}</small></td>
                  <td><span className={`cw-tag cw-tag--imp-${row.classification}`}>{STATUS[row.classification]}</span></td>
                  <td><button type="button" className="cw-nut cw-nut--phu" aria-expanded={isExpanded} aria-controls={detailId} onClick={() => toggle(row.rowNumber)}>{isExpanded ? "Thu gọn" : "Xem chi tiết"}</button></td>
                  <td>
                    {row.classification === "create" || row.classification === "update" ? (
                      <div className="cw-import-preview__reason">
                        <label className="sr-only" htmlFor={`cw-import-row-reason-${row.rowNumber}`}>Lý do ngoại lệ dòng {row.rowNumber}</label>
                        <input id={`cw-import-row-reason-${row.rowNumber}`} className="cw-o" value={draft} onChange={(event) => { setDrafts((current) => ({ ...current, [row.rowNumber]: event.target.value })); setRowSaved((current) => ({ ...current, [row.rowNumber]: false })); }} placeholder="Không bắt buộc" />
                        <button type="button" className="cw-nut cw-nut--phu" disabled={saving === row.rowNumber} onClick={() => void saveReason(row)}>{saving === row.rowNumber ? "Đang lưu…" : "Lưu"}</button>
                        {rowErrors[row.rowNumber] && <span role="alert" className="cw-loi">{rowErrors[row.rowNumber]}</span>}
                        {rowSaved[row.rowNumber] && <span role="status" className="cw-nhe">Đã lưu</span>}
                      </div>
                    ) : "—"}
                  </td>
                </tr>,
                <tr key={`detail-${row.rowNumber}`} id={detailId} className="cw-import-preview__detail" hidden={!isExpanded}><td colSpan={5}><DiffDetail row={row} /></td></tr>,
              ];
            })}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <p className="cw-nhe">Không có dòng đã tải nào khớp bộ lọc.</p>}
      {state.nextCursor !== null && (
        <button type="button" className="cw-nut" disabled={loadingMore} onClick={onLoadMore}>
          {loadingMore ? "Đang tải…" : "Tải thêm"}
        </button>
      )}
    </section>
  );
}
