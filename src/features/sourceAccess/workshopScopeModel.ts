import type {
  SourceWorkshopCoverageFailure, SourceWorkshopCoveragePerson, SourceWorkshopCoverageResult,
  SourceWorkshopCoverageCursor, WorkshopScopeGrant,
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

export function workshopCoverageRequestIsCurrent(
  current: WorkshopCoverageRequestFence,
  request: WorkshopCoverageRequestFence,
): boolean {
  return current.generation === request.generation;
}

export function initialWorkshopCoverageState(): WorkshopCoverageState {
  return { status: "idle", activeRequestId: 0, search: "", rows: [], authorizedTotal: 0, nextCursor: null, error: null };
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
  if (!action.result.ok) return { ...state, status: "error", error: action.result };
  return {
    ...state,
    status: "ready",
    rows: action.append ? mergeByPersonId(state.rows, action.result.rows) : action.result.rows,
    authorizedTotal: action.result.authorizedTotal,
    nextCursor: action.result.nextCursor,
    error: null,
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
