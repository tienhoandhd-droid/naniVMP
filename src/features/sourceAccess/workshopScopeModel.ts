import type {
  SourceWorkshopCoverageFailure, SourceWorkshopCoveragePerson, SourceWorkshopCoverageResult,
  SourceWorkshopCoverageCursor, SourceWorkshopScopeChoicesCursor, SourceWorkshopScopeChoicesFailure,
  SourceWorkshopScopeChoicesResult, SourceWorkshopScopeChoice, WorkshopScopeGrant,
} from "./contracts.ts";

export type WorkshopCoverageStatus = "idle" | "loading" | "ready" | "error";

export interface WorkshopCoverageState {
  status: WorkshopCoverageStatus;
  activeRequestId: number;
  search: string;
  rows: SourceWorkshopCoveragePerson[];
  authorizedTotal: number;
  nextCursor: SourceWorkshopCoverageCursor | null;
  error: SourceWorkshopCoverageFailure | null;
}

export type WorkshopCoverageAction =
  | { type: "start"; requestId: number; search: string; append: boolean }
  | { type: "resolve"; requestId: number; result: SourceWorkshopCoverageResult; append: boolean };

export interface WorkshopCoverageRequestFence { generation: number }

export interface WorkshopScopeChoicesState {
  status: WorkshopCoverageStatus;
  activeRequestId: number;
  rows: SourceWorkshopScopeChoice[];
  nextCursor: SourceWorkshopScopeChoicesCursor | null;
  error: Pick<SourceWorkshopScopeChoicesFailure, "errorCode" | "error"> | null;
}

export type WorkshopScopeChoicesAction =
  | { type: "start"; requestId: number; append: boolean }
  | { type: "resolve"; requestId: number; result: SourceWorkshopScopeChoicesResult; append: boolean };

export interface WorkshopScopeEditorState {
  editingGrantId: string | null;
  department: string;
  areaCode: string;
  line: string;
  reason: string;
}

export function workshopCoverageRequestIsCurrent(
  current: WorkshopCoverageRequestFence,
  request: WorkshopCoverageRequestFence,
): boolean {
  return current.generation === request.generation;
}

export function initialWorkshopCoverageState(): WorkshopCoverageState {
  return { status: "idle", activeRequestId: 0, search: "", rows: [], authorizedTotal: 0, nextCursor: null, error: null };
}

export function initialWorkshopScopeChoicesState(): WorkshopScopeChoicesState {
  return { status: "idle", activeRequestId: 0, rows: [], nextCursor: null, error: null };
}

/** A person change, cancel, or unsafe mutation error must not reuse its reason. */
export function clearWorkshopScopeEditor(_previous: WorkshopScopeEditorState): WorkshopScopeEditorState {
  return { editingGrantId: null, department: "", areaCode: "", line: "", reason: "" };
}

function mergeByPersonId(
  current: readonly SourceWorkshopCoveragePerson[], next: readonly SourceWorkshopCoveragePerson[],
): SourceWorkshopCoveragePerson[] {
  const byPersonId = new Map(current.map((person) => [person.personId, person]));
  next.forEach((person) => byPersonId.set(person.personId, person));
  return [...byPersonId.values()];
}

/** Ignore an older result after search, retry, pagination reset, or unmount fence changes. */
export function reduceWorkshopCoverage(
  state: WorkshopCoverageState,
  action: WorkshopCoverageAction,
): WorkshopCoverageState {
  if (action.type === "start") {
    return {
      ...state,
      status: "loading",
      activeRequestId: action.requestId,
      search: action.search,
      rows: action.append ? state.rows : [],
      nextCursor: action.append ? state.nextCursor : null,
      error: null,
    };
  }
  if (action.requestId !== state.activeRequestId) return state;
  if (!action.result.ok) {
    if (action.result.errorCode === "FORBIDDEN") {
      return { ...state, status: "error", rows: [], authorizedTotal: 0, nextCursor: null, error: action.result };
    }
    return { ...state, status: "error", error: action.result };
  }
  return {
    ...state,
    status: "ready",
    rows: action.append ? mergeByPersonId(state.rows, action.result.rows) : action.result.rows,
    authorizedTotal: action.result.authorizedTotal,
    nextCursor: action.result.nextCursor,
    error: null,
  };
}

function mergeChoices(
  current: readonly SourceWorkshopScopeChoice[], next: readonly SourceWorkshopScopeChoice[],
): SourceWorkshopScopeChoice[] {
  const byTuple = new Map(current.map((choice) => [`${choice.department}\u0000${choice.areaCode}\u0000${choice.line ?? ""}`, choice]));
  next.forEach((choice) => byTuple.set(`${choice.department}\u0000${choice.areaCode}\u0000${choice.line ?? ""}`, choice));
  return [...byTuple.values()];
}

/** Choice tuples are protected data too: deny clears their previous page. */
export function reduceWorkshopScopeChoices(
  state: WorkshopScopeChoicesState,
  action: WorkshopScopeChoicesAction,
): WorkshopScopeChoicesState {
  if (action.type === "start") {
    return {
      ...state, status: "loading", activeRequestId: action.requestId,
      rows: action.append ? state.rows : [], nextCursor: action.append ? state.nextCursor : null, error: null,
    };
  }
  if (action.requestId !== state.activeRequestId) return state;
  if (!action.result.ok) {
    const error = { errorCode: action.result.errorCode, error: action.result.error };
    if (action.result.errorCode === "FORBIDDEN") {
      return { ...state, status: "error", rows: [], nextCursor: null, error };
    }
    return { ...state, status: "error", error };
  }
  return {
    ...state, status: "ready",
    rows: action.append ? mergeChoices(state.rows, action.result.rows) : action.result.rows,
    nextCursor: action.result.nextCursor, error: null,
  };
}

/** Update one local card immediately, then let the following server page refresh be authoritative. */
export function applyOptimisticWorkshopScopeGrant(
  rows: readonly SourceWorkshopCoveragePerson[],
  change: { personId: string; grant: WorkshopScopeGrant },
): SourceWorkshopCoveragePerson[] {
  return rows.map((person) => person.personId !== change.personId ? person : {
    ...person,
    grants: person.grants.some((grant) => grant.id === change.grant.id)
      ? person.grants.map((grant) => grant.id === change.grant.id ? change.grant : grant)
      : [...person.grants, change.grant],
  });
}
