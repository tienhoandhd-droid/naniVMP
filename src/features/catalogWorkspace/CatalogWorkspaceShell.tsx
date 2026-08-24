/* =====================================================================
 *  CatalogWorkspaceShell — workspace sáu mục của màn Danh mục & Nhập liệu
 *  ---------------------------------------------------------------------
 *  Một thanh dữ liệu bên trái (sáu mục cố định: objects · products ·
 *  alerts · import · pending · history) và một vùng làm việc bên phải.
 *  Quyền quyết định thấy gì:
 *
 *    · canEdit  = access.can("source", "edit_catalog") — mở lối Thêm/Sửa
 *      và mục Nhập Excel. KHÔNG đọc user.perm: quyền màn hình do server
 *      trả về qua rpc_my_ui_access, giao diện chỉ trình bày lại.
 *    · Mục "Chờ áp dụng" cần thêm generate_timeline — ai không được sinh
 *      timeline thì hàng đợi thay đổi timeline không liên quan tới họ.
 *
 *  Ẩn nút không phải là bảo mật — RPC phía server vẫn tự chặn. Đây chỉ là
 *  không bày ra lối đi chắc chắn thất bại.
 *
 *  Ba dataset dùng CÙNG bộ trình bày (CatalogSmartTable): desktop bảng,
 *  điện thoại thẻ, cùng một mảng dòng. Đối tượng nguồn đọc theo loại như
 *  cũ (fetchSourceObjects); Sản phẩm GMP và Người nhận cảnh báo đọc qua
 *  rpc_list_catalog_dataset — phân trang và đếm tổng ở server, 25 dòng
 *  mỗi trang, gõ tìm kiếm chờ 250 ms, và mỗi request mang một số thứ tự
 *  tăng dần để câu trả lời cũ không đè được câu trả lời mới.
 * ===================================================================== */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bell, Boxes, CalendarPlus, Check, Download, FileSpreadsheet, FlaskConical,
  History, Hourglass, Plus, RefreshCw, Search,
} from "lucide-react";

import CommandBar from "../../components/ui/CommandBar.tsx";
import { useToast } from "../../components/ui/ToastProvider.tsx";
import StateBoundary from "../../components/ui/StateBoundary.tsx";
import ViewportDialog from "../../components/ui/ViewportDialog.tsx";
import CatalogObjectForm from "../../components/catalog/CatalogObjectForm.tsx";
import CatalogImpactPreview from "../../components/catalog/CatalogImpactPreview.tsx";
import CatalogWarningsSummary, { type CatalogWarning } from "../../components/catalog/CatalogWarningsSummary.tsx";
import { usePerformers } from "../../hooks/index.ts";
import { buildActivePerformerChoices } from "../itemPermissions/performerSelection.ts";
import {
  SOURCE_KINDS, fetchSourceObjects, fetchSourceWarnings, generateTimeline,
  saveCatalogObject,
} from "../../lib/supabaseData.ts";
import { useCatalogSuggestions } from "./useCatalogSuggestions.ts";
import { xuatExcelAoa } from "../../lib/xuatExcel.ts";
import type { SourceWarnings } from "../../lib/supabaseData.ts";
import type { AccessContext } from "../../lib/access.ts";
import type { GenerateTimelineResult, ObjectKind, SourceObjectRow } from "../../types/domain.ts";
import CatalogSmartTable from "./CatalogSmartTable.tsx";
import CatalogRecordDialog from "./CatalogRecordDialog.tsx";
import CatalogExcelImport from "./CatalogExcelImport.tsx";
import { listDataset, listHistory, listPendingChanges } from "./api.ts";
import { layDataset } from "./definitions.ts";
import type {
  CatalogAuditRow, CatalogChangeRow, CatalogDatasetId, CatalogListRow, CatalogRecord,
} from "./contracts.ts";

const PAGE_SIZE = 25;
const DO_TRE_TIM_KIEM_MS = 250;

/** Sáu mục của workspace — thứ tự này là hợp đồng, có bộ kiểm giữ. */
type VungId = "objects" | "products" | "alerts" | "import" | "pending" | "history";

const CAC_VUNG: Array<{
  id: VungId; nhan: string; icon: typeof Boxes;
  canSua?: boolean; canSinhTimeline?: boolean; canAudit?: boolean;
}> = [
  { id: "objects", nhan: "Đối tượng", icon: Boxes },
  { id: "products", nhan: "Sản phẩm GMP", icon: FlaskConical },
  { id: "alerts", nhan: "Người nhận cảnh báo", icon: Bell },
  { id: "import", nhan: "Nhập Excel", icon: FileSpreadsheet, canSua: true },
  { id: "pending", nhan: "Chờ áp dụng", icon: Hourglass, canSua: true, canSinhTimeline: true },
  { id: "history", nhan: "Lịch sử", icon: History, canAudit: true },
];

export interface CatalogWorkspaceShellProps {
  access: AccessContext;
  scopeLabel?: string;
  updatedLabel?: string;
  /** Deep-link từ màn Tiến độ: mở đúng đối tượng rồi tự xoá (một lần). */
  focus?: { code: string; nhom?: string } | null;
  onFocusConsumed?: () => void;
  /** Gọi khi timeline có thể đã đổi — App tải lại dashboard. */
  onReload?: () => void;
}

type TrangThaiTai = "loading" | "error" | "ready";

export default function CatalogWorkspaceShell({
  access, scopeLabel, updatedLabel, focus, onFocusConsumed, onReload,
}: CatalogWorkspaceShellProps) {
  const canEdit = access.can("source", "edit_catalog");
  const canSinhTimeline = access.can("source", "generate_timeline");
  const canAudit = access.canView("audit");

  const { performers } = usePerformers();
  const performerChoices = buildActivePerformerChoices(performers);
  const toast = useToast();
  /* Gợi ý nhập nạp một lượt cho cả màn: mở hộp thoại rồi mới gọi mạng thì
     danh sách hiện sau con trỏ, và người dùng đã gõ xong nửa chữ. */
  const goiY = useCatalogSuggestions();

  const vungHople = CAC_VUNG.filter((v) =>
    (!v.canSua || canEdit) && (!v.canSinhTimeline || canSinhTimeline) && (!v.canAudit || canAudit));

  const [vung, setVung] = useState<VungId>("objects");
  const [kind, setKind] = useState<ObjectKind>(SOURCE_KINDS[0]);
  const [q, setQ] = useState("");
  const [trang, setTrang] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  /* Thu hồi quyền audit khi History đang mở phải rời tab trước khi effect
     tải lịch sử có cơ hội tạo request mới. */
  useEffect(() => {
    if (vung !== "history" || canAudit) return;
    setVung("objects");
    setTrang(0);
    setExpandedId(null);
  }, [vung, canAudit]);

  /* ---------------- Đối tượng nguồn (đọc theo loại) ---------------- */
  const [objRows, setObjRows] = useState<SourceObjectRow[]>([]);
  const [objState, setObjState] = useState<TrangThaiTai>("loading");
  const [objErr, setObjErr] = useState("");
  const objSeq = useRef(0);

  const taiDoiTuong = useCallback(async () => {
    const seq = ++objSeq.current;
    setObjState("loading");
    try {
      const rows = await fetchSourceObjects({ kind });
      if (seq !== objSeq.current) return;
      setObjRows(rows);
      setObjState("ready");
    } catch (e) {
      if (seq !== objSeq.current) return;
      setObjErr((e as Error).message || "Lỗi tải danh mục");
      setObjState("error");
    }
  }, [kind]);

  useEffect(() => { taiDoiTuong(); }, [taiDoiTuong]);

  const [warn, setWarn] = useState<SourceWarnings | null>(null);
  useEffect(() => {
    fetchSourceWarnings().then(setWarn).catch(() => setWarn(null));
  }, []);

  /* ------------- Sản phẩm GMP / Người nhận (đọc qua RPC) ----------- */
  const [svRows, setSvRows] = useState<CatalogListRow[]>([]);
  const [svTotal, setSvTotal] = useState(0);
  const [svState, setSvState] = useState<TrangThaiTai>("loading");
  const [svErr, setSvErr] = useState("");
  const [svTick, setSvTick] = useState(0);
  const svSeq = useRef(0);

  useEffect(() => {
    if (vung !== "products" && vung !== "alerts") return undefined;
    const dataset = vung as CatalogDatasetId;
    const seq = ++svSeq.current;
    setSvState("loading");
    const hen = setTimeout(async () => {
      const kq = await listDataset({ dataset, query: q, page: trang, pageSize: PAGE_SIZE });
      /* Câu trả lời cũ không được đè câu trả lời mới: chỉ seq mới nhất
         được ghi state. Không có dòng này thì gõ nhanh hai chữ là kết quả
         của chữ ĐẦU có thể về sau và thắng. */
      if (seq !== svSeq.current) return;
      if (!kq.ok) {
        setSvErr(kq.error || "Không đọc được danh mục");
        setSvState("error");
        return;
      }
      setSvRows(kq.rows);
      setSvTotal(kq.total);
      setSvState("ready");
    }, DO_TRE_TIM_KIEM_MS);
    return () => clearTimeout(hen);
  }, [vung, q, trang, svTick]);

  /* ---------------- Chờ áp dụng và Lịch sử ------------------------- */
  const [pen, setPen] = useState<{ state: TrangThaiTai; changes: CatalogChangeRow[]; err: string }>(
    { state: "loading", changes: [], err: "" });
  const [his, setHis] = useState<{ state: TrangThaiTai; rows: CatalogAuditRow[]; total: number; err: string }>(
    { state: "loading", rows: [], total: 0, err: "" });
  const [penTick, setPenTick] = useState(0);
  const [hisTick, setHisTick] = useState(0);

  useEffect(() => {
    if (vung !== "pending") return;
    setPen((p) => ({ ...p, state: "loading" }));
    listPendingChanges().then((kq) => {
      if (kq.ok) setPen({ state: "ready", changes: kq.changes, err: "" });
      else setPen({ state: "error", changes: [], err: kq.error || "Không đọc được hàng đợi" });
    });
  }, [vung, penTick]);

  useEffect(() => {
    if (vung !== "history" || !canAudit) return;
    setHis((p) => ({ ...p, state: "loading" }));
    listHistory({}, trang, PAGE_SIZE).then((kq) => {
      if (kq.ok) setHis({ state: "ready", rows: kq.history, total: kq.total, err: "" });
      else setHis({ state: "error", rows: [], total: 0, err: kq.error || "Không đọc được lịch sử" });
    });
  }, [vung, trang, hisTick, canAudit]);

  /* ---------------- Điều hướng trong workspace --------------------- */
  const doiVung = (id: VungId) => {
    setVung(id);
    setQ("");
    setTrang(0);
    setExpandedId(null);
  };

  const doiKind = (k: ObjectKind) => {
    setKind(k);
    setQ(""); setTrang(0); setExpandedId(null);
  };

  /* Deep-link: áp dataset + tìm kiếm + mở dòng, rồi báo App xoá — CHỈ một
     lần. Không xoá thì mỗi lần quay lại màn này bộ lọc cũ lại bật dậy. */
  const [focusCode, setFocusCode] = useState<string | null>(null);
  useEffect(() => {
    if (!focus?.code) return;
    setVung("objects");
    if (focus.nhom && SOURCE_KINDS.includes(focus.nhom as ObjectKind)) {
      setKind(focus.nhom as ObjectKind);
    }
    setQ(focus.code);
    setTrang(0);
    setFocusCode(focus.code);
    onFocusConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);

  /* ---------------- View-model dùng chung desktop/mobile ----------- */
  const objFields = useMemo(() => layDataset("objects").fields.map((f) => f.key), []);
  const objFiltered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return objRows;
    return objRows.filter((r) => objFields.some(
      (k) => String((r as Record<string, unknown>)[k] ?? "").toLowerCase().includes(s)));
  }, [objRows, q, objFields]);

  const objList = useMemo<CatalogListRow[]>(() =>
    objFiltered.slice(trang * PAGE_SIZE, (trang + 1) * PAGE_SIZE).map((r) => ({
      dataset: "objects",
      recordId: String(r.id),
      businessKey: String(r.object_code),
      version: Number((r as Record<string, unknown>).version ?? 1),
      updatedAt: String((r as Record<string, unknown>).updated_at ?? ""),
      data: r as unknown as CatalogRecord,
    })), [objFiltered, trang]);

  useEffect(() => {
    if (!focusCode) return;
    const dong = objList.find((r) => r.businessKey === focusCode);
    if (dong) {
      setExpandedId(dong.recordId);
      setFocusCode(null);
    }
  }, [focusCode, objList]);

  /* ---------------- Cảnh báo danh mục (như bản cũ) ------------------ */
  const broken = useMemo(
    () => objRows.filter((r) => r.validate_flag === "y" && r.first_month == null),
    [objRows]);
  const warningGroups = useMemo<CatalogWarning[]>(() => {
    const groups: CatalogWarning[] = [];
    if (broken.length > 0) groups.push({
      id: "missing-first-month", tone: "bad", blocking: true,
      title: `${broken.length} đối tượng thiếu "Tháng thẩm định đầu tiên"`,
      body: "Toàn bộ mốc thời gian của chúng không tính được — timeline sẽ để trống ô ngày.",
      items: broken.map((item) => item.object_code),
    });
    if ((warn?.ma_tam?.length ?? 0) > 0) groups.push({
      id: "temporary-code", tone: "bad", blocking: true,
      title: `${warn!.ma_tam!.length} đối tượng đang dùng MÃ TẠM`,
      body: "Dòng trong Sheet không vào được bản nhập — trùng mã hoặc thiếu mã. Đã cứu vào để không mất, nhưng phải tạo lại với mã thật rồi ngừng dùng dòng mã tạm; để nguyên thì chúng không bao giờ có timeline.",
      items: warn!.ma_tam!.map((item) => `${item.object_code} — ${item.object_name}`),
    });
    if (warn && warn.chua_tung_iq.length > 0) groups.push({
      id: "never-iq", tone: "ask", blocking: false,
      title: `${warn.chua_tung_iq.length} thiết bị/hệ thống chưa từng có IQ`,
      body: "Bình thường nếu là thiết bị cũ đã thẩm định trước khi có hệ thống. Bất thường nếu năm nhập bị bỏ lỡ không sinh timeline — khi đó cần tạo IQ thủ công.",
      items: warn.chua_tung_iq.map((item) => `${item.object_code} (${item.nam_nhap})`),
    });
    if (warn && warn.show_tat.length > 0) groups.push({
      id: "show-off", tone: "ask", blocking: false,
      title: `${warn.show_tat.length} đối tượng có Thẩm định = y nhưng Show ≠ y`,
      body: "Luật KHÔNG lọc theo Show — chúng vẫn được sinh timeline. Rà xem nên bật Show hay tắt Thẩm định.",
      items: warn.show_tat.map((item) => item.object_code),
    });
    if (warn && warn.chua_hoat_dong.length > 0) groups.push({
      id: "not-active", tone: "ask", blocking: false,
      title: `${warn.chua_hoat_dong.length} đối tượng "Chưa hoạt động" vẫn có thẩm định`,
      body: "Luật cố ý KHÔNG lọc theo Tình trạng: thiết bị chưa hoạt động chính là thứ cần DQ/IQ/OQ. Chỉ rà lại nếu đối tượng thật sự đã ngừng dùng.",
      items: warn.chua_hoat_dong.map((item) => item.object_code),
    });
    return groups;
  }, [broken, warn]);

  /* ---------------- Hộp thoại ------------------------------------- */
  const [dangSuaObj, setDangSuaObj] = useState<{ row: Record<string, unknown>; taoMoi: boolean } | null>(null);
  const [dangSuaBan, setDangSuaBan] = useState<{ dataset: CatalogDatasetId; record: CatalogRecord | null } | null>(null);
  const [moSinh, setMoSinh] = useState(false);
  const [changeId, setChangeId] = useState<string | null>(null);

  const moThem = () => {
    if (vung === "objects") setDangSuaObj({ row: {}, taoMoi: true });
    else if (vung === "products" || vung === "alerts") {
      setDangSuaBan({ dataset: vung, record: null });
    }
  };

  const suaDong = (row: CatalogListRow) => {
    if (row.dataset === "objects") {
      setDangSuaObj({ row: row.data as Record<string, unknown>, taoMoi: false });
    } else {
      setDangSuaBan({ dataset: row.dataset, record: row.data });
    }
  };

  /* Xuất đúng phần đang lọc của bảng đối tượng — tiện tra cứu, chỉ đọc. */
  const xuatExcel = async () => {
    const dinhNghia = layDataset("objects").fields;
    await xuatExcelAoa([{
      ten: kind,
      dong: [
        dinhNghia.map((f) => f.label),
        ...objFiltered.map((r) =>
          dinhNghia.map((f) => (r as Record<string, unknown>)[f.key] ?? "")),
      ],
    }], `VMP_${kind}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const taiLai = () => {
    if (vung === "objects") taiDoiTuong();
    else if (vung === "products" || vung === "alerts") setSvTick((t) => t + 1);
    else if (vung === "pending") setPenTick((t) => t + 1);
    else if (vung === "history") setHisTick((t) => t + 1);
  };

  const coTimKiem = vung === "objects" || vung === "products" || vung === "alerts";
  const coThem = canEdit && (vung === "objects" || vung === "products" || vung === "alerts");

  /* ---------------- Phân trang dùng chung -------------------------- */
  const tongDong = vung === "objects" ? objFiltered.length
    : vung === "history" ? his.total : svTotal;
  const soTrang = Math.max(1, Math.ceil(tongDong / PAGE_SIZE));

  const veTrang = tongDong > PAGE_SIZE && (
    <nav className="cw-pager" aria-label="Phân trang">
      <span className="cw-nhe">
        {`Đang xem ${trang * PAGE_SIZE + 1}–${Math.min(tongDong, (trang + 1) * PAGE_SIZE)} / ${tongDong}`}
      </span>
      <button type="button" className="cw-pager__nut" disabled={trang === 0}
        onClick={() => setTrang((t) => Math.max(0, t - 1))}>Trước</button>
      <button type="button" className="cw-pager__nut" disabled={trang >= soTrang - 1}
        onClick={() => setTrang((t) => Math.min(soTrang - 1, t + 1))}>Sau</button>
    </nav>
  );

  /* ================================================================ */
  return (
    <div className="cw-workspace">
      <p className="cw-mota">
        Dữ liệu nguồn — xem, thêm và sửa đều có lý do; thay đổi chạm
        timeline vào hàng chờ áp dụng, mọi bước nằm lại trong lịch sử.
        {scopeLabel && <span className="cw-mota__phamvi">Phạm vi: {scopeLabel}</span>}
        {updatedLabel && <span className="cw-mota__moc">{updatedLabel}</span>}
      </p>

      <div className="cw-khung">
        {/* Thanh dữ liệu — sáu mục cố định, quyền quyết định mục nào hiện. */}
        <nav className="cw-nav" aria-label="Bộ dữ liệu danh mục">
          {vungHople.map((v) => {
            const Icon = v.icon;
            const dangMo = vung === v.id;
            return (
              <button key={v.id} type="button" data-cw-nav={v.id}
                className={`cw-nav__muc${dangMo ? " is-mo" : ""}`}
                aria-pressed={dangMo}
                title={v.nhan}
                onClick={() => doiVung(v.id)}>
                <Icon size={17} aria-hidden="true" />
                <span className="cw-nav__nhan">{v.nhan}</span>
              </button>
            );
          })}
        </nav>

        <div className="cw-noi-dung">
          {coTimKiem && (
            <CommandBar label="Hành động danh mục"
              trailing={coThem && (
                <button type="button" className="cw-nut cw-nut--chinh" data-cw-them onClick={moThem}>
                  <Plus size={15} aria-hidden="true" /> Thêm
                </button>
              )}>
              <div className="cw-tim">
                <Search size={15} aria-hidden="true" className="cw-tim__icon" />
                <input
                  className="cw-tim__o"
                  aria-label="Tìm trong danh mục"
                  placeholder="Tìm theo mã, tên, bộ phận…"
                  value={q}
                  onChange={(e) => { setQ(e.target.value); setTrang(0); setExpandedId(null); }}
                />
              </div>
              <button type="button" className="cw-nut" onClick={taiLai}>
                <RefreshCw size={15} aria-hidden="true" /> Tải lại
              </button>
              {vung === "objects" && (
                <button type="button" className="cw-nut" onClick={xuatExcel}>
                  <Download size={15} aria-hidden="true" /> Xuất Excel
                </button>
              )}
              {vung === "objects" && canSinhTimeline && (
                <button type="button" className="cw-nut" onClick={() => setMoSinh(true)}>
                  <CalendarPlus size={15} aria-hidden="true" /> Sinh timeline
                </button>
              )}
            </CommandBar>
          )}

          {/* ----- Đối tượng nguồn ----- */}
          {vung === "objects" && (
            <>
              <div className="cw-kind" role="group" aria-label="Loại đối tượng">
                {SOURCE_KINDS.map((k) => (
                  <button key={k} type="button" data-cw-kind={k}
                    className={`cw-kind__muc${kind === k ? " is-mo" : ""}`}
                    aria-pressed={kind === k}
                    onClick={() => doiKind(k)}>
                    {k}
                  </button>
                ))}
              </div>

              {objState === "loading" && (
                <StateBoundary state="loading" title="Đang tải danh mục nguồn" skeletonRows={5} />
              )}
              {objState === "error" && (
                <StateBoundary state="error" title="Chưa tải được danh mục"
                  description={objErr} onRetry={taiDoiTuong} />
              )}
              {objState === "ready" && (
                <>
                  <CatalogWarningsSummary warnings={warningGroups} />
                  {objFiltered.length === 0 && q.trim() ? (
                    <StateBoundary state="filtered-empty" title="Không có dòng nào khớp"
                      description={`Không đối tượng nào trong "${kind}" khớp với từ đang tìm.`}
                      onClearFilters={() => { setQ(""); setTrang(0); }} />
                  ) : (
                    <CatalogSmartTable
                      dataset="objects"
                      rows={objList}
                      canEdit={canEdit}
                      onEdit={suaDong}
                      expandedRowId={expandedId}
                      onExpandedRowChange={setExpandedId}
                      empty={`Chưa có đối tượng nào trong nhóm ${kind}.`}
                    />
                  )}
                  {veTrang}
                </>
              )}
            </>
          )}

          {/* ----- Sản phẩm GMP · Người nhận cảnh báo ----- */}
          {(vung === "products" || vung === "alerts") && (
            <>
              {svState === "loading" && (
                <StateBoundary state="loading" title="Đang tải danh mục" skeletonRows={5} />
              )}
              {svState === "error" && (
                <StateBoundary state="error" title="Chưa tải được danh mục"
                  description={svErr} onRetry={() => setSvTick((t) => t + 1)} />
              )}
              {svState === "ready" && (
                <>
                  {svRows.length === 0 && q.trim() ? (
                    <StateBoundary state="filtered-empty" title="Không có dòng nào khớp"
                      description="Không bản ghi nào khớp với từ đang tìm."
                      onClearFilters={() => { setQ(""); setTrang(0); }} />
                  ) : (
                    <CatalogSmartTable
                      dataset={vung}
                      rows={svRows}
                      canEdit={canEdit}
                      onEdit={suaDong}
                      empty={vung === "products"
                        ? "Chưa có sản phẩm nào."
                        : "Chưa có người nhận nào — workflow cảnh báo dù bật cũng không gửi cho ai."}
                    />
                  )}
                  {veTrang}
                </>
              )}
            </>
          )}

          {/* ----- Nhập Excel theo mẫu chính thức ----- */}
          {vung === "import" && (
            <CatalogExcelImport
              onCommitted={(pendingIds) => {
                taiDoiTuong();
                setSvTick((t) => t + 1);
                if (pendingIds.length > 0) doiVung("pending");
              }}
            />
          )}

          {/* ----- Chờ áp dụng ----- */}
          {vung === "pending" && (
            <>
              {pen.state === "loading" && (
                <StateBoundary state="loading" title="Đang tải hàng đợi thay đổi" skeletonRows={3} />
              )}
              {pen.state === "error" && (
                <StateBoundary state="error" title="Chưa tải được hàng đợi"
                  description={pen.err} onRetry={() => setPenTick((t) => t + 1)} />
              )}
              {pen.state === "ready" && (pen.changes.length === 0 ? (
                <StateBoundary state="empty" title="Không có thay đổi nào chờ áp dụng"
                  description="Sửa một trường chạm luật timeline (thẩm định, tần suất, tháng đầu, năm) sẽ tạo một thay đổi chờ ở đây để xem ảnh hưởng trước khi áp." />
              ) : (
                <ol className="cw-lich-su">
                  {pen.changes.map((c) => (
                    <li key={c.id} className="cw-lich-su__dong">
                      <div className="cw-lich-su__chinh">
                        <b className="cw-ma">{c.object_code}</b>
                        <span className="cw-tag cw-tag--cho">{c.status}</span>
                        {/* Server đã biết TRƯỚC (has_impact) thay đổi này có đụng ngày
                            timeline hay không — nói ngay ở đây, đừng để người dùng bấm
                            mở "Xem ảnh hưởng" rồi mới biết nút Áp bị khoá vì không có
                            gì để áp. Đây chính là chỗ người dùng báo "không ấn được". */}
                        {c.has_impact
                          ? <span className="cw-nhe">chạm timeline</span>
                          : <span className="cw-nhe">không đổi mốc thời gian — mở ra chỉ để xem, không có gì để áp</span>}
                      </div>
                      <div className="cw-nhe">
                        {c.created_by_name} · {new Date(c.created_at).toLocaleString("vi-VN")}
                        {c.last_error ? ` · lỗi: ${c.last_error}` : ""}
                      </div>
                      {canEdit && (
                        <button type="button" className="cw-nut"
                          onClick={() => setChangeId(c.id)}>
                          Xem ảnh hưởng &amp; áp dụng
                        </button>
                      )}
                    </li>
                  ))}
                </ol>
              ))}
            </>
          )}

          {/* ----- Lịch sử ----- */}
          {vung === "history" && (
            <>
              {his.state === "loading" && (
                <StateBoundary state="loading" title="Đang tải lịch sử" skeletonRows={5} />
              )}
              {his.state === "error" && (
                <StateBoundary state="error" title="Chưa tải được lịch sử" description={his.err}
                  onRetry={() => setHisTick((t) => t + 1)} />
              )}
              {his.state === "ready" && (his.rows.length === 0 ? (
                <StateBoundary state="empty" title="Chưa có thao tác nào được ghi"
                  description="Mọi lần thêm, sửa, ngừng dùng trong danh mục đều được ghi lại tại đây kèm người làm và lý do." />
              ) : (
                <>
                  <ol className="cw-lich-su">
                    {his.rows.map((h) => (
                      <li key={h.id} className="cw-lich-su__dong">
                        <div className="cw-lich-su__chinh">
                          <b className="cw-ma">{h.record_id ?? "—"}</b>
                          <span className="cw-tag cw-tag--cho">{h.action}</span>
                          <span className="cw-nhe">{h.table_name ?? ""}</span>
                        </div>
                        <div className="cw-nhe">
                          {new Date(h.created_at).toLocaleString("vi-VN")} · {h.actor}
                          {h.changed_fields?.length ? ` · cột: ${h.changed_fields.join(", ")}` : ""}
                          {h.reason ? ` · lý do: ${h.reason}` : ""}
                        </div>
                      </li>
                    ))}
                  </ol>
                  {veTrang}
                </>
              ))}
            </>
          )}
        </div>
      </div>

      {/* ---------------- Hộp thoại ---------------------------------- */}
      {dangSuaObj && (
        <CatalogObjectForm
          row={dangSuaObj.row}
          objectKind={kind}
          performers={performerChoices}
          goiY={goiY}
          dangTaoMoi={dangSuaObj.taoMoi}
          onClose={() => setDangSuaObj(null)}
          onSaved={async (patch, lyDo, version) => {
            if (!Object.keys(patch).length) { setDangSuaObj(null); return; }
            const ma = dangSuaObj.taoMoi
              ? String(patch.object_code ?? "")
              : String(dangSuaObj.row.object_code ?? "");
            const dang = toast.dangChay(dangSuaObj.taoMoi ? `Đang tạo ${ma}…` : `Đang lưu ${ma}…`);
            const kq = await saveCatalogObject(kind, ma, patch, lyDo, version);
            if (!kq.ok) {
              const thongBao = kq.error_code === "VERSION_CONFLICT"
                ? `${kq.error ?? "Bản ghi đã bị người khác sửa"} (bản trên máy chủ: v${kq.current_version ?? "?"})`
                : (kq.error ?? "Lưu danh mục thất bại");
              dang.hong(thongBao);
              /* Ném tiếp để form giữ nguyên hộp thoại và dữ liệu vừa gõ —
                 đóng hộp thoại lúc lưu hỏng là bắt người dùng gõ lại từ đầu. */
              throw new Error(thongBao);
            }
            dang.xong(dangSuaObj.taoMoi ? `Đã tạo ${ma}` : `Đã lưu ${ma}`);
            /* owner_assignments_* và owner_revocations_* chỉ có khi patch vừa
               đổi owner_person_id (20260819110000) — chọn/xoá QA phụ trách
               ở đây giờ cấp/thu hồi quyền THẬT cho mọi hạng mục đang hoạt
               động của đối tượng, không chỉ ghi/xoá tên mô tả. Báo rõ khi
               có hạng mục chưa xử lý được (ví dụ ngoài phạm vi người thao
               tác) — im lặng bỏ qua sẽ làm người dùng tưởng ai cũng đã
               được cấp/thu hồi trong khi chưa. */
            const chuaCap = kq.owner_assignments_failed ?? [];
            const chuaThuHoi = kq.owner_revocations_failed ?? [];
            if (chuaCap.length) {
              toast.canhBao(
                `Đã lưu ${ma}, nhưng còn ${chuaCap.length} hạng mục chưa cấp được quyền cho QA phụ trách mới `
                + `(${chuaCap.slice(0, 3).map((x) => x.validation_code).join(", ")}${chuaCap.length > 3 ? "…" : ""}) — `
                + "kiểm tra lại phạm vi người thao tác hoặc phân công tay ở màn Nhân sự.",
              );
            }
            if (chuaThuHoi.length) {
              toast.canhBao(
                `Đã lưu ${ma}, nhưng còn ${chuaThuHoi.length} hạng mục chưa thu hồi được quyền của người phụ trách cũ `
                + `(${chuaThuHoi.slice(0, 3).map((x) => x.validation_code).join(", ")}${chuaThuHoi.length > 3 ? "…" : ""}) — `
                + "kiểm tra lại ở màn Nhân sự.",
              );
            }
            setDangSuaObj(null);
            await taiDoiTuong();
            onReload?.();
            if (kq.change_id) setChangeId(kq.change_id);
          }}
        />
      )}

      {dangSuaBan && (
        <CatalogRecordDialog
          open
          dataset={dangSuaBan.dataset}
          record={dangSuaBan.record}
          canEdit={canEdit}
          goiY={goiY}
          onClose={() => setDangSuaBan(null)}
          onSaved={() => {
            setDangSuaBan(null);
            setSvTick((t) => t + 1);
          }}
        />
      )}

      {moSinh && (
        <SinhTimelineDialog
          onClose={() => setMoSinh(false)}
          onDone={() => { setMoSinh(false); onReload?.(); }}
        />
      )}

      {changeId && (
        <CatalogImpactPreview
          changeId={changeId}
          onClose={() => setChangeId(null)}
          onApplied={async () => {
            toast.thanhCong("Đã áp thay đổi vào timeline");
            setChangeId(null);
            await taiDoiTuong();
            setPenTick((t) => t + 1);
            onReload?.();
          }}
        />
      )}
    </div>
  );
}

/* ===================================================================
 *  Sinh timeline — luôn XEM TRƯỚC rồi mới ghi. Hàm DB idempotent: mã đã
 *  tồn tại thì bỏ qua, không đè cột tiến độ người dùng đã nhập tay.
 * =================================================================== */
function SinhTimelineDialog({ onClose, onDone }: {
  onClose: () => void;
  onDone: () => void;
}) {
  const [nam, setNam] = useState(String(new Date().getFullYear()));
  const [preview, setPreview] = useState<GenerateTimelineResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [loi, setLoi] = useState("");
  const toast = useToast();

  const chay = async (commit: boolean) => {
    setBusy(true); setLoi("");
    /* Chỉ báo cho lần GHI THẬT. Xem trước không đổi dữ liệu nào, mà kết
       quả của nó đã hiện ngay trong hộp thoại rồi — thêm toast chỉ là
       tiếng ồn. */
    const dang = commit ? toast.dangChay("Đang ghi hạng mục timeline…") : null;
    try {
      const kq = await generateTimeline(Number(nam), commit);
      if (commit) {
        dang?.xong(`Đã sinh ${kq.so_tao_moi} hạng mục cho năm ${nam}`);
        onDone();
      } else {
        setPreview(kq);
      }
    } catch (e) {
      const thongBao = (e as Error).message || "Không chạy được";
      dang?.hong(thongBao);
      // Hộp thoại vẫn mở: người dùng đọc lỗi rồi sửa năm và thử lại ngay.
      setLoi(thongBao);
    }
    setBusy(false);
  };

  return (
    <ViewportDialog open title="Sinh hạng mục timeline từ danh mục nguồn"
      icon={CalendarPlus} maxWidth={560}
      description="Theo đúng luật VMP01: lọc đối tượng có Thẩm định = y, suy loại thẩm định theo phân loại, tính lùi các mốc từ hạn hoàn thành. Mã đã tồn tại được bỏ qua — không tạo trùng, không đè dữ liệu đã nhập."
      onRequestClose={() => onClose()}
      footer={
        <div className="cw-chan-nut">
          <button type="button" className="cw-nut" onClick={onClose}>Đóng</button>
          <button type="button" className="cw-nut" disabled={busy} onClick={() => chay(false)}>
            Xem trước
          </button>
          <button type="button" className="cw-nut cw-nut--chinh"
            disabled={busy || !preview || !preview.so_tao_moi}
            onClick={() => chay(true)}>
            {busy ? "Đang chạy…" : `Ghi ${preview ? preview.so_tao_moi : ""} hạng mục`}
          </button>
        </div>
      }>
      <label className="cw-truong">
        <span className="cw-nhan">Năm thẩm định</span>
        <input className="cw-o" inputMode="numeric" value={nam}
          onChange={(e) => { setNam(e.target.value); setPreview(null); }} />
      </label>

      {loi && <p className="cw-loi" role="alert">{loi}</p>}

      {preview && (
        <div className="cw-xem-truoc">
          {/* Nút "Ghi 0 hạng mục" bị khoá mà không nói gì thêm trông như hỏng.
              0 tạo mới nghĩa là timeline NĂM NÀY đã đủ rồi — nói thẳng ra thay
              vì để người dùng tự đoán vì sao nút xám. */}
          {preview.so_tao_moi === 0 ? (
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <Check size={16} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>
                <b>Timeline năm {nam} đã đủ</b> — cả {preview.so_bo_qua} hạng mục theo danh
                mục hiện tại đều đã có sẵn, không có mã nào cần tạo thêm. Không phải lỗi,
                chỉ là không còn việc để ghi.
              </span>
            </div>
          ) : (
            <div><b>{preview.so_tao_moi}</b> hạng mục sẽ được tạo mới</div>
          )}
          <div className="cw-nhe">{preview.so_bo_qua} mã đã tồn tại → bỏ qua</div>
          {preview.so_thieu_moc > 0 && (
            <div className="cw-canh-bao-nhe">
              {preview.so_thieu_moc} hạng mục thiếu dữ liệu nguồn nên không tính đủ mốc
              (sẽ tạo với ô ngày để trống).
            </div>
          )}
          {(preview.so_chua_toi_chu_ky ?? 0) > 0 && (
            <div className="cw-nhe">
              {preview.so_chua_toi_chu_ky} đối tượng tần suất trên 12 tháng chưa tới chu kỳ nên được hoãn:{" "}
              {(preview.chua_toi_chu_ky ?? []).map((x) =>
                `${x.object_code} (${x.tan_suat_thang} tháng · gần nhất ${x.moc_gan_nhat} → kỳ sau ${x.ky_ke_tiep})`,
              ).join(" · ")}
            </div>
          )}
        </div>
      )}
    </ViewportDialog>
  );
}
