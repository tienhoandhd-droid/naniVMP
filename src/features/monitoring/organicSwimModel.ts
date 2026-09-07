import type { Activity } from "../../types/domain.ts";

export type OrganicBehavior = "wander" | "school" | "pursue" | "flower" | "rest";

export interface OrganicSwimInput {
  activity: Pick<Activity, "id" | "crit" | "criticality" | "score"> & { grade?: number | string };
  stage: string;
  placement: { xPct: number; yPct: number; rotateDeg: number; scale: number };
}

export interface OrganicSwimAgent {
  id: string;
  stage: string;
  x: number; y: number; vx: number; vy: number;
  homeX: number; homeY: number;
  scale: number; personality: number;
  behavior: OrganicBehavior; behaviorUntil: number;
  targetId: string | null; flowerIndex: number;
  turn: number; phase: number;
}

export interface OrganicSwimState { agents: OrganicSwimAgent[]; time: number; random: number; }

// Water-side approach points beside the painted lotuses: upper-right flower
// bed and lower-left bed, never the painted banks themselves.
const FLOWERS = [{ x: 70, y: 37 }, { x: 78, y: 39 }, { x: 29, y: 66 }, { x: 32, y: 76 }];
// Keep the 54×44px hit/sprite wrapper inside the smallest 312×156px pond.
const MIN_X = 10; const MAX_X = 90; const MIN_Y = 18; const MAX_Y = 82;
const WATER = { x: 52, y: 55, radiusX: 42, radiusY: 32 };

function random(state: OrganicSwimState): number {
  let next = state.random | 0;
  next ^= next << 13; next ^= next >>> 17; next ^= next << 5;
  state.random = next >>> 0;
  return state.random / 0x1_0000_0000;
}

function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) h = Math.imul(h ^ value.charCodeAt(i), 16777619);
  return h >>> 0;
}

function criticality(activity: OrganicSwimInput["activity"]): number {
  // `criticality` is the assembled Activity value.  `crit` is its legacy/source
  // counterpart and `score`/`grade` are only the source fallback when no label
  // made it through the adapter.
  const value = String(activity.criticality ?? activity.crit ?? "").trim().toLocaleLowerCase("vi");
  if (value.includes("cao") || value === "high") return 2;
  if (value.includes("thấp") || value.includes("thap") || value === "low") return 0;
  if (value.includes("tb") || value.includes("trung") || value === "medium") return 1;
  const rawScore = activity.score ?? activity.grade;
  const score = rawScore === null || rawScore === undefined || rawScore === "" ? Number.NaN : Number(rawScore);
  if (Number.isFinite(score)) return score >= 7 ? 2 : score <= 3 ? 0 : 1;
  return 1;
}

/** Visual importance follows Source criticality only; deadlines and the random
 * seed have no role in size. Missing importance stays at the neutral scale. */
export function importanceScale(activity: OrganicSwimInput["activity"]): number {
  return [.86, 1, 1.14][criticality(activity)];
}

export function createOrganicSwimState(inputs: readonly OrganicSwimInput[], { seed = Date.now() }: { seed?: number } = {}): OrganicSwimState {
  const state: OrganicSwimState = { agents: [], time: 0, random: (seed >>> 0) || 1 };
  state.agents = [...inputs].sort((a, b) => String(a.activity.id).localeCompare(String(b.activity.id), "en"))
    .map((input) => {
      const id = String(input.activity.id);
      const local = (hash(id) ^ state.random) >>> 0;
      const angle = (local / 0xffff_ffff) * Math.PI * 2;
      const personality = .72 + ((local >>> 12) & 1023) / 1023 * .62;
      const behavior: OrganicBehavior[] = ["wander", "school", "flower", "rest", "pursue"];
      const vx = Math.cos(angle) * (1.8 + personality);
      const vy = Math.sin(angle) * (1.2 + personality * .5);
      return {
        id, stage: input.stage, x: input.placement.xPct, y: input.placement.yPct,
        homeX: input.placement.xPct, homeY: input.placement.yPct,
        vx, vy,
        scale: input.placement.scale * importanceScale(input.activity), personality,
        behavior: behavior[local % behavior.length], behaviorUntil: 1.4 + ((local >>> 22) & 1023) / 1023 * 3.8,
        targetId: null, flowerIndex: (local >>> 5) % FLOWERS.length,
        turn: Math.atan2(vy, vx) * 180 / Math.PI, phase: (local >>> 2) % 17,
      };
    });
  return state;
}

function limit(x: number, y: number, max: number): [number, number] {
  const length = Math.hypot(x, y);
  return length > max ? [x / length * max, y / length * max] : [x, y];
}

function normalizeAngle(degrees: number): number {
  return ((degrees + 180) % 360 + 360) % 360 - 180;
}

function chooseBehavior(state: OrganicSwimState, agent: OrganicSwimAgent): void {
  const roll = random(state);
  agent.behavior = roll < .34 ? "wander" : roll < .58 ? "school" : roll < .72 ? "flower" : roll < .87 ? "rest" : "pursue";
  agent.behaviorUntil = state.time + 2.2 + random(state) * 4.6;
  agent.targetId = null;
  agent.flowerIndex = Math.floor(random(state) * FLOWERS.length);
}

function spatialIndex(agents: readonly OrganicSwimAgent[]): Map<string, OrganicSwimAgent[]> {
  const grid = new Map<string, OrganicSwimAgent[]>();
  for (const agent of agents) {
    const key = `${Math.floor(agent.x / 16)}:${Math.floor(agent.y / 16)}`;
    const group = grid.get(key) ?? []; group.push(agent); grid.set(key, group);
  }
  return grid;
}

function neighbors(agent: OrganicSwimAgent, grid: Map<string, OrganicSwimAgent[]>): OrganicSwimAgent[] {
  const cx = Math.floor(agent.x / 16); const cy = Math.floor(agent.y / 16);
  const close: OrganicSwimAgent[] = [];
  for (let x = cx - 1; x <= cx + 1 && close.length < 12; x += 1) for (let y = cy - 1; y <= cy + 1 && close.length < 12; y += 1) {
    for (const other of grid.get(`${x}:${y}`) ?? []) {
      if (other !== agent && Math.hypot(other.x - agent.x, other.y - agent.y) < 22) close.push(other);
      if (close.length >= 12) break;
    }
  }
  return close;
}

/** Advances a bounded, locally interacting pond.  The caller supplies frozen
 * fish so pointer/focus inspection pauses one fish without stopping the pond. */
export function stepOrganicSwim(state: OrganicSwimState, seconds: number, frozen = new Set<string>()): void {
  const dt = Math.max(0, Math.min(seconds, 1 / 12));
  if (!dt) return;
  state.time += dt;
  const grid = spatialIndex(state.agents);
  for (const agent of state.agents) {
    if (frozen.has(agent.id)) continue;
    if (state.time >= agent.behaviorUntil) chooseBehavior(state, agent);
    const near = neighbors(agent, grid);
    let ax = 0; let ay = 0;
    // Separation is always local; alignment/cohesion are a soft invitation,
    // so schools form and dissolve rather than locking into a knot.
    for (const other of near) {
      const dx = agent.x - other.x; const dy = agent.y - other.y; const d = Math.hypot(dx, dy) || .01;
      if (d < 9) { ax += dx / d * (9 - d) * .42; ay += dy / d * (9 - d) * .42; }
    }
    if (near.length && (agent.behavior === "school" || agent.behavior === "pursue")) {
      const peers = near.filter((other) => other.stage === agent.stage).slice(0, 6);
      if (peers.length) {
        const average = peers.reduce((sum, other) => ({ x: sum.x + other.x, y: sum.y + other.y, vx: sum.vx + other.vx, vy: sum.vy + other.vy }), { x: 0, y: 0, vx: 0, vy: 0 });
        ax += (average.x / peers.length - agent.x) * .045 + (average.vx / peers.length - agent.vx) * .14;
        ay += (average.y / peers.length - agent.y) * .045 + (average.vy / peers.length - agent.vy) * .14;
      }
    }
    if (agent.behavior === "flower" || agent.behavior === "rest") {
      const flower = FLOWERS[agent.flowerIndex];
      ax += (flower.x - agent.x) * (agent.behavior === "rest" ? .022 : .052);
      ay += (flower.y - agent.y) * (agent.behavior === "rest" ? .022 : .052);
    } else if (agent.behavior === "pursue" && near.length) {
      // A short chase has one target. Reacquiring only after it leaves the
      // local pond keeps the gesture readable rather than frame-to-frame jitter.
      let target = near.find((other) => other.id === agent.targetId);
      if (!target) {
        target = near[Math.floor(random(state) * near.length)];
        agent.targetId = target.id;
      }
      ax += (target.x - agent.x) * .07; ay += (target.y - agent.y) * .07;
    } else {
      ax += Math.cos(state.time * .7 * agent.personality + agent.phase) * .12;
      ay += Math.sin(state.time * .55 * agent.personality + agent.phase * .61) * .10;
      ax += (agent.homeX - agent.x) * .01; ay += (agent.homeY - agent.y) * .01;
    }
    if (agent.x < MIN_X + 4) ax += (MIN_X + 4 - agent.x) * .34;
    if (agent.x > MAX_X - 4) ax -= (agent.x - (MAX_X - 4)) * .34;
    if (agent.y < MIN_Y + 4) ay += (MIN_Y + 4 - agent.y) * .34;
    if (agent.y > MAX_Y - 4) ay -= (agent.y - (MAX_Y - 4)) * .34;
    // The painted water is an open, curved basin. This soft field turns fish
    // back from mountains and lotus banks without a hard perimeter bounce.
    const pondX = (agent.x - WATER.x) / WATER.radiusX;
    const pondY = (agent.y - WATER.y) / WATER.radiusY;
    const pondDistance = Math.hypot(pondX, pondY);
    if (pondDistance > .82) {
      ax += -pondX * (pondDistance - .82) * 1.9;
      ay += -pondY * (pondDistance - .82) * 1.9;
    }
    const [limitedX, limitedY] = limit(ax, ay, 3.1 * agent.personality);
    agent.vx += limitedX * dt; agent.vy += limitedY * dt;
    const desiredMaxSpeed = (agent.behavior === "rest" ? 1.35 : 4.4) * agent.personality;
    const currentSpeed = Math.hypot(agent.vx, agent.vy);
    // Rest slows a fish over several frames; it never teleports velocity down
    // merely because a timed behavior changed.
    const maxSpeed = agent.behavior === "rest" && currentSpeed > desiredMaxSpeed
      ? Math.max(desiredMaxSpeed, currentSpeed - 2.4 * agent.personality * dt)
      : desiredMaxSpeed;
    [agent.vx, agent.vy] = limit(agent.vx, agent.vy, maxSpeed);
    // Limit the velocity itself, not only the painted heading. The fish then
    // follows a smooth course instead of visually turning while sliding away.
    const speed = Math.hypot(agent.vx, agent.vy);
    const desiredHeading = Math.atan2(agent.vy, agent.vx) * 180 / Math.PI;
    const turnDelta = normalizeAngle(desiredHeading - agent.turn);
    agent.turn = normalizeAngle(agent.turn + Math.max(-65 * dt, Math.min(65 * dt, turnDelta)));
    const headingRadians = agent.turn * Math.PI / 180;
    agent.vx = Math.cos(headingRadians) * speed;
    agent.vy = Math.sin(headingRadians) * speed;
    agent.x = Math.max(MIN_X, Math.min(MAX_X, agent.x + agent.vx * dt));
    agent.y = Math.max(MIN_Y, Math.min(MAX_Y, agent.y + agent.vy * dt));
  }
}
