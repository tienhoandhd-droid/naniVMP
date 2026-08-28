import type { ProgressDeepLink } from "../today/todayModel.ts";
import type { EditableProgressRight } from "./editableProgressRights.ts";

export type ProgressDeepLinkResolution =
  | (ProgressDeepLink & { status: "allowed" })
  | { status: "revoked"; validationCode: string };

export function resolveProgressDeepLink(
  rights: ReadonlyMap<string, EditableProgressRight>,
  link: ProgressDeepLink,
): ProgressDeepLinkResolution {
  if (!rights.has(link.validationCode)) {
    return { status: "revoked", validationCode: link.validationCode };
  }
  return { ...link, reasons: [...link.reasons], status: "allowed" };
}
