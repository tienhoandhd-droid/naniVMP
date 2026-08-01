/* =====================================================================
 *  PhanQuyenPage.tsx — Ma trận phân quyền & phân công trách nhiệm
 *  ---------------------------------------------------------------------
 *  Ba ma trận, mỗi cái trả lời một câu khác nhau. Không gộp làm một vì
 *  gộp lại thì không câu nào trả lời rõ.
 *
 *   A · VAI TRÒ × HÀNH ĐỘNG — "vai này được làm gì"
 *       Đọc THẲNG từ luật đang chạy trong rpc_update_progress và
 *       rpc_set_item_state. Trước màn này, luật phân quyền chỉ tồn tại
 *       trong thân hàm SQL — không ai đọc được, kể cả người quản trị.
 *
 *   B · NGƯỜI × BỘ PHẬN — "ai chịu trách nhiệm phần nào, và có quyền
 *       tương ứng chưa". Đây là ma trận phân công trách nhiệm thật: một ô
 *       nói cả hai điều — người này đang đứng tên bao nhiêu hạng mục ở bộ
 *       phận đó, VÀ luật hiện hành có cho họ sửa hay không.
 *
 *   C · PHẠM VI CHI TIẾT — khu vực / line trong mỗi bộ phận.
 *       CHƯA dùng để phân quyền: luật hiện tại chỉ phân tới cấp BỘ PHẬN.
 *       Ghi ra để chuẩn bị, và ghi rõ là chưa áp dụng — vẽ một ma trận
 *       trông như đang có hiệu lực trong khi nó chưa có hiệu lực là cách
 *       nhanh nhất để người ta tin nhầm mình đã phân quyền xong.
 *
 *  Vì sao ma trận phải SINH TỪ DỮ LIỆU THẬT chứ không phải gõ tay: một
 *  bảng phân quyền gõ tay sẽ lệch với thực tế ngay lần đầu ai đó đổi vai
 *  trò, và không ai biết nó đã lệch.
 * ===================================================================== */
import { useEffect, useMemo, useState } from "react";
import { ShieldCheck, Users, KeyRound, AlertTriangle, MapPin, Pencil } from "lucide-react";
import { C, TEXT, NUM } from "../constants/theme.ts";
import { DEPTS } from "../constants/vmp.ts";
import { supabase } from "../lib/supabaseClient.ts";
import { setUserRole, upsertPerformer } from "../lib/supabaseData.ts";
import { usePerformers } from "../hooks/index.ts";
import { Card, CardTitle, Tag, CauKetLuan, GiaiThich } from "../components/ui/Primitives.tsx";
import type { Activity } from "../types/domain.ts";

/* ---------------------------------------------------------------------
 * A · LUẬT ĐANG CHẠY — chép đúng từ thân rpc_update_progress /
 *     rpc_set_item_state. Sửa luật ở DB thì phải sửa cả ở đây, và dòng
 *     ghi chú dưới bảng nói rõ điều đó cho người đọc.
 * ------------------------------------------------------------------- */
type Muc = "co" | "bo_phan" | "khong";

const VAI = [
  { id: "admin", ten: "admin", mo: "Quản trị hệ thống" },
  { id: "qa_manager", ten: "qa_manager", mo: "Phụ trách QA" },
  { id: "department_user", ten: "department_user", mo: "Người của một bộ phận" },
  { id: "viewer", ten: "viewer", mo: "Chỉ xem" },
] as const;

const HANH_DONG: Array<{
  ten: string; giaiThich: string; quyen: Record<string, Muc>;
}> = [
  {
    ten: "Xem số liệu",
    giaiThich: "Mọi vai đã đăng nhập đều xem được toàn bộ số liệu. Phân quyền ở đây là phân quyền GHI, không phải phân quyền đọc.",
    quyen: { admin: "co", qa_manager: "co", department_user: "co", viewer: "co" },
  },
  {
    ten: "Cập nhật tiến độ",
    giaiThich: "rpc_update_progress: viewer bị từ chối thẳng; department_user chỉ sửa được hạng mục thuộc bộ phận của mình (so vmp_objects.department với profiles.department).",
    quyen: { admin: "co", qa_manager: "co", department_user: "bo_phan", viewer: "khong" },
  },
  {
    ten: "Đổi trạng thái nghiệp vụ\n(Không áp dụng / Huỷ / Khôi phục)",
    giaiThich: "rpc_set_item_state — chỉ admin và qa_manager. Đây là thao tác đưa hạng mục ra khỏi kế hoạch nên không mở cho cấp bộ phận.",
    quyen: { admin: "co", qa_manager: "co", department_user: "khong", viewer: "khong" },
  },
  {
    ten: "Sinh timeline từ danh mục nguồn",
    giaiThich: "rpc_generate_timeline — sinh lại kế hoạch cả năm, chỉ admin và qa_manager.",
    quyen: { admin: "co", qa_manager: "co", department_user: "khong", viewer: "khong" },
  },
  {
    ten: "Sửa danh mục nguồn / người thực hiện",
    giaiThich: "Ghi vào vmp_source_objects, vmp_performers — chỉ admin và qa_manager.",
    quyen: { admin: "co", qa_manager: "co", department_user: "khong", viewer: "khong" },
  },
  {
    ten: "Quản trị người dùng, cấu hình",
    giaiThich: "Màn Quản trị và Audit log — chỉ admin.",
    quyen: { admin: "co", qa_manager: "khong", department_user: "khong", viewer: "khong" },
  },
];

const O_QUYEN: Record<Muc, { chu: string; mau: string; nen: string }> = {
  co: { chu: "Được", mau: C.mintText, nen: C.mintSoft },
  bo_phan: { chu: "Chỉ bộ phận mình", mau: C.marigoldText, nen: C.marigoldSoft },
  khong: { chu: "Không", mau: C.plumSoft, nen: C.surfaceSunk },
};

interface HoSo { id: string; full_name: string | null; email: string | null; role: string; department: string | null; is_active: boolean | null }

export default function PhanQuyenView(
  { acts, isAdmin = false }: { acts: Activity[]; isAdmin?: boolean },
) {
  const { performers } = usePerformers();
  const [hoSo, setHoSo] = useState<HoSo[]>([]);
  const [loi, setLoi] = useState("");
  const [moPhamVi, setMoPhamVi] = useState<string>("");
  /* Sửa trực tiếp trên bảng. Lưu NGAY khi đổi ô chọn — không có nút Lưu
     riêng: bảng phân quyền là nơi người ta sửa một ô rồi đi, bắt bấm thêm
     một nút nữa là chỗ hay quên nhất. Có dòng trạng thái báo kết quả. */
  const [dangLuu, setDangLuu] = useState("");
  const [ketQua, setKetQua] = useState<{ ten: string; ok: boolean; msg: string } | null>(null);

  const taiLai = async () => {
    if (!supabase) return;
    const { data } = await supabase.from("profiles")
      .select("id,full_name,email,role,department,is_active");
    setHoSo((data || []) as HoSo[]);
  };

  const suaQuyenDuoc = isAdmin && !!supabase;

  const doiQuyen = async (id: string, ten: string, vai: string, bp: string | null) => {
    setDangLuu(id); setKetQua(null);
    try {
      const r = await setUserRole(id, vai, bp, `Đổi phân quyền cho ${ten} từ màn Phân quyền`);
      setKetQua({ ten, ok: !!r.ok, msg: r.ok ? "Đã lưu phân quyền" : (r.error || "Không lưu được") });
      if (r.ok) await taiLai();
    } catch (e) {
      setKetQua({ ten, ok: false, msg: (e as Error).message || "Không lưu được" });
    }
    setDangLuu("");
  };

  const doiNguoiThucHien = async (
    id: string | null, ten: string, patch: Record<string, unknown>,
  ) => {
    setDangLuu(id || ten); setKetQua(null);
    try {
      const r = await upsertPerformer(id, { performer_name: ten, ...patch });
      setKetQua({ ten, ok: !!r.ok, msg: r.ok ? "Đã lưu" : (r.error || "Không lưu được") });
    } catch (e) {
      setKetQua({ ten, ok: false, msg: (e as Error).message || "Không lưu được" });
    }
    setDangLuu("");
  };

  useEffect(() => {
    if (!supabase) { setLoi("Chưa nối Supabase nên chưa đọc được danh sách người dùng."); return; }
    supabase.from("profiles").select("id,full_name,email,role,department,is_active")
      .then(({ data, error }) => {
        if (error) setLoi(error.message);
        else setHoSo((data || []) as HoSo[]);
      });
  }, []);

  /* B · Trách nhiệm thật: đếm hạng mục đang đứng tên, theo người × bộ phận. */
  const { hang, tongTheoBp } = useMemo(() => {
    const song = acts.filter((a) => (a.state || "active") === "active");
    const dem = new Map<string, Map<string, number>>();
    const tongTheoBp = new Map<string, number>();
    for (const a of song) {
      const ten = String(a.owner || "").trim() || "(chưa phân công)";
      const ds = (a.depts && a.depts.length ? a.depts : [a.dept || "qa"]).filter(Boolean) as string[];
      if (!dem.has(ten)) dem.set(ten, new Map());
      for (const d of ds) {
        dem.get(ten)!.set(d, (dem.get(ten)!.get(d) || 0) + 1);
        tongTheoBp.set(d, (tongTheoBp.get(d) || 0) + 1);
      }
    }

    /* Gộp BA nguồn tên người, vì mỗi nguồn thiếu một mảnh:
       · profiles      — ai đăng nhập được (nhưng có người chưa từng đứng tên)
       · vmp_performers— ai được khai là người thực hiện
       · owner_name    — ai đang THẬT SỰ đứng tên hạng mục
       Chỉ nhìn một nguồn thì không thấy được khoảng hở giữa chúng, mà
       khoảng hở đó mới là thứ đáng lo. */
    const ten = new Set<string>();
    hoSo.forEach((h) => h.full_name && ten.add(h.full_name.trim()));
    performers.forEach((p) => p.performer_name && ten.add(String(p.performer_name).trim()));
    dem.forEach((_v, k) => { if (k !== "(chưa phân công)") ten.add(k); });

    const chuan = (s: string) => s.trim().toLowerCase();
    const hang = [...ten].map((t) => {
      const h = hoSo.find((x) => chuan(x.full_name || "") === chuan(t));
      const p = performers.find((x) => chuan(String(x.performer_name || "")) === chuan(t));
      const theoBp = dem.get(t) || new Map<string, number>();
      const tong = [...theoBp.values()].reduce((s, n) => s + n, 0);
      return {
        ten: t,
        tkId: (h?.id as string | undefined) || null,
        vai: h?.role || null,
        boPhanTaiKhoan: h?.department || null,
        coTaiKhoan: !!h,
        hoatDong: h?.is_active !== false,
        email: h?.email || p?.email || null,
        /* Hai email KHÁC NHAU và không được lẫn: emailTK là email đăng nhập
           (nằm ở auth, đổi ở đây không có ý nghĩa), emailTH là email nhận
           cảnh báo trong vmp_performers — đó mới là cái sửa được. */
        emailTK: h?.email || null,
        emailTH: (p?.email as string | undefined) || null,
        pid: (p?.id as string | undefined) || null,
        boPhanKhai: p?.department || null,
        theoBp, tong,
      };
    }).sort((a, b) => b.tong - a.tong || a.ten.localeCompare(b.ten, "vi"));

    const voChu = dem.get("(chưa phân công)");
    if (voChu) {
      hang.push({
        ten: "(chưa phân công)", tkId: null, vai: null, boPhanTaiKhoan: null, coTaiKhoan: false,
        hoatDong: true, email: null, emailTK: null, emailTH: null, pid: null, boPhanKhai: null,
        theoBp: voChu, tong: [...voChu.values()].reduce((s, n) => s + n, 0),
      });
    }
    return { hang, tongTheoBp };
  }, [acts, hoSo, performers]);

  /* Khoảng hở đáng lo nhất: đứng tên hạng mục mà không có tài khoản. */
  const thieuTaiKhoan = hang.filter((h) => h.ten !== "(chưa phân công)" && h.tong > 0 && !h.coTaiKhoan);
  const thieuEmail = hang.filter((h) => h.ten !== "(chưa phân công)" && h.tong > 0 && !h.email);
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

  /* C · Khu vực / line theo bộ phận — lấy từ chính hạng mục đang có. */
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

  const th: React.CSSProperties = {
    textAlign: "left", padding: "10px 12px", fontSize: 12, fontWeight: 800,
    color: C.plumSoft, borderBottom: `1px solid ${C.line}`, whiteSpace: "nowrap",
  };
  const td: React.CSSProperties = {
    padding: "10px 12px", fontSize: 14, color: C.plum, borderBottom: `1px solid ${C.line}`,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Card variant="strong">
        <CardTitle icon={ShieldCheck}
          sub="Sinh thẳng từ dữ liệu thật — không phải bảng gõ tay. Bảng gõ tay sẽ lệch với thực tế ngay lần đầu ai đó đổi vai trò, mà không ai biết nó đã lệch.">
          Ma trận phân quyền &amp; phân công trách nhiệm
        </CardTitle>
        <CauKetLuan chinh={ketLuan.chinh} phu={ketLuan.phu} tone={ketLuan.tone} />
      </Card>

      {/* ============ A · VAI TRÒ × HÀNH ĐỘNG ============ */}
      <Card variant="strong">
        <CardTitle icon={KeyRound}
          sub="Luật đang chạy thật trong database (rpc_update_progress · rpc_set_item_state · rpc_generate_timeline)">
          A · Vai trò được làm gì
        </CardTitle>
        <div className="vmp-scroll" style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: 720, borderCollapse: "collapse" }}>
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
                    const o = O_QUYEN[h.quyen[v.id]];
                    return (
                      <td key={v.id} style={{ ...td, textAlign: "center" }}>
                        <span style={{ display: "inline-block", padding: "5px 12px", borderRadius: 999,
                                       background: o.nen, color: o.mau, fontSize: 12, fontWeight: 800 }}>
                          {o.chu}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 12, fontSize: 12.5, color: C.plumSoft, fontWeight: 600, lineHeight: 1.6 }}>
          Bảng này <b>chép lại</b> luật trong database. Đổi luật ở RPC thì phải sửa cả ở đây —
          nếu không, màn hình sẽ nói một đằng và hệ thống làm một nẻo, mà kiểu sai đó rất khó phát hiện.
        </div>
      </Card>

      {/* ============ B · NGƯỜI × BỘ PHẬN ============ */}
      <Card variant="strong">
        <CardTitle icon={Users}
          sub="Mỗi ô nói hai điều: người này đang đứng tên bao nhiêu hạng mục ở bộ phận đó, và luật hiện hành có cho họ sửa không">
          B · Ai chịu trách nhiệm phần nào
        </CardTitle>

        {/* Ai được sửa ngay trên bảng. Giao diện KHÔNG phải chỗ giữ quyền —
            rpc_set_user_role tự kiểm lại người gọi có phải admin không, nên
            khoá ở đây chỉ để người không có quyền khỏi bấm vào chỗ chắc chắn
            hỏng. Bốn khoá ở phía server: chỉ admin; không tự hạ vai mình;
            luôn còn ít nhất một admin đang hoạt động; department_user bắt
            buộc có bộ phận. */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
                      marginBottom: 12, fontFamily: TEXT, fontSize: 13, fontWeight: 700,
                      color: C.plumSoft }}>
          <Pencil size={15} />
          {suaQuyenDuoc
            ? <span>Sửa thẳng trên bảng: đổi ô <b>Vai trò</b>, <b>Bộ phận</b> hoặc <b>Email</b> là lưu ngay, không cần bấm nút.</span>
            : <span>Bảng chỉ để xem — đổi phân quyền cần vai <code>admin</code>.</span>}
          {ketQua && (
            <span style={{ padding: "4px 11px", borderRadius: 999, fontSize: 12.5, fontWeight: 800,
                           background: ketQua.ok ? C.mintSoft : C.raspSoft,
                           color: ketQua.ok ? C.mintText : C.raspText }}>
              {ketQua.ten}: {ketQua.msg}
            </span>
          )}
        </div>

        {(thieuTaiKhoan.length > 0 || thieuEmail.length > 0 || adminKhongBoPhan.length > 0) && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
            {thieuTaiKhoan.length > 0 && (
              <div style={{ display: "flex", gap: 9, alignItems: "flex-start", padding: "10px 14px",
                            borderRadius: 14, background: C.raspSoft, color: C.raspText,
                            fontFamily: TEXT, fontSize: 13.5, fontWeight: 700 }}>
                <AlertTriangle size={17} style={{ flexShrink: 0, marginTop: 2 }} />
                <span>Chưa có tài khoản: <b>{thieuTaiKhoan.map((h) => h.ten).join(", ")}</b> — không đăng nhập được nên không tự cập nhật tiến độ của mình.</span>
              </div>
            )}
            {thieuEmail.length > 0 && (
              <div style={{ display: "flex", gap: 9, alignItems: "flex-start", padding: "10px 14px",
                            borderRadius: 14, background: C.marigoldSoft, color: C.marigoldText,
                            fontFamily: TEXT, fontSize: 13.5, fontWeight: 700 }}>
                <AlertTriangle size={17} style={{ flexShrink: 0, marginTop: 2 }} />
                <span>Chưa có email: <b>{thieuEmail.map((h) => h.ten).join(", ")}</b> — không nhận được cảnh báo đến hạn.</span>
              </div>
            )}
            {adminKhongBoPhan.length > 0 && (
              <div style={{ display: "flex", gap: 9, alignItems: "flex-start", padding: "10px 14px",
                            borderRadius: 14, background: C.marigoldSoft, color: C.marigoldText,
                            fontFamily: TEXT, fontSize: 13.5, fontWeight: 700 }}>
                <AlertTriangle size={17} style={{ flexShrink: 0, marginTop: 2 }} />
                <span><b>{adminKhongBoPhan.map((h) => h.full_name || h.email).join(", ")}</b> mang vai <code>department_user</code> nhưng chưa gán bộ phận — luật so bộ phận của hạng mục với bộ phận của người, thiếu vế sau thì không sửa được hạng mục nào.</span>
              </div>
            )}
          </div>
        )}

        <div className="vmp-scroll" style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: 900, borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Người</th>
                <th style={th}>Tài khoản</th>
                <th style={th}>Vai trò</th>
                <th style={th}>Bộ phận (tài khoản)</th>
                <th style={th}>Email nhận cảnh báo</th>
                {DEPTS.map((d) => (
                  <th key={d.id} style={{ ...th, textAlign: "center" }}>{d.short}</th>
                ))}
                <th style={{ ...th, textAlign: "center" }}>Tổng</th>
              </tr>
            </thead>
            <tbody>
              {hang.map((h) => {
                const voChu = h.ten === "(chưa phân công)";
                return (
                  <tr key={h.ten} style={{ background: voChu ? C.marigoldSoft : undefined }}>
                    <td style={{ ...td, fontWeight: 800 }}>{h.ten}</td>
                    <td style={td}>
                      {voChu ? "—" : h.coTaiKhoan
                        ? <Tag color={C.mintText} bg={C.mintSoft}>có</Tag>
                        : <Tag color={C.raspText} bg={C.raspSoft}>chưa có</Tag>}
                    </td>
                    <td style={{ ...td, fontFamily: "ui-monospace, monospace", fontSize: 12.5 }}>
                      {suaQuyenDuoc && h.tkId ? (
                        <select className="pq-o" aria-label={`Vai trò của ${h.ten}`}
                          value={h.vai || "viewer"} disabled={dangLuu === h.tkId}
                          onChange={(e) => doiQuyen(h.tkId!, h.ten, e.target.value, h.boPhanTaiKhoan)}>
                          {VAI.map((v) => <option key={v.id} value={v.id}>{v.ten}</option>)}
                        </select>
                      ) : (h.vai || "—")}
                    </td>
                    <td style={td}>
                      {suaQuyenDuoc && h.tkId ? (
                        <select className="pq-o" aria-label={`Bộ phận của ${h.ten}`}
                          value={h.boPhanTaiKhoan || ""} disabled={dangLuu === h.tkId}
                          onChange={(e) => doiQuyen(h.tkId!, h.ten, h.vai || "viewer", e.target.value || null)}>
                          <option value="">— chưa gán —</option>
                          {DEPTS.map((d) => <option key={d.id} value={d.id}>{d.short} · {d.name}</option>)}
                        </select>
                      ) : h.boPhanTaiKhoan
                        ? (DEPTS.find((d) => d.id === h.boPhanTaiKhoan)?.short || h.boPhanTaiKhoan)
                        : h.coTaiKhoan ? <span style={{ color: C.marigoldText, fontWeight: 700 }}>chưa gán</span> : "—"}
                    </td>
                    <td style={td}>
                      {voChu ? "—" : suaQuyenDuoc ? (
                        <input className="pq-o" type="email" inputMode="email"
                          aria-label={`Email nhận cảnh báo của ${h.ten}`}
                          placeholder={h.emailTK ? `đăng nhập: ${h.emailTK}` : "chưa có"}
                          defaultValue={h.emailTH || ""}
                          disabled={dangLuu === (h.pid || h.ten)}
                          onBlur={(e) => {
                            const v = e.target.value.trim();
                            if (v === (h.emailTH || "")) return;
                            doiNguoiThucHien(h.pid, h.ten, { email: v || null });
                          }}
                          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
                      ) : (h.email || <span style={{ color: C.marigoldText, fontWeight: 700 }}>chưa có</span>)}
                    </td>
                    {DEPTS.map((d) => {
                      const n = h.theoBp.get(d.id) || 0;
                      /* Quyền HIỆU LỰC ở ô này, theo đúng luật của RPC. */
                      const suaDuoc = voChu ? null
                        : h.vai === "admin" || h.vai === "qa_manager" ? true
                          : h.vai === "department_user" ? h.boPhanTaiKhoan === d.id
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
                <td style={{ ...td, fontWeight: 800 }} colSpan={5}>Tổng theo bộ phận</td>
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
          <span><i style={{ display: "inline-block", width: 12, height: 12, borderRadius: 4, background: C.marigold, marginRight: 6 }} />Chưa có người đứng tên</span>
        </div>
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

      {/* ============ CÁCH DÙNG ============ */}
      <Card variant="soft">
        <CardTitle icon={ShieldCheck} sub="Ba việc làm được ngay, theo thứ tự đáng làm trước">
          Từ ma trận này làm gì tiếp
        </CardTitle>
        <ol style={{ margin: 0, paddingLeft: 22, fontSize: 14, lineHeight: 1.8, color: C.plum }}>
          <li><b>Tạo tài khoản cho người đang đứng tên hạng mục.</b> Người không đăng nhập được thì phải nhờ nhập hộ, mà nhập hộ làm cột "người sửa" trong nhật ký không còn đúng người làm — đó là điểm yếu về ALCOA+ chữ A (Attributable).</li>
          <li><b>Điền email cho người thực hiện</b> ở màn Danh mục &amp; Nhập liệu → tab Người thực hiện. Thiếu email thì cảnh báo đến hạn không tới được người phụ trách.</li>
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
