/* =====================================================================
 *  diff.ts — so hai bản ghi, và dựng patch chỉ gồm thứ thật sự đổi
 *  ---------------------------------------------------------------------
 *  Logic thuần, không React. Đây là chỗ dễ sai nhất của mọi form sửa dữ
 *  liệu, vì ba lý do:
 *
 *  1. Ô nhập HTML luôn trả CHUỖI. Người dùng không sửa gì, nhưng số 5 đi
 *     qua ô nhập thành "5", và so sánh `5 !== "5"` cho ra "đã đổi". Kết
 *     quả: patch gửi lên server những trường không ai động tới, audit đầy
 *     thay đổi giả, và khoá lạc quan xung đột vô cớ.
 *
 *  2. Ô trống trả `""`, còn database lưu `null`. Hai thứ đó cùng nghĩa
 *     "không có giá trị" nhưng khác nhau khi so bằng `!==`.
 *
 *  3. Gửi cả trường không sửa được (khoá nghiệp vụ, cột hệ thống) sẽ bị
 *     server từ chối vì whitelist — nhưng lỗi hiện ra là "trường không
 *     được phép sửa", nghe như người dùng làm sai.
 * ===================================================================== */
import type { CatalogDiffEntry, CatalogFieldDefinition, CatalogRecord } from "./contracts.ts";

/** Đưa giá trị về dạng chuẩn theo kiểu trường, để so sánh công bằng. */
export function chuanHoa(kind: CatalogFieldDefinition["kind"], v: unknown): unknown {
  // Rỗng dưới mọi hình thức đều là "không có giá trị".
  if (v === null || v === undefined) return null;
  if (typeof v === "string" && v.trim() === "") return null;

  switch (kind) {
    case "number": {
      const n = typeof v === "number" ? v : Number(String(v).trim());
      return Number.isFinite(n) ? n : null;
    }
    case "boolean": {
      if (typeof v === "boolean") return v;
      const s = String(v).trim().toLowerCase();
      if (s === "true" || s === "1" || s === "y" || s === "có") return true;
      if (s === "false" || s === "0" || s === "n" || s === "không") return false;
      return null;
    }
    case "date": {
      // Chỉ giữ phần ngày: giờ phút đến từ đâu cũng không phải thứ người
      // dùng nhập ở ô ngày, và so cả giờ thì ngày nào cũng "đã đổi".
      const s = String(v).trim();
      return s ? s.slice(0, 10) : null;
    }
    default:
      return String(v).trim();
  }
}

/** Hai giá trị có thật sự khác nhau không, sau khi đã chuẩn hoá. */
function khacNhau(kind: CatalogFieldDefinition["kind"], a: unknown, b: unknown): boolean {
  const x = chuanHoa(kind, a);
  const y = chuanHoa(kind, b);
  if (x === null && y === null) return false;
  return x !== y;
}

/**
 * Bảng đối chiếu ĐẦY ĐỦ — mọi trường, kể cả trường không đổi.
 *
 * Giữ cả trường không đổi là có chủ ý: người duyệt cần thấy bối cảnh, chứ
 * không chỉ thấy ba dòng rời rạc. Cờ `changed` để giao diện tô đậm.
 * Thứ tự theo `fields`, không theo thứ tự khoá của object — thứ tự khoá
 * JavaScript phụ thuộc cách dựng object và sẽ đổi ngẫu nhiên.
 */
export function diffCatalogRecord(
  fields: readonly CatalogFieldDefinition[],
  before: CatalogRecord | null | undefined,
  after: CatalogRecord | null | undefined,
): CatalogDiffEntry[] {
  const a = before || {};
  const b = after || {};
  return fields.map((f) => ({
    key: f.key,
    label: f.label,
    before: a[f.key] ?? null,
    after: b[f.key] ?? null,
    changed: khacNhau(f.kind, a[f.key], b[f.key]),
  }));
}

/**
 * Patch gửi lên server: CHỈ trường ghi được và thật sự đổi.
 *
 * Trả object rỗng khi không có gì đổi — nơi gọi dựa vào đó để không gửi
 * một lệnh ghi vô nghĩa, thứ vẫn tăng version và vẫn sinh một dòng audit
 * trống.
 */
export function buildCatalogPatch(
  fields: readonly CatalogFieldDefinition[],
  before: CatalogRecord | null | undefined,
  after: CatalogRecord | null | undefined,
): CatalogRecord {
  const a = before || {};
  const b = after || {};
  const patch: CatalogRecord = {};
  for (const f of fields) {
    if (f.readonly) continue;
    if (!khacNhau(f.kind, a[f.key], b[f.key])) continue;
    patch[f.key] = chuanHoa(f.kind, b[f.key]);
  }
  return patch;
}

/** Những trường vừa đổi có trường nào đòi lý do không. */
export function canLyDo(
  fields: readonly CatalogFieldDefinition[],
  patch: CatalogRecord,
): boolean {
  return fields.some((f) => f.reasonRequired && Object.prototype.hasOwnProperty.call(patch, f.key));
}

/** Trường bắt buộc còn để trống — kiểm trước khi gửi, báo tại chỗ. */
export function thieuTruongBatBuoc(
  fields: readonly CatalogFieldDefinition[],
  record: CatalogRecord,
): string[] {
  return fields
    .filter((f) => f.required && chuanHoa(f.kind, record[f.key]) === null)
    .map((f) => f.label);
}
