import { useEffect, useMemo, useState } from "react";
import { listChanges } from "./api.ts";
import type { ChangeRecord } from "./contracts.ts";
import { summarizeChanges, type ChangeSummary } from "./changeSummary.ts";

const dayFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" });

export type ChangeSummaryState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; summary: ChangeSummary; records: readonly ChangeRecord[]; today: string };

/* Tải danh sách phiếu một lần (RPC đã lọc theo quyền người xem), rồi đếm theo năm.
 * Đổi năm chỉ tính lại, không gọi máy chủ lần nữa. */
export function useChangeSummary(year: number): ChangeSummaryState {
  const [records, setRecords] = useState<ChangeRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listChanges()
      .then((result) => { if (!cancelled) setRecords(result.records); })
      .catch((cause: unknown) => {
        // listChanges đã ghi console.error chi tiết; ở đây chỉ giữ lời báo cho người dùng.
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => { cancelled = true; };
  }, []);

  return useMemo<ChangeSummaryState>(() => {
    if (error) return { status: "error", message: error };
    if (!records) return { status: "loading" };
    const today = dayFormatter.format(new Date());
    // Trả kèm danh sách phiếu để màn hình tự đếm phiếu chưa gắn đợt theo năm hoặc theo kỳ.
    return { status: "ready", summary: summarizeChanges(records, year, today), records, today };
  }, [records, error, year]);
}
