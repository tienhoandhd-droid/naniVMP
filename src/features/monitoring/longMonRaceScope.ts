import type { Activity } from "../../types/domain.ts";

export type LongMonAudience = "team" | "personal";

type LongMonScopeInput = {
  activities: readonly Activity[];
  businessRole: string | null;
  currentPersonId: string | null;
  audience: LongMonAudience;
  selectedPersonId: string | null;
};

const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

function personIdOf(activity: Activity, directKey: string, rawKey: string): string | null {
  return text(activity[directKey]) ?? text(activity._raw?.[rawKey]);
}

function belongsTo(activity: Activity, personId: string): boolean {
  return personIdOf(activity, "ownerPersonId", "owner_person_id") === personId
    || personIdOf(activity, "supportPersonId", "support_person_id") === personId;
}

export function canChooseLongMonAudience(businessRole: string | null): boolean {
  return businessRole === "admin" || businessRole === "qa_manager";
}

export function resolveLongMonAudience(
  businessRole: string | null,
  requested: LongMonAudience,
): LongMonAudience {
  return businessRole === "qa_staff" ? "personal" : requested;
}

export function filterLongMonScopeActivities({
  activities,
  businessRole,
  currentPersonId,
  audience,
  selectedPersonId,
}: LongMonScopeInput): Activity[] {
  if (businessRole === "qa_staff") {
    const personId = text(currentPersonId);
    return personId ? activities.filter((activity) => belongsTo(activity, personId)) : [];
  }

  if (canChooseLongMonAudience(businessRole)) {
    if (resolveLongMonAudience(businessRole, audience) === "team") return [...activities];
    const personId = text(selectedPersonId);
    return personId ? activities.filter((activity) => belongsTo(activity, personId)) : [];
  }

  return [...activities];
}
