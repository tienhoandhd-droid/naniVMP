import type { BusinessRole } from "../../lib/businessRoles.ts";

export type TodayPersonScope = "mine" | "team";

export interface TodayScopePresentation {
  heading: "Việc hôm nay của tôi" | "Việc hôm nay của cả đội";
  actionLabel: "Xem việc cả đội" | "Chỉ xem việc của tôi";
  warning: string | null;
}

export function canUsePersonalTodayScope(currentPersonId: string | null): boolean {
  return typeof currentPersonId === "string" && currentPersonId.trim().length > 0;
}

export function defaultTodayPersonScope(
  businessRole: BusinessRole | null,
  currentPersonId: string | null,
): TodayPersonScope {
  return businessRole === "qa_staff" && canUsePersonalTodayScope(currentPersonId)
    ? "mine"
    : "team";
}

export function presentTodayPersonScope(
  scope: TodayPersonScope,
  currentPersonId: string | null,
): TodayScopePresentation {
  const personal = scope === "mine";

  return {
    heading: personal ? "Việc hôm nay của tôi" : "Việc hôm nay của cả đội",
    actionLabel: personal ? "Xem việc cả đội" : "Chỉ xem việc của tôi",
    warning: canUsePersonalTodayScope(currentPersonId)
      ? null
      : "Tài khoản chưa liên kết nhân sự; nhờ Admin nối hồ sơ.",
  };
}
