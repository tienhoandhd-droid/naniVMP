/* =====================================================================
 *  PhanQuyenPage.tsx — Danh bạ · phân quyền · phân công trách nhiệm
 *  ---------------------------------------------------------------------
 *  Một màn, năm khối, mỗi khối trả lời một câu khác nhau. Không gộp làm
 *  một vì gộp lại thì không câu nào trả lời rõ.
 *
 *   0 · DANH BẠ NGƯỜI THỰC HIỆN — "bộ phận nào có những ai"
 *       Chia theo bộ phận. Đây là nguồn nhân sự cho ma trận D: không có
 *       tên ở đây thì không tích được ô phân công nào.
 *
 *   A · VAI TRÒ × HÀNH ĐỘNG — "vai này được làm gì"
 *       Đọc và GHI thẳng vào bảng vmp_role_permissions, chính là bảng mà
 *       23 hàm RPC tra khi quyết định cho hay không cho. Trước migration
 *       20260801070000, luật này là hằng số cứng nằm rải trong thân hàm:
 *       màn hình chỉ chép lại được, sửa thì không.
 *
 *   B · NGƯỜI × BỘ PHẬN — "ai chịu trách nhiệm phần nào, và có quyền
 *       tương ứng chưa". Một ô nói cả hai điều: người này đang đứng tên
 *       bao nhiêu hạng mục ở bộ phận đó, VÀ luật hiện hành có cho họ sửa.
 *
 *   C · PHẠM VI CHI TIẾT — khu vực / line trong mỗi bộ phận.
 *       CHƯA dùng để phân quyền: luật hiện tại chỉ phân tới cấp BỘ PHẬN.
 *
 *   D · PHÂN CÔNG — nhân viên × loại thẩm định × line.
 *
 *  ---------------------------------------------------------------------
 *  CÁCH SỬA: tích chọn, rồi bấm LƯU.
 *
 *  Ô nào cũng là ô TÍCH CHỌN, không phải ô gõ chữ — trừ tên người và
 *  email, hai thứ không có danh sách để chọn. Tích chọn thì không sai
 *  chính tả, không có "QA" với "qa" là hai giá trị khác nhau, và bấm
 *  nhanh hơn hẳn khi phải đi qua vài chục ô một lượt.
 *
 *  Sửa xong KHÔNG tự lưu. Thay đổi nằm ở bản nháp, viền vàng, đếm ở thanh
 *  dưới mỗi bảng, và chỉ đi xuống database khi bấm Lưu. Lý do: đây là
 *  bảng phân quyền — người ta hay tích thử vài ô để xem hình dung ra sao
 *  rồi mới quyết. Tự lưu từng cú bấm nghĩa là mỗi lần tích thử là một lần
 *  đổi quyền thật, và nhật ký đầy những thay đổi không ai định làm.
 *
 *  Lưu xong luôn báo rõ: lưu được mấy ô, ô nào không lưu được và VÌ SAO.
 *  Ô hỏng giữ nguyên trong bản nháp kèm viền đỏ để sửa lại, không bị mất.
 * ===================================================================== */
import { useEffect, useMemo, useState } from "react";
import {
  ShieldCheck, Users, KeyRound, AlertTriangle, MapPin, Grid3x3,
  Save, Undo2, Check, Contact, Plus,
} from "lucide-react";
import { C, TEXT, NUM } from "../constants/theme.ts";
import { DEPTS } from "../constants/vmp.ts";
import { supabase } from "../lib/supabaseClient.ts";
import {
  setUserRole, upsertPerformer, fetchStaffEmails, fetchAssignments, setAssignment,
  fetchRolePermissions, setRolePermission, fetchPerformers,
} from "../lib/supabaseData.ts";
import type { AssignmentRow, RolePermRow } from "../lib/supabaseData.ts";
import { Card, CardTitle, Tag, CauKetLuan, GiaiThich } from "../components/ui/Primitives.tsx";
import type { Activity, AppUser, PerformerRow } from "../types/domain.ts";

/* ---------------------------------------------------------------------
 * A · LUẬT ĐANG CHẠY
 * ------------------------------------------------------------------- */
type Muc = "co" | "bo_phan" | "khong";

const VAI = [
  { id: "admin", ten: "admin", mo: "Quản trị hệ thống" },
  { id: "qa_manager", ten: "qa_manager", mo: "Phụ trách QA" },
  { id: "department_user", ten: "department_user", mo: "Người của một bộ phận" },
  { id: "viewer", ten: "viewer", mo: "Chỉ xem" },
] as const;

interface HanhDong {
  /** Khoá trong vmp_role_permissions. null = không nằm trong bảng luật. */
  id: string | null;
  ten: string;
  giaiThich: string;
  /** Các mức đặt được cho hành động này. */
  mucChoPhep: Muc[];
}

/* mucChoPhep phản ánh LUẬT CÓ VẾ GÌ, không phải ý muốn. Chỉ
   rpc_update_progress có vế so bộ phận, nên chỉ nó nhận "chỉ bộ phận
   mình". Cho hành động khác chọn mức đó thì hàm sẽ hiểu là "được" — mở
   toang trong khi màn hình ghi là hạn chế. rpc_set_role_permission cũng
   chặn ở phía server; đây chỉ là vế giao diện của cùng một luật. */
const HANH_DONG: HanhDong[] = [
  {
    id: null,
    ten: "Xem số liệu",
    giaiThich: "Mọi vai đã đăng nhập đều xem được toàn bộ số liệu. Quyền ĐỌC do Row Level Security của Postgres quyết định, không nằm trong bảng luật này — nên ô ở hàng này không sửa được ở đây. Muốn giới hạn ai xem được gì thì phải sửa policy RLS.",
    mucChoPhep: [],
  },
  {
    id: "update_progress",
    ten: "Cập nhật tiến độ",
    giaiThich: "rpc_update_progress. Đây là hành động DUY NHẤT có vế so bộ phận trong luật (so vmp_objects.department với profiles.department), nên cũng là hành động duy nhất đặt được mức 'Chỉ bộ phận mình'.",
    mucChoPhep: ["co", "bo_phan", "khong"],
  },
  {
    id: "set_item_state",
    ten: "Đổi trạng thái nghiệp vụ\n(Không áp dụng / Huỷ / Khôi phục)",
    giaiThich: "rpc_set_item_state — thao tác đưa hạng mục ra khỏi kế hoạch. Luật chưa có vế so bộ phận nên chỉ đặt được Được hoặc Không.",
    mucChoPhep: ["co", "khong"],
  },
  {
    id: "generate_timeline",
    ten: "Sinh timeline từ danh mục nguồn",
    giaiThich: "rpc_generate_timeline — sinh lại kế hoạch cả năm cho mọi bộ phận, nên không có vế bộ phận để so.",
    mucChoPhep: ["co", "khong"],
  },
  {
    id: "edit_catalog",
    ten: "Sửa danh mục nguồn · người thực hiện · phân công",
    giaiThich: "Cả họ rpc_upsert_* / rpc_delete_* (danh mục nguồn, danh bạ, người thực hiện, sản phẩm GMP, người nhận mail) và rpc_set_assignment của ma trận D — 20 hàm cùng đọc một dòng luật này.",
    mucChoPhep: ["co", "khong"],
  },
  {
    id: "admin_users",
    ten: "Quản trị người dùng, phân quyền",
    giaiThich: "rpc_set_user_role và chính rpc_set_role_permission. Ô của vai admin bị đóng băng ở 'Được': hạ nó xuống là tự khoá mình ra ngoài, không còn ai mở lại được.",
    mucChoPhep: ["co", "khong"],
  },
];

const O_QUYEN: Record<Muc, { chu: string; ky: string; mau: string; nen: string }> = {
  co: { chu: "Được", ky: "✓", mau: C.mintText, nen: C.mintSoft },
  bo_phan: { chu: "Chỉ bộ phận mình", ky: "◑", mau: C.marigoldText, nen: C.marigoldSoft },
  khong: { chu: "Không", ky: "✕", mau: C.plumSoft, nen: C.surfaceSunk },
};

/* Tám loại thẩm định đúng như luật VMP01 sinh ra, xếp theo trình tự vòng
   đời thiết bị rồi tới các loại độc lập — người ở xưởng đọc bảng này theo
   thứ tự việc xảy ra, không theo thứ tự từ điển. */
const LOAI_TD = ["DQ", "FAT/SAT", "IQ", "OQ", "PQ", "PV", "GSP", "GDP"] as const;

const VAI_O = {
  thuc_hien: { chu: "Thực hiện", ky: "●", mau: C.mintText, nen: C.mintSoft },
  ho_tro: { chu: "Hỗ trợ", ky: "○", mau: C.skyText, nen: C.skySoft },
} as const;

/* Danh bạ ghi bộ phận bằng đủ kiểu — "QA", "qa", "Xưởng sản xuất", "XSX".
   Không chuẩn hoá thì cùng một người rơi vào hai bộ phận khác nhau tuỳ
   nguồn, và bảng thiếu người mà không báo gì. */
function chuanBoPhan(v: unknown): string | null {
  const t = String(v ?? "").trim().toLowerCase();
  if (!t) return null;
  const d = DEPTS.find((x) => x.id === t
    || x.short.toLowerCase() === t
    || x.name.toLowerCase() === t
    || x.name.toLowerCase().startsWith(t));
  if (d) return d.id;
  if (/xưởng|xsx|sản xuất/.test(t)) return "xsx";
  if (/cơ điện|co dien|\bcd\b/.test(t)) return "cd";
  if (/kho|gsp/.test(t)) return "kho";
  if (/kiểm nghiệm|\bqc\b/.test(t)) return "qc";
  if (/nghiên cứu|\brd\b|r&d/.test(t)) return "rd";
  if (/\bqa\b|chất lượng/.test(t)) return "qa";
  return null;
}

/** "—", "-", "·" là ký tự lấp ô trống của Sheet, không phải tên người. */
const laTenThat = (t: string) => !!t && t !== "(chưa phân công)" && !/^[-–—.·\s]+$/.test(t);

interface NhanSu { ten: string; email: string | null; boPhan: string | null }
interface HoSo {
  id: string; full_name: string | null; email: string | null;
  role: string; department: string | null; is_active: boolean | null;
}

/* ---------------------------------------------------------------------
 * Ô TÍCH — dùng chung cho mọi bảng sửa được
 * ------------------------------------------------------------------- */
function OTich({ ky, chu, mau, nen, khoa, nhap, hong, onClick, nhan }: {
  ky: string; chu: string; mau: string; nen: string;
  /** Không sửa được (thiếu quyền, hoặc ô bị đóng băng). */
  khoa?: boolean;
  /** Đang có thay đổi chưa lưu. */
  nhap?: boolean;
  /** Lần lưu gần nhất ô này báo lỗi. */
  hong?: string;
  onClick?: () => void;
  nhan: string;
}) {
  return (
    <button type="button" onClick={onClick} disabled={khoa}
      className={`pq-tich${nhap ? " la-nhap" : ""}${hong ? " la-hong" : ""}`}
      aria-label={`${nhan}: ${chu}${nhap ? " (chưa lưu)" : ""}${hong ? ` (lỗi: ${hong})` : ""}`}
      title={hong ? `${nhan}\n${chu}\nKhông lưu được: ${hong}` : `${nhan}\n${chu}${khoa ? "" : "\nBấm để đổi"}`}
      style={{ background: nen, color: mau }}>
      <span aria-hidden="true">{ky}</span>
    </button>
  );
}

/* Nhóm chip chọn-một. Dùng thay ô sổ xuống ở những chỗ chỉ có vài lựa
   chọn: thấy hết phương án cùng lúc, một cú bấm là xong, và ô nào đang
   chọn thì nhìn là biết mà không phải mở ra xem. */
function NhomChip({ ds, dangChon, khoa, nhap, hong, onChon, nhan }: {
  ds: Array<{ id: string; nhan: string; mo?: string }>;
  dangChon: string;
  khoa?: boolean;
  nhap?: boolean;
  hong?: string;
  onChon: (id: string) => void;
  nhan: string;
}) {
  return (
    <div className="pq-nhom" role="group" aria-label={nhan}>
      {ds.map((x) => {
        const chon = dangChon === x.id;
        return (
          <button key={x.id || "trong"} type="button"
            className={`pq-chip${chon ? " la-chon" : ""}${chon && nhap ? " la-nhap" : ""}${chon && hong ? " la-hong" : ""}`}
            disabled={khoa} aria-pressed={chon}
            aria-label={`${nhan}: ${x.nhan}${chon ? " (đang chọn)" : ""}${chon && nhap ? " (chưa lưu)" : ""}`}
            title={`${nhan} → ${x.mo || x.nhan}${chon && hong ? `\nKhông lưu được: ${hong}` : ""}`}
            onClick={() => onChon(x.id)}>
            {x.nhan}
          </button>
        );
      })}
    </div>
  );
}

/* Thanh Lưu dùng chung. Luôn hiện — kể cả khi chưa có thay đổi nào — để
   người dùng biết ngay bảng này là bảng phải bấm Lưu, thay vì đi tìm nút
   lúc đã sửa xong và không thấy đâu. */
function ThanhLuu({ soThayDoi, dangLuu, ketQua, onLuu, onHoanTac, khoa, ghiChu }: {
  soThayDoi: number;
  dangLuu: boolean;
  ketQua: { xong: number; tong: number; loi: string[] } | null;
  onLuu: () => void;
  onHoanTac: () => void;
  khoa?: boolean;
  ghiChu?: string;
}) {
  return (
    <div className="pq-thanhluu">
      <div className="pq-thanhluu-chu" aria-live="polite">
        {khoa ? (
          <span>Bảng chỉ để xem — bạn không có quyền sửa mục này.</span>
        ) : soThayDoi > 0 ? (
          <span className="pq-cho">
            <b className="tnum" style={{ fontFamily: NUM }}>{soThayDoi}</b>&nbsp;thay đổi chưa lưu
          </span>
        ) : ketQua && !ketQua.loi.length ? (
          <span className="pq-xong">
            <Check size={15} /> Đã lưu {ketQua.xong}/{ketQua.tong} thay đổi xuống database
          </span>
        ) : (
          <span>{ghiChu || "Tích chọn để sửa, xong thì bấm Lưu."}</span>
        )}
      </div>

      {ketQua && ketQua.loi.length > 0 && (
        <div className="pq-loi" role="alert">
          <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <b>Lưu được {ketQua.xong}/{ketQua.tong}. Không lưu được {ketQua.loi.length}:</b>
            <ul>{ketQua.loi.map((t, i) => <li key={i}>{t}</li>)}</ul>
            Ô hỏng vẫn giữ nguyên thay đổi của bạn (viền đỏ) để sửa lại rồi lưu tiếp.
          </div>
        </div>
      )}

      {!khoa && (
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="pq-nut" onClick={onHoanTac} disabled={!soThayDoi || dangLuu}>
            <Undo2 size={15} /> Hoàn tác
          </button>
          <button type="button" className="pq-nut la-chinh" onClick={onLuu} disabled={!soThayDoi || dangLuu}>
            <Save size={15} /> {dangLuu ? "Đang lưu…" : `Lưu${soThayDoi ? ` ${soThayDoi}` : ""}`}
          </button>
        </div>
      )}
    </div>
  );
}

type KetQuaLuu = { xong: number; tong: number; loi: string[] } | null;

export default function PhanQuyenView(
  { acts, isAdmin = false, user }: { acts: Activity[]; isAdmin?: boolean; user?: AppUser | null },
) {
  const [performers, setPerformers] = useState<PerformerRow[]>([]);
  const [hoSo, setHoSo] = useState<HoSo[]>([]);
  const [loi, setLoi] = useState("");
  const [moPhamVi, setMoPhamVi] = useState<string>("");
  const [danhBa, setDanhBa] = useState<NhanSu[]>([]);
  const [phanCong, setPhanCong] = useState<AssignmentRow[]>([]);
  const [quyenA, setQuyenA] = useState<RolePermRow[]>([]);
  const [bpChon, setBpChon] = useState("xsx");
  const [lineChon, setLineChon] = useState("*");
  const [loiD, setLoiD] = useState("");
  const [nguoiMoi, setNguoiMoi] = useState({ ten: "", email: "", bp: "" });

  /* Bản nháp: KHOÁ Ô → giá trị mới. Các bảng dùng chung một map, phân
     biệt bằng tiền tố khoá. Một map thì "có thay đổi nào chưa lưu không"
     là một câu hỏi duy nhất, không phải bốn câu phải nhớ đồng bộ. */
  const [nhap, setNhap] = useState<Record<string, string>>({});
  const [oHong, setOHong] = useState<Record<string, string>>({});
  const [dangLuu, setDangLuu] = useState("");
  const [ketQua, setKetQua] = useState<Record<string, KetQuaLuu>>({});

  const dat = (khoa: string, gt: string) => setNhap((c) => ({ ...c, [khoa]: gt }));
  const xoaNhap = (khoa: string) => setNhap((c) => { const n = { ...c }; delete n[khoa]; return n; });
  const xoaHong = (khoa: string) => setOHong((c) => { const n = { ...c }; delete n[khoa]; return n; });
  const demNhap = (...tienTo: string[]) =>
    Object.keys(nhap).filter((k) => tienTo.some((t) => k.startsWith(t))).length;
  const boNhap = (mocKetQua: string, ...tienTo: string[]) => {
    const giu = (k: string) => !tienTo.some((t) => k.startsWith(t));
    setNhap((c) => Object.fromEntries(Object.entries(c).filter(([k]) => giu(k))));
    setOHong((c) => Object.fromEntries(Object.entries(c).filter(([k]) => giu(k))));
    setKetQua((c) => ({ ...c, [mocKetQua]: null }));
  };

  /** Gom kết quả của một lượt lưu rồi ghi lại bản nháp: ô lưu được thì bỏ
   *  khỏi nháp, ô hỏng thì giữ nguyên kèm lý do. */
  const chotLuot = (
    mocKetQua: string, tienTo: string[], tong: number, xong: number,
    loiDs: string[], giu: Record<string, string>, hong: Record<string, string>,
  ) => {
    const laCua = (k: string) => tienTo.some((t) => k.startsWith(t));
    setNhap((c) => ({ ...Object.fromEntries(Object.entries(c).filter(([k]) => !laCua(k))), ...giu }));
    setOHong((c) => ({ ...Object.fromEntries(Object.entries(c).filter(([k]) => !laCua(k))), ...hong }));
    setKetQua((c) => ({ ...c, [mocKetQua]: { xong, tong, loi: loiDs } }));
  };

  const quyenSuaA = (isAdmin || user?.role === "admin") && !!supabase;
  const suaQuyenDuoc = quyenSuaA;
  /* Danh bạ và ma trận D mở hơn một bậc: rpc_upsert_performer và
     rpc_set_assignment nhận cả qa_manager, vì phân công việc là việc của
     QA chứ không riêng quản trị hệ thống. */
  const suaPhanCongDuoc = (isAdmin || user?.role === "qa_manager") && !!supabase;

  /* ---------------- nạp dữ liệu ---------------- */
  const taiHoSo = async () => {
    if (!supabase) return;
    const { data } = await supabase.from("profiles")
      .select("id,full_name,email,role,department,is_active");
    setHoSo((data || []) as HoSo[]);
  };
  const taiNguoiThucHien = async () => {
    try { setPerformers((await fetchPerformers()).filter((r) => r.is_active)); }
    catch (e) { setLoiD((e as Error).message); }
  };

  useEffect(() => {
    if (!supabase) { setLoi("Chưa nối Supabase nên chưa đọc được danh sách người dùng."); return; }
    supabase.from("profiles").select("id,full_name,email,role,department,is_active")
      .then(({ data, error }) => {
        if (error) setLoi(error.message);
        else setHoSo((data || []) as HoSo[]);
      });
    fetchRolePermissions().then(setQuyenA).catch((e) => setLoi((e as Error).message));
    taiNguoiThucHien();
    fetchStaffEmails()
      .then((rows) => setDanhBa(rows
        .filter((r) => r.is_active !== false)
        .map((r) => ({
          ten: String(r.staff_name || "").trim(),
          email: r.email || null,
          boPhan: chuanBoPhan(r.department),
        }))
        .filter((r) => laTenThat(r.ten))))
      .catch((e) => setLoiD((e as Error).message));
    fetchAssignments().then(setPhanCong).catch((e) => setLoiD((e as Error).message));
  }, []);

  /* ================= 0 · DANH BẠ NGƯỜI THỰC HIỆN ================= */
  const bpNguoi = (p: PerformerRow) => nhap[`Nb|${p.id}`] ?? (chuanBoPhan(p.department) || "");
  const emailNguoi = (p: PerformerRow) => nhap[`Ne|${p.id}`] ?? (p.email || "");

  const bamBpNguoi = (p: PerformerRow, bp: string) => {
    const k = `Nb|${p.id}`;
    if (bp === (chuanBoPhan(p.department) || "")) xoaNhap(k); else dat(k, bp);
    xoaHong(k);
  };

  const theoBoPhan = useMemo(() => {
    const m = new Map<string, PerformerRow[]>();
    DEPTS.forEach((d) => m.set(d.id, []));
    m.set("", []);
    for (const p of performers) {
      const bp = bpNguoi(p);
      if (!m.has(bp)) m.set(bp, []);
      m.get(bp)!.push(p);
    }
    m.forEach((ds) => ds.sort((a, b) =>
      String(a.performer_name).localeCompare(String(b.performer_name), "vi")));
    return m;
  }, [performers, nhap]);

  const themNguoi = async () => {
    const ten = nguoiMoi.ten.trim();
    if (!laTenThat(ten)) return;
    setDangLuu("N");
    try {
      const r = await upsertPerformer(null, {
        performer_name: ten,
        email: nguoiMoi.email.trim() || null,
        department: nguoiMoi.bp || null,
      });
      if (r.ok) {
        setNguoiMoi({ ten: "", email: "", bp: "" });
        await taiNguoiThucHien();
        setKetQua((c) => ({ ...c, N: { xong: 1, tong: 1, loi: [] } }));
      } else {
        setKetQua((c) => ({ ...c, N: { xong: 0, tong: 1, loi: [`Thêm ${ten}: ${r.error}`] } }));
      }
    } catch (e) {
      setKetQua((c) => ({ ...c, N: { xong: 0, tong: 1, loi: [`Thêm ${ten}: ${(e as Error).message}`] } }));
    }
    setDangLuu("");
  };

  const luuDanhBa = async () => {
    const ids = new Set<string>();
    Object.keys(nhap).forEach((k) => {
      if (k.startsWith("Nb|") || k.startsWith("Ne|")) ids.add(k.slice(3));
    });
    setDangLuu("N");
    let xong = 0; const loiDs: string[] = [];
    const hong: Record<string, string> = {}; const giu: Record<string, string> = {};
    for (const id of ids) {
      const p = performers.find((x) => String(x.id) === id);
      if (!p) continue;
      try {
        const r = await upsertPerformer(id, {
          performer_name: p.performer_name,
          department: bpNguoi(p) || null,
          email: emailNguoi(p).trim() || null,
        });
        if (r.ok) xong++;
        else {
          loiDs.push(`${p.performer_name}: ${r.error}`);
          for (const t of ["Nb", "Ne"]) {
            const k = `${t}|${id}`;
            if (nhap[k] != null) { hong[k] = r.error || "lỗi"; giu[k] = nhap[k]; }
          }
        }
      } catch (e) {
        loiDs.push(`${p.performer_name}: ${(e as Error).message}`);
        for (const t of ["Nb", "Ne"]) {
          const k = `${t}|${id}`;
          if (nhap[k] != null) { hong[k] = (e as Error).message; giu[k] = nhap[k]; }
        }
      }
    }
    chotLuot("N", ["Nb|", "Ne|"], ids.size, xong, loiDs, giu, hong);
    await taiNguoiThucHien();
    setDangLuu("");
  };

  /* ================= A ================= */
  const mucGoc = (hd: string, vai: string): Muc =>
    (quyenA.find((q) => q.hanh_dong === hd && q.vai_tro === vai)?.muc as Muc) || "khong";
  const khoaA = (hd: string, vai: string) => `A|${hd}|${vai}`;
  const mucHienTai = (hd: string, vai: string): Muc =>
    (nhap[khoaA(hd, vai)] as Muc) ?? mucGoc(hd, vai);

  const bamA = (h: HanhDong, vai: string) => {
    if (!h.id || !h.mucChoPhep.length) return;
    const vong = h.mucChoPhep;
    const nay = mucHienTai(h.id, vai);
    const sau = vong[(Math.max(0, vong.indexOf(nay)) + 1) % vong.length];
    const k = khoaA(h.id, vai);
    if (sau === mucGoc(h.id, vai)) xoaNhap(k); else dat(k, sau);
    xoaHong(k);
  };

  const luuA = async () => {
    const ds = Object.entries(nhap).filter(([k]) => k.startsWith("A|"));
    setDangLuu("A");
    let xong = 0; const loiDs: string[] = [];
    const hong: Record<string, string> = {}; const giu: Record<string, string> = {};
    for (const [k, v] of ds) {
      const [, hd, vai] = k.split("|");
      const ten = HANH_DONG.find((h) => h.id === hd)?.ten.replace("\n", " ") || hd;
      try {
        const r = await setRolePermission(hd, vai, v as Muc);
        if (r.ok) xong++;
        else { loiDs.push(`${ten} × ${vai}: ${r.error}`); hong[k] = r.error || "lỗi"; giu[k] = v; }
      } catch (e) {
        loiDs.push(`${ten} × ${vai}: ${(e as Error).message}`);
        hong[k] = (e as Error).message; giu[k] = v;
      }
    }
    chotLuot("A|", ["A|"], ds.length, xong, loiDs, giu, hong);
    try { setQuyenA(await fetchRolePermissions()); } catch { /* giữ bản cũ */ }
    setDangLuu("");
  };

  /* ================= B ================= */
  const { hang, tongTheoBp } = useMemo(() => {
    const song = acts.filter((a) => (a.state || "active") === "active");
    const dem = new Map<string, Map<string, number>>();
    const tongBp = new Map<string, number>();
    for (const a of song) {
      const tho = String(a.owner || "").trim();
      const ten = laTenThat(tho) ? tho : "(chưa phân công)";
      const ds = (a.depts && a.depts.length ? a.depts : [a.dept || "qa"]).filter(Boolean) as string[];
      if (!dem.has(ten)) dem.set(ten, new Map());
      for (const d of ds) {
        dem.get(ten)!.set(d, (dem.get(ten)!.get(d) || 0) + 1);
        tongBp.set(d, (tongBp.get(d) || 0) + 1);
      }
    }

    /* Gộp BA nguồn tên người, vì mỗi nguồn thiếu một mảnh:
       · profiles       — ai đăng nhập được (có người chưa từng đứng tên)
       · vmp_performers — ai được khai là người thực hiện
       · owner_name     — ai đang THẬT SỰ đứng tên hạng mục
       Chỉ nhìn một nguồn thì không thấy khoảng hở giữa chúng, mà khoảng
       hở đó mới là thứ đáng lo. */
    const ten = new Set<string>();
    hoSo.forEach((h) => { const t = (h.full_name || "").trim(); if (laTenThat(t)) ten.add(t); });
    performers.forEach((p) => { const t = String(p.performer_name || "").trim(); if (laTenThat(t)) ten.add(t); });
    dem.forEach((_v, k) => { if (k !== "(chưa phân công)") ten.add(k); });

    const chuan = (s: string) => s.trim().toLowerCase();
    const hangs = [...ten].map((t) => {
      const h = hoSo.find((x) => chuan(x.full_name || "") === chuan(t));
      const p = performers.find((x) => chuan(String(x.performer_name || "")) === chuan(t));
      const theoBp = dem.get(t) || new Map<string, number>();
      const tong = [...theoBp.values()].reduce((s, n) => s + n, 0);
      return {
        ten: t,
        tkId: (h?.id as string | undefined) || null,
        pid: (p?.id as string | undefined) || null,
        vai: h?.role || null,
        boPhanTaiKhoan: h?.department || null,
        coTaiKhoan: !!h,
        /* Hai email KHÁC NHAU, không được lẫn: emailTK là email đăng nhập
           (ở auth, đổi ở đây vô nghĩa), emailTH là email nhận cảnh báo
           trong vmp_performers — đó mới là cái sửa được. */
        emailTK: h?.email || null,
        emailTH: (p?.email as string | undefined) || null,
        theoBp, tong,
      };
    }).sort((a, b) => b.tong - a.tong || a.ten.localeCompare(b.ten, "vi"));

    const voChu = dem.get("(chưa phân công)");
    if (voChu) {
      hangs.push({
        ten: "(chưa phân công)", tkId: null, pid: null, vai: null, boPhanTaiKhoan: null,
        coTaiKhoan: false, emailTK: null, emailTH: null,
        theoBp: voChu, tong: [...voChu.values()].reduce((s, n) => s + n, 0),
      });
    }
    return { hang: hangs, tongTheoBp: tongBp };
  }, [acts, hoSo, performers]);

  type HangB = typeof hang[number];
  const vaiHienTai = (r: HangB) => nhap[`Bv|${r.tkId}`] ?? r.vai ?? "";
  const bpHienTai = (r: HangB) => nhap[`Bd|${r.tkId}`] ?? r.boPhanTaiKhoan ?? "";
  const emailHienTai = (r: HangB) => nhap[`Be|${r.ten}`] ?? r.emailTH ?? "";

  const bamB = (r: HangB, loai: "v" | "d", gt: string) => {
    if (!r.tkId) return;
    const k = `B${loai}|${r.tkId}`;
    const goc = loai === "v" ? (r.vai || "") : (r.boPhanTaiKhoan || "");
    /* Bấm lại đúng giá trị đang lưu = bỏ thay đổi, không phải lưu lại y
       nguyên. Nếu không, số "thay đổi chưa lưu" sẽ nói dối. */
    if (gt === goc) xoaNhap(k); else dat(k, gt);
    xoaHong(k);
  };

  const luuB = async () => {
    setDangLuu("B");
    const ids = new Set<string>();
    Object.keys(nhap).forEach((k) => {
      if (k.startsWith("Bv|") || k.startsWith("Bd|")) ids.add(k.slice(3));
    });
    const emails = Object.entries(nhap).filter(([k]) => k.startsWith("Be|"));
    const tong = ids.size + emails.length;
    let xong = 0; const loiDs: string[] = [];
    const hong: Record<string, string> = {}; const giu: Record<string, string> = {};

    for (const id of ids) {
      const r = hang.find((x) => x.tkId === id);
      if (!r) continue;
      const ghiHong = (msg: string) => {
        loiDs.push(`${r.ten}: ${msg}`);
        for (const t of ["Bv", "Bd"]) {
          const k = `${t}|${id}`;
          if (nhap[k] != null) { hong[k] = msg; giu[k] = nhap[k]; }
        }
      };
      try {
        const kq = await setUserRole(id, vaiHienTai(r) || "viewer", bpHienTai(r) || null,
          `Đổi phân quyền cho ${r.ten} từ màn Phân quyền`);
        if (kq.ok) xong++; else ghiHong(kq.error || "lỗi");
      } catch (e) { ghiHong((e as Error).message); }
    }

    for (const [k, v] of emails) {
      const ten = k.slice(3);
      const r = hang.find((x) => x.ten === ten);
      try {
        const kq = await upsertPerformer(r?.pid || null,
          { performer_name: ten, email: v.trim() || null });
        if (kq.ok) xong++;
        else { loiDs.push(`Email ${ten}: ${kq.error}`); hong[k] = kq.error || "lỗi"; giu[k] = v; }
      } catch (e) {
        loiDs.push(`Email ${ten}: ${(e as Error).message}`);
        hong[k] = (e as Error).message; giu[k] = v;
      }
    }

    chotLuot("B", ["Bv|", "Bd|", "Be|"], tong, xong, loiDs, giu, hong);
    await taiHoSo();
    await taiNguoiThucHien();
    setDangLuu("");
  };

  /* Khoảng hở đáng lo nhất: đứng tên hạng mục mà không có tài khoản. */
  const thieuTaiKhoan = hang.filter((h) => h.ten !== "(chưa phân công)" && h.tong > 0 && !h.coTaiKhoan);
  const thieuEmail = hang.filter((h) => h.ten !== "(chưa phân công)" && h.tong > 0 && !h.emailTK && !h.emailTH);
  const adminKhongBoPhan = hoSo.filter((h) => h.role === "department_user" && !h.department);

  const ketLuan = useMemo(() => {
    if (loi) return { chinh: "Chưa đọc được danh sách người dùng.", phu: loi, tone: "warn" as const };
    if (!hoSo.length) return { chinh: "Đang đọc danh sách người dùng…", phu: "", tone: "ok" as const };
    const soHm = thieuTaiKhoan.reduce((s, h) => s + h.tong, 0);
    if (thieuTaiKhoan.length) {
      return {
        chinh: `${thieuTaiKhoan.length} người đang đứng tên ${soHm} hạng mục nhưng CHƯA CÓ TÀI KHOẢN — họ không tự cập nhật được việc của mình.`,
        phu: `${thieuTaiKhoan.map((h) => `${h.ten} (${h.tong})`).join(" · ")}. `
          + `Đây là lý do phần lớn hạng mục phải nhờ người khác nhập hộ, và nhập hộ thì cột "người sửa" trong nhật ký không còn đúng người làm.`,
        tone: "over" as const,
      };
    }
    return {
      chinh: `${hoSo.length} tài khoản, ${hang.filter((h) => h.tong > 0).length} người đang đứng tên hạng mục — ai cũng có tài khoản.`,
      phu: "Kiểm tiếp cột vai trò: department_user mà thiếu bộ phận thì không sửa được hạng mục nào.",
      tone: "ok" as const,
    };
  }, [loi, hoSo, hang, thieuTaiKhoan]);

  /* ================= C ================= */
  const phamVi = useMemo(() => {
    const m = new Map<string, { khuVuc: Map<string, number>; line: Map<string, number> }>();
    for (const a of acts) {
      if ((a.state || "active") !== "active") continue;
      const ds = (a.depts && a.depts.length ? a.depts : [a.dept || "qa"]).filter(Boolean) as string[];
      const kv = String((a as Record<string, unknown>).area ?? "").trim() || "(chưa khai)";
      const ln = String(((a._raw || {}) as Record<string, unknown>).line ?? "").trim() || "(chưa khai)";
      for (const d of ds) {
        if (!m.has(d)) m.set(d, { khuVuc: new Map(), line: new Map() });
        const o = m.get(d)!;
        o.khuVuc.set(kv, (o.khuVuc.get(kv) || 0) + 1);
        o.line.set(ln, (o.line.get(ln) || 0) + 1);
      }
    }
    return m;
  }, [acts]);

  /* ================= D ================= */
  const thanhVien = useMemo(() => {
    const m = new Map<string, { ten: string; email: string | null; nguon: Set<string> }>();
    const them = (ten: string, email: string | null, nguon: string) => {
      const t = ten.trim();
      if (!laTenThat(t)) return;
      const k = t.toLowerCase();
      if (!m.has(k)) m.set(k, { ten: t, email, nguon: new Set() });
      const o = m.get(k)!;
      if (!o.email && email) o.email = email;
      o.nguon.add(nguon);
    };
    danhBa.forEach((n) => { if (n.boPhan === bpChon) them(n.ten, n.email, "danh bạ"); });
    performers.forEach((p) => {
      if (bpNguoi(p) === bpChon) them(String(p.performer_name || ""), (p.email as string) || null, "người thực hiện");
    });
    hoSo.forEach((h) => {
      if (chuanBoPhan(h.department) === bpChon) them(h.full_name || "", h.email, "tài khoản");
    });
    hang.forEach((h) => {
      if ((h.theoBp.get(bpChon) || 0) > 0) them(h.ten, h.emailTH || h.emailTK, "đang đứng tên");
    });
    return [...m.values()].sort((a, b) => a.ten.localeCompare(b.ten, "vi"));
  }, [danhBa, performers, hoSo, hang, bpChon, nhap]);

  const dsLine = useMemo(() => {
    const o = phamVi.get(bpChon);
    if (!o) return [] as Array<[string, number]>;
    return [...o.line.entries()].filter(([k]) => k !== "(chưa khai)").sort((a, b) => b[1] - a[1]);
  }, [phamVi, bpChon]);

  useEffect(() => { setLineChon("*"); }, [bpChon]);

  const gocPhanCong = useMemo(() => {
    const m = new Map<string, AssignmentRow["vai_tro"]>();
    for (const r of phanCong) {
      m.set(`${r.staff_name.trim().toLowerCase()}|${r.validation_type}|${r.line}`, r.vai_tro);
    }
    return m;
  }, [phanCong]);

  const khoaD = (ten: string, loai: string) => `D|${ten.trim().toLowerCase()}|${loai}|${lineChon}`;
  const pcGoc = (ten: string, loai: string) =>
    gocPhanCong.get(`${ten.trim().toLowerCase()}|${loai}|${lineChon}`) || "";
  const pcHienTai = (ten: string, loai: string): "" | "thuc_hien" | "ho_tro" => {
    const k = khoaD(ten, loai);
    if (nhap[k] != null) return nhap[k] as "" | "thuc_hien" | "ho_tro";
    return pcGoc(ten, loai);
  };

  const bamD = (ten: string, loai: string) => {
    const k = khoaD(ten, loai);
    const nay = pcHienTai(ten, loai);
    /* Một cú bấm đi một bậc: trống → Thực hiện → Hỗ trợ → trống. */
    const sau = nay === "thuc_hien" ? "ho_tro" : nay === "ho_tro" ? "" : "thuc_hien";
    if (sau === pcGoc(ten, loai)) xoaNhap(k); else dat(k, sau);
    xoaHong(k);
  };

  const luuD = async () => {
    const ds = Object.entries(nhap).filter(([k]) => k.startsWith("D|"));
    setDangLuu("D");
    let xong = 0; const loiDs: string[] = [];
    const hong: Record<string, string> = {}; const giu: Record<string, string> = {};
    const moi = [...phanCong];
    for (const [k, v] of ds) {
      const [, tenThuong, loai, line] = k.split("|");
      const ten = thanhVien.find((x) => x.ten.trim().toLowerCase() === tenThuong)?.ten || tenThuong;
      try {
        const r = await setAssignment(ten, bpChon, loai, line, v as "" | "thuc_hien" | "ho_tro");
        if (r.ok) {
          xong++;
          const i = moi.findIndex((x) => x.staff_name.trim().toLowerCase() === tenThuong
            && x.validation_type === loai && x.line === line);
          if (i >= 0) moi.splice(i, 1);
          if (v) {
            moi.push({
              staff_name: ten, department: bpChon, validation_type: loai,
              line, vai_tro: v as AssignmentRow["vai_tro"],
            });
          }
        } else { loiDs.push(`${ten} × ${loai}: ${r.error}`); hong[k] = r.error || "lỗi"; giu[k] = v; }
      } catch (e) {
        loiDs.push(`${ten} × ${loai}: ${(e as Error).message}`);
        hong[k] = (e as Error).message; giu[k] = v;
      }
    }
    setPhanCong(moi);
    chotLuot("D|", ["D|"], ds.length, xong, loiDs, giu, hong);
    setDangLuu("");
  };

  /* Câu kết luận của D: loại thẩm định nào CÓ THẬT trong kế hoạch của bộ
     phận này mà chưa ai nhận. Đếm trên hạng mục thật, không đếm trên tám
     cột cố định — bộ phận không làm PV thì thiếu PV không phải lỗi. */
  const ketLuanD = useMemo(() => {
    const coThat = new Set<string>();
    for (const a of acts) {
      if ((a.state || "active") !== "active") continue;
      const ds = (a.depts && a.depts.length ? a.depts : [a.dept || "qa"]).filter(Boolean) as string[];
      if (!ds.includes(bpChon)) continue;
      const lt = String(a.vtype || a.type || "").trim();
      if (lt) coThat.add(lt);
    }
    const chuaAi = [...coThat].filter((lt) =>
      !thanhVien.some((v) => pcHienTai(v.ten, lt) === "thuc_hien"));
    const tenBp = DEPTS.find((d) => d.id === bpChon)?.name || bpChon;
    const tenLine = lineChon === "*" ? "mọi line" : `line ${lineChon}`;
    if (!thanhVien.length) {
      return {
        chinh: `${tenBp} chưa có ai trong danh bạ — chưa tích được ô nào.`,
        phu: "Thêm người ở khối Danh bạ người thực hiện ngay đầu màn này, chọn đúng bộ phận, rồi quay lại đây.",
        tone: "warn" as const,
      };
    }
    if (!coThat.size) {
      return {
        chinh: `${tenBp} không có hạng mục thẩm định nào trong kế hoạch năm nay.`,
        phu: "Vẫn tích được để chuẩn bị cho năm sau; bảng chỉ không có gì để đối chiếu.",
        tone: "ok" as const,
      };
    }
    if (chuaAi.length) {
      return {
        chinh: `${tenBp} · ${tenLine}: ${chuaAi.length}/${coThat.size} loại thẩm định CHƯA có người thực hiện — ${chuaAi.join(", ")}.`,
        phu: "Kế hoạch có hạng mục thuộc các loại này nhưng ma trận chưa chỉ ra ai làm. Tích ô 'Thực hiện' cho người phụ trách rồi bấm Lưu.",
        tone: "over" as const,
      };
    }
    return {
      chinh: `${tenBp} · ${tenLine}: cả ${coThat.size} loại thẩm định trong kế hoạch đều đã có người thực hiện.`,
      phu: `Đã tích: ${[...coThat].sort().join(", ")}.`,
      tone: "ok" as const,
    };
  }, [acts, bpChon, lineChon, thanhVien, gocPhanCong, nhap]);

  const th: React.CSSProperties = {
    textAlign: "left", padding: "10px 12px", fontSize: 12, fontWeight: 800,
    color: C.plumSoft, borderBottom: `1px solid ${C.line}`, whiteSpace: "nowrap",
  };
  const td: React.CSSProperties = {
    padding: "10px 12px", fontSize: 14, color: C.plum, borderBottom: `1px solid ${C.line}`,
  };
  const CHIP_BP = [{ id: "", nhan: "chưa gán", mo: "Không thuộc bộ phận nào" },
    ...DEPTS.map((d) => ({ id: d.id, nhan: d.short, mo: d.name }))];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Card variant="strong">
        <CardTitle icon={ShieldCheck}
          sub="Mọi ô đều tích chọn; sửa xong bấm Lưu, màn hình báo rõ lưu được mấy ô và ô nào hỏng vì sao.">
          Danh bạ · phân quyền · phân công trách nhiệm
        </CardTitle>
        <CauKetLuan chinh={ketLuan.chinh} phu={ketLuan.phu} tone={ketLuan.tone} />
      </Card>

      {/* ============ 0 · DANH BẠ NGƯỜI THỰC HIỆN ============ */}
      <Card variant="strong">
        <CardTitle icon={Contact}
          sub="Chia theo bộ phận. Đây là nguồn nhân sự của ma trận phân công — không có tên ở đây thì không tích được ô nào ở bảng D.">
          Danh bạ người thực hiện theo bộ phận
        </CardTitle>

        {suaPhanCongDuoc && (
          <div className="pq-them">
            <input className="pq-o" style={{ maxWidth: 240 }} placeholder="Họ tên người thực hiện"
              aria-label="Họ tên người thực hiện mới" value={nguoiMoi.ten}
              onChange={(e) => setNguoiMoi((c) => ({ ...c, ten: e.target.value }))} />
            <input className="pq-o" style={{ maxWidth: 230 }} type="email" placeholder="Email (không bắt buộc)"
              aria-label="Email người thực hiện mới" value={nguoiMoi.email}
              onChange={(e) => setNguoiMoi((c) => ({ ...c, email: e.target.value }))} />
            <NhomChip ds={CHIP_BP} dangChon={nguoiMoi.bp} nhan="Bộ phận của người mới"
              onChon={(id) => setNguoiMoi((c) => ({ ...c, bp: id }))} />
            <button type="button" className="pq-nut la-chinh" onClick={themNguoi}
              disabled={!laTenThat(nguoiMoi.ten.trim()) || dangLuu === "N"}>
              <Plus size={15} /> Thêm vào danh bạ
            </button>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
          {[...DEPTS.map((d) => d.id), ""].map((bp) => {
            const ds = theoBoPhan.get(bp) || [];
            const meta = DEPTS.find((d) => d.id === bp);
            if (!ds.length && bp === "") return null;
            return (
              <div key={bp || "trong"} style={{ border: `1px solid ${C.line}`, borderRadius: 14, overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
                              background: bp ? C.pinkMist : C.marigoldSoft }}>
                  <b style={{ fontSize: 14, color: bp ? C.plum : C.marigoldText, fontFamily: TEXT }}>
                    {meta ? `${meta.short} · ${meta.name}` : "Chưa gán bộ phận"}
                  </b>
                  <span className="tnum" style={{ fontFamily: NUM, fontSize: 12.5, fontWeight: 800, color: C.plumSoft }}>
                    {ds.length} người
                  </span>
                  {!bp && ds.length > 0 && (
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: C.marigoldText }}>
                      — chưa vào được ma trận phân công của bộ phận nào
                    </span>
                  )}
                </div>
                {ds.length === 0 ? (
                  <div style={{ padding: "12px 14px", fontSize: 13, fontWeight: 700, color: C.plumSoft }}>
                    Chưa có ai. Thêm ở ô trên rồi chọn bộ phận này.
                  </div>
                ) : (
                  <div className="vmp-scroll" style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", minWidth: 700, borderCollapse: "collapse" }}>
                      <tbody>
                        {ds.map((p) => {
                          const id = String(p.id);
                          return (
                            <tr key={id}>
                              <td style={{ ...td, fontWeight: 800, width: 210 }}>{p.performer_name}</td>
                              <td style={{ ...td, width: 260 }}>
                                <input className={`pq-o${nhap[`Ne|${id}`] != null ? " la-nhap" : ""}${oHong[`Ne|${id}`] ? " la-hong" : ""}`}
                                  type="email" inputMode="email" placeholder="chưa có email"
                                  aria-label={`Email của ${p.performer_name}`}
                                  disabled={!suaPhanCongDuoc}
                                  value={emailNguoi(p)}
                                  onChange={(e) => {
                                    const k = `Ne|${id}`;
                                    if (e.target.value === (p.email || "")) xoaNhap(k);
                                    else dat(k, e.target.value);
                                  }} />
                              </td>
                              <td style={td}>
                                <NhomChip ds={CHIP_BP} dangChon={bpNguoi(p)}
                                  khoa={!suaPhanCongDuoc}
                                  nhap={nhap[`Nb|${id}`] != null} hong={oHong[`Nb|${id}`]}
                                  onChon={(x) => bamBpNguoi(p, x)}
                                  nhan={`Bộ phận của ${p.performer_name}`} />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <ThanhLuu soThayDoi={demNhap("Nb|", "Ne|")} dangLuu={dangLuu === "N"}
          ketQua={ketQua.N || null} onLuu={luuDanhBa}
          onHoanTac={() => boNhap("N", "Nb|", "Ne|")} khoa={!suaPhanCongDuoc}
          ghiChu="Tích bộ phận cho từng người, điền email nếu có, xong bấm Lưu." />
      </Card>

      {/* ============ A · VAI TRÒ × HÀNH ĐỘNG ============ */}
      <Card variant="strong">
        <CardTitle icon={KeyRound}
          sub="Bảng luật THẬT: 23 hàm RPC tra đúng bảng này để quyết định cho hay không cho. Sửa ở đây là đổi quyền thật.">
          A · Vai trò được làm gì
        </CardTitle>

        <div className="vmp-scroll" style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: 760, borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Hành động</th>
                {VAI.map((v) => (
                  <th key={v.id} style={{ ...th, textAlign: "center" }}>
                    <div style={{ fontFamily: "ui-monospace, monospace", color: C.plum }}>{v.ten}</div>
                    <div style={{ fontWeight: 600, opacity: .8 }}>{v.mo}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {HANH_DONG.map((h) => (
                <tr key={h.ten}>
                  <td style={{ ...td, fontWeight: 700 }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      {h.ten.split("\n").map((d, i) => <span key={i}>{i ? <><br />{d}</> : d}</span>)}
                      <GiaiThich tieuDe={h.ten.replace("\n", " ")}>{h.giaiThich}</GiaiThich>
                    </span>
                  </td>
                  {VAI.map((v) => {
                    /* Hàng "Xem số liệu": quyền đọc do RLS quyết, không nằm
                       trong bảng luật. Vẽ ô sửa được ở đây là hứa một thứ hệ
                       thống không làm. */
                    if (!h.id) {
                      return (
                        <td key={v.id} style={{ ...td, textAlign: "center" }}>
                          <OTich ky="✓" chu="Được — do RLS, không sửa ở đây" khoa
                            mau={C.mintText} nen={C.mintSoft} nhan={`Xem số liệu × ${v.ten}`} />
                        </td>
                      );
                    }
                    const k = khoaA(h.id, v.id);
                    const o = O_QUYEN[mucHienTai(h.id, v.id)];
                    const dongBang = h.id === "admin_users" && v.id === "admin";
                    return (
                      <td key={v.id} style={{ ...td, textAlign: "center" }}>
                        <OTich ky={o.ky} chu={dongBang ? `${o.chu} — ô đóng băng` : o.chu}
                          mau={o.mau} nen={o.nen}
                          khoa={!quyenSuaA || dongBang}
                          nhap={nhap[k] != null} hong={oHong[k]}
                          onClick={() => bamA(h, v.id)}
                          nhan={`${h.ten.replace("\n", " ")} × ${v.ten}`} />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ display: "flex", gap: "8px 18px", flexWrap: "wrap", marginTop: 12,
                      fontSize: 12.5, fontWeight: 700, color: C.plumSoft }}>
          <span><b style={{ color: C.mintText }}>✓</b> Được</span>
          <span><b style={{ color: C.marigoldText }}>◑</b> Chỉ bộ phận mình</span>
          <span><b>✕</b> Không</span>
          <span>Bấm một ô để đổi mức. “Chỉ bộ phận mình” chỉ có ở hàng <b>Cập nhật tiến độ</b> —
            các hàm khác chưa có vế so bộ phận trong luật.</span>
        </div>

        <ThanhLuu soThayDoi={demNhap("A|")} dangLuu={dangLuu === "A"}
          ketQua={ketQua["A|"] || null} onLuu={luuA} onHoanTac={() => boNhap("A|", "A|")}
          khoa={!quyenSuaA}
          ghiChu="Tích chọn để đổi mức quyền, xong bấm Lưu. Đây là luật thật, không phải bản mô tả." />
      </Card>

      {/* ============ B · NGƯỜI × BỘ PHẬN ============ */}
      <Card variant="strong">
        <CardTitle icon={Users}
          sub="Mỗi ô nói hai điều: người này đang đứng tên bao nhiêu hạng mục ở bộ phận đó, và luật hiện hành có cho họ sửa không">
          B · Ai chịu trách nhiệm phần nào
        </CardTitle>

        {(thieuTaiKhoan.length > 0 || thieuEmail.length > 0 || adminKhongBoPhan.length > 0) && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
            {thieuTaiKhoan.length > 0 && (
              <div className="pq-canhbao la-do">
                <AlertTriangle size={17} style={{ flexShrink: 0, marginTop: 2 }} />
                <span>Chưa có tài khoản: <b>{thieuTaiKhoan.map((h) => h.ten).join(", ")}</b> — không đăng nhập được nên không tự cập nhật tiến độ của mình.</span>
              </div>
            )}
            {thieuEmail.length > 0 && (
              <div className="pq-canhbao la-vang">
                <AlertTriangle size={17} style={{ flexShrink: 0, marginTop: 2 }} />
                <span>Chưa có email: <b>{thieuEmail.map((h) => h.ten).join(", ")}</b> — không nhận được cảnh báo đến hạn.</span>
              </div>
            )}
            {adminKhongBoPhan.length > 0 && (
              <div className="pq-canhbao la-vang">
                <AlertTriangle size={17} style={{ flexShrink: 0, marginTop: 2 }} />
                <span><b>{adminKhongBoPhan.map((h) => h.full_name || h.email).join(", ")}</b> mang vai <code>department_user</code> nhưng chưa gán bộ phận — luật so bộ phận của hạng mục với bộ phận của người, thiếu vế sau thì không sửa được hạng mục nào.</span>
              </div>
            )}
          </div>
        )}

        <div className="vmp-scroll" style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: 1120, borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Người</th>
                <th style={th}>Vai trò <span style={{ fontWeight: 600 }}>(tích một)</span></th>
                <th style={th}>Bộ phận của tài khoản <span style={{ fontWeight: 600 }}>(tích một)</span></th>
                <th style={th}>Email nhận cảnh báo</th>
                {DEPTS.map((d) => <th key={d.id} style={{ ...th, textAlign: "center" }}>{d.short}</th>)}
                <th style={{ ...th, textAlign: "center" }}>Tổng</th>
              </tr>
            </thead>
            <tbody>
              {hang.map((h) => {
                const voChu = h.ten === "(chưa phân công)";
                const suaDong = suaQuyenDuoc && !!h.tkId;
                return (
                  <tr key={h.ten}>
                    <td style={{ ...td, fontWeight: 800 }}>
                      {h.ten}
                      <div style={{ fontSize: 11.5, fontWeight: 700, marginTop: 3 }}>
                        {voChu ? <span style={{ color: C.marigoldText }}>chưa ai đứng tên</span>
                          : h.coTaiKhoan
                            ? <Tag color={C.mintText} bg={C.mintSoft}>có tài khoản</Tag>
                            : <Tag color={C.raspText} bg={C.raspSoft}>chưa có tài khoản</Tag>}
                      </div>
                    </td>

                    <td style={td}>
                      {h.tkId ? (
                        <NhomChip ds={VAI.map((v) => ({ id: v.id, nhan: v.ten, mo: v.mo }))}
                          dangChon={vaiHienTai(h)} khoa={!suaDong}
                          nhap={nhap[`Bv|${h.tkId}`] != null} hong={oHong[`Bv|${h.tkId}`]}
                          onChon={(x) => bamB(h, "v", x)} nhan={`Vai trò của ${h.ten}`} />
                      ) : <span style={{ color: C.plumSoft }}>—</span>}
                    </td>

                    <td style={td}>
                      {h.tkId ? (
                        <NhomChip ds={CHIP_BP} dangChon={bpHienTai(h)} khoa={!suaDong}
                          nhap={nhap[`Bd|${h.tkId}`] != null} hong={oHong[`Bd|${h.tkId}`]}
                          onChon={(x) => bamB(h, "d", x)} nhan={`Bộ phận của ${h.ten}`} />
                      ) : <span style={{ color: C.plumSoft }}>—</span>}
                    </td>

                    <td style={td}>
                      {voChu ? "—" : suaQuyenDuoc ? (
                        <input className={`pq-o${nhap[`Be|${h.ten}`] != null ? " la-nhap" : ""}${oHong[`Be|${h.ten}`] ? " la-hong" : ""}`}
                          type="email" inputMode="email"
                          aria-label={`Email nhận cảnh báo của ${h.ten}`}
                          placeholder={h.emailTK ? `đăng nhập: ${h.emailTK}` : "chưa có"}
                          value={emailHienTai(h)}
                          onChange={(e) => {
                            const k = `Be|${h.ten}`;
                            if (e.target.value === (h.emailTH || "")) xoaNhap(k);
                            else dat(k, e.target.value);
                          }} />
                      ) : (h.emailTH || h.emailTK
                        || <span style={{ color: C.marigoldText, fontWeight: 700 }}>chưa có</span>)}
                    </td>

                    {DEPTS.map((d) => {
                      const n = h.theoBp.get(d.id) || 0;
                      /* Quyền HIỆU LỰC ở ô này, theo đúng luật của bảng A —
                         kể cả mức vừa tích chưa lưu, để thấy ngay hệ quả. */
                      const vai = vaiHienTai(h);
                      const m = vai ? mucHienTai("update_progress", vai) : "khong";
                      const suaDuoc = voChu ? null
                        : m === "co" ? true
                          : m === "bo_phan" ? bpHienTai(h) === d.id
                            : false;
                      return (
                        <td key={d.id} style={{ ...td, textAlign: "center" }}>
                          {n > 0 ? (
                            <span title={suaDuoc === null ? "Chưa có người đứng tên"
                              : suaDuoc ? "Đứng tên và sửa được" : "Đứng tên nhưng KHÔNG sửa được theo luật hiện hành"}
                              style={{
                                display: "inline-block", minWidth: 34, padding: "4px 9px", borderRadius: 8,
                                fontFamily: NUM, fontSize: 13, fontWeight: 800,
                                background: suaDuoc === false ? C.raspSoft : suaDuoc ? C.mintSoft : C.surfaceSunk,
                                color: suaDuoc === false ? C.raspText : suaDuoc ? C.mintText : C.plumSoft,
                              }}>
                              {n}{suaDuoc === false ? " ⚠" : ""}
                            </span>
                          ) : <span style={{ color: C.plumSoft, opacity: .5 }}>·</span>}
                        </td>
                      );
                    })}
                    <td style={{ ...td, textAlign: "center", fontFamily: NUM, fontWeight: 800 }}>{h.tong}</td>
                  </tr>
                );
              })}
              <tr>
                <td style={{ ...td, fontWeight: 800 }} colSpan={4}>Tổng theo bộ phận</td>
                {DEPTS.map((d) => (
                  <td key={d.id} style={{ ...td, textAlign: "center", fontFamily: NUM, fontWeight: 800, color: C.plumSoft }}>
                    {tongTheoBp.get(d.id) || 0}
                  </td>
                ))}
                <td style={td} />
              </tr>
            </tbody>
          </table>
        </div>

        <div style={{ display: "flex", gap: "8px 18px", flexWrap: "wrap", marginTop: 14,
                      fontSize: 12.5, fontWeight: 700, color: C.plumSoft }}>
          <span><i style={{ display: "inline-block", width: 12, height: 12, borderRadius: 4, background: C.mint, marginRight: 6 }} />Đứng tên và sửa được</span>
          <span><i style={{ display: "inline-block", width: 12, height: 12, borderRadius: 4, background: C.rasp, marginRight: 6 }} />Đứng tên nhưng KHÔNG sửa được</span>
          <span>Cột bộ phận đổi màu ngay theo mức bạn vừa tích ở bảng A — thấy hệ quả trước khi lưu.</span>
        </div>

        <ThanhLuu soThayDoi={demNhap("Bv|", "Bd|", "Be|")} dangLuu={dangLuu === "B"}
          ketQua={ketQua.B || null} onLuu={luuB}
          onHoanTac={() => boNhap("B", "Bv|", "Bd|", "Be|")} khoa={!suaQuyenDuoc}
          ghiChu="Tích vai trò và bộ phận, điền email nếu cần, xong bấm Lưu." />
      </Card>

      {/* ============ C · KHU VỰC / LINE ============ */}
      <Card>
        <CardTitle icon={MapPin}
          sub="Chuẩn bị cho việc phân quyền chi tiết hơn — CHƯA có hiệu lực">
          C · Phạm vi chi tiết theo khu vực / line
        </CardTitle>
        <CauKetLuan
          tone="warn"
          chinh="Luật hiện hành chỉ phân quyền tới cấp BỘ PHẬN, chưa tới khu vực hay line."
          phu="Bảng dưới đây liệt kê phạm vi có thật trong dữ liệu để chuẩn bị. Nó CHƯA quyết định ai sửa được gì — vẽ một ma trận trông như đang có hiệu lực trong khi chưa có là cách nhanh nhất khiến người ta tin nhầm rằng đã phân quyền xong."
        />
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {DEPTS.map((d) => {
            const o = phamVi.get(d.id);
            if (!o) return null;
            const mo = moPhamVi === d.id;
            const kv = [...o.khuVuc.entries()].sort((a, b) => b[1] - a[1]);
            const ln = [...o.line.entries()].sort((a, b) => b[1] - a[1]);
            return (
              <div key={d.id} style={{ border: `1px solid ${C.line}`, borderRadius: 14, overflow: "hidden" }}>
                <button type="button" onClick={() => setMoPhamVi(mo ? "" : d.id)}
                  style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left",
                           padding: "12px 14px", border: "none", cursor: "pointer",
                           background: mo ? C.pinkMist : C.surface, fontFamily: TEXT }}>
                  <span style={{ color: C.plumSoft, fontWeight: 900 }}>{mo ? "▾" : "▸"}</span>
                  <span style={{ flex: 1, fontSize: 14, fontWeight: 800, color: C.plum }}>{d.name}</span>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: C.plumSoft }}>
                    {kv.length} khu vực · {ln.length} line · {tongTheoBp.get(d.id) || 0} hạng mục
                  </span>
                </button>
                {mo && (
                  <div style={{ padding: "12px 16px", background: C.surfaceSunk,
                                display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 16 }}>
                    {[["Khu vực", kv], ["Line", ln]].map(([ten, ds]) => (
                      <div key={ten as string}>
                        <div style={{ fontSize: 12, fontWeight: 800, color: C.plumSoft, marginBottom: 6 }}>{ten as string}</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {(ds as Array<[string, number]>).slice(0, 14).map(([k, n]) => (
                            <span key={k} style={{ fontSize: 12, fontWeight: 700, color: C.plum,
                                                   background: C.surface, border: `1px solid ${C.line}`,
                                                   borderRadius: 8, padding: "4px 9px" }}>
                              {k} <b style={{ fontFamily: NUM, color: C.plumSoft }}>{n}</b>
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* ============ D · MA TRẬN PHÂN CÔNG ============ */}
      <Card variant="strong">
        <CardTitle icon={Grid3x3}
          sub="Thành viên lấy động từ danh bạ của bộ phận — tích ô để khai ai làm loại thẩm định nào, ở line nào">
          D · Ai làm loại thẩm định nào, ở line nào
        </CardTitle>

        <CauKetLuan chinh={ketLuanD.chinh} phu={ketLuanD.phu} tone={ketLuanD.tone} />

        <div style={{ display: "flex", gap: "10px 18px", flexWrap: "wrap", alignItems: "flex-end",
                      margin: "14px 0 12px" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: C.plumSoft }}>Bộ phận</span>
            <select className="pq-o pq-loc" style={{ maxWidth: 260 }} value={bpChon}
              onChange={(e) => setBpChon(e.target.value)}>
              {DEPTS.map((d) => <option key={d.id} value={d.id}>{d.short} · {d.name}</option>)}
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: C.plumSoft }}>Line / khu vực</span>
            <select className="pq-o pq-loc" style={{ maxWidth: 280 }} value={lineChon}
              disabled={!dsLine.length}
              onChange={(e) => setLineChon(e.target.value)}>
              <option value="*">Mọi line của bộ phận</option>
              {dsLine.map(([k, n]) => <option key={k} value={k}>{k} ({n} hạng mục)</option>)}
            </select>
          </label>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: C.plumSoft, paddingBottom: 8 }}>
            {dsLine.length
              ? <>Tích ở <b>“Mọi line”</b> là phân công chung; chọn một line cụ thể để khai riêng cho line đó.</>
              : <>Bộ phận này không chia line trong dữ liệu — chỉ có một cột phân công chung.</>}
          </div>
        </div>

        {loiD && (
          <div className="pq-canhbao la-do" style={{ marginBottom: 12 }}>
            <AlertTriangle size={17} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>Chưa đọc được ma trận phân công: {loiD}
              {/permission denied|row-level|JWT/i.test(loiD)
                && " — cần đăng nhập bằng tài khoản thật mới đọc được bảng này."}</span>
          </div>
        )}

        {!thanhVien.length ? (
          <div style={{ padding: "18px 16px", borderRadius: 14, background: C.surfaceSunk,
                        fontSize: 13.5, fontWeight: 700, color: C.plumSoft, lineHeight: 1.7 }}>
            Chưa có ai thuộc bộ phận này. Thêm người ở khối <b>Danh bạ người thực hiện</b> ngay đầu
            màn này và chọn đúng bộ phận — bảng dưới sẽ tự có dòng cho họ.
          </div>
        ) : (
          <div className="vmp-scroll" style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", minWidth: 820, borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Nhân viên</th>
                  <th style={th}>Nguồn tên</th>
                  {LOAI_TD.map((lt) => <th key={lt} style={{ ...th, textAlign: "center" }}>{lt}</th>)}
                  <th style={{ ...th, textAlign: "center" }}>Số loại</th>
                </tr>
              </thead>
              <tbody>
                {thanhVien.map((v) => {
                  const dem = LOAI_TD.filter((lt) => pcHienTai(v.ten, lt)).length;
                  return (
                    <tr key={v.ten}>
                      <td style={{ ...td, fontWeight: 800 }}>
                        {v.ten}
                        {!v.email && (
                          <div style={{ fontSize: 11.5, fontWeight: 700, color: C.marigoldText }}>chưa có email</div>
                        )}
                      </td>
                      <td style={{ ...td, fontSize: 12, color: C.plumSoft, fontWeight: 700 }}>
                        {[...v.nguon].join(" · ")}
                      </td>
                      {LOAI_TD.map((lt) => {
                        const k = khoaD(v.ten, lt);
                        const dang = pcHienTai(v.ten, lt);
                        const o = dang ? VAI_O[dang] : null;
                        return (
                          <td key={lt} style={{ ...td, textAlign: "center", padding: "6px 4px" }}>
                            <OTich ky={o ? o.ky : "＋"} chu={o ? o.chu : "chưa phân công"}
                              mau={o ? o.mau : C.plumSoft} nen={o ? o.nen : C.surfaceSunk}
                              khoa={!suaPhanCongDuoc}
                              nhap={nhap[k] != null} hong={oHong[k]}
                              onClick={() => bamD(v.ten, lt)}
                              nhan={`${v.ten} · ${lt} · ${lineChon === "*" ? "mọi line" : lineChon}`} />
                          </td>
                        );
                      })}
                      <td style={{ ...td, textAlign: "center", fontFamily: NUM, fontWeight: 800,
                                   color: dem ? C.plum : C.plumSoft }}>
                        {dem || "·"}
                      </td>
                    </tr>
                  );
                })}
                <tr>
                  <td style={{ ...td, fontWeight: 800 }} colSpan={2}>Số người mỗi loại</td>
                  {LOAI_TD.map((lt) => {
                    const n = thanhVien.filter((v) => pcHienTai(v.ten, lt) === "thuc_hien").length;
                    return (
                      <td key={lt} style={{ ...td, textAlign: "center", fontFamily: NUM, fontWeight: 800,
                                            color: n ? C.mintText : C.raspText }}>
                        {n || "0"}
                      </td>
                    );
                  })}
                  <td style={td} />
                </tr>
              </tbody>
            </table>
          </div>
        )}

        <div style={{ display: "flex", gap: "8px 18px", flexWrap: "wrap", marginTop: 14,
                      fontSize: 12.5, fontWeight: 700, color: C.plumSoft, alignItems: "center" }}>
          <span><b style={{ color: C.mintText }}>●</b> Thực hiện — người trực tiếp làm</span>
          <span><b style={{ color: C.skyText }}>○</b> Hỗ trợ — phối hợp</span>
          <span><b>＋</b> chưa phân công</span>
          <span>Bấm một ô đi một bậc: ＋ → ● → ○ → ＋.</span>
        </div>

        <ThanhLuu soThayDoi={demNhap("D|")} dangLuu={dangLuu === "D"}
          ketQua={ketQua["D|"] || null} onLuu={luuD} onHoanTac={() => boNhap("D|", "D|")}
          khoa={!suaPhanCongDuoc}
          ghiChu="Tích ô cho từng người × từng loại thẩm định, xong bấm Lưu." />
      </Card>

      {/* ============ CÁCH DÙNG ============ */}
      <Card variant="soft">
        <CardTitle icon={ShieldCheck} sub="Ba việc làm được ngay, theo thứ tự đáng làm trước">
          Từ ma trận này làm gì tiếp
        </CardTitle>
        <ol style={{ margin: 0, paddingLeft: 22, fontSize: 14, lineHeight: 1.8, color: C.plum }}>
          <li><b>Điền danh bạ cho các bộ phận ngoài QA.</b> Ma trận phân công lấy người từ danh bạ; bộ phận nào chưa có ai thì bảng D của bộ phận đó trống.</li>
          <li><b>Tạo tài khoản cho người đang đứng tên hạng mục.</b> Người không đăng nhập được thì phải nhờ nhập hộ, mà nhập hộ làm cột "người sửa" trong nhật ký không còn đúng người làm — đó là điểm yếu về ALCOA+ chữ A (Attributable).</li>
          <li><b>Gán bộ phận cho tài khoản mang vai <code>department_user</code>.</b> Luật so bộ phận của hạng mục với bộ phận của người; thiếu vế sau thì họ không sửa được hạng mục nào, dù nhìn thấy hết.</li>
        </ol>
        <div style={{ marginTop: 14, padding: "11px 14px", borderRadius: 14, background: C.surfaceSunk,
                      fontSize: 13, color: C.plumSoft, fontWeight: 600, lineHeight: 1.65 }}>
          <b style={{ color: C.plum }}>Muốn phân quyền tới khu vực / line</b> thì phải sửa luật trong
          <code> rpc_update_progress</code>: thêm bảng gán "người × khu vực" và so thêm một vế nữa.
          Làm ở giao diện thôi thì không có tác dụng — client luôn có thể bị bỏ qua bằng cách gọi
          thẳng RPC, nên quyền chỉ là quyền thật khi nó nằm ở server.
        </div>
      </Card>
    </div>
  );
}
