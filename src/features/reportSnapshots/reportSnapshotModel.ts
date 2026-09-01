import type { ReportExportFormat, ReportSnapshotReceipt } from "./contracts.ts";

function slug(value: string): string {
  return value.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "ky-bao-cao";
}

export function reportSnapshotFileName(
  receipt: ReportSnapshotReceipt,
  format: ReportExportFormat,
): string {
  return `VMP_${slug(receipt.periodLabel)}_${receipt.contentHash.slice(0, 8)}.${format}`;
}
