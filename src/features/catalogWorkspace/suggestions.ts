/* =====================================================================
 *  suggestions.ts — gom giá trị đã có thành danh sách gợi ý
 *  ---------------------------------------------------------------------
 *  Ô gõ tự do là nguồn gốc của "Line 1", "Line1" và "line 1" cùng tồn tại
 *  trong một bảng: lọc theo dây chuyền ra ba nhóm cho một dây chuyền thật.
 *  Gợi ý lấy từ chính dữ liệu đang có nên không ai phải bịa danh mục, mà
 *  lần nhập sau vẫn tái dùng đúng chữ của lần trước.
 *
 *  Chỉ chuẩn hoá KHOẢNG TRẮNG, không chuẩn hoá hoa thường. Trong hồ sơ
 *  GMP hai mã khác nhau ở chữ hoa có thể là hai mã thật — máy tự gộp là
 *  máy sửa dữ liệu đã ban hành mà không ai duyệt.
 * ===================================================================== */
export type GoiY = Record<string, string[]>;

export function gomGoiY(
  rows: ReadonlyArray<Record<string, unknown>>,
  keys: readonly string[],
): GoiY {
  const kq: GoiY = {};
  for (const key of keys) {
    const tap = new Set<string>();
    for (const r of rows) {
      const v = r?.[key];
      if (v === null || v === undefined) continue;
      const s = String(v).trim();
      if (s) tap.add(s);
    }
    // caseFirst: "upper" — mặc định ICU xếp chữ thường trước chữ hoa
    // ("kv-a" trước "KV-A"), ngược trực giác khi đọc gợi ý trên form.
    kq[key] = [...tap].sort((a, b) => a.localeCompare(b, "vi", { caseFirst: "upper" }));
  }
  return kq;
}
