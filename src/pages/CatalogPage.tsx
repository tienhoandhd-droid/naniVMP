/* =====================================================================
 *  CatalogPage.jsx — Danh mục đối tượng & Tiến độ (gộp Inventory + Update)
 *  ---------------------------------------------------------------------
 *  - Nhóm theo MÃ ĐỐI TƯỢNG, sắp theo mã. Một mã có nhiều loại thẩm định
 *    (OQ/PQ/IQ…) và có thể nhiều lần/năm (tái thẩm định) → gộp về một khối.
 *  - GHI CHƯA kích hoạt: form Cập nhật/Thêm sinh sẵn "payload đúng cột Sheet"
 *    (xem trước) để về sau nối đường ghi ngược Sheet — giữ read-only an toàn.
 * ===================================================================== */
import { useEffect, useMemo, useState } from "react";
import { Boxes, Search, Pencil, ChevronRight, Layers, ExternalLink } from "lucide-react";
import { C, TEXT, NUM, btnPrimary, INP } from "../constants/theme.ts";
import { CLS, DEPTS } from "../constants/vmp.ts";
import { parseD, fmtVN, txt, wlIsDone } from "../utils/helpers.ts";
import { Card, Tag, Pill, PhanTrang } from "../components/ui/Primitives.tsx";
import ProgressEditModal from "../components/dashboard/ProgressEditModal.tsx";
import KhongThamDinhCard from "../components/catalog/KhongThamDinhCard.tsx";
import { useDebounce } from "../hooks/index.ts";
import type { Activity, VmpObject } from "../types/domain.ts";

// (Đã bỏ bảng ánh xạ cột Sheet và danh sách 4 giai đoạn: chúng chỉ phục vụ
// hộp "xem trước dòng Sheet" thời còn ghi ngược Google Sheet. Nay ghi thẳng
// Supabase qua hộp dùng chung ProgressEditModal.)

function yearOf(a: Activity): string {
  const m = String(a.id || "").match(/\/(20\d{2})/);
  if (m) return m[1];
  const d = parseD(a.target);
  return d ? String(d.getFullYear()) : "—";
}

// Chia hạng mục của 1 đối tượng theo THỂ LOẠI THẨM ĐỊNH (OQ/PQ/IQ…); trong mỗi
// loại, một NĂM chỉ nên có 1 lần — nếu trùng năm cùng loại thì đánh dấu cảnh báo.
function groupByType(items: Activity[]) {
  const m = new Map<string, Activity[]>();
  items.forEach((a) => {
    const t = a.vtype || "—";
    if (!m.has(t)) m.set(t, []);
    m.get(t)!.push(a);
  });
  return [...m.entries()]
    .sort((a, b) => String(a[0]).localeCompare(String(b[0]), "vi"))
    .map(([vtype, its]) => {
      const yrs = its.map(yearOf);
      const dupYears = new Set(yrs.filter((y: string, i: number) => yrs.indexOf(y) !== i));
      its.sort((x: Activity, y: Activity) => yearOf(x).localeCompare(yearOf(y)));
      return { vtype, items: its, dupYears };
    });
}

/** Mã nhóm trong dashboard (tb/qt/kho/ht/vc) sang tên nhóm của Danh mục nguồn.
 *  Hai chỗ dùng hai cách gọi khác nhau; không dịch thì bấm sang trang kia sẽ
 *  rơi vào nhóm sai và người dùng tưởng đối tượng không tồn tại. */
const CLS_SANG_NHOM: Record<string, string> = {
  tb: "Thiết bị", qt: "Quy trình", kho: "Kho", ht: "Hệ thống phụ trợ", vc: "Vận chuyển",
};

/** Đối tượng có nằm trong kế hoạch thẩm định không — cột "Thẩm định" của danh
 *  mục nguồn, RPC trả về dưới tên `need`.
 *  Mặc định TRUE khi thiếu: nhóm dựng từ chính hạng mục (mã có timeline mà
 *  danh mục nguồn chưa có dòng) thì đương nhiên là có thẩm định — để mặc
 *  định false sẽ giấu mất đúng những mã đang cần nhập. */
function coThamDinh(o: { need?: boolean | string }): boolean {
  const v = o.need;
  if (v == null || v === "") return true;
  return !(v === false || v === "n" || v === "false" || v === "N");
}

/** Một ô mốc thời gian: hạn, trạng thái, ngày thực tế — gói gọn trong một ô
 *  bảng để nhìn cả timeline mà không phải mở từng hộp một. */
function OMoc({ raw, dlKey, ngayKey, ttKey }: {
  raw: Record<string, unknown>; dlKey: string; ngayKey: string; ttKey: string;
}) {
  const dl = parseD(raw[dlKey] as string);
  const ngay = parseD(raw[ngayKey] as string);
  const xong = wlIsDone(raw[ttKey]);
  const tre = !xong && dl && dl < new Date(new Date().setHours(0, 0, 0, 0));
  const mau = xong ? C.mintText : tre ? C.raspText : C.plumSoft;
  const nen = xong ? C.mintSoft : tre ? C.raspSoft : C.pinkMist;
  return (
    <td style={{ padding: "7px 10px", whiteSpace: "nowrap", verticalAlign: "top" }}>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 5, background: nen,
        borderRadius: 8, padding: "3px 8px" }}>
        <span style={{ width: 7, height: 7, borderRadius: 999, background: mau, flexShrink: 0 }} />
        <span style={{ fontFamily: NUM, fontSize: 12, fontWeight: 800, color: mau }}>
          {dl ? fmtVN(dl) : "—"}
        </span>
      </div>
      <div style={{ fontSize: 12, color: C.plumSoft, fontWeight: 600, marginTop: 2 }}>
        {xong ? (ngay ? `xong ${fmtVN(ngay)}` : "xong · thiếu ngày") : tre ? "trễ" : "chưa xong"}
      </div>
    </td>
  );
}

export default function CatalogView({ objects = [], acts = [], isAdmin, onUpdate, onReload, readOnly = false, onMoDanhMuc }: {
  objects?: VmpObject[];
  acts?: Activity[];
  isAdmin?: boolean;
  /** Cùng chữ ký với màn Cập nhật tiến độ — hai màn ghi qua một đường. */
  onUpdate?: (id: string, patch: Record<string, unknown>, userName?: string, reason?: string, expectedVersion?: number) => void;
  onReload?: () => void;
  readOnly?: boolean;
  /** Mở đúng đối tượng này bên "Danh mục & Nhập liệu". */
  onMoDanhMuc?: (code: string, nhom?: string) => void;
}) {
  const [q, setQ] = useState("");
  const kw = useDebounce(q.trim().toLowerCase(), 250);
  const [cls, setCls] = useState("all");
  const [dept, setDept] = useState("all");
  const [status, setStatus] = useState("all");
  const [year, setYear] = useState("all");
  /** Lọc theo cột "Thẩm định" của danh mục nguồn. MẶC ĐỊNH `y`: RPC trả về
   *  TOÀN BỘ `vmp_source_objects` đang hoạt động (272), trong đó 55 đối tượng
   *  có `Thẩm định = n` — chúng không sinh hạng mục nào nên chỉ làm loãng
   *  danh sách của trang tiến độ. Vẫn để chọn xem được, vì người dùng cần
   *  kiểm tra "cái này sao không có timeline?". */
  const [tdinh, setTdinh] = useState<"y" | "n" | "all">("y");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [edit, setEdit] = useState<Activity | null>(null);
  /** Mở hộp bằng đường tắt "✓ Xong bước" — hộp điền sẵn hôm nay + Hoàn thành,
   *  người nhập chỉ còn chọn lý do rồi Lưu. Dùng lại đúng đường đã kiểm của
   *  màn Cập nhật tiến độ, KHÔNG ghi thẳng — lý do là bắt buộc theo ALCOA+. */
  const [quick, setQuick] = useState(false);
  /** Số nhóm dựng thật — 272 đối tượng dựng một lúc là thừa, mắt chỉ đọc được
   *  vài chục dòng đầu. */
  // Phân trang thật thay nút "Hiện thêm" — xem PhanTrang trong Primitives.
  const [trang, setTrang] = useState(0);
  const [coTrang, setCoTrang] = useState(50);

  /** Danh sách phẳng đúng thứ tự đang hiện trên màn — hộp sửa dùng nó để nhảy
   *  sang hạng mục kế tiếp mà không phải đóng ra mở vào. Đây chính là cách
   *  "nhập hàng loạt" mà màn Cập nhật tiến độ đang dùng; làm giống hệt để hai
   *  màn không có hai thói quen khác nhau. */
  const years = useMemo(
    () => [...new Set(acts.map(yearOf))].filter((y) => y && y !== "—").sort(),
    [acts],
  );

  // Gom hạng mục theo mã đối tượng.
  const groups = useMemo(() => {
  /** Một nhóm hiển thị: đối tượng + các hạng mục thẩm định của nó. */
    const byCode = new Map<string, { obj: VmpObject; items: Activity[] }>();
    objects.forEach((o) => byCode.set(o.code, { obj: o, items: [] }));
    acts.forEach((a) => {
      if ((a.state || "active") !== "active") return;
      if (!byCode.has(a.code)) byCode.set(a.code, {
        obj: {
          code: a.code, name: a.name ?? a.code, cls: a.cls, dept: a.dept,
          area: "—", crit: a.crit, freq: 0,
        },
        items: [],
      });
      byCode.get(a.code)!.items.push(a);
    });
    let list = [...byCode.values()];
    // lọc theo NĂM ngay trên hạng mục, rồi sắp theo loại thẩm định → năm
    list.forEach((g) => {
      g.items = g.items
        .filter((a: Activity) => year === "all" || yearOf(a) === year)
        .sort((x: Activity, y: Activity) =>
          String(x.vtype).localeCompare(String(y.vtype), "vi")
          || yearOf(x).localeCompare(yearOf(y)));
    });
    // lọc nhóm
    const needle = kw;
    list = list.filter((g) => {
      const o = g.obj;
      if (tdinh !== "all" && (coThamDinh(o) ? "y" : "n") !== tdinh) return false;
      if (cls !== "all" && o.cls !== cls) return false;
      if (dept !== "all" && o.dept !== dept) return false;
      if (year !== "all" && g.items.length === 0) return false; // lọc năm → chỉ mã có hạng mục năm đó
      if (status !== "all" && !g.items.some((a) => a.st === status)) return false;
      if (needle) {
        const hay = [o.code, o.name, ...g.items.map((a) => a.vtype), ...g.items.map((a) => a.owner)].map((x) => String(x || "").toLowerCase());
        if (!hay.some((x) => x.includes(needle))) return false;
      }
      return true;
    });
    // sắp theo MÃ đối tượng
    list.sort((a, b) => String(a.obj.code).localeCompare(String(b.obj.code), "vi", { numeric: true }));
    return list;
  }, [objects, acts, kw, cls, dept, status, year, tdinh]);

  const totalItems = groups.reduce((s, g) => s + g.items.length, 0);
  // Lát cắt đang dựng; coTrang = 0 là "Tất cả".
  const lat = useMemo(
    () => (coTrang > 0 ? groups.slice(trang * coTrang, (trang + 1) * coTrang) : groups),
    [groups, trang, coTrang],
  );
  // Đổi bộ lọc thì về trang đầu.
  useEffect(() => { setTrang(0); }, [kw, cls, dept, status, year, tdinh]);
  const danhSachPhang = useMemo(
    () => lat.flatMap((g) => groupByType(g.items).flatMap((t) => t.items)),
    [lat],
  );

  const toggle = (code: string) => setOpen((p) => ({ ...p, [code]: !p[code] }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <Card>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: 14, background: C.lavSoft, display: "flex", alignItems: "center", justifyContent: "center" }}><Boxes size={22} color={C.lavText} /></div>
            <div>
              <div style={{ fontFamily: TEXT, fontWeight: 900, fontSize: 16, color: C.plum }}>Danh mục đối tượng & Tiến độ</div>
              <div style={{ fontSize: 12, color: C.plumSoft, fontWeight: 600 }}>Nhóm theo mã đối tượng · mỗi mã nhiều loại thẩm định / lần thẩm định trong năm</div>
            </div>
          </div>
          {/* Nút "Thêm đối tượng" cũ mở một hộp chỉ XEM TRƯỚC dòng Sheet rồi
              khoá nút Lưu — thêm không được. Chỗ thêm thật nằm ở Danh mục &
              Nhập liệu, nên chỉ đường sang đó thay vì để nút giả. */}
          <div style={{ fontSize: 12, color: C.plumSoft, fontWeight: 600, maxWidth: 260, lineHeight: 1.5, textAlign: "right" }}>
            Thêm đối tượng mới ở <b style={{ color: C.plum }}>Danh mục &amp; Nhập liệu</b> → Danh mục nguồn, rồi bấm <b style={{ color: C.plum }}>Sinh timeline</b>.
          </div>
        </div>
        <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ position: "relative", flex: 1, minWidth: 220 }}>
            <Search size={16} color={C.plumSoft} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm mã, tên, loại thẩm định, QA…" style={{ ...INP, paddingLeft: 36 }} />
          </div>
          <select value={cls} onChange={(e) => setCls(e.target.value)} style={{ ...INP, cursor: "pointer", maxWidth: 180 }}><option value="all">Tất cả nhóm</option>{Object.keys(CLS).map((k) => <option key={k} value={k}>{(CLS as Record<string, { label: string }>)[k].label}</option>)}</select>
          <select value={dept} onChange={(e) => setDept(e.target.value)} style={{ ...INP, cursor: "pointer", maxWidth: 180 }}><option value="all">Tất cả bộ phận</option>{DEPTS.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ ...INP, cursor: "pointer", maxWidth: 170 }}><option value="all">Tất cả tình trạng</option><option value="over">Quá hạn</option><option value="prog">Đang chạy</option><option value="todo">Kế hoạch</option><option value="done">Đã xong</option></select>
          <select value={year} onChange={(e) => setYear(e.target.value)} style={{ ...INP, cursor: "pointer", maxWidth: 140 }} title="Lọc theo năm thẩm định"><option value="all">Tất cả năm</option>{years.map((y) => <option key={y} value={y}>Năm {y}</option>)}</select>
          <select value={tdinh} onChange={(e) => setTdinh(e.target.value as "y" | "n" | "all")} style={{ ...INP, cursor: "pointer", maxWidth: 210 }}
            title="Cột &quot;Thẩm định&quot; ở Danh mục nguồn. Đối tượng đánh dấu 'n' không sinh hạng mục nào nên mặc định được ẩn khỏi trang tiến độ.">
            <option value="y">Chỉ đối tượng có thẩm định</option>
            <option value="n">Chỉ đối tượng không thẩm định</option>
            <option value="all">Cả hai</option>
          </select>
        </div>
        <div style={{ marginTop: 10, fontSize: 12, color: C.plumSoft, fontWeight: 700 }}>{groups.length} đối tượng · {totalItems} hạng mục thẩm định</div>
      </Card>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {lat.map((g) => {
          const o = g.obj;
          const cl = (CLS as Record<string, typeof CLS.tb>)[String(o.cls ?? "tb")] || CLS.tb;
          const dp = DEPTS.find((d) => d.id === o.dept);
          const done = g.items.filter((a) => a.st === "done").length;
          const over = g.items.filter((a) => a.st === "over").length;
          const nTypes = new Set(g.items.map((a) => a.vtype)).size;
          const isOpen = open[String(o.code)];
          // Điểm trọng yếu / phân loại báo cáo nằm ở hạng mục chứ không ở đối
          // tượng. Lấy của lần đầu, và báo nếu các lần không giống nhau —
          // hiện một con số cho cả nhóm mà bên trong khác nhau là nói dối.
          const thongTin = (() => {
            if (!g.items.length) return null;
            const diems = new Set(g.items.map((a) => String(a.score ?? "")));
            const deps = new Set(g.items.map((a) => String(a.dep ?? "")));
            const d0 = g.items[0];
            return {
              diem: d0.score != null && String(d0.score) !== "" ? d0.score : null,
              dep: d0.dep ? txt(d0.dep) : "",
              lech: diems.size > 1 || deps.size > 1,
            };
          })();
          return (
            <Card key={o.code} style={{ padding: 0, overflow: "hidden" }}>
              <button onClick={() => toggle(o.code)} style={{ width: "100%", textAlign: "left", border: "none", background: isOpen ? C.pinkMist : C.surface, cursor: "pointer", padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
                <ChevronRight size={18} color={C.plumSoft} style={{ transform: isOpen ? "rotate(90deg)" : "none", transition: "transform .15s", flexShrink: 0 }} />
                <span style={{ fontFamily: NUM, fontWeight: 900, fontSize: 14, color: cl.text, background: cl.soft, padding: "3px 10px", borderRadius: 8, whiteSpace: "nowrap" }}>{o.code}</span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: C.plum, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{txt(o.name)}</div>
                  <div style={{ fontSize: 12, color: C.plumSoft, fontWeight: 600, marginTop: 2 }}>{cl.label} · {dp?.name || o.dept || "—"} · {txt(o.area)}{Number(o.freq) > 0 ? ` · chu kỳ ${o.freq} tháng` : ""}</div>
                  {/* Điểm trọng yếu và phân loại báo cáo lấy từ chính hạng mục,
                      vì hai thứ này quyết định thứ tự ưu tiên (ICH Q9) và số
                      ngày lùi của hạn thẩm định — người nhập cần thấy ngay. */}
                  {thongTin && (
                    <div style={{ fontSize: 12, color: C.plumSoft, fontWeight: 600, marginTop: 3, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {thongTin.diem != null && (
                        <span style={{ background: C.marigoldSoft, color: C.marigoldText, borderRadius: 999, padding: "2px 8px", fontWeight: 800 }}>
                          Trọng yếu {thongTin.diem}/9
                        </span>
                      )}
                      {thongTin.dep && (
                        <span style={{ background: C.skySoft, color: C.skyText, borderRadius: 999, padding: "2px 8px", fontWeight: 800 }}>
                          Báo cáo: {thongTin.dep}
                        </span>
                      )}
                      {thongTin.lech && (
                        <span style={{ background: C.raspSoft, color: C.raspText, borderRadius: 999, padding: "2px 8px", fontWeight: 800 }}
                          title="Các hạng mục của đối tượng này không cùng điểm trọng yếu / phân loại báo cáo — mở từng hạng mục để xem đúng của nó.">
                          ⚠ các lần không giống nhau
                        </span>
                      )}
                    </div>
                  )}
                </div>
                {/* Nhóm rỗng có HAI nguyên nhân khác hẳn nhau, gộp chung một nhãn
                    là nói sai: đối tượng ngoài kế hoạch (cột "Thẩm định" = n) thì
                    đúng là không thẩm định; còn đối tượng CÓ thẩm định mà rỗng là
                    do mọi hạng mục của nó bị đánh "Không áp dụng" — cái này cần
                    người nhập ngó lại, không được ru ngủ bằng chữ "không thẩm định". */}
                {g.items.length === 0 ? (
                  !coThamDinh(o) ? (
                    <span style={{ fontSize: 12, fontWeight: 800, color: C.plumSoft, background: C.pinkMist, padding: "4px 10px", borderRadius: 999, whiteSpace: "nowrap" }}
                      title="Danh mục nguồn đánh dấu đối tượng này không thẩm định nên không sinh hạng mục nào.">
                      Không thẩm định
                    </span>
                  ) : (
                    <span style={{ fontSize: 12, fontWeight: 800, color: C.marigoldText, background: C.marigoldSoft, padding: "4px 10px", borderRadius: 999, whiteSpace: "nowrap" }}
                      title="Đối tượng CÓ trong kế hoạch thẩm định nhưng không còn hạng mục nào đang hiệu lực — thường do các lần đã bị đánh dấu &quot;Không áp dụng&quot;. Mở Danh mục &amp; Nhập liệu để kiểm tra.">
                      Có thẩm định · chưa có lần nào hiệu lực
                    </span>
                  )
                ) : (
                  <>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 800, color: C.lavText, background: C.lavSoft, padding: "4px 10px", borderRadius: 999, whiteSpace: "nowrap" }}><Layers size={13} />{nTypes} loại · {g.items.length} lần</span>
                    <span style={{ fontSize: 12, fontWeight: 800, color: C.mintText, whiteSpace: "nowrap" }}>{done}/{g.items.length} xong</span>
                  </>
                )}
                {over > 0 && <span style={{ fontSize: 12, fontWeight: 800, color: C.raspText, background: C.raspSoft, padding: "3px 8px", borderRadius: 999, whiteSpace: "nowrap" }}>{over} quá hạn</span>}
              </button>

              {/* Trang này CHỈ nhập timeline và đánh dấu xong/chưa. Mọi thứ thuộc
                  về bản thân đối tượng — tên, khu vực, bộ phận, tần suất, điểm
                  trọng yếu — nằm ở Danh mục & Nhập liệu. Không có lối nhảy thì
                  người dùng phải tự nhớ mã rồi sang trang kia gõ lại tay. */}
              {isOpen && onMoDanhMuc && (
                <div style={{ padding: "8px 16px", borderTop: `1px solid ${C.pinkSoft}`,
                  background: "rgba(237,231,252,.28)", display: "flex", alignItems: "center",
                  gap: 10, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12, color: C.plumSoft, fontWeight: 700 }}>
                    Sửa tên · khu vực · bộ phận · tần suất · điểm trọng yếu của đối tượng này:
                  </span>
                  <button type="button"
                    onClick={() => onMoDanhMuc(String(o.code), CLS_SANG_NHOM[String(o.cls ?? "")])}
                    style={{ display: "inline-flex", alignItems: "center", gap: 6,
                      fontFamily: TEXT, fontSize: 12, fontWeight: 800, cursor: "pointer",
                      color: C.lavText, background: C.lavSoft, border: "none",
                      borderRadius: 999, padding: "6px 13px" }}>
                    <ExternalLink size={13} /> Mở trong Danh mục &amp; Nhập liệu
                  </button>
                </div>
              )}

              {isOpen && (
                <div style={{ borderTop: `1px solid ${C.pinkSoft}`, padding: "10px", display: "flex", flexDirection: "column", gap: 10 }}>
                  {groupByType(g.items).map(({ vtype, items, dupYears }) => (
                    <div key={vtype} style={{ borderRadius: 14, border: `1px solid ${C.pinkSoft}`, overflow: "hidden" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 12px", background: "rgba(237,231,252,.45)" }}>
                        <Tag color={C.lavText} bg={C.lavSoft}>{txt(vtype)}</Tag>
                        <span style={{ fontSize: 12, fontWeight: 800, color: C.plum }}>{items.length} lần thẩm định</span>
                        {dupYears.size > 0 && (
                          <span style={{ fontSize: 12, fontWeight: 800, color: C.raspText, background: C.raspSoft, padding: "3px 9px", borderRadius: 999 }} title="Cùng một loại thẩm định không nên lặp trong cùng một năm">
                            ⚠ Trùng loại trong năm {[...dupYears].join(", ")}
                          </span>
                        )}
                      </div>
                      <div className="vmp-scroll" style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: TEXT, minWidth: 980 }}>
                          <thead><tr style={{ background: "rgba(252,227,239,.35)" }}>
                            {["Năm", "ID", "1. Đề cương", "2. Thẩm định", "3. Báo cáo", "4. Đích VMP", "QA", "Chung", ""].map((h, i) => <th key={i} style={{ textAlign: i >= 7 ? "center" : "left", padding: "8px 12px", fontSize: 12, fontWeight: 800, color: C.plumSoft, whiteSpace: "nowrap" }}>{h}</th>)}
                          </tr></thead>
                          <tbody>
                            {items.map((a, i) => { const dup = dupYears.has(yearOf(a)); return (
                              <tr key={a.id} style={{ borderTop: `1px solid ${C.pinkSoft}`, background: dup ? "rgba(252,226,233,.45)" : (i % 2 ? "rgba(255,255,255,.5)" : "transparent") }}>
                                <td style={{ padding: "9px 14px", fontFamily: NUM, fontWeight: 800, color: dup ? C.raspText : C.plum, fontSize: 12, whiteSpace: "nowrap" }}>{yearOf(a)}{dup && <span style={{ marginLeft: 6, fontSize: 12, fontWeight: 800, color: C.raspText }}>⚠</span>}</td>
                                <td style={{ padding: "9px 12px", color: C.plumSoft, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>{a.id}</td>
                                <OMoc raw={(a._raw || {}) as Record<string, unknown>} dlKey="dl_de_cuong" ngayKey="ngay_de_cuong" ttKey="tt_de_cuong" />
                                <OMoc raw={(a._raw || {}) as Record<string, unknown>} dlKey="dl_tham_dinh" ngayKey="ngay_tham_dinh" ttKey="tt_tham_dinh" />
                                <OMoc raw={(a._raw || {}) as Record<string, unknown>} dlKey="dl_bao_cao" ngayKey="ngay_bao_cao" ttKey="tt_bao_cao" />
                                <OMoc raw={(a._raw || {}) as Record<string, unknown>} dlKey="dl_vmp" ngayKey="ngay_vmp" ttKey="tt_vmp" />
                                <td style={{ padding: "9px 12px", color: C.plumSoft, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>{txt(a.owner)}</td>
                                <td style={{ padding: "9px 12px", textAlign: "center" }}><Pill s={a.st} small /></td>
                                <td style={{ padding: "9px 12px", textAlign: "center", whiteSpace: "nowrap" }}>
                                  {!readOnly && a.st !== "done" && (
                                    <button onClick={() => { setEdit(a); setQuick(true); }}
                                      title="Đánh dấu xong bước hiện tại hôm nay — hộp điền sẵn, chỉ cần chọn lý do rồi Lưu"
                                      style={{ padding: "6px 10px", borderRadius: 8, border: `1px solid ${C.mint}`,
                                        background: C.mintSoft, color: C.mintText, fontFamily: TEXT, fontSize: 12,
                                        fontWeight: 800, cursor: "pointer", marginRight: 6 }}>
                                      ✓ Xong bước
                                    </button>
                                  )}
                                  <button onClick={() => { setEdit(a); setQuick(false); }} style={{ ...btnPrimary, padding: "6px 12px", borderRadius: 8, fontSize: 12, display: "inline-flex", alignItems: "center", gap: 5 }}><Pencil size={12} /> Cập nhật</button>
                                </td>
                              </tr>
                            ); })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          );
        })}
        {groups.length > 0 && (
          <PhanTrang tong={groups.length} trang={trang} setTrang={setTrang}
            coTrang={coTrang} setCoTrang={setCoTrang} donVi="đối tượng" />
        )}
        {!groups.length && <Card><div style={{ textAlign: "center", padding: 30, color: C.plumSoft, fontWeight: 600 }}>Không có đối tượng phù hợp bộ lọc.</div></Card>}
      </div>

      {/* Ẩn khỏi danh sách trên mà không có chỗ tra thì thành GIẤU. Thẻ này là
          chỗ tra: mở ra là thấy đủ 55 đối tượng ngoài kế hoạch kèm lý do. */}
      <KhongThamDinhCard onMoDanhMuc={onMoDanhMuc} />

      <div style={{ fontSize: 12, color: C.plumSoft, fontWeight: 600, padding: "0 4px", lineHeight: 1.6 }}>
        <b style={{ color: C.mintText }}>Supabase là nơi lưu dữ liệu gốc</b> (từ 29/07/2026).
        Màn này gộp theo mã đối tượng; bấm <b>Cập nhật</b> ở từng hạng mục là sửa được
        ngay tại đây — cùng một hộp và cùng luật với màn <b>Cập nhật tiến độ</b>.
        Thêm / xoá đối tượng thì vào <b>Danh mục &amp; Nhập liệu</b>.
        Google Sheet nay chỉ là bản tham chiếu chỉ đọc.
      </div>

      {/* Cùng một hộp với màn Cập nhật tiến độ: ghi thật, có khoá lạc quan,
          bắt buộc lý do theo ALCOA+, gán được người thực hiện. */}
      {edit && !readOnly && (
        <ProgressEditModal
          key={edit.id}
          act={edit}
          isAdmin={isAdmin}
          onClose={() => { setEdit(null); setQuick(false); }}
          onReload={onReload}
          quickDone={quick}
          nextAct={(() => {
            const i = danhSachPhang.findIndex((x) => x.id === edit.id);
            return i >= 0 ? danhSachPhang[i + 1] ?? null : null;
          })()}
          onOpenNext={(a) => { setEdit(a); setQuick(false); }}
          onSave={onUpdate ?? (() => { /* chưa nối hàm cập nhật */ })}
        />
      )}
    </div>
  );
}
