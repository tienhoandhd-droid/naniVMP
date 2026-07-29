/* =====================================================================
 *  ProgressEditModal.tsx — Hộp cập nhật tiến độ DÙNG CHUNG
 *  ---------------------------------------------------------------------
 *  Trước đây có HAI hộp "Cập nhật tiến độ" trong web:
 *    · bản ở Cập nhật tiến độ — ghi thật vào Supabase, có khoá lạc quan,
 *      bắt buộc lý do theo ALCOA+, gán được người thực hiện
 *    · bản ở Tiến độ theo đối tượng — di tích thời Google Sheet: chỉ xem
 *      trước "dữ liệu sẽ ghi vào Sheet", nút Lưu bị khoá cứng kèm chú
 *      thích "đường ghi ngược Sheet sẽ nối về sau"
 *  Người dùng mở hộp thứ hai, nhập xong, bấm Lưu — không có gì xảy ra.
 *
 *  Nay chỉ còn một hộp, hai màn dùng chung, nên không thể lệch nhau nữa.
 * ===================================================================== */
import { useState } from "react";
import { Pencil, Save, UserCheck } from "lucide-react";
import { C, TEXT, btnPrimary, INP, FIELD, LBL } from "../../constants/theme.ts";
import { TT_OPTS } from "../../constants/vmp.ts";
import { txt, nguoiPhuTrach } from "../../utils/helpers.ts";
import { toISO } from "../../lib/n8nAdapter.ts";
import { setItemPerformer } from "../../lib/supabaseData.ts";
import { usePerformers } from "../../hooks/index.ts";
import { Tag, Modal, ROField, StateBadge } from "../ui/Primitives.tsx";
import type { Activity as PlanActivity } from "../../types/domain.ts";

export default function ProgressEditModal({ act, isAdmin, onClose, onSave, onChangeState, onReload }: {
  act: PlanActivity;
  isAdmin?: boolean;
  onClose: () => void;
  /** Tải lại dữ liệu sau khi đổi người thực hiện (ghi ngoài đường onSave). */
  onReload?: () => void;
  /** (id, patch, userName, reason, expectedVersion) — khoá lạc quan chống ghi đè. */
  onSave: (
    id: string,
    patch: Record<string, unknown>,
    userName?: string,
    reason?: string,
    expectedVersion?: number,
  ) => void;
  onChangeState?: (id: string, newState: string, reason?: string) => void;
}) {
  const raw = act._raw || {};
  const currentState = act.state || raw.state || "active";
  // Chuẩn hoá trạng thái đang lưu (có thể là enum Supabase: completed/in_progress/
  // not_started/overdue) về đúng nhãn trong dropdown để hiển thị đúng hiện trạng.
  const ttOpt = (v: unknown): string => {
    const s = String(v == null ? "" : v).toLowerCase().trim();
    if (!s) return "";
    if (/not[_\s-]?started/.test(s) || /\b(chưa|chua|không|khong)\b/.test(s) || /^\s*(chưa|chua)/.test(s) || /overdue/.test(s)) return "Chưa hoàn thành";
    if (/hoàn thành|hoan thanh|done|đạt|complete|completed|xong/.test(s)) return "Hoàn thành";
    if (/đang|dang|progress|in[_\s-]?progress|thực hiện|thuc hien|wip/.test(s)) return "Đang thực hiện";
    if (/kế hoạch|ke hoach|plan/.test(s)) return "Kế hoạch";
    return "";
  };
  const init: Record<string, string> = {
    ngay_de_cuong: toISO(raw.ngay_de_cuong), tt_de_cuong: ttOpt(raw.tt_de_cuong),
    lich_td: toISO(raw.lich_td) || "",
    ngay_tham_dinh: toISO(raw.ngay_tham_dinh), tt_tham_dinh: ttOpt(raw.tt_tham_dinh),
    ngay_bao_cao: toISO(raw.ngay_bao_cao), tt_bao_cao: ttOpt(raw.tt_bao_cao),
    ngay_vmp: toISO(raw.ngay_vmp), tt_vmp: ttOpt(raw.tt_vmp),
  };
  const [f, setF] = useState(init);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }));

  /* ---- Người thực hiện: gợi ý từ tab "Người thực hiện" ---- */
  const { performers, find } = usePerformers();
  const ownerNow = act.owner && act.owner !== "—" ? String(act.owner) : "";
  const [who, setWho] = useState(ownerNow);
  const [savingWho, setSavingWho] = useState(false);
  const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  const whoChanged = !same(who, ownerNow);
  const whoMatch = find(who);

  // Chỉ ghi tiến độ khi thực sự có ô nào đổi — đổi mỗi người thực hiện mà vẫn
  // gọi RPC tiến độ thì server trả "chưa có thay đổi" và người dùng tưởng hỏng.
  const formChanged = Object.keys(init).some((k) => (f[k] || "") !== (init[k] || ""));
  // S2-7: cần LÝ DO nếu đặt "Hoàn thành" ở bất kỳ giai đoạn nào HOẶC nhập bất kỳ ngày hoàn thành nào.
  const needsReason = formChanged && (
    ["tt_de_cuong", "tt_tham_dinh", "tt_bao_cao", "tt_vmp"].some((k) => f[k] === "Hoàn thành") ||
    ["ngay_de_cuong", "ngay_tham_dinh", "ngay_bao_cao", "ngay_vmp"].some((k) => !!f[k]));

  const handleSave = async () => {
    if (needsReason && !reason.trim()) {
      setErr("Cần nhập LÝ DO khi đánh dấu hoàn thành hoặc nhập ngày hoàn thành (yêu cầu GMP).");
      return;
    }
    if (!formChanged && !whoChanged) { setErr("Chưa có thay đổi nào để lưu."); return; }

    // Người thực hiện lưu riêng: nó nằm ở ĐỐI TƯỢNG chứ không ở hạng mục
    // (owner_name của hạng mục bị đồng bộ Sheet ghi đè mỗi lần chạy).
    if (whoChanged) {
      if (who.trim() && !whoMatch) {
        setErr(`Chưa có "${who.trim()}" trong danh sách người thực hiện. Thêm ở Danh mục & Nhập liệu → tab Người thực hiện.`);
        return;
      }
      setSavingWho(true);
      try {
        const r = await setItemPerformer(act.id, who.trim());
        if (!r.ok) { setErr(r.error || "Gán người thực hiện thất bại"); setSavingWho(false); return; }
      } catch (e) {
        setErr((e as Error).message || "Gán người thực hiện thất bại");
        setSavingWho(false);
        return;
      }
      setSavingWho(false);
      onReload?.();
    }

    // onSave = onUpdate(id, patch, userName, reason). userName để trống (server tự lấy theo JWT).
    // (MỚI) gửi version để KHÓA LẠC QUAN — chống ghi đè khi 2 người sửa cùng hạng mục.
    if (formChanged) {
      onSave(act.id, f, undefined, reason.trim() || undefined, Number(raw.version) || undefined);
    }
    onClose();
  };
  const sel = (k: string) => <select value={f[k]} onChange={set(k)} style={{ ...INP, cursor: "pointer" }}>{TT_OPTS.map((o) => <option key={o} value={o}>{o || "— Chưa nhập —"}</option>)}</select>;
  const dt = (k: string) => <input type="date" value={f[k]} onChange={set(k)} style={INP} />;
  const stage = (title: string, dl: unknown, dCol: string, tCol: string) => (
    <div style={{ background: C.surface, borderRadius: 14, padding: 14, border: `1.5px solid ${C.pinkSoft}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontWeight: 800, color: C.plum, fontSize: 14 }}>{title}</span>
        <Tag color={C.lavText} bg={C.lavSoft}>Deadline: {String(dl || "Không có thông tin")}</Tag>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={FIELD}><span style={LBL}>Ngày hoàn thành thực tế</span>{dt(dCol)}</div>
        <div style={FIELD}><span style={LBL}>Trạng thái</span>{sel(tCol)}</div>
      </div>
    </div>
  );
  return (
    <Modal onClose={onClose} title="Cập nhật tiến độ" icon={Pencil} wide>
      <div style={{ background: C.lavSoft, borderRadius: 14, padding: "12px 16px", marginBottom: 16 }}>
        <div style={{ fontWeight: 800, color: C.plum, fontSize: 15 }}>{act.code} · {act.name}</div>
        <div style={{ fontSize: 12.5, color: C.plumSoft, fontWeight: 600, marginTop: 3 }}>{txt(act.vtype)} · ID: {act.id} · QA: {nguoiPhuTrach(act.owner)}{act.score != null ? ` · Trọng yếu: ${act.score}/9` : ""}{act.effort != null ? ` · ${act.effort} ngày công` : ""}</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
        <ROField label="Deadline VMP (T) · gốc" value={toISO(raw.dl_vmp) || act.target} />
        <div style={FIELD}><span style={LBL}>Lịch thẩm định (bộ phận xếp)</span><input type="date" value={f.lich_td} onChange={set("lich_td")} style={INP} /></div>
      </div>

      {/* Người thực hiện — gõ vào là hiện gợi ý từ tab "Người thực hiện" */}
      <div style={{ ...FIELD, marginBottom: 16 }}>
        <span style={LBL}><UserCheck size={13} style={{ verticalAlign: -2, marginRight: 4 }} />Người thực hiện</span>
        {isAdmin ? (
          <>
            <input
              list="vmp-performer-list"
              value={who}
              onChange={(e) => { setWho(e.target.value); if (err) setErr(""); }}
              placeholder="Gõ tên hoặc chọn trong danh sách — để trống là bỏ gán"
              style={INP} />
            <datalist id="vmp-performer-list">
              {performers.map((p) => (
                <option key={p.id} value={p.performer_name}>
                  {p.email || "chưa có email"}
                </option>
              ))}
            </datalist>
            <span style={{ fontSize: 11.5, color: C.plumSoft, fontWeight: 600, lineHeight: 1.45 }}>
              {who.trim() && !whoMatch
                ? <b style={{ color: "#b00020" }}>Chưa có trong danh sách người thực hiện — thêm ở Danh mục &amp; Nhập liệu → tab Người thực hiện.</b>
                : whoMatch
                  ? <>Email: <b style={{ color: C.plum }}>{whoMatch.email || "chưa có — bổ sung ở tab Người thực hiện"}</b>{whoMatch.department ? ` · ${whoMatch.department}` : ""}</>
                  : "Để trống = bỏ gán người thực hiện."}
              {whoChanged && <> · Áp dụng cho <b>mọi hạng mục của đối tượng {act.code}</b> (phân công lưu ở đối tượng nên không bị đồng bộ Sheet xoá).</>}
            </span>
          </>
        ) : (
          <ROField label="" value={`${nguoiPhuTrach(act.owner)}${find(act.owner)?.email ? ` · ${find(act.owner)?.email}` : ""}`} />
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {stage("1. Đề cương", toISO(raw.dl_de_cuong), "ngay_de_cuong", "tt_de_cuong")}
        {stage("2. Thẩm định thực tế", toISO(raw.dl_tham_dinh), "ngay_tham_dinh", "tt_tham_dinh")}
        {stage("3. Báo cáo", toISO(raw.dl_bao_cao), "ngay_bao_cao", "tt_bao_cao")}
        {stage("4. Tổng kết VMP", "", "ngay_vmp", "tt_vmp")}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 14 }}>
        <span style={LBL}>Lý do {needsReason ? <b style={{ color: "#b00020" }}>(bắt buộc)</b> : "(tuỳ chọn)"}</span>
        <textarea value={reason} onChange={(e) => { setReason(e.target.value); if (err) setErr(""); }}
          rows={2} placeholder="VD: Hoàn thành đúng kế hoạch / cập nhật muộn do chờ kết quả QC…"
          style={{ ...INP, resize: "vertical", minHeight: 54 }} />
        {err && <span style={{ color: "#b00020", fontSize: 12.5, fontWeight: 700 }}>{err}</span>}
      </div>
      <div style={{ display: "flex", gap: 12, marginTop: 22 }}>
        <button onClick={onClose} style={{ flex: 1, padding: "12px", borderRadius: 13, border: `1.5px solid ${C.pinkSoft}`, background: C.surface, color: C.plumSoft, fontFamily: TEXT, fontWeight: 800, cursor: "pointer" }}>Hủy</button>
        <button onClick={handleSave} disabled={savingWho}
          style={{ ...btnPrimary, flex: 2, padding: "12px", borderRadius: 13, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: savingWho ? 0.6 : 1 }}>
          <Save size={17} /> {savingWho ? "Đang lưu…" : "Lưu tiến độ"}
        </button>
      </div>

      {/* S3-G FIX: phần đổi trạng thái nghiệp vụ — chỉ admin/QA manager */}
      {isAdmin && (
        <div style={{ marginTop: 18, padding: 14, borderRadius: 12, background: "#FFF5FA", border: `1px dashed ${C.pinkSoft}` }}>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: C.plumSoft, marginBottom: 8 }}>
            ⚙️ Trạng thái nghiệp vụ (chỉ admin / QA manager)
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 12, color: C.plumSoft, fontWeight: 700 }}>Hiện tại:</span>
            <StateBadge state={String(currentState)} small />
            {currentState === "active" && <span style={{ fontSize: 11, color: C.plumSoft }}>(đang theo dõi bình thường)</span>}
            <div style={{ flex: 1 }} />
            {currentState === "active" ? (
              <>
                <button onClick={() => onChangeState && onChangeState(act.id, "not_applicable")} style={{ padding: "6px 11px", borderRadius: 10, border: `1px solid ${C.lav}`, background: C.surface, color: C.lavText, fontSize: 11.5, fontWeight: 800, cursor: "pointer" }}>⊘ Không áp dụng</button>
                <button onClick={() => onChangeState && onChangeState(act.id, "cancelled")} style={{ padding: "6px 11px", borderRadius: 10, border: `1px solid ${C.marigold}`, background: C.surface, color: C.marigoldText, fontSize: 11.5, fontWeight: 800, cursor: "pointer" }}>⊘ Hủy hạng mục</button>
              </>
            ) : (
              <button onClick={() => onChangeState && onChangeState(act.id, "active")} style={{ padding: "6px 11px", borderRadius: 10, border: `1px solid ${C.mint}`, background: C.surface, color: C.mintText, fontSize: 11.5, fontWeight: 800, cursor: "pointer" }}>↻ Khôi phục Active</button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
