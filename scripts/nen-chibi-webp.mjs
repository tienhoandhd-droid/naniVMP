/* Nén lại webp vượt ngân sách brand (≤80KB) — giữ nguyên kích thước
 * điểm ảnh, chỉ hạ quality qua canvas Chrome. Dùng một lần rồi có thể
 * chạy lại bất cứ khi nào thêm ảnh chibi mới. */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { CHROME } from "../tests/e2e/chrome-path.mjs";

const FILES = process.argv.slice(2);
if (!FILES.length) {
  console.error("Cách dùng: node scripts/nen-chibi-webp.mjs <file.webp> [...]");
  process.exit(2);
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage();

for (const rel of FILES) {
  const path = fileURLToPath(new URL(`../${rel}`, import.meta.url));
  const goc = readFileSync(path);
  const dataUrl = `data:image/webp;base64,${goc.toString("base64")}`;
  // Hạ dần quality tới khi lọt 80KB; dừng ở 0.5 để không nát ảnh.
  const out = await page.evaluate(async (src) => {
    const img = new Image();
    await new Promise((ok, err) => { img.onload = ok; img.onerror = err; img.src = src; });
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    /* Hạ quality trước; nếu 0.5 vẫn vượt thì thu kích thước 8%/bậc —
       chibi hiển thị ≤150px CSS nên giảm vài phần trăm không ai thấy. */
    for (let scale = 1; scale >= 0.6; scale -= 0.08) {
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      const c2 = canvas.getContext("2d");
      c2.clearRect(0, 0, canvas.width, canvas.height);
      c2.drawImage(img, 0, 0, canvas.width, canvas.height);
      for (let q = 0.86; q >= 0.5; q -= 0.06) {
        const url = canvas.toDataURL("image/webp", q);
        if ((url.length - 22) * 3 / 4 <= 78 * 1024) return { url, q, scale };
      }
    }
    return { url: canvas.toDataURL("image/webp", 0.5), q: 0.5, scale: 0.6 };
  }, dataUrl);
  const moi = Buffer.from(out.url.split(",")[1], "base64");
  writeFileSync(path, moi);
  console.log(`${rel}: ${(goc.length / 1024).toFixed(1)}KB → ${(moi.length / 1024).toFixed(1)}KB (q=${out.q.toFixed(2)})`);
}
await browser.close();
