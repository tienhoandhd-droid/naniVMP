import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const {
  canUsePersonalTodayScope,
  defaultTodayPersonScope,
  presentTodayPersonScope,
} = await import("../../src/features/today/todayPersonScope.ts");
const { TodayScopeControl } = await import("../../src/features/today/TodayScopeControl.tsx");

const render = (props) => renderToStaticMarkup(
  React.createElement(TodayScopeControl, props),
);

function findElement(node, predicate) {
  if (!React.isValidElement(node)) return null;
  if (predicate(node)) return node;
  for (const child of React.Children.toArray(node.props.children)) {
    const found = findElement(child, predicate);
    if (found) return found;
  }
  return null;
}

test("defaults Today person scope from QA staff role and linked person", () => {
  const cases = [
    ["qa_staff", "person-a", "mine"],
    ["qa_manager", "person-a", "team"],
    ["admin", "person-a", "team"],
    ["qa_staff", null, "team"],
    [null, "person-a", "team"],
  ];

  for (const [businessRole, currentPersonId, expected] of cases) {
    assert.equal(defaultTodayPersonScope(businessRole, currentPersonId), expected);
  }
});

test("recognizes a usable linked person ID", () => {
  assert.equal(canUsePersonalTodayScope(" person-a "), true);
  assert.equal(canUsePersonalTodayScope(""), false);
});

test("presents Today scope labels and unlinked-account warning", () => {
  assert.deepEqual(presentTodayPersonScope("mine", "person-a"), {
    heading: "Việc hôm nay của tôi", actionLabel: "Xem việc cả đội", warning: null,
  });
  assert.deepEqual(presentTodayPersonScope("team", null), {
    heading: "Việc hôm nay của cả đội",
    actionLabel: "Chỉ xem việc của tôi",
    warning: "Tài khoản chưa liên kết nhân sự; nhờ Admin nối hồ sơ.",
  });
});

test("renders an accessible Today scope control and warns when the account is unlinked", () => {
  const mine = render({ scope: "mine", currentPersonId: "person-a", onChange: () => {} });
  assert.match(mine, /<div class="timeline-scope-inline" aria-label="Phạm vi việc hôm nay">/);
  assert.match(mine, /<button[^>]*type="button"[^>]*class="timeline-scope-btn"[^>]*aria-label="Xem việc cả đội"[^>]*aria-pressed="true"[^>]*>Xem việc cả đội<\/button>/);
  assert.equal((mine.match(/<button\b/g) || []).length, 1);

  const team = render({ scope: "team", currentPersonId: "person-a", onChange: () => {} });
  assert.match(team, /<button[^>]*type="button"[^>]*class="timeline-scope-btn"[^>]*aria-label="Chỉ xem việc của tôi"[^>]*aria-pressed="false"[^>]*>Chỉ xem việc của tôi<\/button>/);

  const unlinked = render({ scope: "team", currentPersonId: null, onChange: () => {} });
  assert.match(unlinked, /disabled/);
  assert.match(unlinked, /<div class="timeline-scope-hint" role="status">/);
  assert.match(unlinked, /nhờ Admin nối hồ sơ/);
});

test("scope control changes mine and team exactly once per activation", () => {
  for (const [scope, expected] of [["mine", "team"], ["team", "mine"]]) {
    const calls = [];
    const tree = TodayScopeControl({
      scope, currentPersonId: "person-a", onChange: (nextScope) => calls.push(nextScope),
    });
    const button = findElement(tree, (element) => element.type === "button");
    assert.ok(button, "scope control must expose its button callback");
    button.props.onClick();
    assert.deepEqual(calls, [expected]);
  }
});
