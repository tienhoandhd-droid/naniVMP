/* =====================================================================
 *  PhanQuyenPage.tsx — Ma trận phân quyền & trách nhiệm
 *  ---------------------------------------------------------------------
 *  Màn này trả lời đúng ba câu, theo thứ tự người ta thật sự hỏi:
 *
 *   1 · AI VÀO ĐƯỢC     — email nào được phép có tài khoản
 *   2 · VAI NÀO LÀM GÌ  — ma trận vai × quyền, hai nửa XEM và SỬA
 *   3 · TỪNG NGƯỜI      — một dòng một người, và trên dòng đó có ĐỦ hai vế:
 *                          được phép làm gì | đang nhận làm gì
 *
 *  ---------------------------------------------------------------------
 *  VÌ SAO SÁU KHỐI CÒN BA
 *
 *  · "Danh bạ người thực hiện" và "Người × bộ phận" đều là bảng NGƯỜI, mỗi
 *    bảng sửa một nửa cùng một người — bảng này sửa tên/email/bộ phận
 *    trong vmp_performers, bảng kia sửa vai/bộ phận trong profiles. Hai ô
 *    "bộ phận" cho một người là hai chỗ để lệch nhau, và đã lệch thật:
 *    Tôn Nữ Thiện My có bộ phận QA ở bảng người, trống ở bảng tài khoản.
 *    Nay MỘT dòng, MỘT ô bộ phận, lưu xuống cả hai chỗ.
 *
 *  · Khối "Phạm vi chi tiết theo khu vực / line" chỉ liệt kê line có thật
 *    rồi tự nói mình chưa có hiệu lực. Một khối cả màn hình để nói "chưa
 *    dùng" là một khối phải cuộn qua mỗi lần. Danh sách line nay chỉ còn
 *    là nguồn cho ô chọn line — đúng chỗ nó có ích.
 *
 *  · Bảng QUYỀN của người và bảng PHÂN CÔNG của người tách làm hai, cách
 *    nhau một màn cuộn. Nhưng câu đáng hỏi nhất của một ma trận trách
 *    nhiệm là câu bắc qua cả hai: NGƯỜI NHẬN LÀM VIỆC ĐÓ CÓ QUYỀN LÀM
 *    VIỆC ĐÓ KHÔNG. Muốn trả lời thì phải tự ghép trong đầu — và người ta
 *    không ghép. Nay hai vế nằm trên cùng một dòng, đọc ngang là ra.
 *
 *    Việc gộp còn bỏ được một thứ vốn không có thật: ô chọn BỘ PHẬN của
 *    bảng phân công. Khoá duy nhất của vmp_assignment_matrix là
 *    (staff_name, validation_type, line) — bộ phận KHÔNG nằm trong khoá,
 *    nó chỉ là thuộc tính ghi kèm và bị ghi đè mỗi lần upsert. Nghĩa là ô
 *    chọn đó chưa bao giờ là một chiều của ma trận, nó chỉ lọc người xem;
 *    mà vẽ một ô lọc trông như một chiều thì người dùng sẽ tin rằng "cùng
 *    tên, cùng loại, khác bộ phận" là hai ô khác nhau — không phải.
 *    Bộ phận nay lấy thẳng từ dòng của người đó, và người xếp thành dải
 *    theo bộ phận để vẫn thấy "bộ phận nào có những ai".
 *
 *  ---------------------------------------------------------------------
 *  HAI NỬA CỦA MA TRẬN QUYỀN, VÀ VÌ SAO CHÚNG KHÁC NHAU
 *
 *  Nửa SỬA đọc bảng vmp_role_permissions — chính bảng mà 23 hàm RPC tra
 *  khi quyết định cho hay không cho. Sửa ở đây là đổi quyền thật.
 *
 *  Nửa XEM đọc policy RLS của Postgres qua rpc_luat_xem. Quyền đọc do
 *  Postgres chặn ở tầng dưới cùng, không có hàm RPC nào can thiệp, nên
 *  KHÔNG sửa được từ màn hình — đổi nó là việc của migration. Bảng vẫn
 *  phải hiện, vì "ai xem được gì" là nửa câu hỏi mà người quản trị hỏi
 *  đầu tiên, và trước đây màn này không trả lời được.
 *
 *  Cả hai nửa đều ĐỌC LUẬT ĐANG CHẠY chứ không chép lại. Một bảng phân
 *  quyền chép tay thì hôm nay đúng, ngày ai đó sửa luật vẫn hiện y nguyên
 *  và vẫn trông rất chắc chắn — chỉ là sai, và sai theo kiểu khiến người
 *  ta thôi kiểm tra.
 *
 *  ---------------------------------------------------------------------
 *  CÁCH SỬA: tích chọn, rồi bấm LƯU.
 *
 *  Ô nào cũng là ô tích chọn, trừ tên người và email — hai thứ không có
 *  danh sách để chọn. Sửa xong KHÔNG tự lưu: thay đổi nằm ở bản nháp, viền
 *  vàng, đếm ở thanh dưới mỗi bảng. Đây là bảng phân quyền, người ta hay
 *  tích thử vài ô để xem hình dung ra sao rồi mới quyết; tự lưu từng cú
 *  bấm nghĩa là mỗi lần tích thử là một lần đổi quyền thật.
 *
 *  Lưu xong luôn báo rõ: lưu được mấy ô, ô nào không lưu được và VÌ SAO.
 *  Ô hỏng giữ nguyên trong bản nháp kèm viền đỏ để sửa lại, không bị mất.
 * ===================================================================== */
import { Fragment, useEffect, useMemo, useState } from "react";
import {
  ShieldCheck, Users, KeyRound, AlertTriangle, Grid3x3,
  Save, Undo2, Check, Plus, Mail, Trash2, Eye, Pencil,
} from "lucide-react";
import { C, NUM } from "../constants/theme.ts";
import { DEPTS } from "../constants/vmp.ts";
import { supabase } from "../lib/supabaseClient.ts";
import {
  setUserRole, upsertPerformer, fetchAssignments, setAssignment,
  fetchRolePermissions, setRolePermission,
  fetchEmailChoPhep, setEmailChoPhep, fetchNguoiVaQuyen, lienKetTaiKhoan, fetchLuatXem,
} from "../lib/supabaseData.ts";
import type {
  AssignmentRow, RolePermRow, EmailChoPhepRow, NguoiQuyenRow, LuatXemRow, MucXem,
} from "../lib/supabaseData.ts";
import { Card, CardTitle, Tag, CauKetLuan, GiaiThich } from "../components/ui/Primitives.tsx";
import type { Activity, AppUser } from "../types/domain.ts";
import StaffDirectoryPanel from "../features/itemPermissions/StaffDirectoryPanel.tsx";
import AssignmentPanel from "../features/itemPermissions/AssignmentPanel.tsx";
import EffectiveRightsPanel from "../features/itemPermissions/EffectiveRightsPanel.tsx";
import type { DirectoryPerson } from "../features/itemPermissions/types.ts";

/* ---------------------------------------------------------------------
 * Vai trò và các mức quyền SỬA
 * ------------------------------------------------------------------- */
type Muc = "co" | "bo_phan" | "phan_cong" | "khong";

const VAI = [
  { id: "admin", ten: "admin", mo: "Quản trị hệ thống" },
  { id: "qa_manager", ten: "qa_manager", mo: "Phụ trách QA" },
  { id: "department_user", ten: "department_user", mo: "Người của một bộ phận" },
  { id: "viewer", ten: "viewer", mo: "Chỉ xem" },
] as const;

interface HanhDong {
  /** Khoá trong vmp_role_permissions. */
  id: string;
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
    id: "update_progress",
    ten: "Cập nhật tiến độ",
    giaiThich: "rpc_update_progress → ly_do_khong_sua_duoc. Đây là hành động DUY NHẤT có vế so bộ phận và phân công trong luật, nên cũng là hành động duy nhất đặt được hai mức hạn chế.\n\n• 'Bộ phận mình' so với CẢ HAI chiều: bộ phận QUẢN LÝ đối tượng và bộ phận THỰC HIỆN thẩm định. Hai chiều này lệch nhau ở 150/448 hạng mục — người XSX đi thẩm định thiết bị do QA quản lý là chuyện thường — nên chỉ so một chiều là chặn đúng người đang đi làm.\n\n• 'Theo phân công' mịn hơn một bậc: chỉ sửa được hạng mục mà ma trận phân công có tích đúng tên mình, đúng loại thẩm định, đúng line. Tích ở 'Mọi line' thì được cả bộ phận.",
    mucChoPhep: ["co", "bo_phan", "phan_cong", "khong"],
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
    giaiThich: "Cả họ rpc_upsert_* / rpc_delete_* (danh mục nguồn, danh bạ, người thực hiện, sản phẩm GMP, người nhận mail) và rpc_set_assignment của ma trận phân công — 20 hàm cùng đọc một dòng luật này.",
    mucChoPhep: ["co", "khong"],
  },
  {
    id: "admin_users",
    ten: "Quản trị người dùng, phân quyền",
    giaiThich: "rpc_set_user_role và chính rpc_set_role_permission. Ô của vai admin bị đóng băng ở 'Được': hạ nó xuống là tự khoá mình ra ngoài, không còn ai mở lại được.",
    mucChoPhep: ["co", "khong"],
  },
];

/* Bốn mức, bốn ký hiệu phân biệt được cả khi in đen trắng: ô càng đầy thì
   quyền càng rộng. ✓ đầy → ◑ nửa → ◔ một phần tư → ✕ không. */
const O_QUYEN: Record<Muc, { chu: string; ky: string; mau: string; nen: string }> = {
  co: { chu: "Được — mọi hạng mục", ky: "✓", mau: C.mintText, nen: C.mintSoft },
  bo_phan: { chu: "Chỉ bộ phận mình (quản lý hoặc thực hiện)", ky: "◑", mau: C.marigoldText, nen: C.marigoldSoft },
  phan_cong: { chu: "Chỉ hạng mục được phân công (loại × line)", ky: "◔", mau: C.skyText, nen: C.skySoft },
  khong: { chu: "Không", ky: "✕", mau: C.plumSoft, nen: C.surfaceSunk },
};

/* Mức XEM dùng CÙNG bộ ký hiệu với mức sửa, cùng thứ tự đầy → rỗng, để
   đọc hai nửa bảng không phải đổi hệ quy chiếu giữa chừng. */
const O_XEM: Record<MucXem, { chu: string; ky: string; mau: string; nen: string }> = {
  tat_ca: { chu: "Xem được toàn bộ", ky: "✓", mau: C.mintText, nen: C.mintSoft },
  mot_phan: { chu: "Xem được phần không nhạy cảm", ky: "◑", mau: C.marigoldText, nen: C.marigoldSoft },
  cua_minh: { chu: "Chỉ xem được của chính mình", ky: "◔", mau: C.skyText, nen: C.skySoft },
  khong: { chu: "Không xem được", ky: "✕", mau: C.plumSoft, nen: C.surfaceSunk },
  khong_ro: { chu: "Chưa phân loại được policy này — xem nguyên văn ở chú giải", ky: "?", mau: C.raspText, nen: C.raspSoft },
};

/* Tám loại thẩm định đúng như luật VMP01 sinh ra, xếp theo trình tự vòng
   đời thiết bị rồi tới các loại độc lập — người ở xưởng đọc bảng này theo
   thứ tự việc xảy ra, không theo thứ tự từ điển. */
const LOAI_TD = ["DQ", "FAT/SAT", "IQ", "OQ", "PQ", "PV", "GSP", "GDP"] as const;

const VAI_O = {
  thuc_hien: { chu: "Thực hiện", ky: "●", mau: C.mintText, nen: C.mintSoft },
  ho_tro: { chu: "Hỗ trợ", ky: "○", mau: C.skyText, nen: C.skySoft },
} as const;

/* Bộ phận được ghi bằng đủ kiểu — "QA", "qa", "Xưởng sản xuất", "XSX".
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

/* ---------------------------------------------------------------------
 * Ô TÍCH — dùng chung cho mọi bảng
 * ------------------------------------------------------------------- */
function OTich({ ky, chu, mau, nen, khoa, nhap, hong, onClick, nhan }: {
  ky: string; chu: string; mau: string; nen: string;
  /** Không sửa được (thiếu quyền, ô đóng băng, hoặc luật không nằm ở đây). */
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

type PhanQuyenViewProps = { acts: Activity[]; isAdmin?: boolean; user?: AppUser | null };

function EquipmentAssignmentWorkspace({ acts }: { acts: Activity[] }) {
  const [person, setPerson] = useState<DirectoryPerson | null>(null);
  const validAreas = useMemo(() => [...new Set(acts.flatMap((activity) => {
    const raw = (activity._raw || {}) as Record<string, unknown>;
    return [activity.area, raw.area, raw.line]
      .map((value) => String(value || "").trim())
      .filter(Boolean);
  }))].sort((a, b) => a.localeCompare(b, "vi")), [acts]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Card variant="strong">
        <CardTitle icon={Users}
          sub="Chọn người từ danh bạ chuẩn và phân công hạng mục thuộc bộ phận quản lý thiết bị. Hồ sơ nhân sự và ma trận quản trị chỉ Admin được sửa.">
          Phân công theo hạng mục
        </CardTitle>
        <div className="ip-workspace">
          <StaffDirectoryPanel canEdit={false} validAreas={validAreas} onSelect={setPerson} />
          <AssignmentPanel person={person} canEdit fixedKind="equipment_department" />
        </div>
      </Card>
    </div>
  );
}

function CurrentPermissionWorkspace({ acts, isAdmin = false }: {
  acts: Activity[];
  isAdmin?: boolean;
}) {
  const [person, setPerson] = useState<DirectoryPerson | null>(null);
  const validAreas = useMemo(() => [...new Set(acts.flatMap((activity) => {
    const raw = (activity._raw || {}) as Record<string, unknown>;
    return [activity.area, raw.area, raw.line]
      .map((value) => String(value || "").trim())
      .filter(Boolean);
  }))].sort((a, b) => a.localeCompare(b, "vi")), [acts]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Card variant="strong">
        <CardTitle icon={Users}
          sub="Chọn nhân sự từ danh bạ chuẩn, khai phạm vi và xem đúng quyền đang có hiệu lực.">
          Danh bạ nhân sự &amp; quyền
        </CardTitle>
        <div className="ip-workspace">
          <StaffDirectoryPanel canEdit={isAdmin} validAreas={validAreas} onSelect={setPerson} />
          <AssignmentPanel person={person} canEdit={isAdmin} />
          <EffectiveRightsPanel person={person} />
        </div>
      </Card>
    </div>
  );
}

export default function PhanQuyenView(props: PhanQuyenViewProps) {
  const allowed = props.user?.role === "admin"
    || props.user?.role === "qa_manager"
    || props.user?.accessClass === "equipment_manager"
    || props.user?.accessClass === "qa_manager";
  if (!allowed) {
    return (
      <Card variant="strong">
        <CardTitle icon={ShieldCheck}>Không có quyền truy cập</CardTitle>
        <p>Bạn không có quyền truy cập màn Phân quyền &amp; trách nhiệm.</p>
      </Card>
    );
  }
  if (props.user?.accessClass === "equipment_manager" && props.user.role !== "admin") {
    return <EquipmentAssignmentWorkspace acts={props.acts} />;
  }
  return <CurrentPermissionWorkspace acts={props.acts} isAdmin={props.isAdmin} />;
}

function FullPermissionWorkspace(
  { acts, isAdmin = false, user }: { acts: Activity[]; isAdmin?: boolean; user?: AppUser | null },
) {
  /* Một dòng một người, do rpc_nguoi_va_quyen gộp bằng email + user_id ở
     database (migration 20260801110000). Client không gộp lại lần nữa. */
  const [nguoi, setNguoi] = useState<NguoiQuyenRow[]>([]);
  const [tongHangMuc, setTongHangMuc] = useState(0);
  const [luatXem, setLuatXem] = useState<LuatXemRow[]>([]);
  const [quyenA, setQuyenA] = useState<RolePermRow[]>([]);
  const [phanCong, setPhanCong] = useState<AssignmentRow[]>([]);
  const [dsEmail, setDsEmail] = useState<EmailChoPhepRow[]>([]);
  const [loi, setLoi] = useState("");
  const [loiD, setLoiD] = useState("");
  /* Không còn ô chọn bộ phận: bảng hiện mọi người, xếp thành dải theo bộ
     phận. Line thì vẫn là một chiều thật của ma trận phân công (nó nằm
     trong khoá duy nhất), nên vẫn còn ô chọn. */
  const [lineChon, setLineChon] = useState("*");
  const [nguoiMoi, setNguoiMoi] = useState({ ten: "", email: "", bp: "" });
  const [emailMoi, setEmailMoi] = useState({ email: "", ghiChu: "" });
  /** performer đang chờ nối tay với tài khoản → user_id đã chọn. */
  const [dangNoi, setDangNoi] = useState<Record<string, string>>({});
  const [permissionPerson, setPermissionPerson] = useState<DirectoryPerson | null>(null);
  const permissionAreas = useMemo(() => [...new Set(acts.flatMap((activity) => {
    const raw = (activity._raw || {}) as Record<string, unknown>;
    return [activity.area, raw.area, raw.line].map((value) => String(value || "").trim()).filter(Boolean);
  }))].sort((a, b) => a.localeCompare(b, "vi")), [acts]);

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
  /* Danh bạ và ma trận phân công mở hơn một bậc: rpc_upsert_performer và
     rpc_set_assignment nhận cả qa_manager, vì phân công việc là việc của
     QA chứ không riêng quản trị hệ thống. */
  const suaPhanCongDuoc = (isAdmin || user?.role === "qa_manager") && !!supabase;

  /* ---------------- nạp dữ liệu ---------------- */
  const taiNguoiVaQuyen = async () => {
    try {
      const r = await fetchNguoiVaQuyen();
      setNguoi(r.nguoi);
      setTongHangMuc(r.tongHangMuc);
      setLoi("");
    } catch (e) { setLoi((e as Error).message); }
  };
  const taiDsEmail = async () => {
    try { setDsEmail(await fetchEmailChoPhep()); } catch { /* không có quyền thì thôi */ }
  };

  useEffect(() => {
    if (!supabase) { setLoi("Chưa nối Supabase nên chưa đọc được danh sách người dùng."); return; }
    taiNguoiVaQuyen();
    fetchLuatXem().then(setLuatXem).catch(() => { /* không phải admin/QA thì nửa XEM để trống */ });
    fetchRolePermissions().then(setQuyenA).catch((e) => setLoi((e as Error).message));
    fetchAssignments().then(setPhanCong).catch((e) => setLoiD((e as Error).message));
    taiDsEmail();
  }, []);

  /* ================= 1 · DANH SÁCH EMAIL ĐƯỢC PHÉP ================= */
  const doiEmail = async (email: string, choPhep: boolean, ghiChu?: string) => {
    setDangLuu("E");
    try {
      const r = await setEmailChoPhep(email, choPhep, ghiChu);
      setKetQua((c) => ({
        ...c, E: { xong: r.ok ? 1 : 0, tong: 1, loi: r.ok ? [] : [`${email}: ${r.error}`] },
      }));
      if (r.ok) { setEmailMoi({ email: "", ghiChu: "" }); await taiDsEmail(); }
    } catch (e) {
      setKetQua((c) => ({ ...c, E: { xong: 0, tong: 1, loi: [`${email}: ${(e as Error).message}`] } }));
    }
    setDangLuu("");
  };

  /* ================= 2 · MA TRẬN VAI × QUYỀN ================= */
  const mucGoc = (hd: string, vai: string): Muc =>
    (quyenA.find((q) => q.hanh_dong === hd && q.vai_tro === vai)?.muc as Muc) || "khong";
  const khoaA = (hd: string, vai: string) => `A|${hd}|${vai}`;
  const mucHienTai = (hd: string, vai: string): Muc =>
    (nhap[khoaA(hd, vai)] as Muc) ?? mucGoc(hd, vai);

  const bamA = (h: HanhDong, vai: string) => {
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
    /* Đổi luật vai là đổi số hạng mục sửa được của mọi người mang vai đó. */
    await taiNguoiVaQuyen();
    setDangLuu("");
  };

  /** Vai này xem được mấy phần trong số các loại dữ liệu hệ thống giữ. */
  const dongXem = (vai: string | null) => {
    if (!vai || !luatXem.length) return null;
    const het = luatXem.filter((x) => x.muc[vai] === "tat_ca");
    const thieu = luatXem.filter((x) => x.muc[vai] !== "tat_ca");
    return { het: het.length, tong: luatXem.length, thieu };
  };

  /* ================= 3 · TRÁCH NHIỆM & QUYỀN — phần dữ liệu ================= */
  /* Đếm hạng mục theo TÊN người × bộ phận. Đây là phần duy nhất còn khớp
     theo tên, và khớp được là vì owner_name trên hạng mục vốn LÀ một chuỗi
     tên — không có khoá nào tốt hơn để nối. Việc gộp NGƯỜI thì đã chuyển
     hẳn xuống database, nối bằng email + user_id. */
  const { demTheoTen, tongTheoBp, soVoChu } = useMemo(() => {
    const song = acts.filter((a) => (a.state || "active") === "active");
    const dem = new Map<string, Map<string, number>>();
    const tongBp = new Map<string, number>();
    let voChu = 0;
    for (const a of song) {
      const tho = String(a.owner || "").trim();
      const ten = (laTenThat(tho) ? tho : "(chưa phân công)").toLowerCase();
      if (!laTenThat(tho)) voChu++;
      /* Đếm theo CẢ HAI chiều bộ phận, đúng như luật hiện hành so: bộ phận
         QUẢN LÝ đối tượng và bộ phận THỰC HIỆN thẩm định. Hai chiều lệch
         nhau ở 150/448 hạng mục. Chỉ đếm chiều quản lý thì bảng sẽ nói
         người XSX không dính gì tới 107 hạng mục mà chính họ đang đi làm. */
      const quanLy = (a.depts && a.depts.length ? a.depts : [a.dept || "qa"]).filter(Boolean) as string[];
      const thucHien = ((a.execDepts || a.exec_depts || []) as string[]).filter(Boolean);
      const ds = [...new Set([...quanLy, ...thucHien])];
      if (!dem.has(ten)) dem.set(ten, new Map());
      for (const d of ds) {
        dem.get(ten)!.set(d, (dem.get(ten)!.get(d) || 0) + 1);
        tongBp.set(d, (tongBp.get(d) || 0) + 1);
      }
    }
    return { demTheoTen: dem, tongTheoBp: tongBp, soVoChu: voChu };
  }, [acts]);

  const hang = useMemo(() => {
    const hangs = nguoi.map((n) => {
      const ten = String(n.ten || "").trim() || "(chưa đặt tên)";
      const theoBp = demTheoTen.get(ten.toLowerCase()) || new Map<string, number>();
      /* Khoá dòng: pid nếu có, không thì user_id. Ổn định qua mọi lần nạp,
         và không đụng nhau kể cả khi hai người trùng tên. */
      return {
        khoa: (n.pid || n.user_id || ten) as string,
        ten,
        tkId: n.user_id,
        pid: n.pid,
        vai: n.vai,
        /* Hai bộ phận từ hai bảng. Ô trên màn chỉ có MỘT — xem gocBoPhan. */
        bpTaiKhoan: chuanBoPhan(n.bo_phan_tai_khoan),
        bpNguoi: chuanBoPhan(n.bo_phan_nguoi),
        coTaiKhoan: n.co_tai_khoan,
        tkHoatDong: n.tk_hoat_dong,
        email: n.email,
        phamViRieng: n.pham_vi_rieng,
        muc: n.muc,
        soSuaDuoc: n.so_sua_duoc,
        soDungTen: n.so_dung_ten,
        soPhanCong: n.so_phan_cong,
        theoBp,
      };
    }).sort((a, b) => b.soDungTen - a.soDungTen || a.ten.localeCompare(b.ten, "vi"));
    return hangs;
  }, [nguoi, demTheoTen]);

  type HangB = typeof hang[number];

  /** Dòng tổng cho hạng mục chưa ai đứng tên. Không phải một NGƯỜI nên
   *  không nằm trong danh sách người — để lẫn vào đó thì mọi phép đếm
   *  "bao nhiêu người" đều lệch một. */
  const voChuHang = useMemo(() => {
    const theoBp = demTheoTen.get("(chưa phân công)");
    if (!theoBp || !soVoChu) return null;
    return { theoBp, soDungTen: soVoChu };
  }, [demTheoTen, soVoChu]);

  /* MỘT ô bộ phận cho một người, dù dưới database là hai cột ở hai bảng.
     Giá trị gốc lấy bộ phận của TÀI KHOẢN trước, vì đó là cột mà luật
     'chỉ bộ phận mình' đem ra so; bộ phận ở bảng người chỉ là nguồn cho
     ma trận phân công. Lưu thì ghi cả hai, nên chúng hết đường lệch. */
  const gocBoPhan = (r: HangB) => r.bpTaiKhoan || r.bpNguoi || "";
  const lechBoPhan = (r: HangB) =>
    !!r.bpTaiKhoan && !!r.bpNguoi && r.bpTaiKhoan !== r.bpNguoi;

  const vaiHienTai = (r: HangB) => nhap[`Bv|${r.khoa}`] ?? r.vai ?? "";
  const bpHienTai = (r: HangB) => nhap[`Bd|${r.khoa}`] ?? gocBoPhan(r);
  const emailHienTai = (r: HangB) => nhap[`Be|${r.khoa}`] ?? r.email ?? "";
  /** "" = theo mức chung của vai (NULL ở database). */
  const phamViHienTai = (r: HangB) => nhap[`Bp|${r.khoa}`] ?? r.phamViRieng ?? "";

  /** Mức SỬA hiệu lực, dựng lại từ bản nháp: phạm vi riêng thắng mức của
   *  vai — đúng thứ tự mà ly_do_khong_sua_duoc dùng ở server. */
  const mucCuaNguoi = (r: HangB): Muc | null => {
    const rieng = phamViHienTai(r);
    if (rieng) return rieng as Muc;
    const vai = vaiHienTai(r);
    return vai ? mucHienTai("update_progress", vai) : null;
  };

  const bamB = (r: HangB, loai: "v" | "d" | "p", gt: string) => {
    const k = `B${loai}|${r.khoa}`;
    const goc = loai === "v" ? (r.vai || "")
      : loai === "d" ? gocBoPhan(r)
        : (r.phamViRieng || "");
    /* Bấm lại đúng giá trị đang lưu = bỏ thay đổi, không phải lưu lại y
       nguyên. Nếu không, số "thay đổi chưa lưu" sẽ nói dối. */
    if (gt === goc) xoaNhap(k); else dat(k, gt);
    xoaHong(k);
  };

  /* ================= 4 · PHÂN CÔNG — phần dữ liệu ================= */
  /* Khu vực và line CÓ THẬT trong dữ liệu, theo bộ phận. Trước đây đây là
     một khối riêng tự nhận "chưa có hiệu lực"; nay chỉ còn là nguồn cho ô
     chọn line của ma trận — chỗ duy nhất nó có tác dụng. */
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

  /* Người xếp theo bộ phận — thay cho ô chọn bộ phận cũ. Nhóm rỗng vẫn
     hiện: "XSX chưa có ai" là một câu trả lời, không phải một dòng trống
     nên giấu đi. */
  const nhomTheoBp = useMemo(() => {
    const m = new Map<string, HangB[]>();
    DEPTS.forEach((d) => m.set(d.id, []));
    m.set("", []);
    for (const h of hang) {
      const bp = bpHienTai(h);
      if (!m.has(bp)) m.set(bp, []);
      m.get(bp)!.push(h);
    }
    m.forEach((ds) => ds.sort((a, b) => b.soDungTen - a.soDungTen
      || a.ten.localeCompare(b.ten, "vi")));
    return m;
  }, [hang, nhap]);

  /** Line có thật của một bộ phận. Dùng để khoá ô phân công của người mà
   *  bộ phận họ không có line đang chọn. */
  const lineCuaBp = (bp: string) => {
    const o = phamVi.get(bp);
    if (!o) return new Set<string>();
    return new Set([...o.line.keys()].filter((k) => k !== "(chưa khai)"));
  };

  /* Line của MỌI bộ phận, kèm tên bộ phận — vì bảng nay hiện tất cả mọi
     người cùng lúc chứ không lọc theo một bộ phận nữa. */
  const dsLine = useMemo(() => {
    const m = new Map<string, { so: number; bp: Set<string> }>();
    for (const [bp, o] of phamVi) {
      for (const [ln, n] of o.line) {
        if (ln === "(chưa khai)") continue;
        if (!m.has(ln)) m.set(ln, { so: 0, bp: new Set() });
        const x = m.get(ln)!;
        x.so += n;
        x.bp.add(bp);
      }
    }
    return [...m.entries()].sort((a, b) => b[1].so - a[1].so);
  }, [phamVi]);

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

  /* Loại thẩm định CÓ THẬT trong kế hoạch của từng bộ phận. Đếm trên hạng
     mục thật, không đếm trên tám cột cố định — bộ phận không làm PV thì
     thiếu PV không phải lỗi. */
  const loaiTheoBp = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const a of acts) {
      if ((a.state || "active") !== "active") continue;
      const ds = (a.depts && a.depts.length ? a.depts : [a.dept || "qa"]).filter(Boolean) as string[];
      const lt = String(a.vtype || a.type || "").trim();
      if (!lt) continue;
      for (const d of ds) {
        if (!m.has(d)) m.set(d, new Set());
        m.get(d)!.add(lt);
      }
    }
    return m;
  }, [acts]);

  /** Loại thẩm định của bộ phận này mà chưa ai nhận "Thực hiện". */
  const chuaAiNhan = (bp: string) => {
    const coThat = loaiTheoBp.get(bp);
    if (!coThat) return [] as string[];
    const nguoiBp = nhomTheoBp.get(bp) || [];
    return [...coThat].filter((lt) => !nguoiBp.some((h) => pcHienTai(h.ten, lt) === "thuc_hien"));
  };

  /* ================= LƯU ================= */
  /* MỘT nút Lưu cho cả bảng: quyền của người và ô phân công của người nằm
     trên cùng một dòng, nên tách làm hai nút thì sửa một dòng lại phải bấm
     hai chỗ, và quên một chỗ là mất nửa thay đổi. */
  const luuTrachNhiem = async () => {
    setDangLuu("B");
    const khoaSua = new Set<string>();
    Object.keys(nhap).forEach((k) => { if (/^B[vdpe]\|/.test(k)) khoaSua.add(k.slice(3)); });
    const tong = demNhap("Bv|", "Bd|", "Bp|", "Be|", "D|");
    let xong = 0; const loiDs: string[] = [];
    const hong: Record<string, string> = {}; const giu: Record<string, string> = {};

    for (const kh of khoaSua) {
      const r = hang.find((x) => x.khoa === kh);
      const oCua = ["Bv", "Bd", "Bp", "Be"].map((t) => `${t}|${kh}`).filter((k) => nhap[k] != null);
      if (!r) continue;
      const ghiHong = (msg: string) => {
        loiDs.push(`${r.ten}: ${msg}`);
        for (const k of oCua) { hong[k] = msg; giu[k] = nhap[k]; }
      };
      const doiBp = nhap[`Bd|${kh}`] != null;
      const doiEm = nhap[`Be|${kh}`] != null;
      const doiTk = nhap[`Bv|${kh}`] != null || nhap[`Bp|${kh}`] != null || doiBp;
      try {
        /* Bản ghi NGƯỜI trước: tên, email, bộ phận. Có cả hai bản ghi thì
           một ô bộ phận đi xuống cả hai chỗ. */
        if (r.pid && (doiBp || doiEm)) {
          const kq = await upsertPerformer(r.pid, {
            performer_name: r.ten,
            department: bpHienTai(r) || null,
            email: emailHienTai(r).trim() || null,
          });
          if (!kq.ok) { ghiHong(kq.error || "lỗi"); continue; }
        }
        if (r.tkId && doiTk) {
          const kq = await setUserRole(r.tkId, vaiHienTai(r) || "viewer", bpHienTai(r) || null,
            `Đổi phân quyền cho ${r.ten} từ màn Phân quyền`, phamViHienTai(r) || null);
          if (!kq.ok) { ghiHong(kq.error || "lỗi"); continue; }
        }
        /* Sửa email hay bộ phận cho người CHƯA có bản ghi nào để ghi vào
           thì nói thẳng, thay vì im lặng bỏ qua rồi báo "đã lưu". */
        if (!r.pid && !r.tkId && (doiBp || doiEm)) {
          ghiHong("Người này chưa có bản ghi trong danh bạ — chưa lưu được email hay bộ phận.");
          continue;
        }
        xong += oCua.length;
      } catch (e) { ghiHong((e as Error).message); }
    }

    /* Ô phân công. Bộ phận lấy từ chính dòng của người đó — không còn ô
       chọn bộ phận nào để lấy nữa, và cũng không cần: khoá duy nhất của
       vmp_assignment_matrix là (tên, loại, line), bộ phận chỉ là thuộc
       tính đi kèm. */
    const moiPc = [...phanCong];
    for (const [k, v] of Object.entries(nhap).filter(([k2]) => k2.startsWith("D|"))) {
      const [, tenThuong, loai, line] = k.split("|");
      const r = hang.find((x) => x.ten.trim().toLowerCase() === tenThuong);
      const ten = r?.ten || tenThuong;
      const bp = r ? bpHienTai(r) : "";
      if (!bp) {
        loiDs.push(`${ten} × ${loai}: chưa gán bộ phận nên chưa phân công được`);
        hong[k] = "chưa gán bộ phận"; giu[k] = v;
        continue;
      }
      try {
        const kq = await setAssignment(ten, bp, loai, line, v as "" | "thuc_hien" | "ho_tro");
        if (kq.ok) {
          xong++;
          const i = moiPc.findIndex((x) => x.staff_name.trim().toLowerCase() === tenThuong
            && x.validation_type === loai && x.line === line);
          if (i >= 0) moiPc.splice(i, 1);
          if (v) {
            moiPc.push({
              staff_name: ten, department: bp, validation_type: loai,
              line, vai_tro: v as AssignmentRow["vai_tro"],
            });
          }
        } else { loiDs.push(`${ten} × ${loai}: ${kq.error}`); hong[k] = kq.error || "lỗi"; giu[k] = v; }
      } catch (e) {
        loiDs.push(`${ten} × ${loai}: ${(e as Error).message}`);
        hong[k] = (e as Error).message; giu[k] = v;
      }
    }
    setPhanCong(moiPc);

    chotLuot("B", ["Bv|", "Bd|", "Bp|", "Be|", "D|"], tong, xong, loiDs, giu, hong);
    /* Đổi bộ phận, phạm vi hay ô phân công đều làm số hạng mục sửa được
       của người đó khác đi — đọc lại để cột Sửa được không nói con số cũ. */
    await taiNguoiVaQuyen();
    setDangLuu("");
  };

  const themNguoi = async () => {
    const ten = nguoiMoi.ten.trim();
    if (!laTenThat(ten)) return;
    setDangLuu("B");
    try {
      const r = await upsertPerformer(null, {
        performer_name: ten,
        email: nguoiMoi.email.trim() || null,
        department: nguoiMoi.bp || null,
      });
      if (r.ok) {
        setNguoiMoi({ ten: "", email: "", bp: "" });
        await taiNguoiVaQuyen();
        setKetQua((c) => ({ ...c, B: { xong: 1, tong: 1, loi: [] } }));
      } else {
        setKetQua((c) => ({ ...c, B: { xong: 0, tong: 1, loi: [`Thêm ${ten}: ${r.error}`] } }));
      }
    } catch (e) {
      setKetQua((c) => ({ ...c, B: { xong: 0, tong: 1, loi: [`Thêm ${ten}: ${(e as Error).message}`] } }));
    }
    setDangLuu("");
  };

  /** Nối tay người thực hiện với tài khoản. Không đi qua bản nháp: đây là
   *  thao tác một lần, một dòng, và kết quả đổi cả bảng — giữ nó ở nháp thì
   *  bảng nói một đằng còn database một nẻo cho tới lúc bấm Lưu. */
  const noiTaiKhoan = async (pid: string, userId: string | null, ten: string) => {
    setDangLuu("B");
    try {
      const r = await lienKetTaiKhoan(pid, userId);
      setKetQua((c) => ({
        ...c, B: { xong: r.ok ? 1 : 0, tong: 1, loi: r.ok ? [] : [`${ten}: ${r.error}`] },
      }));
      if (r.ok) {
        setDangNoi((c) => { const n = { ...c }; delete n[pid]; return n; });
        await taiNguoiVaQuyen();
      }
    } catch (e) {
      setKetQua((c) => ({ ...c, B: { xong: 0, tong: 1, loi: [`${ten}: ${(e as Error).message}`] } }));
    }
    setDangLuu("");
  };

  /* ================= KẾT LUẬN ================= */
  /* Tài khoản chưa nối được với người nào — nguồn cho ô "nối tay". Đây
     chính là những dòng mà khớp-theo-tên ngày trước làm hỏng. */
  const tkChuaNoi = useMemo(() => nguoi.filter((n) => n.co_tai_khoan && !n.pid), [nguoi]);

  /* Bốn khoảng hở, xếp theo mức đáng lo giảm dần. */
  const thieuTaiKhoan = hang.filter((h) => h.soDungTen > 0 && !h.coTaiKhoan);
  const thieuEmail = hang.filter((h) => h.soDungTen > 0 && !h.email);
  /* Có tài khoản, vai cho phép sửa, nhưng luật cho sửa 0 hạng mục. Kiểu
     hỏng im lặng: người đó đăng nhập được, nhìn thấy hết, bấm sửa thì bị
     từ chối, và không có gì trên màn nói vì sao — trừ dòng này. */
  const quyenRong = hang.filter((h) => h.coTaiKhoan && h.soSuaDuoc === 0 && h.muc !== "khong");
  const lechBp = hang.filter(lechBoPhan);

  const ketLuan = useMemo(() => {
    if (loi) return { chinh: "Chưa đọc được danh sách người dùng.", phu: loi, tone: "warn" as const };
    if (!nguoi.length) return { chinh: "Đang đọc danh sách người dùng…", phu: "", tone: "ok" as const };
    const soHm = thieuTaiKhoan.reduce((s, h) => s + h.soDungTen, 0);
    if (thieuTaiKhoan.length) {
      return {
        chinh: `${thieuTaiKhoan.length} người đang đứng tên ${soHm} hạng mục nhưng CHƯA CÓ TÀI KHOẢN — họ không tự cập nhật được việc của mình.`,
        phu: `${thieuTaiKhoan.map((h) => `${h.ten} (${h.soDungTen})`).join(" · ")}. `
          + `Đây là lý do phần lớn hạng mục phải nhờ người khác nhập hộ, và nhập hộ thì cột "người sửa" trong nhật ký không còn đúng người làm.`,
        tone: "over" as const,
      };
    }
    return {
      chinh: `${nguoi.length} người, ${nguoi.filter((n) => n.co_tai_khoan).length} tài khoản `
        + `— ai đang đứng tên hạng mục cũng có tài khoản.`,
      phu: "Kiểm tiếp cột Sửa được: có tài khoản mà sửa được 0 hạng mục thì đăng nhập cũng không làm được gì.",
      tone: "ok" as const,
    };
  }, [loi, nguoi, thieuTaiKhoan]);

  /* Kết luận của nửa trách nhiệm, bao cả bộ phận chứ không phải từng bộ
     phận một. Ô chọn bộ phận cũ bắt người dùng đi qua sáu lần mới biết chỗ
     nào hổng; một câu là đủ. */
  const ketLuanD = useMemo(() => {
    const tenLine = lineChon === "*" ? "Mọi line" : `Line ${lineChon}`;
    const hong = DEPTS.map((d) => ({ d, thieu: chuaAiNhan(d.id) })).filter((x) => x.thieu.length);
    const coKeHoach = DEPTS.filter((d) => (loaiTheoBp.get(d.id)?.size || 0) > 0);
    if (!coKeHoach.length) {
      return {
        chinh: "Chưa có hạng mục thẩm định nào trong kế hoạch để đối chiếu phân công.",
        phu: "Vẫn tích được để chuẩn bị; bảng chỉ chưa có gì để so.",
        tone: "ok" as const,
      };
    }
    if (hong.length) {
      return {
        chinh: `${tenLine}: ${hong.length}/${coKeHoach.length} bộ phận có loại thẩm định CHƯA ai nhận thực hiện.`,
        phu: hong.map((x) => `${x.d.short}: ${x.thieu.join(", ")}`).join(" · ")
          + ". Kế hoạch có hạng mục thuộc các loại này nhưng ma trận chưa chỉ ra ai làm — "
          + "và người để phạm vi “theo phân công” ở bộ phận đó thì không sửa được gì.",
        tone: "over" as const,
      };
    }
    return {
      chinh: `${tenLine}: mọi loại thẩm định có trong kế hoạch đều đã có người thực hiện.`,
      phu: coKeHoach.map((d) => `${d.short} ${[...(loaiTheoBp.get(d.id) || [])].sort().join("/")}`).join(" · "),
      tone: "ok" as const,
    };
  }, [loaiTheoBp, nhomTheoBp, lineChon, gocPhanCong, nhap]);

  /* ---------------- kiểu dùng chung ---------------- */
  const th: React.CSSProperties = {
    textAlign: "left", padding: "10px 12px", fontSize: 12, fontWeight: 800,
    color: C.plumSoft, borderBottom: `1px solid ${C.line}`, whiteSpace: "nowrap",
  };
  const td: React.CSSProperties = {
    padding: "10px 12px", fontSize: 14, color: C.plum, borderBottom: `1px solid ${C.line}`,
  };
  const dai: React.CSSProperties = {
    padding: "9px 12px", fontSize: 12, fontWeight: 900, letterSpacing: .3,
    borderBottom: `1px solid ${C.line}`, background: C.surfaceSunk, color: C.plum,
  };
  const CHIP_BP = [{ id: "", nhan: "chưa gán", mo: "Không thuộc bộ phận nào" },
    ...DEPTS.map((d) => ({ id: d.id, nhan: d.short, mo: d.name }))];
  /* "theo vai" đứng đầu vì đó là mặc định đúng cho hầu hết mọi người: đặt
     phạm vi riêng là tách người đó ra khỏi bảng luật chung, và một ngoại lệ
     ai cũng quên mất là một ngoại lệ sẽ gây bất ngờ về sau. */
  const CHIP_PHAM_VI = [
    { id: "", nhan: "theo vai", mo: "Đi theo mức chung của vai ở ma trận quyền" },
    ...(["co", "bo_phan", "phan_cong", "khong"] as Muc[]).map((m) => ({
      id: m,
      nhan: `${O_QUYEN[m].ky} ${m === "co" ? "mọi hạng mục" : m === "bo_phan" ? "bộ phận mình"
        : m === "phan_cong" ? "theo phân công" : "không"}`,
      mo: O_QUYEN[m].chu,
    })),
  ];

  /* Một dòng của ma trận trách nhiệm & quyền. Tách thành hàm vì nó được
     gọi từ trong vòng lặp nhóm bộ phận — nhét thẳng vào JSX thì thân vòng
     lặp dài tới mức không đọc được cấu trúc nhóm nữa. */
  const veDongNguoi = (h: HangB) => {
    const suaVai = quyenSuaA && !!h.tkId;
    const suaNguoi = suaPhanCongDuoc;
    const xem = dongXem(vaiHienTai(h) || null);
    const spread = [...h.theoBp.entries()].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
    const bp = bpHienTai(h);
    const lines = lineCuaBp(bp);
    /* Ba lý do khoá ô phân công, và ô phải nói ra lý do nào — "bấm không
       ăn" mà không giải thích là cách nhanh nhất để người dùng kết luận
       màn hình hỏng. */
    const lyDoKhoa = !suaPhanCongDuoc ? "bạn không có quyền sửa phân công"
      : !bp ? "chưa gán bộ phận nên chưa phân công được"
        : (lineChon !== "*" && !lines.has(lineChon))
          ? `bộ phận ${(DEPTS.find((d) => d.id === bp)?.short || bp)} không có line ${lineChon}`
          : "";
    /* Người này còn ô phân công ở line khác line đang xem. Không nói ra thì
       bảng trông như họ chưa nhận gì, trong khi cột Sửa được lại nói khác. */
    const oLineKhac = phanCong.filter((x) =>
      x.staff_name.trim().toLowerCase() === h.ten.trim().toLowerCase() && x.line !== lineChon).length;

    return (
      <tr key={h.khoa}>
        <td style={{ ...td, fontWeight: 800, minWidth: 250 }}>
          {h.ten}
          <div style={{ fontSize: 11.5, fontWeight: 700, marginTop: 3,
                        display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
            {h.coTaiKhoan
              ? <Tag color={C.mintText} bg={C.mintSoft}>có tài khoản</Tag>
              : <Tag color={C.raspText} bg={C.raspSoft}>chưa có tài khoản</Tag>}
            {h.coTaiKhoan && !h.tkHoatDong && (
              <Tag color={C.raspText} bg={C.raspSoft}>đã khoá</Tag>
            )}
          </div>

          {/* Email là KHOÁ NỐI người ↔ tài khoản, không còn là ô ghi chú.
              Sửa nó là sửa cái mà database dùng để nhận ra "hai dòng này
              là một người". */}
          <div style={{ marginTop: 5 }}>
            {suaNguoi && h.pid ? (
              <input className={`pq-o${nhap[`Be|${h.khoa}`] != null ? " la-nhap" : ""}${oHong[`Be|${h.khoa}`] ? " la-hong" : ""}`}
                type="email" inputMode="email" style={{ maxWidth: 230, fontSize: 12.5 }}
                aria-label={`Email của ${h.ten}`} placeholder="chưa có email"
                value={emailHienTai(h)}
                onChange={(e) => {
                  const k = `Be|${h.khoa}`;
                  if (e.target.value === (h.email || "")) xoaNhap(k);
                  else dat(k, e.target.value);
                }} />
            ) : (
              <span style={{ fontSize: 12.5, fontWeight: 700,
                             color: h.email ? C.plumSoft : C.marigoldText }}>
                {h.email || "chưa có email"}
              </span>
            )}
          </div>

          {/* Nối tay: chỉ hiện cho người chưa có tài khoản mà hệ thống ĐANG
              CÓ tài khoản chưa nhận chủ. Nối bằng email đã tự chạy lúc
              migration; ô này là đường cho trường hợp email hai bên khác
              nhau. */}
          {quyenSuaA && h.pid && !h.tkId && tkChuaNoi.length > 0 && (
            <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
              <select className="pq-o pq-loc" style={{ maxWidth: 210, fontSize: 12 }}
                aria-label={`Nối ${h.ten} với tài khoản`}
                value={dangNoi[h.pid] || ""}
                onChange={(e) => setDangNoi((c) => ({ ...c, [h.pid!]: e.target.value }))}>
                <option value="">— nối với tài khoản —</option>
                {tkChuaNoi.map((t) => (
                  <option key={t.user_id!} value={t.user_id!}>
                    {t.ten || "(chưa đặt tên)"} · {t.email || "không email"}
                  </option>
                ))}
              </select>
              <button type="button" className="pq-nut"
                disabled={!dangNoi[h.pid] || dangLuu === "B"}
                onClick={() => noiTaiKhoan(h.pid!, dangNoi[h.pid!], h.ten)}>
                Nối
              </button>
            </div>
          )}
          {quyenSuaA && h.pid && h.tkId && (
            <button type="button" className="pq-nut"
              style={{ marginTop: 6, fontSize: 12 }} disabled={dangLuu === "B"}
              title="Gỡ nối người này khỏi tài khoản — dùng khi nối nhầm hai người thành một."
              onClick={() => noiTaiKhoan(h.pid!, null, h.ten)}>
              Gỡ nối tài khoản
            </button>
          )}
        </td>

        <td style={td}>
          <NhomChip ds={CHIP_BP} dangChon={bp}
            khoa={!suaNguoi || (!h.pid && !h.tkId)}
            nhap={nhap[`Bd|${h.khoa}`] != null} hong={oHong[`Bd|${h.khoa}`]}
            onChon={(x) => bamB(h, "d", x)} nhan={`Bộ phận của ${h.ten}`} />
        </td>

        <td style={td}>
          {h.tkId ? (
            <NhomChip ds={VAI.map((v) => ({ id: v.id, nhan: v.ten, mo: v.mo }))}
              dangChon={vaiHienTai(h)} khoa={!suaVai}
              nhap={nhap[`Bv|${h.khoa}`] != null} hong={oHong[`Bv|${h.khoa}`]}
              onChon={(x) => bamB(h, "v", x)} nhan={`Vai trò của ${h.ten}`} />
          ) : <span style={{ color: C.plumSoft }}>chưa có tài khoản</span>}
        </td>

        <td style={td}>
          {h.tkId ? (
            <NhomChip ds={CHIP_PHAM_VI} dangChon={phamViHienTai(h)} khoa={!suaVai}
              nhap={nhap[`Bp|${h.khoa}`] != null} hong={oHong[`Bp|${h.khoa}`]}
              onChon={(x) => bamB(h, "p", x)} nhan={`Phạm vi riêng của ${h.ten}`} />
          ) : <span style={{ color: C.plumSoft }}>—</span>}
        </td>

        <td style={{ ...td, textAlign: "center" }}>
          {!h.coTaiKhoan ? (
            <span title="Không có tài khoản thì không vào được, không xem được gì"
              style={{ color: C.raspText, fontWeight: 700, fontSize: 12.5 }}>
              chưa vào được
            </span>
          ) : xem ? (
            <span title={xem.thieu.length
              ? `Xem đầy đủ ${xem.het}/${xem.tong} loại dữ liệu. Bị hạn chế: `
                + xem.thieu.map((x) => `${x.nhan} (${O_XEM[x.muc[vaiHienTai(h)] || "khong_ro"].chu.toLowerCase()})`).join("; ")
              : "Xem được toàn bộ dữ liệu hệ thống giữ"}
              style={{
                display: "inline-block", minWidth: 44, padding: "4px 9px", borderRadius: 8,
                fontFamily: NUM, fontSize: 13, fontWeight: 800,
                background: xem.thieu.length ? C.skySoft : C.mintSoft,
                color: xem.thieu.length ? C.skyText : C.mintText,
              }}>
              {xem.het}<span style={{ opacity: .6 }}>/{xem.tong}</span>
            </span>
          ) : <span style={{ color: C.plumSoft, opacity: .6 }}>·</span>}
        </td>

        <td style={{ ...td, textAlign: "center" }}>
          {h.coTaiKhoan ? (() => {
            /* Con số là của lần nạp gần nhất. Nếu bản nháp vừa đổi mức hiệu
               lực thì nó đã cũ — nói ra thay vì để người dùng tin một con
               số không còn đúng. */
            const mucMoi = mucCuaNguoi(h);
            const daCu = !!mucMoi && mucMoi !== h.muc;
            return (
              <>
                <span title={daCu
                  ? `Bạn vừa đổi mức thành “${O_QUYEN[mucMoi].chu}”. Con số ${h.soSuaDuoc}/${tongHangMuc} còn là của mức cũ — bấm Lưu để database đếm lại.`
                  : `${h.ten} sửa được ${h.soSuaDuoc}/${tongHangMuc} hạng mục theo luật đang chạy`}
                  style={{
                    display: "inline-block", minWidth: 62, padding: "4px 9px", borderRadius: 8,
                    fontFamily: NUM, fontSize: 13, fontWeight: 800,
                    opacity: daCu ? .45 : 1,
                    background: h.soSuaDuoc === 0 ? C.raspSoft
                      : h.soSuaDuoc === tongHangMuc ? C.mintSoft : C.skySoft,
                    color: h.soSuaDuoc === 0 ? C.raspText
                      : h.soSuaDuoc === tongHangMuc ? C.mintText : C.skyText,
                  }}>
                  {h.soSuaDuoc}<span style={{ opacity: .6 }}>/{tongHangMuc}</span>
                </span>
                {daCu && (
                  <div style={{ fontSize: 11, fontWeight: 800, marginTop: 3, color: C.marigoldText }}>
                    → {O_QUYEN[mucMoi].ky} chưa lưu
                  </div>
                )}
              </>
            );
          })() : <span style={{ color: C.plumSoft, opacity: .6 }}>·</span>}
        </td>

        <td style={{ ...td, textAlign: "center", background: C.pinkMist }}>
          <div style={{ fontFamily: NUM, fontSize: 14, fontWeight: 800,
                        color: h.soDungTen ? C.plum : C.plumSoft }}>
            {h.soDungTen || "·"}
          </div>
          {spread.length > 0 && (
            <div style={{ fontSize: 11, fontWeight: 700, color: C.plumSoft, marginTop: 2 }}
              title="Đếm cả hai chiều: bộ phận quản lý đối tượng và bộ phận thực hiện thẩm định — một hạng mục có thể nằm ở hai bộ phận">
              {spread.map(([d, n]) => `${DEPTS.find((x) => x.id === d)?.short || d} ${n}`).join(" · ")}
            </div>
          )}
        </td>

        {LOAI_TD.map((lt, i) => {
          const k = khoaD(h.ten, lt);
          const dang = pcHienTai(h.ten, lt);
          const o = dang ? VAI_O[dang] : null;
          return (
            <td key={lt} style={{ ...td, textAlign: "center", padding: "6px 4px",
                                  background: C.pinkMist }}>
              <OTich ky={o ? o.ky : "＋"}
                chu={lyDoKhoa || (o ? o.chu : "chưa phân công")}
                mau={o ? o.mau : C.plumSoft} nen={o ? o.nen : C.surfaceSunk}
                khoa={!!lyDoKhoa}
                nhap={nhap[k] != null} hong={oHong[k]}
                onClick={() => bamD(h.ten, lt)}
                nhan={`${h.ten} · ${lt} · ${lineChon === "*" ? "mọi line" : lineChon}`} />
              {i === LOAI_TD.length - 1 && oLineKhac > 0 && (
                <div style={{ fontSize: 10.5, fontWeight: 800, color: C.skyText, marginTop: 2 }}
                  title="Người này còn ô phân công ở line khác — đổi ô chọn line ở trên để thấy">
                  +{oLineKhac} line khác
                </div>
              )}
            </td>
          );
        })}
      </tr>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Card variant="strong">
        <CardTitle icon={ShieldCheck}
          sub="Ba khối, theo thứ tự người ta thật sự hỏi: ai vào được · vai nào làm gì · từng người ra sao">
          Ma trận phân quyền &amp; trách nhiệm
        </CardTitle>
        <CauKetLuan chinh={ketLuan.chinh} phu={ketLuan.phu} tone={ketLuan.tone} />
      </Card>

      {/* Nguồn chuẩn mới: mọi chọn người ở lớp quyền theo hạng mục đều đi
          qua person_id. Khối cũ bên dưới vẫn được giữ trong giai đoạn
          preview để các bộ phận đối chiếu trước khi chuyển đổi hoàn toàn. */}
      <Card variant="strong">
        <CardTitle icon={Users}
          sub="Một danh bạ chuẩn nối tên · tài khoản · bộ phận · phân loại · phạm vi · khu vực; quyền theo hạng mục đang ở lớp dự thảo cho tới khi Admin chủ động bật">
          Danh bạ nhân sự &amp; quyền
        </CardTitle>
        <div className="ip-workspace">
          <StaffDirectoryPanel canEdit={quyenSuaA} validAreas={permissionAreas} onSelect={setPermissionPerson} />
          <AssignmentPanel person={permissionPerson} canEdit={quyenSuaA || suaPhanCongDuoc} />
          <EffectiveRightsPanel person={permissionPerson} />
        </div>
      </Card>

      {/* ============ 1 · AI ĐƯỢC PHÉP CÓ TÀI KHOẢN ============ */}
      <Card variant="strong">
        <CardTitle icon={Mail}
          sub="Cửa vào duy nhất: không có email ở đây thì Supabase từ chối tạo tài khoản, kể cả tạo tay trong Dashboard.">
          1 · Ai được phép có tài khoản
        </CardTitle>

        <CauKetLuan tone="ok"
          chinh={`${dsEmail.filter((e) => e.is_active).length} email được phép tạo tài khoản.`}
          phu="Trước 01/08/2026 bất kỳ ai trên internet cũng tự đăng ký được bằng khoá công khai nằm trong mã nguồn trang. Nay trigger ở database chặn mọi email không có trong danh sách này — chặn ở database chứ không chỉ tắt ô tick trên Dashboard, vì ô tick thì không ai nhìn lại còn trigger thì đi theo mã nguồn."
        />

        {quyenSuaA && (
          <div className="pq-them" style={{ marginTop: 14 }}>
            <input className="pq-o" style={{ maxWidth: 260 }} type="email" placeholder="email@congty.com"
              aria-label="Email được phép tạo tài khoản" value={emailMoi.email}
              onChange={(e) => setEmailMoi((c) => ({ ...c, email: e.target.value }))} />
            <input className="pq-o" style={{ maxWidth: 260 }} placeholder="Ghi chú — ai, bộ phận nào"
              aria-label="Ghi chú cho email này" value={emailMoi.ghiChu}
              onChange={(e) => setEmailMoi((c) => ({ ...c, ghiChu: e.target.value }))} />
            <button type="button" className="pq-nut la-chinh"
              disabled={!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailMoi.email.trim()) || dangLuu === "E"}
              onClick={() => doiEmail(emailMoi.email.trim(), true, emailMoi.ghiChu.trim())}>
              <Plus size={15} /> Cho phép email này
            </button>
          </div>
        )}

        <div className="vmp-scroll" style={{ overflowX: "auto", marginTop: 12 }}>
          <table style={{ width: "100%", minWidth: 640, borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Email</th>
                <th style={th}>Ghi chú</th>
                <th style={th}>Tình trạng</th>
                <th style={th}>Đã có tài khoản</th>
                {quyenSuaA && <th style={th} />}
              </tr>
            </thead>
            <tbody>
              {dsEmail.map((e) => {
                const coTk = nguoi.some((n) => n.co_tai_khoan
                  && (n.email || "").toLowerCase() === e.email);
                return (
                  <tr key={e.email}>
                    <td style={{ ...td, fontWeight: 800 }}>{e.email}</td>
                    <td style={{ ...td, fontSize: 12.5, color: C.plumSoft, fontWeight: 700 }}>
                      {e.ghi_chu || "—"}
                    </td>
                    <td style={td}>
                      {e.is_active
                        ? <Tag color={C.mintText} bg={C.mintSoft}>được phép</Tag>
                        : <Tag color={C.plumSoft} bg={C.surfaceSunk}>đã bỏ</Tag>}
                    </td>
                    <td style={td}>
                      {coTk
                        ? <Tag color={C.mintText} bg={C.mintSoft}>rồi</Tag>
                        : <span style={{ color: C.marigoldText, fontWeight: 700, fontSize: 12.5 }}>
                            chưa — người này còn phải được tạo tài khoản ở Supabase
                          </span>}
                    </td>
                    {quyenSuaA && (
                      <td style={td}>
                        {e.is_active ? (
                          <button type="button" className="pq-nut" disabled={dangLuu === "E"}
                            onClick={() => doiEmail(e.email, false)}
                            title="Bỏ email khỏi danh sách. Không bỏ được nếu đang gắn với tài khoản còn hoạt động.">
                            <Trash2 size={14} /> Bỏ
                          </button>
                        ) : (
                          <button type="button" className="pq-nut" disabled={dangLuu === "E"}
                            onClick={() => doiEmail(e.email, true)}>
                            <Plus size={14} /> Cho phép lại
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
              {!dsEmail.length && (
                <tr><td style={td} colSpan={5}>
                  Chưa đọc được danh sách — cần đăng nhập bằng tài khoản admin.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>

        {ketQua.E && (
          <div className={`pq-canhbao ${ketQua.E.loi.length ? "la-do" : ""}`}
            style={{ marginTop: 12, background: ketQua.E.loi.length ? undefined : C.mintSoft,
                     color: ketQua.E.loi.length ? undefined : C.mintText }} role="status">
            {ketQua.E.loi.length
              ? <><AlertTriangle size={16} /> <span>{ketQua.E.loi[0]}</span></>
              : <><Check size={16} /> <span>Đã lưu danh sách email.</span></>}
          </div>
        )}

        <div style={{ marginTop: 14, padding: "11px 14px", borderRadius: 14, background: C.surfaceSunk,
                      fontSize: 13, color: C.plumSoft, fontWeight: 600, lineHeight: 1.7 }}>
          <b style={{ color: C.plum }}>Thêm một người mới, đủ ba bước:</b> ① thêm email vào danh sách này →
          ② vào <b>Supabase Dashboard → Authentication → Users → Add user</b>, tạo tài khoản với đúng email
          đó → ③ xuống <b>ma trận 3</b> bên dưới, tích vai trò và bộ phận. Bỏ bước ① thì Supabase từ chối
          tạo; bỏ bước ③ thì họ đăng nhập được nhưng chỉ xem được, không sửa gì.
        </div>
      </Card>

      {/* ============ 2 · MA TRẬN VAI × QUYỀN ============ */}
      <Card variant="strong">
        <CardTitle icon={KeyRound}
          sub="Hai nửa, hai nguồn luật khác nhau: nửa XEM đọc policy RLS của Postgres, nửa SỬA đọc bảng vmp_role_permissions mà 23 hàm RPC tra khi quyết định cho hay không cho">
          2 · Vai nào xem được gì, sửa được gì
        </CardTitle>

        <div className="vmp-scroll" style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: 820, borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Nội dung / Hành động</th>
                {VAI.map((v) => (
                  <th key={v.id} style={{ ...th, textAlign: "center" }}>
                    <div style={{ fontFamily: "ui-monospace, monospace", color: C.plum }}>{v.ten}</div>
                    <div style={{ fontWeight: 600, opacity: .8 }}>{v.mo}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* ---- nửa XEM ---- */}
              <tr>
                <td style={dai} colSpan={5}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <Eye size={15} /> XEM ĐƯỢC GÌ — do Row Level Security của Postgres quyết, KHÔNG sửa ở đây
                    <GiaiThich tieuDe="Vì sao nửa này không sửa được">
                      {"Quyền đọc do Postgres chặn ở tầng dưới cùng, trước cả khi hàm RPC nào chạy. Không có bảng luật nào để tích — muốn đổi thì phải sửa policy RLS bằng migration.\n\n"
                        + "Bảng này KHÔNG chép tay lại luật: rpc_luat_xem đi đọc chính những policy đang chạy trong pg_policy rồi phân loại ra mức. Nên nó không thể lệch với thực tế — ngày ai đó sửa policy, bảng đổi theo.\n\n"
                        + "Ô hiện dấu '?' nghĩa là hàm gặp một dạng biểu thức nó chưa nhận diện được. Lúc đó nó KHÔNG đoán: rê chuột vào ô để đọc nguyên văn biểu thức RLS."}
                    </GiaiThich>
                  </span>
                </td>
              </tr>
              {luatXem.map((x) => (
                <tr key={x.bang}>
                  <td style={{ ...td, fontWeight: 700 }}>
                    {x.nhan}
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: C.plumSoft,
                                  fontFamily: "ui-monospace, monospace" }}>
                      {x.bang}
                    </div>
                  </td>
                  {VAI.map((v) => {
                    const m = x.muc[v.id] || "khong_ro";
                    const o = O_XEM[m];
                    return (
                      <td key={v.id} style={{ ...td, textAlign: "center" }}>
                        <OTich ky={o.ky} mau={o.mau} nen={o.nen} khoa
                          chu={`${o.chu}${x.bieu_thuc ? `\nPolicy: ${x.bieu_thuc}` : "\nBảng không có policy đọc nào"}`}
                          nhan={`${x.nhan} × ${v.ten}`} />
                      </td>
                    );
                  })}
                </tr>
              ))}
              {!luatXem.length && (
                <tr><td style={{ ...td, color: C.plumSoft }} colSpan={5}>
                  Chưa đọc được luật xem — cần đăng nhập bằng tài khoản admin hoặc phụ trách QA.
                </td></tr>
              )}

              {/* ---- nửa SỬA ---- */}
              <tr>
                <td style={dai} colSpan={5}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <Pencil size={15} /> SỬA ĐƯỢC GÌ — bảng vmp_role_permissions, tích ở đây là đổi quyền thật
                  </span>
                </td>
              </tr>
              {HANH_DONG.map((h) => (
                <tr key={h.id}>
                  <td style={{ ...td, fontWeight: 700 }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      {h.ten.split("\n").map((d, i) => <span key={i}>{i ? <><br />{d}</> : d}</span>)}
                      <GiaiThich tieuDe={h.ten.replace("\n", " ")}>{h.giaiThich}</GiaiThich>
                    </span>
                  </td>
                  {VAI.map((v) => {
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
          <span><b style={{ color: C.mintText }}>✓</b> Được — mọi hạng mục · xem toàn bộ</span>
          <span><b style={{ color: C.marigoldText }}>◑</b> Bộ phận mình — quản lý <i>hoặc</i> thực hiện · phần không nhạy cảm</span>
          <span><b style={{ color: C.skyText }}>◔</b> Theo phân công · chỉ của chính mình</span>
          <span><b>✕</b> Không</span>
          <span><b style={{ color: C.raspText }}>?</b> Chưa phân loại được policy — rê chuột đọc nguyên văn</span>
          <span>Hai mức hạn chế ở nửa SỬA chỉ có ở hàng <b>Cập nhật tiến độ</b> — các hàm khác chưa có
            vế so bộ phận trong luật.</span>
        </div>

        <ThanhLuu soThayDoi={demNhap("A|")} dangLuu={dangLuu === "A"}
          ketQua={ketQua["A|"] || null} onLuu={luuA} onHoanTac={() => boNhap("A|", "A|")}
          khoa={!quyenSuaA}
          ghiChu="Tích chọn ở nửa SỬA để đổi mức quyền, xong bấm Lưu. Nửa XEM chỉ để đọc." />
      </Card>

      {/* ============ 3 · MA TRẬN TRÁCH NHIỆM & QUYỀN ============ */}
      {/* Một dòng một người, và trên dòng đó có ĐỦ cả hai vế: người này
          được phép làm gì, và đang nhận làm gì. Trước đây hai vế nằm ở hai
          bảng cách nhau một màn cuộn, nên câu hỏi thật sự đáng hỏi — "người
          nhận làm PQ có quyền sửa PQ không" — phải tự ghép trong đầu. */}
      <Card variant="strong">
        <CardTitle icon={Users}
          sub="Một dòng một người: bên trái là quyền (vai, phạm vi, xem gì, sửa được bao nhiêu), bên phải là trách nhiệm (đứng tên bao nhiêu, nhận làm loại thẩm định nào)">
          3 · Ma trận trách nhiệm &amp; quyền
        </CardTitle>

        <CauKetLuan chinh={ketLuanD.chinh} phu={ketLuanD.phu} tone={ketLuanD.tone} />

        {(thieuTaiKhoan.length > 0 || thieuEmail.length > 0 || quyenRong.length > 0
          || lechBp.length > 0) && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, margin: "14px 0" }}>
            {quyenRong.length > 0 && (
              <div className="pq-canhbao la-do">
                <AlertTriangle size={17} style={{ flexShrink: 0, marginTop: 2 }} />
                <span>Đăng nhập được nhưng sửa được <b>0 hạng mục</b>:{" "}
                  <b>{quyenRong.map((h) => h.ten).join(", ")}</b> — vai của họ cho phép sửa, nhưng
                  bộ phận hoặc ô phân công thì chưa có gì để so, nên hàm chặn hết. Họ sẽ thấy toàn
                  bộ số liệu, bấm sửa, và bị từ chối mà không hiểu vì sao.</span>
              </div>
            )}
            {thieuTaiKhoan.length > 0 && (
              <div className="pq-canhbao la-do">
                <AlertTriangle size={17} style={{ flexShrink: 0, marginTop: 2 }} />
                <span>Chưa có tài khoản: <b>{thieuTaiKhoan.map((h) => h.ten).join(", ")}</b> — không đăng nhập được nên không tự cập nhật tiến độ của mình.</span>
              </div>
            )}
            {lechBp.length > 0 && (
              <div className="pq-canhbao la-vang">
                <AlertTriangle size={17} style={{ flexShrink: 0, marginTop: 2 }} />
                <span>Bộ phận ghi khác nhau ở hai bảng: <b>{lechBp.map((h) => h.ten).join(", ")}</b> —
                  ô bộ phận dưới đây đang hiện bộ phận của TÀI KHOẢN (cột mà luật đem ra so).
                  Bấm Lưu một lần là hai bên khớp lại.</span>
              </div>
            )}
            {thieuEmail.length > 0 && (
              <div className="pq-canhbao la-vang">
                <AlertTriangle size={17} style={{ flexShrink: 0, marginTop: 2 }} />
                <span>Chưa có email: <b>{thieuEmail.map((h) => h.ten).join(", ")}</b> — không nhận được cảnh báo đến hạn, và không nối được với tài khoản.</span>
              </div>
            )}
          </div>
        )}

        <div style={{ display: "flex", gap: "10px 18px", flexWrap: "wrap", alignItems: "flex-end",
                      margin: "14px 0 12px" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: C.plumSoft }}>
              Ô phân công đang khai cho
            </span>
            <select className="pq-o pq-loc" style={{ maxWidth: 320 }} value={lineChon}
              disabled={!dsLine.length}
              onChange={(e) => setLineChon(e.target.value)}>
              <option value="*">Mọi line — phân công chung</option>
              {dsLine.map(([k, x]) => (
                <option key={k} value={k}>
                  {k} ({[...x.bp].map((b) => DEPTS.find((d) => d.id === b)?.short || b).join("/")}
                  , {x.so} hạng mục)
                </option>
              ))}
            </select>
          </label>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: C.plumSoft, paddingBottom: 8,
                        maxWidth: 560, lineHeight: 1.6 }}>
            {dsLine.length
              ? <>Tám cột bên phải là phân công ở <b>{lineChon === "*" ? "mọi line" : `line ${lineChon}`}</b>.
                  Tích ở “Mọi line” là phân công chung cho cả bộ phận; chọn một line cụ thể để khai riêng.</>
              : <>Dữ liệu chưa chia line — chỉ có một cột phân công chung.</>}
          </div>
        </div>

        {suaPhanCongDuoc && (
          <div className="pq-them">
            <input className="pq-o" style={{ maxWidth: 240 }} placeholder="Họ tên người mới"
              aria-label="Họ tên người mới" value={nguoiMoi.ten}
              onChange={(e) => setNguoiMoi((c) => ({ ...c, ten: e.target.value }))} />
            <input className="pq-o" style={{ maxWidth: 230 }} type="email" placeholder="Email (không bắt buộc)"
              aria-label="Email người mới" value={nguoiMoi.email}
              onChange={(e) => setNguoiMoi((c) => ({ ...c, email: e.target.value }))} />
            <NhomChip ds={CHIP_BP} dangChon={nguoiMoi.bp} nhan="Bộ phận của người mới"
              onChon={(id) => setNguoiMoi((c) => ({ ...c, bp: id }))} />
            <button type="button" className="pq-nut la-chinh" onClick={themNguoi}
              disabled={!laTenThat(nguoiMoi.ten.trim()) || dangLuu === "B"}>
              <Plus size={15} /> Thêm người
            </button>
          </div>
        )}

        {loiD && (
          <div className="pq-canhbao la-do" style={{ margin: "12px 0" }}>
            <AlertTriangle size={17} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>Chưa đọc được ma trận phân công: {loiD}
              {/permission denied|row-level|JWT/i.test(loiD)
                && " — cần đăng nhập bằng tài khoản thật mới đọc được bảng này."}</span>
          </div>
        )}

        <div className="vmp-scroll" style={{ overflowX: "auto", marginTop: 12 }}>
          <table style={{ width: "100%", minWidth: 1560, borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ ...th, background: C.surface }} colSpan={6}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                    <KeyRound size={14} /> ĐƯỢC PHÉP LÀM GÌ
                  </span>
                </th>
                <th style={{ ...th, background: C.pinkMist }} colSpan={9}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                    <Grid3x3 size={14} /> ĐANG NHẬN LÀM GÌ
                    <GiaiThich tieuDe="Vì sao hai vế nằm chung một dòng">
                      {"Câu hỏi đáng hỏi nhất của một ma trận trách nhiệm là: người nhận làm việc đó CÓ QUYỀN làm việc đó không.\n\n"
                        + "Trước đây hai vế nằm ở hai bảng cách nhau một màn cuộn, nên phải tự ghép trong đầu — và người ta không ghép. Kết quả là những dòng như 'nhận làm PQ, phạm vi theo phân công, sửa được 0 hạng mục' tồn tại rất lâu mà không ai thấy.\n\n"
                        + "Tám cột phân công KHÔNG chia theo bộ phận, vì khoá duy nhất của vmp_assignment_matrix là (tên người, loại thẩm định, line) — bộ phận chỉ là thuộc tính đi kèm. Ô chọn bộ phận ở bản trước chỉ lọc người, nó không phải một chiều thật của ma trận."}
                    </GiaiThich>
                  </span>
                </th>
              </tr>
              <tr>
                <th style={th}>Người</th>
                <th style={th}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    Bộ phận
                    <GiaiThich tieuDe="Một ô bộ phận, hai chỗ lưu">
                      {"Dưới database bộ phận nằm ở HAI cột: vmp_performers.department và profiles.department (cột mà luật 'chỉ bộ phận mình' đem ra so).\n\n"
                        + "Trước đây màn này có hai ô riêng cho hai cột đó, ở hai khối khác nhau — và chúng đã lệch thật. Nay một ô, bấm Lưu ghi xuống cả hai."}
                    </GiaiThich>
                  </span>
                </th>
                <th style={th}>Vai trò</th>
                <th style={th}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    Phạm vi riêng
                    <GiaiThich tieuDe="Phạm vi riêng của một người">
                      {"Mức quyền đặt cho RIÊNG người này, thắng mức chung của vai ở ma trận 2.\n\n"
                        + "Vì sao cần: hai người cùng vai department_user, cùng bộ phận XSX — một người phụ trách cả bộ phận, một người chỉ phụ trách line mình. Bắt cả vai dùng chung một mức thì hoặc mở quá tay cho người sau, hoặc khoá nhầm người trước.\n\n"
                        + "Để 'theo vai' (mặc định) thì người này đi theo ma trận 2; đổi ma trận 2 là đổi cho họ luôn. Đặt riêng thì ma trận 2 không còn ảnh hưởng tới họ nữa — nên chỉ đặt khi thật sự có ngoại lệ."}
                    </GiaiThich>
                  </span>
                </th>
                <th style={{ ...th, textAlign: "center" }}>Xem</th>
                <th style={{ ...th, textAlign: "center" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    Sửa được
                    <GiaiThich tieuDe="Sửa được bao nhiêu hạng mục">
                      {"Số hạng mục người này THẬT SỰ sửa được, do database đếm bằng đúng hàm đang chặn (ly_do_khong_sua_duoc), không phải bản mô tả luật viết lại ở giao diện.\n\n"
                        + "Giải thích một mức quyền bằng chữ thì ai đọc cũng gật mà không ai chắc mình hiểu đúng. Thấy '223/448' thì hết chỗ hiểu nhầm.\n\n"
                        + "Con số này của lần nạp gần nhất — tích chọn chưa lưu chưa làm nó đổi. Bấm Lưu xong nó tự tính lại."}
                    </GiaiThich>
                  </span>
                </th>
                <th style={{ ...th, textAlign: "center", background: C.pinkMist }}>Đứng tên</th>
                {LOAI_TD.map((lt) => (
                  <th key={lt} style={{ ...th, textAlign: "center", background: C.pinkMist }}>{lt}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...DEPTS.map((d) => d.id), ""].map((bp) => {
                const ds = nhomTheoBp.get(bp) || [];
                const meta = DEPTS.find((d) => d.id === bp);
                if (!ds.length && !bp) return null;
                const thieu = bp ? chuaAiNhan(bp) : [];
                return (
                  <Fragment key={bp || "trong"}>
                    <tr>
                      <td style={{ ...dai, background: bp ? C.pinkMist : C.marigoldSoft }} colSpan={15}>
                        <span style={{ display: "inline-flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
                          <b style={{ color: bp ? C.plum : C.marigoldText }}>
                            {meta ? `${meta.short} · ${meta.name}` : "Chưa gán bộ phận"}
                          </b>
                          <span style={{ fontWeight: 700, color: C.plumSoft, fontFamily: NUM }}>
                            {ds.length} người · {tongTheoBp.get(bp) || 0} hạng mục
                          </span>
                          {!bp && ds.length > 0 && (
                            <span style={{ fontWeight: 700, color: C.marigoldText }}>
                              — chưa phân công được ô nào cho tới khi có bộ phận
                            </span>
                          )}
                          {thieu.length > 0 && (
                            <span style={{ fontWeight: 700, color: C.raspText }}>
                              chưa ai nhận: {thieu.join(", ")}
                            </span>
                          )}
                        </span>
                      </td>
                    </tr>
                    {!ds.length && bp && (
                      <tr>
                        <td style={{ ...td, color: C.plumSoft, fontWeight: 700 }} colSpan={15}>
                          Chưa có ai. Thêm người ở ô trên rồi chọn bộ phận này.
                        </td>
                      </tr>
                    )}
                    {ds.map((h) => veDongNguoi(h))}
                  </Fragment>
                );
              })}
              {voChuHang && (
                <tr>
                  <td style={{ ...td, fontWeight: 800, color: C.marigoldText }} colSpan={6}>
                    Chưa ai đứng tên
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: C.plumSoft }}>
                      {[...voChuHang.theoBp.entries()].sort((a, b) => b[1] - a[1])
                        .map(([d, n]) => `${DEPTS.find((x) => x.id === d)?.short || d} ${n}`).join(" · ")}
                    </div>
                  </td>
                  <td style={{ ...td, textAlign: "center", fontFamily: NUM, fontWeight: 800,
                               color: C.marigoldText, background: C.pinkMist }}>
                    {voChuHang.soDungTen}
                  </td>
                  <td style={{ ...td, background: C.pinkMist }} colSpan={8} />
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div style={{ display: "flex", gap: "8px 18px", flexWrap: "wrap", marginTop: 14,
                      fontSize: 12.5, fontWeight: 700, color: C.plumSoft, alignItems: "center" }}>
          <span><b style={{ color: C.mintText }}>●</b> Thực hiện — người trực tiếp làm</span>
          <span><b style={{ color: C.skyText }}>○</b> Hỗ trợ — phối hợp</span>
          <span><b>＋</b> chưa phân công · bấm một ô đi một bậc ＋ → ● → ○ → ＋</span>
          <span>Cột <b>Sửa được</b> và các ô <b>phân công</b> đọc chéo nhau: người để phạm vi
            <b> ◔ theo phân công</b> mà không có ô nào tích thì sửa được 0 hạng mục.</span>
        </div>

        <ThanhLuu soThayDoi={demNhap("Bv|", "Bd|", "Bp|", "Be|", "D|")} dangLuu={dangLuu === "B"}
          ketQua={ketQua.B || null} onLuu={luuTrachNhiem}
          onHoanTac={() => boNhap("B", "Bv|", "Bd|", "Bp|", "Be|", "D|")}
          khoa={!quyenSuaA && !suaPhanCongDuoc}
          ghiChu="Tích quyền bên trái, phân công bên phải — một nút Lưu cho cả dòng." />
      </Card>

      {/* ============ CÁCH DÙNG ============ */}
      <Card variant="soft">
        <CardTitle icon={ShieldCheck} sub="Ba việc làm được ngay, theo thứ tự đáng làm trước">
          Từ ma trận này làm gì tiếp
        </CardTitle>
        <ol style={{ margin: 0, paddingLeft: 22, fontSize: 14, lineHeight: 1.8, color: C.plum }}>
          <li><b>Xử lý các dòng “sửa được 0/{tongHangMuc}”.</b> Người có tài khoản mà sửa được 0 hạng mục là người sẽ bấm sửa rồi bị từ chối mà không hiểu vì sao — hoặc gán bộ phận, hoặc tích ô phân công, hoặc đổi phạm vi riêng.</li>
          <li><b>Tạo tài khoản cho người đang đứng tên hạng mục.</b> Người không đăng nhập được thì phải nhờ nhập hộ, mà nhập hộ làm cột "người sửa" trong nhật ký không còn đúng người làm — đó là điểm yếu về ALCOA+ chữ A (Attributable).</li>
          <li><b>Tích phân công cho các bộ phận chưa ai nhận.</b> Dải màu của mỗi bộ phận nói thẳng loại thẩm định nào trong kế hoạch chưa có người thực hiện — và người để phạm vi "theo phân công" ở bộ phận đó thì đang bị khoá sạch.</li>
        </ol>
        <div style={{ marginTop: 14, padding: "11px 14px", borderRadius: 14, background: C.surfaceSunk,
                      fontSize: 13, color: C.plumSoft, fontWeight: 600, lineHeight: 1.65 }}>
          <b style={{ color: C.plum }}>Muốn phân quyền XEM theo bộ phận</b> — chẳng hạn XSX chỉ thấy hạng
          mục của XSX — thì phải sửa policy RLS của <code>vmp_plan_items</code> bằng migration, không sửa
          được ở màn này. Nửa XEM của ma trận 2 sẽ đổi theo ngay khi policy đổi, vì nó đọc thẳng
          <code> pg_policy</code> chứ không chép lại.
        </div>
      </Card>
    </div>
  );
}
