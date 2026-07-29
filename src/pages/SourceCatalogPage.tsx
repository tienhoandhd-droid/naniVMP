/* =====================================================================
 *  SourceCatalogPage.jsx — 5 danh mục nguồn, nhập liệu trực tiếp trên web
 *  ---------------------------------------------------------------------
 *  Thay thế việc nhập liệu trên Google Sheet (2026-07-29). Sheet nay chỉ
 *  còn là nguồn tham chiếu chỉ đọc; Supabase là nơi lưu dữ liệu gốc.
 *
 *  Nguồn dữ liệu: bảng vmp_source_objects — gộp 5 tab nguồn cũ:
 *    1. DS thiết bị-All      -> Thiết bị
 *    2. DS quy trình         -> Quy trình
 *    3. DS kho               -> Kho
 *    4. DS hệ thống phụ trợ  -> Hệ thống phụ trợ
 *    5. Vận chuyển           -> Vận chuyển
 *
 *  Các cột ở đây là ĐẦU VÀO CỦA LUẬT SINH TIMELINE (workflow VMP01), nên
 *  form có ghi chú rõ cột nào ảnh hưởng tới mốc thời gian nào — thiếu
 *  "Tháng thẩm định đầu tiên" thì toàn bộ deadline của đối tượng đó không
 *  tính được.
 *
 *  Quyền: chỉ admin / qa_manager sửa được (RPC tự chặn phía server; ở đây
 *  chỉ ẩn nút cho gọn giao diện, không phải lớp bảo mật).
 * ===================================================================== */
import { useState, useEffect, useMemo } from "react";
import { Boxes, RefreshCw, Plus, Pencil, Ban, Trash2, Search, AlertTriangle,
         CalendarPlus, Bell, Users, FlaskConical, Table2, Columns3, Download } from "lucide-react";
import { C, TEXT, NUM, btnPrimary } from "../constants/theme.ts";
import { Card, CardTitle, Tag, Modal, TableScroll } from "../components/ui/Primitives.tsx";
import {
  SOURCE_KINDS, fetchSourceObjects, upsertSourceObject, deleteSourceObject,
  generateTimeline, fetchSourceWarnings,
  fetchAlertRecipients, upsertAlertRecipient, deleteAlertRecipient,
  fetchStaffEmails, upsertStaffEmail, deleteStaffEmail,
  fetchProductsGmp, upsertProductGmp, deleteProductGmp,
  listSourceTabs, fetchSourceRows, upsertSourceRow, deleteSourceRow,
} from "../lib/supabaseData.ts";
import type { SourceRow } from "../lib/supabaseData.ts";
import type { AppUser, GenerateTimelineResult, ObjectKind, SourceObjectRow } from "../types/domain.ts";
import type { SourceWarnings } from "../lib/supabaseData.ts";

/* Cột hiển thị + siêu dữ liệu cho form.
   `hint` giải thích ảnh hưởng tới luật sinh timeline — đây là phần người
   nhập liệu hay sai nhất, nên để ngay cạnh ô nhập. */
/** Cột hiện mặc định — 19 cột cùng lúc là quá rộng để đọc trên màn hình.
 *  Người dùng bật thêm cột nào cần qua nút "Cột hiển thị". */
const DEFAULT_COLS = new Set([
  "object_code", "object_name", "department", "area_code",
  "validate_flag", "first_month", "frequency_months",
  "owner_name", "criticality_score",
]);

const FIELDS = [
  { key: "object_code",      label: "Mã đối tượng",        w: 130, required: true, lockOnEdit: true },
  { key: "object_name",      label: "Tên đối tượng",       w: 240 },
  { key: "department",       label: "Bộ phận quản lý",     w: 130 },
  { key: "area_code",        label: "Mã khu vực",          w: 110 },
  { key: "line",             label: "Line",                w: 80 },
  { key: "status",           label: "Tình trạng",          w: 110 },
  { key: "show_flag",        label: "Show",                w: 70 },
  { key: "validate_flag",    label: "Thẩm định",           w: 90,
    hint: "Chỉ 'y' mới được sinh hạng mục timeline. Bỏ trống hoặc 'n' là loại khỏi kế hoạch." },
  { key: "validate_reason",  label: "Lý do thẩm định",     w: 160 },
  { key: "frequency_months", label: "Tần suất (tháng)",    w: 110, num: true,
    hint: "Quyết định số lần thẩm định trong năm: số lần = 12 ÷ tần suất (tối thiểu 1)." },
  { key: "report_class",     label: "Phân loại báo cáo",   w: 150,
    hint: "Quyết định khoảng cách báo cáo: không phụ thuộc 2 · hóa lý 2 · nhiễm khuẩn 7 · vô khuẩn 16 ngày." },
  { key: "workdays",         label: "Số ngày công",        w: 100, num: true,
    hint: "Dùng để tính ngày bắt đầu thẩm định = ngày kết thúc − số ngày công." },
  { key: "first_month",      label: "Tháng TĐ đầu tiên",   w: 120, num: true,
    hint: "BẮT BUỘC. Thiếu cột này thì toàn bộ mốc thời gian của đối tượng không tính được." },
  { key: "year_ref",         label: "Năm nhập / ban hành", w: 120, num: true,
    hint: "Bằng năm thẩm định và chưa từng có IQ ⇒ sinh đủ DQ, FAT/SAT, IQ, OQ, PQ (chỉ một lần)." },
  { key: "owner_name",       label: "QA phụ trách",        w: 150,
    hint: "Gán tự động theo bảng phân công (vmp_assignment_rules). Sửa tay được." },
  { key: "support_name",     label: "Người hỗ trợ",        w: 140 },
  { key: "work_group",       label: "Nhóm công việc",      w: 190,
    hint: "Nhóm trong bảng phân công đã khớp — dùng để truy vì sao thuộc về người này." },
  { key: "complexity_score", label: "Phức tạp",            w: 90, num: true,
    hint: "3 Cao · 2 Trung bình · 1 Thấp" },
  { key: "quality_impact_score", label: "Ảnh hưởng CL",    w: 105, num: true,
    hint: "3 Trực tiếp · 2 Gián tiếp · 1 Không ảnh hưởng" },
  { key: "criticality_score", label: "Điểm trọng yếu",     w: 120, num: true,
    hint: "= Phức tạp × Ảnh hưởng (1..9). Sửa tay thì dòng chuyển sang 'đã duyệt', không bị chấm lại đè." },
  { key: "note",             label: "Ghi chú",             w: 160 },
];

function SourceCatalogSection({ user, onReload }: {
  user?: AppUser | null; onReload?: () => void;
}) {
  const canEdit = user?.perm === "admin";
  const [kind, setKind] = useState<ObjectKind>(SOURCE_KINDS[0]);
  const [rows, setRows] = useState<SourceObjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  // null = đóng | {} = thêm mới | row = sửa
  const [editing, setEditing] = useState<Partial<SourceObjectRow> | null>(null);
  const [saving, setSaving] = useState(false);
  const [gen, setGen] = useState<GenState | null>(null);   // hộp thoại sinh timeline
  const [warn, setWarn] = useState<SourceWarnings | null>(null);
  const [visible, setVisible] = useState<Set<string>>(() => new Set(DEFAULT_COLS));
  const [colPicker, setColPicker] = useState(false);
  /** Sắp xếp: null = giữ thứ tự gốc. Bấm tiêu đề để đổi tăng → giảm → bỏ. */
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(null);
  /** Dòng đang chọn, để thao tác hàng loạt — đây là cách xử lý nhanh
   *  hàng trăm đối tượng mà không phải mở từng hộp thoại. */
  const [picked, setPicked] = useState<Set<string>>(new Set());
  /** Ô đang sửa tại chỗ: nhấn đúp để mở, Enter lưu, Esc huỷ, Tab sang phải. */
  const [cell, setCell] = useState<{ id: string; key: string; value: string } | null>(null);
  const [bulk, setBulk] = useState(false);
  /** Lọc theo cột kiểu Excel: cột → danh sách giá trị được giữ lại.
   *  Không có khoá trong đây nghĩa là cột đó không lọc gì. */
  const [colFil, setColFil] = useState<Record<string, string[]>>({});
  /** Bảng chọn giá trị đang mở: cột nào, neo ở toạ độ nào trên màn hình. */
  const [menu, setMenu] = useState<{ key: string; x: number; y: number } | null>(null);
  // Cột mã đối tượng luôn hiện — nó là cột ghim, ẩn đi thì mất mốc dò dòng.
  const shownFields = useMemo(
    () => FIELDS.filter((f) => f.key === "object_code" || visible.has(f.key)),
    [visible]);

  const load = async () => {
    setLoading(true); setErr("");
    try {
      setRows(await fetchSourceObjects({ kind }));
    } catch (e) {
      setErr((e as Error).message || "Lỗi tải danh mục");
    }
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [kind]);

  // Cảnh báo rà trên TOÀN BỘ danh mục nên chỉ tải một lần, không theo tab.
  useEffect(() => {
    fetchSourceWarnings().then(setWarn).catch(() => setWarn(null));
  }, []);

  /** Ô trống hiện là "(trống)" trong bảng chọn, nhưng lưu là chuỗi rỗng. */
  const cellText = (r: SourceObjectRow, key: string) =>
    String((r as Record<string, unknown>)[key] ?? "");

  /** Bước 1: ô tìm kiếm chung. */
  const searched = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) =>
      FIELDS.some((f) => cellText(r, f.key).toLowerCase().includes(s)));
  }, [rows, q]);

  /** Bước 2: lọc theo cột. Bỏ qua một cột (skip) để tính danh sách giá trị
   *  cho chính cột đó — giống Excel: mở lại vẫn thấy đủ lựa chọn của nó. */
  const applyColFil = (list: SourceObjectRow[], skip?: string) => {
    const keys = Object.keys(colFil).filter((k) => k !== skip && colFil[k]?.length);
    if (!keys.length) return list;
    return list.filter((r) => keys.every((k) => colFil[k].includes(cellText(r, k))));
  };

  const filtered = useMemo(() => applyColFil(searched),
    /* eslint-disable-next-line */ [searched, colFil]);

  /** Giá trị có thể chọn của một cột, kèm số dòng — sắp xếp tiếng Việt. */
  const optionsOf = (key: string) => {
    const count = new Map<string, number>();
    for (const r of applyColFil(searched, key)) {
      const v = cellText(r, key);
      count.set(v, (count.get(v) ?? 0) + 1);
    }
    return [...count.entries()]
      .sort((a, b) => a[0] === "" ? 1 : b[0] === "" ? -1
        : a[0].localeCompare(b[0], "vi", { numeric: true }))
      .map(([value, n]) => ({ value, n }));
  };

  /** Sắp xếp: số so theo số, còn lại so chuỗi có dấu tiếng Việt. */
  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const f = FIELDS.find((x) => x.key === sort.key);
    const sign = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const va = (a as Record<string, unknown>)[sort.key];
      const vb = (b as Record<string, unknown>)[sort.key];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;            // ô trống luôn xuống cuối
      if (vb == null) return -1;
      if (f?.num) return sign * (Number(va) - Number(vb));
      return sign * String(va).localeCompare(String(vb), "vi", { numeric: true });
    });
  }, [filtered, sort]);

  const toggleSort = (key: string) => setSort((p) =>
    !p || p.key !== key ? { key, dir: "asc" }
      : p.dir === "asc" ? { key, dir: "desc" }
      : null);

  /** Lưu một ô sau khi sửa tại chỗ. */
  const saveCell = async () => {
    if (!cell) return;
    const row = rows.find((r) => r.id === cell.id);
    const f = FIELDS.find((x) => x.key === cell.key);
    setCell(null);
    if (!row || !f) return;
    const before = String((row as Record<string, unknown>)[cell.key] ?? "");
    if (before === cell.value) return;                 // không đổi thì không gọi server
    try {
      await upsertSourceObject(kind, row.object_code,
        { [cell.key]: f.num ? Number(cell.value) : cell.value });
      await load();
    } catch (e) { alert("Lỗi lưu: " + ((e as Error).message || "không rõ")); }
  };

  /** Gán cùng một giá trị cho mọi dòng đang chọn. */
  const applyBulk = async (key: string, value: string) => {
    const f = FIELDS.find((x) => x.key === key);
    const targets = sorted.filter((r) => picked.has(r.id));
    if (!targets.length) return;
    if (!window.confirm(`Đặt "${f?.label}" = "${value}" cho ${targets.length} đối tượng đang chọn?`)) return;
    setSaving(true);
    try {
      for (const r of targets) {
        await upsertSourceObject(kind, r.object_code,
          { [key]: f?.num ? Number(value) : value });
      }
      setPicked(new Set());
      setBulk(false);
      await load();
    } catch (e) { alert("Lỗi: " + ((e as Error).message || "không rõ")); }
    setSaving(false);
  };

  /** Xuất đúng phần đang xem (đã lọc, đã sắp, đúng cột đang hiện). */
  const exportXlsx = async () => {
    const XLSX = await import("xlsx");
    const data = sorted.map((r) => Object.fromEntries(
      shownFields.map((f) => [f.label, (r as Record<string, unknown>)[f.key] ?? ""])));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), kind.slice(0, 28));
    XLSX.writeFile(wb, `VMP_${kind}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // Đối tượng có thẩm định nhưng thiếu tháng đầu tiên => timeline sẽ hỏng mốc
  const broken = useMemo(
    () => rows.filter((r) => r.validate_flag === "y" && r.first_month == null),
    [rows]);

  const save = async (form: Record<string, unknown>) => {
    setSaving(true);
    try {
      const patch: Record<string, unknown> = {};
      for (const f of FIELDS) {
        if (f.key === "object_code") continue;
        const raw = form[f.key];
        if (raw === undefined || raw === "") continue;
        patch[f.key] = f.num ? Number(raw) : String(raw);
      }
      await upsertSourceObject(kind, String(form.object_code), patch);
      setEditing(null);
      await load();
      if (onReload) onReload();
    } catch (e) {
      alert("Lỗi lưu: " + ((e as Error).message || "không rõ"));
    }
    setSaving(false);
  };

  const stop = async (row: SourceObjectRow) => {
    const reason = window.prompt(`Lý do ngừng dùng "${row.object_code}":`);
    if (!reason || !reason.trim()) return;
    try {
      await deleteSourceObject(kind, row.object_code, reason.trim());
      await load();
    } catch (e) {
      alert("Lỗi: " + ((e as Error).message || "không rõ"));
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Card>
        <CardTitle icon={Boxes} sub="Nhập liệu trực tiếp tại đây — Google Sheet nay chỉ là nguồn tham chiếu chỉ đọc">
          Danh mục nguồn
        </CardTitle>

        {/* Chọn danh mục */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          {SOURCE_KINDS.map((k) => (
            <button key={k} onClick={() => { setKind(k); setQ(""); }}
              style={{
                padding: "8px 14px", borderRadius: 12, cursor: "pointer",
                fontFamily: TEXT, fontSize: 13, fontWeight: kind === k ? 800 : 600,
                border: `1.5px solid ${kind === k ? C.pink : C.pinkSoft}`,
                background: kind === k ? C.pinkSoft : "#fff",
                color: kind === k ? C.plum : C.plumSoft,
              }}>
              {k}
            </button>
          ))}
        </div>

        {/* Thanh công cụ */}
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: "1 1 220px" }}>
            <Search size={15} color={C.plumSoft}
              style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm theo mã, tên, bộ phận…"
              style={{
                width: "100%", padding: "9px 10px 9px 32px", borderRadius: 12,
                border: `1.5px solid ${C.pinkSoft}`, fontFamily: TEXT, fontSize: 13,
              }} />
          </div>
          <button onClick={load} style={{ ...btnPrimary, background: "#fff", color: C.plum, border: `1.5px solid ${C.pinkSoft}` }}>
            <RefreshCw size={15} /> Tải lại
          </button>
          <button onClick={exportXlsx}
            style={{ ...btnPrimary, background: "#fff", color: C.plum,
                     border: `1.5px solid ${C.pinkSoft}` }}>
            <Download size={15} /> Xuất Excel
          </button>
          {canEdit && (
            <button onClick={() => setEditing({})} style={btnPrimary}>
              <Plus size={15} /> Thêm đối tượng
            </button>
          )}
          <div style={{ position: "relative" }}>
            <button onClick={() => setColPicker((v) => !v)}
              style={{ ...btnPrimary, background: "#fff", color: C.plum,
                       border: `1.5px solid ${C.pinkSoft}` }}>
              <Columns3 size={15} /> Cột hiển thị ({shownFields.length}/{FIELDS.length})
            </button>
            {colPicker && (
              <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 20,
                            background: "#fff", border: `1.5px solid ${C.pinkSoft}`,
                            borderRadius: 14, padding: 12, minWidth: 250,
                            maxHeight: 340, overflowY: "auto",
                            boxShadow: "0 12px 34px rgba(238,123,169,.22)" }}
                   className="vmp-scroll">
                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <button onClick={() => setVisible(new Set(FIELDS.map((f) => f.key)))}
                    style={{ ...btnPrimary, padding: "5px 10px", fontSize: 11.5,
                             background: "#fff", color: C.plum,
                             border: `1.5px solid ${C.pinkSoft}` }}>Chọn tất cả</button>
                  <button onClick={() => setVisible(new Set(DEFAULT_COLS))}
                    style={{ ...btnPrimary, padding: "5px 10px", fontSize: 11.5,
                             background: "#fff", color: C.plum,
                             border: `1.5px solid ${C.pinkSoft}` }}>Mặc định</button>
                </div>
                {FIELDS.map((f) => {
                  const locked = f.key === "object_code";
                  return (
                    <label key={f.key} style={{ display: "flex", alignItems: "center", gap: 8,
                                                padding: "5px 2px", fontSize: 12.5,
                                                fontFamily: TEXT, color: locked ? C.plumSoft : C.plum,
                                                cursor: locked ? "not-allowed" : "pointer" }}>
                      <input type="checkbox" disabled={locked}
                        checked={locked || visible.has(f.key)}
                        onChange={(e) => setVisible((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(f.key); else next.delete(f.key);
                          return next;
                        })} />
                      {f.label}{locked ? " (luôn hiện)" : ""}
                    </label>
                  );
                })}
              </div>
            )}
          </div>
          {canEdit && (
            <button onClick={() => setGen({ year: new Date().getFullYear(), preview: null })}
              style={{ ...btnPrimary, background: "#fff", color: C.plum, border: `1.5px solid ${C.pinkSoft}` }}>
              <CalendarPlus size={15} /> Sinh timeline
            </button>
          )}
        </div>

        <div style={{ marginTop: 10, fontSize: 12.5, color: C.plumSoft, fontFamily: TEXT }}>
          {loading ? "Đang tải…" : `${sorted.length} / ${rows.length} đối tượng`}
          {" · "}
          {rows.filter((r) => r.validate_flag === "y").length} có thẩm định
          {sort ? ` · sắp theo "${FIELDS.find((f) => f.key === sort.key)?.label}" ${sort.dir === "asc" ? "tăng" : "giảm"}` : ""}
          {Object.keys(colFil).length > 0 && (
            <>
              {" · lọc theo "}
              <b>{Object.keys(colFil)
                .map((k) => FIELDS.find((f) => f.key === k)?.label ?? k).join(", ")}</b>
              <button onClick={() => setColFil({})}
                style={{ ...miniBtn, marginLeft: 7, padding: "2px 8px" }}>
                Bỏ hết lọc
              </button>
            </>
          )}
          {canEdit && <span> · <b>nhấn đúp vào ô để sửa tại chỗ</b></span>}
        </div>

        {/* Thanh thao tác hàng loạt — hiện khi có dòng được chọn */}
        {canEdit && picked.size > 0 && (
          <div style={{ marginTop: 10, padding: "10px 13px", borderRadius: 12,
                        background: C.lavSoft, color: C.lavText, fontFamily: TEXT,
                        fontSize: 12.5, display: "flex", gap: 10,
                        alignItems: "center", flexWrap: "wrap" }}>
            <b>{picked.size} đối tượng đang chọn</b>
            <button onClick={() => setBulk(true)}
              style={{ ...btnPrimary, padding: "6px 12px", fontSize: 12 }}>
              Đặt giá trị hàng loạt
            </button>
            <button onClick={() => setPicked(new Set())}
              style={{ ...btnPrimary, padding: "6px 12px", fontSize: 12,
                       background: "#fff", color: C.plum, border: `1.5px solid ${C.pinkSoft}` }}>
              Bỏ chọn
            </button>
            <span style={{ opacity: 0.85 }}>
              Dùng để gán nhanh QA phụ trách, tần suất, tháng đầu tiên… cho nhiều đối tượng một lúc.
            </span>
          </div>
        )}

        {err && (
          <div style={{ marginTop: 10, padding: 10, borderRadius: 10, background: C.raspSoft, color: C.raspText, fontSize: 13 }}>
            {err}
          </div>
        )}

        {/* Cảnh báo dữ liệu thiếu — đúng thứ làm hỏng mốc thời gian timeline */}
        {broken.length > 0 && (
          <WarnBox tone="bad" title={`${broken.length} đối tượng thiếu "Tháng thẩm định đầu tiên"`}
            body="Toàn bộ mốc thời gian của chúng không tính được — timeline sẽ để trống ô ngày."
            items={broken.map((b) => b.object_code)} />
        )}
        {warn && warn.chua_tung_iq.length > 0 && (
          <WarnBox tone="ask" title={`${warn.chua_tung_iq.length} thiết bị/hệ thống chưa từng có IQ`}
            body={"Bình thường nếu là thiết bị cũ đã thẩm định trước khi có hệ thống. "
                + "Bất thường nếu năm nhập của chúng bị bỏ lỡ không sinh timeline — khi đó cần tạo IQ thủ công."}
            items={warn.chua_tung_iq.slice(0, 12).map((x) => `${x.object_code} (${x.nam_nhap})`)}
            more={warn.chua_tung_iq.length - 12} />
        )}
        {warn && warn.show_tat.length > 0 && (
          <WarnBox tone="ask" title={`${warn.show_tat.length} đối tượng có Thẩm định = y nhưng Show ≠ y`}
            body="Luật KHÔNG lọc theo Show — chúng vẫn được sinh timeline. Rà xem nên bật Show hay tắt Thẩm định."
            items={warn.show_tat.map((x) => x.object_code)} />
        )}
        {warn && warn.chua_hoat_dong.length > 0 && (
          <WarnBox tone="ask" title={`${warn.chua_hoat_dong.length} đối tượng "Chưa hoạt động" vẫn có thẩm định`}
            body={"Luật cố ý KHÔNG lọc theo Tình trạng: thiết bị chưa hoạt động chính là thứ cần DQ/IQ/OQ. "
                + "Chỉ rà lại nếu đối tượng thật sự đã ngừng dùng."}
            items={warn.chua_hoat_dong.map((x) => x.object_code)} />
        )}
      </Card>

      {/* Bảng */}
      <Card>
        <TableScroll>
          <table style={{ width: "100%", fontFamily: TEXT, fontSize: 12.5 }}>
            <thead>
              <tr>
                {canEdit && (
                  <th className="vmp-col-check" style={{ padding: "9px 6px" }}>
                    <input type="checkbox"
                      checked={sorted.length > 0 && picked.size === sorted.length}
                      onChange={(e) => setPicked(e.target.checked
                        ? new Set(sorted.map((r) => r.id)) : new Set())} />
                  </th>
                )}
                {shownFields.map((f, i) => {
                  const on = sort?.key === f.key;
                  const fil = colFil[f.key]?.length ? colFil[f.key].length : 0;
                  return (
                    <th key={f.key}
                      className={i === 0 ? (canEdit ? "vmp-col-pin2" : "vmp-col-pin") : undefined}
                      style={{
                        textAlign: "left", padding: "9px 8px", whiteSpace: "nowrap",
                        color: on || fil ? C.pinkText : C.plum, fontWeight: 800, minWidth: f.w,
                        userSelect: "none",
                      }}>
                      <span onClick={() => toggleSort(f.key)}
                        title={f.hint || "Bấm để sắp xếp"}
                        style={{ cursor: "pointer" }}>
                        {f.label}
                        <span style={{ opacity: on ? 1 : 0.25, marginLeft: 4 }}>
                          {on ? (sort!.dir === "asc" ? "▲" : "▼") : "↕"}
                        </span>
                        {f.hint ? " ⓘ" : ""}
                      </span>
                      <button title={fil ? `Đang lọc ${fil} giá trị` : "Chọn giá trị để lọc"}
                        onClick={(e) => {
                          const b = (e.currentTarget as HTMLElement).getBoundingClientRect();
                          setMenu((m) => m?.key === f.key ? null
                            : { key: f.key, x: b.left, y: b.bottom + 4 });
                        }}
                        style={{ marginLeft: 6, padding: "1px 5px", borderRadius: 6,
                                 cursor: "pointer", fontSize: 10.5, lineHeight: 1.5,
                                 fontFamily: TEXT, verticalAlign: "middle",
                                 border: `1px solid ${fil ? C.pinkText : C.pinkSoft}`,
                                 background: fil ? C.pinkText : "#fff",
                                 color: fil ? "#fff" : C.plumSoft }}>
                        {fil ? `▾ ${fil}` : "▾"}
                      </button>
                    </th>
                  );
                })}
                {canEdit && <th style={{ padding: "9px 8px" }} />}
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.id} style={{ borderBottom: `1px solid ${C.pinkMist}`,
                                        background: picked.has(r.id) ? C.lavSoft : undefined }}>
                  {canEdit && (
                    <td className="vmp-col-check"
                      style={{ padding: "8px 6px", background: picked.has(r.id) ? C.lavSoft : undefined }}>
                      <input type="checkbox" checked={picked.has(r.id)}
                        onChange={(e) => setPicked((prev) => {
                          const n = new Set(prev);
                          if (e.target.checked) n.add(r.id); else n.delete(r.id);
                          return n;
                        })} />
                    </td>
                  )}
                  {shownFields.map((f, i) => {
                    const rec = r as Record<string, unknown>;
                    const here = cell?.id === r.id && cell.key === f.key;
                    const score = Number(rec.criticality_score);
                    return (
                    <td key={f.key} className={i === 0 ? (canEdit ? "vmp-col-pin2" : "vmp-col-pin") : undefined}
                      onDoubleClick={() => {
                        if (!canEdit || f.lockOnEdit) return;
                        setCell({ id: r.id, key: f.key, value: String(rec[f.key] ?? "") });
                      }}
                      title={canEdit && !f.lockOnEdit ? "Nhấn đúp để sửa tại chỗ" : undefined}
                      style={{ padding: here ? "2px 4px" : "8px", whiteSpace: "nowrap",
                               color: i === 0 ? C.plum : C.plumSoft,
                               fontWeight: i === 0 ? 700 : 400,
                               background: i === 0 && picked.has(r.id) ? C.lavSoft : undefined }}>
                      {here ? (
                        <input autoFocus value={cell.value}
                          onChange={(e) => setCell({ ...cell, value: e.target.value })}
                          onBlur={saveCell}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") { e.preventDefault(); saveCell(); }
                            if (e.key === "Escape") setCell(null);
                          }}
                          inputMode={f.num ? "numeric" : undefined}
                          style={{ width: Math.max(80, (f.w ?? 120) - 12), padding: "5px 7px",
                                   borderRadius: 8, fontFamily: TEXT, fontSize: 12.5,
                                   border: `1.5px solid ${C.pink}`, outline: "none" }} />
                      ) : f.key === "validate_flag" ? (
                        <Tag color={r.validate_flag === "y" ? C.mintText : C.plumSoft}
                             bg={r.validate_flag === "y" ? C.mintSoft : C.pinkMist}>
                          {r.validate_flag || "—"}
                        </Tag>
                      ) : f.key === "criticality_score" && rec[f.key] != null ? (
                        <Tag color={score >= 7 ? C.raspText : score >= 4 ? C.marigoldText : C.mintText}
                             bg={score >= 7 ? C.raspSoft : score >= 4 ? C.marigoldSoft : C.mintSoft}>
                          {String(rec[f.key])}
                        </Tag>
                      ) : f.key === "first_month" && r.validate_flag === "y" && r.first_month == null ? (
                        <span style={{ color: C.raspText, fontWeight: 700 }}>thiếu</span>
                      ) : (rec[f.key] as React.ReactNode ?? "—")}
                    </td>
                  );})}
                  {canEdit && (
                    <td style={{ padding: "8px", whiteSpace: "nowrap" }}>
                      <button onClick={() => setEditing(r)} title="Sửa"
                        style={{ border: "none", background: "transparent", cursor: "pointer", padding: 4 }}>
                        <Pencil size={15} color={C.plum} />
                      </button>
                      <button onClick={() => stop(r)} title="Ngừng dùng"
                        style={{ border: "none", background: "transparent", cursor: "pointer", padding: 4 }}>
                        <Ban size={15} color={C.raspText} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={shownFields.length + 2}
                  style={{ padding: 20, textAlign: "center", color: C.plumSoft }}>
                  {Object.keys(colFil).length || q.trim()
                    ? "Không có dòng nào khớp bộ lọc đang đặt."
                    : "Không có đối tượng nào."}
                </td></tr>
              )}
            </tbody>
          </table>
        </TableScroll>
      </Card>

      {editing && (
        <EditModal kind={kind} row={editing} saving={saving}
          onClose={() => setEditing(null)} onSave={save} />
      )}
      {gen && (
        <GenerateModal state={gen} setState={setGen}
          onClose={() => setGen(null)} onDone={onReload} />
      )}
      {bulk && (
        <BulkModal count={picked.size} saving={saving}
          onClose={() => setBulk(false)} onApply={applyBulk} />
      )}
      {menu && (
        <FilterMenu
          label={FIELDS.find((f) => f.key === menu.key)?.label ?? menu.key}
          x={menu.x} y={menu.y}
          options={optionsOf(menu.key)}
          chosen={colFil[menu.key] ?? null}
          onClose={() => setMenu(null)}
          onSort={(dir) => { setSort({ key: menu.key, dir }); setMenu(null); }}
          onChange={(vals) => setColFil((p) => {
            const n = { ...p };
            if (vals === null) delete n[menu.key]; else n[menu.key] = vals;
            return n;
          })} />
      )}
    </div>
  );
}

/* ----------------------------------------------------------------
 * Bảng chọn giá trị của một cột — kiểu bộ lọc của Excel.
 *
 * Chốt hai điểm cho khớp thói quen dùng Excel:
 *   · chosen = null nghĩa là "lấy hết", KHÁC với chọn đủ mọi giá trị —
 *     vì dữ liệu đổi thì "lấy hết" vẫn đúng, còn danh sách chốt cứng
 *     sẽ âm thầm bỏ sót giá trị mới.
 *   · ô trống hiện là "(trống)" để chọn được, thay vì biến mất.
 * -------------------------------------------------------------- */
function FilterMenu({ label, x, y, options, chosen, onClose, onSort, onChange }: {
  label: string;
  x: number; y: number;
  options: { value: string; n: number }[];
  chosen: string[] | null;
  onClose: () => void;
  onSort: (dir: "asc" | "desc") => void;
  onChange: (vals: string[] | null) => void;
}) {
  const [find, setFind] = useState("");

  // Neo theo toạ độ lúc bấm, nên cuộn/đổi cỡ là toạ độ sai — đóng lại
  // thay vì để bảng chọn trôi lơ lửng giữa màn hình.
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("scroll", onClose, true);
    window.addEventListener("resize", onClose);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("scroll", onClose, true);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("keydown", esc);
    };
  }, [onClose]);

  const shown = options.filter((o) =>
    !find.trim() || (o.value || "(trống)").toLowerCase().includes(find.trim().toLowerCase()));
  const has = (v: string) => chosen === null || chosen.includes(v);
  const allShown = shown.length > 0 && shown.every((o) => has(o.value));

  const toggle = (v: string) => {
    const base = chosen ?? options.map((o) => o.value);
    const next = base.includes(v) ? base.filter((x) => x !== v) : [...base, v];
    onChange(next.length === options.length ? null : next);
  };

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 70 }} />
      <div style={{
        position: "fixed", zIndex: 71,
        left: Math.min(x, window.innerWidth - 286), top: y,
        width: 274, maxHeight: "min(400px, 70vh)",
        display: "flex", flexDirection: "column",
        background: "#fff", borderRadius: 14, fontFamily: TEXT,
        border: `1px solid ${C.pinkSoft}`, boxShadow: "0 12px 34px rgba(90,50,90,.20)",
      }}>
        <div style={{ padding: "10px 12px 8px", borderBottom: `1px solid ${C.pinkMist}` }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: C.plum, marginBottom: 7 }}>
            {label}
          </div>
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            <button onClick={() => onSort("asc")} style={miniBtn}>▲ Tăng dần</button>
            <button onClick={() => onSort("desc")} style={miniBtn}>▼ Giảm dần</button>
          </div>
          <input autoFocus value={find} onChange={(e) => setFind(e.target.value)}
            placeholder="Tìm trong danh sách…"
            style={{ width: "100%", padding: "6px 9px", borderRadius: 9, fontSize: 12,
                     fontFamily: TEXT, border: `1px solid ${C.pinkSoft}`, outline: "none" }} />
        </div>

        <label style={{ ...rowStyle, fontWeight: 700, color: C.plum,
                        borderBottom: `1px solid ${C.pinkMist}` }}>
          <input type="checkbox" checked={allShown}
            onChange={() => {
              if (find.trim()) {
                // Đang tìm: chỉ bật/tắt đúng những dòng đang hiện.
                const base = chosen ?? options.map((o) => o.value);
                const ids = shown.map((o) => o.value);
                const next = allShown ? base.filter((v) => !ids.includes(v))
                  : [...new Set([...base, ...ids])];
                onChange(next.length === options.length ? null : next);
              } else onChange(allShown ? [] : null);
            }} />
          {find.trim() ? "Chọn các dòng đang tìm" : "Chọn tất cả"}
          <span style={{ marginLeft: "auto", opacity: .6 }}>{shown.length}</span>
        </label>

        <div style={{ overflowY: "auto", flex: 1 }}>
          {shown.map((o) => (
            <label key={o.value} style={rowStyle}>
              <input type="checkbox" checked={has(o.value)} onChange={() => toggle(o.value)} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                             color: o.value ? C.plumSoft : C.plumSoft,
                             fontStyle: o.value ? "normal" : "italic" }}>
                {o.value || "(trống)"}
              </span>
              <span style={{ marginLeft: "auto", opacity: .55, fontSize: 11 }}>{o.n}</span>
            </label>
          ))}
          {shown.length === 0 && (
            <div style={{ padding: 14, fontSize: 12, color: C.plumSoft, textAlign: "center" }}>
              Không có giá trị nào khớp.
            </div>
          )}
        </div>

        <div style={{ padding: "8px 10px", borderTop: `1px solid ${C.pinkMist}`,
                      display: "flex", gap: 7 }}>
          <button onClick={() => { onChange(null); setFind(""); }} style={miniBtn}>
            Bỏ lọc cột này
          </button>
          <button onClick={onClose}
            style={{ ...miniBtn, marginLeft: "auto", background: C.plum,
                     color: "#fff", border: "none", fontWeight: 700 }}>
            Xong
          </button>
        </div>
      </div>
    </>
  );
}

const miniBtn: React.CSSProperties = {
  padding: "5px 9px", borderRadius: 8, cursor: "pointer", fontSize: 11.5,
  fontFamily: TEXT, border: `1px solid ${C.pinkSoft}`, background: "#fff", color: C.plum,
};

const rowStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 8, padding: "6px 12px",
  fontSize: 12, cursor: "pointer", color: C.plumSoft,
};

/* ----------------------------------------------------------------
 * Điền hàng loạt — gán một giá trị cho mọi dòng đang chọn.
 * Chỉ cho chọn cột sửa được (bỏ mã đối tượng và các cột khoá).
 * -------------------------------------------------------------- */
function BulkModal({ count, saving, onClose, onApply }: {
  count: number; saving: boolean;
  onClose: () => void;
  onApply: (key: string, value: string) => void | Promise<void>;
}) {
  const cols = FIELDS.filter((f) => !f.lockOnEdit);
  const [key, setKey] = useState(cols[0]?.key ?? "");
  const [value, setValue] = useState("");
  const f = cols.find((x) => x.key === key);

  return (
    <div onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(60,40,60,.32)",
               display: "grid", placeItems: "center", zIndex: 60, padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ background: "#fff", borderRadius: 18, padding: 20, width: "min(460px,96vw)",
                 border: `1px solid ${C.pinkMist}`, fontFamily: TEXT }}>
        <div style={{ fontFamily: NUM, fontSize: 18, fontWeight: 800, color: C.plum, marginBottom: 4 }}>
          Điền hàng loạt
        </div>
        <div style={{ fontSize: 12.5, color: C.plumSoft, marginBottom: 14 }}>
          Áp dụng cho <b>{count}</b> đối tượng đang chọn.
        </div>

        <label style={{ fontSize: 12, color: C.plumSoft }}>Cột</label>
        <select value={key} onChange={(e) => { setKey(e.target.value); setValue(""); }}
          style={{ width: "100%", padding: "9px 10px", borderRadius: 10, marginBottom: 12,
                   border: `1px solid ${C.pink}`, fontFamily: TEXT, fontSize: 13 }}>
          {cols.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>

        <label style={{ fontSize: 12, color: C.plumSoft }}>Giá trị</label>
        <input value={value} onChange={(e) => setValue(e.target.value)}
          inputMode={f?.num ? "numeric" : undefined}
          placeholder={f?.num ? "số" : "để trống = xoá nội dung"}
          style={{ width: "100%", padding: "9px 10px", borderRadius: 10, marginBottom: 18,
                   border: `1px solid ${C.pink}`, fontFamily: TEXT, fontSize: 13 }} />

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} disabled={saving}
            style={{ padding: "8px 14px", borderRadius: 10, cursor: "pointer",
                     border: `1px solid ${C.pink}`, background: "#fff",
                     color: C.plum, fontFamily: TEXT, fontSize: 13 }}>
            Huỷ
          </button>
          <button onClick={() => onApply(key, value)} disabled={saving || !key}
            style={{ padding: "8px 14px", borderRadius: 10, border: "none",
                     cursor: saving ? "wait" : "pointer", background: C.plum,
                     color: "#fff", fontFamily: TEXT, fontSize: 13, fontWeight: 600 }}>
            {saving ? "Đang lưu…" : "Áp dụng"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------
 * Sinh timeline — luôn XEM TRƯỚC rồi mới ghi.
 * Hàm DB idempotent: mã đã tồn tại thì bỏ qua, và không bao giờ đè lên
 * các cột tiến độ người dùng đã nhập tay.
 * ---------------------------------------------------------------- */
interface GenState { year: number | string; preview: GenerateTimelineResult | null }

function GenerateModal({ state, setState, onClose, onDone }: {
  state: GenState;
  setState: React.Dispatch<React.SetStateAction<GenState | null>>;
  onClose: () => void;
  onDone?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const r = state.preview;

  const run = async (commit: boolean) => {
    setBusy(true);
    try {
      const res = await generateTimeline(Number(state.year), commit);
      if (commit) {
        alert(res.msg || "Đã sinh timeline");
        onClose();
        if (onDone) onDone();
      } else {
        setState((p) => (p ? { ...p, preview: res } : p));
      }
    } catch (e) {
      alert("Lỗi: " + ((e as Error).message || "không rõ"));
    }
    setBusy(false);
  };

  return (
    <Modal onClose={onClose} icon={CalendarPlus} title="Sinh hạng mục timeline từ danh mục nguồn">
      <div style={{ fontSize: 13, color: C.plumSoft, fontFamily: TEXT, lineHeight: 1.55 }}>
        Sinh theo đúng luật VMP01: lọc đối tượng có <b>Thẩm định = y</b>, suy ra loại thẩm định
        theo phân loại, rồi tính lùi các mốc từ hạn hoàn thành (T).
        <br />
        Mã đã tồn tại sẽ được <b>bỏ qua</b> — không tạo trùng, không đè dữ liệu đã nhập.
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: C.plum, fontFamily: TEXT }}>Năm thẩm định</span>
        <input value={state.year} inputMode="numeric"
          onChange={(e) => setState((p) => ({ ...p, year: e.target.value, preview: null }))}
          style={{ width: 110, padding: "8px 10px", borderRadius: 10, fontFamily: TEXT, fontSize: 13, border: `1.5px solid ${C.pinkSoft}` }} />
      </label>

      {r && (
        <div style={{ marginTop: 14, padding: 12, borderRadius: 12, background: C.pinkMist, fontFamily: TEXT, fontSize: 13 }}>
          <div><b>{r.so_tao_moi}</b> hạng mục sẽ được tạo mới</div>
          <div style={{ color: C.plumSoft }}>{r.so_bo_qua} mã đã tồn tại → bỏ qua</div>
          {r.so_thieu_moc > 0 && (
            <div style={{ color: C.marigoldText, marginTop: 6 }}>
              ⚠️ {r.so_thieu_moc} hạng mục thiếu dữ liệu nguồn nên không tính được đủ mốc thời gian
              (sẽ tạo với ô ngày để trống).
            </div>
          )}
          {(r.so_chua_toi_chu_ky ?? 0) > 0 && (
            <div style={{ color: C.skyText, marginTop: 6 }}>
              ⏳ {r.so_chua_toi_chu_ky} đối tượng tần suất trên 12 tháng <b>chưa tới chu kỳ</b> nên
              được hoãn — đúng ý nghĩa "n năm thẩm định 1 lần":
              <div style={{ marginTop: 3, fontSize: 11.5, opacity: 0.9 }}>
                {(r.chua_toi_chu_ky ?? []).map((x) =>
                  `${x.object_code} (${x.tan_suat_thang} tháng · gần nhất ${x.moc_gan_nhat} → kỳ sau ${x.ky_ke_tiep})`
                ).join(" · ")}
              </div>
            </div>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
        <button onClick={onClose}
          style={{ ...btnPrimary, background: "#fff", color: C.plum, border: `1.5px solid ${C.pinkSoft}` }}>
          Đóng
        </button>
        <button onClick={() => run(false)} disabled={busy}
          style={{ ...btnPrimary, background: "#fff", color: C.plum, border: `1.5px solid ${C.pinkSoft}`, opacity: busy ? 0.6 : 1 }}>
          Xem trước
        </button>
        <button onClick={() => run(true)} disabled={busy || !r || !r.so_tao_moi}
          style={{ ...btnPrimary, opacity: (busy || !r || !r.so_tao_moi) ? 0.5 : 1 }}>
          {busy ? "Đang chạy…" : `Ghi ${r ? r.so_tao_moi : ""} hạng mục`}
        </button>
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------- */
function EditModal({ kind, row, saving, onClose, onSave }: {
  kind: ObjectKind;
  row: Partial<SourceObjectRow>;
  saving: boolean;
  onClose: () => void;
  onSave: (form: Record<string, unknown>) => void;
}) {
  const isNew = !row.id;
  const [form, setForm] = useState(() => {
    const f: Record<string, unknown> = {};
    const rec = row as Record<string, unknown>;
    for (const x of FIELDS) f[x.key] = rec[x.key] ?? "";
    return f;
  });
  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const submit = () => {
    if (!String(form.object_code || "").trim()) { alert("Phải nhập mã đối tượng."); return; }
    onSave(form);
  };

  return (
    <Modal onClose={onClose} wide icon={Boxes}
      title={`${isNew ? "Thêm" : "Sửa"} đối tượng — ${kind}`}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 12 }}>
        {FIELDS.map((f) => (
          <label key={f.key} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: C.plum, fontFamily: TEXT }}>
              {f.label}{f.required ? " *" : ""}
            </span>
            <input
              value={String(form[f.key] ?? "")}
              onChange={(e) => set(f.key, e.target.value)}
              disabled={!isNew && f.lockOnEdit}
              inputMode={f.num ? "numeric" : undefined}
              style={{
                padding: "8px 10px", borderRadius: 10, fontFamily: TEXT, fontSize: 13,
                border: `1.5px solid ${C.pinkSoft}`,
                background: (!isNew && f.lockOnEdit) ? C.pinkMist : "#fff",
              }} />
            {f.hint && (
              <span style={{ fontSize: 11, color: C.plumSoft, lineHeight: 1.35 }}>{f.hint}</span>
            )}
          </label>
        ))}
      </div>

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
        <button onClick={onClose}
          style={{ ...btnPrimary, background: "#fff", color: C.plum, border: `1.5px solid ${C.pinkSoft}` }}>
          Huỷ
        </button>
        <button onClick={submit} disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }}>
          {saving ? "Đang lưu…" : "Lưu"}
        </button>
      </div>
    </Modal>
  );
}

/* ================================================================
 * CÁC BỘ DỮ LIỆU ĐƠN GIẢN (một bảng phẳng, khoá là một cột)
 * ----------------------------------------------------------------
 * Ba bộ dưới đây trước chỉ nằm trong Google Sheet. Nay nhập/sửa/xoá
 * trực tiếp tại đây; Sheet chỉ còn là bản sao lưu.
 * ================================================================ */

interface SimpleField {
  key: string;
  label: string;
  w?: number;
  num?: boolean;
  bool?: boolean;
  /** Không cho sửa khi bản ghi đã tồn tại (thường là khoá). */
  lockOnEdit?: boolean;
  hint?: string;
}

interface DatasetSpec {
  id: string;
  label: string;
  icon: typeof Boxes;
  sub: string;
  /** Cột dùng làm khoá khi lưu/xoá. */
  keyField: string;
  fields: SimpleField[];
  load: () => Promise<Record<string, unknown>[]>;
  save: (key: string | null, patch: Record<string, unknown>) => Promise<unknown>;
  remove: (key: string) => Promise<unknown>;
  /** Cảnh báo hiển thị khi bảng rỗng. */
  emptyWarning?: string;
}

const DATASETS: DatasetSpec[] = [
  {
    id: "alerts",
    label: "Người nhận cảnh báo",
    icon: Bell,
    sub: "Ai nhận email khi hạng mục sắp/đã đến hạn — thay cho tab CanhBao trong Sheet",
    keyField: "id",
    emptyWarning: "Chưa có người nhận nào. Workflow cảnh báo dù bật cũng sẽ không gửi cho ai.",
    fields: [
      { key: "is_enabled", label: "Bật", w: 70, bool: true },
      { key: "email", label: "Email nhận", w: 210 },
      { key: "recipient_name", label: "Tên người nhận", w: 160 },
      { key: "scope_type", label: "Loại phạm vi", w: 130,
        hint: "tất cả · bộ phận · đối tượng — quyết định cách so khớp phạm vi." },
      { key: "scope", label: "Phạm vi", w: 130,
        hint: "Để trống nếu chọn 'tất cả'. Nếu 'bộ phận' thì ghi mã bộ phận; nếu 'đối tượng' thì ghi mã đối tượng." },
      { key: "alert_kind", label: "Loại cảnh báo", w: 130,
        hint: "quá hạn · sắp đến hạn · cả hai" },
      { key: "threshold_days", label: "Ngưỡng ngày", w: 110, num: true,
        hint: "Riêng cho 'sắp đến hạn'. Để trống = dùng mặc định 7 ngày." },
      { key: "note", label: "Ghi chú", w: 160 },
    ],
    load: () => fetchAlertRecipients() as unknown as Promise<Record<string, unknown>[]>,
    save: (key, patch) => upsertAlertRecipient(key, patch),
    remove: (key) => deleteAlertRecipient(key),
  },
  {
    id: "staff",
    label: "Danh bạ nhân sự",
    icon: Users,
    sub: "Nhân viên và email — thay cho tab Danh_sach_Email trong Sheet",
    keyField: "id",
    fields: [
      { key: "is_active", label: "Đang dùng", w: 90, bool: true },
      { key: "staff_name", label: "Nhân viên", w: 180 },
      { key: "email", label: "Email", w: 220 },
      { key: "department", label: "Bộ phận", w: 130 },
      { key: "note", label: "Ghi chú", w: 180 },
    ],
    load: () => fetchStaffEmails() as unknown as Promise<Record<string, unknown>[]>,
    save: (key, patch) => upsertStaffEmail(key, patch),
    remove: (key) => deleteStaffEmail(key),
  },
  {
    id: "products",
    label: "Sản phẩm GMP",
    icon: FlaskConical,
    sub: "Danh mục sản phẩm / cỡ lô — thay cho tab DM TDQTSX show GMP",
    keyField: "bfo_code",
    fields: [
      { key: "bfo_code", label: "Mã BFO", w: 120, lockOnEdit: true },
      { key: "product_name", label: "Tên sản phẩm", w: 200 },
      { key: "ingredients", label: "Thành phần", w: 180 },
      { key: "strength", label: "Hàm lượng", w: 120 },
      { key: "production_line", label: "Line sản xuất", w: 120 },
      { key: "dosage_form", label: "Dạng bào chế", w: 130 },
      { key: "primary_pack", label: "Quy cách sơ cấp", w: 150 },
      { key: "batch_size", label: "Cỡ lô chốt", w: 120 },
      { key: "mixing_tank", label: "Tank pha chế", w: 120 },
      { key: "final_batch_size", label: "Cỡ lô chốt cuối", w: 140 },
      { key: "note", label: "Ghi chú", w: 160 },
    ],
    load: () => fetchProductsGmp() as unknown as Promise<Record<string, unknown>[]>,
    save: (key, patch) => upsertProductGmp(String(patch.bfo_code ?? key ?? ""), patch),
    remove: (key) => deleteProductGmp(key),
  },
];

function SimpleDatasetView({ spec, canEdit }: { spec: DatasetSpec; canEdit: boolean }) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true); setErr("");
    try { setRows(await spec.load()); }
    catch (e) { setErr((e as Error).message || "Lỗi tải dữ liệu"); }
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [spec.id]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => spec.fields.some((f) => String(r[f.key] ?? "").toLowerCase().includes(s)));
  }, [rows, q, spec]);

  const save = async (form: Record<string, unknown>) => {
    setSaving(true);
    try {
      const patch: Record<string, unknown> = {};
      for (const f of spec.fields) {
        const raw = form[f.key];
        if (raw === undefined || raw === "") continue;
        patch[f.key] = f.num ? Number(raw) : f.bool ? raw === true || raw === "true" : String(raw);
      }
      const existingKey = editing && editing[spec.keyField] ? String(editing[spec.keyField]) : null;
      await spec.save(existingKey, patch);
      setEditing(null);
      await load();
    } catch (e) {
      alert("Lỗi lưu: " + ((e as Error).message || "không rõ"));
    }
    setSaving(false);
  };

  const remove = async (row: Record<string, unknown>) => {
    const label = String(row[spec.fields[1]?.key ?? spec.keyField] ?? "");
    if (!window.confirm(`Xoá "${label}"? Thao tác này không hoàn tác được.`)) return;
    try { await spec.remove(String(row[spec.keyField])); await load(); }
    catch (e) { alert("Lỗi: " + ((e as Error).message || "không rõ")); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Card>
        <CardTitle icon={spec.icon} sub={spec.sub}>{spec.label}</CardTitle>

        <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: "1 1 220px" }}>
            <Search size={15} color={C.plumSoft}
              style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm…"
              style={{ width: "100%", padding: "9px 10px 9px 32px", borderRadius: 12,
                       border: `1.5px solid ${C.pinkSoft}`, fontFamily: TEXT, fontSize: 13 }} />
          </div>
          <button onClick={load}
            style={{ ...btnPrimary, background: "#fff", color: C.plum, border: `1.5px solid ${C.pinkSoft}` }}>
            <RefreshCw size={15} /> Tải lại
          </button>
          {canEdit && (
            <button onClick={() => setEditing({})} style={btnPrimary}>
              <Plus size={15} /> Thêm dòng
            </button>
          )}
        </div>

        <div style={{ marginTop: 10, fontSize: 12.5, color: C.plumSoft, fontFamily: TEXT }}>
          {loading ? "Đang tải…" : `${filtered.length} / ${rows.length} dòng`}
        </div>

        {err && (
          <div style={{ marginTop: 10, padding: 10, borderRadius: 10, background: C.raspSoft,
                        color: C.raspText, fontSize: 13 }}>{err}</div>
        )}

        {!loading && rows.length === 0 && spec.emptyWarning && (
          <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 12, background: C.marigoldSoft,
                        color: C.marigoldText, fontSize: 12.5, fontFamily: TEXT,
                        display: "flex", gap: 8, alignItems: "flex-start" }}>
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>{spec.emptyWarning}</div>
          </div>
        )}
      </Card>

      <Card>
        <TableScroll>
          <table style={{ width: "100%", fontFamily: TEXT, fontSize: 12.5 }}>
            <thead>
              <tr>
                {spec.fields.map((f, i) => (
                  <th key={f.key} title={f.hint || undefined}
                    className={i === 0 ? "vmp-col-pin" : undefined}
                    style={{ textAlign: "left", padding: "9px 8px", whiteSpace: "nowrap",
                             color: C.plum, fontWeight: 800, minWidth: f.w,
                             cursor: f.hint ? "help" : "default" }}>
                    {f.label}{f.hint ? " ⓘ" : ""}
                  </th>
                ))}
                {canEdit && <th style={{ padding: "9px 8px" }} />}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={String(r[spec.keyField] ?? i)} style={{ borderBottom: `1px solid ${C.pinkMist}` }}>
                  {spec.fields.map((f, ci) => (
                    <td key={f.key} className={ci === 0 ? "vmp-col-pin" : undefined}
                      style={{ padding: "8px", whiteSpace: "nowrap", color: C.plumSoft }}>
                      {f.bool
                        ? <Tag color={r[f.key] ? C.mintText : C.plumSoft}
                               bg={r[f.key] ? C.mintSoft : C.pinkMist}>{r[f.key] ? "có" : "không"}</Tag>
                        : (r[f.key] as React.ReactNode ?? "—")}
                    </td>
                  ))}
                  {canEdit && (
                    <td style={{ padding: "8px", whiteSpace: "nowrap" }}>
                      <button onClick={() => setEditing(r)} title="Sửa"
                        style={{ border: "none", background: "transparent", cursor: "pointer", padding: 4 }}>
                        <Pencil size={15} color={C.plum} />
                      </button>
                      <button onClick={() => remove(r)} title="Xoá"
                        style={{ border: "none", background: "transparent", cursor: "pointer", padding: 4 }}>
                        <Trash2 size={15} color={C.raspText} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={spec.fields.length + 1}
                  style={{ padding: 20, textAlign: "center", color: C.plumSoft }}>Chưa có dòng nào.</td></tr>
              )}
            </tbody>
          </table>
        </TableScroll>
      </Card>

      {editing && (
        <SimpleEditModal spec={spec} row={editing} saving={saving}
          onClose={() => setEditing(null)} onSave={save} />
      )}
    </div>
  );
}

function SimpleEditModal({ spec, row, saving, onClose, onSave }: {
  spec: DatasetSpec;
  row: Record<string, unknown>;
  saving: boolean;
  onClose: () => void;
  onSave: (form: Record<string, unknown>) => void;
}) {
  const isNew = !row[spec.keyField];
  const [form, setForm] = useState<Record<string, unknown>>(() => {
    const f: Record<string, unknown> = {};
    for (const x of spec.fields) f[x.key] = row[x.key] ?? (x.bool ? true : "");
    return f;
  });
  const set = (k: string, v: unknown) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <Modal onClose={onClose} wide icon={spec.icon}
      title={`${isNew ? "Thêm" : "Sửa"} — ${spec.label}`}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 12 }}>
        {spec.fields.map((f) => (
          <label key={f.key} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: C.plum, fontFamily: TEXT }}>{f.label}</span>
            {f.bool ? (
              <select value={form[f.key] ? "true" : "false"}
                onChange={(e) => set(f.key, e.target.value === "true")}
                style={{ padding: "8px 10px", borderRadius: 10, fontFamily: TEXT, fontSize: 13,
                         border: `1.5px solid ${C.pinkSoft}` }}>
                <option value="true">Có</option>
                <option value="false">Không</option>
              </select>
            ) : (
              <input value={String(form[f.key] ?? "")}
                onChange={(e) => set(f.key, e.target.value)}
                disabled={!isNew && f.lockOnEdit}
                inputMode={f.num ? "numeric" : undefined}
                style={{ padding: "8px 10px", borderRadius: 10, fontFamily: TEXT, fontSize: 13,
                         border: `1.5px solid ${C.pinkSoft}`,
                         background: (!isNew && f.lockOnEdit) ? C.pinkMist : "#fff" }} />
            )}
            {f.hint && <span style={{ fontSize: 11, color: C.plumSoft, lineHeight: 1.35 }}>{f.hint}</span>}
          </label>
        ))}
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
        <button onClick={onClose}
          style={{ ...btnPrimary, background: "#fff", color: C.plum, border: `1.5px solid ${C.pinkSoft}` }}>Huỷ</button>
        <button onClick={() => onSave(form)} disabled={saving}
          style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }}>{saving ? "Đang lưu…" : "Lưu"}</button>
      </div>
    </Modal>
  );
}

/* ================================================================
 * Màn hình gộp: chuyển giữa các bộ dữ liệu
 * ================================================================ */
export default function DataWorkspaceView({ user, onReload }: {
  user?: AppUser | null; onReload?: () => void;
}) {
  const canEdit = user?.perm === "admin";
  const [tab, setTab] = useState("catalog");
  const spec = DATASETS.find((d) => d.id === tab);

  const TABS = [
    { id: "catalog", label: "Danh mục nguồn", icon: Boxes },
    ...DATASETS.map((d) => ({ id: d.id, label: d.label, icon: d.icon })),
    { id: "raw", label: "Tab thô (mọi tab)", icon: Table2 },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {TABS.map((t) => {
          const on = tab === t.id;
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ display: "flex", alignItems: "center", gap: 7,
                       padding: "9px 15px", borderRadius: 999, cursor: "pointer",
                       fontFamily: TEXT, fontSize: 13, fontWeight: on ? 800 : 600,
                       border: `1.5px solid ${on ? C.pink : C.pinkSoft}`,
                       background: on ? C.pinkSoft : "#fff",
                       color: on ? C.plum : C.plumSoft }}>
              <Icon size={15} /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === "catalog" ? <SourceCatalogSection user={user} onReload={onReload} />
        : tab === "raw"  ? <RawTabsView canEdit={canEdit} />
        : spec           ? <SimpleDatasetView spec={spec} canEdit={canEdit} />
        : null}
    </div>
  );
}

/* ================================================================
 * TAB THÔ — mọi tab của workbook, cột tự sinh từ payload
 * ----------------------------------------------------------------
 * Các tab như Mail_Log (18 cột), Giao việc (6), Rule VMP state (4),
 * 0.Rule timeline VMP (1) có số cột chênh nhau rất xa nên không dựng
 * bảng riêng; giữ payload jsonb và render cột động.
 * ================================================================ */
function RawTabsView({ canEdit }: { canEdit: boolean }) {
  const [tabs, setTabs] = useState<Array<{ source_tab: string; rows: number; columns: number }>>([]);
  const [tab, setTab] = useState("");
  const [rows, setRows] = useState<SourceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<SourceRow | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const list = await listSourceTabs();
        setTabs(list);
        if (list.length && !tab) setTab(list[0].source_tab);
      } catch (e) { setErr((e as Error).message); }
      setLoading(false);
    })();
    /* eslint-disable-next-line */
  }, []);

  const load = async () => {
    if (!tab) return;
    setLoading(true); setErr("");
    try { setRows(await fetchSourceRows(tab)); }
    catch (e) { setErr((e as Error).message || "Lỗi tải dữ liệu"); }
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [tab]);

  // Cột lấy hợp của mọi khoá xuất hiện — tab có dòng thiếu cột vẫn hiện đủ.
  const cols = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => Object.keys(r.payload || {}).forEach((k) => set.add(k)));
    return [...set];
  }, [rows]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) =>
      Object.values(r.payload || {}).some((v) => String(v ?? "").toLowerCase().includes(s)));
  }, [rows, q]);

  const save = async (payload: Record<string, unknown>, rowNumber: number | null) => {
    setSaving(true);
    try {
      await upsertSourceRow(tab, rowNumber, payload);
      setEditing(null);
      await load();
    } catch (e) { alert("Lỗi lưu: " + ((e as Error).message || "không rõ")); }
    setSaving(false);
  };

  const remove = async (r: SourceRow) => {
    if (!window.confirm(`Xoá dòng ${r.row_number} của "${tab}"? Không hoàn tác được.`)) return;
    try { await deleteSourceRow(tab, r.row_number); await load(); }
    catch (e) { alert("Lỗi: " + ((e as Error).message || "không rõ")); }
  };

  const meta = tabs.find((t) => t.source_tab === tab);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Card>
        <CardTitle icon={Table2}
          sub="Dữ liệu thô đúng như trong Google Sheet — cột tự sinh theo từng tab">
          Tab thô của workbook
        </CardTitle>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          {tabs.map((t) => {
            const on = t.source_tab === tab;
            return (
              <button key={t.source_tab} onClick={() => { setTab(t.source_tab); setQ(""); }}
                title={`${t.rows} dòng · ${t.columns} cột`}
                style={{ padding: "8px 13px", borderRadius: 12, cursor: "pointer",
                         fontFamily: TEXT, fontSize: 12.5, fontWeight: on ? 800 : 600,
                         border: `1.5px solid ${on ? C.pink : C.pinkSoft}`,
                         background: on ? C.pinkSoft : "#fff",
                         color: on ? C.plum : C.plumSoft }}>
                {t.source_tab}
                <span style={{ marginLeft: 7, fontSize: 11, opacity: 0.75 }}>{t.rows}</span>
              </button>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: "1 1 220px" }}>
            <Search size={15} color={C.plumSoft}
              style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm trong tab này…"
              style={{ width: "100%", padding: "9px 10px 9px 32px", borderRadius: 12,
                       border: `1.5px solid ${C.pinkSoft}`, fontFamily: TEXT, fontSize: 13 }} />
          </div>
          <button onClick={load}
            style={{ ...btnPrimary, background: "#fff", color: C.plum, border: `1.5px solid ${C.pinkSoft}` }}>
            <RefreshCw size={15} /> Tải lại
          </button>
          {canEdit && cols.length > 0 && (
            <button onClick={() => setEditing({ id: 0, source_tab: tab, row_number: 0, payload: {} })}
              style={btnPrimary}>
              <Plus size={15} /> Thêm dòng
            </button>
          )}
        </div>

        <div style={{ marginTop: 10, fontSize: 12.5, color: C.plumSoft, fontFamily: TEXT }}>
          {loading ? "Đang tải…"
            : `${filtered.length} / ${rows.length} dòng · ${cols.length} cột`}
          {meta ? ` · tab "${meta.source_tab}"` : ""}
        </div>

        {err && (
          <div style={{ marginTop: 10, padding: 10, borderRadius: 10, background: C.raspSoft,
                        color: C.raspText, fontSize: 13 }}>{err}</div>
        )}
      </Card>

      <Card>
        <TableScroll>
          <table style={{ fontFamily: TEXT, fontSize: 12.5 }}>
            <thead>
              <tr>
                <th className="vmp-col-pin"
                    style={{ textAlign: "left", padding: "9px 8px", whiteSpace: "nowrap",
                             color: C.plumSoft, fontWeight: 800 }}>#</th>
                {cols.map((c) => (
                  <th key={c} style={{ textAlign: "left", padding: "9px 8px", whiteSpace: "nowrap",
                                       color: C.plum, fontWeight: 800, minWidth: 130 }}>{c}</th>
                ))}
                {canEdit && <th style={{ padding: "9px 8px" }} />}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} style={{ borderBottom: `1px solid ${C.pinkMist}` }}>
                  <td className="vmp-col-pin"
                      style={{ padding: "8px", color: C.plumSoft, fontWeight: 700 }}>{r.row_number}</td>
                  {cols.map((c) => (
                    <td key={c} style={{ padding: "8px", color: C.plumSoft,
                                         maxWidth: 320, overflow: "hidden",
                                         textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                        title={String(r.payload?.[c] ?? "")}>
                      {String(r.payload?.[c] ?? "") || "—"}
                    </td>
                  ))}
                  {canEdit && (
                    <td style={{ padding: "8px", whiteSpace: "nowrap" }}>
                      <button onClick={() => setEditing(r)} title="Sửa"
                        style={{ border: "none", background: "transparent", cursor: "pointer", padding: 4 }}>
                        <Pencil size={15} color={C.plum} />
                      </button>
                      <button onClick={() => remove(r)} title="Xoá"
                        style={{ border: "none", background: "transparent", cursor: "pointer", padding: 4 }}>
                        <Trash2 size={15} color={C.raspText} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={cols.length + 2}
                  style={{ padding: 20, textAlign: "center", color: C.plumSoft }}>Không có dòng nào.</td></tr>
              )}
            </tbody>
          </table>
        </TableScroll>
      </Card>

      {editing && (
        <RawRowModal row={editing} cols={cols} saving={saving}
          onClose={() => setEditing(null)}
          onSave={(payload) => save(payload, editing.row_number || null)} />
      )}
    </div>
  );
}

function RawRowModal({ row, cols, saving, onClose, onSave }: {
  row: SourceRow;
  cols: string[];
  saving: boolean;
  onClose: () => void;
  onSave: (payload: Record<string, unknown>) => void;
}) {
  const isNew = !row.row_number;
  const [form, setForm] = useState<Record<string, string>>(() => {
    const f: Record<string, string> = {};
    for (const c of cols) f[c] = String(row.payload?.[c] ?? "");
    return f;
  });

  return (
    <Modal onClose={onClose} wide icon={Table2}
      title={`${isNew ? "Thêm dòng" : `Sửa dòng ${row.row_number}`} — ${row.source_tab}`}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
                    gap: 12, maxHeight: "58vh", overflowY: "auto" }} className="vmp-scroll">
        {cols.map((c) => (
          <label key={c} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: C.plum, fontFamily: TEXT }}>{c}</span>
            <input value={form[c] ?? ""}
              onChange={(e) => setForm((p) => ({ ...p, [c]: e.target.value }))}
              style={{ padding: "8px 10px", borderRadius: 10, fontFamily: TEXT, fontSize: 13,
                       border: `1.5px solid ${C.pinkSoft}` }} />
          </label>
        ))}
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
        <button onClick={onClose}
          style={{ ...btnPrimary, background: "#fff", color: C.plum, border: `1.5px solid ${C.pinkSoft}` }}>Huỷ</button>
        <button onClick={() => onSave(form)} disabled={saving}
          style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }}>{saving ? "Đang lưu…" : "Lưu"}</button>
      </div>
    </Modal>
  );
}

/* ----------------------------------------------------------------
 * Hộp cảnh báo. Phân biệt rõ hai loại để người đọc biết phải làm gì:
 *   tone="bad" — chắc chắn sai, phải sửa
 *   tone="ask" — cần người xem, máy KHÔNG tự quyết vì có thể đúng
 * ---------------------------------------------------------------- */
function WarnBox({ tone, title, body, items, more = 0 }: {
  tone: "bad" | "ask";
  title: string;
  body: string;
  items: string[];
  more?: number;
}) {
  const bad = tone === "bad";
  return (
    <div style={{
      marginTop: 10, padding: "10px 12px", borderRadius: 12,
      background: bad ? C.raspSoft : C.marigoldSoft,
      color: bad ? C.raspText : C.marigoldText,
      fontSize: 12.5, fontFamily: TEXT, display: "flex", gap: 8, alignItems: "flex-start",
    }}>
      <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
      <div style={{ minWidth: 0 }}>
        <b>{title}</b>
        <div style={{ marginTop: 2, fontWeight: 600, opacity: 0.92 }}>{body}</div>
        <div style={{ marginTop: 4, fontSize: 11.5, opacity: 0.85, wordBreak: "break-word" }}>
          {items.join(" · ")}{more > 0 ? ` … và ${more} đối tượng nữa` : ""}
        </div>
      </div>
    </div>
  );
}
