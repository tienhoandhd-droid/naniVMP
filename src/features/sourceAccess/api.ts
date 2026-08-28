import { supabase } from "../../lib/supabaseClient.ts";
import {
  decodeSourceQaCandidatesResponse, SourceAccessContractError,
  type SourceQaCandidatesResult, type SourceQaCandidateCursor,
} from "./contracts.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ListSourceQaCandidatesInput {
  search?: string;
  cursor?: SourceQaCandidateCursor | null;
  limit?: number;
  includeIds?: readonly string[];
}

function rpcCursor(cursor: SourceQaCandidateCursor | null | undefined): Record<string, string> | null {
  if (!cursor) return null;
  return { normalized_full_name: cursor.normalizedFullName, person_id: cursor.personId };
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
