import {
  validateCreateReportSnapshotInput,
  type CreateReportSnapshotInput,
  type ReportExportFormat,
  type ReportExportPreparation,
  type ReportSnapshotReceipt,
} from "./contracts.ts";

const SNAPSHOT_BACKEND_PENDING = "Snapshot báo cáo chưa được phát hành trên máy chủ";

export async function createReportSnapshot(input: CreateReportSnapshotInput): Promise<ReportSnapshotReceipt> {
  validateCreateReportSnapshotInput(input);
  throw new Error(SNAPSHOT_BACKEND_PENDING);
}

export async function prepareReportExport(
  snapshotId: string,
  format: ReportExportFormat,
): Promise<ReportExportPreparation> {
  void snapshotId;
  void format;
  throw new Error(SNAPSHOT_BACKEND_PENDING);
}
