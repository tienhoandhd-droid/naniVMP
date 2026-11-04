import { FileDiff, ShieldAlert } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { C } from "../../constants/theme.ts";
import { StatTile } from "../../components/ui/Primitives.tsx";
import type { ChangeRecordKind } from "./contracts.ts";
import { CHANGE_KIND_LABEL, changeSummarySub } from "./changeSummary.ts";
import type { ChangeSummaryState } from "./useChangeSummary.ts";

const KIND_ICON: Record<ChangeRecordKind, LucideIcon> = { thay_doi: FileDiff, sai_lech: ShieldAlert };
const KIND_TONE: Record<ChangeRecordKind, { c: string; bg: string }> = {
  thay_doi: { c: C.skyText, bg: C.skySoft },
  sai_lech: { c: C.lavText, bg: C.lavSoft },
};

/* Hai thẻ "Thay đổi" và "Sai lệch": tỉ lệ đã xong của phiếu có hạn trong năm. */
export default function ChangeSummaryTiles({ state, year, clsFor, onOpen }: {
  state: ChangeSummaryState;
  year: number;
  /** Lớp CSS cho từng thẻ (Tổng quan cần đặt vào ô lưới riêng). */
  clsFor?: (kind: ChangeRecordKind) => string;
  onOpen?: () => void;
}) {
  return (
    <>
      {(["thay_doi", "sai_lech"] as const).map((kind) => {
        const s = state.status === "ready" ? state.summary[kind] : null;
        return (
          <StatTile key={kind} cls={clsFor?.(kind) ?? ""} icon={KIND_ICON[kind]} metricId={`change-${kind}`}
            label={`${CHANGE_KIND_LABEL[kind]} hoàn thành ${year}`}
            value={state.status === "loading" ? "…" : s?.rate == null ? "—" : `${s.rate}%`}
            tone={s && s.overdue > 0 ? { c: C.raspText, bg: C.raspSoft } : KIND_TONE[kind]}
            sub={state.status === "loading" ? "Đang tải"
              : state.status === "error" ? state.message
                : changeSummarySub(state.summary[kind])}
            onClick={onOpen} />
        );
      })}
    </>
  );
}
