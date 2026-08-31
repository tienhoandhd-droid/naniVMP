/* =====================================================================
 *  NhomTab — tab điều phối dùng chung cho BÀN QUẢN TRỊ (spec 01/09)
 *  ---------------------------------------------------------------------
 *  Vì sao tồn tại: 6 màn nhóm Phân tích & Quản trị đều là "sổ cuộn dọc"
 *  nhiều Card xếp chồng — người vận hành vào với MỘT câu hỏi nhưng phải
 *  cuộn qua mọi thứ khác. Mỗi tab = một câu hỏi vận hành.
 *
 *  ARIA theo đúng mẫu đã qua axe của HealthPage cũ: tablist/tab/tabpanel,
 *  aria-selected, id nối aria-controls. Điều hướng mũi tên trái/phải.
 *  Nhớ tab cuối theo màn: localStorage `vmp.tab.<man>` (URL-tab: đợt sau,
 *  đụng urlState — ghi trong spec).
 * ===================================================================== */
import { useCallback, useState } from "react";
import type { ReactNode } from "react";

export interface TabMuc {
  id: string;
  nhan: string;
  /** Badge đếm — null/undefined thì không hiện. 0 vẫn hiện (0 là thông tin). */
  dem?: number | null;
  /** Tô badge theo ngữ nghĩa cảnh báo (đỏ) thay vì trung tính. */
  canhBao?: boolean;
}

/** Tab hiện hành, khởi tạo từ localStorage, tự ghi lại khi đổi. */
export function useNhomTab(man: string, macDinh: string, hopLe: readonly string[]):
  [string, (t: string) => void] {
  const [tab, setTabRaw] = useState<string>(() => {
    try {
      const luu = localStorage.getItem(`vmp.tab.${man}`);
      return luu && hopLe.includes(luu) ? luu : macDinh;
    } catch { return macDinh; }
  });
  const setTab = useCallback((t: string) => {
    setTabRaw(t);
    try { localStorage.setItem(`vmp.tab.${man}`, t); } catch { /* private mode */ }
  }, [man]);
  return [tab, setTab];
}

export default function NhomTab({ man, tabs, tab, onTab, nhan }: {
  man: string;
  tabs: readonly TabMuc[];
  tab: string;
  onTab: (id: string) => void;
  /** aria-label của tablist. */
  nhan: string;
}) {
  const onKey = (e: React.KeyboardEvent, i: number) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const j = (i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length;
    onTab(tabs[j].id);
    document.getElementById(`${man}-tab-${tabs[j].id}`)?.focus();
  };
  return (
    <div role="tablist" aria-label={nhan} className="nhom-tab">
      {tabs.map((t, i) => (
        <button key={t.id} id={`${man}-tab-${t.id}`} role="tab" type="button"
          aria-selected={tab === t.id}
          aria-controls={`${man}-panel-${t.id}`}
          tabIndex={tab === t.id ? 0 : -1}
          onClick={() => onTab(t.id)}
          onKeyDown={(e) => onKey(e, i)}>
          {t.nhan}
          {t.dem !== null && t.dem !== undefined && (
            <span className={`nhom-tab__dem${t.canhBao && t.dem > 0 ? " nhom-tab__dem--canh-bao" : ""}`}>
              {t.dem}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

/** Vỏ panel đi cặp với NhomTab — nối ARIA và chỉ dựng tab đang mở. */
export function NhomTabPanel({ man, id, tab, children }: {
  man: string; id: string; tab: string; children: ReactNode;
}) {
  if (tab !== id) return null;
  return (
    <div id={`${man}-panel-${id}`} role="tabpanel" aria-labelledby={`${man}-tab-${id}`}
      className="nhom-tab__panel">
      {children}
    </div>
  );
}

/** Dòng SỐ MỞ MÀN — mỗi ô là một câu trả lời, bấm nhảy thẳng tab liên quan. */
export function DongSo({ cacO }: {
  cacO: readonly { nhan: string; giaTri: ReactNode; phu?: string; canhBao?: boolean; onMo?: () => void }[];
}) {
  return (
    <div className="dong-so" role="group" aria-label="Số liệu chính của màn">
      {cacO.map((o) => {
        const ruot = (
          <>
            <b className={`dong-so__gia-tri${o.canhBao ? " dong-so__gia-tri--canh-bao" : ""}`}>{o.giaTri}</b>
            <span className="dong-so__nhan">{o.nhan}</span>
            {o.phu && <span className="dong-so__phu">{o.phu}</span>}
          </>
        );
        return o.onMo ? (
          <button key={o.nhan} type="button" className="dong-so__o dong-so__o--bam" onClick={o.onMo}>
            {ruot}
          </button>
        ) : (
          <div key={o.nhan} className="dong-so__o">{ruot}</div>
        );
      })}
    </div>
  );
}
