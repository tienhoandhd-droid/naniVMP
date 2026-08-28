import type {
  IncludedSourceQaCandidate, SourceQaCandidate, SourceQaCandidatesFailure,
  SourceQaCandidatesResult, SourceQaCandidateCursor,
} from "./contracts.ts";

export type SourceQaCandidatesStatus = "idle" | "loading" | "ready" | "error";

export interface SourceQaCandidatesState {
  status: SourceQaCandidatesStatus;
  activeRequestId: number;
  search: string;
  rows: SourceQaCandidate[];
  includedCurrent: IncludedSourceQaCandidate[];
  authorizedTotal: number;
  nextCursor: SourceQaCandidateCursor | null;
  error: SourceQaCandidatesFailure | null;
}

export type SourceQaCandidatesAction =
  | { type: "start"; requestId: number; search: string; append: boolean }
  | { type: "resolve"; requestId: number; result: SourceQaCandidatesResult; append: boolean };

export function initialSourceQaCandidatesState(_includeIds: readonly string[]): SourceQaCandidatesState {
  return {
    status: "idle", activeRequestId: 0, search: "", rows: [], includedCurrent: [],
    authorizedTotal: 0, nextCursor: null, error: null,
  };
}

function mergeByPersonId<T extends { personId: string }>(existing: readonly T[], next: readonly T[]): T[] {
  const byId = new Map(existing.map((person) => [person.personId, person]));
  next.forEach((person) => byId.set(person.personId, person));
  return [...byId.values()];
}

/** Reducer is intentionally pure so an older browser response cannot overwrite a newer request. */
export function reduceSourceQaCandidates(
  state: SourceQaCandidatesState,
  action: SourceQaCandidatesAction,
): SourceQaCandidatesState {
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
    return { ...state, status: "error", error: action.result };
  }
  return {
    ...state,
    status: "ready",
    rows: action.append ? mergeByPersonId(state.rows, action.result.rows) : action.result.rows,
    includedCurrent: action.result.includedCurrent,
    authorizedTotal: action.result.authorizedTotal,
    nextCursor: action.result.nextCursor,
    error: null,
  };
}
