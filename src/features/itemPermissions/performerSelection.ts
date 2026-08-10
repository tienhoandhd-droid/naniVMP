export interface PerformerChoice {
  personId: string;
  fullName: string;
  email: string | null;
  department: string | null;
}

export interface PerformerSourceRow {
  id: string;
  performer_name: string;
  email: string | null;
  department: string | null;
  is_active: boolean;
}

export type SourcePerformerField = "owner_name" | "support_name";

export function buildSetItemPerformerByIdArgs(
  validationCode: string,
  personId: string | null,
  reason: string,
) {
  return {
    p_validation_code: validationCode,
    p_person_id: personId,
    p_reason: reason,
  };
}

/** Build assignment options from the authoritative active performer directory. */
export function buildActivePerformerChoices(
  performers: readonly PerformerSourceRow[],
): PerformerChoice[] {
  return performers
    .filter((person) => person.is_active)
    .map((person) => ({
      personId: person.id,
      fullName: person.performer_name,
      email: person.email,
      department: person.department,
    }));
}

/** Resolve only by stable ID. Names are deliberately never accepted as keys. */
export function resolvePerformerChoice(
  personId: string | null | undefined,
  options: readonly PerformerChoice[],
): PerformerChoice | null {
  if (!personId) return null;
  return options.find((person) => person.personId === personId) ?? null;
}

/** Compatibility for rows that have not exposed person_id yet; ambiguity stays unresolved. */
export function resolveUniquePerformerIdByName(
  legacyName: string | null | undefined,
  options: readonly PerformerChoice[],
): string | null {
  const normalized = String(legacyName ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("vi");
  if (!normalized) return null;
  const matches = options.filter((person) =>
    person.fullName.trim().replace(/\s+/g, " ").toLocaleLowerCase("vi") === normalized);
  return matches.length === 1 ? matches[0].personId : null;
}

/**
 * Source Catalog still mirrors legacy name columns. Construct that compatibility
 * payload only at the explicit save boundary, from the selected canonical ID.
 */
export function buildSourcePerformerPatch(
  field: SourcePerformerField,
  personId: string | null,
  options: readonly PerformerChoice[],
): Record<string, string | null> {
  const idField = field === "owner_name" ? "owner_person_id" : "support_person_id";
  if (personId === null) return { [idField]: null, [field]: "" };

  const person = resolvePerformerChoice(personId, options);
  if (!person) throw new Error("Người được chọn không còn hoạt động hoặc không tồn tại.");
  return { [idField]: person.personId, [field]: person.fullName };
}
