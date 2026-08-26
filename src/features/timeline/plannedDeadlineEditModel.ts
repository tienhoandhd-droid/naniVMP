import type { Activity } from "../../types/domain.ts";

export const DEADLINE_KEYS = [
  "deadline_protocol",
  "deadline_validation",
  "deadline_report",
  "deadline_vmp",
] as const;

export const PLANNED_DEADLINE_SUCCESS_TOAST = "Đã cập nhật deadline kế hoạch";

export type PlannedDeadlineKey = typeof DEADLINE_KEYS[number];
export type PlannedDeadlineSnapshot = Record<PlannedDeadlineKey, string | null>;

export const PROTECTED_KEYS = [
  "actual_protocol_date",
  "actual_validation_date",
  "actual_report_date",
  "actual_vmp_date",
  "status_protocol",
  "status_validation",
  "status_report",
  "status_vmp",
] as const;

export type ProtectedKey = typeof PROTECTED_KEYS[number];
export type ProtectedSnapshot = Record<ProtectedKey, string | null>;

export type PlannedDeadlineErrorCode =
  | "ACCOUNT_DISABLED"
  | "ROLE_UNRESOLVED"
  | "FORBIDDEN"
  | "INVALID_DEADLINE_PAYLOAD"
  | "EXPECTED_REVISION_REQUIRED"
  | "REASON_REQUIRED"
  | "CONFIRMATION_REQUIRED"
  | "ITEM_NOT_FOUND"
  | "ITEM_STATE_INACTIVE"
  | "VERSION_CONFLICT"
  | "DEADLINE_ERASURE_FORBIDDEN"
  | "DEADLINE_ORDER_INVALID"
  | "NO_ACTIONABLE_CHANGE"
  | "WRITE_MISMATCH";

export interface UpdatePlannedDeadlinesInput {
  validationCode: string;
  deadlines: PlannedDeadlineSnapshot;
  reason: string;
  expectedVersion: number;
  confirmed: boolean;
}

export interface PlannedDeadlineSuccess {
  ok: true;
  validation_code: string;
  old_deadlines: PlannedDeadlineSnapshot;
  new_deadlines: PlannedDeadlineSnapshot;
  changed_fields: PlannedDeadlineKey[];
  previous_version: number;
  current_version: number;
  actor_id: string | null;
  effective_role: "admin" | "qa_manager" | "service_role";
  reason: string;
  protected_fields_preserved: true;
}

export interface PlannedDeadlineFailure {
  ok: false;
  error_code: PlannedDeadlineErrorCode;
  error: string;
  validation_code?: string;
  expected_version?: number;
  current_version?: number;
  requires_reload?: true;
}

export type PlannedDeadlineResult = PlannedDeadlineSuccess | PlannedDeadlineFailure;

export interface PlannedDeadlineDraftValidationInput {
  validationCode: unknown;
  before: unknown;
  next: unknown;
  reason: string;
  confirmed: boolean;
  version: unknown;
}

type PreparedPlannedDeadlineInput =
  | { ok: true; input: UpdatePlannedDeadlinesInput }
  | { ok: false; error: string };

const raw = (activity: Activity) => (activity._raw || {}) as Record<string, unknown>;

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function hasOwn(object: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

export function isExactPlannedDeadlineSnapshot(value: unknown): value is PlannedDeadlineSnapshot {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;

  const snapshot = value as Record<string, unknown>;
  const keys = Object.keys(snapshot);
  if (keys.length !== DEADLINE_KEYS.length) return false;

  return DEADLINE_KEYS.every((key) => hasOwn(snapshot, key)
    && (typeof snapshot[key] === "string" || snapshot[key] === null));
}

export function canPresentPlannedDeadlineEdit(enabled: unknown, role: unknown): boolean {
  return enabled === "true" && (role === "admin" || role === "qa_manager");
}

export function plannedSnapshot(activity: Activity): PlannedDeadlineSnapshot {
  const source = raw(activity);
  return {
    deadline_protocol: text(activity.dlProtocol ?? source.deadline_protocol ?? source.dl_de_cuong),
    deadline_validation: text(activity.dlValidation ?? source.deadline_validation ?? source.dl_tham_dinh),
    deadline_report: text(activity.dlReport ?? source.deadline_report ?? source.dl_bao_cao),
    deadline_vmp: text(activity.dlVmp ?? source.deadline_vmp ?? source.dl_vmp),
  };
}

export function protectedSnapshot(activity: Activity): ProtectedSnapshot {
  const source = raw(activity);
  return {
    actual_protocol_date: text(activity.actProtocol ?? source.actual_protocol_date ?? source.ngay_de_cuong),
    actual_validation_date: text(activity.actValidation ?? source.actual_validation_date ?? source.ngay_tham_dinh),
    actual_report_date: text(activity.actReport ?? source.actual_report_date ?? source.ngay_bao_cao),
    actual_vmp_date: text(activity.actVmp ?? source.actual_vmp_date ?? source.ngay_vmp),
    status_protocol: text(source.status_protocol ?? source.tt_de_cuong),
    status_validation: text(source.status_validation ?? source.tt_tham_dinh),
    status_report: text(source.status_report ?? source.tt_bao_cao),
    status_vmp: text(source.status_vmp ?? source.tt_vmp),
  };
}

export function isIsoCalendarDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

export function validatePlannedDeadlineDraft({
  validationCode,
  before,
  next,
  reason,
  confirmed,
  version,
}: PlannedDeadlineDraftValidationInput): string | null {
  if (typeof validationCode !== "string" || !validationCode.trim()) {
    return "Thiếu mã hạng mục đã tải";
  }
  if (!Number.isFinite(version) || !Number.isInteger(version) || Number(version) < 0) {
    return "Thiếu phiên bản hạng mục đã tải";
  }
  if (!isExactPlannedDeadlineSnapshot(before) || !isExactPlannedDeadlineSnapshot(next)) {
    return "Bản ghi phải có đúng bốn deadline kế hoạch";
  }
  if (!reason.trim()) return "Phải nhập lý do điều chỉnh deadline kế hoạch";
  if (!confirmed) return "Phải xác nhận chỉ đổi bốn deadline kế hoạch";
  if (DEADLINE_KEYS.some((key) => next[key] !== null && !isIsoCalendarDate(next[key]!))) {
    return "Deadline phải là ngày ISO YYYY-MM-DD hoặc null";
  }
  if (DEADLINE_KEYS.some((key) => before[key] !== null && next[key] === null)) {
    return "Không được xoá deadline kế hoạch đã có";
  }

  const populatedDates = DEADLINE_KEYS.map((key) => next[key]).filter(
    (value): value is string => value !== null,
  );
  if (populatedDates.some((value, index) => index > 0 && populatedDates[index - 1] > value)) {
    return "Bốn deadline kế hoạch phải theo đúng thứ tự";
  }
  if (DEADLINE_KEYS.every((key) => before[key] === next[key])) {
    return "Không có deadline nào thay đổi";
  }
  return null;
}

export function preparePlannedDeadlineUpdate(
  draft: PlannedDeadlineDraftValidationInput,
): PreparedPlannedDeadlineInput {
  const error = validatePlannedDeadlineDraft(draft);
  if (error) return { ok: false, error };

  const next = draft.next as PlannedDeadlineSnapshot;
  return {
    ok: true,
    input: {
      validationCode: (draft.validationCode as string).trim(),
      deadlines: {
        deadline_protocol: next.deadline_protocol,
        deadline_validation: next.deadline_validation,
        deadline_report: next.deadline_report,
        deadline_vmp: next.deadline_vmp,
      },
      reason: draft.reason.trim(),
      expectedVersion: Number(draft.version),
      confirmed: true,
    },
  };
}

export function resultMessage(result: PlannedDeadlineResult): string {
  if (result.ok) return "";
  if (result.error_code === "VERSION_CONFLICT") {
    return `${result.error} (phiên bản đã tải ${result.expected_version}; hiện tại ${result.current_version})`;
  }
  return result.error;
}

export function createPlannedDeadlineCoordinator() {
  let busy = false;

  return {
    isBusy: () => busy,
    async run<T>(work: () => Promise<T>): Promise<T | null> {
      if (busy) return null;
      busy = true;
      try {
        return await work();
      } finally {
        busy = false;
      }
    },
  };
}

export function createPlannedDeadlineCloseActions({
  isBusy,
  onClose,
  onReload,
}: {
  isBusy: () => boolean;
  onClose: () => void;
  onReload: () => void;
}) {
  const requestClose = (): boolean => {
    if (isBusy()) return false;
    onClose();
    return true;
  };

  const reloadConflict = (): boolean => {
    if (!requestClose()) return false;
    onReload();
    return true;
  };

  return { requestClose, reloadConflict };
}

export type PlannedDeadlineDialogSubmitOutcome =
  | { kind: "busy" }
  | { kind: "success" }
  | { kind: "failure"; result: PlannedDeadlineFailure }
  | { kind: "transport_error"; message: string };

export function createPlannedDeadlineDialogController({
  mutate,
  onSuccess,
  onClose,
  onReload,
}: {
  mutate: (input: UpdatePlannedDeadlinesInput) => Promise<PlannedDeadlineResult>;
  onSuccess: () => void;
  onClose: () => void;
  onReload: () => void;
}) {
  const coordinator = createPlannedDeadlineCoordinator();
  const closeActions = createPlannedDeadlineCloseActions({
    isBusy: coordinator.isBusy,
    onClose,
    onReload,
  });

  return {
    isBusy: coordinator.isBusy,
    requestClose: closeActions.requestClose,
    reloadConflict: closeActions.reloadConflict,
    async submit(input: UpdatePlannedDeadlinesInput): Promise<PlannedDeadlineDialogSubmitOutcome> {
      try {
        const result = await coordinator.run(() => mutate(input));
        if (result === null) return { kind: "busy" };
        if (!result.ok) return { kind: "failure", result };

        onSuccess();
        closeActions.requestClose();
        onReload();
        return { kind: "success" };
      } catch (error) {
        return {
          kind: "transport_error",
          message: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
}
