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

import { fetchSourceObjects } from "../../lib/supabaseData.ts";
import { listDataset } from "./api.ts";
import { gomGoiY } from "./suggestions.ts";
import type { GoiY } from "./suggestions.ts";

const KHOA_DOI_TUONG = ["department", "area_code", "line", "work_group"] as const;
const KHOA_SAN_PHAM = [
  "dosage_form", "production_line", "primary_pack", "mixing_tank", "batch_size", "strength",
] as const;

/** Đủ phủ toàn bộ danh mục sản phẩm hiện tại; nhiều hơn thì phần thừa chỉ
 *  làm chậm màn mà không thêm gợi ý nào. */
const SO_DONG_GOI_Y = 500;

export function useCatalogSuggestions(): GoiY {
  const [goiY, setGoiY] = useState<GoiY>({});

  useEffect(() => {
    let con = true;
    (async () => {
      const kq: GoiY = {};
      try {
        const rows = await fetchSourceObjects({ kind: null, includeInactive: true });
        Object.assign(kq, gomGoiY(rows as unknown as Array<Record<string, unknown>>, [...KHOA_DOI_TUONG]));
      } catch { /* Gợi ý hỏng không được chặn nhập liệu — ô vẫn gõ tay được. */ }
      try {
        const sp = await listDataset({ dataset: "products", query: "", page: 0, pageSize: SO_DONG_GOI_Y });
        if (sp.ok) Object.assign(kq, gomGoiY(sp.rows.map((r) => r.data), [...KHOA_SAN_PHAM]));
      } catch { /* như trên */ }
      if (con) setGoiY(kq);
    })();
    return () => { con = false; };
  }, []);

  return goiY;
}
