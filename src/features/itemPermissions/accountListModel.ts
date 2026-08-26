import type { AccountCandidate, DirectoryPerson } from "./types.ts";

const directoryRoleRank: Readonly<Record<string, number>> = {
  qa_manager: 0,
  qa_progress_editor: 1,
  equipment_manager: 2,
  workshop_staff: 3,
};

const candidateRoleRank: Readonly<Record<string, number>> = {
  admin: 0,
  qa_manager: 1,
  department_user: 2,
  viewer: 3,
};

const unknownRoleRank = Number.MAX_SAFE_INTEGER;

function compareText(left: string, right: string): number {
  return left.localeCompare(right, "vi", { sensitivity: "base" });
}

function compareDirectoryPeople(left: DirectoryPerson, right: DirectoryPerson): number {
  const roleOrder = (directoryRoleRank[left.access_class ?? ""] ?? unknownRoleRank)
    - (directoryRoleRank[right.access_class ?? ""] ?? unknownRoleRank);
  if (roleOrder !== 0) return roleOrder;

  const nameOrder = compareText(left.full_name, right.full_name);
  if (nameOrder !== 0) return nameOrder;

  const emailOrder = compareText(left.email ?? "", right.email ?? "");
  if (emailOrder !== 0) return emailOrder;

  return left.person_id.localeCompare(right.person_id);
}

function compareAccountCandidates(left: AccountCandidate, right: AccountCandidate): number {
  const roleOrder = (candidateRoleRank[left.role] ?? unknownRoleRank)
    - (candidateRoleRank[right.role] ?? unknownRoleRank);
  if (roleOrder !== 0) return roleOrder;

  const nameOrder = compareText(left.full_name, right.full_name);
  if (nameOrder !== 0) return nameOrder;

  const emailOrder = compareText(left.email, right.email);
  if (emailOrder !== 0) return emailOrder;

  return left.user_id.localeCompare(right.user_id);
}

export function visibleSortedDirectoryPeople(
  people: readonly DirectoryPerson[],
): DirectoryPerson[] {
  return [...people].filter((person) => person.is_active).sort(compareDirectoryPeople);
}

export function visibleSortedAccountCandidates(
  candidates: readonly AccountCandidate[],
): AccountCandidate[] {
  return [...candidates].filter((candidate) => candidate.is_active).sort(compareAccountCandidates);
}
