/* =====================================================================
 *  WorkshopAssignmentInline — nhân sự xưởng của MỘT hạng mục, ngay trong
 *  hộp sửa tiến độ (chốt hẹp còn lại của Đợt B Task 12)
 *  ---------------------------------------------------------------------
 *  Trước đây muốn gán nhân viên xưởng cho một hạng mục phải rời hộp sửa,
 *  sang màn Phân quyền, tìm lại người, tìm lại hạng mục. Ở đây làm tại
 *  chỗ — nhưng KHÔNG chép luật: đọc/ghi qua đúng
 *  rpc_item_assignments / rpc_set_item_assignment (an toàn xung đột,
 *  bắt buộc lý do), server vẫn tự kiểm phạm vi bộ phận/khu vực/line.
 *
 *  Chỉ hiện khi caller có quyền assign_workshop_staff — nhân viên xưởng
 *  không thấy bất kỳ lối phân công nào.
 * ===================================================================== */
import { useEffect, useState } from "react";
import { C, TEXT } from "../../constants/theme.ts";
import {
  fetchItemAssignments, searchActivePerformers, setItemAssignment,
} from "../itemPermissions/api.ts";
import type { DirectoryPerson, ItemAssignment } from "../itemPermissions/types.ts";

const NUT_NHO: React.CSSProperties = {
  padding: "6px 12px", borderRadius: 10, cursor: "pointer", fontSize: 12,
  fontFamily: TEXT, fontWeight: 700, border: `1px solid ${C.pinkSoft}`,
  background: C.surface, color: C.plum,
};

export default function WorkshopAssignmentInline({ validationCode, canAssign }: {
  validationCode: string;
  canAssign: boolean;
}) {
  const [mo, setMo] = useState(false);
  const [tt, setTt] = useState<"chua" | "dang" | "xong" | "loi">("chua");
  const [ds, setDs] = useState<ItemAssignment[]>([]);
  const [loi, setLoi] = useState("");

  const [tim, setTim] = useState("");
  const [ungVien, setUngVien] = useState<DirectoryPerson[]>([]);
  const [chon, setChon] = useState<DirectoryPerson | null>(null);
  const [lyDo, setLyDo] = useState("");
  const [dangGhi, setDangGhi] = useState(false);
  const [goBo, setGoBo] = useState<ItemAssignment | null>(null);
  const [lyDoGo, setLyDoGo] = useState("");

  const taiDanhSach = async () => {
    setTt("dang");
    try {
      const tatCa = await fetchItemAssignments({ validationCode });
      setDs(tatCa.filter((a) => a.assignment_kind === "equipment_department" && a.is_active));
      setTt("xong");
    } catch (e) {
      setLoi((e as Error).message || "Không đọc được phân công");
      setTt("loi");
    }
  };

  const moMuc = () => {
    const sapMo = !mo;
    setMo(sapMo);
    if (sapMo && tt === "chua") taiDanhSach();
  };

  /* Tìm ứng viên: chờ 250ms sau phím cuối, chỉ giữ workshop_staff đang
     hoạt động — luật lọc ở client chỉ để gọn danh sách, server vẫn là
     người quyết cuối khi ghi. */
  useEffect(() => {
    if (!mo || tim.trim() === "") { setUngVien([]); return undefined; }
    let dung = false;
    const hen = setTimeout(async () => {
      try {
        const nguoi = await searchActivePerformers(tim.trim());
        if (!dung) {
          setUngVien(nguoi.filter((p) => p.access_class === "workshop_staff").slice(0, 8));
        }
      } catch { if (!dung) setUngVien([]); }
    }, 250);
    return () => { dung = true; clearTimeout(hen); };
  }, [tim, mo]);

  /* Nhân viên xưởng không có gì để làm ở đây — không dựng cả mục.
     (Đặt SAU mọi hook để không phạm luật hook có điều kiện.) */
  if (!canAssign) return null;

  const ghi = async (input: {
    personId: string; action: "assign" | "revoke"; reason: string;
  }) => {
    setDangGhi(true);
    setLoi("");
    try {
      await setItemAssignment({
        personId: input.personId,
        validationCode,
        assignmentKind: "equipment_department",
        assignmentRole: null,
        action: input.action,
        reason: input.reason,
        expectedPrimaryAssignmentId: null,
      });
      setChon(null); setTim(""); setLyDo(""); setGoBo(null); setLyDoGo("");
      await taiDanhSach();
    } catch (e) {
      /* Server từ chối (ngoài phạm vi bộ phận/khu vực, trùng phân công…)
         — nói nguyên văn, đừng dịch mất mã lỗi. */
      setLoi((e as Error).message || "Ghi phân công thất bại");
    }
    setDangGhi(false);
  };

  return (
    <div style={{ marginTop: 14 }}>
      <button type="button" onClick={moMuc} aria-expanded={mo}
        style={{ display: "flex", alignItems: "center", gap: 6, border: "none",
                 background: "transparent", cursor: "pointer", padding: "6px 0",
                 fontFamily: TEXT, fontSize: 13, fontWeight: 800, color: C.plumSoft }}>
        {mo ? "▾" : "▸"} Nhân sự xưởng{tt === "xong" ? ` (${ds.length})` : ""}
      </button>

      {mo && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, fontFamily: TEXT }}>
          {tt === "dang" && (
            <div style={{ fontSize: 12, color: C.plumSoft }}>Đang tải phân công…</div>
          )}
          {loi && (
            <div role="alert" style={{ fontSize: 12, color: C.raspText, fontWeight: 600,
                                       padding: "8px 11px", borderRadius: 10, background: C.raspSoft }}>
              {loi}
            </div>
          )}

          {tt === "xong" && ds.length === 0 && (
            <div style={{ fontSize: 12, color: C.plumSoft }}>
              Chưa có nhân viên xưởng nào được phân công cho hạng mục này.
            </div>
          )}

          {ds.map((a) => (
            <div key={a.assignment_id}
              style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
                       padding: "8px 12px", borderRadius: 10, background: C.surfaceSunk }}>
              <b style={{ fontSize: 13, color: C.plum }}>{a.staff_name}</b>
              <span style={{ fontSize: 12, color: C.plumSoft }}>
                {[a.employee_code, a.object_department, a.area].filter(Boolean).join(" · ")}
              </span>
              <div style={{ flex: 1 }} />
              {goBo?.assignment_id === a.assignment_id ? (
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  <input value={lyDoGo} onChange={(e) => setLyDoGo(e.target.value)} autoFocus
                    placeholder="Lý do gỡ (bắt buộc)"
                    style={{ padding: "6px 10px", borderRadius: 10, fontSize: 12,
                             fontFamily: TEXT, border: `1px solid ${C.pinkSoft}`, minWidth: 180 }} />
                  <button type="button" disabled={!lyDoGo.trim() || dangGhi}
                    onClick={() => a.person_id && ghi({ personId: a.person_id, action: "revoke", reason: lyDoGo.trim() })}
                    style={{ ...NUT_NHO, background: C.plum, color: C.surface, border: "none",
                             opacity: !lyDoGo.trim() || dangGhi ? 0.5 : 1 }}>
                    Xác nhận gỡ
                  </button>
                  <button type="button" onClick={() => { setGoBo(null); setLyDoGo(""); }}
                    style={NUT_NHO}>Thôi</button>
                </div>
              ) : (
                <button type="button" onClick={() => { setGoBo(a); setLyDoGo(""); }}
                  style={NUT_NHO}>
                  Gỡ phân công
                </button>
              )}
            </div>
          ))}

          {/* ---- Gán người mới ---- */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
            <input value={tim} onChange={(e) => { setTim(e.target.value); setChon(null); }}
              aria-label="Tìm nhân sự xưởng"
              placeholder="Tìm nhân viên xưởng theo tên hoặc mã…"
              style={{ padding: "8px 11px", borderRadius: 10, fontSize: 13,
                       fontFamily: TEXT, border: `1px solid ${C.pinkSoft}` }} />
            {ungVien.length > 0 && !chon && (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {ungVien.map((p) => (
                  <button key={p.person_id} type="button"
                    onClick={() => { setChon(p); setUngVien([]); }}
                    style={{ ...NUT_NHO, textAlign: "left", display: "flex", gap: 8 }}>
                    <b>{p.full_name}</b>
                    <span style={{ color: C.plumSoft, fontWeight: 600 }}>
                      {[p.employee_code, p.department].filter(Boolean).join(" · ")}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {chon && (
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: 12, color: C.plum, fontWeight: 700 }}>
                  Gán: {chon.full_name}
                </span>
                <input value={lyDo} onChange={(e) => setLyDo(e.target.value)}
                  placeholder="Lý do phân công (bắt buộc)"
                  style={{ padding: "6px 10px", borderRadius: 10, fontSize: 12, flex: 1,
                           fontFamily: TEXT, border: `1px solid ${C.pinkSoft}`, minWidth: 180 }} />
                <button type="button" disabled={!lyDo.trim() || dangGhi}
                  onClick={() => ghi({ personId: chon.person_id, action: "assign", reason: lyDo.trim() })}
                  style={{ ...NUT_NHO, background: C.plum, color: C.surface, border: "none",
                           opacity: !lyDo.trim() || dangGhi ? 0.5 : 1 }}>
                  {dangGhi ? "Đang ghi…" : "Gán vào hạng mục"}
                </button>
                <button type="button" onClick={() => setChon(null)} style={NUT_NHO}>Thôi</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
