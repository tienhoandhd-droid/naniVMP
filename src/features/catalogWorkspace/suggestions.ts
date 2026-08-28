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

export type CatalogSuggestionPage =
  | { ok: true; rows: Array<{ value: string; count: number }>; nextCursor: { value: string } | null }
  | { ok: false; errorCode: "FORBIDDEN" | "INVALID_FIELD" | "INVALID_LIMIT" | "INVALID_CURSOR"; error: string };

function suggestionRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || Array.isArray(value) || typeof value !== "object") throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function suggestionExactKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} must contain exact keys`);
  }
}

function suggestionString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be nonblank`);
  return value.trim();
}

export function decodeCatalogSuggestionPage(value: unknown): CatalogSuggestionPage {
  const raw = suggestionRecord(value, "Source suggestion response");
  if (raw.ok === false) {
    suggestionExactKeys(raw, ["ok", "error_code", "error"], "Source suggestion error response");
    const errorCode = suggestionString(raw.error_code, "Source suggestion error_code");
    if (errorCode !== "FORBIDDEN" && errorCode !== "INVALID_FIELD"
        && errorCode !== "INVALID_LIMIT" && errorCode !== "INVALID_CURSOR") {
      throw new Error("Source suggestion error_code is invalid");
    }
    return { ok: false, errorCode, error: suggestionString(raw.error, "Source suggestion error") };
  }
  if (raw.ok !== true) throw new Error("Source suggestion response.ok must be boolean");
  suggestionExactKeys(raw, ["ok", "rows", "next_cursor"], "Source suggestion response");
  if (!Array.isArray(raw.rows)) throw new Error("Source suggestion rows must be an array");
  const rows = raw.rows.map((entry, index) => {
    const row = suggestionRecord(entry, `Source suggestion rows[${index}]`);
    suggestionExactKeys(row, ["value", "count"], `Source suggestion rows[${index}]`);
    if (!Number.isSafeInteger(row.count) || (row.count as number) < 0) {
      throw new Error(`Source suggestion rows[${index}].count must be non-negative integer`);
    }
    return { value: suggestionString(row.value, `Source suggestion rows[${index}].value`), count: row.count as number };
  });
  let nextCursor: { value: string } | null = null;
  if (raw.next_cursor !== null) {
    const cursor = suggestionRecord(raw.next_cursor, "Source suggestion next_cursor");
    suggestionExactKeys(cursor, ["value"], "Source suggestion next_cursor");
    nextCursor = { value: suggestionString(cursor.value, "Source suggestion next_cursor.value") };
  }
  return { ok: true, rows, nextCursor };
}

export async function collectCatalogSuggestionPages(
  fetchPage: (cursor: { value: string } | null) => Promise<CatalogSuggestionPage>,
): Promise<string[]> {
  const values: string[] = [];
  const seen = new Set<string>();
  let cursor: { value: string } | null = null;
  for (let page = 0; page < 10_000; page += 1) {
    const result = await fetchPage(cursor);
    if (!result.ok) throw new Error(`Source suggestion ${result.errorCode}: ${result.error}`);
    values.push(...result.rows.map((row) => row.value));
    if (!result.nextCursor) return values;
    if (seen.has(result.nextCursor.value)) throw new Error("Source suggestion cursor repeated");
    seen.add(result.nextCursor.value);
    cursor = result.nextCursor;
  }
  throw new Error("Source suggestion exceeded safe page limit");
}

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
