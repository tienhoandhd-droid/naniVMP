import { supabase } from "../../lib/supabaseClient.ts";
import {
  ChangeRefusedError,
  decodeChangeList,
  decodeChangeWrite,
  decodeObject,
  type ChangeHandlingStatus,
  type ChangeListResult,
  type ChangeObject,
  type ChangeWriteResult,
} from "./contracts.ts";

function client() {
  if (!supabase) throw new Error("Chưa kết nối được dữ liệu.");
  return supabase;
}

export async function listChanges(): Promise<ChangeListResult> {
  const { data, error } = await client().rpc("rpc_change_list" as never, {} as never);
  if (error) {
    console.error("[thay đổi] tải danh sách lỗi:", error);
    throw new Error("Không tải được danh sách thay đổi. Thử lại.");
  }
  try {
    return decodeChangeList(data);
  } catch (cause) {
    console.error("[thay đổi] dữ liệu danh sách không hợp lệ:", cause, data);
    throw new Error(cause instanceof ChangeRefusedError ? cause.message : "Dữ liệu thay đổi không hợp lệ.");
  }
}

export async function searchChangeObjects(query: string): Promise<ChangeObject[]> {
  const { data, error } = await client().rpc("rpc_change_search_objects" as never, { p_query: query } as never);
  if (error) {
    console.error("[thay đổi] gợi ý thiết bị lỗi:", error);
    throw new Error("Không tải được gợi ý thiết bị.");
  }
  const list: unknown = data;
  if (!Array.isArray(list)) return [];
  return list.flatMap((item: unknown) => {
    try {
      return [decodeObject(item)];
    } catch (cause) {
      console.error("[thay đổi] bỏ gợi ý thiết bị sai dạng:", cause, item);
      return [];
    }
  });
}

export interface ChangeSaveInput {
  changeId: string;
  expectedVersion: number;
  objectCodes: string[];
  planItemIds: string[];
  deadlineOverride: string | null;
  handlingStatus: ChangeHandlingStatus;
  note: string;
}

export async function saveChange(input: ChangeSaveInput): Promise<ChangeWriteResult> {
  const { data, error } = await client().rpc("rpc_change_save" as never, {
    p_change_id: input.changeId,
    p_expected_version: input.expectedVersion,
    p_object_codes: input.objectCodes,
    p_plan_item_ids: input.planItemIds,
    p_deadline_override: input.deadlineOverride,
    p_handling_status: input.handlingStatus,
    p_note: input.note,
  } as never);
  if (error) {
    console.error("[thay đổi] lưu lỗi:", error);
    throw new Error("Không lưu được. Kiểm tra mạng rồi thử lại.");
  }
  return decodeChangeWrite(data);
}

export async function createPlanFromChange(input: {
  changeId: string; expectedVersion: number; objectCode: string; validationType: string; year: number;
}): Promise<ChangeWriteResult> {
  const { data, error } = await client().rpc("rpc_change_create_plan_item" as never, {
    p_change_id: input.changeId,
    p_expected_version: input.expectedVersion,
    p_object_code: input.objectCode,
    p_validation_type: input.validationType,
    p_year: input.year,
  } as never);
  if (error) {
    console.error("[thay đổi] tạo đợt lỗi:", error);
    throw new Error("Không tạo được đợt thẩm định. Thử lại.");
  }
  return decodeChangeWrite(data);
}

export async function requestChangeSync(): Promise<{ already: boolean }> {
  const { data, error } = await client().rpc("rpc_change_request_sync" as never, {} as never);
  if (error) {
    console.error("[thay đổi] yêu cầu làm mới lỗi:", error);
    throw new Error("Không gửi được yêu cầu làm mới.");
  }
  const raw = (data ?? {}) as Record<string, unknown>;
  if (raw.ok !== true) {
    throw new Error(typeof raw.error === "string" ? raw.error : "Không gửi được yêu cầu làm mới.");
  }
  return { already: raw.already === true };
}

/** Nhãn "Do CC-..." cho màn Tiến độ. Lỗi thì trả rỗng: nhãn chỉ là phụ. */
export async function loadChangeBadges(): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  if (!supabase) return result;
  const { data, error } = await supabase.rpc("rpc_change_plan_badges" as never, {} as never);
  if (error) {
    console.error("[thay đổi] tải nhãn tiến độ lỗi:", error);
    return result;
  }
  const raw = (data ?? {}) as Record<string, unknown>;
  if (raw.ok !== true || !Array.isArray(raw.badges)) return result;
  for (const item of raw.badges) {
    if (!item || typeof item !== "object") continue;
    const badge = item as Record<string, unknown>;
    if (typeof badge.plan_item_id !== "string" || !Array.isArray(badge.change_codes)) continue;
    const codes = badge.change_codes.filter((c): c is string => typeof c === "string");
    if (codes.length) result.set(badge.plan_item_id, codes);
  }
  return result;
}
