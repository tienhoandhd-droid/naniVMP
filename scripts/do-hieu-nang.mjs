/* Đo hiệu năng bản build production qua preview + mock Supabase.
 * Cho từng màn: thời gian tới DOMContentLoaded, tổng tài nguyên đã tải,
 * top tài nguyên nặng, số DOM node, long tasks. Chạy: node scripts/do-hieu-nang.mjs */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { CHROME } from "../tests/e2e/chrome-path.mjs";
import { caiGiaLap, nhetPhien } from "../tests/e2e/gia-lap-supabase.mjs";

const GOC = process.env.VMP_E2E_URL || "http://127.0.0.1:4173/";
const URL_SB = readFileSync(fileURLToPath(new URL("../.env.local", import.meta.url)), "utf8")
  .match(/^VITE_SUPABASE_URL=(.+)$/m)[1].trim();

/* Chỉ đo các route desktop có ngân sách riêng. Timeline/Long Môn nằm ngoài
 * phạm vi Task 6 nên không được điều hướng hay đo trong lab này. */
const MAN = ["reports", "alerts", "progress", "source", "workload", "rules", "phanquyen"];
const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });

for (const man of MAN) {
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(() => {
    window.__vmpMaxLongTask = 0;
    new PerformanceObserver((entries) => {
      for (const entry of entries.getEntries()) {
        window.__vmpMaxLongTask = Math.max(window.__vmpMaxLongTask, entry.duration);
      }
    }).observe({ type: "longtask", buffered: true });
  });
  await caiGiaLap(page, { supabaseUrl: URL_SB, kichBan: "day" });
  await nhetPhien(page, { supabaseUrl: URL_SB });
  await page.setViewport({ width: 1366, height: 768 });
  const t0 = Date.now();
  await page.goto(`${GOC}#v=${man}`, { waitUntil: "networkidle0", timeout: 45_000 });
  const wall = Date.now() - t0;
  const m = await page.evaluate(() => {
    const res = performance.getEntriesByType("resource");
    const nav = performance.getEntriesByType("navigation")[0];
    const byType = {};
    for (const r of res) {
      const k = r.name.split("?")[0].split(".").pop().slice(0, 5);
      byType[k] = (byType[k] || 0) + (r.transferSize || r.encodedBodySize || 0);
    }
    const top = res
      .map((r) => ({ n: r.name.split("/").pop().slice(0, 44), kb: Math.round((r.transferSize || r.encodedBodySize || 0) / 1024) }))
      .sort((a, b) => b.kb - a.kb).slice(0, 4);
    return {
      dcl: Math.round(nav?.domContentLoadedEventEnd || 0),
      tongKB: Math.round(res.reduce((s, r) => s + (r.transferSize || r.encodedBodySize || 0), 0) / 1024),
      soRes: res.length,
      domNodes: document.querySelectorAll("*").length,
      maxLongTask: Math.round(window.__vmpMaxLongTask || 0),
      top,
    };
  });
  console.log(`${man.padEnd(9)} wall=${wall}ms dcl=${m.dcl}ms tai=${m.tongKB}KB/${m.soRes}res dom=${m.domNodes} long=${m.maxLongTask}ms`);
  console.log(`          top: ${m.top.map((t) => `${t.n}=${t.kb}KB`).join(" · ")}`);
  await page.close();
}
await browser.close();
