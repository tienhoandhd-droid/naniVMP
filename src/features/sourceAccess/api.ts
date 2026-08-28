import { supabase } from "../../lib/supabaseClient.ts";
import {
  decodeSourceQaCandidatesResponse, SourceAccessContractError,
  decodeSourceWorkshopCoverageResponse, decodeSourceWorkshopScopeChoicesResponse,
  decodeWorkshopScopeGrantResponse,
  type SourceQaCandidatesResult, type SourceQaCandidateCursor,
  type SourceWorkshopCoverageCursor, type SourceWorkshopCoverageResult,
  type SourceWorkshopScopeChoicesCursor, type SourceWorkshopScopeChoicesResult,
  type WorkshopScopeGrantResult,
} from "./contracts.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ListSourceQaCandidatesInput {
  search?: string;
  cursor?: SourceQaCandidateCursor | null;
  limit?: number;
  includeIds?: readonly string[];
}

export interface ListSourceWorkshopCoverageInput {
  search?: string;
  cursor?: SourceWorkshopCoverageCursor | null;
  limit?: number;
}

export interface ListSourceWorkshopScopeChoicesInput {
  department?: string | null;
  areaCode?: string | null;
  search?: string;
  cursor?: SourceWorkshopScopeChoicesCursor | null;
  limit?: number;
}

export interface SetSourceWorkshopScopeGrantInput {
  grantId: string | null;
  personId: string;
  department: string;
  areaCode: string;
  line: string | null;
  isActive: boolean;
  reason: string;
  expectedVersion: number | null;
}

function rpcCursor(cursor: SourceQaCandidateCursor | null | undefined): Record<string, string> | null {
  if (!cursor) return null;
  return { normalized_full_name: cursor.normalizedFullName, person_id: cursor.personId };
}

function workshopCoverageCursor(cursor: SourceWorkshopCoverageCursor | null | undefined): Record<string, string> | null {
  if (!cursor) return null;
  return { normalized_full_name: cursor.normalizedFullName, person_id: cursor.personId };
}

function workshopScopeChoicesCursor(cursor: SourceWorkshopScopeChoicesCursor | null | undefined): Record<string, string | null> | null {
  if (!cursor) return null;
  return { department: cursor.department, area_code: cursor.areaCode, line: cursor.line };
}

/** Calls only the server-authoritative Source QA directory; names are display-only. */
export async function listSourceQaCandidates(
  input: ListSourceQaCandidatesInput = {},
): Promise<SourceQaCandidatesResult> {
  if (!supabase) return { ok: false, errorCode: "NOT_CONFIGURED", error: "Supabase chưa được cấu hình." };
  const limit = input.limit ?? 25;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    return { ok: false, errorCode: "INVALID_LIMIT", error: "Giới hạn phải từ 1 đến 50." };
  }
  const includeIds = [...new Set((input.includeIds ?? []).filter((id) => UUID.test(id)))];
  try {
    const { data, error } = await supabase.rpc("rpc_source_qa_candidates" as never, {
      p_search: input.search?.trim() ?? "",
      p_cursor: rpcCursor(input.cursor),
      p_limit: limit,
      p_include_ids: includeIds,
    } as never);
    if (error) return { ok: false, errorCode: "NETWORK", error: error.message };
    try {
      return decodeSourceQaCandidatesResponse(data);
    } catch (cause) {
      const detail = cause instanceof SourceAccessContractError ? cause.message : String(cause);
      return { ok: false, errorCode: "MALFORMED_RESPONSE", error: `Máy chủ trả dữ liệu không hợp lệ: ${detail}` };
    }
  } catch (cause) {
    return {
      ok: false,
      errorCode: "NETWORK",
      error: `Không gọi được máy chủ: ${cause instanceof Error ? cause.message : String(cause)}`,
    };
  }
}

/** Server-paged active workshop principals, including people who have no grants. */
export async function listSourceWorkshopCoverage(
  input: ListSourceWorkshopCoverageInput = {},
): Promise<SourceWorkshopCoverageResult> {
  if (!supabase) return { ok: false, errorCode: "NOT_CONFIGURED", error: "Supabase chưa được cấu hình." };
  const limit = input.limit ?? 25;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    return { ok: false, errorCode: "INVALID_LIMIT", error: "Giới hạn phải từ 1 đến 50." };
  }
  try {
    const { data, error } = await supabase.rpc("rpc_list_source_workshop_coverage" as never, {
      p_search: input.search?.trim() ?? "",
      p_cursor: workshopCoverageCursor(input.cursor),
      p_limit: limit,
    } as never);
    if (error) return { ok: false, errorCode: "NETWORK", error: error.message };
    try {
      return decodeSourceWorkshopCoverageResponse(data);
    } catch (cause) {
      const detail = cause instanceof SourceAccessContractError ? cause.message : String(cause);
      return { ok: false, errorCode: "MALFORMED_RESPONSE", error: `Máy chủ trả dữ liệu không hợp lệ: ${detail}` };
    }
  } catch (cause) {
    return { ok: false, errorCode: "NETWORK", error: `Không gọi được máy chủ: ${cause instanceof Error ? cause.message : String(cause)}` };
  }
}

/** Source-derived, paged department → area → optional-line tuples. */
export async function listSourceWorkshopScopeChoices(
  input: ListSourceWorkshopScopeChoicesInput = {},
): Promise<SourceWorkshopScopeChoicesResult> {
  if (!supabase) return { ok: false, errorCode: "NOT_CONFIGURED", error: "Supabase chưa được cấu hình." };
  const limit = input.limit ?? 50;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    return { ok: false, errorCode: "INVALID_LIMIT", error: "Giới hạn phải từ 1 đến 50." };
  }
  try {
    const { data, error } = await supabase.rpc("rpc_source_workshop_scope_choices" as never, {
      p_department: input.department?.trim() || null,
      p_area_code: input.areaCode?.trim() || null,
      p_search: input.search?.trim() ?? "",
      p_cursor: workshopScopeChoicesCursor(input.cursor),
      p_limit: limit,
    } as never);
    if (error) return { ok: false, errorCode: "NETWORK", error: error.message };
    try {
      return decodeSourceWorkshopScopeChoicesResponse(data);
    } catch (cause) {
      const detail = cause instanceof SourceAccessContractError ? cause.message : String(cause);
      return { ok: false, errorCode: "MALFORMED_RESPONSE", error: `Máy chủ trả dữ liệu không hợp lệ: ${detail}` };
    }
  } catch (cause) {
    return { ok: false, errorCode: "NETWORK", error: `Không gọi được máy chủ: ${cause instanceof Error ? cause.message : String(cause)}` };
  }
}

/** The only browser writer for one audited, versioned workshop grant. */
export async function setSourceWorkshopScopeGrant(
  input: SetSourceWorkshopScopeGrantInput,
): Promise<WorkshopScopeGrantResult | { ok: false; errorCode: "NETWORK" | "NOT_CONFIGURED" | "MALFORMED_RESPONSE"; error: string }> {
  if (!supabase) return { ok: false, errorCode: "NOT_CONFIGURED", error: "Supabase chưa được cấu hình." };
  try {
    const { data, error } = await supabase.rpc("rpc_set_source_workshop_scope_grant" as never, {
      p_grant_id: input.grantId,
      p_performer_id: input.personId,
      p_department: input.department,
      p_area_code: input.areaCode,
      p_line: input.line,
      p_is_active: input.isActive,
      p_reason: input.reason,
      p_expected_version: input.expectedVersion,
    } as never);
    if (error) return { ok: false, errorCode: "NETWORK", error: error.message };
    try {
      return decodeWorkshopScopeGrantResponse(data);
    } catch (cause) {
      const detail = cause instanceof SourceAccessContractError ? cause.message : String(cause);
      return { ok: false, errorCode: "MALFORMED_RESPONSE", error: `Máy chủ trả dữ liệu không hợp lệ: ${detail}` };
    }
  } catch (cause) {
    return { ok: false, errorCode: "NETWORK", error: `Không gọi được máy chủ: ${cause instanceof Error ? cause.message : String(cause)}` };
  }
}
