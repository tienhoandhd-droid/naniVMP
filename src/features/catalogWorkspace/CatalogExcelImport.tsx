/* =====================================================================
 *  CatalogExcelImport — vòng đời nhập Excel của workspace Danh mục
 *  ---------------------------------------------------------------------
 *  Tải mẫu → dán dữ liệu → tải lên → XEM TRƯỚC từng dòng → ghi một lần
 *  có lý do. Bốn nguyên tắc:
 *
 *   1. File sai cấu trúc bị chặn NGAY Ở TRÌNH DUYỆT với lời giải thích
 *      cụ thể, và không sinh một RPC nào — server không phải đỡ rác.
 *   2. Xem trước đối chiếu với dữ liệu hiện tại: mới / sửa (kèm A3
 *      trước–sau) / không đổi / lỗi. Người ký hồ sơ thấy trước cái mình
 *      sắp chịu trách nhiệm.
 *   3. Dòng lỗi xuất được ra sổ lỗi (kèm Mã lỗi · Mô tả lỗi) để sửa
 *      trong Excel rồi tải lại — không ai phải chép tay từng lỗi.
 *   4. GHI đi qua lô staging phía server (rpc_stage/commit_catalog_import
 *      — Đợt B Task 9). Chừng nào migration đó chưa áp, khu Ghi hiện
 *      BỊ CHẶN và nút khoá; khi RPC xuất hiện thì tự mở, không cần sửa
 *      giao diện.
 * ===================================================================== */
import { useEffect, useMemo, useRef, useState } from "react";
import { Download, FileSpreadsheet, Upload } from "lucide-react";

import StateBoundary from "../../components/ui/StateBoundary.tsx";
import { useRegisterDirtyState } from "../../components/ui/DirtyStateProvider.tsx";
import { fetchSourceObjects } from "../../lib/supabaseData.ts";
import {
  CATALOG_TEMPLATE_VERSION, TEMPLATE_CONTRACTS,
  generateCatalogWorkbook, parseCatalogWorkbook,
} from "./catalogWorkbook.ts";
import type { CatalogTemplateDataset, ParsedCatalogRow, ParsedCatalogWorkbook } from "./catalogWorkbook.ts";
import {
  PRODUCT_GMP_TEMPLATE_COLUMNS, SOURCE_OBJECT_TEMPLATE_COLUMNS, layDataset,
} from "./definitions.ts";
import { buildCatalogPatch, diffCatalogRecord } from "./diff.ts";
import { commitCatalogImport, listDataset, stageCatalogImport } from "./api.ts";
import type { CatalogImportBatch, CatalogRecord } from "./contracts.ts";

const TEN_FILE: Record<CatalogTemplateDataset, { mau: string; hientai: string }> = {
  source_objects: {
    mau: "VMP_Mau_Doi_Tuong_Goc_v1.xlsx",
    hientai: "VMP_Doi_Tuong_Goc_Hien_Tai_v1.xlsx",
  },
  products_gmp: {
    mau: "VMP_Mau_San_Pham_GMP_v1.xlsx",
    hientai: "VMP_San_Pham_GMP_Hien_Tai_v1.xlsx",
  },
};

const NHAN_DATASET: Record<CatalogTemplateDataset, string> = {
  source_objects: "Đối tượng nguồn",
  products_gmp: "Sản phẩm GMP",
};

type PhanLoai = "moi" | "sua" | "khongdoi" | "loi";

interface DongXemTruoc extends ParsedCatalogRow {
  loai: PhanLoai;
  /** Chỉ dòng "sua": các trường đổi, để dựng A3. */
  doi: Array<{ label: string; truoc: unknown; sau: unknown }>;
}

type TrangThaiStaging =
  | { tt: "chua" }
  | { tt: "dang" }
  | { tt: "san"; batch: CatalogImportBatch }
  | { tt: "chan"; loi: string }
  | { tt: "loi"; loi: string };

const doc = (v: unknown): string => {
  if (v === null || v === undefined || v === "") return "(trống)";
  if (typeof v === "boolean") return v ? "y" : "n";
  return String(v);
};

function taiXuong(buf: ArrayBuffer, ten: string) {
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = ten;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function CatalogExcelImport({ onCommitted }: {
  /** Gọi sau khi ghi lô thành công — shell tải lại dữ liệu/hàng chờ. */
  onCommitted?: (pendingChangeIds: string[]) => void;
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
  const [ketQuaGhi, setKetQuaGhi] = useState("");
  const oFile = useRef<HTMLInputElement | null>(null);

  /* Còn bản xem trước chưa ghi là còn việc dở — chặn đóng nhầm. */
  useRegisterDirtyState("catalog-excel-import", parsed !== null);

  const cot = dataset === "source_objects"
    ? SOURCE_OBJECT_TEMPLATE_COLUMNS : PRODUCT_GMP_TEMPLATE_COLUMNS;
  const truong = layDataset(dataset === "source_objects" ? "objects" : "products").fields;

  /* ---- Dữ liệu hiện tại của dataset đang chọn — nền cho đối chiếu ---- */
  useEffect(() => {
    let dung = false;
    setHienTai(null);
    setLoiHienTai("");
    (async () => {
      try {
        const map = new Map<string, CatalogRecord>();
        if (dataset === "source_objects") {
          const rows = await fetchSourceObjects({ kind: null, includeInactive: true });
          for (const r of rows) map.set(String(r.object_code), r as unknown as CatalogRecord);
        } else {
          let page = 0;
          for (;;) {
            const kq = await listDataset({ dataset: "products", page, pageSize: 500 });
            if (!kq.ok) throw new Error(kq.error || "Không đọc được danh mục");
            for (const r of kq.rows) map.set(r.businessKey, r.data);
            if ((page + 1) * 500 >= kq.total || kq.rows.length === 0) break;
            page += 1;
          }
        }
        if (!dung) setHienTai(map);
      } catch (e) {
        if (!dung) setLoiHienTai((e as Error).message || "Không tải được dữ liệu hiện tại");
      }
    })();
    return () => { dung = true; };
  }, [dataset]);

  /* ---- Phân loại từng dòng so với hiện tại ---- */
  const xemTruoc = useMemo<DongXemTruoc[] | null>(() => {
    if (!parsed?.ok || parsed.dataset !== dataset || !hienTai) return null;
    return parsed.rows.map((r) => {
      if (r.errors.length > 0) return { ...r, loai: "loi", doi: [] };
      const cur = hienTai.get(r.businessKey);
      if (!cur) return { ...r, loai: "moi", doi: [] };
      const patch = buildCatalogPatch(truong, cur, r.values);
      if (Object.keys(patch).length === 0) return { ...r, loai: "khongdoi", doi: [] };
      const doi = diffCatalogRecord(truong, cur, r.values)
        .filter((d) => d.changed)
        .map((d) => ({ label: d.label, truoc: d.before, sau: d.after }));
      return { ...r, loai: "sua", doi };
    });
  }, [parsed, dataset, hienTai, truong]);

  const tong = useMemo(() => {
    const dem: Record<PhanLoai, number> = { moi: 0, sua: 0, khongdoi: 0, loi: 0 };
    for (const r of xemTruoc ?? []) dem[r.loai] += 1;
    return dem;
  }, [xemTruoc]);

  /* ---- Staging phía server, ngay khi có bản đọc hợp lệ ---- */
  useEffect(() => {
    if (!parsed?.ok || parsed.dataset !== dataset) return undefined;
    let dung = false;
    setStaging({ tt: "dang" });
    stageCatalogImport({
      dataset,
      templateVersion: CATALOG_TEMPLATE_VERSION,
      fingerprint: TEMPLATE_CONTRACTS[dataset].fingerprint,
      rows: parsed.rows.map((r) => ({
        rowNumber: r.rowNumber, businessKey: r.businessKey,
        objectKind: r.objectKind, values: r.values,
      })),
    }).then((kq) => {
      if (dung) return;
      if (kq.ok && kq.batch) setStaging({ tt: "san", batch: kq.batch });
      else if (kq.errorCode === "NOT_AVAILABLE") setStaging({ tt: "chan", loi: kq.error || "" });
      else setStaging({ tt: "loi", loi: kq.error || "Không staging được lô nhập" });
    });
    return () => { dung = true; };
  }, [parsed, dataset]);

  /* ---- Chọn file ---- */
  const chonFile = async (danhSach: FileList | null) => {
    const f = danhSach?.[0];
    /* Xoá value NGAY: người dùng sửa file rồi chọn lại cùng tên vẫn phải
       kích hoạt onChange lần nữa. */
    if (oFile.current) oFile.current.value = "";
    if (!f) return;
    setLoiCauTruc(""); setParsed(null); setMoA3(new Set());
    setStaging({ tt: "chua" }); setKetQuaGhi(""); setLyDo("");
    const kq = await parseCatalogWorkbook(f);
    if (!kq.ok) {
      setLoiCauTruc(kq.error || "File không hợp lệ.");
      return;
    }
    if (kq.dataset && kq.dataset !== dataset) setDataset(kq.dataset);
    setParsed(kq);
  };

  /* ---- Tải mẫu / dữ liệu hiện tại ---- */
  const taiMau = async (loai: "mau" | "hientai") => {
    const rows = loai === "mau" ? [] : [...(hienTai?.values() ?? [])];
    taiXuong(await generateCatalogWorkbook(dataset, rows), TEN_FILE[dataset][loai]);
  };

  /* ---- Sổ lỗi: mẫu + hai cột Mã lỗi · Mô tả lỗi ---- */
  const xuatSoLoi = async () => {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet("LOI");
    sheet.addRow([...cot.map((c) => c.header), "Mã lỗi", "Mô tả lỗi"]).font = { bold: true };
    for (const r of (xemTruoc ?? []).filter((x) => x.loai === "loi")) {
      /* Ghi là giá trị thuần — sổ lỗi không bao giờ chứa công thức chạy được. */
      sheet.addRow([
        ...cot.map((c) => c.key === "object_kind"
          ? (r.objectKind ?? "")
          : (r.values[c.key] === null || r.values[c.key] === undefined ? ""
            : typeof r.values[c.key] === "boolean" ? (r.values[c.key] ? "y" : "n")
            : (r.values[c.key] as string | number))),
        r.errors.map((e) => e.code).join("; "),
        r.errors.map((e) => e.message).join(" · "),
      ]);
    }
    taiXuong(await wb.xlsx.writeBuffer() as ArrayBuffer,
      `VMP_So_Loi_Nhap_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  /* ---- Ghi lô ---- */
  const ghi = async () => {
    if (staging.tt !== "san" || !lyDo.trim()) return;
    setDangGhi(true);
    const kq = await commitCatalogImport(staging.batch.id, lyDo.trim());
    setDangGhi(false);
    if (!kq.ok) {
      setKetQuaGhi(`Ghi thất bại: ${kq.error || kq.errorCode || "không rõ"}`);
      return;
    }
    setKetQuaGhi(`Đã ghi: ${kq.created ?? 0} tạo mới · ${kq.updated ?? 0} sửa · ${kq.unchanged ?? 0} giữ nguyên.`);
    setParsed(null);
    onCommitted?.(kq.pendingChangeIds ?? []);
  };

  const soLoi = tong.loi;
  const ghiDuoc = staging.tt === "san" && soLoi === 0 && lyDo.trim() !== "" && !dangGhi;

  const NHAN_LOAI: Record<PhanLoai, string> = {
    moi: "Tạo mới", sua: "Sửa", khongdoi: "Không đổi", loi: "Lỗi",
  };

  return (
    <div className="cw-import">
      {/* ---- Chọn bộ dữ liệu + tải mẫu ---- */}
      <div className="cw-import__dau">
        <div className="cw-kind" role="group" aria-label="Bộ dữ liệu của mẫu Excel">
          {(Object.keys(TEN_FILE) as CatalogTemplateDataset[]).map((d) => (
            <button key={d} type="button" data-cw-imp-dataset={d}
              className={`cw-kind__muc${dataset === d ? " is-mo" : ""}`}
              aria-pressed={dataset === d}
              onClick={() => setDataset(d)}>
              {NHAN_DATASET[d]}
            </button>
          ))}
        </div>
        <div className="cw-import__taive">
          <button type="button" className="cw-nut" data-cw-taive="mau"
            data-cw-ten-file={TEN_FILE[dataset].mau}
            onClick={() => taiMau("mau")}>
            <Download size={15} aria-hidden="true" /> Tải mẫu trống
          </button>
          <button type="button" className="cw-nut" data-cw-taive="hientai"
            data-cw-ten-file={TEN_FILE[dataset].hientai}
            disabled={!hienTai}
            title="Xuất đúng phần dữ liệu bạn được xem — không phải toàn hệ thống nếu quyền của bạn hẹp hơn"
            onClick={() => taiMau("hientai")}>
            <Download size={15} aria-hidden="true" /> Tải dữ liệu hiện tại
          </button>
        </div>
      </div>

      {loiHienTai && (
        <StateBoundary state="error" title="Chưa tải được dữ liệu hiện tại để đối chiếu"
          description={loiHienTai} />
      )}

      {/* ---- Chọn file ---- */}
      <label className="cw-import__chon">
        <Upload size={16} aria-hidden="true" />
        <span>Chọn file Excel đã điền theo mẫu (.xlsx, tối đa 5 MiB, 2.000 dòng)</span>
        <input ref={oFile} type="file" accept=".xlsx"
          aria-label="Chọn file Excel theo mẫu"
          onChange={(e) => chonFile(e.target.files)} />
      </label>

      {loiCauTruc && (
        <p className="cw-import__loi" role="alert">
          {loiCauTruc} Không có gì được gửi lên server — sửa file rồi chọn lại.
        </p>
      )}

      {/* ---- Xem trước ---- */}
      {parsed?.ok && !xemTruoc && (
        <StateBoundary state="loading" title="Đang đối chiếu với dữ liệu hiện tại" skeletonRows={3} />
      )}

      {xemTruoc && (
        <>
          <div className="cw-import__tong" role="group" aria-label="Tổng kết xem trước">
            {(["moi", "sua", "khongdoi", "loi"] as PhanLoai[]).map((l) => (
              <span key={l} className={`cw-import__dem cw-import__dem--${l}`}>
                {NHAN_LOAI[l]}: <b data-cw-tong={l}>{tong[l]}</b>
              </span>
            ))}
            {soLoi > 0 && (
              <button type="button" className="cw-nut" data-cw-xuat-loi onClick={xuatSoLoi}>
                <FileSpreadsheet size={15} aria-hidden="true" /> Xuất sổ lỗi
              </button>
            )}
          </div>

          <ol className="cw-lich-su" aria-label="Từng dòng trong file">
            {xemTruoc.map((r) => (
              <li key={r.rowNumber} className="cw-lich-su__dong">
                <div className="cw-lich-su__chinh">
                  <span className="cw-nhe">Dòng {r.rowNumber}</span>
                  <b className="cw-ma">{r.businessKey || "(thiếu mã)"}</b>
                  <span className={`cw-tag cw-tag--imp-${r.loai}`}>{NHAN_LOAI[r.loai]}</span>
                  {r.loai === "sua" && (
                    <button type="button" className="cw-nut" data-cw-imp-a3
                      aria-expanded={moA3.has(r.rowNumber)}
                      onClick={() => setMoA3((p) => {
                        const n = new Set(p);
                        if (n.has(r.rowNumber)) n.delete(r.rowNumber); else n.add(r.rowNumber);
                        return n;
                      })}>
                      {moA3.has(r.rowNumber) ? "Thu gọn" : "Đối chiếu"}
                    </button>
                  )}
                </div>
                {r.loai === "loi" && (
                  <div className="cw-loi">{r.errors.map((e) => e.message).join(" · ")}</div>
                )}
                {r.loai === "sua" && moA3.has(r.rowNumber) && (
                  <dl className="cw-import-a3">
                    {r.doi.map((d) => (
                      <div key={d.label} className="cw-import-a3__dong">
                        <dt>{d.label}</dt>
                        <dd>
                          <s className="cw-import-a3__truoc">{doc(d.truoc)}</s>
                          <span className="cw-import-a3__sau">{doc(d.sau)}</span>
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
              </li>
            ))}
          </ol>

          {/* ---- Ghi vào hệ thống ---- */}
          <div className="cw-import__ghi">
            {staging.tt === "chan" && (
              <p className="cw-canh-bao" data-cw-ghi-chan>
                BỊ CHẶN — {staging.loi} Xem trước ở trên vẫn đầy đủ; phần ghi
                sẽ tự mở khi migration staging được áp theo quy trình §5.
              </p>
            )}
            {staging.tt === "loi" && (
              <p className="cw-canh-bao cw-canh-bao--loi" data-cw-ghi-chan>{staging.loi}</p>
            )}
            {soLoi > 0 && (
              <p className="cw-nhe">Còn {soLoi} dòng lỗi — sửa hết trong Excel rồi tải lại mới ghi được.</p>
            )}
            <label className="cw-truong">
              <span className="cw-nhan">Lý do của cả lô nhập</span>
              <textarea className="cw-o" rows={2} value={lyDo}
                disabled={staging.tt !== "san"}
                placeholder="Vì sao có đợt nhập này — sẽ nằm trong audit của từng dòng"
                onChange={(e) => setLyDo(e.target.value)} />
            </label>
            <div className="cw-chan-nut">
              <button type="button" className="cw-nut cw-nut--chinh" data-cw-ghi
                disabled={!ghiDuoc} onClick={ghi}>
                {dangGhi ? "Đang ghi…" : "Ghi vào hệ thống"}
              </button>
            </div>
            {ketQuaGhi && <p className="cw-nhe" role="status">{ketQuaGhi}</p>}
          </div>
        </>
      )}
    </div>
  );
}
