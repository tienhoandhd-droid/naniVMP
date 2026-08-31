/* UpdatePage.jsx — Cập nhật tiến độ thực tế */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "../features/progress/progress.css"; // B5: CSS theo route
import { Pencil, Search, SlidersHorizontal, X } from "lucide-react";
import { C, TEXT, NUM, btnPrimary, INP } from "../constants/theme.ts";
import { STATUS, STAGES, PERIODS } from "../constants/vmp.ts";
import { stageOf, inPeriod, nguoiPhuTrach } from "../utils/helpers.ts";
import { supabase } from "../lib/supabaseClient.ts";
import { useDebounce } from "../hooks/index.ts";
import { Card, Tag, Pill, StateBadge, PhanTrang, Trong } from "../components/ui/Primitives.tsx";
import MobileTaskList from "../components/ui/MobileTaskList.tsx";
import StateBoundary from "../components/ui/StateBoundary.tsx";
import { useToast } from "../components/ui/ToastProvider.tsx";
import ProgressEditModal from "../components/dashboard/ProgressEditModal.tsx";
import { buildProgressWorkspaceModel } from "../features/progress/progressWorkspaceModel.ts";
import { countProgressAdvancedFilters, isDetailedProgressFix } from "../features/progress/progressFilterUi.ts";
import { createVisibleRefreshController } from "../lib/visibleRefresh.ts";
import {
  createProgressRightsGenerationGate,
  fetchMyEditableProgressRights,
} from "../lib/supabaseData.ts";
import {
  filterEditableProgressActivities,
  indexEditableProgressRights,
  progressValidationCode,
  type EditableProgressRight,
} from "../features/progress/editableProgressRights.ts";
import { resolveProgressDeepLink } from "../features/progress/progressDeepLink.ts";
import type { ProgressDeepLink } from "../features/today/todayModel.ts";
// Đặt tên khác vì lucide-react cũng xuất một icon tên Activity dùng ở dưới.
import type { Activity as PlanActivity } from "../types/domain.ts";

type ProgressRightsStatus = "loading" | "error" | "ready";

type ProgressRightsState = {
  status: ProgressRightsStatus;
  rights: ReadonlyMap<string, EditableProgressRight>;
  error: string;
};

const EMPTY_PROGRESS_RIGHTS = new Map<string, EditableProgressRight>();

function progressRightsLoadingState(): ProgressRightsState {
  return { status: "loading", rights: EMPTY_PROGRESS_RIGHTS, error: "" };
}

export default function UpdateView({ acts, readableActs = acts, conn, canChonNguoiThucHien, canDoiTrangThai, onUpdate, onReload, readOnly = true, pendingProgressLink, onProgressLinkConsumed, canAssignWorkshop, onMoPhanQuyen }: {
  acts: PlanActivity[];
  /** Nguồn hiện còn đọc được từ shell, dùng để tìm lại đúng mã Today nằm ngoài kỳ nhớ. */
  readableActs?: readonly PlanActivity[];
  /** Không dùng index signature để nhận được cả ConnState (status là union). */
  conn?: { status?: string; msg?: string };
  /** access.can("source","edit_catalog") — được đổi "Người thực hiện". */
  canChonNguoiThucHien?: boolean;
  /** access.businessRole is admin/qa_manager — được đổi/khôi phục "Trạng thái nghiệp vụ". */
  canDoiTrangThai?: boolean;
  onUpdate?: (
    id: string,
    patch: Record<string, unknown>,
    userName?: string,
    reason?: string,
    expectedVersion?: number,
  ) => void;
  onReload?: () => void | Promise<unknown>;
  readOnly?: boolean;
  /** Link Today đầy đủ; chỉ consume sau khi tập quyền hiện tại cho kết quả. */
  pendingProgressLink?: ProgressDeepLink | null;
  onProgressLinkConsumed?: () => void;
  /** access.can("progress","assign_workshop_staff") — App tính, truyền xuống hộp sửa. */
  canAssignWorkshop?: boolean;
  /** Lối đi tiếp khi chưa được phân công: mở màn Vai trò & phạm vi (B7). */
  onMoPhanQuyen?: () => void;
}) {
  const [q, setQ] = useState("");
  const [fst, setFst] = useState("all");
  const [period, setPeriod] = useState("all");
  const [stageF, setStageF] = useState("all");
  /** Lọc nhanh theo lỗi dữ liệu — để không phải dò 461 dòng tìm chỗ thiếu. */
  const [fix, setFix] = useState("all");
  const [moLocNangCao, setMoLocNangCao] = useState(false);
  const [edit, setEdit] = useState<PlanActivity | null>(null);
  /** Mở hộp bằng đường tắt "✓ Xong bước" — hộp sẽ điền sẵn hôm nay + Hoàn thành. */
  const [quick, setQuick] = useState(false);
  // Gõ phím không lọc ngay — 461 dòng dựng lại mỗi phím là chỗ giật nhất trang này.
  const kw = useDebounce(q.trim().toLowerCase(), 250);
  // Phân trang thật thay nút "Hiện thêm" (phải bấm 7 lần mới hết 461 dòng).
  const [trang, setTrang] = useState(0);
  // 50 dòng/trang: 100 dòng đẩy chiều cao trang lên ~9600px, tức gần 10 màn
  // hình cuộn cho MỘT trang — phân trang mà vẫn phải cuộn dài thì chưa xong việc.
  const [coTrang, setCoTrang] = useState(50);
  /* D18 — hàng đã ngừng (Không áp dụng / Đã huỷ) ẨN mặc định.
     Trước đây chúng nằm xen giữa danh sách làm việc với nhãn "⊘ Xem/khôi
     phục", nên mỗi lần quét mắt xuống là một lần phải phân biệt "dòng này
     có phải việc của mình không". Chúng vẫn tra được, chỉ là không chen vào
     luồng làm việc hằng ngày nữa. */
  const [hienNgung, setHienNgung] = useState(false);
  const [focusAlert, setFocusAlert] = useState("");
  // Chỉ giữ mã không nhạy cảm; Activity luôn được suy lại từ readableActs mỗi render.
  const [pinnedValidationCode, setPinnedValidationCode] = useState<string | null>(null);
  const rightsGate = useRef(createProgressRightsGenerationGate());
  const [rightsState, setRightsState] = useState<ProgressRightsState>(progressRightsLoadingState);
  const reloadRights = useCallback(async () => {
    const request = rightsGate.current.begin();
    // Quyền cũ không được dùng trong khoảng trống giữa hai lần nạp.
    setRightsState(progressRightsLoadingState());
    try {
      const rights = indexEditableProgressRights(await fetchMyEditableProgressRights());
      if (!rightsGate.current.isCurrent(request)) return;
      setRightsState({ status: "ready", rights, error: "" });
    } catch (cause) {
      if (!rightsGate.current.isCurrent(request)) return;
      const message = cause instanceof Error ? cause.message : "Không thể xác nhận quyền cập nhật tiến độ";
      setRightsState({ status: "error", rights: EMPTY_PROGRESS_RIGHTS, error: message });
    }
  }, []);
  useEffect(() => {
    const controller = createVisibleRefreshController({
      isVisible: () => document.visibilityState !== "hidden",
      refresh: reloadRights,
      coalesceMs: 1000,
    });
    void reloadRights();
    window.addEventListener("focus", controller.request);
    document.addEventListener("visibilitychange", controller.request);
    return () => {
      rightsGate.current.invalidate();
      window.removeEventListener("focus", controller.request);
      document.removeEventListener("visibilitychange", controller.request);
    };
  }, [reloadRights]);
  const focusCandidate = useMemo(() => {
    if (!pinnedValidationCode || rightsState.status !== "ready"
      || !rightsState.rights.has(pinnedValidationCode)) return null;
    return readableActs.find((activity) => progressValidationCode(activity) === pinnedValidationCode) ?? null;
  }, [pinnedValidationCode, readableActs, rightsState]);
  const scopedActs = useMemo(() => {
    if (rightsState.status !== "ready") return [];
    const allowed = filterEditableProgressActivities(acts, rightsState.rights);
    if (!focusCandidate || allowed.some((activity) =>
      progressValidationCode(activity) === pinnedValidationCode)) return allowed;
    return [...allowed, focusCandidate];
  }, [acts, focusCandidate, pinnedValidationCode, rightsState]);
  const inWindow = useMemo(() => scopedActs.filter((a) => {
    if (!inPeriod(a, period)) return false;
    if (hienNgung) return true;
    const st = String(a.state || (a._raw && (a._raw as Record<string, unknown>).state) || "active");
    return st === "active";
  }), [scopedActs, period, hienNgung]);
  const soNgung = useMemo(() => scopedActs.filter((a) => {
    const st = String(a.state || (a._raw && (a._raw as Record<string, unknown>).state) || "active");
    return st !== "active";
  }).length, [scopedActs]);
  // Tính giai đoạn 1 lần/hạng mục rồi tái dùng (trước đây stageOf chạy ~7 lần/hàng).
  const stageByItem = useMemo(() => {
    const m = new Map();
    inWindow.forEach((a) => m.set(progressValidationCode(a), stageOf(a)));
    return m;
  }, [inWindow]);
  /* Model Lotus của màn Tiến độ (Đợt B Task 12): KPI, dải ưu tiên và hai
     tập lọc nhanh đều tính từ MỘT chỗ — số trên ô và dòng trong bảng không
     thể nói khác nhau. Tính trên inWindow (đúng kỳ đang xem, đúng luật ẩn
     hàng ngừng) để các con số khớp với danh sách bên dưới. */
  const model = useMemo(() => buildProgressWorkspaceModel(inWindow.map((activity) => ({
    ...activity,
    validationCode: progressValidationCode(activity),
  })), {
    now: new Date(), query: "", status: "all", stage: "all", priority: "all",
  }), [inWindow]);
  const maCanXuLy = useMemo(() => new Set(
    model.rowsBeforeStageFilter.filter((r) => r.issues.length > 0).map((r) => r.validationCode),
  ), [model]);
  const maQuaHan = useMemo(() => new Set(
    model.rowsBeforeStageFilter
      .filter((r) => r.status !== "done" && r.overdueDays > 0)
      .map((r) => r.validationCode),
  ), [model]);

  // Bốn lỗi mà kiểm tra dữ liệu ở Supabase đang báo — cùng định nghĩa với
  // rpc_check_data_quality để hai chỗ không nói khác nhau.
  const FIXES = useMemo(() => ({
    can_xu_ly: {
      label: "Cần xử lý (mọi vấn đề hồ sơ)",
      hint: "Thiếu người phụ trách theo person_id, thiếu deadline, xong thiếu ngày, lệch pha",
      test: (a: PlanActivity) => maCanXuLy.has(progressValidationCode(a)),
    },
    qua_han: {
      label: "Quá hạn",
      hint: "Mốc chưa xong gần nhất đã đứng trước hôm nay",
      test: (a: PlanActivity) => maQuaHan.has(progressValidationCode(a)),
    },
    done_no_date: {
      label: "Thiếu ngày hoàn thành",
      hint: "Vi phạm ALCOA+ — đã ghi hoàn thành thì phải có ngày thực tế",
      test: (a: PlanActivity) => a.st === "done" && !a._raw?.ngay_vmp,
    },
    no_deadline: {
      label: "Thiếu deadline VMP",
      hint: "Không có mốc đích thì mọi mốc khác không tính được",
      test: (a: PlanActivity) => !a.target,
    },
    no_owner: {
      label: "Chưa phân công QA",
      hint: "Không phân công thì không ai theo",
      test: (a: PlanActivity) => !a.owner || a.owner === "—",
    },
    mismatch: {
      label: "Lệch pha hồ sơ",
      hint: "Trạng thái các giai đoạn mâu thuẫn nhau",
      test: (a: PlanActivity) => !!a.mismatch,
    },
  }), [maCanXuLy, maQuaHan]);

  /* Bốn bộ lọc chạy song song. Tách từng điều kiện ra để ĐẾM và LỌC dùng
     chung một luật — trước đây số trên ô giai đoạn đếm trên toàn kỳ, còn
     bảng thì lọc thêm cả "cần bạn điền" / trạng thái / ô tìm, nên bấm ô
     ghi 85 mà bảng ra 0 dòng, nhìn như lọc hỏng. */
  const okFix    = (a: PlanActivity) => fix === "all" || !!FIXES[fix as keyof typeof FIXES]?.test(a);
  const okStage  = (a: PlanActivity) => stageF === "all" || stageByItem.get(progressValidationCode(a)) === stageF;
  const okStatus = (a: PlanActivity) => fst === "all" || a.st === fst;
  const okSearch = (a: PlanActivity) => {
    const s = kw;
    if (!s) return true;
    return [progressValidationCode(a), a.name, a.owner, a.vtype]
      .some((x) => String(x || "").toLowerCase().includes(s));
  };

  // Đếm kiểu "facet": mỗi ô đếm trên phần đã lọc bởi CÁC bộ lọc khác, trừ
  // chính nó — bấm vào ô nào cũng ra đúng bằng số ghi trên ô đó.
  const stageCount = useMemo(() => {
    const c: Record<string, number> = { all: 0 };
    STAGES.forEach((st) => { c[st.id] = 0; });
    inWindow.forEach((a) => {
      if (!okFix(a) || !okStatus(a) || !okSearch(a)) return;
      c.all++;
      const st = stageByItem.get(progressValidationCode(a));
      if (st != null && c[st] != null) c[st]++;
    });
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inWindow, stageByItem, fix, fst, kw, FIXES]);

  const fixCount = useMemo(() => {
    const c: Record<string, number> = { all: 0 };
    for (const k of Object.keys(FIXES)) c[k] = 0;
    inWindow.forEach((a) => {
      if (!okStage(a) || !okStatus(a) || !okSearch(a)) return;
      c.all++;
      for (const [k, v] of Object.entries(FIXES)) if (v.test(a)) c[k]++;
    });
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inWindow, stageByItem, stageF, fst, kw, FIXES]);

  const list = useMemo(
    () => inWindow.filter((a) => okFix(a) && okStage(a) && okStatus(a) && okSearch(a)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [inWindow, stageByItem, stageF, fst, kw, fix, FIXES],
  );

  // Lát cắt đang dựng. coTrang = 0 nghĩa là "Tất cả".
  const lat = useMemo(
    () => (coTrang > 0 ? list.slice(trang * coTrang, (trang + 1) * coTrang) : list),
    [list, trang, coTrang],
  );
  // Đổi bộ lọc thì về trang đầu — không thì đang ở trang 5 mà danh sách mới
  // chỉ có 2 trang, màn hình rỗng và trông như mất dữ liệu.
  useEffect(() => { setTrang(0); }, [stageF, fix, fst, kw, period, hienNgung]);
  useEffect(() => {
    if (isDetailedProgressFix(fix)) setMoLocNangCao(true);
  }, [fix]);

  // Phân công vừa bị thu hồi hoặc quyền vừa lỗi: đóng hộp ngay, trước khi nó
  // có thể hiển thị dữ liệu cũ hay gửi một bản nháp cũ.
  useEffect(() => {
    if (!edit) return;
    if (rightsState.status !== "ready" || !rightsState.rights.has(progressValidationCode(edit))) {
      setEdit(null);
      setQuick(false);
    }
  }, [edit, rightsState]);

  useEffect(() => {
    if (pinnedValidationCode && rightsState.status === "ready"
      && !rightsState.rights.has(pinnedValidationCode)) setPinnedValidationCode(null);
  }, [pinnedValidationCode, rightsState]);

  /* Link chỉ được quyết định khi tập quyền hiện tại đã ready. Loading/error
     giữ nguyên pending để retry không biến lỗi mạng thành kết luận thu hồi. */
  useEffect(() => {
    if (!pendingProgressLink || rightsState.status !== "ready") return;
    const resolution = resolveProgressDeepLink(rightsState.rights, pendingProgressLink);
    if (resolution.status === "revoked") {
      setPinnedValidationCode(null);
      setEdit(null);
      setQuick(false);
      setFocusAlert(`Quyền cập nhật ${resolution.validationCode} đã thay đổi; hạng mục không được mở.`);
      onProgressLinkConsumed?.();
      return;
    }
    setPinnedValidationCode(resolution.validationCode);
    setQ(resolution.validationCode);
    /* B1 (anh Hoàn chốt 30/08): từ "Hôm nay" bấm sang là mở luôn hộp sửa
       đúng hạng mục — không phải tự tìm dòng rồi bấm "Cập nhật" nữa. */
    const hangMuc = readableActs.find((activity) => progressValidationCode(activity) === resolution.validationCode);
    if (hangMuc) { setEdit(hangMuc); setQuick(false); }
    setFix("all");
    setStageF("all");
    setFst("all");
    setPeriod("all");
    setHienNgung(false);
    setTrang(0);
    setFocusAlert("");
    onProgressLinkConsumed?.();
  }, [onProgressLinkConsumed, pendingProgressLink, readableActs, rightsState]);

  const clearSearch = () => { setQ(""); setPinnedValidationCode(null); };
  const hasFilter = fix !== "all" || stageF !== "all" || fst !== "all" || !!q.trim() || period !== "all" || hienNgung;
  const clearFilters = () => {
    setFix("all"); setStageF("all"); setFst("all"); clearSearch(); setPeriod("all"); setHienNgung(false);
    setMoLocNangCao(false);
  };
  const soLocNangCao = countProgressAdvancedFilters({
    fix, status: fst, stage: stageF, period, showStopped: hienNgung,
  });
  const linked = conn?.status === "ok";
  const toast = useToast();
  const handleProgressReload = useCallback(async () => {
    try {
      await onReload?.();
    } finally {
      await reloadRights();
    }
  }, [onReload, reloadRights]);

  /* Deep link từ "Hôm nay" (anh Hoàn chốt 30/08 — B1): cuộn tới đúng dòng và
     tô sáng nó, ngoài việc đã mở sẵn hộp sửa ở effect deep link phía trên. */
  useEffect(() => {
    if (!pinnedValidationCode || rightsState.status !== "ready") return;
    const t = window.setTimeout(() => {
      document.querySelector(`[data-progress-item="${CSS.escape(pinnedValidationCode)}"]`)
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 80);
    return () => window.clearTimeout(t);
  }, [pinnedValidationCode, rightsState.status, lat]);

  const uuTien = model.priorityRows.slice(0, 5);
  /* Không lặp mã khi hạng mục chưa có tên riêng. */
  const tenHangMuc = (r: { validationCode: string; title: string }) => r.title && r.title !== r.validationCode ? ` — ${r.title}` : "";
  const moHangMuc = (validationCode: string) => {
    const a = inWindow.find((x) => progressValidationCode(x) === validationCode);
    if (a && !readOnly) { setEdit(a); setQuick(false); }
  };
  /* Lời Vali — dựng từ model, không bịa số. */
  const vali = (() => {
    const dau = uuTien[0];
    if (rightsState.status !== "ready") return { mood: "guide" as const, nhan: "đang kiểm tra", loi: "Mình đang xác nhận hạng mục bạn được phân công…" };
    if (model.kpis.needsAction > 0 && dau) return { mood: "concern" as const, nhan: "đang lo",
      loi: `Còn ${model.kpis.needsAction} hồ sơ thiếu hoặc lệch. Mình gợi ý làm ${dau.validationCode} trước${tenHangMuc(dau)}.` };
    if (model.kpis.overdue > 0 && dau) return { mood: "concern" as const, nhan: "đang lo",
      loi: `Hồ sơ đã đủ, nhưng ${model.kpis.overdue} hạng mục quá hạn. Bắt đầu từ ${dau.validationCode}${tenHangMuc(dau)}.` };
    if (inWindow.length === 0) return { mood: "guide" as const, nhan: "dẫn đường", loi: "Chưa có hạng mục nào trong kỳ đang xem." };
    return { mood: (model.kpis.completenessPercent >= 90 ? "celebrate" : "guide") as "celebrate" | "guide",
      nhan: model.kpis.completenessPercent >= 90 ? "nhẹ nhõm" : "dẫn đường",
      loi: `Hồ sơ đang sạch: ${inWindow.length} hạng mục trong kỳ, ${model.kpis.completenessPercent}% đủ dữ liệu.` };
  })();
  const chipLoi = (k: string, v: { label: string; hint: string }, label = v.label, ariaLabel?: string) => {
    const n = fixCount[k] || 0;
    const on = fix === k;
    const nang = k === "done_no_date" || k === "no_deadline";
    const nhanh = k === "can_xu_ly" ? " pr-chip--quick pr-chip--quick-action"
      : k === "qua_han" ? " pr-chip--quick pr-chip--quick-overdue" : "";
    return (
      <button key={k} type="button" onClick={() => setFix(on ? "all" : k)} title={v.hint} disabled={n === 0}
        className={`pr-chip${on ? " is-on" : ""}${nang ? " pr-chip--nang" : ""}${nhanh}`} aria-pressed={on} aria-label={ariaLabel}>
        {label} <span className="pr-chip__so">{n}</span>
      </button>
    );
  };
  const nhanNut = (isFrozen: boolean) => readOnly ? "Chỉ đọc" : (isFrozen ? "Xem/khôi phục" : "Cập nhật");
  const isRightsReady = rightsState.status === "ready";

  return (
    <div data-progress-rights-state={rightsState.status} className="pr-trang">
      {focusAlert && <div role="alert" className="pr-canh-bao">{focusAlert}</div>}

      {/* ---- Hero Vali: câu dẫn + "Làm trước tiên" (thay dải thẻ hồng) ---- */}
      <section className="pr-hero" aria-label="Vali tóm tắt tiến độ">
        <div className="pr-hero__vali">
          <div className={`hn-vali hn-vali--${vali.mood}`} role="img" aria-label={`Công chúa Vali ${vali.nhan}`} />
          <span className="hn-vali__nhan">Vali · {vali.nhan}</span>
        </div>
        <div className="pr-hero__loi">
          <div className="pr-hero__eyebrow">
            <span>Tiến độ thẩm định</span>
            {!linked && <Tag color={C.marigoldText} bg={C.marigoldSoft}>○ Chưa kết nối</Tag>}
          </div>
          <p className="hn-loi">{vali.loi}</p>
          <p className="pr-hero__mota">Cập nhật mốc thực tế. Dữ liệu được lưu trực tiếp tại Supabase.</p>
          {uuTien.length > 0 && (
            <div className="pr-hero__uu-tien" aria-label="Cần xử lý trước tiên">
              <span className="pr-hero__nhan">Cần xử lý trước tiên</span>
              {uuTien.map((r, i) => {
                const goiY = [r.issues.length > 0 ? "hồ sơ thiếu/lệch" : null, r.overdueDays > 0 ? `trễ ${r.overdueDays} ngày` : null].filter(Boolean).join(" · ");
                return (
                  <button key={r.validationCode} type="button" disabled={readOnly} onClick={() => moHangMuc(r.validationCode)}
                    className={`pr-uu-tien${i === 0 ? " pr-uu-tien--dau" : ""}${r.overdueDays > 0 ? " pr-uu-tien--tre" : ""}`}
                    title={`${r.title}${goiY ? ` · ${goiY}` : ""}`}>
                    {i === 0 ? "Mở " : ""}<span className="pr-ma">{r.validationCode}</span>{i === 0 && <span aria-hidden="true"> →</span>}
                  </button>
                );
              })}
              {uuTien[0] && <span className="pr-hero__goi-y">{uuTien[0].title !== uuTien[0].validationCode ? uuTien[0].title : uuTien[0].validationCode}{uuTien[0].overdueDays > 0 ? ` · trễ ${uuTien[0].overdueDays} ngày` : ""}{uuTien[0].issues.length > 0 ? " · hồ sơ thiếu/lệch" : ""}</span>}
            </div>
          )}
        </div>
      </section>

      {/* ---- Thanh lọc chính + phần nâng cao đóng/mở --------------------- */}
      <section className="pr-loc" aria-label="Lọc danh sách tiến độ">
        <Card cls="pr-loc__mat" style={{ padding: 12 }}>
          <div className="pr-loc__chinh">
            <div className="pr-loc__tim">
              <Search size={16} color={C.plumSoft} className="pr-loc__kinh" aria-hidden="true" />
              <input type="search" value={q} onChange={(e) => { setQ(e.target.value); setPinnedValidationCode(null); }}
                placeholder="Tìm theo mã, tên, QA…" aria-label="Tìm theo mã, tên, QA" style={{ ...INP, minHeight: undefined, paddingLeft: 36 }} />
            </div>
            <div className="pr-loc__nhanh" role="group" aria-label="Lọc nhanh tiến độ">
              {chipLoi("can_xu_ly", FIXES.can_xu_ly, "Cần xử lý", "Chỉ hiện hạng mục cần xử lý")}
              {chipLoi("qua_han", FIXES.qua_han, "Quá hạn", "Chỉ hiện hạng mục quá hạn")}
            </div>
            <button type="button" className={`pr-loc__mo${moLocNangCao ? " is-on" : ""}`}
              aria-expanded={moLocNangCao} aria-controls="progress-advanced-filters"
              onClick={() => setMoLocNangCao((open) => !open)}>
              <SlidersHorizontal size={15} aria-hidden="true" /> Bộ lọc
              {soLocNangCao > 0 && <span className="pr-loc__badge" aria-label={`${soLocNangCao} bộ lọc nâng cao đang áp dụng`}>{soLocNangCao}</span>}
            </button>
            <span className="pr-loc__dem"><b>{list.length}</b>/{inWindow.length} hạng mục</span>
            {hasFilter && <button type="button" className="pr-loc__xoa" aria-label="Xóa bộ lọc" onClick={clearFilters}>
              <X size={14} aria-hidden="true" /> Xóa lọc
            </button>}
          </div>

          <div id="progress-advanced-filters" className="pr-loc__nang-cao" hidden={!moLocNangCao}>
            <div className="pr-loc__truong-grid">
              <label className="pr-loc__truong"><span>Trạng thái</span>
                <select value={fst} onChange={(e) => setFst(e.target.value)} aria-label="Lọc theo trạng thái" style={{ ...INP, minHeight: undefined, cursor: "pointer" }}>
                  <option value="all">Mọi trạng thái</option>
                  {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </label>
              <label className="pr-loc__truong"><span>Giai đoạn</span>
                <select value={stageF} onChange={(e) => setStageF(e.target.value)} aria-label="Lọc theo giai đoạn" style={{ ...INP, minHeight: undefined, cursor: "pointer" }}>
                  <option value="all">Mọi giai đoạn ({stageCount.all})</option>
                  {STAGES.map((s) => <option key={s.id} value={s.id} disabled={(stageCount[s.id] || 0) === 0 && stageF !== s.id}>{s.label} ({stageCount[s.id] || 0})</option>)}
                </select>
              </label>
              <label className="pr-loc__truong"><span>Kỳ</span>
                <select value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Lọc theo kỳ" style={{ ...INP, minHeight: undefined, cursor: "pointer" }}>
                  {PERIODS.map(([id, lb]) => <option key={id} value={id}>{lb}</option>)}
                </select>
              </label>
              {soNgung > 0 && (
                <label className={`pr-ngung${hienNgung ? " is-on" : ""}`} title="Hạng mục Không áp dụng / Đã huỷ — ẩn mặc định để không chen vào danh sách làm việc">
                  <input type="checkbox" checked={hienNgung} onChange={(e) => setHienNgung(e.target.checked)} />
                  Hiện mục đã ngừng ({soNgung})
                </label>
              )}
            </div>
            <fieldset className="pr-loc__loi-chi-tiet">
              <legend>Vấn đề chi tiết</legend>
              <div className="pr-loc__chip-grid">
                {(["done_no_date", "no_deadline", "no_owner", "mismatch"] as const).map((key) => chipLoi(key, FIXES[key]))}
              </div>
            </fieldset>
            {isDetailedProgressFix(fix) && (
              <div className="pr-loc__goi-y">{FIXES[fix as keyof typeof FIXES].hint}. Bấm <b>Cập nhật</b> ở từng dòng để điền.</div>
            )}
          </div>
        </Card>
      </section>

      {/* ---- Quyền đang nạp / lỗi: giữ nguyên bộ lọc phía trên, chỉ vùng
          bảng đổi (B6). Không dùng quyền cũ trong khoảng trống hai lần nạp. */}
      {!isRightsReady && (
        rightsState.status === "error"
          ? <Card>
              <div role="alert" className="pr-quyen pr-quyen--loi">
                Không thể tải quyền cập nhật tiến độ. Không hiển thị hạng mục để bảo vệ dữ liệu. {rightsState.error}
              </div>
              <button type="button" onClick={() => { void reloadRights(); }} style={{ ...btnPrimary, marginTop: 14, padding: "8px 16px", borderRadius: 10, fontSize: 12 }}>Thử lại</button>
            </Card>
          : <div role="status" aria-busy="true"><StateBoundary state="loading" title="Đang xác nhận hạng mục bạn được phân công…" skeletonRows={6} /></div>
      )}

      {isRightsReady && <Card style={{ padding: 0, overflow: "hidden" }} cls="vmp-chi-desktop pr-bang">
        <div className="vmp-scroll" style={{ overflowX: "auto" }}>
          <table className="pr-table" style={{ width: "100%", borderCollapse: "collapse", fontFamily: TEXT, minWidth: 820 }}>
            <thead><tr>
              {["Hạng mục", "Loại", "QA", "Mốc & hạn", "Trạng thái", "Cập nhật"].map((h, i) => (
                <th key={h} scope="col" className={i > 3 ? "pr-th pr-th--giua" : "pr-th"}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {lat.map((a) => { const validationCode = progressValidationCode(a); const sg = STAGES.find((s) => s.id === stageByItem.get(validationCode)); const itemState = a.state || (a._raw && a._raw.state) || "active"; const isFrozen = itemState !== "active"; const tenRieng = a.name && a.name !== a.code ? a.name : ""; return (
                <tr key={validationCode} data-progress-item={validationCode}
                  data-needs-action={maCanXuLy.has(validationCode)} data-overdue={maQuaHan.has(validationCode)}
                  className={`pr-row${isFrozen ? " pr-row--dong-bang" : ""}${pinnedValidationCode === validationCode ? " pr-row--focus" : ""}`}>
                  <td className="pr-td pr-td--hang-muc">
                    <span className="pr-ma">{a.code}</span>
                    <span className={tenRieng ? "pr-ten" : "pr-td__trong"}>{tenRieng || "Chưa đặt tên riêng"}</span>
                    {isFrozen && <span className="pr-hang-muc__state"><StateBadge state={String(itemState)} small /></span>}
                  </td>
                  <td className="pr-td pr-td--phu">{a.vtype}</td>
                  <td className="pr-td pr-td--phu">{nguoiPhuTrach(a.owner)}</td>
                  <td className="pr-td pr-td--moc">
                    <span className="pr-moc__giai-doan">{sg ? sg.label : "Chưa xác định mốc"}</span>
                    <span className="pr-moc__han">{a.target ? `Hạn ${a.target.split("-").reverse().join("/")}` : "Chưa có hạn"}</span>
                  </td>
                  <td className="pr-td pr-td--giua"><Pill s={a.st} small /></td>
                  <td className="pr-td pr-td--giua">
                    {/* Một nút chính mỗi dòng (B5); đường tắt "✓ Xong bước" hiện
                        khi rê chuột / đưa focus vào dòng — vẫn cùng luật GMP: hộp
                        điền sẵn hôm nay + Hoàn thành, phải chọn lý do rồi Lưu. */}
                    <div className="pr-hanh-dong">
                      {!readOnly && !isFrozen && stageByItem.get(validationCode) !== "done" && (
                        <button type="button" onClick={() => { setEdit(a); setQuick(true); }} className="pr-nhanh"
                          title="Đánh dấu xong bước hiện tại hôm nay — hộp điền sẵn, chỉ cần chọn lý do rồi Lưu">
                          ✓ Xong bước
                        </button>
                      )}
                      <button type="button" onClick={() => { if (!readOnly) { setEdit(a); setQuick(false); } }}
                        disabled={readOnly || (isFrozen && !canDoiTrangThai)}
                        title={readOnly ? "Đang ở chế độ chỉ đọc" : "Cập nhật tiến độ"}
                        className="pr-nut-chinh"><Pencil size={13} /> {nhanNut(isFrozen)}</button>
                    </div>
                  </td>
                </tr>
              ); })}
              {/* Rỗng thì nói RÕ vì sao rỗng và bộ lọc nào đang bật — và luôn
                  có một lối đi tiếp (B7). */}
              {!list.length && (
                <tr><td colSpan={6} className="pr-trong">
                  {hasFilter ? (
                    <>
                      Không có hạng mục nào khớp bộ lọc đang bật:
                      <div className="pr-trong__chip">
                        {period !== "all" && <Tag color={C.lavText} bg={C.lavSoft}>Kỳ: {PERIODS.find(([id]) => id === period)?.[1]}</Tag>}
                        {stageF !== "all" && <Tag color={C.lavText} bg={C.lavSoft}>Giai đoạn: {STAGES.find((s) => s.id === stageF)?.label}</Tag>}
                        {fix !== "all" && <Tag color={C.marigoldText} bg={C.marigoldSoft}>Cần xử lý: {FIXES[fix as keyof typeof FIXES].label}</Tag>}
                        {fst !== "all" && <Tag color={C.lavText} bg={C.lavSoft}>Trạng thái: {(STATUS as Record<string, { label: string }>)[fst]?.label ?? fst}</Tag>}
                        {!!q.trim() && <Tag color={C.lavText} bg={C.lavSoft}>Tìm: “{q.trim()}”</Tag>}
                      </div>
                      <button type="button" onClick={clearFilters} style={{ ...btnPrimary, padding: "8px 16px", borderRadius: 10, fontSize: 12 }}>Xoá hết bộ lọc</button>
                    </>
                  ) : scopedActs.length === 0 ? (
                    <>
                      Bạn chưa có hạng mục được phân công để cập nhật.
                      {onMoPhanQuyen && <div className="pr-trong__chip"><button type="button" onClick={onMoPhanQuyen} style={{ ...btnPrimary, padding: "8px 16px", borderRadius: 10, fontSize: 12 }}>Xem Vai trò &amp; phạm vi</button></div>}
                    </>
                  ) : "Chưa có hạng mục nào trong kế hoạch."}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
        {list.length > 0 && (
          <div className="pr-phan-trang">
            <PhanTrang tong={list.length} trang={trang} setTrang={setTrang}
              coTrang={coTrang} setCoTrang={setCoTrang} donVi="hạng mục" />
          </div>
        )}
      </Card>}

      {/* ---- Bản điện thoại ----------------------------------------------
          Cùng mảng `lat`, cùng bộ lọc, cùng hành động — chỉ đổi cách trình
          bày (spec §5.5). CSS cho hai bản loại trừ nhau bằng display:none nên
          chỉ một bản nằm trong cây trợ năng ở mỗi khổ màn. */}
      {isRightsReady && <MobileTaskList
        label="Hạng mục thẩm định"
        rows={lat}
        rowKey={(a) => progressValidationCode(a)}
        empty={hasFilter
          ? <div className="pr-trong pr-trong--mobile">Không có hạng mục nào khớp bộ lọc đang bật.
              <div className="pr-trong__chip"><button type="button" onClick={clearFilters} style={{ ...btnPrimary, padding: "10px 16px", borderRadius: 10, fontSize: 13, minHeight: 44 }}>Xoá hết bộ lọc</button></div></div>
          : scopedActs.length === 0
            ? <div className="pr-trong pr-trong--mobile">Bạn chưa có hạng mục được phân công để cập nhật.
                {onMoPhanQuyen && <div className="pr-trong__chip"><button type="button" onClick={onMoPhanQuyen} style={{ ...btnPrimary, padding: "10px 16px", borderRadius: 10, fontSize: 13, minHeight: 44 }}>Xem Vai trò &amp; phạm vi</button></div>}</div>
            : "Chưa có hạng mục nào trong kế hoạch."}
        renderItem={(a) => {
          const validationCode = progressValidationCode(a);
          const sg = STAGES.find((s) => s.id === stageByItem.get(validationCode));
          const itemState = a.state || (a._raw && a._raw.state) || "active";
          const isFrozen = itemState !== "active";
          return (
            <div data-progress-item={validationCode} style={{ display: "flex", flexDirection: "column", gap: 10, opacity: isFrozen ? 0.65 : 1 }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
                <b className="pr-ma">{a.code}</b>
                <Pill s={a.st} small />
              </div>

              {/* Không lặp lại mã khi hạng mục chưa có tên riêng — in cùng
                  một chuỗi hai lần liền nhau chỉ làm thẻ dài ra vô ích. */}
              {a.name && a.name !== a.code && (
                <div style={{ fontSize: 15, fontWeight: 700, color: C.plum, lineHeight: 1.4 }}>{a.name}</div>
              )}

              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                <Tag color={C.lavText} bg={C.lavSoft}>{a.vtype}</Tag>
                {sg && <Tag color={sg.color} bg={sg.bg}>{sg.label}</Tag>}
                {isFrozen && <StateBadge state={String(itemState)} small />}
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px", fontSize: 13, color: C.plumSoft, fontWeight: 600 }}>
                <span>Hạn: <b style={{ color: C.plum, fontFamily: NUM }}>{a.target ? a.target.split("-").reverse().join("/") : <Trong nhan="chưa có" />}</b></span>
                <span>QA: <b style={{ color: C.plum }}>{nguoiPhuTrach(a.owner) || <Trong nhan="chưa phân công" />}</b></span>
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {!readOnly && !isFrozen && stageByItem.get(validationCode) !== "done" && (
                  <button type="button" onClick={() => { setEdit(a); setQuick(true); }}
                    style={{ flex: "1 1 auto", minHeight: 44, borderRadius: 10, border: `1px solid ${C.mint}`,
                             background: C.mintSoft, color: C.mintText, fontFamily: TEXT, fontSize: 13,
                             fontWeight: 700, cursor: "pointer" }}>
                    ✓ Xong bước
                  </button>
                )}
                <button type="button" onClick={() => { if (!readOnly) { setEdit(a); setQuick(false); } }}
                  disabled={readOnly || (isFrozen && !canDoiTrangThai)}
                  title={readOnly ? "Đang ở chế độ chỉ đọc" : "Cập nhật tiến độ"}
                  style={{ ...btnPrimary, flex: "1 1 auto", minHeight: 44, fontSize: 13,
                           display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
                           opacity: readOnly ? 0.55 : 1, cursor: readOnly ? "not-allowed" : "pointer" }}>
                  <Pencil size={14} /> {nhanNut(isFrozen)}
                </button>
              </div>
            </div>
          );
        }}
      />}

      {/* Phân trang bản điện thoại. */}
      {isRightsReady && list.length > 0 && (
        <div className="vmp-chi-mobile">
          <PhanTrang tong={list.length} trang={trang} setTrang={setTrang}
            coTrang={coTrang} setCoTrang={setCoTrang} donVi="hạng mục" />
        </div>
      )}

      <div style={{ fontSize: 12, color: C.plumSoft, fontWeight: 600, padding: "0 4px", lineHeight: 1.6 }}>
        <b style={{ color: C.mintText }}>Supabase là nơi lưu dữ liệu gốc</b> (từ 29/07/2026).
        Sửa ngày, trạng thái và danh mục ngay trên web — Google Sheet nay chỉ là bản tham chiếu
        chỉ đọc, sửa trên đó sẽ không vào hệ thống.
      </div>
      {edit && !readOnly && <ProgressEditModal
        key={progressValidationCode(edit)}
        act={edit}
        canChonNguoiThucHien={canChonNguoiThucHien}
        canDoiTrangThai={canDoiTrangThai}
        canAssignWorkshop={canAssignWorkshop}
        quickDone={quick}
        onClose={() => { setEdit(null); setQuick(false); }}
        onReload={handleProgressReload}
        editableFields={rightsState.rights.get(progressValidationCode(edit))?.editableFields}
        permissionMode="enforced"
        // Hạng mục kế tiếp TRONG danh sách đang lọc — nhập hàng loạt không phải
        // đóng hộp rồi dò lại bảng. Bỏ qua hạng mục đóng băng nếu không phải admin.
        nextAct={(() => {
          const i = list.findIndex((a) => progressValidationCode(a) === progressValidationCode(edit));
          if (i < 0) return null;
          return list.slice(i + 1).find((a) => canDoiTrangThai || (a.state || a._raw?.state || "active") === "active") || null;
        })()}
        onOpenNext={(a) => { setEdit(a); setQuick(false); }}
        onSave={onUpdate ?? (() => { /* chưa nối hàm cập nhật */ })}
        onChangeState={async (id, newState, reason) => {
          // S3-G: gọi RPC rpc_set_item_state (010) — lý do nhập ngay trong hộp.
          // Báo kết quả bằng toast của app (A4) thay vì alert() chặn màn hình.
          if (!supabase) { toast.loi("Supabase chưa cấu hình."); return; }
          if (!reason || !reason.trim()) return;
          try {
            const { data, error } = await supabase.rpc("rpc_set_item_state", {
              p_validation_code: id,
              p_state: newState,
              p_reason: reason.trim(),
            });
            if (error) throw error;
            const r = data as unknown as { ok?: boolean; error?: string } | null;
            if (r && r.ok === false) throw new Error(r.error);
            toast.thanhCong(`Đã đổi trạng thái ${id} → ${newState}`);
            setEdit(null); setQuick(false);
            void handleProgressReload(); // nạp lại dashboard và tập quyền trước khi hiện danh sách mới
          } catch (e) {
            toast.loi("Lỗi đổi trạng thái: " + ((e as Error).message || "không rõ"));
          }
        }}
      />}
    </div>
  );
}
