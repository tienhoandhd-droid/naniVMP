/* =====================================================================
 *  lib/urlState.ts — Trạng thái màn hình nằm trong URL
 *  ---------------------------------------------------------------------
 *  Trước đây mọi thứ (đang xem trang nào, lọc bộ phận nào, khoảng thời gian
 *  nào) chỉ sống trong state React. Hệ quả: không ai gửi được cho đồng
 *  nghiệp cái mình đang nhìn — phải mô tả bằng lời "vào Cảnh báo, chọn bộ
 *  phận XSX, chọn quá hạn". Và nút Back của trình duyệt không làm gì cả.
 *
 *  Dùng HASH (#) chứ không phải query (?) vì web deploy trên host tĩnh
 *  (GitHub Pages): đường dẫn lạ sẽ ra 404, còn hash thì trình duyệt không
 *  gửi lên server nên luôn an toàn.
 *
 *  Khuôn: #v=alerts&dept=xsx,qa&area=A1&period=over&from=2026-01-01&to=2026-03-31&me=1
 *  Khoá nào mang giá trị mặc định thì KHÔNG ghi ra, để URL sạch và để phân
 *  biệt được "người dùng chưa từng chọn" với "người dùng chọn rồi bỏ".
 * ===================================================================== */

/** Trạng thái đưa lên URL. Cố tình để phẳng — thêm khoá mới thì thêm một
 *  dòng ở đây và một dòng trong doc/ghi, không phải sửa chỗ thứ ba. */
export interface UrlState {
  view: string;
  deptSel: string[];
  areaSel: string[];
  period: string;
  customFrom: string;
  customTo: string;
  /** Bật bộ lọc "Việc của tôi". */
  onlyMine: boolean;
}

export const MAC_DINH: UrlState = {
  view: "overview",
  deptSel: [],
  areaSel: [],
  period: "all",
  customFrom: "",
  customTo: "",
  onlyMine: false,
};

/** Danh sách giá trị: bỏ rỗng, bỏ trùng, giữ nguyên thứ tự người dùng chọn. */
function tachDs(raw: string): string[] {
  return [...new Set(raw.split(",").map((s) => s.trim()).filter(Boolean))];
}

/** Ngày dạng yyyy-mm-dd. Không nhận chuỗi lạ để URL bịa không làm hỏng bộ lọc. */
function ngayHopLe(raw: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "";
}

/**
 * Đọc hash thành trạng thái. Không bao giờ ném lỗi: URL là thứ người dùng
 * gõ tay và dán qua chat được, hỏng một khoá thì các khoá còn lại vẫn phải
 * chạy — rơi về mặc định còn hơn màn hình trắng.
 */
export function docUrl(hash: string, hopLe?: {
  views?: readonly string[];
  depts?: readonly string[];
  periods?: readonly string[];
}): UrlState {
  const s: UrlState = { ...MAC_DINH, deptSel: [], areaSel: [] };
  let raw = String(hash || "");
  if (raw.startsWith("#")) raw = raw.slice(1);
  if (!raw) return s;

  let p: URLSearchParams;
  try { p = new URLSearchParams(raw); } catch { return s; }

  const lay = (k: string): string => {
    try { return decodeURIComponent(p.get(k) || ""); } catch { return p.get(k) || ""; }
  };

  const v = lay("v");
  if (v && (!hopLe?.views || hopLe.views.includes(v))) s.view = v;

  const dept = tachDs(lay("dept"));
  s.deptSel = hopLe?.depts ? dept.filter((d) => hopLe.depts!.includes(d)) : dept;

  // Khu vực là dữ liệu động (sinh từ chính hạng mục đang có) nên không kiểm
  // ở đây; App tự bỏ khu vực không còn thuộc bộ phận đã chọn.
  s.areaSel = tachDs(lay("area"));

  const period = lay("period");
  if (period && (!hopLe?.periods || hopLe.periods.includes(period))) s.period = period;

  s.customFrom = ngayHopLe(lay("from"));
  s.customTo = ngayHopLe(lay("to"));
  s.onlyMine = lay("me") === "1";

  // "custom" mà không có mốc nào thì vô nghĩa — trả về "all" để bảng không
  // trống trơn một cách khó hiểu.
  if (s.period === "custom" && !s.customFrom && !s.customTo) s.period = MAC_DINH.period;

  return s;
}

/** Trạng thái → hash. Chỉ ghi khoá khác mặc định. Trả "" khi mọi thứ mặc định. */
export function vietUrl(s: UrlState): string {
  const p = new URLSearchParams();
  if (s.view && s.view !== MAC_DINH.view) p.set("v", s.view);
  if (s.deptSel.length) p.set("dept", s.deptSel.join(","));
  if (s.areaSel.length) p.set("area", s.areaSel.join(","));
  if (s.period && s.period !== MAC_DINH.period) p.set("period", s.period);
  if (s.period === "custom") {
    if (s.customFrom) p.set("from", s.customFrom);
    if (s.customTo) p.set("to", s.customTo);
  }
  if (s.onlyMine) p.set("me", "1");
  // URLSearchParams mã hoá dấu phẩy thành %2C — dài và khó đọc khi dán vào
  // chat. Dấu phẩy an toàn trong fragment nên trả lại nguyên hình.
  return p.toString().replace(/%2C/g, ",");
}

/** Hai trạng thái có như nhau không — để khỏi ghi lại URL y hệt (đẩy rác vào
 *  lịch sử trình duyệt, khiến bấm Back mấy lần mới thoát được một màn). */
export function giongNhau(a: UrlState, b: UrlState): boolean {
  return vietUrl(a) === vietUrl(b);
}
