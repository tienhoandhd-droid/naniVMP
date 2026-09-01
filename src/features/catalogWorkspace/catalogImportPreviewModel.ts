import { firstActionBlock, type ActionBlock } from "../../components/ui/actionReadiness.ts";
import type {
  CatalogImportClassification,
  CatalogImportPreviewBatch,
  CatalogImportPreviewBatchStatus,
  CatalogImportPreviewPage,
  CatalogImportPreviewRow,
} from "./catalogImportPreviewContract.ts";

export interface CatalogImportPreviewState {
  batchId: string;
  batch: CatalogImportPreviewBatch | null;
  rows: CatalogImportPreviewRow[];
  nextCursor: number | null;
  loaded: number;
}

export interface CatalogImportPreviewFilter {
  search: string;
  classification: CatalogImportClassification | "all";
}

export interface CatalogImportCommitReadiness {
  busy: boolean;
  previewOk: boolean;
  status: CatalogImportPreviewBatchStatus | "missing";
  errors: number;
  reason: string;
}

export function emptyCatalogImportPreviewState(batchId: string): CatalogImportPreviewState {
  return { batchId, batch: null, rows: [], nextCursor: null, loaded: 0 };
}

function sameBatch(left: CatalogImportPreviewBatch, right: CatalogImportPreviewBatch): boolean {
  return left.id === right.id
    && left.total === right.total
    && left.status === right.status
    && JSON.stringify(left.counts) === JSON.stringify(right.counts);
}

export function appendCatalogImportPreviewPage(
  state: CatalogImportPreviewState,
  page: CatalogImportPreviewPage,
): CatalogImportPreviewState {
  if (state.batchId !== page.batch.id) throw new Error("Không được trộn preview của hai batch");
  if (state.batch && !sameBatch(state.batch, page.batch)) {
    throw new Error("Metadata batch thay đổi giữa các trang preview");
  }
  const seen = new Set(state.rows.map((row) => row.rowNumber));
  if (page.rows.some((row) => seen.has(row.rowNumber))) {
    throw new Error("Preview page lặp row_number đã tải");
  }
  const previousRow = state.rows.at(-1)?.rowNumber ?? 0;
  if (page.rows.length > 0 && page.rows[0].rowNumber <= previousRow) {
    throw new Error("Preview page không tiếp tục sau row_number hiện tại");
  }
  if (state.nextCursor !== null && previousRow > 0 && state.nextCursor !== previousRow) {
    throw new Error("Cursor hiện tại không khớp row_number cuối");
  }
  const lastNewRow = page.rows.at(-1)?.rowNumber ?? previousRow;
  if (page.nextCursor !== null && page.nextCursor !== lastNewRow) {
    throw new Error("Cursor trang mới không tiến theo row_number");
  }
  const rows = [...state.rows, ...page.rows];
  if (rows.length > page.batch.total) throw new Error("Số dòng preview vượt tổng batch");
  return {
    batchId: state.batchId,
    batch: page.batch,
    rows,
    nextCursor: page.nextCursor,
    loaded: rows.length,
  };
}

export function filterCatalogImportRows(
  rows: readonly CatalogImportPreviewRow[],
  filter: CatalogImportPreviewFilter,
): CatalogImportPreviewRow[] {
  const search = filter.search.trim().toLocaleLowerCase("vi");
  return rows.filter((row) => {
    if (filter.classification !== "all" && row.classification !== filter.classification) return false;
    if (!search) return true;
    return row.businessKey.toLocaleLowerCase("vi").includes(search)
      || (row.objectKind ?? "").toLocaleLowerCase("vi").includes(search);
  });
}

export function catalogImportCommitBlock(input: CatalogImportCommitReadiness): ActionBlock | null {
  return firstActionBlock([
    { blocked: input.busy, code: "request", message: "Đang ghi lô" },
    { blocked: !input.previewOk, code: "preview", message: "Chưa có kết quả đối chiếu server" },
    { blocked: input.status !== "validated", code: "status", message: "Batch chưa sẵn sàng" },
    { blocked: input.errors > 0, code: "rows", message: `Còn ${input.errors} dòng lỗi` },
    {
      blocked: !input.reason.trim(),
      code: "required",
      message: "Nhập lý do của cả lô",
      focusId: "cw-import-batch-reason",
    },
  ]);
}
