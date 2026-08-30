/* =====================================================================
 *  CatalogSmartTable — bảng desktop + thẻ mobile của workspace Danh mục
 *  ---------------------------------------------------------------------
 *  MỘT view-model, HAI cách trình bày (spec §5.5): desktop dùng SmartTable
 *  (bảng ngữ nghĩa có <caption>), điện thoại dùng MobileTaskList. Cả hai
 *  nhận CÙNG mảng `rows`, cùng `rowKey`, cùng callback Cập nhật — nên không có
 *  chuyện hai bản cùng dữ liệu mà ra hai kết quả khác nhau.
 *
 *  Mỗi dataset có bộ cột RIÊNG (không ép ba dataset vào một schema): cột
 *  `priority: "supporting"` được CSS ẩn bớt ở khổ hẹp trước khi bảng phải
 *  cuộn ngang — danh tính, trạng thái và hành động luôn ở lại.
 * ===================================================================== */
import SmartTable from "../../components/ui/SmartTable.tsx";
import type { SmartTableColumn } from "../../components/ui/SmartTable.tsx";
import MobileTaskList from "../../components/ui/MobileTaskList.tsx";
import { DEPTS } from "../../constants/vmp.ts";
import type { CatalogDatasetId, CatalogListRow } from "./contracts.ts";

export interface CatalogSmartTableProps {
  dataset: CatalogDatasetId;
  rows: readonly CatalogListRow[];
  canEdit: boolean;
  onEdit: (row: CatalogListRow) => void;
  expandedRowId?: string | null;
  onExpandedRowChange?: (rowId: string | null) => void;
  empty?: string;
}

const TEN_BANG: Record<CatalogDatasetId, string> = {
  objects: "Đối tượng nguồn",
  products: "Sản phẩm GMP",
  alerts: "Người nhận cảnh báo",
};

const doc = (v: unknown): string =>
  v === null || v === undefined || v === "" ? "—" : String(v);

const tenBoPhan = (id: unknown): string => {
  const d = DEPTS.find((x) => x.id === String(id ?? ""));
  return d ? d.short : doc(id);
};

function TheTrangThai({ bat, nhanBat, nhanTat }: {
  bat: boolean; nhanBat: string; nhanTat: string;
}) {
  return (
    <span className={`cw-tag ${bat ? "cw-tag--bat" : "cw-tag--tat"}`}>
      {bat ? nhanBat : nhanTat}
    </span>
  );
}

/** Đối tượng có Thẩm định = y mà thiếu tháng đầu thì mọi mốc đều trống. */
const thieuThangDau = (d: Record<string, unknown>) =>
  String(d.validate_flag ?? "") === "y" && d.first_month == null;

function TrongYeu({ diem }: { diem: unknown }) {
  if (diem == null || diem === "") return <>—</>;
  const so = Number(diem);
  const bac = so >= 7 ? "cao" : so >= 4 ? "vua" : "thap";
  return <span className={`cw-tag cw-tag--ty-${bac}`}>{String(diem)}</span>;
}

function NutSua({ row, onEdit, label }: {
  row: CatalogListRow;
  onEdit: (r: CatalogListRow) => void;
  label: "Cập nhật" | "Sửa";
}) {
  return (
    <button type="button" className="cw-sua" data-cw-sua
      onClick={() => onEdit(row)}
      aria-label={`${label} ${row.businessKey}`}>
      {label}
    </button>
  );
}

function cotCua(
  dataset: CatalogDatasetId,
  canEdit: boolean,
  onEdit: (r: CatalogListRow) => void,
): SmartTableColumn<CatalogListRow>[] {
  const editLabel = dataset === "objects" ? "Cập nhật" : "Sửa";
  const sua: SmartTableColumn<CatalogListRow>[] = canEdit ? [{
    id: "sua", header: editLabel,
    align: "end",
    cell: (r) => <NutSua row={r} onEdit={onEdit} label={editLabel} />,
  }] : [];

  if (dataset === "objects") {
    return [
      { id: "doituong", header: "Đối tượng",
        cell: (r) => (
          <span className="cw-doi-tuong">
            <span className="cw-doi-tuong__ma cw-ma">{r.businessKey}</span>
            <span className="cw-doi-tuong__ten">{doc(r.data.object_name)}</span>
          </span>
        ) },
      { id: "phamvi", header: "Bộ phận · Khu vực", priority: "supporting",
        cell: (r) => [tenBoPhan(r.data.department), doc(r.data.area_code)]
          .filter((x) => x !== "—").join(" · ") || "—" },
      { id: "kehoach", header: "Lịch thẩm định",
        cell: (r) => (
          <span className="cw-ke-hoach">
            <TheTrangThai bat={String(r.data.validate_flag ?? "") === "y"}
              nhanBat="Thẩm định" nhanTat="Ngoài kế hoạch" />
            {thieuThangDau(r.data)
              ? <span className="cw-tag cw-tag--loi">thiếu tháng đầu</span>
              : r.data.first_month != null && (
                <span className="cw-nhe">
                  {`T${r.data.first_month} · ${doc(r.data.frequency_months)} tháng/lần`}
                </span>
              )}
          </span>
        ) },
      { id: "qa", header: "QA phụ trách", priority: "supporting",
        cell: (r) => doc(r.data.owner_name) },
      { id: "trongyeu", header: "Trọng yếu", priority: "supporting", align: "center",
        cell: (r) => <TrongYeu diem={r.data.criticality_score} /> },
      ...sua,
    ];
  }

  if (dataset === "products") {
    return [
      { id: "ma", header: "Mã BFO", cell: (r) => <b className="cw-ma">{r.businessKey}</b> },
      { id: "ten", header: "Tên sản phẩm", cell: (r) => doc(r.data.product_name) },
      { id: "dang", header: "Dạng bào chế", priority: "supporting",
        cell: (r) => doc(r.data.dosage_form) },
      { id: "line", header: "Dây chuyền", priority: "supporting",
        cell: (r) => doc(r.data.production_line) },
      { id: "colo", header: "Cỡ lô", priority: "supporting",
        cell: (r) => doc(r.data.batch_size) },
      { id: "trangthai", header: "Trạng thái", align: "center",
        cell: (r) => <TheTrangThai bat={r.data.is_active !== false}
          nhanBat="Đang dùng" nhanTat="Ngừng dùng" /> },
      ...sua,
    ];
  }

  return [
    { id: "email", header: "Email nhận", cell: (r) => <b className="cw-ma">{r.businessKey}</b> },
    { id: "ten", header: "Người nhận", priority: "supporting",
      cell: (r) => doc(r.data.recipient_name) },
    { id: "phamvi", header: "Phạm vi", priority: "supporting",
      cell: (r) => doc(r.data.scope_type) },
    { id: "loai", header: "Loại cảnh báo", priority: "supporting",
      cell: (r) => doc(r.data.alert_kind) },
    { id: "ai", header: "Báo cáo AI", priority: "supporting", align: "center",
      cell: (r) => <TheTrangThai bat={r.data.ai_report_enabled === true}
        nhanBat="Có" nhanTat="Không" /> },
    { id: "trangthai", header: "Trạng thái", align: "center",
      cell: (r) => <TheTrangThai bat={r.data.is_enabled !== false}
        nhanBat="Đang bật" nhanTat="Đã tắt" /> },
    ...sua,
  ];
}

/** Chi tiết một đối tượng nguồn — mọi cột không đáng chiếm chỗ trên bảng. */
function ChiTietDoiTuong({ row, canEdit, onEdit }: {
  row: CatalogListRow; canEdit: boolean; onEdit: (r: CatalogListRow) => void;
}) {
  const d = row.data;
  const muc: Array<[string, string]> = [
    ["Điểm trọng yếu", d.criticality_score == null ? "—"
      : `${d.criticality_score} (phức tạp ${doc(d.complexity_score)} × ảnh hưởng ${doc(d.quality_impact_score)})`],
    ["Nhóm công việc", doc(d.work_group)],
    ["Người hỗ trợ", doc(d.support_name)],
    ["Nhóm báo cáo", doc(d.report_class)],
    ["Số ngày công", doc(d.workdays)],
    ["Năm tham chiếu", doc(d.year_ref)],
    ["Dây chuyền", doc(d.line)],
    ["Tình trạng", doc(d.status)],
    ["Ghi chú", doc(d.note)],
    ["Phiên bản", `v${row.version}`],
  ];
  return (
    <div className="cw-chi-tiet">
      <dl className="cw-chi-tiet__luoi">
        {muc.map(([nhan, giaTri]) => (
          <div key={nhan} className="cw-chi-tiet__o">
            <dt>{nhan}</dt>
            <dd>{giaTri}</dd>
          </div>
        ))}
      </dl>
      <div className="cw-chi-tiet__chan">
        <span className="cw-nhe">
          Mỗi lần sửa đều có lý do và nằm ở mục Lịch sử.
        </span>
        {canEdit && <NutSua row={row} onEdit={onEdit} label="Cập nhật" />}
      </div>
    </div>
  );
}

/** Dòng tóm tắt cho thẻ mobile — mỗi dataset chọn 2–3 dữ kiện đắt nhất. */
function duKienThe(dataset: CatalogDatasetId, d: Record<string, unknown>): string[] {
  if (dataset === "objects") {
    const phamVi = [tenBoPhan(d.department), doc(d.area_code)]
      .filter((value) => value !== "—").join(" · ") || "—";
    return [
      doc(d.object_name),
      `Phạm vi: ${phamVi}`,
      `QA: ${doc(d.owner_name)}`,
      thieuThangDau(d) ? "Thiếu tháng thẩm định đầu tiên"
        : d.first_month != null
          ? `Lịch: T${d.first_month} · ${doc(d.frequency_months)} tháng/lần`
          : "Ngoài kế hoạch thẩm định",
    ];
  }
  if (dataset === "products") {
    return [doc(d.product_name), `${doc(d.dosage_form)} · ${doc(d.production_line)}`];
  }
  return [doc(d.recipient_name), `Phạm vi: ${doc(d.scope_type)} · ${doc(d.alert_kind)}`];
}

function theTrangThaiCua(dataset: CatalogDatasetId, d: Record<string, unknown>) {
  if (dataset === "objects") {
    return <TheTrangThai bat={String(d.validate_flag ?? "") === "y"}
      nhanBat="Thẩm định" nhanTat="Ngoài kế hoạch" />;
  }
  if (dataset === "products") {
    return <TheTrangThai bat={d.is_active !== false} nhanBat="Đang dùng" nhanTat="Ngừng dùng" />;
  }
  return <TheTrangThai bat={d.is_enabled !== false} nhanBat="Đang bật" nhanTat="Đã tắt" />;
}

export default function CatalogSmartTable({
  dataset, rows, canEdit, onEdit, expandedRowId, onExpandedRowChange, empty,
}: CatalogSmartTableProps) {
  const cot = cotCua(dataset, canEdit, onEdit);
  const editLabel = dataset === "objects" ? "Cập nhật" : "Sửa";
  const khoa = (r: CatalogListRow) => r.recordId;
  const khongCo = empty || "Không có dòng nào";

  return (
    <div className={`cw-bang cw-bang--${dataset}`}>
      <SmartTable<CatalogListRow>
        caption={TEN_BANG[dataset]}
        rows={rows}
        rowKey={khoa}
        columns={cot}
        empty={khongCo}
        renderExpandedRow={dataset === "objects"
          ? (r) => <ChiTietDoiTuong row={r} canEdit={canEdit} onEdit={onEdit} />
          : undefined}
        expandedRowId={dataset === "objects" ? expandedRowId : undefined}
        onExpandedRowChange={dataset === "objects" ? onExpandedRowChange : undefined}
      />

      <MobileTaskList<CatalogListRow>
        label={TEN_BANG[dataset]}
        rows={rows}
        rowKey={khoa}
        empty={khongCo}
        renderItem={(row) => (
          <div className="cw-the">
            <div className="cw-the__dau">
              <b className="cw-ma">{row.businessKey}</b>
              {theTrangThaiCua(dataset, row.data)}
            </div>
            {duKienThe(dataset, row.data).map((dong) => (
              <div key={dong} className="cw-the__dong">{dong}</div>
            ))}
            {canEdit && <NutSua row={row} onEdit={onEdit} label={editLabel} />}
          </div>
        )}
      />
    </div>
  );
}
