import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabaseClient.ts";

export type QualificationSystem = "steam" | "air" | "nitrogen";
export type QualificationAccessStatus = "loading" | "ready" | "error" | "unavailable";

const SYSTEMS: readonly QualificationSystem[] = ["steam", "air", "nitrogen"];

/** Converts the server's least-privilege context into menu visibility only.
 * The frame/RPC remains the authority for every record action. */
export function qualificationAccessFromContext(context: unknown): QualificationSystem[] {
  if (!context || typeof context !== "object") return [];
  const raw = context as { can_view?: unknown; systems?: unknown };
  if (raw.can_view !== true || !raw.systems || typeof raw.systems !== "object") return [];
  const systems = raw.systems as Record<string, { can_view_current?: unknown; can_view_archive?: unknown }>;
  return SYSTEMS.filter((system) => {
    const access = systems[system];
    return access?.can_view_current === true || access?.can_view_archive === true;
  });
}

type QualificationAccess = {
  status: QualificationAccessStatus;
  systems: QualificationSystem[];
  error: string | null;
  retry: () => void;
};

type QualificationAccessState = Omit<QualificationAccess, "retry">;

/** Serializes permission refreshes. A context response is useful only while
 * it belongs to the newest request for this mounted shell. */
export class QualificationAccessController {
  #epoch = 0;
  state: QualificationAccessState = { status: "loading", systems: [], error: null };

  begin(): number {
    this.#epoch += 1;
    this.state = { ...this.state, status: "loading", error: null };
    return this.#epoch;
  }

  /** Supersede an in-flight response without taking down an already-authorized
   * shell during a same-actor token refresh. */
  supersede(): void {
    this.#epoch += 1;
  }

  commitReady(epoch: number, systems: QualificationSystem[]): boolean {
    if (epoch !== this.#epoch) return false;
    this.state = { status: "ready", systems, error: null };
    return true;
  }

  commitError(epoch: number, error: string): boolean {
    if (epoch !== this.#epoch) return false;
    this.state = { status: "error", systems: [], error };
    return true;
  }

  invalidate(): void {
    this.#epoch += 1;
    this.state = { status: "loading", systems: [], error: null };
  }
}

type AuthIdentity = { actor: string; token: string };

/** Only a real identity loss/change revokes visible shell access immediately.
 * Token refreshes for the same actor still supersede old RPC responses. */
export function qualificationAuthEventRequiresRevoke(
  previous: AuthIdentity | null,
  next: AuthIdentity | null,
  hasVisibleAuthority: boolean,
): boolean {
  if (!next?.actor) return previous !== null || hasVisibleAuthority;
  if (previous?.actor) return previous.actor !== next.actor;
  return hasVisibleAuthority;
}

export function useQualificationAccess(): QualificationAccess {
  const controller = useRef(new QualificationAccessController());
  const mounted = useRef(true);
  const identity = useRef<AuthIdentity | null>(null);
  const [state, setState] = useState<QualificationAccessState>({
    status: supabase ? "loading" : "unavailable", systems: [], error: null,
  });
  const [attempt, setAttempt] = useState(0);

  const refresh = useCallback(async () => {
    const request = controller.current.begin();
    if (mounted.current) setState(controller.current.state);
    if (!supabase) {
      if (controller.current.commitError(request, "Chưa cấu hình kết nối thẩm định.") && mounted.current) {
        setState({ status: "unavailable", systems: [], error: "Chưa cấu hình kết nối thẩm định." });
      }
      return;
    }
    try {
      const before = await supabase.auth.getSession();
      const session = before.data.session;
      const actor = session?.user?.id;
      const token = session?.access_token;
      if (before.error || !actor || !token) throw new Error("Phiên đăng nhập không còn hợp lệ.");
      const response = await supabase.rpc("cpc1_context" as never);
      const after = await supabase.auth.getSession();
      const verified = after.data.session;
      if (response.error || after.error || verified?.user?.id !== actor || verified.access_token !== token) {
        throw new Error("Quyền thẩm định đã thay đổi; hãy thử lại.");
      }
      if (controller.current.commitReady(request, qualificationAccessFromContext(response.data)) && mounted.current) {
        identity.current = { actor, token };
        setState(controller.current.state);
      }
    } catch {
      const error = "Không xác minh được quyền Thẩm định thực tế. Thử lại để tải menu.";
      if (controller.current.commitError(request, error) && mounted.current) setState(controller.current.state);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted.current) return;
      const next = session?.user?.id && session.access_token
        ? { actor: session.user.id, token: session.access_token } : null;
      if (qualificationAuthEventRequiresRevoke(identity.current, next, controller.current.state.systems.length > 0)) {
        identity.current = next;
        controller.current.invalidate();
        setState(controller.current.state);
      } else {
        controller.current.supersede();
      }
      queueMicrotask(() => {
        if (mounted.current) void refresh();
      });
    });
    const onFocus = () => { void refresh(); };
    const onOnline = () => { void refresh(); };
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);
    return () => {
      mounted.current = false;
      identity.current = null;
      controller.current.invalidate();
      data.subscription.unsubscribe();
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
    };
  }, [refresh, attempt]);

  return { ...state, retry: () => setAttempt((value) => value + 1) };
}
