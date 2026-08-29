import { useCallback, useEffect, useRef, useState } from "react";
import type { BusinessRole } from "../../lib/businessRoles.ts";
import { supabase } from "../../lib/supabaseClient.ts";
import {
  TeamOverviewRequestGate,
  decodeTeamOverviewSummary,
  shouldRequestTeamOverviewSummary,
  teamOverviewRequestKey,
  type TeamOverviewSummary,
} from "./teamOverviewSummary.ts";

export interface TeamOverviewSummaryState {
  status: "idle" | "loading" | "ready" | "error";
  data: TeamOverviewSummary | null;
  error: string | null;
  retry: () => void;
}

interface StoredState {
  key: string;
  status: TeamOverviewSummaryState["status"];
  data: TeamOverviewSummary | null;
  error: string | null;
}

export function useTeamOverviewSummary({
  identity,
  businessRole,
  canViewOverview,
  year,
}: {
  identity: string;
  businessRole: BusinessRole | null;
  canViewOverview: boolean;
  year: number;
}): TeamOverviewSummaryState {
  const permitted = shouldRequestTeamOverviewSummary(businessRole, canViewOverview);
  const key = teamOverviewRequestKey({ identity, businessRole, canViewOverview, year });
  const gate = useRef(new TeamOverviewRequestGate());
  const [attempt, setAttempt] = useState(0);
  const [stored, setStored] = useState<StoredState>({
    key: "", status: "idle", data: null, error: null,
  });

  gate.current.ensureKey(key);

  useEffect(() => {
    const generation = gate.current.begin(key);
    if (!permitted) {
      setStored({ key, status: "idle", data: null, error: null });
      return () => gate.current.invalidate(generation);
    }

    setStored({ key, status: "loading", data: null, error: null });
    void (async () => {
      try {
        if (!supabase) throw new Error("Chưa cấu hình kết nối Supabase.");
        const { data, error } = await supabase.rpc(
          "rpc_team_overview_summary" as never,
          { p_year: year } as never,
        );
        if (!gate.current.isCurrent(generation)) return;
        if (error) throw error;
        const decoded = decodeTeamOverviewSummary(data);
        if (!decoded.ok) throw new Error(decoded.error);
        setStored({ key, status: "ready", data: decoded.data, error: null });
      } catch (error) {
        if (!gate.current.isCurrent(generation)) return;
        setStored({
          key,
          status: "error",
          data: null,
          error: error instanceof Error ? error.message : "Không tải được tiến độ cả nhóm.",
        });
      }
    })();
    return () => gate.current.invalidate(generation);
  }, [attempt, key, permitted, year]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  if (!permitted) return { status: "idle", data: null, error: null, retry };
  if (stored.key !== key) return { status: "loading", data: null, error: null, retry };
  return { status: stored.status, data: stored.data, error: stored.error, retry };
}
