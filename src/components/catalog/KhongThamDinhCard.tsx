/* =====================================================================
 *  components/catalog/KhongThamDinhCard.tsx — Danh mục đối tượng KHÔNG thẩm định
 *  ---------------------------------------------------------------------
 *  Trang tiến độ nay mặc định ẩn nhóm này (chúng không sinh hạng mục nào
 *  nên chỉ làm loãng danh sách). Nhưng ẩn mà không có chỗ tra thì thành
 *  giấu: thanh tra GMP hỏi "sao cái máy này không thẩm định?" mà không mở
 *  ra được câu trả lời là hỏng. Đây là chỗ tra đó.
 *
 *  Đọc THẲNG vmp_source_objects chứ không dùng `objects` của dashboard RPC,
 *  vì RPC không trả hai cột quan trọng nhất của màn này: `status` (còn chạy
 *  hay đã ngưng) và `validate_reason` (cột "Lý do thẩm định" của Sheet).
 *
 *  Cảnh báo "cần rà soát": dòng CÒN HOẠT ĐỘNG mà chính phần lý do lại viết
 *  "cần/nên … thẩm định". Đó là mâu thuẫn trong dữ liệu gốc — người viết mô
 *  tả đã kết luận là phải thẩm định, nhưng cột Thẩm định vẫn để 'n'. Không
 *  tự sửa hộ: chỉ nêu ra để QA quyết.
 * ===================================================================== */
import { useEffect, useMemo, useState } from "react";
import { ShieldOff, Search, Download, ExternalLink, AlertTriangle } from "lucide-react";

import { C, TEXT, NUM, INP } from "../../constants/theme.ts";
import { Card, Tag, TableScroll } from "../ui/Primitives.tsx";
import { txt, download } from "../../utils/helpers.ts";
import { fetchSourceObjects } from "../../lib/supabaseData.ts";
import { useDebounce } from "../../hooks/index.ts";
import type { SourceObjectRow } from "../../types/domain.ts";

/** Đang ngưng hoạt động thì không thẩm định là hợp lý — tách riêng để hai
 *  nhóm này không bị đọc lẫn với nhau. */
function daNgung(r: SourceObjectRow): boolean {
  return /ngưng|dừng|thanh lý|hỏng|loại bỏ/i.test(String(r.status || ""));
}

/** Lý do lại tự nói rằng phải thẩm định. */
const DOI_THAM_DINH = /(cần|nên|phải)[^.]{0,60}thẩm định/i;

function canRaSoat(r: SourceObjectRow): boolean {
  return !daNgung(r) && DOI_THAM_DINH.test(String(r.validate_reason || ""));
}

const th: React.CSSProperties = {
  textAlign: "left", fontSize: 11, color: C.plumSoft, fontWeight: 800,
  padding: "0 11px 9px", whiteSpace: "nowrap",
};
const td: React.CSSProperties = {
  padding: "9px 11px", fontSize: 12.5, color: C.plum, fontWeight: 600,
  borderTop: `1px solid ${C.line}`, verticalAlign: "top",
};

export default function KhongThamDinhCard({ onMoDanhMuc }: {
  /** Nhảy sang Danh mục & Nhập liệu để sửa chính dòng nguồn này. */
  onMoDanhMuc?: (code: string, nhom?: string) => void;
}) {
  const [rows, setRows] = useState<SourceObjectRow[] | null>(null);
  const [loi, setLoi] = useState("");
  const [mo, setMo] = useState(false);
  const [q, setQ] = useState("");
  const kw = useDebounce(q.trim().toLowerCase(), 250);
  const [nhom, setNhom] = useState("all");
  const [tt, setTt] = useState<"all" | "chay" | "ngung" | "soat">("all");

  // Chỉ tải khi người dùng mở thẻ ra — trang tiến độ đã nặng sẵn, không nên
  // cõng thêm một lượt đọc bảng mà đa số phiên không ai xem tới.
  useEffect(() => {
    if (!mo || rows) return;
    let huy = false;
    fetchSourceObjects()
      .then((ds) => { if (!huy) setRows(ds.filter((r) => r.validate_flag !== "y")); })
      .catch((e) => { if (!huy) setLoi((e as Error).message || "không rõ"); });
    return () => { huy = true; };
  }, [mo, rows]);

  const nhoms = useMemo(
    () => [...new Set((rows || []).map((r) => String(r.object_kind || "—")))].sort(),
    [rows]);

  const dem = useMemo(() => {
    const ds = rows || [];
    return {
      tong: ds.length,
      ngung: ds.filter(daNgung).length,
      chay: ds.filter((r) => !daNgung(r)).length,
      soat: ds.filter(canRaSoat).length,
    };
  }, [rows]);

  const hien = useMemo(() => {
    let ds = rows || [];
    if (nhom !== "all") ds = ds.filter((r) => String(r.object_kind || "—") === nhom);
    if (tt === "chay") ds = ds.filter((r) => !daNgung(r));
    else if (tt === "ngung") ds = ds.filter(daNgung);
    else if (tt === "soat") ds = ds.filter(canRaSoat);
    if (kw) {
      ds = ds.filter((r) => [r.object_code, r.object_name, r.department, r.area_code, r.validate_reason]
        .some((x) => String(x || "").toLowerCase().includes(kw)));
    }
    // Cần rà soát lên đầu — đó là phần duy nhất đòi hành động.
    return [...ds].sort((a, b) =>
      Number(canRaSoat(b)) - Number(canRaSoat(a))
      || String(a.object_code).localeCompare(String(b.object_code), "vi", { numeric: true }));
  }, [rows, nhom, tt, kw]);

  const xuatCsv = () => {
    const cot = ["Mã", "Tên", "Nhóm", "Bộ phận", "Khu vực", "Tình trạng",
      "Lý do thẩm định", "Cần rà soát"];
    const o = (v: unknown) => {
      const s = String(v ?? "");
      return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const dong = hien.map((r) => [r.object_code, r.object_name, r.object_kind,
      r.department, r.area_code, r.status, r.validate_reason,
      canRaSoat(r) ? "x" : ""].map(o).join(";"));
    // BOM + dấu ; để Excel bản tiếng Việt mở đúng cột.
    download("VMP_doi-tuong-khong-tham-dinh.csv",
      "﻿" + [cot.map(o).join(";"), ...dong].join("\r\n"));
  };

  const chip = (id: typeof tt, nhan: string, n: number, mau: string, nen: string) => (
    <button type="button" onClick={() => setTt(id)}
      style={{
        fontFamily: TEXT, fontSize: 12, fontWeight: 800, cursor: "pointer",
        border: tt === id ? `2px solid ${mau}` : `1.5px solid ${C.pinkSoft}`,
        background: tt === id ? nen : C.surface, color: tt === id ? mau : C.plumSoft,
        borderRadius: 999, padding: "6px 13px",
      }}>
      {nhan} ({n})
    </button>
  );

  return (
    <Card>
      <button type="button" onClick={() => setMo((v) => !v)}
        style={{ width: "100%", textAlign: "left", border: "none", background: "transparent",
          cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 40, height: 40, borderRadius: 13, background: C.pinkMist, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <ShieldOff size={20} color={C.plumSoft} />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontFamily: TEXT, fontWeight: 900, fontSize: 16, color: C.plum }}>
            Danh mục đối tượng không thẩm định
          </div>
          <div style={{ fontSize: 12, color: C.plumSoft, fontWeight: 600, marginTop: 2 }}>
            Cột &quot;Thẩm định&quot; ở Danh mục nguồn để <b>n</b> · không sinh hạng mục nào nên không có trên danh sách tiến độ ở trên
          </div>
        </div>
        {rows && dem.soat > 0 && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 800, color: C.raspText, background: C.raspSoft, padding: "4px 10px", borderRadius: 999, whiteSpace: "nowrap" }}>
            <AlertTriangle size={13} />{dem.soat} cần rà soát
          </span>
        )}
        <span style={{ fontSize: 12.5, fontWeight: 800, color: C.plumSoft, whiteSpace: "nowrap" }}>
          {mo ? "Thu gọn" : "Mở ra"}
        </span>
      </button>

      {mo && (
        <div style={{ marginTop: 14 }}>
          {loi && <Tag color={C.raspText} bg={C.raspSoft}>Lỗi đọc danh mục: {loi}</Tag>}
          {!rows && !loi && <div style={{ fontSize: 12.5, color: C.plumSoft, fontWeight: 700 }}>Đang tải…</div>}

          {rows && (
            <>
              <div style={{ display: "flex", gap: 9, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
                {chip("all", "Tất cả", dem.tong, C.plum, C.pinkSoft)}
                {chip("chay", "Còn hoạt động", dem.chay, C.skyText, C.skySoft)}
                {chip("ngung", "Đã ngưng", dem.ngung, C.plumSoft, C.pinkMist)}
                {chip("soat", "⚠ Cần rà soát", dem.soat, C.raspText, C.raspSoft)}
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
                <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
                  <Search size={15} color={C.plumSoft} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)" }} />
                  <input value={q} onChange={(e) => setQ(e.target.value)}
                    placeholder="Tìm mã, tên, bộ phận, lý do…" style={{ ...INP, paddingLeft: 34 }} />
                </div>
                <select value={nhom} onChange={(e) => setNhom(e.target.value)} style={{ ...INP, cursor: "pointer", maxWidth: 190 }}>
                  <option value="all">Tất cả nhóm</option>
                  {nhoms.map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
                <button type="button" onClick={xuatCsv} disabled={!hien.length}
                  style={{ display: "inline-flex", alignItems: "center", gap: 7, fontFamily: TEXT,
                    fontSize: 12.5, fontWeight: 800, color: C.mintText, background: C.mintSoft,
                    border: "none", borderRadius: 999, padding: "9px 15px",
                    cursor: hien.length ? "pointer" : "not-allowed", opacity: hien.length ? 1 : 0.5 }}>
                  <Download size={14} /> Xuất CSV ({hien.length})
                </button>
              </div>

              <TableScroll maxHeight="56vh">
                <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: TEXT, minWidth: 900 }}>
                  <thead>
                    <tr>
                      <th style={th}>Mã</th>
                      <th style={th}>Tên</th>
                      <th style={th}>Nhóm</th>
                      <th style={th}>Bộ phận</th>
                      <th style={th}>Khu vực</th>
                      <th style={th}>Tình trạng</th>
                      <th style={{ ...th, whiteSpace: "normal", minWidth: 300 }}>Lý do thẩm định</th>
                      {onMoDanhMuc && <th style={th} />}
                    </tr>
                  </thead>
                  <tbody>
                    {hien.map((r) => {
                      const soat = canRaSoat(r);
                      return (
                        <tr key={r.object_code} style={soat ? { background: C.raspSoft } : undefined}>
                          <td style={{ ...td, fontFamily: NUM, fontWeight: 900, whiteSpace: "nowrap" }}>{r.object_code}</td>
                          <td style={td}>{txt(r.object_name)}</td>
                          <td style={td}>{txt(r.object_kind)}</td>
                          <td style={td}>{txt(r.department)}</td>
                          <td style={{ ...td, fontFamily: NUM }}>{txt(r.area_code)}</td>
                          <td style={td}>
                            {daNgung(r)
                              ? <Tag color={C.plumSoft} bg={C.pinkMist}>{txt(r.status)}</Tag>
                              : <Tag color={C.skyText} bg={C.skySoft}>{txt(r.status)}</Tag>}
                          </td>
                          <td style={{ ...td, fontWeight: 600, lineHeight: 1.6 }}>
                            {txt(r.validate_reason)}
                            {soat && (
                              <div style={{ marginTop: 5, fontSize: 11.5, fontWeight: 800, color: C.raspText }}>
                                ⚠ Lý do nói là cần thẩm định nhưng cột Thẩm định đang để &quot;n&quot; — QA cần chốt lại.
                              </div>
                            )}
                          </td>
                          {onMoDanhMuc && (
                            <td style={{ ...td, whiteSpace: "nowrap" }}>
                              <button type="button" onClick={() => onMoDanhMuc(String(r.object_code), String(r.object_kind || ""))}
                                style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: TEXT,
                                  fontSize: 11.5, fontWeight: 800, color: C.lavText, background: C.lavSoft,
                                  border: "none", borderRadius: 999, padding: "6px 11px", cursor: "pointer" }}>
                                <ExternalLink size={12} /> Sửa
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                    {!hien.length && (
                      <tr><td style={{ ...td, textAlign: "center", color: C.plumSoft, padding: 24 }} colSpan={8}>
                        Không có đối tượng nào khớp bộ lọc.
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </TableScroll>

              <div style={{ marginTop: 11, fontSize: 11.5, color: C.plumSoft, fontWeight: 600, lineHeight: 1.65 }}>
                Danh mục này chỉ ĐỌC. Muốn đưa một đối tượng vào kế hoạch thẩm định thì sang
                <b style={{ color: C.plum }}> Danh mục &amp; Nhập liệu</b>, đổi cột <b style={{ color: C.plum }}>Thẩm định</b> sang
                &quot;y&quot;, điền <b style={{ color: C.plum }}>tháng thẩm định đầu tiên</b> rồi bấm <b style={{ color: C.plum }}>Sinh timeline</b>.
              </div>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
