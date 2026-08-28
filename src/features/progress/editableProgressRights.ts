import {
  QA_MANAGER_TIMELINE_FIELDS,
  type EditableTimelineField,
} from "../itemPermissions/types.ts";

/** Quyền cập nhật tiến độ của một hạng mục do server cấp cho phiên hiện tại. */
export interface EditableProgressRight {
  validationCode: string;
  editableFields: readonly EditableTimelineField[];
  reason: string;
}

export interface VisibleProgressStageFields {
  protocol: EditableTimelineField[];
  validation: EditableTimelineField[];
  report: EditableTimelineField[];
  vmp: EditableTimelineField[];
}

const PROGRESS_FIELDS = [...QA_MANAGER_TIMELINE_FIELDS] as readonly EditableTimelineField[];
const PROGRESS_FIELD_SET = new Set<EditableTimelineField>(PROGRESS_FIELDS);

/* `scheduled_at` vẫn là một field hợp lệ ở hợp đồng quyền hạng mục chung,
 * nhưng không phải ô cập nhật tiến độ. Stage model bên dưới cố ý không đưa nó
 * vào bất kỳ bước nào. */
const KNOWN_EDITABLE_FIELDS = new Set<EditableTimelineField>([
  ...PROGRESS_FIELDS,
  "scheduled_at",
]);

type RawProgressRight = {
  validation_code?: unknown;
  editable_fields?: unknown;
  view_reason?: unknown;
};

function objectValue(value: unknown, context: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${context} phải là object`);
  }
  return value as Record<string, unknown>;
}

function nonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Quyền tiến độ thiếu hoặc sai ${field}`);
  }
  return value.trim();
}

function editableFields(value: unknown): EditableTimelineField[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("Quyền tiến độ thiếu hoặc sai editable_fields");
  }

  const fields: EditableTimelineField[] = [];
  const seen = new Set<string>();
  for (const field of value) {
    if (typeof field !== "string" || !KNOWN_EDITABLE_FIELDS.has(field as EditableTimelineField)) {
      throw new Error("Quyền tiến độ chứa editable_fields không hợp lệ");
    }
    if (seen.has(field)) {
      throw new Error("Quyền tiến độ chứa editable_fields trùng nhau");
    }
    seen.add(field);
    fields.push(field as EditableTimelineField);
  }

  /* A schedule-only row cannot make any progress field visible. Treat it as
   * malformed so a malformed/old RPC payload cannot expose a phantom item. */
  if (!fields.some((field) => PROGRESS_FIELD_SET.has(field))) {
    throw new Error("Quyền tiến độ không có field cập nhật tiến độ");
  }
  return fields;
}

function normalizeRight(value: unknown, context: string): EditableProgressRight {
  const row = objectValue(value, context);
  const validationCode = nonEmptyString(row.validationCode, "validationCode");
  const reason = nonEmptyString(row.reason, "reason");
  return {
    validationCode,
    editableFields: editableFields(row.editableFields),
    reason,
  };
}

/** Giải mã JSON RPC `{ ok: true, rights: [...] }`, fail-closed khi sai hợp đồng. */
export function parseEditableProgressRights(payload: unknown): EditableProgressRight[] {
  const body = objectValue(payload, "Payload quyền tiến độ");
  if (body.ok !== true) throw new Error("Payload quyền tiến độ không thành công");
  if (!Array.isArray(body.rights)) throw new Error("Payload quyền tiến độ thiếu rights");

  const seen = new Set<string>();
  return body.rights.map((value, index) => {
    const row = objectValue(value, `Dòng quyền tiến độ ${index + 1}`) as RawProgressRight;
    const validationCode = nonEmptyString(row.validation_code, "validation_code");
    if (seen.has(validationCode)) {
      throw new Error("Payload quyền tiến độ chứa mã hạng mục trùng nhau");
    }
    seen.add(validationCode);
    return normalizeRight({
      validationCode,
      editableFields: row.editable_fields,
      reason: row.view_reason,
    }, `Dòng quyền tiến độ ${index + 1}`);
  });
}

/** Lập chỉ mục theo mã hạng mục; mã trùng luôn bị từ chối để tránh chọn quyền mơ hồ. */
export function indexEditableProgressRights(
  rows: readonly EditableProgressRight[],
): ReadonlyMap<string, EditableProgressRight> {
  const index = new Map<string, EditableProgressRight>();
  for (const [position, row] of rows.entries()) {
    const right = normalizeRight(row, `Dòng quyền tiến độ ${position + 1}`);
    if (index.has(right.validationCode)) {
      throw new Error("Tập quyền tiến độ chứa mã hạng mục trùng nhau");
    }
    index.set(right.validationCode, right);
  }
  return index;
}

export function progressValidationCode(activity: {
  id: string;
  validationCode?: unknown;
  code?: unknown;
}): string {
  for (const value of [activity.validationCode, activity.code, activity.id]) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

export function filterEditableProgressActivities<T extends {
  id: string;
  validationCode?: unknown;
  code?: unknown;
}>(
  activities: readonly T[],
  rights: ReadonlyMap<string, EditableProgressRight>,
): T[] {
  return activities.filter((activity) => rights.has(progressValidationCode(activity)));
}

/** Chia các field được cấp quyền thành bốn bước hiển thị của modal. */
export function visibleProgressStageFields(
  editableFields: readonly EditableTimelineField[] | readonly string[],
): VisibleProgressStageFields {
  const allowed = new Set(editableFields);
  const fields = (names: readonly EditableTimelineField[]): EditableTimelineField[] =>
    names.filter((field) => allowed.has(field));

  return {
    protocol: fields(["actual_protocol_date", "status_protocol"]),
    validation: fields(["actual_validation_date", "status_validation"]),
    report: fields(["actual_report_date", "status_report"]),
    vmp: fields(["actual_vmp_date", "status_vmp"]),
  };
}
