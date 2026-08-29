import type { BusinessRole } from "./businessRoles.ts";
import type { Activity } from "../types/domain.ts";

export interface PersonProgressChoice {
  personId: string;
  fullName: string;
  label: string;
}

type ActivityRecord = Record<string, unknown>;

export function canSelectPersonProgressScope(role: BusinessRole | null): boolean {
  return role === "admin" || role === "qa_manager";
}

function value(activity: Activity, keys: readonly string[]): unknown {
  const row = activity as ActivityRecord;
  const raw = activity._raw ?? {};
  for (const key of keys) {
    const direct = row[key];
    if (direct !== undefined && direct !== null && direct !== "") return direct;
  }
  for (const key of keys) {
    const nested = raw[key];
    if (nested !== undefined && nested !== null && nested !== "") return nested;
  }
  return null;
}

function text(input: unknown): string | null {
  return typeof input === "string" && input.trim() ? input.trim() : null;
}

export function buildPersonProgressChoices(
  activities: readonly Activity[],
): PersonProgressChoice[] {
  const byId = new Map<string, { personId: string; fullName: string }>();
  const add = (personIdValue: unknown, nameValue: unknown) => {
    const personId = text(personIdValue);
    if (!personId) return;
    const fullName = text(nameValue) ?? `Nhân sự ID …${personId.slice(-8)}`;
    const current = byId.get(personId);
    if (!current || current.fullName.startsWith("Nhân sự ID …")) {
      byId.set(personId, { personId, fullName });
    }
  };

  for (const activity of activities) {
    if (String(activity.state ?? activity._raw?.state ?? "active") !== "active") continue;
    add(
      value(activity, ["ownerPersonId", "owner_person_id"]),
      value(activity, ["owner_name", "owner", "performer_name"]),
    );
    add(
      value(activity, ["supportPersonId", "support_person_id"]),
      value(activity, ["support", "support_name", "secondary_owner"]),
    );
  }

  return [...byId.values()]
    .map((person) => ({
      ...person,
      label: `${person.fullName} · ID …${person.personId.slice(-8)}`,
    }))
    .sort((left, right) => left.fullName.localeCompare(right.fullName, "vi")
      || left.personId.localeCompare(right.personId));
}
