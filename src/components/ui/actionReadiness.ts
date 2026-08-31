export interface ActionBlockCandidate {
  blocked: boolean;
  code: string;
  message: string;
  focusId?: string;
}

export type ActionBlock = Omit<ActionBlockCandidate, "blocked">;

export function firstActionBlock(candidates: readonly ActionBlockCandidate[]): ActionBlock | null {
  const candidate = candidates.find((item) => item.blocked);
  if (!candidate) return null;
  return candidate.focusId
    ? { code: candidate.code, message: candidate.message, focusId: candidate.focusId }
    : { code: candidate.code, message: candidate.message };
}

export function actionDescriptionId(scope: string): string {
  const slug = scope
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug ? `action-${slug}-description` : "action-description";
}
