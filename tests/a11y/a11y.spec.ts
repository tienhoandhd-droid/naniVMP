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
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

import { dungKhoDuLieu, phienGia, layRef, traLoi } from "../e2e/gia-lap-supabase.mjs";

const URL_SB = (() => {
  if (process.env.VMP_E2E_SUPABASE_URL) return process.env.VMP_E2E_SUPABASE_URL;
  try {
    const noi = readFileSync(fileURLToPath(new URL("../../.env.local", import.meta.url)), "utf8");
    const url = noi.match(/^VITE_SUPABASE_URL=(.+)$/m)?.[1]?.trim();
    if (url) return url;
  } catch {
    /* ACL local có thể chặn .env.local; tiếp tục dùng endpoint công khai trong bundle. */
  }
  try {
    const assets = new URL("../../dist/assets/", import.meta.url);
    for (const name of readdirSync(fileURLToPath(assets))) {
      if (!name.endsWith(".js")) continue;
      const noi = readFileSync(fileURLToPath(new URL(name, assets)), "utf8");
      const url = noi.match(/https:\/\/[a-z0-9-]+\.supabase\.co/i)?.[0];
      if (url) return url;
    }
  } catch {
    /* Quy về lỗi cấu hình chung bên dưới, không lộ nội dung bundle. */
  }
  throw new Error("Không tìm thấy Supabase URL công khai cho kiểm thử a11y");
})();

async function caiGiaLap(page: Page, { dangNhap = true } = {}) {
  const kho = dungKhoDuLieu("day");
  const hostSupabase = new URL(URL_SB).host;
  await page.addInitScript(() => {
    (window as Window & { __REACT_GRAB_DISABLED__?: boolean }).__REACT_GRAB_DISABLED__ = true;
  });
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

const MAN: Array<{
  ten: string;
  hash: string;
  dangNhap: boolean;
  root: string;
  monitoringLabel?: string;
  /** timeline: bấm sang chế độ Bảng trước khi quét. */
  moBang?: boolean;
}> = [
  { ten: "dang-nhap", hash: "", dangNhap: false, root: "#vmp-login-email" },
  { ten: "hom-nay", hash: "#v=today", dangNhap: true, root: ".hn-lotus" },
  {
    ten: "tong-quan",
    hash: "#v=overview",
    dangNhap: true,
    root: ".b-hero",
    monitoringLabel: "Tổng quan VMP",
  },
  {
    ten: "timeline",
    hash: "#v=timeline",
    dangNhap: true,
    root: ".timeline-page-shell .long-mon-race",
    monitoringLabel: "Dòng thời gian",
  },
  {
    ten: "canh-bao",
    hash: "#v=alerts",
    dangNhap: true,
    root: ".alerts-page-shell .alerts-priority-rail",
    monitoringLabel: "Cảnh báo & ưu tiên",
  },
  { ten: "bao-cao", hash: "#v=reports", dangNhap: true, root: ".vmp-report-command-bar" },
  /* C5 (31/08): 8 màn trước đây KHÔNG được quét — cổng xanh vì không nhìn
     vào chỗ tối. Root chọn phần tử đặc trưng của từng màn (đợi dựng xong
     mới quét, tránh chụp skeleton). */
  { ten: "tien-do", hash: "#v=progress", dangNhap: true, root: ".vmp-doi-nhom" },
  { ten: "phan-cong", hash: "#v=workload", dangNhap: true, root: "main" },
  { ten: "du-lieu-nguon", hash: "#v=source", dangNhap: true, root: "main" },
  { ten: "chat-luong", hash: "#v=health", dangNhap: true, root: "main" },
  { ten: "nhat-ky", hash: "#v=audit", dangNhap: true, root: "main" },
  { ten: "phan-quyen", hash: "#v=phanquyen", dangNhap: true, root: "main" },
  { ten: "cau-hinh", hash: "#v=admin", dangNhap: true, root: "main" },
  { ten: "timeline-bang", hash: "#v=timeline", dangNhap: true,
    root: ".timeline-page-shell .long-mon-race", moBang: true },
];

/* C5 (31/08): quét cả HỘP NHẬP LIỆU CHÍNH — 900 dòng form mà trước đây
 * chưa từng bị axe soi vì mọi màn đều chụp ở trạng thái tĩnh. */
test("axe · hop-cap-nhat-tien-do", async ({ page }, testInfo) => {
  await caiGiaLap(page, { dangNhap: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#v=progress");
  await expect(page.locator(".vmp-doi-nhom")).toBeVisible({ timeout: 15_000 });
  await page.locator(".pr-nut-chinh").first().click();
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 10_000 });

  const kq = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  await testInfo.attach("axe-hop-cap-nhat.json", {
    body: JSON.stringify(kq.violations, null, 2),
    contentType: "application/json",
  });
  const nang = kq.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
  expect(nang.map((v) => ({
    id: v.id, impact: v.impact,
    mau: v.nodes.slice(0, 3).map((n) => n.target.join(" ")),
  }))).toEqual([]);
});

for (const man of MAN) {
  test(`axe · ${man.ten}`, async ({ page }, testInfo) => {
    await caiGiaLap(page, { dangNhap: man.dangNhap });
    await page.goto(`/${man.hash}`);
    await expect(page.locator(man.root)).toBeVisible({ timeout: 15_000 });
    if (man.moBang) {
      await page.click('[data-timeline-view="bang"]');
      await expect(page.locator(".long-mon-bang")).toBeVisible({ timeout: 10_000 });
    }
    if (man.monitoringLabel) {
      const current = page.locator('.monitoring-journey [aria-current="page"]');
      await expect(current).toHaveCount(1);
      await expect(current).toBeVisible({ timeout: 15_000 });
      await expect(current).toContainText(man.monitoringLabel);
    }

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
