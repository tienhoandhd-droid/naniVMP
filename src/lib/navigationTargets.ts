import type { AccessContext, ScreenId } from "./access.ts";

export type OverviewIntent = "overdue" | "soon" | "data-quality" | "today";

const TARGETS: Record<OverviewIntent, readonly ScreenId[]> = {
  overdue: ["progress", "alerts"],
  soon: ["alerts", "timeline"],
  "data-quality": ["health", "source"],
  today: ["today", "alerts"],
};

export function overviewTarget(
  access: Pick<AccessContext, "canView">,
  intent: OverviewIntent,
): ScreenId | null {
  return TARGETS[intent].find((screen) => access.canView(screen)) ?? null;
}
