import { useCallback, useEffect, useRef, type RefObject } from "react";
import {
  createOrganicSwimState,
  stepOrganicSwim,
  type OrganicSwimInput,
} from "./organicSwimModel.ts";

interface OrganicSwimOptions {
  active: boolean;
  canvas: RefObject<HTMLElement | null>;
  fish: readonly OrganicSwimInput[];
}

function sessionSeed(): number {
  const values = new Uint32Array(1);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(values);
    return values[0] || 1;
  }
  return (Date.now() ^ Math.floor(Math.random() * 0xffff_ffff)) >>> 0;
}

/**
 * Keeps the pond outside React's render loop. Position is always written as a
 * transform delta from the stable presentation placement, which avoids layout
 * work and preserves date-view coordinates when the mode is changed.
 */
export function useOrganicSwim({ active, canvas, fish }: OrganicSwimOptions) {
  const nodes = useRef(new Map<string, { position?: HTMLElement; heading?: HTMLElement }>());
  const frozen = useRef(new Map<string, Set<"pointer" | "focus">>());
  const state = useRef<ReturnType<typeof createOrganicSwimState> | null>(null);
  const stateInputKey = useRef<string | null>(null);
  const bounds = useRef<DOMRect | undefined>(undefined);
  const paintRef = useRef<() => void>(() => {});
  const inputKey = fish.map(({ activity, stage, placement }) => `${activity.id}:${stage}:${placement.xPct}:${placement.yPct}`).join("|");

  const registerFish = useCallback((id: string, node: HTMLElement | null) => {
    const current = nodes.current.get(id) ?? {};
    if (node) nodes.current.set(id, { ...current, position: node });
    else if (current.heading) nodes.current.set(id, { heading: current.heading });
    else nodes.current.delete(id);
  }, []);
  const registerHeading = useCallback((id: string, node: HTMLElement | null) => {
    const current = nodes.current.get(id) ?? {};
    if (node) nodes.current.set(id, { ...current, heading: node });
    else if (current.position) nodes.current.set(id, { position: current.position });
    else nodes.current.delete(id);
  }, []);
  const setFishFrozen = useCallback((id: string, source: "pointer" | "focus", isFrozen: boolean) => {
    const sources = frozen.current.get(id) ?? new Set<"pointer" | "focus">();
    if (isFrozen) sources.add(source);
    else sources.delete(source);
    if (sources.size) frozen.current.set(id, sources);
    else frozen.current.delete(id);
  }, []);

  useEffect(() => {
    if (fish.length) return;
    // Date mode owns declarative base positions. Remove organic deltas before
    // it becomes visible again.
    nodes.current.forEach(({ position, heading }) => {
      position?.style.removeProperty("transform");
      heading?.style.removeProperty("transform");
    });
    state.current = null;
    stateInputKey.current = null;
    frozen.current.clear();
  }, [fish.length]);

  // This observer deliberately remains while paused. It reprojects the
  // already-paused normalized pond into the new canvas size without waking a
  // frame loop, so orientation/containment survive a resize.
  useEffect(() => {
    if (!fish.length || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      bounds.current = canvas.current?.getBoundingClientRect();
      paintRef.current();
    });
    if (canvas.current) observer.observe(canvas.current);
    return () => observer.disconnect();
  }, [canvas, fish.length]);

  useEffect(() => {
    if (!fish.length || typeof window === "undefined") return;
    if (!state.current || stateInputKey.current !== inputKey) {
      state.current = createOrganicSwimState(fish, { seed: sessionSeed() });
      stateInputKey.current = inputKey;
    }
    const swim = state.current;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let lastStep = performance.now();
    let running = false;
    const refreshBounds = () => { bounds.current = canvas.current?.getBoundingClientRect(); };
    const paint = () => {
      if (!bounds.current || !bounds.current.width || !bounds.current.height) return;
      for (const agent of swim.agents) {
        const node = nodes.current.get(agent.id);
        if (!node?.position || !node.heading) continue;
        const x = ((agent.x - agent.homeX) / 100 * bounds.current.width).toFixed(2);
        const y = ((agent.y - agent.homeY) / 100 * bounds.current.height).toFixed(2);
        node.position.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
        // Atlas fish are side-on and face right. Mirror a leftward course and
        // use only a modest tilt for vertical travel, never a belly-up sprite.
        // The painting is 2:1, so normalize the logical x/y heading into its
        // actual pixel aspect before choosing the upright side-profile pose.
        const logicalHeading = agent.turn * Math.PI / 180;
        const heading = Math.atan2(Math.sin(logicalHeading), 2 * Math.cos(logicalHeading));
        node.heading.style.transform = `rotate(${(Math.sin(heading) * 18).toFixed(2)}deg) scaleX(${Math.cos(heading) < 0 ? -1 : 1})`;
      }
    };
    paintRef.current = paint;
    // A filter/scope change can happen while paused. Reconcile its fresh
    // state immediately; only the RAF itself is conditional on `active`.
    refreshBounds();
    paint();
    const tick = (now: number) => {
      if (!running) return;
      if (now - lastStep >= 1000 / 30) {
        stepOrganicSwim(swim, Math.min((now - lastStep) / 1000, 1 / 12), new Set(frozen.current.keys()));
        lastStep = now;
        paint();
      }
      frame = window.requestAnimationFrame(tick);
    };
    const start = () => {
      if (running || media.matches) return;
      running = true;
      lastStep = performance.now();
      refreshBounds();
      paint();
      frame = window.requestAnimationFrame(tick);
    };
    const stop = () => {
      running = false;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
    };
    const onMotionPreference = () => { if (media.matches || !active) stop(); else start(); };
    media.addEventListener("change", onMotionPreference);
    if (active) start();
    return () => {
      stop();
      media.removeEventListener("change", onMotionPreference);
    };
  }, [active, canvas, inputKey]);

  return { registerFish, registerHeading, setFishFrozen };
}
