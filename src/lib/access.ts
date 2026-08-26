import {
  BUSINESS_ROLE_IDS as BUSINESS_ROLES,
  BUSINESS_ROLE_LABELS,
  isBusinessRole,
} from "./businessRoles.ts";
import type { BusinessRole } from "./businessRoles.ts";

/* Quyền màn hình chỉ được cấp bởi payload tường minh của rpc_my_ui_access().
 * Đây là lớp trình bày; RLS/RPC vẫn là biên chặn dữ liệu thực. */

export const SCREEN_IDS = [
  "today", "overview", "timeline", "alerts", "risk", "progress", "inventory", "source",
  "workload", "reports", "rules", "health", "audit", "accounts", "admin", "phanquyen",
] as const;

export type ScreenId = (typeof SCREEN_IDS)[number];
const SCREEN_ID_SET: ReadonlySet<string> = new Set(SCREEN_IDS);

export function laScreenId(v: unknown): v is ScreenId {
  return typeof v === "string" && SCREEN_ID_SET.has(v);
}

export { BUSINESS_ROLES, BUSINESS_ROLE_LABELS };
export type { BusinessRole };

export const DATA_SCOPES = ["all", "workshop", "assigned", "own", "none"] as const;
export type DataScope = (typeof DATA_SCOPES)[number];
export type AccessMode = "preview" | "enforced";

export interface ScreenPermission {
  canView: boolean;
  dataScope: DataScope;
  actions: ReadonlySet<string>;
}

export interface AccessContext {
  mode: AccessMode;
  businessRole: BusinessRole | null;
  unresolvedReason: string | null;
  screens: Readonly<Record<string, ScreenPermission>>;
  canView(screenId: string): boolean;
  can(screenId: string, action: string): boolean;
  scope(screenId: string): DataScope;
}

const TU_CHOI: ScreenPermission = {
  canView: false,
  dataScope: "none",
  actions: new Set<string>(),
};

function laObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function docMode(v: unknown): AccessMode {
  return v === "preview" ? "preview" : "enforced";
}

function docBusinessRole(v: unknown): BusinessRole | null {
  return isBusinessRole(v) ? v : null;
}

function docScope(v: unknown): DataScope {
  return typeof v === "string" && (DATA_SCOPES as readonly string[]).includes(v)
    ? (v as DataScope)
    : "none";
}

function docActions(v: unknown): ReadonlySet<string> {
  if (!Array.isArray(v)) return new Set<string>();
  return new Set(v.filter((x): x is string => typeof x === "string" && x.length > 0));
}

function docQuyenMotMan(v: unknown): ScreenPermission {
  if (!laObject(v) || v.can_view !== true) return TU_CHOI;
  return { canView: true, dataScope: docScope(v.data_scope ?? v.scope), actions: docActions(v.actions) };
}

function dungContext(
  mode: AccessMode,
  businessRole: BusinessRole | null,
  unresolvedReason: string | null,
  screens: Record<string, ScreenPermission>,
): AccessContext {
  const lay = (screenId: string): ScreenPermission => screens[screenId] ?? TU_CHOI;
  return {
    mode,
    businessRole,
    unresolvedReason,
    screens,
    canView: (screenId) => lay(screenId).canView,
    scope: (screenId) => lay(screenId).dataScope,
    can: (screenId, action) => {
      const q = lay(screenId);
      return q.canView && q.actions.has(action);
    },
  };
}

/**
 * Parses only an explicit RPC payload. Malformed, missing, unknown-role, and
 * legacy Viewer payloads all resolve to zero access. Preview is retained only
 * when the server explicitly returns it with a valid effective business role.
 */
export function parseAccessContext(payload: unknown): AccessContext {
  if (!laObject(payload)) return dungContext("enforced", null, null, {});

  const unresolvedReason = typeof payload.unresolved_reason === "string" && payload.unresolved_reason.length > 0
    ? payload.unresolved_reason
    : null;
  if (payload.ok !== true || !laObject(payload.screens)) {
    return dungContext("enforced", null, unresolvedReason, {});
  }

  const role = docBusinessRole(payload.business_role);
  if (!role) return dungContext("enforced", null, unresolvedReason, {});

  const screens: Record<string, ScreenPermission> = {};
  for (const [screenId, quyen] of Object.entries(payload.screens)) {
    if (laScreenId(screenId)) screens[screenId] = docQuyenMotMan(quyen);
  }
  return dungContext(docMode(payload.mode), role, unresolvedReason, screens);
}
