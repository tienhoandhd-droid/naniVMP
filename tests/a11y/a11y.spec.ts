/* =====================================================================
 *  a11y.spec.ts — cổng accessibility tự động (nghiên cứu (3), đợt 3)
 *  ---------------------------------------------------------------------
 *  Chạy TRONG with-preview:  bash scripts/with-preview.sh -- npm run a11y
 *
 *  Dùng CHUNG kho giả lập với bộ visual (cùng dữ liệu, cùng luật chặn
 *  mạng). Ngưỡng PASS theo nghiên cứu: KHÔNG vi phạm critical/serious.
 *  Mức moderate/minor được IN RA để trả nợ dần nhưng chưa chặn — siết
 *  sau khi đã sạch hai mức trên. Axe chỉ bắt được một phần lỗi a11y;
 *  keyboard/manual test vẫn phải làm với người thật.
 * ===================================================================== */
import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

import { dungKhoDuLieu, phienGia, layRef, traLoi } from "../e2e/gia-lap-supabase.mjs";

const URL_SB = (() => {
  const noi = readFileSync(new URL("../../.env.local", import.meta.url).pathname, "utf8");
  const m = noi.match(/^VITE_SUPABASE_URL=(.+)$/m);
  if (!m) throw new Error(".env.local thiếu VITE_SUPABASE_URL");
  return m[1].trim();
})();

async function caiGiaLap(page: Page, { dangNhap = true } = {}) {
  const kho = dungKhoDuLieu("day");
  const hostSupabase = new URL(URL_SB).host;
  await page.route("**/*", async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    const noiBo = u.hostname === "127.0.0.1" || u.hostname === "localhost";
    if (noiBo || u.protocol === "data:") return route.continue();
    if (/^fonts\.(googleapis|gstatic)\.com$/.test(u.hostname)) return route.continue();
    if (u.host === hostSupabase) {
      const gia = {
        method: () => req.method(),
        headers: () => req.headers(),
        postData: () => req.postData() ?? "",
      };
      const kq = traLoi(kho, u, gia);
      return route.fulfill({ status: kq.status, headers: kq.headers, body: kq.body });
    }
    return route.abort();
  });
  if (dangNhap) {
    await page.addInitScript(([khoa, phien]) => {
      localStorage.setItem(khoa as string, JSON.stringify(phien));
    }, [`sb-${layRef(URL_SB)}-auth-token`, phienGia()] as [string, unknown]);
  } else {
    await page.addInitScript(() => localStorage.clear());
  }
}

const MAN: Array<{ ten: string; hash: string; dangNhap: boolean }> = [
  { ten: "dang-nhap", hash: "", dangNhap: false },
  { ten: "hom-nay", hash: "#v=today", dangNhap: true },
  { ten: "tong-quan", hash: "#v=overview", dangNhap: true },
  { ten: "timeline", hash: "#v=timeline", dangNhap: true },
  { ten: "bao-cao", hash: "#v=reports", dangNhap: true },
];

for (const man of MAN) {
  test(`axe · ${man.ten}`, async ({ page }, testInfo) => {
    await caiGiaLap(page, { dangNhap: man.dangNhap });
    await page.goto(`/${man.hash}`);
    await page.waitForTimeout(3000);

    const kq = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    await testInfo.attach(`axe-${man.ten}.json`, {
      body: JSON.stringify(kq.violations, null, 2),
      contentType: "application/json",
    });

    const nang = kq.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
    const nhe = kq.violations.filter((v) => v.impact !== "critical" && v.impact !== "serious");
    if (nhe.length) {
      console.log(`[axe:${man.ten}] nợ moderate/minor (${nhe.length}):`,
        nhe.map((v) => `${v.id}×${v.nodes.length}`).join(", "));
    }
    expect(nang.map((v) => ({
      id: v.id, impact: v.impact,
      mau: v.nodes.slice(0, 3).map((n) => n.target.join(" ")),
    }))).toEqual([]);
  });
}
