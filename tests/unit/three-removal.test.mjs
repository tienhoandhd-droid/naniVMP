import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));

test("runtime đã gỡ hoàn toàn stack bản đồ 3D không còn sử dụng", () => {
  const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
  for (const dependency of ["three", "@react-three/fiber", "@react-three/drei", "@types/three"]) {
    assert.equal(pkg.dependencies?.[dependency] ?? pkg.devDependencies?.[dependency], undefined,
      `${dependency} must not remain installed`);
  }
  assert.equal(existsSync(`${root}src/components/three`), false);
  assert.equal(existsSync(`${root}src/lib/lotus3dColors.ts`), false);
  assert.equal(existsSync(`${root}src/components/dashboard/BanDoNhiet.tsx`), false);
});
