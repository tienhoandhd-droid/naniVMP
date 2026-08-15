/* =====================================================================
 *  catalogWorkbook.ts — sinh và đọc mẫu Excel chính thức của Danh mục
 *  ---------------------------------------------------------------------
 *  Hai nửa của MỘT hợp đồng:
 *
 *   · generateCatalogWorkbook — file mẫu 4 sheet: HUONG_DAN (khoá),
 *     DU_LIEU (nơi duy nhất nhập), DANH_MUC (ẩn — nguồn dropdown), và
 *     _VMP_META (veryHidden — dataset + version + fingerprint).
 *
 *   · parseCatalogWorkbook — parser PHÒNG THỦ cho file người dùng tải
 *     lên: kiểm đuôi/kích thước trước khi đọc, chặn cấu trúc lạ trước khi
 *     trả dữ liệu, giới hạn sheet/dòng/cột/tổng ô khi duyệt, TỪ CHỐI công
 *     thức thay vì tính nó, và chuẩn hoá giá trị bằng đúng `chuanHoa` mà
 *     form dùng — hai đường nhập không được ra hai luật.
 *
 *  Meta/fingerprint là hợp đồng TƯƠNG THÍCH, không phải xác thực: server
 *  kiểm lại từng trường khi ghi. Ở đây chỉ bảo đảm "đúng file mẫu, đúng
 *  phiên bản" để lỗi hiện ra sớm và dễ hiểu.
 *
 *  Không dùng SheetJS/xlsx cho file tải lên (advisory prototype-pollution
 *  /ReDoS) — ExcelJS sinh mẫu thì cũng ExcelJS đọc mẫu.
 * ===================================================================== */
import { chuanHoa } from "./diff.ts";
import {
  PRODUCT_GMP_TEMPLATE_COLUMNS, SOURCE_OBJECT_TEMPLATE_COLUMNS,
  layDataset,
} from "./definitions.ts";
import type { CatalogTemplateColumn } from "./definitions.ts";
import type { CatalogFieldDefinition, CatalogRecord } from "./contracts.ts";
import type { ObjectKind } from "../../types/domain.ts";

export const CATALOG_TEMPLATE_VERSION = "1";

export type CatalogTemplateDataset = "source_objects" | "products_gmp";

/* Khai lại danh sách loại tại đây (có kiểm kiểu bằng ObjectKind) thay vì
 * import từ supabaseData: file này phải chạy được trong `node --test`
 * mà không kéo theo client Supabase. */
const OBJECT_KINDS: readonly ObjectKind[] = [
  "Thiết bị", "Quy trình", "Kho", "Hệ thống phụ trợ", "Vận chuyển",
];

const BO_PHAN_IDS = ["xsx", "cd", "kho", "qc", "rd", "qa"] as const;

export const TEMPLATE_CONTRACTS = {
  source_objects: {
    version: CATALOG_TEMPLATE_VERSION,
    fingerprint: "vmp-source-objects-v1",
    sheet: "DU_LIEU",
    headers: SOURCE_OBJECT_TEMPLATE_COLUMNS.map((c) => c.header),
  },
  products_gmp: {
    version: CATALOG_TEMPLATE_VERSION,
    fingerprint: "vmp-products-gmp-v1",
    sheet: "DU_LIEU",
    headers: PRODUCT_GMP_TEMPLATE_COLUMNS.map((c) => c.header),
  },
} as const;

/* Giới hạn phòng thủ — khớp mô tả trong kế hoạch Đợt B Task 8. */
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_DATA_ROWS = 2000;
const MAX_SHEETS = 8;
const MAX_COLUMNS = 64;
const MAX_VISITED_CELLS = 150_000;

/** Dòng cuối cùng còn được nhận dropdown/kiểm hợp lệ trong file mẫu. */
const DONG_CUOI_MAU = MAX_DATA_ROWS + 1;

export interface CatalogWorkbookRowError {
  code: "CONG_THUC" | "TRUNG_KHOA" | "THIEU_KHOA" | "THIEU_BAT_BUOC"
    | "LOAI_KHONG_HOP_LE" | "SO_KHONG_HOP_LE" | "GIA_TRI_KHONG_HOP_LE";
  message: string;
  column?: string;
}

export interface ParsedCatalogRow {
  /** Số dòng thật trong Excel (header là dòng 1). */
  rowNumber: number;
  businessKey: string;
  /** Chỉ source_objects: loại quyết định bảng bị ghi. */
  objectKind: string | null;
  /** Giá trị đã chuẩn hoá theo kiểu trường, khoá theo tên cột database. */
  values: CatalogRecord;
  errors: CatalogWorkbookRowError[];
}

export type CatalogWorkbookErrorCode =
  | "FILE_KIND" | "FILE_TOO_LARGE" | "WORKBOOK_UNREADABLE" | "TOO_MANY_SHEETS"
  | "META_MISSING" | "META_MISMATCH" | "SHEET_MISSING" | "HEADER_MISMATCH"
  | "TOO_MANY_ROWS" | "TOO_MANY_COLUMNS" | "TOO_MANY_CELLS";

export interface ParsedCatalogWorkbook {
  ok: boolean;
  errorCode?: CatalogWorkbookErrorCode;
  error?: string;
  dataset?: CatalogTemplateDataset;
  rows: ParsedCatalogRow[];
}

/** Hình dạng tối thiểu của File mà parser cần — File trình duyệt khớp sẵn. */
export interface CatalogWorkbookFile {
  name: string;
  size: number;
  arrayBuffer: () => Promise<ArrayBuffer>;
}

const cotCua = (dataset: CatalogTemplateDataset): readonly CatalogTemplateColumn[] =>
  dataset === "source_objects" ? SOURCE_OBJECT_TEMPLATE_COLUMNS : PRODUCT_GMP_TEMPLATE_COLUMNS;

const truongCua = (dataset: CatalogTemplateDataset): readonly CatalogFieldDefinition[] =>
  layDataset(dataset === "source_objects" ? "objects" : "products").fields;

const khoaCua = (dataset: CatalogTemplateDataset): string =>
  dataset === "source_objects" ? "object_code" : "bfo_code";

/** Chữ cột Excel (1 → A). Chỉ cần tới 64 cột nên hai chữ là đủ. */
function tenCot(n: number): string {
  let s = "";
  let x = n;
  while (x > 0) {
    const du = (x - 1) % 26;
    s = String.fromCharCode(65 + du) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s;
}

/* ------------------------------------------------------------------ *
 *  Sinh mẫu
 * ------------------------------------------------------------------ */

export async function generateCatalogWorkbook(
  dataset: CatalogTemplateDataset,
  rows: readonly CatalogRecord[],
): Promise<ArrayBuffer> {
  const ExcelJS = (await import("exceljs")).default;
  const hopDong = TEMPLATE_CONTRACTS[dataset];
  const cot = cotCua(dataset);
  const truong = truongCua(dataset);
  const kieu = new Map(truong.map((f) => [f.key, f.kind]));

  const wb = new ExcelJS.Workbook();

  /* --- HUONG_DAN --- */
  const hd = wb.addWorksheet("HUONG_DAN");
  hd.getColumn(1).width = 96;
  const dongHuongDan = [
    `Mẫu nhập ${dataset === "source_objects" ? "Đối tượng nguồn" : "Sản phẩm GMP"} — phiên bản ${hopDong.version}`,
    "1. Chỉ nhập ở sheet DU_LIEU, từ dòng 2. Không đổi tên sheet, không đổi/di chuyển tiêu đề cột.",
    "2. Cột (y/n): gõ y hoặc n. Cột số: gõ số. Ô trống nghĩa là không có giá trị.",
    `3. Tối đa ${MAX_DATA_ROWS} dòng dữ liệu mỗi file. Không dùng công thức — ô công thức sẽ bị từ chối.`,
    "4. Khi tải lên, hệ thống đối chiếu từng dòng với dữ liệu hiện tại và hiện bảng xem trước để duyệt trước khi ghi.",
  ];
  for (const [i, chu] of dongHuongDan.entries()) {
    const o = hd.getCell(i + 1, 1);
    o.value = chu;
    if (i === 0) o.font = { bold: true, size: 13 };
  }

  /* --- DANH_MUC (ẩn) — nguồn của các dropdown --- */
  const dm = wb.addWorksheet("DANH_MUC");
  dm.getCell("A1").value = "Loại đối tượng";
  OBJECT_KINDS.forEach((k, i) => { dm.getCell(i + 2, 1).value = k; });
  dm.getCell("B1").value = "Bộ phận";
  BO_PHAN_IDS.forEach((b, i) => { dm.getCell(i + 2, 2).value = b; });
  dm.getCell("C1").value = "y/n";
  dm.getCell("C2").value = "y";
  dm.getCell("C3").value = "n";
  dm.state = "hidden";

  /* --- DU_LIEU --- */
  const dl = wb.addWorksheet(hopDong.sheet, { views: [{ state: "frozen", ySplit: 1 }] });
  cot.forEach((c, i) => {
    const o = dl.getCell(1, i + 1);
    o.value = c.header;
    o.font = { bold: true };
    dl.getColumn(i + 1).width = Math.max(14, Math.min(30, c.header.length + 6));
  });

  for (const r of rows) {
    dl.addRow(cot.map((c) => {
      /* Giá trị luôn được ghi là chuỗi/số thuần — không bao giờ là công
         thức, nên chuỗi bắt đầu bằng = + - @ nằm yên là chữ. */
      const chuan = chuanHoa(kieu.get(c.key) ?? "text", r[c.key]);
      if (chuan === null) return "";
      if (typeof chuan === "boolean") return chuan ? "y" : "n";
      return chuan as string | number;
    }));
  }

  /* Dropdown cho vùng nhập — sai chính tả bộ phận là mọi bảng gộp sai.
     Dùng API theo VÙNG, không gán qua getCell: getCell TẠO cell thật và
     rowCount phồng lên tới dòng cuối của vùng dropdown — parser sẽ tưởng
     file mẫu trống đã kín 2.000 dòng. */
  const themDropdown = (chiSoCot: number, congThuc: string) => {
    const chu = tenCot(chiSoCot);
    /* `dataValidations` có ở runtime nhưng thiếu trong type của ExcelJS 4. */
    (dl as unknown as {
      dataValidations: { add: (range: string, v: Record<string, unknown>) => void };
    }).dataValidations.add(`${chu}2:${chu}${DONG_CUOI_MAU}`, {
      type: "list", allowBlank: true, formulae: [congThuc],
    });
  };
  const viTri = new Map(cot.map((c, i) => [c.key, i + 1]));
  if (dataset === "source_objects") {
    themDropdown(viTri.get("object_kind")!, `DANH_MUC!$A$2:$A$${OBJECT_KINDS.length + 1}`);
    themDropdown(viTri.get("department")!, `DANH_MUC!$B$2:$B$${BO_PHAN_IDS.length + 1}`);
  }
  for (const [key, i] of viTri) {
    if ((kieu.get(key) ?? (key === "object_kind" ? "select" : "text")) === "boolean") {
      themDropdown(i, "DANH_MUC!$C$2:$C$3");
    }
  }

  /* --- _VMP_META (veryHidden) --- */
  const meta = wb.addWorksheet("_VMP_META");
  meta.getCell("A1").value = "dataset";
  meta.getCell("B1").value = dataset;
  meta.getCell("A2").value = "version";
  meta.getCell("B2").value = hopDong.version;
  meta.getCell("A3").value = "fingerprint";
  meta.getCell("B3").value = hopDong.fingerprint;
  meta.state = "veryHidden";

  /* Khoá các sheet không phải chỗ nhập. Mật khẩu không phải bí mật — chỉ
     chặn sửa nhầm; hợp đồng thật nằm ở parser + server. */
  await hd.protect("vmp-mau", {});
  await dm.protect("vmp-mau", {});
  await meta.protect("vmp-mau", {});

  return wb.xlsx.writeBuffer() as Promise<ArrayBuffer>;
}

/* ------------------------------------------------------------------ *
 *  Đọc phòng thủ
 * ------------------------------------------------------------------ */

const tuChoi = (errorCode: CatalogWorkbookErrorCode, error: string): ParsedCatalogWorkbook =>
  ({ ok: false, errorCode, error, rows: [] });

/** Rút chữ từ một ô ExcelJS về giá trị thô (không tính công thức). */
function giaTriTho(v: unknown): { raw: unknown; laCongThuc: boolean } {
  if (v === null || v === undefined) return { raw: "", laCongThuc: false };
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("formula" in o || "sharedFormula" in o) return { raw: "", laCongThuc: true };
    if ("richText" in o && Array.isArray(o.richText)) {
      return { raw: (o.richText as Array<{ text?: string }>).map((t) => t.text ?? "").join(""), laCongThuc: false };
    }
    if ("text" in o) return { raw: String(o.text ?? ""), laCongThuc: false };
    if (v instanceof Date) return { raw: v.toISOString(), laCongThuc: false };
    if ("result" in o) return { raw: "", laCongThuc: true };
  }
  return { raw: v, laCongThuc: false };
}

export async function parseCatalogWorkbook(
  file: CatalogWorkbookFile,
): Promise<ParsedCatalogWorkbook> {
  /* Hai chốt rẻ nhất đứng trước: chưa đọc một byte nào của file. */
  if (!/\.xlsx$/i.test(file.name)) {
    return tuChoi("FILE_KIND", "Chỉ nhận file .xlsx theo mẫu chính thức.");
  }
  if (file.size > MAX_FILE_BYTES) {
    return tuChoi("FILE_TOO_LARGE", "File Excel không được lớn hơn 5 MiB.");
  }

  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(await file.arrayBuffer());
  } catch {
    return tuChoi("WORKBOOK_UNREADABLE", "File không đọc được thành workbook Excel hợp lệ.");
  }

  if (wb.worksheets.length > MAX_SHEETS) {
    return tuChoi("TOO_MANY_SHEETS", `Workbook chỉ được có tối đa ${MAX_SHEETS} sheet.`);
  }

  /* Đếm tổng ô phải duyệt TRƯỚC khi đọc nội dung — trần cứng chống file
     được bơm phồng để treo trình duyệt. */
  let tongO = 0;
  for (const sheet of wb.worksheets) {
    sheet.eachRow({ includeEmpty: true }, (row) => { tongO += row.cellCount; });
    if (tongO > MAX_VISITED_CELLS) {
      return tuChoi("TOO_MANY_CELLS", `Workbook vượt trần ${MAX_VISITED_CELLS.toLocaleString("vi-VN")} ô.`);
    }
  }

  /* Meta: đúng file mẫu, đúng phiên bản. */
  const meta = wb.getWorksheet("_VMP_META");
  if (!meta) {
    return tuChoi("META_MISSING",
      "Không thấy dấu mẫu chính thức (_VMP_META) — hãy tải mẫu từ chính màn này, đừng tự tạo file.");
  }
  const docMeta = (o: string) => String(giaTriTho(meta.getCell(o).value).raw ?? "").trim();
  const dataset = docMeta("B1") as CatalogTemplateDataset;
  const hopDong = TEMPLATE_CONTRACTS[dataset];
  if (!hopDong || docMeta("B2") !== hopDong.version || docMeta("B3") !== hopDong.fingerprint) {
    return tuChoi("META_MISMATCH",
      "File không khớp mẫu/phiên bản hiện hành — tải lại mẫu mới rồi chép dữ liệu sang.");
  }

  const dl = wb.getWorksheet(hopDong.sheet);
  if (!dl) {
    return tuChoi("SHEET_MISSING", `Không thấy sheet dữ liệu "${hopDong.sheet}".`);
  }
  if (dl.columnCount > MAX_COLUMNS) {
    return tuChoi("TOO_MANY_COLUMNS", `Sheet dữ liệu chỉ được có tối đa ${MAX_COLUMNS} cột.`);
  }

  /* Header phải khớp TỪNG CHỮ và TỪNG VỊ TRÍ, không thừa cột. */
  const cot = cotCua(dataset);
  for (let i = 0; i < cot.length; i += 1) {
    const thay = String(giaTriTho(dl.getCell(1, i + 1).value).raw ?? "").trim();
    if (thay !== cot[i].header) {
      return tuChoi("HEADER_MISMATCH",
        `Tiêu đề cột ${tenCot(i + 1)} phải là "${cot[i].header}" (đang là "${thay || "(trống)"}").`);
    }
  }
  const thua = String(giaTriTho(dl.getCell(1, cot.length + 1).value).raw ?? "").trim();
  if (thua !== "") {
    return tuChoi("HEADER_MISMATCH", `Mẫu không có cột thứ ${cot.length + 1} ("${thua}").`);
  }

  if (dl.rowCount - 1 > MAX_DATA_ROWS) {
    return tuChoi("TOO_MANY_ROWS",
      `Mỗi file chỉ nhận tối đa ${MAX_DATA_ROWS.toLocaleString("vi-VN")} dòng dữ liệu.`);
  }

  /* Đọc từng dòng. */
  const truong = truongCua(dataset);
  const dinhNghia = new Map(truong.map((f) => [f.key, f]));
  const khoa = khoaCua(dataset);
  const daThay = new Set<string>();
  const rows: ParsedCatalogRow[] = [];

  for (let soDong = 2; soDong <= dl.rowCount; soDong += 1) {
    const errors: CatalogWorkbookRowError[] = [];
    const values: CatalogRecord = {};
    let objectKind: string | null = null;
    let coNoiDung = false;

    for (let i = 0; i < cot.length; i += 1) {
      const { raw, laCongThuc } = giaTriTho(dl.getCell(soDong, i + 1).value);
      const chu = String(raw ?? "").trim();
      if (chu !== "") coNoiDung = true;

      if (laCongThuc) {
        coNoiDung = true;
        errors.push({
          code: "CONG_THUC", column: cot[i].header,
          message: `Ô ${tenCot(i + 1)}${soDong} chứa công thức — mẫu chỉ nhận giá trị thuần.`,
        });
        continue;
      }

      if (cot[i].key === "object_kind") {
        objectKind = chu || null;
        continue;
      }
      const dn = dinhNghia.get(cot[i].key);
      const chuan = chuanHoa(dn?.kind ?? "text", raw);
      if (chuan === null && chu !== "") {
        errors.push(dn?.kind === "number"
          ? { code: "SO_KHONG_HOP_LE", column: cot[i].header,
              message: `"${chu}" ở cột ${cot[i].header} không phải là số.` }
          : { code: "GIA_TRI_KHONG_HOP_LE", column: cot[i].header,
              message: `"${chu}" ở cột ${cot[i].header} không hợp lệ (nhận y hoặc n).` });
        continue;
      }
      values[cot[i].key] = chuan;
    }

    if (!coNoiDung) continue;   // dòng trống thật sự — bỏ qua, không phải lỗi

    if (dataset === "source_objects"
        && !(OBJECT_KINDS as readonly string[]).includes(objectKind ?? "")) {
      errors.push({
        code: "LOAI_KHONG_HOP_LE", column: "Loại đối tượng",
        message: `Loại đối tượng "${objectKind ?? "(trống)"}" không thuộc: ${OBJECT_KINDS.join(", ")}.`,
      });
    }

    const businessKey = String(values[khoa] ?? "").trim();
    if (!businessKey) {
      errors.push({ code: "THIEU_KHOA", message: "Thiếu mã khoá của dòng — không có mã thì không đối chiếu được." });
    } else if (daThay.has(businessKey)) {
      errors.push({ code: "TRUNG_KHOA", message: `Mã "${businessKey}" đã xuất hiện ở dòng trước trong chính file này.` });
    } else {
      daThay.add(businessKey);
    }

    const thieu = truong
      .filter((f) => f.required && f.key !== khoa && (values[f.key] ?? null) === null)
      .map((f) => f.label);
    if (thieu.length) {
      errors.push({ code: "THIEU_BAT_BUOC", message: `Thiếu trường bắt buộc: ${thieu.join(", ")}.` });
    }

    rows.push({ rowNumber: soDong, businessKey, objectKind, values, errors });
  }

  return { ok: true, dataset, rows };
}
