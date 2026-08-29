import assert from "node:assert/strict";
import test from "node:test";

import { dungVongNam } from "../../src/components/dashboard/VongNam.tsx";

test("vòng năm marks the Bangkok current month supplied by its parent calculation", () => {
  const bands = dungVongNam([], 2099, "2099-01-01");

  assert.equal(bands[0].dangChay, true);
  assert.equal(bands[0].daQua, false);
  assert.equal(bands[11].dangChay, false);
});
