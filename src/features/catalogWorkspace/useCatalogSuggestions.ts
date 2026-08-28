/* =====================================================================
 *  useCatalogSuggestions — nạp gợi ý một lần cho cả workspace
 *  ---------------------------------------------------------------------
 *  Nạp ở đây chứ không nạp trong hộp thoại: mở form ra rồi mới gọi mạng
 *  thì danh sách gợi ý xuất hiện muộn hơn con trỏ, và người dùng đã gõ
 *  xong nửa chữ. Một lượt lúc vào màn là đủ.
 *
 *  Đối tượng nguồn phải đọc CẢ loại và CẢ bản đã ngừng dùng: gợi ý là để
 *  tái dùng đúng chữ cũ, mà chữ cũ nằm nhiều nhất ở dữ liệu cũ.
 *
 *  Sản phẩm GMP đọc qua `listDataset` với trang lớn, KHÔNG dùng `svRows`
 *  của màn: cái đó phân trang và lọc theo ô tìm kiếm, nên gợi ý sẽ đổi
 *  theo từ khoá đang gõ — thứ không ai hiểu nổi khi đang nhập liệu.
 * ===================================================================== */
import { useEffect, useState } from "react";

import { listAllSourceFieldSuggestions, listDataset } from "./api.ts";
import { gomGoiY } from "./suggestions.ts";
import type { GoiY } from "./suggestions.ts";

const KHOA_DOI_TUONG = ["department", "area_code", "line", "work_group"] as const;
const KHOA_SAN_PHAM = [
  "dosage_form", "production_line", "primary_pack", "mixing_tank", "batch_size", "strength",
] as const;

/** Đủ phủ toàn bộ danh mục sản phẩm hiện tại; nhiều hơn thì phần thừa chỉ
 *  làm chậm màn mà không thêm gợi ý nào. */
const SO_DONG_GOI_Y = 500;

export function useCatalogSuggestions(enabled: boolean): {
  goiY: GoiY;
  error: string | null;
  retry: () => void;
} {
  const [goiY, setGoiY] = useState<GoiY>({});
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setGoiY({});
      setError(null);
      return undefined;
    }
    setError(null);
    let con = true;
    (async () => {
      const kq: GoiY = {};
      try {
        const values = await Promise.all(KHOA_DOI_TUONG.map(async (field) => [
          field,
          await listAllSourceFieldSuggestions({ field }),
        ] as const));
        values.forEach(([field, suggestions]) => { kq[field] = suggestions; });
      } catch (cause) {
        if (con) setError(`Không tải được gợi ý Source: ${cause instanceof Error ? cause.message : String(cause)}`);
      }
      try {
        const sp = await listDataset({ dataset: "products", query: "", page: 0, pageSize: SO_DONG_GOI_Y });
        if (!sp.ok) throw new Error(sp.error || "Không đọc được gợi ý sản phẩm");
        Object.assign(kq, gomGoiY(sp.rows.map((r) => r.data), [...KHOA_SAN_PHAM]));
      } catch (cause) {
        if (con) setError((previous) => previous
          ?? `Không tải được gợi ý sản phẩm: ${cause instanceof Error ? cause.message : String(cause)}`);
      }
      if (con) setGoiY(kq);
    })();
    return () => { con = false; };
  }, [enabled, tick]);

  return { goiY, error, retry: () => setTick((value) => value + 1) };
}
