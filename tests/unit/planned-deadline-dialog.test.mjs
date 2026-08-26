import test from "node:test"; import assert from "node:assert/strict"; import { createPlannedDeadlineCoordinator } from "../../src/features/timeline/plannedDeadlineEditModel.ts";
test("coordinator khóa mutation thứ hai",async()=>{const c=createPlannedDeadlineCoordinator();const a=c.run(async()=>1);assert.equal(await c.run(async()=>2),null);assert.equal(await a,1)});
