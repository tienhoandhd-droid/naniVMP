import assert from "node:assert/strict";
import test from "node:test";
import {
  createOrganicSwimState, importanceScale, stepOrganicSwim,
} from "../../src/features/monitoring/organicSwimModel.ts";

const fish = (id, crit = "TB", stage = "carp", placement = { xPct: 40, yPct: 52, rotateDeg: 0, scale: 1 }) => ({
  activity: { id, crit, st: "prog" }, stage, placement,
});
const angularDistance = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

test("importance follows assembled criticality before source aliases, is monotonic, and leaves missing neutral", () => {
  assert.ok(importanceScale({ criticality: "low" }) < importanceScale({ criticality: "medium" }));
  assert.ok(importanceScale({ criticality: "medium" }) < importanceScale({ criticality: "high" }));
  assert.equal(importanceScale({ criticality: "low", crit: "Cao" }), importanceScale({ criticality: "low" }));
  assert.equal(importanceScale({}), 1);
  assert.ok(importanceScale({ grade: 1 }) < importanceScale({ grade: 9 }));
});

test("fish travel visibly through the pond on distinct, bounded trajectories", () => {
  const input = [fish("a"), fish("b"), fish("c", "Cao")];
  const original = structuredClone(input);
  const state = createOrganicSwimState(input, { seed: 42 });
  const travel = new Map(state.agents.map((agent) => [agent.id, 0]));
  for (let tick = 0; tick < 8 * 30; tick += 1) {
    const prior = new Map(state.agents.map((agent) => [agent.id, { x: agent.x, y: agent.y }]));
    stepOrganicSwim(state, 1 / 30);
    state.agents.forEach((agent) => {
      const point = prior.get(agent.id);
      travel.set(agent.id, travel.get(agent.id) + Math.hypot(agent.x - point.x, agent.y - point.y));
    });
  }
  assert.deepEqual(input, original, "the source records are presentation read-only");
  for (const agent of state.agents) {
    assert.ok(travel.get(agent.id) >= 3, `${agent.id} travels more than a tiny bob`);
    assert.ok(agent.x >= 5 && agent.x <= 95 && agent.y >= 18 && agent.y <= 89, `${agent.id} remains inside sprite-safe pond bounds`);
  }
  assert.equal(new Set(state.agents.map((agent) => `${agent.x.toFixed(1)},${agent.y.toFixed(1)}`)).size, state.agents.length);
});

test("local simulation keeps turns and speeds finite at dense 150-fish scale", () => {
  const state = createOrganicSwimState(Array.from({ length: 150 }, (_, index) => fish(
    `f-${index}`, index % 3 === 0 ? "Cao" : index % 3 === 1 ? "TB" : "Thấp", index % 2 ? "carp" : "koi",
    { xPct: 6 + (index * 17) % 88, yPct: 19 + (index * 11) % 69, rotateDeg: 0, scale: .62 },
  )), { seed: 7 });
  for (let tick = 0; tick < 20 * 30; tick += 1) {
    const turns = new Map(state.agents.map((agent) => [agent.id, agent.turn]));
    stepOrganicSwim(state, 1 / 30);
    for (const agent of state.agents) {
      assert.ok(Number.isFinite(agent.x) && Number.isFinite(agent.y) && Number.isFinite(agent.vx) && Number.isFinite(agent.vy));
      assert.ok(Math.hypot(agent.vx, agent.vy) <= 6, "speed remains bounded");
      assert.ok(angularDistance(agent.turn, turns.get(agent.id)) <= 65 / 30 + .001, "heading changes smoothly per frame");
      assert.ok(agent.x >= 5 && agent.x <= 95 && agent.y >= 18 && agent.y <= 89);
    }
  }
});

test("seeded personalities visit all organic behaviors while an aimed fish alone freezes", () => {
  const state = createOrganicSwimState(Array.from({ length: 24 }, (_, index) => fish(`same-species-${index}`, "TB", "carp")), { seed: 19 });
  const aimed = state.agents[0];
  const before = { x: aimed.x, y: aimed.y, turn: aimed.turn };
  const behaviors = new Set();
  for (let tick = 0; tick < 40 * 30; tick += 1) {
    stepOrganicSwim(state, 1 / 30, new Set([aimed.id]));
    state.agents.forEach((agent) => behaviors.add(agent.behavior));
  }
  assert.deepEqual({ x: aimed.x, y: aimed.y, turn: aimed.turn }, before);
  assert.equal(behaviors.size, 5, "wander, school, pursuit, flower visits and rest all occur");
  assert.ok(state.agents.some((agent) => agent.id !== aimed.id && Math.hypot(agent.x - agent.homeX, agent.y - agent.homeY) >= 3));
  assert.ok(new Set(state.agents.map((agent) => `${agent.personality.toFixed(3)}:${agent.vx.toFixed(2)}`)).size > 12,
    "identical species retain individual pace and trajectories");
});

test("long-running headings stay normalized and continue to follow travel direction", () => {
  const state = createOrganicSwimState(Array.from({ length: 30 }, (_, index) => fish(
    `long-${index}`, "TB", "carp", { xPct: 10 + (index * 13) % 80, yPct: 25 + (index * 7) % 55, rotateDeg: 0, scale: .8 },
  )), { seed: 22 });
  for (let tick = 0; tick < 18_000; tick += 1) {
    stepOrganicSwim(state, 1 / 30);
    for (const agent of state.agents) {
      const velocityHeading = Math.atan2(agent.vy, agent.vx) * 180 / Math.PI;
      assert.ok(agent.turn >= -180 && agent.turn < 180, "persistent heading is normalized");
      assert.ok(angularDistance(agent.turn, velocityHeading) <= 70, "art heading continues to follow movement");
    }
  }
});
