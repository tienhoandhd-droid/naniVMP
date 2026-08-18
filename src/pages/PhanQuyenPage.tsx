/* =====================================================================
 *  PhanQuyenPage.tsx — Vai trò & phạm vi
 *  ---------------------------------------------------------------------
 *  KHÔNG CÒN DÍNH HỆ PHÂN QUYỀN CŨ (chốt 18/08). Trước đây file này còn
 *  một ma trận vai×quyền đọc/ghi bảng vmp_role_permissions (4 vai admin/
 *  qa_manager/department_user/viewer) và một khối FullPermissionWorkspace
 *  gộp sáu bảng quản trị — cả hai đã bị XOÁ khỏi file. Quyền nay CHỈ đọc
 *  từ vmp_screen_permissions qua rpc_my_ui_access (6 vai nghiệp vụ), lộ ra
 *  bằng `access.can(...)` (src/lib/access.ts). Việc dọn phía SQL do người
 *  khác lo — file này chỉ còn phần web.
 *
 *  Màn hiện có ba nhánh, chọn bởi PhanQuyenView theo vai người đang xem:
 *
 *   · EquipmentAssignmentWorkspace — riêng cho accessClass
 *     "equipment_manager" không phải admin: chỉ còn phân công hạng mục
 *     theo bộ phận quản lý thiết bị.
 *
 *   · CurrentPermissionWorkspace — nhánh chính cho admin/qa_manager:
 *     - ItemPermissionModeCard: công tắc DỰ THẢO ⇄ ÁP DỤNG của quyền theo
 *       hạng mục, gate bằng access.can("accounts","manage_authorization_policy").
 *     - QuanTriQuyenCards: mục "1 · Ai được phép có tài khoản" — danh sách
 *       email được phép tạo tài khoản (bảng vmp_email_cho_phep). Đây KHÔNG
 *       phải luật cho/không cho làm gì, chỉ là cửa vào duy nhất để Supabase
 *       chịu tạo tài khoản.
 *     - Card "Tài khoản & quyền": chọn người từ danh bạ, nối/gỡ tài khoản,
 *       xem quyền hiệu lực (StaffDirectoryPanel + AccountLinkPanel +
 *       EffectiveRightsPanel). Sửa hồ sơ nhân sự/phân công đã chuyển hẳn
 *       sang màn Nhân sự — màn này không sửa nữa.
 *     - MaTranQuyenManHinh: ma trận "Màn hình bạn được xem", đọc THẲNG
 *       rpc_my_ui_access của chính người đang xem — server trả gì hiện
 *       nấy, không chép luật lại bằng tay nên không thể lệch với luật thật.
 * ===================================================================== */
import { useEffect, useMemo, useState } from "react";
import { ShieldCheck, Users, AlertTriangle, Check, Plus, Mail, Trash2 } from "lucide-react";
import { C } from "../constants/theme.ts";
import { supabase } from "../lib/supabaseClient.ts";
import { fetchEmailChoPhep, setEmailChoPhep, fetchNguoiVaQuyen } from "../lib/supabaseData.ts";
import type { EmailChoPhepRow, NguoiQuyenRow } from "../lib/supabaseData.ts";
import { Card, CardTitle, Tag, CauKetLuan } from "../components/ui/Primitives.tsx";
import type { Activity, AppUser } from "../types/domain.ts";
import StaffDirectoryPanel from "../features/itemPermissions/StaffDirectoryPanel.tsx";
import ItemPermissionModeCard from "../features/itemPermissions/ItemPermissionModeCard.tsx";
import AssignmentPanel from "../features/itemPermissions/AssignmentPanel.tsx";
import AccountLinkPanel from "../features/itemPermissions/AccountLinkPanel.tsx";
import EffectiveRightsPanel from "../features/itemPermissions/EffectiveRightsPanel.tsx";
import type { DirectoryPerson } from "../features/itemPermissions/types.ts";
import { SCREEN_IDS } from "../lib/access.ts";
import type { AccessContext } from "../lib/access.ts";

type KetQuaLuu = { xong: number; tong: number; loi: string[] } | null;

type PhanQuyenViewProps = {
  acts: Activity[];
  user?: AppUser | null;
  /** Dùng cho ma trận "Màn hình bạn được xem" — chuyển từ màn Tài khoản &
   *  quyền truy cập cũ. Tuỳ chọn vì nhánh thợ quản lý thiết bị của
   *  PhanQuyenView không cần tới nó. */
  access?: AccessContext;
};

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

/* ---------------------------------------------------------------------
 * QuanTriQuyenCards — mục "1 · Ai được phép có tài khoản": danh sách email
 * được phép tạo tài khoản (bảng vmp_email_cho_phep, tách hẳn khỏi hệ phân
 * quyền). Đây không phải luật CHO/KHÔNG CHO làm gì — chỉ là cửa vào duy
 * nhất để Supabase chịu tạo tài khoản.
 *
 * Trước đây khối này còn có mục 2 "Vai nào xem được gì, sửa được gì" — ma
 * trận vai×quyền đọc/ghi bảng vmp_role_permissions (hệ 4 vai admin/
 * qa_manager/department_user/viewer). Hệ đó đã bị BỎ HẲN (18/08): quyền
 * nay chỉ còn đọc từ vmp_screen_permissions qua rpc_my_ui_access — xem
 * MaTranQuyenManHinh bên dưới, đọc qua `access` (src/lib/access.ts). Mục 2
 * cùng toàn bộ luật/bảng của nó đã xoá khỏi file này.
 * ------------------------------------------------------------------- */
function QuanTriQuyenCards({ duocSua = false }: { duocSua?: boolean }) {
  const [nguoi, setNguoi] = useState<NguoiQuyenRow[]>([]);
  const [dsEmail, setDsEmail] = useState<EmailChoPhepRow[]>([]);
  const [emailMoi, setEmailMoi] = useState({ email: "", ghiChu: "" });

  const [dangLuu, setDangLuu] = useState("");
  const [ketQua, setKetQua] = useState<Record<string, KetQuaLuu>>({});

  /* Quyền do NƠI GỌI quyết, hỏi từ server (`manage_authorization_policy`).
     Bản trước tự suy ở đây bằng `isAdmin` — cờ gộp "admin hoặc quản lý QA"
     của hệ 4 vai cũ — nên mở nút sửa cho người mà RPC chắc chắn từ chối. */
  const quyenSuaA = duocSua && !!supabase;

  const taiDsEmail = async () => {
    try { setDsEmail(await fetchEmailChoPhep()); } catch { /* không có quyền thì thôi */ }
  };

  useEffect(() => {
    if (!supabase) return;
    /* Chỉ cần nguoi để đối chiếu "email này đã có tài khoản chưa" ở mục 1
       — không giữ toàn bộ state trách nhiệm & phân công của màn Nhân sự. */
    fetchNguoiVaQuyen().then((r) => setNguoi(r.nguoi)).catch(() => { /* không có quyền thì thôi */ });
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

  /* ---------------- kiểu dùng chung ---------------- */
  const th: React.CSSProperties = {
    textAlign: "left", padding: "10px 12px", fontSize: 12, fontWeight: 800,
    color: C.plumSoft, borderBottom: `1px solid ${C.line}`, whiteSpace: "nowrap",
  };
  const td: React.CSSProperties = {
    padding: "10px 12px", fontSize: 14, color: C.plum, borderBottom: `1px solid ${C.line}`,
  };

  return (
    <>
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
          ② tạo tài khoản ở <b>Supabase Dashboard → Authentication → Users → Add user</b> với đúng email đó →
          ③ đổi vai ở màn <b>Cấu hình hệ thống</b> (thẻ "Người dùng &amp; phân quyền") và nối tài khoản với hồ
          sơ nhân sự ở ngay màn này. Bỏ bước ① thì Supabase từ chối tạo; bỏ bước ③ thì họ đăng nhập được
          nhưng chỉ xem được, không sửa gì.
        </div>
      </Card>
    </>
  );
}

/* ---------------------------------------------------------------------
 * MaTranQuyenManHinh — chuyển nguyên từ AccountAccessPage.tsx (màn "Tài
 * khoản & quyền truy cập" đã gộp vào màn này). Đọc thẳng `rpc_my_ui_access`
 * của CHÍNH người đang xem — server trả gì hiện nấy, không phải bản chép
 * tay có thể lệch luật thật. Xem vai khác thì phải đăng nhập bằng tài
 * khoản vai đó, cố ý như vậy: không có đường nào để trình duyệt tự khai
 * mình là vai khác.
 * ------------------------------------------------------------------- */

/** Tên hiển thị của từng màn, để bảng ma trận đọc được bằng tiếng Việt. */
const TEN_MAN: Record<string, string> = {
  today: "Việc hôm nay",
  overview: "Tổng quan",
  timeline: "Dòng thời gian VMP",
  alerts: "Cảnh báo & ưu tiên",
  risk: "Rủi ro (đường dẫn cũ)",
  progress: "Cập nhật tiến độ",
  inventory: "Tiến độ theo đối tượng",
  source: "Dữ liệu nguồn",
  workload: "Phân công & khối lượng",
  reports: "Báo cáo",
  rules: "Quy tắc nghiệp vụ",
  people: "Nhân sự",
  health: "Chất lượng dữ liệu",
  audit: "Nhật ký thay đổi",
  accounts: "Tài khoản & quyền truy cập",
  admin: "Quản trị",
  phanquyen: "Vai trò & phạm vi",
};

const TEN_PHAM_VI: Record<string, string> = {
  all: "Toàn hệ thống",
  workshop: "Phạm vi xưởng",
  assigned: "Việc được giao",
  own: "Của riêng mình",
  none: "—",
};

function MaTranQuyenManHinh({ access }: { access: AccessContext }) {
  return (
    <Card variant="strong">
      <CardTitle icon={ShieldCheck}
        sub={access.mode === "enforced"
          ? "Quyền đang có hiệu lực. Đây là kết quả server trả về cho chính tài khoản bạn đang dùng."
          : "Đang ở chế độ đối chiếu: bảng này cho thấy quyền dự kiến, nhưng hệ vẫn chạy theo luật cũ."}>
        Màn hình bạn được xem
      </CardTitle>

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <Tag>{access.mode === "enforced" ? "Đang áp dụng" : "Dự kiến, chưa áp dụng"}</Tag>
        <Tag>Vai nghiệp vụ: {access.businessRole ?? "chưa giải được"}</Tag>
        {access.unresolvedReason && <Tag>Lý do: {access.unresolvedReason}</Tag>}
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: "left", color: C.plumSoft }}>
              <th style={{ padding: "6px 10px" }}>Màn hình</th>
              <th style={{ padding: "6px 10px" }}>Được xem</th>
              <th style={{ padding: "6px 10px" }}>Phạm vi dữ liệu</th>
              <th style={{ padding: "6px 10px" }}>Hành động được phép</th>
            </tr>
          </thead>
          <tbody>
            {SCREEN_IDS.map((id) => {
              const xem = access.canView(id);
              const hanhDong = [...(access.screens[id]?.actions ?? [])]
                .filter((a) => a !== "view").sort();
              return (
                <tr key={id} style={{ borderTop: `1px solid ${C.line}`, opacity: xem ? 1 : 0.55 }}>
                  <td style={{ padding: "6px 10px", fontWeight: xem ? 700 : 500 }}>
                    {TEN_MAN[id] ?? id}
                  </td>
                  <td style={{ padding: "6px 10px" }}>{xem ? "Có" : "Không"}</td>
                  <td style={{ padding: "6px 10px" }}>{TEN_PHAM_VI[access.scope(id)] ?? access.scope(id)}</td>
                  <td style={{ padding: "6px 10px", color: C.plumSoft }}>
                    {hanhDong.length ? hanhDong.join(", ") : (xem ? "chỉ xem" : "—")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* Không nhận `isAdmin` cũng không cần `user`: MỌI quyết định quyền ở màn
   này đều hỏi server qua `access.can(...)`. Hệ 4 vai cũ đã bỏ hẳn (18/08),
   và suy quyền ở client là cách sinh ra nút bấm được nhưng bị từ chối. */
function CurrentPermissionWorkspace({ acts, access }: {
  acts: Activity[];
  access?: AccessContext;
}) {
  const [person, setPerson] = useState<DirectoryPerson | null>(null);
  const [directoryRevision, setDirectoryRevision] = useState(0);
  const [directoryRefreshPersonId, setDirectoryRefreshPersonId] = useState<string | null>(null);
  const [rightsRevision, setRightsRevision] = useState(0);
  /* Quyền nối/gỡ tài khoản hỏi THẲNG server, không suy từ vai ở client.
     `resolveDirectoryWorkspaceCapabilities` tính từ `isAdmin`, mà `isAdmin`
     của web nghĩa là "admin HOẶC quản lý QA" — trong khi luật server cấp
     `manage_accounts` cho riêng screen `accounts` của admin. Suy ở client
     là hiện nút cho người mà máy chủ chắc chắn từ chối.
     Vẫn hỏi theo screen `accounts` dù màn đó đã gộp vào đây: screenId ấy
     là hợp đồng với server, còn `phanquyen` được server khai là cửa vào
     không có hành động riêng nên hỏi theo nó sẽ luôn ra false. */
  const duocQuanLyTaiKhoan = access?.can("accounts", "manage_accounts") ?? false;
  /* Quyền chỉnh CHÍNH SÁCH phân quyền (bật/tắt chế độ áp dụng, danh sách
     email được phép, ma trận vai×quyền) — khác với quyền nối tài khoản. */
  const duocChinhChinhSachQuyen = access?.can("accounts", "manage_authorization_policy") ?? false;
  const validAreas = useMemo(() => [...new Set(acts.flatMap((activity) => {
    const raw = (activity._raw || {}) as Record<string, unknown>;
    return [activity.area, raw.area, raw.line]
      .map((value) => String(value || "").trim())
      .filter(Boolean);
  }))].sort((a, b) => a.localeCompare(b, "vi")), [acts]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Công tắc DỰ THẢO ⇄ ÁP DỤNG đặt TRÊN CÙNG: nó quyết định mọi thứ
          bên dưới có hiệu lực thật hay chỉ là bản tính thử.
          Gate bằng CHÍNH quyền `manage_authorization_policy` mà server cấp
          cho màn `accounts`. Trước đó quyền ấy là quyền chết: server cấp mà
          web không hỏi tới, còn giao diện thì tự suy từ `role === "admin"`.
          Hai nguồn cùng nói một việc thì sớm muộn lệch nhau — hỏi server là
          hết lệch, và quyền kia mới có việc thật để làm. */}
      {duocChinhChinhSachQuyen && (
        <Card variant="strong">
          <ItemPermissionModeCard />
        </Card>
      )}
      {/* Ai được phép có tài khoản + vai nào làm được gì: cùng một quyền
          chính sách như trên. */}
      {duocChinhChinhSachQuyen && <QuanTriQuyenCards duocSua={duocChinhChinhSachQuyen} />}
      <Card variant="strong">
        <CardTitle icon={Users}
          sub="Chọn tài khoản để nối/gỡ và xem đúng quyền đang có hiệu lực. Sửa hồ sơ nhân sự
            và phân công việc nay ở màn Nhân sự — màn này chỉ còn lo tài khoản và quyền.">
          Tài khoản &amp; quyền
        </CardTitle>
        <div className="ip-workspace">
          {/* canEdit cố định false: sửa hồ sơ nhân sự đã chuyển hẳn sang màn
              Nhân sự. Danh bạ ở đây chỉ để CHỌN người — nối tài khoản và xem
              quyền hiệu lực của người đó. */}
          <StaffDirectoryPanel canEdit={false} validAreas={validAreas} onSelect={setPerson}
            revision={directoryRevision} refreshPersonId={directoryRefreshPersonId} />
          {duocQuanLyTaiKhoan && (
            <AccountLinkPanel person={person} canManageAccounts={duocQuanLyTaiKhoan}
              onLinked={(personId) => {
                setDirectoryRefreshPersonId(personId);
                setDirectoryRevision((value) => value + 1);
                setRightsRevision((value) => value + 1);
              }} />
          )}
          <EffectiveRightsPanel person={person} revision={rightsRevision} />
        </div>
      </Card>
      {/* Ma trận quyền màn hình: chuyển nguyên từ màn "Tài khoản & quyền
          truy cập" cũ (đã gộp vào đây). Chỉ Admin thật mới thấy — cùng lý
          do như ItemPermissionModeCard/QuanTriQuyenCards ở trên. */}
      {duocChinhChinhSachQuyen && access && <MaTranQuyenManHinh access={access} />}
    </div>
  );
}

export default function PhanQuyenView(props: PhanQuyenViewProps) {
  /* Cổng gác ngoài cùng cũng hỏi SERVER, không đọc `user.role`/`accessClass`
     nữa — hai field đó thuộc hệ 4 vai đã bỏ, và để sót ở đây thì cả màn vẫn
     chạy theo luật cũ dù bên trong đã chuyển hết sang `access`. */
  const allowed = props.access?.canView("phanquyen") ?? false;
  if (!allowed) {
    return (
      <Card variant="strong">
        <CardTitle icon={ShieldCheck}>Không có quyền truy cập</CardTitle>
        <p>Bạn không có quyền truy cập màn Phân quyền &amp; trách nhiệm.</p>
      </Card>
    );
  }
  /* Quản lý xưởng vào màn này CHỈ để phân công hạng mục thiết bị: server
     cấp cho họ đúng một hành động `assign_workshop_staff` trên `phanquyen`
     (migration 20260812100000_quan_ly_xuong_giu_cua_phan_cong.sql), và
     `data_scope = 'none'` vì màn là cửa vào chức năng, không mang dữ liệu. */
  if (props.access?.businessRole === "workshop_manager") {
    return <EquipmentAssignmentWorkspace acts={props.acts} />;
  }
  return <CurrentPermissionWorkspace acts={props.acts} access={props.access} />;
}

