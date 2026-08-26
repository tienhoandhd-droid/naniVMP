export interface ProgressEvidence {
  actual_protocol_date: string | null;
  actual_validation_date: string | null;
  actual_report_date: string | null;
  actual_vmp_date: string | null;
  status_protocol: string;
  status_validation: string;
  status_report: string;
  status_vmp: string;
}

export interface ProgressedDeadlineCandidate {
  validation_code: string;
  item_version: number;
  eligible: boolean;
  blocker_code: string | null;
  blocker_reason: string | null;
  missing: string[];
  progress: ProgressEvidence;
  deadline_protocol_cu: string | null;
  deadline_protocol_moi: string | null;
  deadline_validation_cu: string | null;
  deadline_validation_moi: string | null;
  deadline_report_cu: string | null;
  deadline_report_moi: string | null;
  deadline_vmp_cu: string | null;
  deadline_vmp_moi: string | null;
}

export interface DeadlineOverrideSelection {
  validation_code: string;
  expected_item_version: number;
}

const DEADLINE_PAIRS: ReadonlyArray<
  readonly [keyof ProgressedDeadlineCandidate, keyof ProgressedDeadlineCandidate]
> = [
  ["deadline_protocol_cu", "deadline_protocol_moi"],
  ["deadline_validation_cu", "deadline_validation_moi"],
  ["deadline_report_cu", "deadline_report_moi"],
  ["deadline_vmp_cu", "deadline_vmp_moi"],
];

export function candidateHasDeadlineChange(candidate: ProgressedDeadlineCandidate): boolean {
  return DEADLINE_PAIRS.some(([current, next]) => candidate[current] !== candidate[next]);
}

function canSelectCandidate(candidate: ProgressedDeadlineCandidate): boolean {
  return candidate.eligible === true
    && candidate.missing.length === 0
    && candidateHasDeadlineChange(candidate);
}

export function toggleDeadlineOverride(
  current: readonly DeadlineOverrideSelection[],
  candidate: ProgressedDeadlineCandidate,
): DeadlineOverrideSelection[] {
  if (!canSelectCandidate(candidate)) return [...current];

  const next = [...current];
  const index = next.findIndex((selection) => selection.validation_code === candidate.validation_code);
  if (index < 0) {
    next.push({
      validation_code: candidate.validation_code,
      expected_item_version: candidate.item_version,
    });
  } else if (next[index].expected_item_version === candidate.item_version) {
    next.splice(index, 1);
  } else {
    next[index] = {
      validation_code: candidate.validation_code,
      expected_item_version: candidate.item_version,
    };
  }
  return next;
}

export function canApplyCatalogImpact(input: {
  normalChangeCount: number;
  selected: readonly DeadlineOverrideSelection[];
  reason: string;
  confirmed: boolean;
}): { ok: true } | { ok: false; reason: string } {
  if (input.normalChangeCount <= 0 && input.selected.length === 0) {
    return { ok: false, reason: "Không có thay đổi để áp" };
  }
  if (!input.reason.trim()) {
    return { ok: false, reason: "Lý do là bắt buộc" };
  }
  if (input.selected.length > 0 && input.confirmed !== true) {
    return { ok: false, reason: "Cần xác nhận đặc biệt để áp deadline đã có tiến độ" };
  }
  return { ok: true };
}

const FALLBACK_ERROR = "Áp vào timeline thất bại";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function formatMissing(value: unknown): string | null {
  if (!Array.isArray(value) || value.length === 0) return null;

  const entries = value.map((item) => {
    if (typeof item === "string") return item.trim();
    if (!isRecord(item)) return null;
    const fields = Array.isArray(item.fields)
      ? item.fields.filter((field): field is string => typeof field === "string" && Boolean(field.trim()))
      : [];
    if (fields.length === 0) return asNonEmptyString(item.reason) ?? asNonEmptyString(item.message);
    const code = asNonEmptyString(item.validation_code);
    return code && value.length > 1 ? `${code}: ${fields.join(", ")}` : fields.join(", ");
  }).filter((item): item is string => Boolean(item));

  return entries.length ? `thiếu: ${entries.join("; ")}` : null;
}

function formatDetails(value: unknown): string | null {
  if (typeof value === "string") return asNonEmptyString(value);
  if (Array.isArray(value)) {
    const entries = value.map((item) => {
      if (typeof item === "string") return item.trim();
      if (!isRecord(item)) return null;
      return asNonEmptyString(item.message)
        ?? asNonEmptyString(item.reason)
        ?? asNonEmptyString(item.validation_code);
    }).filter((item): item is string => Boolean(item));
    return entries.length ? entries.join(" · ") : null;
  }
  if (isRecord(value)) {
    return asNonEmptyString(value.message)
      ?? asNonEmptyString(value.reason)
      ?? asNonEmptyString(value.detail)
      ?? JSON.stringify(value);
  }
  return null;
}

export function catalogApplyErrorMessage(result: unknown): string {
  if (!isRecord(result)) return FALLBACK_ERROR;

  const error = asNonEmptyString(result.error);
  const missing = formatMissing(result.missing);
  const details = formatDetails(result.details);
  const suffix = [missing, details].filter((item): item is string => Boolean(item));
  if (error) return [error, ...suffix].join(" — ");
  if (suffix.length) return suffix.join(" — ");
  return FALLBACK_ERROR;
}
