/* =====================================================================
 *  auditDiffModel.ts — dựng bảng THAY ĐỔI old→new cho một dòng audit
 *  (Bàn quản trị 01/09)
 *  ---------------------------------------------------------------------
 *  Vận hành GMP: câu thanh tra hỏi là "ai đổi CÁI GÌ, từ GIÁ TRỊ NÀO sang
 *  GIÁ TRỊ NÀO". Bảng audit đã lưu old_data/new_data/changed_fields nhưng
 *  UI cũ chỉ hiện JSON new_data thô — người đọc phải tự so hai cục JSON.
 *
 *  Luật: đi theo changed_fields nếu có (nguồn sự thật do trigger ghi);
 *  không có thì tự so key hai phía. Giá trị object/array in JSON gọn.
 *  Không React — node --test chạy thẳng.
 * ===================================================================== */

export interface DongDiff {
  field: string;
  cu: string | null;
  moi: string | null;
}

function inGiaTri(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export function dungBangDiff(
  oldData: unknown,
  newData: unknown,
  changedFields: unknown,
): DongDiff[] {
  const cu = (oldData && typeof oldData === "object" ? oldData : {}) as Record<string, unknown>;
  const moi = (newData && typeof newData === "object" ? newData : {}) as Record<string, unknown>;

  let fields: string[];
  if (Array.isArray(changedFields) && changedFields.length > 0) {
    fields = changedFields.map(String);
  } else {
    const tatCa = new Set([...Object.keys(cu), ...Object.keys(moi)]);
    fields = [...tatCa].filter((k) => inGiaTri(cu[k]) !== inGiaTri(moi[k]));
  }
  return fields
    .map((field) => ({ field, cu: inGiaTri(cu[field]), moi: inGiaTri(moi[field]) }))
    /* Trường có tên trong changed_fields nhưng hai vế in ra giống nhau
       (vd cast kiểu) vẫn GIỮ — trigger nói nó đổi thì mình không giấu. */
    .sort((a, b) => a.field.localeCompare(b.field));
}
