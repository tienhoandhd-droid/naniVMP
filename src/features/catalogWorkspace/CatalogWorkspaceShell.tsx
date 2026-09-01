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
 *  điện thoại thẻ, cùng một mảng dòng. Source dùng RPC keyset theo đúng
 *  quyền; sản phẩm/cảnh báo dùng RPC offset manager-only. Cả hai đều đếm
 *  tổng ở server, 25 dòng mỗi trang, debounce 250 ms và sequence fence.
 * ===================================================================== */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import "../../styles/catalog-workspace.css"; // B5: CSS theo route
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
import WorkshopScopeCoveragePanel from "../sourceAccess/WorkshopScopeCoveragePanel.tsx";
import {
  SOURCE_KINDS, fetchSourceWarnings, generateTimeline,
  saveCatalogObject,
} from "../../lib/supabaseData.ts";
import { useCatalogSuggestions } from "./useCatalogSuggestions.ts";
import { xuatExcelAoa } from "../../lib/xuatExcel.ts";
import type { SourceWarnings } from "../../lib/supabaseData.ts";
import type { AccessContext } from "../../lib/access.ts";
import type { GenerateTimelineResult, ObjectKind, SourceObjectRow } from "../../types/domain.ts";
import { formatBangkokDateTime } from "../../lib/formatBangkok.ts";
import CatalogSmartTable from "./CatalogSmartTable.tsx";
import CatalogRecordDialog from "./CatalogRecordDialog.tsx";
import CatalogExcelImport from "./CatalogExcelImport.tsx";
import {
  exportAllSourceObjects, listDataset, listHistory, listPendingChanges,
  listSourceObjectFacets, listSourceObjectPage,
} from "./api.ts";
import { layDataset } from "./definitions.ts";
import {
  CATALOG_OBJECT_FILTERS_ALL, activeCatalogObjectFilterChips,
  catalogObjectActiveFilterCount, catalogWorkspaceRegionIds, clearCatalogObjectFilter,
  encodeCatalogObjectServerFilters, initialCatalogSourceCursorStack,
  moveCatalogSourceCursorBack, moveCatalogSourceCursorForward,
  resolveCatalogSourceCursorPage, sourceDataControls,
  type CatalogObjectFilters, type CatalogSourceCursorStack,
} from "./catalogWorkspaceFilterModel.ts";
import type {
  CatalogAuditRow, CatalogChangeRow, CatalogDatasetId, CatalogListRow, CatalogRecord,
  CatalogSourceFacetsSuccess,
} from "./contracts.ts";

const PAGE_SIZE = 25;
const DO_TRE_TIM_KIEM_MS = 250;

/** Sáu mục của workspace — thứ tự này là hợp đồng, có bộ kiểm giữ. */
type VungId = "objects" | "coverage" | "products" | "alerts" | "import" | "pending" | "history";

const CAC_VUNG: Array<{
  id: VungId; nhan: string; icon: typeof Boxes;
  canSua?: boolean; canSinhTimeline?: boolean; canAudit?: boolean;
}> = [
  { id: "objects", nhan: "Đối tượng", icon: Boxes },
  { id: "coverage", nhan: "Phạm vi xưởng", icon: Boxes },
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
  /** Quyền Source đổi thì Task 7 tăng revision này để mọi page/warning cũ
   * bị loại trước khi có thể tiếp tục hiển thị. */
  authorizationRevision: number | null;
  /** Deep-link từ màn Tiến độ: mở đúng đối tượng rồi tự xoá (một lần). */
  focus?: { code: string; nhom?: string } | null;
  onFocusConsumed?: () => void;
  /** Gọi khi timeline có thể đã đổi — App tải lại dashboard. */
  onReload?: () => void;
}

type TrangThaiTai = "loading" | "error" | "ready";

export default function CatalogWorkspaceShell({
  access, scopeLabel, updatedLabel, authorizationRevision, focus, onFocusConsumed, onReload,
}: CatalogWorkspaceShellProps) {
  const canEdit = access.can("source", "edit_catalog");
  const canSinhTimeline = access.can("source", "generate_timeline");
  const canManageWorkshopScope = access.can("source", "manage_workshop_scope");
  const hasAuthorizationRevision = Number.isSafeInteger(authorizationRevision)
    && (authorizationRevision ?? 0) > 0;
  /* Đây là lịch sử nghiệp vụ của Dữ liệu nguồn, không phải màn Nhật ký
     thay đổi trong khu vực Quản trị. RPC rpc_catalog_history chấp nhận đúng
     Admin và Quản lý QA, nên giao diện phải phản chiếu cùng biên vai trò. */
  const canViewCatalogHistory = access.businessRole === "admin"
    || access.businessRole === "qa_manager";

  const canManageSourceDatasets = access.businessRole === "admin" || access.businessRole === "qa_manager";
  const sourceControls = sourceDataControls(access.businessRole, canEdit);
  const toast = useToast();
  /* Gợi ý nhập nạp một lượt cho cả màn: mở hộp thoại rồi mới gọi mạng thì
     danh sách hiện sau con trỏ, và người dùng đã gõ xong nửa chữ. */
  const catalogSuggestions = useCatalogSuggestions(canManageSourceDatasets && hasAuthorizationRevision);
  const goiY = catalogSuggestions.goiY;

  const vungIds = useMemo(() => hasAuthorizationRevision
    ? catalogWorkspaceRegionIds({
      businessRole: access.businessRole,
      canEdit,
      canGenerateTimeline: canSinhTimeline,
      canManageWorkshopScope,
    })
    : (["objects"] as VungId[]), [
    hasAuthorizationRevision, access.businessRole, canEdit, canSinhTimeline, canManageWorkshopScope,
  ]);
  const vungHople = CAC_VUNG.filter((v) => vungIds.includes(v.id));

  const [vung, setVung] = useState<VungId>("objects");
  const [kind, setKind] = useState<ObjectKind>(SOURCE_KINDS[0]);
  const [q, setQ] = useState("");
  const [objFilters, setObjFilters] = useState<CatalogObjectFilters>(CATALOG_OBJECT_FILTERS_ALL);
  const [moBoLocObj, setMoBoLocObj] = useState(false);
  const [trang, setTrang] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  /* Thu hồi quyền khi đang ở một tab quản lý phải rời tab trước khi effect
     của tab cũ có cơ hội tạo request mới. */
  useLayoutEffect(() => {
    if (vungIds.includes(vung)) return;
    setVung("objects");
    setTrang(0);
    setExpandedId(null);
  }, [vung, vungIds]);

  /* ---------------- Đối tượng nguồn (đọc theo loại) ---------------- */
  const [objRows, setObjRows] = useState<SourceObjectRow[]>([]);
  const [objTotal, setObjTotal] = useState(0);
  const [objState, setObjState] = useState<TrangThaiTai>("loading");
  const [objErr, setObjErr] = useState("");
  const [objFacets, setObjFacets] = useState<CatalogSourceFacetsSuccess | null>(null);
  const [facetErr, setFacetErr] = useState("");
  const [sourceSearch, setSourceSearch] = useState("");
  const [objCursor, setObjCursor] = useState<CatalogSourceCursorStack>(initialCatalogSourceCursorStack);
  const objSeq = useRef(0);
  const facetSeq = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => setSourceSearch(q.trim()), DO_TRE_TIM_KIEM_MS);
    return () => clearTimeout(timer);
  }, [q]);

  const objServerFilter = useMemo(() => encodeCatalogObjectServerFilters({
    ...objFilters,
    text: sourceSearch,
  }), [objFilters, sourceSearch]);
  const sourceAccessKey = `${access.mode}|${access.businessRole ?? "unresolved"}|${access.scope("source")}|${authorizationRevision ?? "pending"}`;
  const objQueryKey = useMemo(() => JSON.stringify([
    sourceAccessKey, kind, objServerFilter.search, objServerFilter.filters,
  ]), [sourceAccessKey, kind, objServerFilter]);

  useLayoutEffect(() => {
    objSeq.current += 1;
    setObjCursor(initialCatalogSourceCursorStack());
    setObjRows([]);
    setObjTotal(0);
    setObjState("loading");
    setExpandedId(null);
  }, [objQueryKey]);

  const taiDoiTuong = useCallback(async () => {
    const seq = ++objSeq.current;
    setObjState("loading");
    if (!hasAuthorizationRevision) return;
    const result = await listSourceObjectPage({
      objectKind: kind,
      search: objServerFilter.search,
      filters: objServerFilter.filters,
      cursor: objCursor.cursors[objCursor.page] ?? null,
      limit: PAGE_SIZE,
    });
    if (seq !== objSeq.current) return;
    if (!result.ok) {
      setObjRows([]);
      setObjTotal(0);
      setObjCursor((previous) => resolveCatalogSourceCursorPage(previous, null));
      setObjErr(result.error || "Lỗi tải danh mục");
      setObjState("error");
      return;
    }
    setObjRows(result.rows);
    setObjTotal(result.authorizedTotal);
    setObjCursor((previous) => resolveCatalogSourceCursorPage(previous, result.nextCursor));
    setObjErr("");
    setObjState("ready");
  }, [sourceAccessKey, hasAuthorizationRevision, kind, objCursor.cursors, objCursor.page, objServerFilter]);

  useEffect(() => { taiDoiTuong(); }, [taiDoiTuong]);

  useEffect(() => {
    const seq = ++facetSeq.current;
    setFacetErr("");
    if (!hasAuthorizationRevision) {
      setObjFacets(null);
      return;
    }
    const facetFilters = encodeCatalogObjectServerFilters(CATALOG_OBJECT_FILTERS_ALL).filters;
    listSourceObjectFacets({ objectKind: kind, filters: facetFilters }).then((result) => {
      if (seq !== facetSeq.current) return;
      if (!result.ok) {
        setObjFacets(null);
        setFacetErr(result.error);
        return;
      }
      setObjFacets(result);
    });
  }, [sourceAccessKey, hasAuthorizationRevision, kind]);

  const [warn, setWarn] = useState<SourceWarnings | null>(null);
  const [warnErr, setWarnErr] = useState("");
  useEffect(() => {
    let active = true;
    setWarn(null);
    setWarnErr("");
    if (!hasAuthorizationRevision) return () => { active = false; };
    fetchSourceWarnings()
      .then((value) => {
        if (!active) return;
        setWarn(value);
        setWarnErr("");
      })
      .catch((cause) => {
        if (!active) return;
        setWarn(null);
        setWarnErr(cause instanceof Error ? cause.message : String(cause));
      });
    return () => { active = false; };
  }, [sourceAccessKey, hasAuthorizationRevision]);

  const [coverageAreaLess, setCoverageAreaLess] = useState(0);
  const [coverageReadinessErr, setCoverageReadinessErr] = useState("");
  useEffect(() => {
    if (!canManageWorkshopScope || !hasAuthorizationRevision) {
      setCoverageAreaLess(0);
      setCoverageReadinessErr("");
      return;
    }
    let active = true;
    const defaults = encodeCatalogObjectServerFilters(CATALOG_OBJECT_FILTERS_ALL).filters;
    listSourceObjectFacets({ objectKind: null, filters: defaults }).then((result) => {
      if (!active) return;
      if (!result.ok) {
        setCoverageAreaLess(0);
        setCoverageReadinessErr(result.error);
        return;
      }
      const total = result.ownership.reduce((sum, item) => sum + item.count, 0);
      const withArea = result.areas.reduce((sum, item) => sum + item.count, 0);
      setCoverageAreaLess(Math.max(0, total - withArea));
      setCoverageReadinessErr("");
    });
    return () => { active = false; };
  }, [canManageWorkshopScope, hasAuthorizationRevision, sourceAccessKey]);

  /* Revision mất/đổi phải làm dữ liệu đang mở biến mất trước paint, đồng
     thời vô hiệu mọi page/facet response được mở dưới revision cũ. */
  useLayoutEffect(() => {
    objSeq.current += 1;
    facetSeq.current += 1;
    setObjRows([]);
    setObjTotal(0);
    setObjFacets(null);
    setWarn(null);
    setFacetErr("");
    setWarnErr("");
    setCoverageAreaLess(0);
    setCoverageReadinessErr("");
    setObjState("loading");
  }, [sourceAccessKey]);

  /* ------------- Sản phẩm GMP / Người nhận (đọc qua RPC) ----------- */
  const [svRows, setSvRows] = useState<CatalogListRow[]>([]);
  const [svTotal, setSvTotal] = useState(0);
  const [svState, setSvState] = useState<TrangThaiTai>("loading");
  const [svErr, setSvErr] = useState("");
  const [svTick, setSvTick] = useState(0);
  const svSeq = useRef(0);

  useEffect(() => {
    if (!hasAuthorizationRevision || !canManageSourceDatasets || (vung !== "products" && vung !== "alerts")) return undefined;
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
  }, [vung, q, trang, svTick, canManageSourceDatasets, hasAuthorizationRevision]);

  /* ---------------- Chờ áp dụng và Lịch sử ------------------------- */
  const [pen, setPen] = useState<{ state: TrangThaiTai; changes: CatalogChangeRow[]; err: string }>(
    { state: "loading", changes: [], err: "" });
  const [his, setHis] = useState<{ state: TrangThaiTai; rows: CatalogAuditRow[]; total: number; err: string }>(
    { state: "loading", rows: [], total: 0, err: "" });
  const [penTick, setPenTick] = useState(0);
  const [hisTick, setHisTick] = useState(0);
  const penSeq = useRef(0);
  const hisSeq = useRef(0);

  useLayoutEffect(() => {
    svSeq.current += 1;
    penSeq.current += 1;
    hisSeq.current += 1;
    setSvRows([]);
    setSvTotal(0);
    setSvState("loading");
    setSvErr("");
    setPen({ state: "loading", changes: [], err: "" });
    setHis({ state: "loading", rows: [], total: 0, err: "" });
  }, [sourceAccessKey]);

  useEffect(() => {
    const seq = ++penSeq.current;
    if (!hasAuthorizationRevision || vung !== "pending" || !canManageSourceDatasets || !canEdit || !canSinhTimeline) return;
    setPen((p) => ({ ...p, state: "loading" }));
    listPendingChanges().then((kq) => {
      if (seq !== penSeq.current) return;
      if (kq.ok) setPen({ state: "ready", changes: kq.changes, err: "" });
      else setPen({ state: "error", changes: [], err: kq.error || "Không đọc được hàng đợi" });
    });
  }, [vung, penTick, canManageSourceDatasets, canEdit, canSinhTimeline, hasAuthorizationRevision, sourceAccessKey]);

  useEffect(() => {
    const seq = ++hisSeq.current;
    if (!hasAuthorizationRevision || vung !== "history" || !canManageSourceDatasets || !canViewCatalogHistory) return;
    setHis((p) => ({ ...p, state: "loading" }));
    listHistory({}, trang, PAGE_SIZE).then((kq) => {
      if (seq !== hisSeq.current) return;
      if (kq.ok) setHis({ state: "ready", rows: kq.history, total: kq.total, err: "" });
      else setHis({ state: "error", rows: [], total: 0, err: kq.error || "Không đọc được lịch sử" });
    });
  }, [vung, trang, hisTick, canManageSourceDatasets, canViewCatalogHistory, hasAuthorizationRevision, sourceAccessKey]);

  /* ---------------- Điều hướng trong workspace --------------------- */
  const doiVung = (id: VungId) => {
    setVung(id);
    setQ("");
    setObjFilters(CATALOG_OBJECT_FILTERS_ALL);
    setTrang(0);
    setExpandedId(null);
  };

  const doiKind = (k: ObjectKind) => {
    setKind(k);
    setQ(""); setObjFilters(CATALOG_OBJECT_FILTERS_ALL); setTrang(0); setExpandedId(null);
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
    setObjFilters(CATALOG_OBJECT_FILTERS_ALL);
    setTrang(0);
    setFocusCode(focus.code);
    onFocusConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);

  /* ---------------- View-model dùng chung desktop/mobile ----------- */
  const objFilterState = useMemo<CatalogObjectFilters>(() => ({ ...objFilters, text: q }), [objFilters, q]);
  const objFilterOptions = useMemo(() => ({
    departments: (objFacets?.departments ?? []).map((option) => ({
      value: option.value, label: `${option.value} (${option.count})`,
    })),
    areas: (objFacets?.areas ?? []).map((option) => ({
      value: option.value, label: `${option.value} (${option.count})`,
    })),
    owners: (objFacets?.owners ?? []).map((option) => ({
      value: option.value, label: `${option.name} (${option.count})`,
    })),
  }), [objFacets]);
  const objFilterChips = useMemo(() => activeCatalogObjectFilterChips(objFilterState), [objFilterState]);
  const objFilterCount = useMemo(() => catalogObjectActiveFilterCount(objFilterState), [objFilterState]);

  const doiBoLocObj = <K extends keyof CatalogObjectFilters>(key: K, value: CatalogObjectFilters[K]) => {
    setObjFilters((previous) => ({ ...previous, [key]: value }));
    setTrang(0);
    setExpandedId(null);
  };
  const xoaTatCaBoLocObj = () => {
    setQ("");
    setObjFilters(CATALOG_OBJECT_FILTERS_ALL);
    setTrang(0);
    setExpandedId(null);
  };
  const xoaTuKhoaObj = () => {
    setQ("");
    setTrang(0);
    setExpandedId(null);
  };

  const objList = useMemo<CatalogListRow[]>(() =>
    objRows.map((r) => ({
      dataset: "objects",
      recordId: String(r.id),
      businessKey: String(r.object_code),
      version: Number((r as Record<string, unknown>).version ?? 1),
      updatedAt: String((r as Record<string, unknown>).updated_at ?? ""),
      data: r as unknown as CatalogRecord,
    })), [objRows]);

  useEffect(() => {
    /* Đợi truy vấn server đã nhận đúng deep-link. Nếu mở ngay trên objList
       cũ trước nhịp debounce, effect đổi query kế tiếp sẽ đóng dòng vừa mở. */
    if (!focusCode || sourceSearch !== focusCode) return;
    const dong = objList.find((r) => r.businessKey === focusCode);
    if (dong) {
      setExpandedId(dong.recordId);
      setFocusCode(null);
    }
  }, [focusCode, objList, sourceSearch]);

  /* ---------------- Cảnh báo danh mục (như bản cũ) ------------------ */
  const warningGroups = useMemo<CatalogWarning[]>(() => {
    const groups: CatalogWarning[] = [];
    if ((warn?.thieu_thang_dau.length ?? 0) > 0) groups.push({
      id: "missing-first-month", tone: "bad", blocking: true,
      title: `${warn!.thieu_thang_dau.length} đối tượng thiếu "Tháng thẩm định đầu tiên"`,
      body: "Toàn bộ mốc thời gian của chúng không tính được — timeline sẽ để trống ô ngày.",
      items: warn!.thieu_thang_dau.map((item) => item.object_code),
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
  }, [warn]);

  /* ---------------- Hộp thoại ------------------------------------- */
  const [dangSuaObj, setDangSuaObj] = useState<{ row: Record<string, unknown>; taoMoi: boolean } | null>(null);
  const [dangSuaBan, setDangSuaBan] = useState<{ dataset: CatalogDatasetId; record: CatalogRecord | null } | null>(null);
  const [moSinh, setMoSinh] = useState(false);
  const [changeId, setChangeId] = useState<string | null>(null);

  useLayoutEffect(() => {
    setDangSuaObj(null);
    setDangSuaBan(null);
    setMoSinh(false);
    setChangeId(null);
  }, [sourceAccessKey]);

  const moThem = () => {
    if (!sourceControls.canChange) return;
    if (vung === "objects") setDangSuaObj({ row: {}, taoMoi: true });
    else if (vung === "products" || vung === "alerts") {
      setDangSuaBan({ dataset: vung, record: null });
    }
  };

  const suaDong = (row: CatalogListRow) => {
    if (!sourceControls.canChange) return;
    if (row.dataset === "objects") {
      setDangSuaObj({ row: row.data as Record<string, unknown>, taoMoi: false });
    } else {
      setDangSuaBan({ dataset: row.dataset, record: row.data });
    }
  };

  /* Xuất đúng phần đang lọc của bảng đối tượng — tiện tra cứu, chỉ đọc. */
  const xuatExcel = async () => {
    if (!sourceControls.canExport || !hasAuthorizationRevision) return;
    const progress = toast.dangChay("Đang xuất toàn bộ dòng Source được phép xem…");
    try {
      const dinhNghia = layDataset("objects").fields;
      const rows = await exportAllSourceObjects({
        objectKind: kind,
        search: objServerFilter.search,
        filters: objServerFilter.filters,
      });
      await xuatExcelAoa([{
        ten: kind,
        dong: [
          dinhNghia.map((f) => f.label),
          ...rows.map((r) =>
            dinhNghia.map((f) => (r as Record<string, unknown>)[f.key] ?? "")),
        ],
      }], `VMP_${kind}_${new Date().toISOString().slice(0, 10)}.xlsx`);
      progress.xong(`Đã xuất ${rows.length} dòng Source.`);
    } catch (cause) {
      progress.hong(`Không xuất được Source: ${cause instanceof Error ? cause.message : String(cause)}`);
    }
  };

  const taiLai = () => {
    if (vung === "objects") taiDoiTuong();
    else if (vung === "products" || vung === "alerts") setSvTick((t) => t + 1);
    else if (vung === "pending") setPenTick((t) => t + 1);
    else if (vung === "history") setHisTick((t) => t + 1);
  };

  const coTimKiem = vung === "objects" || vung === "products" || vung === "alerts";
  const coThem = hasAuthorizationRevision && sourceControls.canChange
    && (vung === "objects" || vung === "products" || vung === "alerts");

  /* ---------------- Phân trang dùng chung -------------------------- */
  const hienTrang = vung === "objects" ? objCursor.page : trang;
  const tongDong = vung === "objects" ? objTotal
    : vung === "history" ? his.total : svTotal;
  const soTrang = Math.max(1, Math.ceil(tongDong / PAGE_SIZE));

  const veTrang = tongDong > PAGE_SIZE && (
    <nav className="cw-pager" aria-label="Phân trang">
      <span className="cw-nhe">
        {`Đang xem ${hienTrang * PAGE_SIZE + 1}–${Math.min(tongDong, hienTrang * PAGE_SIZE + (vung === "objects" ? objRows.length : PAGE_SIZE))} / ${tongDong}`}
      </span>
      <button type="button" className="cw-pager__nut" disabled={hienTrang === 0}
        onClick={() => {
          if (vung === "objects") setObjCursor(moveCatalogSourceCursorBack);
          else setTrang((t) => Math.max(0, t - 1));
        }}>Trước</button>
      <button type="button" className="cw-pager__nut"
        disabled={vung === "objects" ? objCursor.nextCursor === null : hienTrang >= soTrang - 1}
        onClick={() => {
          if (vung === "objects") setObjCursor(moveCatalogSourceCursorForward);
          else setTrang((t) => Math.min(soTrang - 1, t + 1));
        }}>Sau</button>
    </nav>
  );

  /* ================================================================ */
  return (
    <div className="cw-workspace">
      <p className="cw-mota">
        <span>Sổ dữ liệu nguồn — tìm và kiểm tra đối tượng theo phạm vi được cấp.</span>
        {scopeLabel && <span className="cw-mota__phamvi">Phạm vi: {scopeLabel}</span>}
        {updatedLabel && <span className="cw-mota__moc">{updatedLabel}</span>}
      </p>

      <aside className={`cw-source-guide${sourceControls.canChange ? " is-manager" : ""}`}
        aria-label="Hướng dẫn Dữ liệu nguồn" data-cw-source-guide>
        <b>Dữ liệu nguồn là dữ liệu gốc.</b>{" "}
        {sourceControls.canChange
          ? "Kiểm tra bản xem trước và ghi lý do trước khi xác nhận thay đổi. Chỉ Admin và Quản lý QA được nhập hoặc xuất dữ liệu."
          : "Bạn đang ở chế độ chỉ đọc theo phạm vi được cấp. Chỉ Admin và Quản lý QA được thay đổi, nhập hoặc xuất dữ liệu."}
      </aside>

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
          {catalogSuggestions.error && canManageSourceDatasets && (
            <p role="alert" className="cw-loi">
              {catalogSuggestions.error}{" "}
              <button type="button" className="cw-nut cw-nut--phu" onClick={catalogSuggestions.retry}>Thử tải lại gợi ý</button>
            </p>
          )}
          {vung === "objects" ? (
            <>
              <div className="cw-primary-bar" data-cw-primary-bar>
                <CommandBar label="Nhập liệu đối tượng" trailing={coThem && (
                  <button type="button" className="cw-nut cw-nut--chinh" data-cw-them onClick={moThem}>
                    <Plus size={15} aria-hidden="true" /> Thêm đối tượng
                  </button>
                )}>
                  <div className="cw-tim">
                    <Search size={15} aria-hidden="true" className="cw-tim__icon" />
                    <input
                      data-desktop-primary-actionable
                      className="cw-tim__o"
                      aria-label="Tìm trong danh mục"
                      placeholder="Tìm theo mã, tên, bộ phận…"
                      value={q}
                      onChange={(e) => { setQ(e.target.value); setTrang(0); setExpandedId(null); }}
                    />
                  </div>
                  <button type="button" className="cw-nut" data-cw-filter-toggle
                    aria-expanded={moBoLocObj} aria-controls="cw-object-filter-panel"
                    onClick={() => setMoBoLocObj((mo) => !mo)}>
                    Bộ lọc{objFilterCount > 0 ? ` (${objFilterCount})` : ""}
                  </button>
                </CommandBar>
              </div>

              <details className="cw-tools" data-cw-tools>
                <summary>Công cụ dữ liệu</summary>
                <div className="cw-tools__actions" role="group" aria-label="Công cụ dữ liệu nguồn">
                  <button type="button" className="cw-nut" onClick={taiLai}>
                    <RefreshCw size={15} aria-hidden="true" /> Tải lại
                  </button>
                  {sourceControls.canExport && (
                    <button type="button" className="cw-nut" data-cw-export-count={objTotal}
                      disabled={!hasAuthorizationRevision} onClick={xuatExcel}>
                      <Download size={15} aria-hidden="true" /> Xuất Excel
                    </button>
                  )}
                  {canSinhTimeline && hasAuthorizationRevision && (
                    <button type="button" className="cw-nut" onClick={() => setMoSinh(true)}>
                      <CalendarPlus size={15} aria-hidden="true" /> Sinh timeline
                    </button>
                  )}
                </div>
              </details>
            </>
          ) : coTimKiem && (
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

              <section id="cw-object-filter-panel" className="cw-filter-panel" data-cw-filter-panel hidden={!moBoLocObj} aria-label="Bộ lọc nâng cao đối tượng">
                <div className="cw-filter-panel__luoi">
                  <label className="cw-truong">Bộ phận
                    <select className="cw-o" data-cw-filter="department" value={objFilters.department}
                      onChange={(e) => doiBoLocObj("department", e.target.value)}>
                      <option value="all">Tất cả bộ phận</option>
                      {objFilterOptions.departments.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </label>
                  <label className="cw-truong">Khu vực
                    <select className="cw-o" data-cw-filter="area" value={objFilters.area}
                      onChange={(e) => doiBoLocObj("area", e.target.value)}>
                      <option value="all">Tất cả khu vực</option>
                      {objFilterOptions.areas.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </label>
                  <label className="cw-truong">Thẩm định
                    <select className="cw-o" data-cw-filter="validation" value={objFilters.validation}
                      onChange={(e) => doiBoLocObj("validation", e.target.value as CatalogObjectFilters["validation"])}>
                      <option value="all">Tất cả</option><option value="validated">Có thẩm định</option><option value="outside">Ngoài kế hoạch</option>
                    </select>
                  </label>
                  <label className="cw-truong">Tháng đầu tiên
                    <select className="cw-o" data-cw-filter="first-month" value={objFilters.firstMonth}
                      onChange={(e) => doiBoLocObj("firstMonth", e.target.value as CatalogObjectFilters["firstMonth"])}>
                      <option value="all">Tất cả</option><option value="missing">Thiếu tháng đầu tiên</option><option value="present">Có tháng đầu tiên</option>
                    </select>
                  </label>
                  <label className="cw-truong">Người phụ trách
                    <select className="cw-o" data-cw-filter="owner" value={objFilters.owner}
                      onChange={(e) => doiBoLocObj("owner", e.target.value as CatalogObjectFilters["owner"])}>
                      <option value="all">Tất cả</option><option value="assigned">Đã phân công</option><option value="unassigned">Chưa phân công</option>
                      {objFilterOptions.owners.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </label>
                  <label className="cw-truong">Tần suất
                    <select className="cw-o" data-cw-filter="frequency" value={objFilters.frequency}
                      onChange={(e) => doiBoLocObj("frequency", e.target.value as CatalogObjectFilters["frequency"])}>
                      <option value="all">Tất cả</option><option value="lte12">12 tháng hoặc ít hơn</option><option value="gt12">Hơn 12 tháng</option>
                    </select>
                  </label>
                </div>
              </section>
              {objFilterCount > 0 && (
                <div className="cw-filter-summary">
                  <span data-cw-filter-count aria-live="polite">Đang lọc {objFilterCount} điều kiện · {objTotal} đối tượng</span>
                  {objFilterChips.map((chip) => <button key={chip.key} type="button" className="cw-filter-chip" data-cw-filter-chip
                    aria-label={`Bỏ lọc ${chip.label}`} onClick={() => {
                      if (chip.key === "text") xoaTuKhoaObj();
                      else doiBoLocObj(chip.key, clearCatalogObjectFilter(objFilterState, chip.key)[chip.key]);
                    }}>{chip.label} ×</button>)}
                  <button type="button" className="cw-nut cw-nut--phu" data-cw-clear-filters onClick={xoaTatCaBoLocObj}>Xóa bộ lọc</button>
                </div>
              )}
              {facetErr && <p role="alert" className="cw-loi">Không tải được bộ lọc Source: {facetErr}</p>}
              {warnErr && <p role="alert" className="cw-loi">Không tải được cảnh báo Source: {warnErr}</p>}

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
                  {objRows.length === 0 && objFilterCount > 0 ? (
                    <StateBoundary state="filtered-empty" title="Không có dòng nào khớp"
                      description={`Bộ lọc hiện tại không có đối tượng nào trong "${kind}" phù hợp.`}
                      onClearFilters={xoaTatCaBoLocObj} />
                  ) : (
                    <CatalogSmartTable
                      dataset="objects"
                      rows={objList}
                      canEdit={sourceControls.canChange}
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

          {vung === "coverage" && canManageWorkshopScope && hasAuthorizationRevision && (
            <>
              {coverageReadinessErr && (
                <p role="alert" className="cw-loi">Không kiểm tra được Source thiếu khu vực: {coverageReadinessErr}</p>
              )}
              <WorkshopScopeCoveragePanel areaLessSourceCount={coverageAreaLess} onChanged={onReload} />
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
                      canEdit={sourceControls.canChange}
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
          {vung === "import" && sourceControls.canImport && (
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
                        {c.created_by_name} · {formatBangkokDateTime(c.created_at)}
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
                          {formatBangkokDateTime(h.created_at)} · {h.actor}
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
      {dangSuaObj && sourceControls.canChange && (
        <CatalogObjectForm
          row={dangSuaObj.row}
          objectKind={kind}
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
            setDangSuaObj(null);
            await taiDoiTuong();
            onReload?.();
            if (kq.change_id) setChangeId(kq.change_id);
          }}
        />
      )}

      {dangSuaBan && sourceControls.canChange && (
        <CatalogRecordDialog
          open
          dataset={dangSuaBan.dataset}
          record={dangSuaBan.record}
          canEdit={sourceControls.canChange}
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
