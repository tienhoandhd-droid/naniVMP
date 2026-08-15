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
import { useEffect, useState } from "react";
import { Pencil, Save, UserCheck } from "lucide-react";
import { C, TEXT, btnPrimary, INP, FIELD, LBL } from "../../constants/theme.ts";
import { TT_OPTS } from "../../constants/vmp.ts";
import { txt, nguoiPhuTrach, stageOf } from "../../utils/helpers.ts";
import { toISO } from "../../lib/n8nAdapter.ts";
import {
  fetchTimelineFieldPermission,
  fetchItemProgressHistory,
  setItemPerformerById,
  type ItemProgressHistoryEntry,
  type TimelineFieldPermission,
  type TimelinePermissionMode,
} from "../../lib/supabaseData.ts";
import { usePerformers } from "../../hooks/index.ts";
import PerformerSelect from "../../features/itemPermissions/PerformerSelect.tsx";
import {
  buildActivePerformerChoices,
  resolvePerformerChoice,
  resolveUniquePerformerIdByName,
} from "../../features/itemPermissions/performerSelection.ts";
import { Tag, Modal, ROField, StateBadge } from "../ui/Primitives.tsx";
import { progressModalContentState } from "./progressModalAccess.ts";
import WorkshopAssignmentInline from "../../features/progress/WorkshopAssignmentInline.tsx";
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

/** Tên control trên form → tên cột DB mà allowlist quyền trả về. */
const FORM_TO_DB_COLUMN: Record<string, string> = {
  ngay_de_cuong: "actual_protocol_date",
  tt_de_cuong: "status_protocol",
  ngay_tham_dinh: "actual_validation_date",
  tt_tham_dinh: "status_validation",
  ngay_bao_cao: "actual_report_date",
  tt_bao_cao: "status_report",
  ngay_vmp: "actual_vmp_date",
  tt_vmp: "status_vmp",
  lich_td: "scheduled_at",
};

/** Bốn bước là MỘT CHUỖI, không phải bốn ô rời nhau: đề cương xong mới thẩm
 *  định được, thẩm định xong mới viết báo cáo, có báo cáo mới tổng kết VMP.
 *  Bảng này là chỗ duy nhất khai thứ tự đó để mọi phép kiểm dưới đây dùng
 *  chung — thêm bước mới chỉ phải sửa ở đây. */
const CHUOI = [
  { n: 1, ten: "Đề cương",          d: "ngay_de_cuong",  t: "tt_de_cuong",  dl: "dl_de_cuong",  goc: "tt_de_cuong_goc" },
  { n: 2, ten: "Thẩm định thực tế", d: "ngay_tham_dinh", t: "tt_tham_dinh", dl: "dl_tham_dinh", goc: "tt_tham_dinh_goc" },
  { n: 3, ten: "Báo cáo",           d: "ngay_bao_cao",   t: "tt_bao_cao",   dl: "dl_bao_cao",   goc: "tt_bao_cao_goc" },
  { n: 4, ten: "Tổng kết VMP",      d: "ngay_vmp",       t: "tt_vmp",       dl: "dl_vmp",       goc: "tt_vmp_goc" },
] as const;

const ngayVN = (s: string) => (s ? s.split("-").reverse().join("/") : "—");

/** timestamptz → giá trị datetime-local tại Asia/Bangkok. Không dùng timezone
 * của máy người mở web, vì lịch vận hành thuộc nhà máy tại Việt Nam. */
function toBangkokDateTimeLocal(value: unknown): string {
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return `${text}T00:00`;
  const local = text.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::\d{2})?$/);
  if (local) return `${local[1]}T${local[2]}`;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

/** Số ngày từ hôm nay tới hạn (âm = đã quá hạn). null khi không có hạn. */
function conLai(hanISO: string): number | null {
  if (!hanISO) return null;
  const h = new Date(`${hanISO}T00:00:00`);
  if (Number.isNaN(h.getTime())) return null;
  const t = new Date();
  const t0 = new Date(t.getFullYear(), t.getMonth(), t.getDate());
  return Math.round((h.getTime() - t0.getTime()) / 86400000);
}

export default function ProgressEditModal({ act, isAdmin, onClose, onSave, onChangeState, onReload, nextAct, onOpenNext, quickDone, editableFields, permissionMode, canAssignWorkshop }: {
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
  /** Cho phép caller đã có quyền truyền thẳng; nếu thiếu modal tự đọc quyền hiệu lực. */
  editableFields?: readonly string[];
  permissionMode?: TimelinePermissionMode;
  /** access.can("progress","assign_workshop_staff") — mở mục Nhân sự xưởng. */
  canAssignWorkshop?: boolean;
  /** (id, patch, userName, reason, expectedVersion) — khoá lạc quan chống ghi đè. */
  onSave: (
    id: string,
    patch: Record<string, unknown>,
    userName?: string,
    reason?: string,
    expectedVersion?: number,
  ) => unknown | Promise<unknown>;
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
    lich_td: toBangkokDateTimeLocal(raw.scheduled_at ?? raw.lich_td),
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
  const [fieldPermission, setFieldPermission] = useState<TimelineFieldPermission | null>(() =>
    permissionMode
      ? { mode: permissionMode, canView: true, editableFields: editableFields || [], reason: editableFields?.length ? "Theo quyền hiệu lực" : "Chỉ xem" }
      : null
  );
  const [permissionError, setPermissionError] = useState("");
  useEffect(() => {
    if (permissionMode) {
      setFieldPermission({
        mode: permissionMode,
        canView: true,
        editableFields: editableFields || [],
        reason: editableFields?.length ? "Theo quyền hiệu lực" : "Chỉ xem",
      });
      setPermissionError("");
      return;
    }
    let active = true;
    let requestVersion = 0;
    const reloadPermission = () => {
      const currentRequest = ++requestVersion;
      // Mỗi lần kiểm lại phải khóa ngay: dữ liệu quyền cũ không được dùng
      // trong lúc tab vừa quay lại hoặc request mới còn đang bay.
      setFieldPermission(null);
      setPermissionError("");
      fetchTimelineFieldPermission(act.id).then((permission) => {
        if (active && currentRequest === requestVersion) setFieldPermission(permission);
      }).catch((error: unknown) => {
        if (!active || currentRequest !== requestVersion) return;
        setPermissionError((error as Error).message || "Không tải được quyền hạng mục");
        // Không biết quyền mới thì không được suy đoán người dùng còn xem được.
        setFieldPermission({ mode: "enforced", canView: false, editableFields: [], reason: "Không thể xác nhận quyền xem" });
      });
    };
    const reloadWhenVisible = () => {
      if (document.visibilityState !== "hidden") reloadPermission();
    };
    reloadPermission();
    window.addEventListener("focus", reloadWhenVisible);
    document.addEventListener("visibilitychange", reloadWhenVisible);
    return () => {
      active = false;
      requestVersion += 1;
      window.removeEventListener("focus", reloadWhenVisible);
      document.removeEventListener("visibilitychange", reloadWhenVisible);
    };
  }, [act.id, editableFields, permissionMode]);
  const isEnforced = fieldPermission?.mode === "enforced";
  const permissionLoading = fieldPermission == null;
  const canEdit = (dbColumn: string) => !permissionLoading
    && (!isEnforced || fieldPermission.editableFields.includes(dbColumn));
  const canEditForm = (formKey: string) => canEdit(FORM_TO_DB_COLUMN[formKey]);
  const timelineViewOnly = fieldPermission?.mode === "enforced"
    && fieldPermission.editableFields.length === 0;
  const contentState = progressModalContentState(fieldPermission, permissionError);
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

  /* ---- Người thực hiện: chỉ giữ person_id trong bản nháp tới lúc bấm Lưu ---- */
  const { performers } = usePerformers();
  const performerChoices = buildActivePerformerChoices(performers);
  const rawOwnerPersonId = raw.owner_person_id ? String(raw.owner_person_id) : null;
  const ownerPersonIdNow = rawOwnerPersonId
    ?? resolveUniquePerformerIdByName(String(act.owner ?? ""), performerChoices);
  const [performerDraftId, setPerformerDraftId] = useState<string | null>(rawOwnerPersonId);
  const [performerTouched, setPerformerTouched] = useState(false);
  const performerPersonId = performerTouched ? performerDraftId : ownerPersonIdNow;
  const [savingWho, setSavingWho] = useState(false);
  const [savingProgress, setSavingProgress] = useState(false);
  const whoChanged = performerPersonId !== ownerPersonIdNow;
  const selectedPerformer = resolvePerformerChoice(performerPersonId, performerChoices);

  // Chỉ ghi tiến độ khi thực sự có ô nào đổi — đổi mỗi người thực hiện mà vẫn
  // gọi RPC tiến độ thì server trả "chưa có thay đổi" và người dùng tưởng hỏng.
  const doiRoi = Object.keys(init).filter((k) =>
    (f[k] || "") !== (init[k] || "") && canEditForm(k));
  const nChanged = doiRoi.length;
  const formChanged = nChanged > 0;

  /* ---- Liên kết giữa bốn bước ----
   * Hai luật, cùng một gốc: bốn bước là một chuỗi.
   *   · Ngày bước sau không được sớm hơn ngày bước trước.
   *   · Không đánh dấu bước sau "Hoàn thành" khi bước trước chưa xong.
   * Dữ liệu đang có 22 hạng mục "báo cáo xong mà thẩm định chưa xong" và 4
   * hạng mục "thẩm định xong mà đề cương chưa xong" — chặn cứng thì người
   * dùng không mở ra sửa được chính những dòng đó. Nên: mâu thuẫn dính tới ô
   * VỪA SỬA thì CHẶN (đừng tạo thêm cái sai mới), mâu thuẫn có sẵn thì chỉ
   * NHẮC để người dùng biết mà dọn.
   */
  const viPham = (() => {
    const out: Array<{ msg: string; keys: string[] }> = [];
    for (let i = 1; i < CHUOI.length; i++) {
      const tr = CHUOI[i - 1], sau = CHUOI[i];
      const dTr = f[tr.d] || "", dSau = f[sau.d] || "";
      if (dTr && dSau && dSau < dTr) {
        out.push({
          msg: `Ngày ${sau.ten.toLowerCase()} (${ngayVN(dSau)}) sớm hơn ngày ${tr.ten.toLowerCase()} (${ngayVN(dTr)}).`,
          keys: [tr.d, sau.d],
        });
      }
      if (f[sau.t] === "Hoàn thành" && f[tr.t] !== "Hoàn thành") {
        out.push({
          msg: `Đánh dấu ${sau.ten.toLowerCase()} HOÀN THÀNH trong khi ${tr.ten.toLowerCase()} chưa hoàn thành.`,
          keys: [tr.t, sau.t],
        });
      }
    }

    /* HAI LUẬT CÒN THIẾU, thêm 2026-08-01.
     *
     * 1. "Hoàn thành" mà KHÔNG CÓ NGÀY. Đây chính là lỗ đã tạo ra 97 hạng
     *    mục ghi hoàn thành nhưng không có ngày thực tế nào — bằng đúng
     *    tổng số hạng mục hoàn thành lúc rà. ALCOA+ đòi ghi nhận ĐỒNG THỜI:
     *    "xong" mà không nói xong lúc nào thì không kiểm chứng được, và đó
     *    là thứ thanh tra hỏi đầu tiên.
     *
     * 2. Có NGÀY mà trạng thái không phải "Hoàn thành". Hai ô nói ngược
     *    nhau: một bên bảo đã làm xong ngày đó, một bên bảo chưa xong. Ô
     *    ngày tự đặt trạng thái khi gõ, nhưng đổi ngược trạng thái lại thì
     *    lọt.
     *
     * Giữ đúng triết lý sẵn có của hộp này: CHẶN cái mới tạo ra, chỉ NHẮC
     * cái đã có sẵn trong dữ liệu — chặn cứng thì người dùng không mở ra
     * sửa được chính những dòng hỏng đó.
     */
    for (const b of CHUOI) {
      if (f[b.t] === "Hoàn thành" && !f[b.d]) {
        out.push({
          msg: `${b.ten} ghi HOÀN THÀNH nhưng chưa có ngày thực tế — ALCOA+ đòi ghi rõ xong lúc nào.`,
          keys: [b.t, b.d],
        });
      }
      if (f[b.d] && f[b.t] !== "Hoàn thành") {
        out.push({
          msg: `${b.ten} đã có ngày thực tế (${ngayVN(f[b.d])}) nhưng trạng thái vẫn là "${f[b.t] || "chưa nhập"}".`,
          keys: [b.d, b.t],
        });
      }
    }
    return out;
  })();
  const dinhToOSua = (v: { keys: string[] }) => v.keys.some((k) => doiRoi.includes(k));
  const chan = viPham.filter(dinhToOSua);
  const nhac = viPham.filter((v) => !dinhToOSua(v));
  // S2-7: cần LÝ DO nếu đặt "Hoàn thành" ở bất kỳ giai đoạn nào HOẶC nhập bất kỳ ngày hoàn thành nào.
  const needsReason = whoChanged || (
    ["tt_de_cuong", "tt_tham_dinh", "tt_bao_cao", "tt_vmp"].some((k) => doiRoi.includes(k) && f[k] === "Hoàn thành") ||
    ["ngay_de_cuong", "ngay_tham_dinh", "ngay_bao_cao", "ngay_vmp"].some((k) => doiRoi.includes(k)));

  /* Ngày THỰC TẾ nằm ở tương lai — chặn cứng.
     Thuộc tính max của ô nhập chỉ chặn khi bấm chọn trên lịch; gõ tay hoặc
     dán vào thì vẫn lọt. Kiểm lại ở đây, và server còn kiểm lần nữa. */
  const ngayTuongLai = CHUOI
    .filter((s) => f[s.d] && f[s.d] > todayISO())
    .map((s) => `${s.ten} (${ngayVN(f[s.d])})`);

  /* Còn thiếu gì để lưu được — MỘT câu, dùng cho cả nút và dải cảnh báo.
     Trả về chuỗi rỗng nghĩa là lưu được. Tính ở đây chứ không lặp lại điều
     kiện ở hai chỗ: lệch nhau một lần là nút sáng mà bấm không ăn. */
  const thieuGi = (!formChanged && !whoChanged)
    ? "chưa sửa ô nào"
    : ngayTuongLai.length
      ? `ngày hoàn thành thực tế không thể ở tương lai — ${ngayTuongLai.join(", ")}. `
        + `Hôm nay là ${ngayVN(todayISO())}.`
    : chan.length
      ? "còn mâu thuẫn giữa các bước — " + chan.map((v) => v.msg).join(" ")
      : (needsReason && !reason.trim())
        ? "cần nhập LÝ DO (yêu cầu GMP khi đánh dấu hoàn thành hoặc nhập ngày hoàn thành)"
        : "";

  const handleSave = async (goNext = false) => {
    // "Mở tiếp" khi chưa sửa gì = chỉ chuyển hạng mục, không ghi.
    if (goNext && !formChanged && !whoChanged) {
      if (nextAct && onOpenNext) onOpenNext(nextAct);
      return;
    }
    if (chan.length) {
      setErr("Không lưu được vì mâu thuẫn giữa các bước: " + chan.map((v) => v.msg).join(" ")
        + " Bốn bước phải theo đúng thứ tự đề cương → thẩm định → báo cáo → tổng kết VMP.");
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
      if (performerPersonId && !selectedPerformer) {
        setErr("Người được chọn không còn hoạt động hoặc không tồn tại. Hãy chọn lại từ danh bạ.");
        return;
      }
      setSavingWho(true);
      try {
        const r = await setItemPerformerById(act.id, performerPersonId, reason.trim());
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
    // Gửi version để KHÓA LẠC QUAN — chống ghi đè khi 2 người sửa cùng hạng mục.
    //
    // KHÔNG dùng `Number(raw.version) || undefined`: version của hạng mục CHƯA
    // TỪNG sửa là 0, mà 0 là falsy nên biểu thức đó luôn ra undefined. RPC chỉ
    // kiểm khi p_expected_version IS NOT NULL, nên khoá lạc quan chưa bao giờ
    // chạy đúng ở lần sửa đầu tiên — đúng lúc cần nhất (2026-07-30: cả 461
    // hạng mục đều đang ở version 0).
    // Thiếu version thì gửi undefined (bỏ kiểm) — gửi bừa 0 sẽ tạo ra
    // version_conflict giả. Number(null) ra 0 nên phải loại null trước.
    if (formChanged) {
      const v = raw.version == null ? NaN : Number(raw.version);
      // Gửi BẢN CHÊNH, không gửi cả form. Gửi cả form thì nhật ký kiểm toán
      // ghi luôn 9 cột mỗi lần lưu — soi hồ sơ về sau không biết lần đó người
      // ta thật sự sửa cái gì. Và ô người dùng vừa xoá trắng phải đi kèm dưới
      // dạng chuỗi rỗng, để lớp dưới dịch thành "xoá" chứ không phải "bỏ qua".
      const patch: Record<string, string> = {};
      doiRoi.forEach((k) => { patch[k] = f[k] || ""; });
      setSavingProgress(true);
      try {
        const result = await onSave(
          act.id,
          patch,
          undefined,
          reason.trim() || undefined,
          Number.isFinite(v) ? v : undefined,
        );
        if (result && typeof result === "object" && "ok" in result
            && (result as { ok?: unknown }).ok === false) {
          const message = "error" in result && typeof (result as { error?: unknown }).error === "string"
            ? (result as { error: string }).error
            : "Cập nhật tiến độ thất bại";
          setErr(message);
          return;
        }
      } catch (error) {
        setErr((error as Error).message || "Cập nhật tiến độ thất bại");
        return;
      } finally {
        setSavingProgress(false);
      }
    }
    if (goNext && nextAct && onOpenNext) onOpenNext(nextAct);
    else onClose();
  };
  const sel = (k: string) => {
    const enabled = canEditForm(k);
    return <select value={f[k]} onChange={set(k)} disabled={!enabled} style={{ ...INP, cursor: enabled ? "pointer" : "not-allowed", opacity: enabled ? 1 : 0.62 }}>{TT_OPTS.map((o) => <option key={o} value={o}>{o || "— Chưa nhập —"}</option>)}</select>;
  };
  const stage = (s: (typeof CHUOI)[number], truoc: (typeof CHUOI)[number] | null) => {
    const { n, d: dCol, t: tCol } = s;
    const dl = toISO(raw[s.dl]);
    const isDone = f[tCol] === "Hoàn thành" && !!f[dCol];
    const isCur = curBlock === n && !isDone;
    const con = conLai(dl);
    // Bước trước chưa xong thì không mời bấm "Xong hôm nay" ở bước này — mời
    // xong lại chặn lúc Lưu là đưa người dùng vào ngõ cụt.
    const khoaBoiTruoc = !!truoc && f[truoc.t] !== "Hoàn thành";
    const canMarkDone = canEditForm(dCol) && canEditForm(tCol);
    const ttGoc = String(raw[s.goc] ?? "").trim();
    return (
      <div key={n} style={{ background: C.surface, borderRadius: 14, padding: 14, border: `1.5px solid ${isCur ? C.marigold : C.pinkSoft}`, boxShadow: isCur ? `0 0 0 2px ${C.marigoldSoft}` : "none" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 800, color: C.plum, fontSize: 14 }}>
            {n}. {s.ten}
            {isCur && <Tag color={C.marigoldText} bg={C.marigoldSoft}>← đang ở bước này</Tag>}
            {isDone && <Tag color={C.mintText} bg={C.mintSoft}>✓ xong</Tag>}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <Tag color={C.lavText} bg={C.lavSoft}>Hạn: {dl ? ngayVN(dl) : "chưa có"}</Tag>
            {/* Còn mấy ngày / trễ mấy ngày — không có thì người nhập phải tự
                trừ ngày trong đầu mỗi lần mở hộp. */}
            {!isDone && con != null && (
              con < 0
                ? <Tag color={C.raspText} bg={C.raspSoft}>trễ {-con} ngày</Tag>
                : <Tag color={con <= 7 ? C.marigoldText : C.plumSoft} bg={con <= 7 ? C.marigoldSoft : C.pinkMist}>còn {con} ngày</Tag>
            )}
            {!isDone && (
              <button onClick={markDone(dCol, tCol)} disabled={khoaBoiTruoc || !canMarkDone}
                title={!canMarkDone ? "Bạn không có quyền sửa hai cột của bước này." : khoaBoiTruoc ? `Phải xong "${truoc!.ten}" trước đã — bốn bước đi theo thứ tự.` : "Điền ngày hôm nay + trạng thái Hoàn thành trong 1 bấm"}
                style={{ padding: "5px 11px", borderRadius: 999, border: `1px solid ${khoaBoiTruoc || !canMarkDone ? C.pinkSoft : C.mint}`, background: khoaBoiTruoc || !canMarkDone ? C.pinkMist : C.mintSoft, color: khoaBoiTruoc || !canMarkDone ? C.plumSoft : C.mintText, fontFamily: TEXT, fontSize: 12, fontWeight: 800, cursor: khoaBoiTruoc || !canMarkDone ? "not-allowed" : "pointer", whiteSpace: "nowrap" }}>
                ✓ Xong hôm nay
              </button>
            )}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {/* max = hôm nay. NGÀY THỰC TẾ không thể nằm ở tương lai — ALCOA+
              đòi ghi nhận ĐỒNG THỜI với việc làm, mà việc chưa làm thì không
              có ngày làm. Trước đây ô này để trống max nên chọn được 2027.
              Lịch thẩm định bên dưới thì NGƯỢC LẠI: nó là ngày hẹn, tương
              lai mới đúng — nên không chặn. */}
          <div style={FIELD}><span style={LBL}>Ngày hoàn thành thực tế</span><input type="date" max={todayISO()} value={f[dCol]} onChange={setDate(dCol, tCol)} disabled={!canEditForm(dCol)} style={{ ...INP, opacity: canEditForm(dCol) ? 1 : 0.62, cursor: canEditForm(dCol) ? "auto" : "not-allowed" }} /></div>
          <div style={FIELD}><span style={LBL}>Trạng thái</span>{sel(tCol)}</div>
        </div>
        {/* Lịch thẩm định thuộc về CHÍNH bước thẩm định. Trước đây nó nằm tận
            trên đầu hộp, tách rời khỏi ô ngày thẩm định thực tế mà nó ấn định. */}
        {n === 2 && (
          <div style={{ ...FIELD, marginTop: 12 }}>
            <span style={LBL}>Lịch thẩm định (bộ phận xếp)</span>
            <input type="datetime-local" value={f.lich_td} onChange={set("lich_td")} disabled={!canEdit("scheduled_at")} style={{ ...INP, opacity: canEdit("scheduled_at") ? 1 : 0.62, cursor: canEdit("scheduled_at") ? "auto" : "not-allowed" }} />
            <span style={{ fontSize: 12, color: C.plumSoft, fontWeight: 600 }}>
              Ngày bộ phận hẹn vào làm. Khác với ngày hoàn thành thực tế ở trên.
            </span>
          </div>
        )}
        {/* Chữ gốc trong Sheet — nhiều ô ghi kiểu "Chờ thẩm định thực tế",
            "Chờ xử lý"; ô chọn 4 nhãn ở trên nuốt mất sắc thái đó. */}
        {ttGoc && (
          <div style={{ marginTop: 8, fontSize: 12, color: C.plumSoft, fontWeight: 600 }}>
            Dữ liệu gốc ghi: <b style={{ color: C.plum }}>{ttGoc}</b>
          </div>
        )}
        {f[tCol] === "Hoàn thành" && !f[dCol] && (
          <div style={{ marginTop: 8, fontSize: 12, fontWeight: 700, color: "#b00020" }}>
            Đã ghi Hoàn thành nhưng thiếu ngày thực tế — sẽ bị báo lỗi ALCOA+.{" "}
            <button onClick={() => setF((p) => ({ ...p, [dCol]: todayISO() }))} disabled={!canEditForm(dCol)}
              style={{ border: "none", background: "none", color: C.mintText, fontFamily: TEXT, fontWeight: 800, fontSize: 12, cursor: "pointer", textDecoration: "underline", padding: 0 }}>
              Điền hôm nay
            </button>
          </div>
        )}
      </div>
    );
  };
  if (contentState !== "content") {
    const isError = contentState === "error";
    return (
      <Modal onClose={onClose} title="Cập nhật tiến độ" icon={Pencil} wide>
        <div style={{ background: isError ? C.raspSoft : C.marigoldSoft,
          border: `1px solid ${isError ? C.rasp : C.marigold}`,
          borderRadius: 14, padding: "14px 16px", color: isError ? C.raspText : C.marigoldText,
          fontSize: 13, fontWeight: 700, lineHeight: 1.55 }}>
          <div style={{ fontWeight: 800, marginBottom: 4 }}>
            {contentState === "checking"
              ? "Đang xác nhận quyền xem hạng mục…"
              : isError
                ? "Không thể xác nhận quyền xem hạng mục"
                : "Quyền xem hạng mục đã bị thu hồi"}
          </div>
          {contentState === "checking"
            ? "Nội dung hạng mục sẽ chỉ hiện sau khi kiểm tra quyền hoàn tất."
            : isError
              ? `${permissionError || "Không tải được quyền hạng mục"}. Nội dung được ẩn để bảo vệ dữ liệu.`
              : `${fieldPermission?.reason || "Bạn không còn được phân quyền xem hạng mục này"}. Nội dung đã được ẩn.`}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
          <button onClick={onClose} style={{ ...btnPrimary, background: C.surface, color: C.plum,
            border: `1.5px solid ${C.pinkSoft}` }}>Đóng</button>
        </div>
      </Modal>
    );
  }
  return (
    <Modal onClose={onClose} title="Cập nhật tiến độ" icon={Pencil} wide>
      <div style={{ background: C.lavSoft, borderRadius: 14, padding: "12px 16px", marginBottom: 16 }}>
        <div style={{ fontWeight: 800, color: C.plum, fontSize: 14 }}>{act.code} · {act.name}</div>
        <div style={{ fontSize: 12, color: C.plumSoft, fontWeight: 600, marginTop: 3 }}>{txt(act.vtype)} · ID: {act.id} · QA: {nguoiPhuTrach(act.owner)}{act.score != null ? ` · Trọng yếu: ${act.score}/9` : ""}{act.effort != null ? ` · ${act.effort} ngày công` : ""}</div>
      </div>
      <div style={{
        background: permissionLoading ? C.marigoldSoft : isEnforced ? C.lavSoft : C.mintSoft,
        border: `1px solid ${permissionLoading ? C.marigold : isEnforced ? C.lav : C.mint}`,
        borderRadius: 14, padding: "10px 14px", marginBottom: 16,
        color: permissionLoading ? C.marigoldText : isEnforced ? C.lavText : C.mintText,
        fontSize: 12, fontWeight: 700, lineHeight: 1.55,
      }}>
        {permissionLoading
          ? "Đang kiểm tra quyền từng cột…"
          : isEnforced
            ? <>🔒 <b>Quyền theo từng cột đang áp dụng.</b>{timelineViewOnly
              ? ` Chỉ xem — ${fieldPermission?.reason || "không được sửa cột timeline nào"}.`
              : ` Bạn được sửa ${fieldPermission?.editableFields.length || 0} cột timeline.`}</>
            : <>ℹ️ <b>Quyền dự kiến chưa áp dụng.</b> Modal vẫn giữ hành vi và luật đang chạy hiện tại.</>}
        {permissionError && <> Không tải được quyền: {permissionError} — tạm khóa để an toàn.</>}
      </div>
      {quickDone && BLOCK_COLS[curBlock] && (
        <div style={{ background: C.mintSoft, border: `1px solid ${C.mint}`, borderRadius: 14, padding: "10px 14px", marginBottom: 16, fontSize: 12, fontWeight: 700, color: C.mintText, lineHeight: 1.55 }}>
          ⚡ Đã điền sẵn <b>hôm nay + Hoàn thành</b> cho bước hiện tại — kiểm tra lại ngày,
          chọn lý do rồi bấm Lưu. Chưa ghi gì cho tới khi bạn Lưu.
        </div>
      )}
      {/* Chuỗi bước: nhìn một dòng là biết đang tắc ở đâu và bước nào chờ bước
          nào. Trước đây bốn khối nằm rời nhau, không có gì nói chúng nối tiếp. */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        {CHUOI.map((s, i) => {
          const xong = f[s.t] === "Hoàn thành";
          const dang = f[s.t] === "Đang thực hiện";
          const tre = !xong && (conLai(toISO(raw[s.dl])) ?? 1) < 0;
          const mau = xong ? C.mintText : tre ? C.raspText : dang ? C.marigoldText : C.plumSoft;
          const nen = xong ? C.mintSoft : tre ? C.raspSoft : dang ? C.marigoldSoft : C.pinkMist;
          return (
            <span key={s.n} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              {i > 0 && <span style={{ color: C.plumSoft, fontWeight: 800 }}>→</span>}
              <span style={{ background: nen, color: mau, borderRadius: 999, padding: "5px 11px", fontSize: 12, fontWeight: 800, whiteSpace: "nowrap" }}>
                {xong ? "✓" : tre ? "!" : "○"} {s.ten}
              </span>
            </span>
          );
        })}
      </div>

      {/* Mâu thuẫn có sẵn trong dữ liệu — không chặn Lưu (chặn thì không mở ra
          sửa được chính nó), nhưng phải nói ra chứ không im lặng. */}
      {nhac.length > 0 && (
        <div style={{ background: C.marigoldSoft, border: `1px solid ${C.marigold}`, borderRadius: 14, padding: "10px 14px", marginBottom: 14, fontSize: 12, fontWeight: 700, color: C.marigoldText, lineHeight: 1.6 }}>
          ⚠ Hạng mục này đang có mâu thuẫn giữa các bước (có từ trước, không phải do bạn):
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
            {nhac.map((v, i) => <li key={i}>{v.msg}</li>)}
          </ul>
        </div>
      )}

      {/* Thông tin nền của hạng mục. Thiếu chúng thì người nhập phải mở thêm
          hai màn khác mới biết mình đang sửa cái gì, ở đâu, chu kỳ bao lâu. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, marginBottom: 16 }}>
        <ROField label="Hạn đích VMP (T)" value={ngayVN(toISO(raw.dl_vmp) || act.target || "")} />
        <ROField label="Bộ phận" value={txt(raw.bo_phan_goc ?? act.dept)} />
        <ROField label="Khu vực · dây chuyền" value={[raw.khu_vuc, raw.line].filter(Boolean).map(String).join(" · ") || "—"} />
        <ROField label="Chu kỳ tái thẩm định" value={Number(raw.tan_suat) > 0 ? `${raw.tan_suat} tháng` : "—"} />
        <ROField label="Phân loại báo cáo" value={txt(act.dep)} />
        <ROField label="Nhóm việc" value={txt(raw.nhom_viec)} />
      </div>

      {/* Chọn chỉ đổi bản nháp; nút Lưu chung phía dưới mới gọi RPC. */}
      <div style={{ ...FIELD, marginBottom: 16 }}>
        <span style={LBL}><UserCheck size={13} style={{ verticalAlign: -2, marginRight: 4 }} />Người thực hiện</span>
        {isAdmin ? (
          <>
            <PerformerSelect
              value={performerPersonId}
              options={performerChoices}
              ariaLabel="Người thực hiện"
              onChange={(personId) => {
                setPerformerDraftId(personId);
                setPerformerTouched(true);
                if (err) setErr("");
              }}
            />
            <span style={{ fontSize: 12, color: C.plumSoft, fontWeight: 600, lineHeight: 1.45 }}>
              {selectedPerformer
                ? <>Email: <b style={{ color: C.plum }}>{selectedPerformer.email || "chưa có — bổ sung ở tab Người thực hiện"}</b>{selectedPerformer.department ? ` · ${selectedPerformer.department}` : " · chưa có bộ phận"}</>
                : ownerPersonIdNow && performerPersonId === ownerPersonIdNow
                  ? <b style={{ color: C.raspText }}>Liên kết hiện tại không còn trong danh sách người đang hoạt động — hãy chọn lại.</b>
                  : "Chưa phân công. Tên mới chỉ được tạo ở Danh mục & Nhập liệu → tab Người thực hiện."}
              {whoChanged && <> · Áp dụng cho <b>mọi hạng mục của đối tượng {act.code}</b> (phân công lưu ở đối tượng nên không bị đồng bộ Sheet xoá).</>}
            </span>
          </>
        ) : (
          <ROField label="" value={selectedPerformer
            ? `${selectedPerformer.fullName} · ${selectedPerformer.email || "chưa có email"} · ${selectedPerformer.department || "chưa có bộ phận"}`
            : nguoiPhuTrach(act.owner)} />
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Bước 4 trước đây được truyền hạn = chuỗi rỗng nên luôn hiện
            "Deadline: Không có thông tin", dù raw.dl_vmp vẫn có sẵn. Nay cả
            bốn bước lấy hạn từ cùng một bảng CHUOI nên không lệch được nữa. */}
        {CHUOI.map((s, i) => stage(s, i > 0 ? CHUOI[i - 1] : null))}
      </div>
      {/* Báo NGAY lúc gõ, không đợi bấm Lưu mới nói — người nhập sửa được tại
          chỗ thay vì điền xong hết rồi mới biết cả cụm không hợp lệ. */}
      {chan.length > 0 && (
        <div style={{ marginTop: 14, background: C.raspSoft, border: `1px solid ${C.raspText}`, borderRadius: 14, padding: "10px 14px", fontSize: 12, fontWeight: 700, color: C.raspText, lineHeight: 1.6 }}>
          ✕ Chưa lưu được — thay đổi vừa rồi làm lệch thứ tự bốn bước:
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
            {chan.map((v, i) => <li key={i}>{v.msg}</li>)}
          </ul>
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 14 }}>
        <span style={LBL}>Lý do {needsReason ? <b style={{ color: "#b00020" }}>(bắt buộc)</b> : "(tuỳ chọn)"}</span>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {REASON_CHIPS.map((r) => (
            <button key={r} onClick={() => { setReason(r); if (err) setErr(""); }}
              style={{ padding: "5px 11px", borderRadius: 999, border: "none", cursor: "pointer",
                       fontFamily: TEXT, fontSize: 12, fontWeight: 700,
                       background: reason === r ? C.plum : C.pinkSoft,
                       color: reason === r ? "#fff" : C.plumSoft }}>
              {r}
            </button>
          ))}
        </div>
        <textarea value={reason} onChange={(e) => { setReason(e.target.value); if (err) setErr(""); }}
          rows={2} placeholder="Bấm chip ở trên hoặc gõ lý do khác…"
          style={{ ...INP, resize: "vertical", minHeight: 54 }} />
        {err && <span style={{ color: "#b00020", fontSize: 12, fontWeight: 700 }}>{err}</span>}
      </div>
      {/* CÒN THIẾU GÌ — nói NGAY CẠNH NÚT, trước khi bấm.
          Đo được (2026-08-01): đường ghi từ web hoạt động tốt, nhưng người
          dùng báo "không cập nhật được". Tái hiện bằng phiên thật thì ra lý
          do: lý do là BẮT BUỘC theo GMP, mà nút Lưu vẫn sáng bình thường —
          bấm xong mới hiện dòng chữ đỏ, và dòng đó nằm giữa một hộp dài nên
          rất dễ trôi khỏi tầm mắt. Người dùng đọc ra thành "bấm Lưu không có
          gì xảy ra".
          Nay nút TỰ TẮT khi còn thiếu, và ghi thẳng thiếu cái gì. */}
      {thieuGi && (
        <div style={{ marginTop: 14, padding: "10px 14px", borderRadius: 14,
                      background: C.marigoldSoft, border: `1px solid ${C.marigold}`,
                      color: C.marigoldText, fontFamily: TEXT, fontSize: 14, fontWeight: 700 }}>
          Chưa lưu được: {thieuGi}
        </div>
      )}

      <div style={{ display: "flex", gap: 12, marginTop: 22 }}>
        <button onClick={onClose} style={{ flex: 1, padding: "12px", borderRadius: 14, border: `1.5px solid ${C.pinkSoft}`, background: C.surface, color: C.plumSoft, fontFamily: TEXT, fontWeight: 800, cursor: "pointer" }}>Hủy</button>
        {!permissionLoading && !timelineViewOnly && (
          <button onClick={() => handleSave(false)} disabled={savingWho || savingProgress || !!thieuGi}
            title={thieuGi || undefined}
            style={{ ...btnPrimary, flex: 2, padding: "12px", borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: savingWho || savingProgress || thieuGi ? 0.55 : 1, cursor: thieuGi ? "not-allowed" : "pointer" }}>
            <Save size={17} /> {savingWho || savingProgress ? "Đang lưu…" : nChanged + (whoChanged ? 1 : 0) > 0 ? `Lưu ${nChanged + (whoChanged ? 1 : 0)} thay đổi` : "Lưu tiến độ"}
          </button>
        )}
        {!permissionLoading && !timelineViewOnly && nextAct && onOpenNext && (
          <button onClick={() => handleSave(true)}
            disabled={savingWho || savingProgress || ((formChanged || whoChanged) && !!thieuGi)}
            title={`Tiếp theo: ${nextAct.code} · ${nextAct.name}`}
            style={{ flex: 1.4, padding: "12px", borderRadius: 14, border: `1.5px solid ${C.plum}`, background: C.surface, color: C.plum, fontFamily: TEXT, fontWeight: 800, cursor: "pointer", opacity: savingWho || savingProgress || ((formChanged || whoChanged) && !!thieuGi) ? 0.6 : 1, whiteSpace: "nowrap" }}>
            {formChanged || whoChanged ? "Lưu & mở tiếp →" : "Mở tiếp →"}
          </button>
        )}
      </div>

      {/* S3-G FIX: phần đổi trạng thái nghiệp vụ — chỉ admin/QA manager.
          Lý do nhập NGAY TẠI ĐÂY thay vì window.prompt: prompt hệ thống không
          có gợi ý, bấm nhầm Cancel là mất, và không đồng bộ giao diện. */}
      {isAdmin && onChangeState && (
        <div style={{ marginTop: 18, padding: 14, borderRadius: 14, background: "#FFF5FA", border: `1px dashed ${C.pinkSoft}` }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: C.plumSoft, marginBottom: 8 }}>
            ⚙️ Trạng thái nghiệp vụ (chỉ admin / QA manager)
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 12, color: C.plumSoft, fontWeight: 700 }}>Hiện tại:</span>
            <StateBadge state={String(currentState)} small />
            {currentState === "active" && <span style={{ fontSize: 12, color: C.plumSoft }}>(đang theo dõi bình thường)</span>}
            <div style={{ flex: 1 }} />
            {currentState === "active" ? (
              <>
                <button onClick={() => { setPendingState(pendingState === "not_applicable" ? null : "not_applicable"); setStateReason(""); }} style={{ padding: "6px 11px", borderRadius: 8, border: `1px solid ${C.lav}`, background: pendingState === "not_applicable" ? C.lavSoft : C.surface, color: C.lavText, fontSize: 12, fontWeight: 800, cursor: "pointer" }}>⊘ Không áp dụng</button>
                <button onClick={() => { setPendingState(pendingState === "cancelled" ? null : "cancelled"); setStateReason(""); }} style={{ padding: "6px 11px", borderRadius: 8, border: `1px solid ${C.marigold}`, background: pendingState === "cancelled" ? C.marigoldSoft : C.surface, color: C.marigoldText, fontSize: 12, fontWeight: 800, cursor: "pointer" }}>⊘ Hủy hạng mục</button>
              </>
            ) : (
              <button onClick={() => { setPendingState(pendingState === "active" ? null : "active"); setStateReason(""); }} style={{ padding: "6px 11px", borderRadius: 8, border: `1px solid ${C.mint}`, background: pendingState === "active" ? C.mintSoft : C.surface, color: C.mintText, fontSize: 12, fontWeight: 800, cursor: "pointer" }}>↻ Khôi phục Active</button>
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
                  style={{ ...btnPrimary, padding: "9px 16px", borderRadius: 8, fontSize: 12, opacity: stateReason.trim() ? 1 : 0.5, cursor: stateReason.trim() ? "pointer" : "not-allowed" }}>
                  Xác nhận
                </button>
                <button onClick={() => { setPendingState(null); setStateReason(""); }}
                  style={{ padding: "9px 14px", borderRadius: 8, border: `1.5px solid ${C.pinkSoft}`, background: C.surface, color: C.plumSoft, fontFamily: TEXT, fontWeight: 800, fontSize: 12, cursor: "pointer" }}>
                  Thôi
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ---- Nhân sự xưởng của HẠNG MỤC NÀY — chỉ người có quyền
          assign_workshop_staff mới thấy; ghi qua rpc_set_item_assignment
          (an toàn xung đột, bắt buộc lý do, server kiểm phạm vi). */}
      <WorkshopAssignmentInline validationCode={act.id}
        canAssign={!!canAssignWorkshop} />

      {/* ---- Lịch sử thay đổi của HẠNG MỤC NÀY — đọc lười từ server ------
          rpc_item_progress_history (Đợt B Task 11): server tự kiểm quyền
          xem theo hạng mục; ở đây chỉ hiển thị. Không tải trước — đa số
          lần mở hộp là để sửa, không phải để tra. */}
      <LichSuHangMuc validationCode={act.id} />
    </Modal>
  );
}

/* ====================================================================
 *  Lịch sử thay đổi của một hạng mục — bấm mới tải, tải rồi giữ nguyên.
 * ==================================================================== */
function LichSuHangMuc({ validationCode }: { validationCode: string }) {
  const [mo, setMo] = useState(false);
  const [tt, setTt] = useState<"chua" | "dang" | "xong" | "loi">("chua");
  const [rows, setRows] = useState<ItemProgressHistoryEntry[]>([]);
  const [tong, setTong] = useState(0);
  const [loi, setLoi] = useState("");

  const moLichSu = async () => {
    const sapMo = !mo;
    setMo(sapMo);
    if (!sapMo || tt === "xong" || tt === "dang") return;
    setTt("dang");
    const kq = await fetchItemProgressHistory(validationCode);
    if (kq.ok) { setRows(kq.history); setTong(kq.total); setTt("xong"); }
    else { setLoi(kq.error || "Không đọc được lịch sử"); setTt("loi"); }
  };

  return (
    <div style={{ marginTop: 18 }}>
      <button type="button" onClick={moLichSu} aria-expanded={mo}
        style={{ display: "flex", alignItems: "center", gap: 6, border: "none",
                 background: "transparent", cursor: "pointer", padding: "6px 0",
                 fontFamily: TEXT, fontSize: 13, fontWeight: 800, color: C.plumSoft }}>
        {mo ? "▾" : "▸"} Lịch sử thay đổi{tt === "xong" ? ` (${tong})` : ""}
      </button>

      {mo && tt === "dang" && (
        <div style={{ fontSize: 12, color: C.plumSoft, padding: "4px 0" }}>Đang tải lịch sử…</div>
      )}
      {mo && tt === "loi" && (
        <div style={{ fontSize: 12, color: C.raspText, padding: "4px 0" }}>{loi}</div>
      )}
      {mo && tt === "xong" && (rows.length === 0 ? (
        <div style={{ fontSize: 12, color: C.plumSoft, padding: "4px 0" }}>
          Chưa có thao tác nào được ghi cho hạng mục này.
        </div>
      ) : (
        <ol style={{ margin: "6px 0 0", padding: 0, listStyle: "none",
                     display: "flex", flexDirection: "column", gap: 8,
                     maxHeight: 260, overflowY: "auto" }} className="vmp-scroll">
          {rows.map((h) => (
            <li key={h.id} style={{ padding: "9px 12px", borderRadius: 10,
                                    background: C.surfaceSunk, fontFamily: TEXT, fontSize: 12,
                                    display: "flex", flexDirection: "column", gap: 3 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", color: C.plum, fontWeight: 700 }}>
                <span>{new Date(h.created_at).toLocaleString("vi-VN")}</span>
                <span>· {h.actor}</span>
                <span style={{ color: C.plumSoft, fontWeight: 600 }}>({h.effective_business_role})</span>
              </div>
              <div style={{ color: C.plumSoft }}>
                {h.action}
                {h.changed_fields?.length ? ` · cột: ${h.changed_fields.join(", ")}` : ""}
              </div>
              {h.reason && <div style={{ color: C.plum }}>Lý do: {h.reason}</div>}
            </li>
          ))}
        </ol>
      ))}
    </div>
  );
}
