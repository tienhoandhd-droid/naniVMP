import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("static render LoginScreen không nạp Supabase SDK", () => {
  const script = [
    'import React from "react";',
    'import { renderToStaticMarkup } from "react-dom/server";',
    'const { default: LoginScreen } = await import("./src/components/auth/LoginScreen.tsx");',
    'renderToStaticMarkup(React.createElement(LoginScreen, { onLogin: () => {} }));',
  ].join("\n");
  const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", script], {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stderr, /Node\.js 18 and below are deprecated/);
});
