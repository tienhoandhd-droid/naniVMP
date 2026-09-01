import { supabase } from "../../lib/supabaseClient.ts";
import {
  decodeRevalidationDecisionResult,
  decodeRevalidationProposals,
  validateRevalidationDecision,
  type RevalidationDecisionInput,
  type RevalidationDecisionResult,
  type RevalidationProposal,
  type RevalidationProposalStatus,
} from "./contracts.ts";

export type RevalidationDecisionAction = "confirm" | "dismiss";
type DecisionRpcName = "rpc_confirm_revalidation_proposal" | "rpc_dismiss_revalidation_proposal";
type DecisionRpc = (
  name: DecisionRpcName,
  args: { p_proposal_id: string; p_reason: string; p_expected_version: number },
) => Promise<{ data: unknown; error: { message: string } | null }>;

export async function decideRevalidationViaRpc(
  rpc: DecisionRpc,
  action: RevalidationDecisionAction,
  input: RevalidationDecisionInput,
): Promise<RevalidationDecisionResult> {
  const decision = validateRevalidationDecision(input);
  const { data, error } = await rpc(
    action === "confirm" ? "rpc_confirm_revalidation_proposal" : "rpc_dismiss_revalidation_proposal",
    {
      p_proposal_id: decision.proposalId,
      p_reason: decision.reason,
      p_expected_version: decision.expectedVersion,
    },
  );
  if (error) throw new Error(`Không ghi được quyết định tái thẩm định: ${error.message}`);
  return decodeRevalidationDecisionResult(data);
}

const SELECT_COLUMNS = [
  "id", "plan_item_id", "validation_code", "object_code", "validation_type",
  "actual_completed_date", "frequency_months", "due_date", "status", "version",
  "created_plan_validation_code", "decision_reason", "decided_at", "created_at", "updated_at",
].join(",");

export async function listRevalidationProposals(
  status: RevalidationProposalStatus | "all" = "all",
): Promise<RevalidationProposal[]> {
  const client = supabase;
  if (!client) throw new Error("Supabase chưa cấu hình");
  let query = client.from("vmp_revalidation_proposals" as never)
    .select(SELECT_COLUMNS)
    .order("due_date", { ascending: true })
    .order("id", { ascending: true })
    .limit(200);
  if (status !== "all") query = query.eq("status", status as never);
  const { data, error } = await query;
  if (error) throw new Error(`Không tải được kỳ tái thẩm định: ${error.message}`);
  return decodeRevalidationProposals(data);
}

export async function refreshRevalidationProposals(): Promise<{
  created: number; unchanged: number; obsolete: number;
}> {
  const client = supabase;
  if (!client) throw new Error("Supabase chưa cấu hình");
  const { data, error } = await client.rpc("rpc_refresh_revalidation_proposals" as never, {} as never);
  if (error) throw new Error(`Không làm mới được kỳ tái thẩm định: ${error.message}`);
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Máy chủ trả kết quả refresh không hợp lệ");
  const raw = data as Record<string, unknown>;
  for (const key of ["created", "unchanged", "obsolete"] as const) {
    if (!Number.isSafeInteger(raw[key]) || (raw[key] as number) < 0) throw new Error(`Kết quả refresh thiếu ${key}`);
  }
  return {
    created: raw.created as number,
    unchanged: raw.unchanged as number,
    obsolete: raw.obsolete as number,
  };
}

export async function decideRevalidation(
  action: RevalidationDecisionAction,
  input: RevalidationDecisionInput,
): Promise<RevalidationDecisionResult> {
  const client = supabase;
  if (!client) throw new Error("Supabase chưa cấu hình");
  if (action === "confirm") {
    return decideRevalidationViaRpc(async (_rpcName, args) => {
      const { data, error } = await client.rpc("rpc_confirm_revalidation_proposal" as never, args as never);
      return { data, error: error ? { message: error.message } : null };
    }, action, input);
  }
  return decideRevalidationViaRpc(async (_rpcName, args) => {
    const { data, error } = await client.rpc("rpc_dismiss_revalidation_proposal" as never, args as never);
    return { data, error: error ? { message: error.message } : null };
  }, action, input);
}
