import test from "node:test";
import assert from "node:assert/strict";

class MemoryStorage {
  #data = new Map();

  get length() { return this.#data.size; }
  key(index) { return [...this.#data.keys()][index] ?? null; }
  getItem(key) { return this.#data.get(String(key)) ?? null; }
  setItem(key, value) { this.#data.set(String(key), String(value)); }
  removeItem(key) { this.#data.delete(String(key)); }
  clear() { this.#data.clear(); }
}

const activity = { id: "VMP-01", code: "TB-01", name: "Thiết bị 01" };
const object = { code: "TB-01", name: "Thiết bị 01" };

test.beforeEach(() => {
  globalThis.localStorage = new MemoryStorage();
});

test.afterEach(() => {
  delete globalThis.localStorage;
});

test("snapshot preview chỉ mở lại cho đúng người đã lưu", async () => {
  const { loadSnapshot, saveSnapshot } = await import("../../src/lib/snapshotCache.ts");

  saveSnapshot(2026, "user-a", "preview", [object], [activity]);

  const loaded = loadSnapshot(2026, "user-a", "preview");
  assert.deepEqual(loaded?.objects, [object]);
  assert.deepEqual(loaded?.activities, [activity]);
  assert.equal(typeof loaded?.at, "number");
  assert.equal(loadSnapshot(2026, "user-b", "preview"), null);
});

test("enforced không lưu hoặc nạp snapshot và xóa bản preview đang có", async () => {
  const { loadSnapshot, saveSnapshot } = await import("../../src/lib/snapshotCache.ts");

  saveSnapshot(2026, "user-a", "preview", [object], [activity]);
  saveSnapshot(2026, "user-a", "enforced", [object], [activity]);

  assert.equal(loadSnapshot(2026, "user-a", "enforced"), null);
  assert.equal(loadSnapshot(2026, "user-a", "preview"), null);
  assert.equal(localStorage.length, 0);
});

test("cache phiên bản cũ bị dọn để không giữ dữ liệu trước khi có phân quyền", async () => {
  const { clearSnapshot } = await import("../../src/lib/snapshotCache.ts");
  localStorage.setItem("vmp_snapshot_v1", JSON.stringify({ activities: [activity] }));

  clearSnapshot();

  assert.equal(localStorage.getItem("vmp_snapshot_v1"), null);
});

test("policy đọc dữ liệu fail-closed và bỏ watermark khi đang enforced", async () => {
  const { permissionDataPolicy } = await import("../../src/lib/snapshotCache.ts");

  assert.deepEqual(permissionDataPolicy("preview", "preview"), {
    allowSnapshot: true,
    allowLegacyFallback: true,
    bypassWatermark: false,
    revokeBeforeFetch: false,
  });
  assert.deepEqual(permissionDataPolicy("enforced", "preview"), {
    allowSnapshot: false,
    allowLegacyFallback: false,
    bypassWatermark: true,
    revokeBeforeFetch: true,
  });
  assert.equal(permissionDataPolicy("enforced", "enforced").bypassWatermark, true);
});
