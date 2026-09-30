import { useState } from "react";
import { ChevronDown, ClipboardCheck } from "lucide-react";
import { useDirtyStateSnapshot } from "../ui/DirtyStateProvider.tsx";
import {
  isQualificationNavigationCurrent,
  qualificationHref,
} from "../../features/qualification/shellRoute.ts";
import type { QualificationAccessStatus, QualificationSystem } from "../../features/qualification/useQualificationAccess.ts";

export type QualificationNavigationLink = { label: string; target: string };
export type QualificationNavigationGroup = {
  label: string;
  target?: string;
  system?: QualificationSystem;
  links?: QualificationNavigationLink[];
};

const FORM_NAMES: Record<QualificationSystem, readonly string[]> = {
  steam: ["Khí không ngưng tụ", "Chất lượng nước ngưng", "Độ khô", "Quá nhiệt", "Báo cáo tổng hợp"],
  air: ["Tiểu phân", "Điểm sương", "Vết dầu", "Vi sinh vật", "Tổng hợp chất lượng", "Giới hạn cảnh báo và hành động"],
  nitrogen: ["Tiểu phân", "Điểm sương", "Vết dầu", "Vi sinh vật", "Độ tinh khiết", "Tổng hợp chất lượng", "Giới hạn cảnh báo và hành động"],
};
const SYSTEM_NAMES: Record<QualificationSystem, string> = {
  steam: "Hơi tinh khiết", air: "Khí nén", nitrogen: "Khí nitơ",
};

export function qualificationNavigationForSystems(systems: readonly QualificationSystem[]): QualificationNavigationGroup[] {
  const groups: QualificationNavigationGroup[] = [{ label: "Đợt thẩm định", target: "runs.html" }];
  for (const system of ["steam", "air", "nitrogen"] as const) {
    if (!systems.includes(system)) continue;
    const entry = system === "steam" ? "steam.html" : `gas.html?system=${system}`;
    const trend = `runs.html?view=trend&system=${system}`;
    groups.push({
      label: SYSTEM_NAMES[system], system,
      links: [
        ...FORM_NAMES[system].map((name, index) => ({
          label: `BM${String(index + 1).padStart(2, "0")} — ${name}`,
          target: `${entry}&form=bm${String(index + 1).padStart(2, "0")}`.replace(".html&", ".html?"),
        })),
        { label: `Sơ đồ xu hướng ${SYSTEM_NAMES[system].toLocaleLowerCase("vi")}`, target: trend },
      ],
    });
  }
  return groups;
}

type Props = {
  collapsed?: boolean;
  systems: readonly QualificationSystem[];
  status: QualificationAccessStatus;
  error: string | null;
  onRetry: () => void;
  onOpenQualification?: (target: string) => boolean;
  qualificationTarget?: string | null;
};

export function QualificationNavigation({
  collapsed = false, systems, status, error, onRetry, onOpenQualification, qualificationTarget,
}: Props) {
  const { hasDirty } = useDirtyStateSnapshot();
  const [expanded, setExpanded] = useState<Partial<Record<QualificationSystem, boolean>>>({});
  const groups = qualificationNavigationForSystems(systems);
  const open = (event: React.MouseEvent<HTMLAnchorElement>, target: string) => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
    if (onOpenQualification) {
      event.preventDefault();
      onOpenQualification(target);
      return;
    }
    if (hasDirty && !window.confirm("Có dữ liệu VMP chưa lưu. Rời trang để mở Thẩm định thực tế?")) event.preventDefault();
  };

  if (status !== "ready" || systems.length === 0) {
    return error ? <p className="qualification-nav-status" role="status">{error} <button type="button" onClick={onRetry}>Thử lại</button></p> : null;
  }
  if (collapsed) {
    const target = "runs.html";
    return <a href={qualificationHref(target)} className="vmp-nav qualification-nav__collapsed" data-module="qualification"
      aria-current={isQualificationNavigationCurrent(target, qualificationTarget) ? "page" : undefined}
      aria-label="Thẩm định thực tế" title="Thẩm định thực tế" onClick={(event) => open(event, target)}>
      <ClipboardCheck size={19} strokeWidth={1.8} aria-hidden="true" />
    </a>;
  }
  return <section className="qualification-nav" data-nav-group="qualification" aria-label="Thẩm định thực tế">
    <h2 className="vmp-nav-group-heading">THẨM ĐỊNH THỰC TẾ</h2>
    {groups.map((group) => group.target ? <QualificationLink key={group.label} link={{ label: group.label, target: group.target }} target={qualificationTarget} onOpen={open} /> : (
      <div className="qualification-nav__system" key={group.system}>
        <button type="button" className="qualification-nav__system-toggle" aria-expanded={expanded[group.system!] === true}
          onClick={() => setExpanded((current) => ({ ...current, [group.system!]: !current[group.system!] }))}>
          <span>{group.label}</span><ChevronDown size={16} aria-hidden="true" />
        </button>
        {expanded[group.system!] === true && <div className="qualification-nav__links">
          {group.links!.map((link) => <QualificationLink key={link.target} link={link} target={qualificationTarget} onOpen={open} />)}
        </div>}
      </div>
    ))}
  </section>;
}

function QualificationLink({ link, target, onOpen }: { link: QualificationNavigationLink; target?: string | null; onOpen: (event: React.MouseEvent<HTMLAnchorElement>, target: string) => void }) {
  return <a href={qualificationHref(link.target)} className="vmp-nav qualification-nav__link" data-module="qualification"
    aria-current={isQualificationNavigationCurrent(link.target, target) ? "page" : undefined}
    onClick={(event) => onOpen(event, link.target)}>{link.label}</a>;
}
