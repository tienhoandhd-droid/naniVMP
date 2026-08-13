import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";
import { createServer } from "vite";
import { CHROME } from "./chrome-path.mjs";

const server = await createServer({ server: { host: "127.0.0.1", port: 4175 } });
await server.listen();
const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });

try {
  const page = await browser.newPage();
  await page.goto("http://127.0.0.1:4175/", { waitUntil: "domcontentloaded" });
  await page.evaluate(async () => {
    const ReactModule = await import("/@id/react");
    const React = ReactModule.default || ReactModule;
    const ReactDomModule = await import("/@id/react-dom/client");
    const createRoot = ReactDomModule.createRoot || ReactDomModule.default?.createRoot;
    const { ThreeFallbackBoundary } = await import("/src/components/three/ThreeFallbackBoundary.tsx");
    const mount = document.createElement("div");
    mount.id = "three-boundary-fixture";
    document.body.append(mount);
    const ThrowingChild = () => { throw new Error("WebGL fixture"); };
    createRoot(mount).render(React.createElement(ThreeFallbackBoundary, {
      onUse2D: () => { mount.dataset.used2d = "yes"; },
    }, React.createElement(ThrowingChild)));
  });
  await page.waitForSelector("#three-boundary-fixture [role=alert]");
  assert.equal(await page.$eval("#three-boundary-fixture", (el) => el.dataset.used2d || ""), "");
  await page.click("#three-boundary-fixture button");
  assert.equal(await page.$eval("#three-boundary-fixture", (el) => el.dataset.used2d), "yes");
} finally {
  await browser.close();
  await server.close();
}
