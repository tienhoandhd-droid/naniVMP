/* Đợt B rà soát 10/11/2026 — B5: năm/ngày "hôm nay" ở trình duyệt theo giờ VN
 * và không bị đóng băng. Kiểm hợp đồng mã nguồn vì hai chỗ này nằm trong hook
 * React gọi Supabase, không chạy được bằng node --test. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("B5: hooks/index.ts lấy năm kế hoạch theo lịch Bangkok (vmpToday), không theo giờ máy", async () => {
  const src = await read("src/hooks/index.ts");
  assert.doesNotMatch(src, /new Date\(\)\.getFullYear\(\)/,
    "còn chỗ lấy năm theo giờ máy người dùng");
  assert.match(src, /vmpToday\(\)\.getFullYear\(\)/);
});

test("B5: useChangeSummary tính lại 'today' mỗi lần render, không đóng băng trong useMemo", async () => {
  const src = await read("src/features/changeValidation/useChangeSummary.ts");
  const memo = src.match(/useMemo<ChangeSummaryState>\(\(\) => \{([\s\S]*?)\}, \[([^\]]*)\]\)/);
  assert.ok(memo, "không tìm thấy useMemo của useChangeSummary");
  assert.doesNotMatch(memo[1], /new Date\(\)/, "today còn tính bên trong useMemo");
  assert.match(memo[2], /\btoday\b/, "useMemo phải phụ thuộc today để qua ngày thì tính lại");
});
