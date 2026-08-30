import { useEffect, useRef } from "react";
import { GanttChartSquare, LayoutDashboard, ShieldAlert } from "lucide-react";
import {
  MONITORING_SCREEN_COPY,
  type MonitoringScreenId,
  type MonitoringSignatureMetrics,
} from "./monitoringMetrics.ts";

export interface MonitoringJourneyNavProps {
  current: MonitoringScreenId;
  metrics: MonitoringSignatureMetrics;
  canView: (screen: MonitoringScreenId) => boolean;
  onNavigate: (screen: MonitoringScreenId) => void;
  scopeLabel?: string;
}

const ITEMS = [
  { id: "overview", metric: "vmpOverdue", Icon: LayoutDashboard },
  { id: "timeline", metric: "phaseOverdue", Icon: GanttChartSquare },
  { id: "alerts", metric: "highRisk", Icon: ShieldAlert },
] as const;

export default function MonitoringJourneyNav({
  current,
  metrics,
  canView,
  onNavigate,
  scopeLabel = "Theo phạm vi chung",
}: MonitoringJourneyNavProps) {
  const railRef = useRef<HTMLDivElement>(null);
  const visibleItems = ITEMS.filter(({ id }) => canView(id));
  const liveSummary = visibleItems
    .map(({ id, metric }) => `${MONITORING_SCREEN_COPY[id].metricLabel}: ${metrics[metric]}`)
    .join("; ");

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;

    const keepActiveVisible = () => {
      if (rail.scrollWidth <= rail.clientWidth + 1) return;

      const active = rail.querySelector<HTMLElement>('[aria-current="page"]');
      if (!active) return;

      const railRect = rail.getBoundingClientRect();
      const activeRect = active.getBoundingClientRect();
      if (activeRect.left < railRect.left || activeRect.right > railRect.right) {
        rail.scrollLeft = active.offsetLeft;
      }
    };

    keepActiveVisible();
    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(keepActiveVisible);
    observer.observe(rail);
    return () => observer.disconnect();
  }, [current]);

  return (
    <nav className="monitoring-journey" aria-label="Ba màn giám sát">
      <p className="monitoring-journey__scope">{scopeLabel}</p>
      <span className="lp-visually-hidden" aria-live="polite">{liveSummary}</span>
      <div ref={railRef} className="monitoring-journey__rail">
        {visibleItems.map(({ id, metric, Icon }) => {
          const copy = MONITORING_SCREEN_COPY[id];
          const active = current === id;

          return (
            <button
              key={id}
              type="button"
              className={`monitoring-journey__item${active ? " is-active" : ""}`}
              aria-current={active ? "page" : undefined}
              onClick={() => onNavigate(id)}
            >
              <Icon aria-hidden="true" size={20} />
              <span className="monitoring-journey__copy">
                <strong>{copy.title}</strong>
                <span>{copy.description}</span>
                {active && <span className="monitoring-journey__current">Đang xem</span>}
              </span>
              <span className="monitoring-journey__metric">
                <strong>{metrics[metric]}</strong>
                <span>{copy.metricLabel}</span>
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
