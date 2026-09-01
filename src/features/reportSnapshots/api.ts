import { supabase } from "../../lib/supabaseClient.ts";
import {
  decodeReportExportPreparation,
  decodeReportSnapshotReceipt,
  validateCreateReportSnapshotInput,
  type CreateReportSnapshotInput,
  type ReportExportFormat,
  type ReportExportPreparation,
  type ReportSnapshotReceipt,
} from "./contracts.ts";

export async function createReportSnapshot(input: CreateReportSnapshotInput): Promise<ReportSnapshotReceipt> {
  const client = supabase;
  if (!client) throw new Error("Supabase chưa cấu hình");
  const valid = validateCreateReportSnapshotInput(input);
  const { data, error } = await client.rpc("rpc_create_report_snapshot" as never, {
    p_report_period: valid.reportPeriod,
    p_year: valid.year,
    p_month: valid.month ?? null,
    p_quarter: valid.quarter ?? null,
    p_filters: valid.filters,
    p_template_version: valid.templateVersion,
  } as never);
  if (error) throw new Error(`Không tạo được snapshot báo cáo: ${error.message}`);
  return decodeReportSnapshotReceipt(data);
}

export async function prepareReportExport(
  snapshotId: string,
  format: ReportExportFormat,
): Promise<ReportExportPreparation> {
  const client = supabase;
  if (!client) throw new Error("Supabase chưa cấu hình");
  const { data, error } = await client.rpc("rpc_prepare_report_export" as never, {
    p_snapshot_id: snapshotId,
    p_format: format,
  } as never);
  if (error) throw new Error(`Không chuẩn bị được bản xuất: ${error.message}`);
  return decodeReportExportPreparation(data, format);
}
