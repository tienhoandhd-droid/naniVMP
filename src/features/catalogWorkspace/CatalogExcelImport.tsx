/* Nhập Excel có staging: Source dùng phân loại/diff từ server; sản phẩm GMP
 * giữ đối chiếu local vì dataset nhỏ và RPC hiện tại chưa có preview riêng. */
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Download, FileSpreadsheet, Upload } from "lucide-react";

import StateBoundary from "../../components/ui/StateBoundary.tsx";
import { useRegisterDirtyState } from "../../components/ui/DirtyStateProvider.tsx";
import { formatBangkokDateTime } from "../../lib/formatBangkok.ts";
import {
  CATALOG_TEMPLATE_VERSION, TEMPLATE_CONTRACTS,
  generateCatalogWorkbook, parseCatalogWorkbook,
} from "./catalogWorkbook.ts";
import type { CatalogTemplateDataset, ParsedCatalogRow, ParsedCatalogWorkbook } from "./catalogWorkbook.ts";
import {
  PRODUCT_GMP_TEMPLATE_COLUMNS, SOURCE_OBJECT_TEMPLATE_COLUMNS, layDataset,
} from "./definitions.ts";
import { buildCatalogPatch, diffCatalogRecord } from "./diff.ts";
import { useToast } from "../../components/ui/ToastProvider.tsx";
import {
  commitCatalogImport, exportAllSourceObjects, fetchCatalogImportPreview,
  listDataset, setCatalogImportRowReason, stageCatalogImport,
} from "./api.ts";
import type { CatalogImportBatch, CatalogRecord } from "./contracts.ts";
import CatalogImportPreviewTable from "./CatalogImportPreviewTable.tsx";
import {
  appendCatalogImportPreviewPage, catalogImportCommitBlock,
  emptyCatalogImportPreviewState, type CatalogImportPreviewState,
} from "./catalogImportPreviewModel.ts";

const TEN_FILE: Record<CatalogTemplateDataset, { mau: string; hientai: string }> = {
  source_objects: { mau: "VMP_Mau_Doi_Tuong_Goc_v1.xlsx", hientai: "VMP_Doi_Tuong_Goc_Hien_Tai_v1.xlsx" },
  products_gmp: { mau: "VMP_Mau_San_Pham_GMP_v1.xlsx", hientai: "VMP_San_Pham_GMP_Hien_Tai_v1.xlsx" },
};
const NHAN_DATASET: Record<CatalogTemplateDataset, string> = {
  source_objects: "Đối tượng nguồn", products_gmp: "Sản phẩm GMP",
};
type PhanLoai = "moi" | "sua" | "khongdoi" | "loi";
interface DongXemTruoc extends ParsedCatalogRow {
  loai: PhanLoai;
  doi: Array<{ label: string; truoc: unknown; sau: unknown }>;
}
type TrangThaiStaging =
  | { tt: "chua" } | { tt: "dang" } | { tt: "san"; batch: CatalogImportBatch }
  | { tt: "chan"; loi: string } | { tt: "loi"; loi: string };
interface ImportReceipt {
  dataset: CatalogTemplateDataset;
  batchId: string;
  created: number;
  updated: number;
  unchanged: number;
  committedAt: string;
  pendingChangeIds: string[];
}

const doc = (value: unknown): string => {
  if (value === null || value === undefined || value === "") return "(trống)";
  if (typeof value === "boolean") return value ? "y" : "n";
  return String(value);
};
function taiXuong(buffer: ArrayBuffer, name: string) {
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const anchor = document.createElement("a");
  anchor.href = URL.createObjectURL(blob); anchor.download = name; anchor.click();
  URL.revokeObjectURL(anchor.href);
}

export default function CatalogExcelImport({ onCommitted, onOpenPending }: {
  onCommitted?: (pendingChangeIds: string[]) => void;
  onOpenPending?: () => void;
}) {
  const [dataset, setDataset] = useState<CatalogTemplateDataset>("source_objects");
  const [hienTai, setHienTai] = useState<Map<string, CatalogRecord> | null>(null);
  const [loiHienTai, setLoiHienTai] = useState("");
  const [loiCauTruc, setLoiCauTruc] = useState("");
  const [parsed, setParsed] = useState<ParsedCatalogWorkbook | null>(null);
  const [staging, setStaging] = useState<TrangThaiStaging>({ tt: "chua" });
  const [moA3, setMoA3] = useState<ReadonlySet<number>>(new Set());
  const [lyDo, setLyDo] = useState("");
  const [dangGhi, setDangGhi] = useState(false);
  const [commitError, setCommitError] = useState("");
  const [serverPreview, setServerPreview] = useState<CatalogImportPreviewState | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [receipt, setReceipt] = useState<ImportReceipt | null>(null);
  const previewGeneration = useRef(0);
  const oFile = useRef<HTMLInputElement | null>(null);
  const toast = useToast();

  useRegisterDirtyState("catalog-excel-import", parsed !== null && receipt === null);
  const cot = dataset === "source_objects" ? SOURCE_OBJECT_TEMPLATE_COLUMNS : PRODUCT_GMP_TEMPLATE_COLUMNS;
  const truong = layDataset(dataset === "source_objects" ? "objects" : "products").fields;

  useEffect(() => {
    let cancelled = false;
    setHienTai(null); setLoiHienTai("");
    void (async () => {
      try {
        const map = new Map<string, CatalogRecord>();
        if (dataset === "products_gmp") {
          for (let page = 0; ; page += 1) {
            const result = await listDataset({ dataset: "products", page, pageSize: 500 });
            if (!result.ok) throw new Error(result.error || "Không đọc được danh mục");
            for (const row of result.rows) map.set(row.businessKey, row.data);
            if ((page + 1) * 500 >= result.total || result.rows.length === 0) break;
          }
        }
        if (!cancelled) setHienTai(map);
      } catch (cause) {
        if (!cancelled) setLoiHienTai(cause instanceof Error ? cause.message : "Không tải được dữ liệu hiện tại");
      }
    })();
    return () => { cancelled = true; };
  }, [dataset]);

  const xemTruoc = useMemo<DongXemTruoc[] | null>(() => {
    if (dataset !== "products_gmp" || !parsed?.ok || parsed.dataset !== dataset || !hienTai) return null;
    return parsed.rows.map((row) => {
      if (row.errors.length > 0) return { ...row, loai: "loi", doi: [] };
      const current = hienTai.get(row.businessKey);
      if (!current) return { ...row, loai: "moi", doi: [] };
      const patch = buildCatalogPatch(truong, current, row.values);
      if (Object.keys(patch).length === 0) return { ...row, loai: "khongdoi", doi: [] };
      return {
        ...row, loai: "sua",
        doi: diffCatalogRecord(truong, current, row.values).filter((item) => item.changed)
          .map((item) => ({ label: item.label, truoc: item.before, sau: item.after })),
      };
    });
  }, [dataset, hienTai, parsed, truong]);
  const tong = useMemo(() => {
    const counts: Record<PhanLoai, number> = { moi: 0, sua: 0, khongdoi: 0, loi: 0 };
    for (const row of xemTruoc ?? []) counts[row.loai] += 1;
    return counts;
  }, [xemTruoc]);

  const fetchPreviewPage = async (batchId: string, cursor: number, append: boolean, generation: number) => {
    append ? setLoadingMore(true) : setLoadingPreview(true);
    setPreviewError("");
    const result = await fetchCatalogImportPreview({ batchId, cursor, limit: 100 });
    if (generation !== previewGeneration.current) return;
    setLoadingMore(false); setLoadingPreview(false);
    if (!result.ok) { setPreviewError(result.error); return; }
    try {
      setServerPreview((current) => append
        ? appendCatalogImportPreviewPage(current ?? emptyCatalogImportPreviewState(batchId), result.page)
        : appendCatalogImportPreviewPage(emptyCatalogImportPreviewState(batchId), result.page));
      if (!append) {
        const count = result.page.batch.counts;
        if (count.errors > 0) toast.canhBao(`${count.errors} dòng lỗi — kiểm tra bảng đối chiếu server`);
        else toast.thanhCong(`${result.page.batch.total} dòng đã được server đối chiếu, chưa ghi`);
      }
    } catch (cause) {
      setPreviewError(cause instanceof Error ? cause.message : "Không ghép được trang xem trước");
    }
  };

  useEffect(() => {
    if (!parsed?.ok || parsed.dataset !== dataset) return undefined;
    let cancelled = false;
    const generation = ++previewGeneration.current;
    setStaging({ tt: "dang" }); setServerPreview(null); setPreviewError(""); setReceipt(null);
    void stageCatalogImport({
      dataset,
      templateVersion: CATALOG_TEMPLATE_VERSION,
      fingerprint: TEMPLATE_CONTRACTS[dataset].fingerprint,
      rows: parsed.rows.map((row) => ({
        rowNumber: row.rowNumber, businessKey: row.businessKey,
        objectKind: row.objectKind, values: row.values,
      })),
    }).then((result) => {
      if (cancelled || generation !== previewGeneration.current) return;
      if (result.ok && result.batch) {
        setStaging({ tt: "san", batch: result.batch });
        if (dataset === "source_objects") void fetchPreviewPage(result.batch.id, 0, false, generation);
      } else if (result.errorCode === "NOT_AVAILABLE") {
        setStaging({ tt: "chan", loi: result.error || "Chưa bật nhập theo lô trên máy chủ" });
      } else {
        const message = result.error || "Không staging được lô nhập";
        setStaging({ tt: "loi", loi: message }); toast.loi(message);
      }
    });
    return () => { cancelled = true; };
  }, [dataset, parsed]);

  const resetImport = () => {
    previewGeneration.current += 1;
    setLoiCauTruc(""); setParsed(null); setMoA3(new Set()); setStaging({ tt: "chua" });
    setServerPreview(null); setPreviewError(""); setLyDo(""); setCommitError(""); setReceipt(null);
  };
  const chonFile = async (files: FileList | null) => {
    const file = files?.[0];
    if (oFile.current) oFile.current.value = "";
    if (!file) return;
    resetImport();
    const result = await parseCatalogWorkbook(file);
    if (!result.ok) {
      const message = result.error || "File không hợp lệ.";
      setLoiCauTruc(message); toast.loi(message); return;
    }
    if (result.dataset && result.dataset !== dataset) setDataset(result.dataset);
    setParsed(result);
  };

  const taiMau = async (kind: "mau" | "hientai") => {
    try {
      let rows: CatalogRecord[] = [];
      if (kind === "hientai" && dataset === "source_objects") {
        rows = await exportAllSourceObjects({ objectKind: null, search: "", filters: {
          validation: "all", first_month: "all", owner: "all", frequency: "all",
        } }) as unknown as CatalogRecord[];
      } else if (kind === "hientai") rows = [...(hienTai?.values() ?? [])];
      taiXuong(await generateCatalogWorkbook(dataset, rows), TEN_FILE[dataset][kind]);
    } catch (cause) {
      toast.loi(`Không tạo được file Excel: ${cause instanceof Error ? cause.message : String(cause)}`);
    }
  };

  const xuatSoLoi = async () => {
    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("LOI");
    if (dataset === "source_objects") {
      sheet.addRow(["Dòng", "Mã đối tượng", "Loại", "Mã lỗi", "Mô tả lỗi", "Trường"]).font = { bold: true };
      for (const row of (serverPreview?.rows ?? []).filter((item) => item.classification === "error")) {
        for (const error of row.errors) sheet.addRow([row.rowNumber, row.businessKey, row.objectKind ?? "", error.code, error.message, error.field ?? ""]);
      }
    } else {
      sheet.addRow([...cot.map((column) => column.header), "Mã lỗi", "Mô tả lỗi"]).font = { bold: true };
      for (const row of (xemTruoc ?? []).filter((item) => item.loai === "loi")) {
        sheet.addRow([
          ...cot.map((column) => column.key === "object_kind" ? (row.objectKind ?? "") : (row.values[column.key] ?? "")),
          row.errors.map((error) => error.code).join("; "), row.errors.map((error) => error.message).join(" · "),
        ]);
      }
    }
    taiXuong(await workbook.xlsx.writeBuffer() as ArrayBuffer, `VMP_So_Loi_Nhap_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const saveRowReason = async (rowNumber: number, reason: string) => {
    if (staging.tt !== "san") return { ok: false, error: "Lô nhập chưa sẵn sàng" };
    const result = await setCatalogImportRowReason(staging.batch.id, rowNumber, reason);
    if (result.ok) setServerPreview((current) => current ? {
      ...current, rows: current.rows.map((row) => row.rowNumber === rowNumber ? { ...row, rowReason: reason || null } : row),
    } : current);
    return { ok: result.ok, error: result.error };
  };

  const soLoi = dataset === "source_objects" ? (serverPreview?.batch?.counts.errors ?? 0) : tong.loi;
  const previewOk = dataset === "source_objects" ? Boolean(serverPreview?.batch && !previewError) : Boolean(xemTruoc);
  const ghi = async () => {
    const block = catalogImportCommitBlock({
      busy: dangGhi, previewOk,
      status: serverPreview?.batch?.status ?? (staging.tt === "san" ? staging.batch.status : "missing"),
      errors: soLoi, reason: lyDo,
    });
    if (block) {
      setCommitError(block.message);
      if (block.focusId) requestAnimationFrame(() => document.getElementById(block.focusId ?? "")?.focus());
      return;
    }
    if (staging.tt !== "san") return;
    setDangGhi(true); setCommitError("");
    const progress = toast.dangChay("Đang ghi lô vào hệ thống…");
    const result = await commitCatalogImport(staging.batch.id, lyDo.trim());
    setDangGhi(false);
    if (!result.ok) {
      const conflict = result.errorCode === "STALE_VERSION" || result.errorCode === "VERSION_CONFLICT";
      const message = conflict
        ? "Dữ liệu nguồn đã thay đổi sau khi staging. Hãy chọn lại file để tạo bản xem trước mới; nội dung và lý do hiện tại vẫn được giữ."
        : `Ghi thất bại: ${result.error || result.errorCode || "không rõ"}`;
      progress.hong(message); setCommitError(message); return;
    }
    const nextReceipt: ImportReceipt = {
      dataset,
      batchId: staging.batch.id,
      created: result.created ?? 0, updated: result.updated ?? 0, unchanged: result.unchanged ?? 0,
      committedAt: result.committedAt ?? new Date().toISOString(),
      pendingChangeIds: result.pendingChangeIds ?? [],
    };
    setReceipt(nextReceipt); setParsed(null); setServerPreview(null); setStaging({ tt: "chua" });
    progress.xong(`Đã ghi ${nextReceipt.created} tạo mới · ${nextReceipt.updated} cập nhật · ${nextReceipt.unchanged} không đổi`);
    onCommitted?.(nextReceipt.pendingChangeIds);
  };

  const retryPreview = () => {
    if (staging.tt !== "san") return;
    void fetchPreviewPage(staging.batch.id, 0, false, previewGeneration.current);
  };
  const loadMore = () => {
    if (staging.tt !== "san" || !serverPreview?.nextCursor) return;
    void fetchPreviewPage(staging.batch.id, serverPreview.nextCursor, true, previewGeneration.current);
  };
  const NHAN_LOAI: Record<PhanLoai, string> = { moi: "Tạo mới", sua: "Sửa", khongdoi: "Không đổi", loi: "Lỗi" };

  return (
    <div className="cw-import">
      <div className="cw-import__dau">
        <div className="cw-kind" role="group" aria-label="Bộ dữ liệu của mẫu Excel">
          {(Object.keys(TEN_FILE) as CatalogTemplateDataset[]).map((item) => (
            <button key={item} type="button" data-cw-imp-dataset={item}
              className={`cw-kind__muc${dataset === item ? " is-mo" : ""}`} aria-pressed={dataset === item}
              onClick={() => { if (item !== dataset) { resetImport(); setDataset(item); } }}>
              {NHAN_DATASET[item]}
            </button>
          ))}
        </div>
        <div className="cw-import__taive">
          <button type="button" className="cw-nut" data-cw-taive="mau" data-cw-ten-file={TEN_FILE[dataset].mau} onClick={() => void taiMau("mau")}>
            <Download size={15} aria-hidden="true" /> Tải mẫu trống
          </button>
          <button type="button" className="cw-nut" data-cw-taive="hientai" data-cw-ten-file={TEN_FILE[dataset].hientai}
            disabled={!hienTai} onClick={() => void taiMau("hientai")}>
            <Download size={15} aria-hidden="true" /> Tải dữ liệu hiện tại
          </button>
        </div>
      </div>

      {loiHienTai && <StateBoundary state="error" title="Chưa tải được dữ liệu hiện tại" description={loiHienTai} />}
      <label className="cw-import__chon">
        <Upload size={16} aria-hidden="true" />
        <span>Chọn file Excel theo mẫu (.xlsx, tối đa 5 MiB, 2.000 dòng)</span>
        <input ref={oFile} type="file" accept=".xlsx" aria-label="Chọn file Excel theo mẫu" onChange={(event) => void chonFile(event.target.files)} />
      </label>
      {loiCauTruc && <p className="cw-import__loi" role="alert">{loiCauTruc} Không có gì được gửi lên server.</p>}

      {receipt && (
        <section className="cw-import-receipt" data-cw-import-receipt aria-labelledby="cw-import-receipt-title">
          <Check size={20} aria-hidden="true" />
          <div><h3 id="cw-import-receipt-title">Đã ghi {NHAN_DATASET[receipt.dataset]}</h3>
            <p>{receipt.created} tạo mới · {receipt.updated} cập nhật · {receipt.unchanged} không đổi</p>
            <p className="cw-nhe">Batch {receipt.batchId.slice(0, 8)}… · {formatBangkokDateTime(receipt.committedAt)}</p>
          </div>
          <div className="cw-import-receipt__actions">
            <button type="button" className="cw-nut cw-nut--phu" onClick={() => void navigator.clipboard.writeText(receipt.batchId).then(() => toast.thanhCong("Đã sao chép batch ID")).catch(() => toast.loi("Không sao chép được batch ID"))}>
              <Copy size={14} aria-hidden="true" /> Sao chép ID
            </button>
            {receipt.pendingChangeIds.length > 0 && <button type="button" className="cw-nut" onClick={onOpenPending}>Mở Chờ áp dụng ({receipt.pendingChangeIds.length})</button>}
          </div>
        </section>
      )}

      {parsed?.ok && dataset === "source_objects" && loadingPreview && !serverPreview && (
        <StateBoundary state="loading" title="Máy chủ đang đối chiếu từng dòng" skeletonRows={4} />
      )}
      {dataset === "source_objects" && previewError && (
        <div className="cw-import__preview-error" role="alert"><span>{previewError}</span>
          <button type="button" className="cw-nut" onClick={retryPreview}>Thử lại bản xem trước</button>
        </div>
      )}
      {dataset === "source_objects" && serverPreview?.batch && (
        <>
          <CatalogImportPreviewTable state={serverPreview} loadingMore={loadingMore} onLoadMore={loadMore} onSaveRowReason={saveRowReason} />
          {soLoi > 0 && <button type="button" className="cw-nut" data-cw-xuat-loi onClick={() => void xuatSoLoi()}>
            <FileSpreadsheet size={15} aria-hidden="true" /> Xuất lỗi đã tải
          </button>}
        </>
      )}

      {dataset === "products_gmp" && parsed?.ok && !xemTruoc && <StateBoundary state="loading" title="Đang đối chiếu dữ liệu hiện tại" skeletonRows={3} />}
      {dataset === "products_gmp" && xemTruoc && (
        <>
          <div className="cw-import__tong" role="group" aria-label="Tổng kết xem trước">
            {(["moi", "sua", "khongdoi", "loi"] as PhanLoai[]).map((item) => <span key={item} className={`cw-import__dem cw-import__dem--${item}`}>{NHAN_LOAI[item]}: <b data-cw-tong={item}>{tong[item]}</b></span>)}
            {soLoi > 0 && <button type="button" className="cw-nut" data-cw-xuat-loi onClick={() => void xuatSoLoi()}><FileSpreadsheet size={15} aria-hidden="true" /> Xuất sổ lỗi</button>}
          </div>
          <ol className="cw-lich-su" aria-label="Từng dòng trong file">
            {xemTruoc.map((row) => <li key={row.rowNumber} className="cw-lich-su__dong">
              <div className="cw-lich-su__chinh"><span className="cw-nhe">Dòng {row.rowNumber}</span><b className="cw-ma">{row.businessKey || "(thiếu mã)"}</b><span className={`cw-tag cw-tag--imp-${row.loai}`}>{NHAN_LOAI[row.loai]}</span>
                {row.loai === "sua" && <button type="button" className="cw-nut" aria-expanded={moA3.has(row.rowNumber)} onClick={() => setMoA3((current) => { const next = new Set(current); next.has(row.rowNumber) ? next.delete(row.rowNumber) : next.add(row.rowNumber); return next; })}>{moA3.has(row.rowNumber) ? "Thu gọn" : "Đối chiếu"}</button>}
              </div>
              {row.loai === "loi" && <div className="cw-loi">{row.errors.map((error) => error.message).join(" · ")}</div>}
              {row.loai === "sua" && moA3.has(row.rowNumber) && <dl className="cw-import-a3">{row.doi.map((change) => <div key={change.label} className="cw-import-a3__dong"><dt>{change.label}</dt><dd><s className="cw-import-a3__truoc">{doc(change.truoc)}</s><span className="cw-import-a3__sau">{doc(change.sau)}</span></dd></div>)}</dl>}
            </li>)}
          </ol>
        </>
      )}

      {parsed?.ok && (
        <div className="cw-import__ghi">
          {staging.tt === "chan" && <p className="cw-canh-bao" data-cw-ghi-chan>BỊ CHẶN — {staging.loi}</p>}
          {staging.tt === "loi" && <p className="cw-canh-bao cw-canh-bao--loi" data-cw-ghi-chan>{staging.loi}</p>}
          {soLoi > 0 && <p className="cw-nhe">Còn {soLoi} dòng lỗi — sửa trong Excel rồi chọn lại file.</p>}
          <label className="cw-truong" htmlFor="cw-import-batch-reason"><span className="cw-nhan">Lý do của cả lô nhập <span className="cw-bat-buoc-chu">Bắt buộc</span></span></label>
          <textarea id="cw-import-batch-reason" className="cw-o" rows={2} value={lyDo} aria-describedby={commitError ? "cw-import-commit-error" : undefined}
            placeholder="Vì sao có đợt nhập này — sẽ nằm trong audit" onChange={(event) => { setLyDo(event.target.value); setCommitError(""); }} />
          {commitError && <p id="cw-import-commit-error" className="cw-import__loi" role="alert">{commitError}</p>}
          <div className="cw-chan-nut"><button type="button" className="cw-nut cw-nut--chinh" data-cw-ghi disabled={dangGhi} onClick={() => void ghi()}>{dangGhi ? "Đang ghi…" : "Ghi vào hệ thống"}</button></div>
        </div>
      )}
    </div>
  );
}
