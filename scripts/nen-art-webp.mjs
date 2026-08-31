/* Chuyển tranh PNG của Ngư đồ sang WebP (giữ alpha, giữ kích thước).
 * Timeline đang tải 3.7MB PNG mỗi lần cache lạnh — WebP ~85% nhẹ hơn.
 * Cách dùng: node scripts/nen-art-webp.mjs public/art/monitoring/x.png [q]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { CHROME } from "../tests/e2e/chrome-path.mjs";

const files = process.argv.slice(2).filter((a) => a.endsWith(".png"));
const q = Number(process.argv.find((a) => /^0\.\d+$/.test(a)) || 0.82);
const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage();

for (const rel of files) {
  const path = fileURLToPath(new URL(`../${rel}`, import.meta.url));
  const goc = readFileSync(path);
  const url = await page.evaluate(async (src, quality) => {
    const img = new Image();
    await new Promise((ok, err) => { img.onload = ok; img.onerror = err; img.src = src; });
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext("2d").drawImage(img, 0, 0);
    return canvas.toDataURL("image/webp", quality);
  }, `data:image/png;base64,${goc.toString("base64")}`, q);
  const out = path.replace(/\.png$/, ".webp");
  const moi = Buffer.from(url.split(",")[1], "base64");
  writeFileSync(out, moi);
  console.log(`${rel}: ${(goc.length / 1024).toFixed(0)}KB → ${(moi.length / 1024).toFixed(0)}KB webp (q=${q})`);
}
await browser.close();
