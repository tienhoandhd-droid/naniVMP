/* =====================================================================
 *  ViewportDialog — hộp thoại đúng chuẩn, dùng chung toàn app
 *  ---------------------------------------------------------------------
 *  Thay `Modal` cũ. Bốn thứ bản cũ thiếu, và mỗi thứ đều là một cách bỏ
 *  rơi người dùng bàn phím hoặc trình đọc màn hình:
 *
 *   1. KHÔNG bẫy tiêu điểm. Tab vài lần là con trỏ chạy ra sau lớp phủ,
 *      vào một trang người dùng không nhìn thấy và không đóng lại được.
 *   2. KHÔNG trả tiêu điểm về chỗ cũ khi đóng. Đóng xong, tiêu điểm rơi
 *      về đầu tài liệu; người dùng phải Tab lại từ đầu.
 *   3. KHÔNG làm nền trơ. Trình đọc màn hình vẫn đọc xuyên qua lớp phủ
 *      như thể hộp thoại không tồn tại.
 *   4. KHÔNG giới hạn chiều cao. Hộp dài hơn màn thì nút "Lưu" nằm ngoài
 *      vùng nhìn, và không cuộn tới được vì thân trang đã bị khoá.
 *
 *  Tham chiếu: WAI-ARIA APG — Dialog (Modal) Pattern.
 * ===================================================================== */
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode, RefObject } from "react";

import { nextDialogFocus } from "./dialogState.ts";
import type { ViewportDialogCloseReason } from "./dialogState.ts";

export type { ViewportDialogCloseReason };

export interface ViewportDialogProps {
  open: boolean;
  title: string;
  description?: ReactNode;
  /* Dùng chính kiểu của Lucide thay vì tự khai một kiểu gần đúng: bộ icon
     nhận `size` là number HOẶC string, nên kiểu hẹp hơn sẽ không nhận. */
  icon?: LucideIcon;
  maxWidth?: number;
  onRequestClose: (reason: ViewportDialogCloseReason) => void;
  /** Khóa mọi lối đóng do người dùng khởi tạo khi mutation đang chạy.
   *  Caller vẫn giữ coordinator đồng bộ riêng để chặn cửa sổ race trước
   *  khi React kịp render trạng thái disabled. */
  dismissDisabled?: boolean;
  footer?: ReactNode;
  children?: ReactNode;
  /** Trả tiêu điểm về đây khi đóng. Không truyền thì tự nhớ phần tử đang
   *  focus lúc mở — đủ đúng cho hầu hết trường hợp. */
  returnFocusRef?: RefObject<HTMLElement | null>;
}

const CHON_FOCUS = [
  "a[href]", "button:not([disabled])", "input:not([disabled])",
  "select:not([disabled])", "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/** Sổ chủ sở hữu: hộp thoại lồng nhau hoặc thay thế nhau không được để
 *  ứng dụng "sống lại" một nhịp giữa hai lần mở. */
let soHopDangMo = 0;
let anhChupNen: Array<{ el: Element; inert: string | null; hidden: string | null }> | null = null;
let tranCu: string | null = null;

function lamTroNen(hostPortal: Element) {
  soHopDangMo += 1;
  if (soHopDangMo > 1) return;               // hộp lồng: nền đã trơ sẵn

  anhChupNen = [];
  for (const el of Array.from(document.body.children)) {
    if (el === hostPortal) continue;
    anhChupNen.push({
      el,
      inert: el.getAttribute("inert"),
      hidden: el.getAttribute("aria-hidden"),
    });
    el.setAttribute("inert", "");
    el.setAttribute("aria-hidden", "true");
  }
  tranCu = document.body.style.overflow || "";
  document.body.style.overflow = "hidden";
}

function traLaiNen() {
  soHopDangMo = Math.max(0, soHopDangMo - 1);
  if (soHopDangMo > 0) return;               // còn hộp khác đang mở

  for (const { el, inert, hidden } of anhChupNen || []) {
    // Trả về ĐÚNG giá trị cũ, kể cả khi trước đó đã có sẵn thuộc tính.
    if (inert === null) el.removeAttribute("inert");
    else el.setAttribute("inert", inert);
    if (hidden === null) el.removeAttribute("aria-hidden");
    else el.setAttribute("aria-hidden", hidden);
  }
  anhChupNen = null;
  document.body.style.overflow = tranCu ?? "";
  tranCu = null;
}

/** `completed` là lối đóng do caller xác nhận sau mutation; ba lối người
 * dùng có thể kích hoạt trực tiếp phải bị primitive chặn khi đang bận. */
export function canRequestViewportDialogClose(
  dismissDisabled: boolean,
  reason: ViewportDialogCloseReason,
): boolean {
  return !dismissDisabled || reason === "completed";
}

export default function ViewportDialog({
  open, title, description, icon: Icon, maxWidth = 560,
  onRequestClose, dismissDisabled = false, footer, children, returnFocusRef,
}: ViewportDialogProps) {
  const uid = useId().replace(/:/g, "");
  const idTieuDe = `lp-dialog-title-${uid}`;
  const idMoTa = `lp-dialog-desc-${uid}`;

  const panelRef = useRef<HTMLDivElement | null>(null);
  const focusCu = useRef<HTMLElement | null>(null);

  /* Host của portal phải tồn tại NGAY từ lượt render đầu.
     Bản trước giữ nó trong `useRef` và tạo trong `useEffect` — mà gán ref
     thì không kích hoạt render lại, nên cây vẫn dựng inline trong App.
     Hậu quả: hộp thoại nằm bên trong chính khối vừa bị đánh `inert`, và
     không phần tử nào trong nó focus được nữa. */
  const [host] = useState<HTMLDivElement | null>(() =>
    (typeof document === "undefined" ? null : document.createElement("div")));

  const dsFocus = useCallback((): HTMLElement[] => {
    const p = panelRef.current;
    if (!p) return [];
    return Array.from(p.querySelectorAll<HTMLElement>(CHON_FOCUS))
      .filter((el) => el.offsetParent !== null || el === document.activeElement);
  }, []);
  const requestDismiss = useCallback((reason: ViewportDialogCloseReason) => {
    if (canRequestViewportDialogClose(dismissDisabled, reason)) onRequestClose(reason);
  }, [dismissDisabled, onRequestClose]);

  /* --- Vòng đời: làm trơ nền, bẫy tiêu điểm, trả tiêu điểm ----------- */
  useEffect(() => {
    if (!open || typeof document === "undefined") return undefined;

    focusCu.current = (document.activeElement as HTMLElement) || null;

    if (!host) return undefined;
    host.setAttribute("data-lp-dialog-host", "");
    document.body.appendChild(host);
    lamTroNen(host);

    return () => {
      traLaiNen();
      host.remove();
      const ve = returnFocusRef?.current || focusCu.current;
      // Chờ một nhịp: React còn đang gỡ cây, focus ngay sẽ bị ghi đè.
      if (ve && typeof ve.focus === "function") requestAnimationFrame(() => ve.focus());
    };
  }, [open, host, returnFocusRef]);

  /* --- Tiêu điểm ban đầu --------------------------------------------
   *  Mặc định là phần tử focus được đầu tiên — thường là nút đóng ở đầu
   *  hộp, đúng cho hộp chỉ để đọc. Nhưng hộp CÓ FORM thì con trỏ phải nằm
   *  ở ô nhập đầu tiên: mở ra là gõ được ngay, không phải Tab qua nút đóng.
   *
   *  `autoFocus` của React KHÔNG làm được việc đó ở đây — nó chạy lúc phần
   *  tử mount, rồi bị chính hiệu ứng này ghi đè một nhịp sau. Nên hộp nào
   *  muốn chỉ định ô nhận con trỏ thì đánh dấu `data-dialog-focus` lên ô đó.
   */
  useEffect(() => {
    if (!open) return;
    const t = requestAnimationFrame(() => {
      const ds = dsFocus();
      const chiDinh = panelRef.current?.querySelector<HTMLElement>("[data-dialog-focus]");
      (chiDinh || ds[0] || panelRef.current)?.focus();
    });
    return () => cancelAnimationFrame(t);
  }, [open, dsFocus]);

  /* --- Bàn phím: Escape đóng, Tab chạy vòng ------------------------- */
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); requestDismiss("escape"); return; }
      if (e.key !== "Tab") return;

      const ds = dsFocus();
      if (ds.length === 0) { e.preventDefault(); return; }
      const dangO = ds.indexOf(document.activeElement as HTMLElement);
      e.preventDefault();
      ds[nextDialogFocus(dangO < 0 ? (e.shiftKey ? 0 : -1) : dangO, ds.length, e.shiftKey)]?.focus();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, requestDismiss, dsFocus]);

  if (!open) return null;

  const noiDung = (
    <div
      className="lp-dialog"
      onMouseDown={(e) => { if (e.target === e.currentTarget) requestDismiss("backdrop"); }}
    >
      <div
        ref={panelRef}
        className="lp-dialog__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTieuDe}
        aria-describedby={description ? idMoTa : undefined}
        tabIndex={-1}
        style={{ maxWidth }}
      >
        <header className="lp-dialog__header">
          <div className="lp-dialog__heading">
            {Icon && <span className="lp-dialog__icon" aria-hidden="true"><Icon size={18} /></span>}
            <div>
              <h2 id={idTieuDe} className="lp-dialog__title">{title}</h2>
              {description && <p id={idMoTa} className="lp-dialog__desc">{description}</p>}
            </div>
          </div>
          <button type="button" className={`lp-dialog__close${dismissDisabled ? " lp-dialog__close--disabled" : ""}`}
            aria-label="Đóng" aria-disabled={dismissDisabled} disabled={dismissDisabled}
            onClick={() => requestDismiss("button")}>
            <X size={18} />
          </button>
        </header>

        <div className="lp-dialog__body">{children}</div>

        {footer && <footer className="lp-dialog__footer">{footer}</footer>}
      </div>
    </div>
  );

  /* Chưa có host thì trả thẳng cây thay vì trả null. Hai lúc rơi vào
     nhánh này: lượt render đầu tiên (useEffect chưa kịp tạo host) và khi
     dựng tĩnh phía máy chủ, nơi không có `document` nào cả. Trả null ở đây
     nghĩa là hộp thoại không tồn tại trong HTML tĩnh — và test cấu trúc
     sẽ không kiểm được gì. */
  return host ? createPortal(noiDung, host) : noiDung;
}
