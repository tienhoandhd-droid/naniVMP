import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

import { CHROME } from "./chrome-path.mjs";
import { caiGiaLap, nhetPhien } from "./gia-lap-supabase.mjs";

const GOC = process.env.VMP_E2E_URL || "http://127.0.0.1:4173/";
const envText = readFileSync(fileURLToPath(new URL("../../.env.local", import.meta.url)), "utf8");
const match = envText.match(/^VITE_SUPABASE_URL=(.+)$/m);
if (!match) throw new Error(".env.local thiếu VITE_SUPABASE_URL");
const supabaseUrl = match[1].trim();

let dat = 0;
let hong = 0;
function kiem(dieuKien, ten, chiTiet = "") {
  if (dieuKien) {
    dat += 1;
    console.log(`  ✓ ${ten}`);
    return;
  }
  hong += 1;
  console.error(`  ✗ ${ten}${chiTiet ? ` — ${chiTiet}` : ""}`);
}

async function moTrang(browser, width, height) {
  const page = await browser.newPage();
  await caiGiaLap(page, { supabaseUrl, kichBan: "day" });
  await nhetPhien(page, { supabaseUrl, cheDo: "light" });
  await page.setViewport({ width, height });
  await page.goto(`${GOC}?theme-person-layout=1#v=overview`, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  await page.waitForSelector('select[aria-label="Chọn nhân sự xem tiến độ"]', { timeout: 30_000 });
  return page;
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox"],
});

console.log("Bố cục desktop:");
{
  const page = await moTrang(browser, 1440, 900);
  const geometry = await page.evaluate(() => {
    const theme = document.querySelector('.vmp-sidebar button[aria-label^="Giao diện "]');
    const identity = document.querySelector(".vmp-sidebar-account__identity");
    const filter = document.querySelector("#vmp-global-filter-trigger");
    const person = document.querySelector(".vmp-global-filter__person");
    const rect = (element) => element?.getBoundingClientRect();
    const themeRect = rect(theme);
    const identityRect = rect(identity);
    const filterRect = rect(filter);
    const personRect = rect(person);
    return {
      themeTrongTaiKhoan: !!themeRect && !!identityRect
        && themeRect.left >= identityRect.left && themeRect.right <= identityRect.right
        && themeRect.top >= identityRect.top && themeRect.bottom <= identityRect.bottom,
      themeTrenTopbar: document.querySelectorAll('.vmp-topbar button[aria-label^="Giao diện "]').length,
      personBenPhai: !!filterRect && !!personRect && personRect.left > filterRect.right,
      khoangCan: filterRect && personRect ? Math.round(personRect.left - filterRect.right) : -1,
    };
  });
  kiem(geometry.themeTrongTaiKhoan, "theme nằm trong nhận diện tài khoản");
  kiem(geometry.themeTrenTopbar === 0, "topbar không còn nút theme", String(geometry.themeTrenTopbar));
  kiem(geometry.personBenPhai, "capsule nhân sự nằm bên phải Bộ lọc", `${geometry.khoangCan}px`);

  const themeSelector = '.vmp-sidebar button[aria-label^="Giao diện "]';
  const themeButton = await page.$(themeSelector);
  if (themeButton) {
    await themeButton.click();
    const themeLabel = await page.$eval(themeSelector, (element) => element.getAttribute("aria-label"));
    kiem(themeLabel?.includes("Theo hệ thống"), "theme vẫn đổi trạng thái", themeLabel || "không có nhãn");
  } else {
    kiem(false, "theme vẫn đổi trạng thái", "không tìm thấy trong sidebar");
  }

  const personValue = await page.$eval('select[aria-label="Chọn nhân sự xem tiến độ"]', (select) => {
    const option = [...select.options].find((item) => item.value);
    if (!option) return "";
    select.value = option.value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    return option.value;
  });
  await page.waitForFunction((value) => document.querySelector('select[aria-label="Chọn nhân sự xem tiến độ"]')?.value === value, {}, personValue);
  kiem(Boolean(personValue), "bộ chọn nhân sự vẫn thay đổi được");
  await page.close();
}

console.log("\nBố cục hẹp:");
{
  const page = await moTrang(browser, 640, 900);
  const compact = await page.evaluate(() => {
    const select = document.querySelector('select[aria-label="Chọn nhân sự xem tiến độ"]');
    return {
      tranNgang: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      selectCao: select?.getBoundingClientRect().height || 0,
    };
  });
  kiem(compact.tranNgang <= 1, "không tràn ngang", `${compact.tranNgang}px`);
  kiem(compact.selectCao >= 44, "select có vùng bấm tối thiểu 44px", `${Math.round(compact.selectCao)}px`);
  await page.close();
}

await browser.close();
console.log(`\n${dat} đạt · ${hong} hỏng`);
if (hong > 0) process.exit(1);
