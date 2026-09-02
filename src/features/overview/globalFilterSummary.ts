export type GlobalFilterSummaryInput = {
  departmentLabels: readonly string[];
  areaLabels: readonly string[];
  dateLabel: string | null;
};

export type GlobalFilterSummaryPresentation = {
  activeCount: number;
  visibleLabel: string;
  ariaLabel: string;
};

export function presentGlobalFilterSummary({
  departmentLabels,
  areaLabels,
  dateLabel,
}: GlobalFilterSummaryInput): GlobalFilterSummaryPresentation {
  const labels = [
    ...departmentLabels,
    ...areaLabels,
    ...(dateLabel ? [dateLabel] : []),
  ];
  const activeCount = labels.length;
  const visible = labels.slice(0, 2);
  const remaining = activeCount - visible.length;

  return {
    activeCount,
    visibleLabel: activeCount === 0
      ? "Tất cả dữ liệu"
      : `${visible.join(" · ")}${remaining > 0 ? ` · +${remaining}` : ""}`,
    ariaLabel: activeCount === 0
      ? "Bộ lọc dữ liệu: đang xem tất cả"
      : `Bộ lọc dữ liệu: ${activeCount} điều kiện đang áp dụng`,
  };
}
