import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listSourceQaCandidates } from "./api.ts";
import {
  initialSourceQaCandidatesState, reduceSourceQaCandidates,
  type SourceQaCandidatesState,
} from "./sourceAccessModel.ts";

const SEARCH_DEBOUNCE_MS = 250;

export function useSourceQaCandidates(currentIds: readonly string[]) {
  const includeIds = useMemo(
    () => [...new Set(currentIds.filter(Boolean))].sort(),
    [currentIds.join("\u0000")],
  );
  const includeKey = includeIds.join("\u0000");
  const [state, setState] = useState<SourceQaCandidatesState>(() => initialSourceQaCandidatesState(includeIds));
  const requestId = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
    mounted.current = false;
    if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const load = useCallback(async ({ search, append }: { search: string; append: boolean }) => {
    const id = ++requestId.current;
    setState((previous) => reduceSourceQaCandidates(previous, { type: "start", requestId: id, search, append }));
    const cursor = append ? state.nextCursor : null;
    const result = await listSourceQaCandidates({ search, cursor, limit: 25, includeIds });
    if (!mounted.current) return;
    setState((previous) => reduceSourceQaCandidates(previous, { type: "resolve", requestId: id, result, append }));
  }, [includeKey, state.nextCursor]);

  useEffect(() => {
    void load({ search: "", append: false });
  }, [includeKey]); // load intentionally changes as pagination state changes; IDs define a fresh directory scope.

  const search = useCallback((value: string) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void load({ search: value.trim(), append: false }); }, SEARCH_DEBOUNCE_MS);
  }, [load]);

  const retry = useCallback(() => { void load({ search: state.search, append: false }); }, [load, state.search]);
  const loadMore = useCallback(() => {
    if (state.status !== "ready" || !state.nextCursor) return;
    void load({ search: state.search, append: true });
  }, [load, state.nextCursor, state.search, state.status]);

  return { state, search, retry, loadMore };
}
