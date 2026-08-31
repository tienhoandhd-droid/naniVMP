import test from "node:test";
import assert from "node:assert/strict";

import { docUrl, vietUrl, withTabInHash } from "../../src/lib/urlState.ts";
import { nextTabIndex } from "../../src/components/ui/NhomTab.tsx";

test("tab quản trị đi cùng URL và không làm mất bộ lọc", () => {
  const state = docUrl("#v=phanquyen&dept=qa&tab=email");
  assert.equal(state.tab, "email");
  assert.equal(vietUrl(state), "v=phanquyen&dept=qa&tab=email");
  assert.equal(withTabInHash("#v=phanquyen&dept=qa", "quyen-toi"),
    "v=phanquyen&dept=qa&tab=quyen-toi");
});

test("tab URL lạ bị loại bỏ và thay tab vẫn giữ các khóa còn lại", () => {
  assert.equal(docUrl("#v=health&tab=%3Cscript%3E").tab, "");
  assert.equal(withTabInHash("#v=health&period=over&tab=client", "server"),
    "v=health&period=over&tab=server");
});

test("bàn phím tab hỗ trợ mũi tên, Home và End", () => {
  assert.equal(nextTabIndex("ArrowRight", 3, 4), 0);
  assert.equal(nextTabIndex("ArrowLeft", 0, 4), 3);
  assert.equal(nextTabIndex("Home", 2, 4), 0);
  assert.equal(nextTabIndex("End", 1, 4), 3);
  assert.equal(nextTabIndex("Enter", 1, 4), null);
});
