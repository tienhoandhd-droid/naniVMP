import test from "node:test";
import assert from "node:assert/strict";

import {
  countProgressAdvancedFilters,
  isDetailedProgressFix,
} from "../../src/features/progress/progressFilterUi.ts";

const defaults = {
  fix: "all",
  status: "all",
  stage: "all",
  period: "all",
  showStopped: false,
};

test("advanced filter count ignores search-adjacent quick fixes", () => {
  assert.equal(countProgressAdvancedFilters(defaults), 0);
  assert.equal(countProgressAdvancedFilters({ ...defaults, fix: "can_xu_ly" }), 0);
  assert.equal(countProgressAdvancedFilters({ ...defaults, fix: "qua_han" }), 0);
});

test("advanced filter count includes each non-default advanced dimension once", () => {
  assert.equal(countProgressAdvancedFilters({
    fix: "no_deadline",
    status: "prog",
    stage: "protocol",
    period: "year",
    showStopped: true,
  }), 5);
});

test("only detailed issue fixes require the advanced panel", () => {
  assert.equal(isDetailedProgressFix("done_no_date"), true);
  assert.equal(isDetailedProgressFix("no_deadline"), true);
  assert.equal(isDetailedProgressFix("no_owner"), true);
  assert.equal(isDetailedProgressFix("mismatch"), true);
  assert.equal(isDetailedProgressFix("can_xu_ly"), false);
  assert.equal(isDetailedProgressFix("qua_han"), false);
  assert.equal(isDetailedProgressFix("all"), false);
});
