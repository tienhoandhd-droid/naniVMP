import { useCallback, useEffect, useRef, useState } from "react";
import { listSourceWorkshopCoverage } from "./api.ts";
import {
  initialWorkshopCoverageState, reduceWorkshopCoverage, workshopCoverageRequestIsCurrent,
  type WorkshopCoverageState,
} from "./workshopScopeModel.ts";

const SEARCH_DEBOUNCE_MS = 250;

/** Browser state for the manager-only, paged workshop directory. */
export function useSourceWorkshopCoverage() {
  const [state, setState] = useState<WorkshopCoverageState>(initialWorkshopCoverageState);
  const [query, setQuery] = useState("");
  const requestId = useRef(0);
  const generation = useRef(0);
  const mounted = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current += 1;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const load = useCallback(async ({ search, append }: { search: string; append: boolean }) => {
    const requestGeneration = generation.current;
    const id = ++requestId.current;
    const cursor = append ? state.nextCursor : null;
    setState((previous) => reduceWorkshopCoverage(previous, { type: "start", requestId: id, search, append }));
    const result = await listSourceWorkshopCoverage({ search, cursor, limit: 25 });
    if (!mounted.current || !workshopCoverageRequestIsCurrent({ generation: generation.current }, { generation: requestGeneration })) return;
    setState((previous) => reduceWorkshopCoverage(previous, { type: "resolve", requestId: id, result, append }));
  }, [state.nextCursor]);

  useEffect(() => { void load({ search: "", append: false }); }, []); // Initial page is independent of later cursor state.

  const search = useCallback((value: string) => {
    setQuery(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      generation.current += 1;
      void load({ search: value.trim(), append: false });
    }, SEARCH_DEBOUNCE_MS);
  }, [load]);

  const refresh = useCallback(() => {
    generation.current += 1;
    void load({ search: state.search, append: false });
  }, [load, state.search]);

  const loadMore = useCallback(() => {
    if (state.status !== "ready" || !state.nextCursor) return;
    void load({ search: state.search, append: true });
  }, [load, state.nextCursor, state.search, state.status]);

  return { state, query, search, refresh, loadMore, setState };
}
