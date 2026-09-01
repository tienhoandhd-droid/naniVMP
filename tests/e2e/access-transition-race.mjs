import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createConnection } from "node:net";
import puppeteer from "puppeteer-core";

import { CHROME } from "./chrome-path.mjs";
import { choServer } from "./cho-server.mjs";

const PORT = 4178;
const ORIGIN = `http://127.0.0.1:${PORT}`;
/* Windows: .cmd phải chạy qua shell (Node >=20 chặn spawn EINVAL),
   và detached tạo process group kiểu POSIX không tồn tại trên Win. */
const server = spawn("npm", ["run", "dev", "--", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"], {
  stdio: "ignore",
  detached: process.platform !== "win32",
  shell: process.platform === "win32",
});

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isPortOpen = () => new Promise((resolve) => {
  const socket = createConnection({ host: "127.0.0.1", port: PORT });
  let settled = false;
  const finish = (open) => {
    if (settled) return;
    settled = true;
    socket.destroy();
    resolve(open);
  };
  socket.setTimeout(250, () => finish(false));
  socket.once("connect", () => finish(true));
  socket.once("error", () => finish(false));
});

async function waitForPortClosed({ timeoutMs = 5000, intervalMs = 50 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    if (!(await isPortOpen())) return;
    await delay(intervalMs);
  }
  throw new Error(`Vite vẫn giữ cổng ${PORT} sau ${timeoutMs}ms`);
}

function waitForChildExit(child, timeoutMs = 5000) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`npm dev không thoát sau ${timeoutMs}ms`)), timeoutMs);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

const waitFrame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
const payload = (role) => ({
  ok: true, mode: "preview", business_role: role, screens: {
    overview: { can_view: true, data_scope: "all", actions: ["view"] },
  },
});

let browser;
try {
  await choServer(ORIGIN);
  browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.goto(ORIGIN, { waitUntil: "domcontentloaded" });

  await page.evaluate(async () => {
    const React = (await import("/node_modules/.vite/deps/react.js")).default;
    const ReactDomClient = await import("/node_modules/.vite/deps/react-dom_client.js");
    const createRoot = ReactDomClient.createRoot || ReactDomClient.default?.createRoot;
    const { useAccess, useAccessCacheTransition } = await import("/src/hooks/useAccess.ts");
    const { loadSnapshot, saveSnapshot } = await import("/src/lib/snapshotCache.ts");

    const deferred = [];
    const fetchAccess = () => new Promise((resolve, reject) => deferred.push({ resolve, reject }));
    const userA = { uid: "same-user", role: "admin", accessClass: "broad" };
    const userB = { uid: "same-user", role: "department_user", accessClass: "workshop_staff" };
    saveSnapshot(2026, userA.uid, "preview", 7, [], [{ code: "TB-BROAD", id: "broad", name: "Dữ liệu rộng" }]);
    localStorage.setItem("vmp_cache", JSON.stringify({ data: { activities: [{ code: "TB-BROAD" }] }, ts: Date.now() }));

    const mount = document.createElement("div");
    document.body.replaceChildren(mount);
    const root = createRoot(mount);
    const state = { deferred, userA, userB, root, current: null };
    state.saveSnapshot = saveSnapshot;
    window.__accessRace = state;

    function Probe({ user }) {
      const access = useAccess(user, fetchAccess);
      useAccessCacheTransition(user, access);
      state.current = access;
      if (access.dangTai || access.loi || !access.access.businessRole) {
        return React.createElement("output", { id: "state" }, `locked:${access.dangTai}:${access.loi || ""}`);
      }
      const snapshot = loadSnapshot(2026, user.uid, "preview", 7);
      return React.createElement("output", { id: "state" }, `protected:${snapshot?.activities[0]?.code || "none"}:${access.access.businessRole}`);
    }

    state.render = (user) => root.render(React.createElement(Probe, { user }));
    state.render(userA);
  });

  await page.waitForFunction(() => window.__accessRace.deferred.length === 1);
  await page.evaluate(() => window.__accessRace.deferred[0].resolve({ trangThai: "co", payload: {
    ok: true, mode: "preview", business_role: "admin", screens: { overview: { can_view: true, data_scope: "all", actions: ["view"] } },
  }}));
  await page.waitForFunction(() => document.querySelector("#state")?.textContent === "protected:TB-BROAD:admin");

  await page.evaluate(() => window.__accessRace.current.taiLai());
  await page.waitForFunction(() => window.__accessRace.deferred.length === 2);
  await page.evaluate(() => window.__accessRace.render(window.__accessRace.userB));
  await page.waitForFunction(() => window.__accessRace.deferred.length === 3);
  await page.waitForFunction(() => document.querySelector("#state")?.textContent?.startsWith("locked:true:"));
  assert.deepEqual(await page.evaluate(() => ({
    snapshot: localStorage.getItem("vmp_snapshot_v3"), cache: localStorage.getItem("vmp_cache"),
  })), { snapshot: null, cache: null }, "đổi tuple cùng UID phải dọn cache trước khi shell được mở lại");

  await page.evaluate(() => window.__accessRace.deferred[1].resolve({ trangThai: "co", payload: {
    ok: true, mode: "preview", business_role: "admin", screens: { overview: { can_view: true, data_scope: "all", actions: ["view"] } },
  }}));
  await page.evaluate(waitFrame);
  assert.deepEqual(await page.evaluate(() => ({
    businessRole: window.__accessRace.current.access.businessRole,
    loi: window.__accessRace.current.loi,
    dangTai: window.__accessRace.current.dangTai,
  })), { businessRole: null, loi: null, dangTai: true },
  "thành công/finally muộn của A không được ghi role hoặc đổi loading của B");

  await page.evaluate(() => window.__accessRace.deferred[2].reject(new Error("B bị từ chối")));
  await page.waitForFunction(() => document.querySelector("#state")?.textContent === "locked:false:B bị từ chối");
  await page.evaluate(() => window.__accessRace.current.taiLai());
  await page.waitForFunction(() => window.__accessRace.deferred.length === 4);
  await page.evaluate(() => window.__accessRace.deferred[3].resolve({ trangThai: "co", payload: {
    ok: true, mode: "preview", business_role: "workshop_staff", screens: { overview: { can_view: true, data_scope: "workshop", actions: ["view"] } },
  }}));
  await page.waitForFunction(() => document.querySelector("#state")?.textContent === "protected:none:workshop_staff");

  await page.evaluate(() => window.__accessRace.render(window.__accessRace.userA));
  await page.waitForFunction(() => window.__accessRace.deferred.length === 5);
  await page.evaluate(() => window.__accessRace.deferred[4].resolve({ trangThai: "co", payload: {
    ok: true, mode: "preview", business_role: "admin", screens: { overview: { can_view: true, data_scope: "all", actions: ["view"] } },
  }}));
  await page.waitForFunction(() => document.querySelector("#state")?.textContent === "protected:none:admin");
  await page.evaluate(() => window.__accessRace.current.taiLai());
  await page.waitForFunction(() => window.__accessRace.deferred.length === 6);
  await page.evaluate(() => window.__accessRace.render(window.__accessRace.userB));
  await page.waitForFunction(() => window.__accessRace.deferred.length === 7);
  await page.evaluate(() => window.__accessRace.deferred[5].reject(new Error("A bị từ chối muộn")));
  await page.evaluate(waitFrame);
  assert.deepEqual(await page.evaluate(() => ({
    businessRole: window.__accessRace.current.access.businessRole,
    loi: window.__accessRace.current.loi,
    dangTai: window.__accessRace.current.dangTai,
  })), { businessRole: null, loi: null, dangTai: true },
  "lỗi/finally muộn của A không được ghi error/role hoặc hạ loading của B");
  await page.evaluate(() => window.__accessRace.deferred[6].resolve({ trangThai: "co", payload: {
    ok: true, mode: "preview", business_role: "workshop_staff", screens: { overview: { can_view: true, data_scope: "workshop", actions: ["view"] } },
  }}));
  await page.waitForFunction(() => document.querySelector("#state")?.textContent === "protected:none:workshop_staff");

  await page.evaluate(() => {
    const { userB, saveSnapshot } = window.__accessRace;
    saveSnapshot(2026, userB.uid, "preview", 7, [], [{ code: "TB-CUNG-TUPLE", id: "same", name: "Bản chụp cùng tuple" }]);
    window.__accessRace.current.taiLai();
  });
  await page.waitForFunction(() => window.__accessRace.deferred.length === 8);
  await page.evaluate(() => window.__accessRace.deferred[7].resolve({ trangThai: "co", payload: {
    ok: true, mode: "preview", business_role: "workshop_staff", screens: { overview: { can_view: true, data_scope: "workshop", actions: ["view"] } },
  }}));
  await page.waitForFunction(() => document.querySelector("#state")?.textContent === "protected:TB-CUNG-TUPLE:workshop_staff");

  await page.evaluate(() => {
    const { userB, saveSnapshot } = window.__accessRace;
    saveSnapshot(2026, userB.uid, "preview", 7, [], [{ code: "TB-LOI", id: "error", name: "Bản chụp trước lỗi" }]);
    localStorage.setItem("vmp_cache", JSON.stringify({ data: { activities: [{ code: "TB-LOI" }] }, ts: Date.now() }));
    window.__accessRace.current.taiLai();
  });
  await page.waitForFunction(() => window.__accessRace.deferred.length === 9);
  await page.evaluate(() => window.__accessRace.deferred[8].reject(new Error("RPC quyền lỗi")));
  await page.waitForFunction(() => document.querySelector("#state")?.textContent === "locked:false:RPC quyền lỗi");
  assert.deepEqual(await page.evaluate(() => ({
    snapshot: localStorage.getItem("vmp_snapshot_v3"), cache: localStorage.getItem("vmp_cache"),
  })), { snapshot: null, cache: null }, "lỗi RPC quyền cũng phải dọn cả snapshot và cache legacy");

  await page.evaluate(() => window.__accessRace.root.unmount());
  console.log("access transition race: pass");
} finally {
  await browser?.close();
  if (!Number.isInteger(server.pid) || server.pid <= 0) {
    throw new Error("npm dev không có PID hợp lệ để dọn process group");
  }
  if (server.exitCode === null && server.signalCode === null) {
    try {
      if (process.platform === "win32") {
        /* Windows không có process group âm; taskkill /T hạ cả cây con. */
        const { execSync } = await import("node:child_process");
        execSync(`taskkill /PID ${server.pid} /T /F`, { stdio: "ignore" });
        /* npm.cmd chạy qua shell có thể không phát event `exit` dù taskkill
           đã hạ cả cây. Cổng đóng là bằng chứng dọn thật; unref handle cha
           để Node không treo vì một event Windows không đến. */
        await waitForPortClosed();
        server.unref();
      } else {
        const stopped = waitForChildExit(server);
        process.kill(-server.pid, "SIGTERM");
        await stopped;
      }
    } catch (error) {
      if (error?.code !== "ESRCH") {
        throw error;
      }
    }
  }
  await waitForPortClosed();
}
