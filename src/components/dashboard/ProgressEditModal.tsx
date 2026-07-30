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
import { txt, nguoiPhuTrach, stageOf } from "../../utils/helpers.ts";
import { toISO } from "../../lib/n8nAdapter.ts";
import { setItemPerformer } from "../../lib/supabaseData.ts";
import { usePerformers } from "../../hooks/index.ts";
import { Tag, Modal, ROField, StateBadge } from "../ui/Primitives.tsx";
import type { Activity as PlanActivity } from "../../types/domain.ts";

/** Ngày hôm nay theo giờ máy (không dùng toISOString — lệch múi giờ VN trước 7h sáng). */
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Giai đoạn pipeline (stageOf) → khối nhập tương ứng trong hộp (1–4). */
const STAGE_BLOCK: Record<string, number> = { chua: 1, dang_dc: 1, cho_td: 2, dang_td: 2, cho_bc: 3, bc: 3, done: 4 };

/** Lý do hay gặp — bấm chip là điền, đỡ gõ tay mỗi lần (vẫn sửa được). */
const REASON_CHIPS = [
  "Hoàn thành đúng kế hoạch",
  "Cập nhật muộn — chờ kết quả QC",
  "Dời lịch theo kế hoạch sản xuất",
  "Bổ sung hồ sơ sau thẩm định",
];

/** Khối nhập (1–4) → cặp cột [ngày, trạng thái] tương ứng. */
const BLOCK_COLS: Record<number, [string, string]> = {
  1: ["ngay_de_cuong", "tt_de_cuong"],
  2: ["ngay_tham_dinh", "tt_tham_dinh"],
  3: ["ngay_bao_cao", "tt_bao_cao"],
  4: ["ngay_vmp", "tt_vmp"],
};

export default function ProgressEditModal({ act, isAdmin, onClose, onSave, onChangeState, onReload, nextAct, onOpenNext, quickDone }: {
  act: PlanActivity;
  isAdmin?: boolean;
  onClose: () => void;
  /** Tải lại dữ liệu sau khi đổi người thực hiện (ghi ngoài đường onSave). */
  onReload?: () => void;
  /** Hạng mục kế tiếp trong danh sách đang lọc — có thì hiện nút "mở tiếp". */
  nextAct?: PlanActivity | null;
  /** Mở hạng mục khác ngay trong hộp (cha phải remount bằng key={act.id}). */
  onOpenNext?: (a: PlanActivity) => void;
  /** Mở hộp với bước hiện tại đã điền sẵn "hôm nay + Hoàn thành" — chỉ còn chọn lý do và Lưu. */
  quickDone?: boolean;
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
  // Khối đang đến lượt nhập — soi theo pipeline để người dùng khỏi dò 4 khối.
  const curBlock = STAGE_BLOCK[stageOf(act)] ?? 0;
  const init: Record<string, string> = {
    ngay_de_cuong: toISO(raw.ngay_de_cuong), tt_de_cuong: ttOpt(raw.tt_de_cuong),
    lich_td: toISO(raw.lich_td) || "",
    ngay_tham_dinh: toISO(raw.ngay_tham_dinh), tt_tham_dinh: ttOpt(raw.tt_tham_dinh),
    ngay_bao_cao: toISO(raw.ngay_bao_cao), tt_bao_cao: ttOpt(raw.tt_bao_cao),
    ngay_vmp: toISO(raw.ngay_vmp), tt_vmp: ttOpt(raw.tt_vmp),
  };
  // Đường tắt "✓ Xong bước" từ bảng: điền sẵn vào BẢN NHÁP (state), không đụng
  // init — nhờ vậy vẫn tính là "có thay đổi" và vẫn bắt buộc lý do như thường.
  const start = { ...init };
  if (quickDone && BLOCK_COLS[curBlock]) {
    const [dc, tc] = BLOCK_COLS[curBlock];
    start[dc] = start[dc] || todayISO();
    start[tc] = "Hoàn thành";
  }
  const [f, setF] = useState(start);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");
  /* ---- Đổi trạng thái nghiệp vụ: chọn trạng thái → nhập lý do tại chỗ → xác nhận ---- */
  const [pendingState, setPendingState] = useState<string | null>(null);
  const [stateReason, setStateReason] = useState("");
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }));
  // Nhập ngày hoàn thành thực tế → tự kéo trạng thái về "Hoàn thành" (vẫn sửa
  // lại được) — chặn từ gốc lỗi "lệch pha hồ sơ" ngày có mà trạng thái không.
  const setDate = (dCol: string, tCol: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF((p) => ({ ...p, [dCol]: e.target.value, [tCol]: e.target.value ? "Hoàn thành" : p[tCol] }));
  const markDone = (dCol: string, tCol: string) => () =>
    setF((p) => ({ ...p, [dCol]: p[dCol] || todayISO(), [tCol]: "Hoàn thành" }));

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
  const nChanged = Object.keys(init).filter((k) => (f[k] || "") !== (init[k] || "")).length;
  const formChanged = nChanged > 0;
  // S2-7: cần LÝ DO nếu đặt "Hoàn thành" ở bất kỳ giai đoạn nào HOẶC nhập bất kỳ ngày hoàn thành nào.
  const needsReason = formChanged && (
    ["tt_de_cuong", "tt_tham_dinh", "tt_bao_cao", "tt_vmp"].some((k) => f[k] === "Hoàn thành") ||
    ["ngay_de_cuong", "ngay_tham_dinh", "ngay_bao_cao", "ngay_vmp"].some((k) => !!f[k]));

  const handleSave = async (goNext = false) => {
    // "Mở tiếp" khi chưa sửa gì = chỉ chuyển hạng mục, không ghi.
    if (goNext && !formChanged && !whoChanged) {
      if (nextAct && onOpenNext) onOpenNext(nextAct);
      return;
    }
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
    if (goNext && nextAct && onOpenNext) onOpenNext(nextAct);
    else onClose();
  };
  const sel = (k: string) => <select value={f[k]} onChange={set(k)} style={{ ...INP, cursor: "pointer" }}>{TT_OPTS.map((o) => <option key={o} value={o}>{o || "— Chưa nhập —"}</option>)}</select>;
  const stage = (n: number, title: string, dl: unknown, dCol: string, tCol: string) => {
    const isDone = f[tCol] === "Hoàn thành" && !!f[dCol];
    const isCur = curBlock === n && !isDone;
    return (
      <div style={{ background: C.surface, borderRadius: 14, padding: 14, border: `1.5px solid ${isCur ? C.marigold : C.pinkSoft}`, boxShadow: isCur ? `0 0 0 2px ${C.marigoldSoft}` : "none" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 800, color: C.plum, fontSize: 14 }}>
            {title}
            {isCur && <Tag color={C.marigoldText} bg={C.marigoldSoft}>← đang ở bước này</Tag>}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Tag color={C.lavText} bg={C.lavSoft}>Deadline: {String(dl || "Không có thông tin")}</Tag>
            {!isDone && (
              <button onClick={markDone(dCol, tCol)} title="Điền ngày hôm nay + trạng thái Hoàn thành trong 1 bấm"
                style={{ padding: "5px 11px", borderRadius: 999, border: `1px solid ${C.mint}`, background: C.mintSoft, color: C.mintText, fontFamily: TEXT, fontSize: 11.5, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" }}>
                ✓ Xong hôm nay
              </button>
            )}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={FIELD}><span style={LBL}>Ngày hoàn thành thực tế</span><input type="date" value={f[dCol]} onChange={setDate(dCol, tCol)} style={INP} /></div>
          <div style={FIELD}><span style={LBL}>Trạng thái</span>{sel(tCol)}</div>
        </div>
        {f[tCol] === "Hoàn thành" && !f[dCol] && (
          <div style={{ marginTop: 8, fontSize: 11.5, fontWeight: 700, color: "#b00020" }}>
            Đã ghi Hoàn thành nhưng thiếu ngày thực tế — sẽ bị báo lỗi ALCOA+.{" "}
            <button onClick={() => setF((p) => ({ ...p, [dCol]: todayISO() }))}
              style={{ border: "none", background: "none", color: C.mintText, fontFamily: TEXT, fontWeight: 800, fontSize: 11.5, cursor: "pointer", textDecoration: "underline", padding: 0 }}>
              Điền hôm nay
            </button>
          </div>
        )}
      </div>
    );
  };
  return (
    <Modal onClose={onClose} title="Cập nhật tiến độ" icon={Pencil} wide>
      <div style={{ background: C.lavSoft, borderRadius: 14, padding: "12px 16px", marginBottom: 16 }}>
        <div style={{ fontWeight: 800, color: C.plum, fontSize: 15 }}>{act.code} · {act.name}</div>
        <div style={{ fontSize: 12.5, color: C.plumSoft, fontWeight: 600, marginTop: 3 }}>{txt(act.vtype)} · ID: {act.id} · QA: {nguoiPhuTrach(act.owner)}{act.score != null ? ` · Trọng yếu: ${act.score}/9` : ""}{act.effort != null ? ` · ${act.effort} ngày công` : ""}</div>
      </div>
      {quickDone && BLOCK_COLS[curBlock] && (
        <div style={{ background: C.mintSoft, border: `1px solid ${C.mint}`, borderRadius: 12, padding: "10px 14px", marginBottom: 16, fontSize: 12.5, fontWeight: 700, color: C.mintText, lineHeight: 1.55 }}>
          ⚡ Đã điền sẵn <b>hôm nay + Hoàn thành</b> cho bước hiện tại — kiểm tra lại ngày,
          chọn lý do rồi bấm Lưu. Chưa ghi gì cho tới khi bạn Lưu.
        </div>
      )}
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
        {stage(1, "1. Đề cương", toISO(raw.dl_de_cuong), "ngay_de_cuong", "tt_de_cuong")}
        {stage(2, "2. Thẩm định thực tế", toISO(raw.dl_tham_dinh), "ngay_tham_dinh", "tt_tham_dinh")}
        {stage(3, "3. Báo cáo", toISO(raw.dl_bao_cao), "ngay_bao_cao", "tt_bao_cao")}
        {stage(4, "4. Tổng kết VMP", "", "ngay_vmp", "tt_vmp")}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 14 }}>
        <span style={LBL}>Lý do {needsReason ? <b style={{ color: "#b00020" }}>(bắt buộc)</b> : "(tuỳ chọn)"}</span>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {REASON_CHIPS.map((r) => (
            <button key={r} onClick={() => { setReason(r); if (err) setErr(""); }}
              style={{ padding: "5px 11px", borderRadius: 999, border: "none", cursor: "pointer",
                       fontFamily: TEXT, fontSize: 11.5, fontWeight: 700,
                       background: reason === r ? C.plum : C.pinkSoft,
                       color: reason === r ? "#fff" : C.plumSoft }}>
              {r}
            </button>
          ))}
        </div>
        <textarea value={reason} onChange={(e) => { setReason(e.target.value); if (err) setErr(""); }}
          rows={2} placeholder="Bấm chip ở trên hoặc gõ lý do khác…"
          style={{ ...INP, resize: "vertical", minHeight: 54 }} />
        {err && <span style={{ color: "#b00020", fontSize: 12.5, fontWeight: 700 }}>{err}</span>}
      </div>
      <div style={{ display: "flex", gap: 12, marginTop: 22 }}>
        <button onClick={onClose} style={{ flex: 1, padding: "12px", borderRadius: 13, border: `1.5px solid ${C.pinkSoft}`, background: C.surface, color: C.plumSoft, fontFamily: TEXT, fontWeight: 800, cursor: "pointer" }}>Hủy</button>
        <button onClick={() => handleSave(false)} disabled={savingWho || (!formChanged && !whoChanged)}
          title={!formChanged && !whoChanged ? "Chưa sửa ô nào nên chưa có gì để lưu" : undefined}
          style={{ ...btnPrimary, flex: 2, padding: "12px", borderRadius: 13, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: savingWho || (!formChanged && !whoChanged) ? 0.55 : 1, cursor: !formChanged && !whoChanged ? "not-allowed" : "pointer" }}>
          <Save size={17} /> {savingWho ? "Đang lưu…" : nChanged + (whoChanged ? 1 : 0) > 0 ? `Lưu ${nChanged + (whoChanged ? 1 : 0)} thay đổi` : "Lưu tiến độ"}
        </button>
        {nextAct && onOpenNext && (
          <button onClick={() => handleSave(true)} disabled={savingWho}
            title={`Tiếp theo: ${nextAct.code} · ${nextAct.name}`}
            style={{ flex: 1.4, padding: "12px", borderRadius: 13, border: `1.5px solid ${C.plum}`, background: C.surface, color: C.plum, fontFamily: TEXT, fontWeight: 800, cursor: "pointer", opacity: savingWho ? 0.6 : 1, whiteSpace: "nowrap" }}>
            {formChanged || whoChanged ? "Lưu & mở tiếp →" : "Mở tiếp →"}
          </button>
        )}
      </div>

      {/* S3-G FIX: phần đổi trạng thái nghiệp vụ — chỉ admin/QA manager.
          Lý do nhập NGAY TẠI ĐÂY thay vì window.prompt: prompt hệ thống không
          có gợi ý, bấm nhầm Cancel là mất, và không đồng bộ giao diện. */}
      {isAdmin && onChangeState && (
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
                <button onClick={() => { setPendingState(pendingState === "not_applicable" ? null : "not_applicable"); setStateReason(""); }} style={{ padding: "6px 11px", borderRadius: 10, border: `1px solid ${C.lav}`, background: pendingState === "not_applicable" ? C.lavSoft : C.surface, color: C.lavText, fontSize: 11.5, fontWeight: 800, cursor: "pointer" }}>⊘ Không áp dụng</button>
                <button onClick={() => { setPendingState(pendingState === "cancelled" ? null : "cancelled"); setStateReason(""); }} style={{ padding: "6px 11px", borderRadius: 10, border: `1px solid ${C.marigold}`, background: pendingState === "cancelled" ? C.marigoldSoft : C.surface, color: C.marigoldText, fontSize: 11.5, fontWeight: 800, cursor: "pointer" }}>⊘ Hủy hạng mục</button>
              </>
            ) : (
              <button onClick={() => { setPendingState(pendingState === "active" ? null : "active"); setStateReason(""); }} style={{ padding: "6px 11px", borderRadius: 10, border: `1px solid ${C.mint}`, background: pendingState === "active" ? C.mintSoft : C.surface, color: C.mintText, fontSize: 11.5, fontWeight: 800, cursor: "pointer" }}>↻ Khôi phục Active</button>
            )}
          </div>
          {pendingState && (
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={LBL}>
                Lý do {pendingState === "active" ? "KHÔI PHỤC về Active" : pendingState === "not_applicable" ? 'đánh dấu "Không áp dụng"' : "HỦY hạng mục"} <b style={{ color: "#b00020" }}>(bắt buộc)</b>
              </span>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input value={stateReason} onChange={(e) => setStateReason(e.target.value)} autoFocus
                  placeholder={pendingState === "not_applicable" ? "VD: thiết bị ngừng dùng từ Q3/2026…" : pendingState === "cancelled" ? "VD: theo phê duyệt CAPA #…" : "VD: thiết bị đưa vào dùng lại…"}
                  style={{ ...INP, flex: 1, minWidth: 220 }} />
                <button disabled={!stateReason.trim()}
                  onClick={() => onChangeState(act.id, pendingState, stateReason.trim())}
                  style={{ ...btnPrimary, padding: "9px 16px", borderRadius: 10, fontSize: 12.5, opacity: stateReason.trim() ? 1 : 0.5, cursor: stateReason.trim() ? "pointer" : "not-allowed" }}>
                  Xác nhận
                </button>
                <button onClick={() => { setPendingState(null); setStateReason(""); }}
                  style={{ padding: "9px 14px", borderRadius: 10, border: `1.5px solid ${C.pinkSoft}`, background: C.surface, color: C.plumSoft, fontFamily: TEXT, fontWeight: 800, fontSize: 12.5, cursor: "pointer" }}>
                  Thôi
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
