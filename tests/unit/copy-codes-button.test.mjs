import assert from "node:assert/strict";
import test from "node:test";

import { copyTextToClipboard } from "../../src/components/ui/CopyCodesButton.tsx";

test("copyTextToClipboard reports a completed clipboard write", async () => {
  const writes = [];
  const result = await copyTextToClipboard("PQ-001, PQ-002", {
    writeText: async (text) => { writes.push(text); },
  });

  assert.deepEqual(writes, ["PQ-001, PQ-002"]);
  assert.deepEqual(result, { ok: true });
});

test("copyTextToClipboard gives manual-copy feedback when the permission is denied", async () => {
  const result = await copyTextToClipboard("PQ-001", {
    writeText: async () => { throw new DOMException("Denied", "NotAllowedError"); },
  });

  assert.deepEqual(result, { ok: false, message: "Không sao chép được. Hãy chọn và sao chép thủ công." });
});

test("copyTextToClipboard gives manual-copy feedback when Clipboard API is absent", async () => {
  const result = await copyTextToClipboard("PQ-001", undefined);

  assert.deepEqual(result, { ok: false, message: "Không sao chép được. Hãy chọn và sao chép thủ công." });
});
