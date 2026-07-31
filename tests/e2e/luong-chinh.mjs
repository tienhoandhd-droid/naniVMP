/* E2E thật: lái Chrome đã cài trên máy, chạy bản build trong dist/.
 * Đăng nhập được bỏ qua bằng cách nạp sẵn hồ sơ người dùng vào localStorage —
 * đúng đường mà useAuth() dùng (loadUser()). Đường ĐỌC dữ liệu vẫn là Supabase
 * thật bằng khoá anon, nên số trên màn hình là số thật.
 * Không ghi gì lên Supabase.
 */
import puppeteer from "puppeteer-core";
import { choServer } from "./cho-server.mjs";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const GOC = process.env.E2E_URL || "http://localhost:4173";
const QA = process.env.E2E_QA_NAME || "";

const ket = [];
let hong = 0;
function kiem(ten, dat, chiTiet = "") {
  ket.push({ ten, dat, chiTiet });
  if (!dat) hong++;
  console.log(`${dat ? "  ✅" : "  ❌"} ${ten}${chiTiet ? ` — ${chiTiet}` : ""}`);
}

const doi = (ms) => new Promise((r) => setTimeout(r, ms));

/** Chờ tới khi hàm trả về giá trị thật (không null/false) hoặc hết giờ. */
async function cho(page, fn, { hanMs = 25000, nhip = 250, ten = "điều kiện" } = {}) {
  const het = Date.now() + hanMs;
  for (;;) {
    const v = await page.evaluate(fn);
    if (v) return v;
    if (Date.now() > het) throw new Error(`Quá hạn chờ ${ten}`);
    await doi(nhip);
  }
}

const docChip = () => {
  const el = [...document.querySelectorAll("span")]
    .find((s) => /\d+\/\d+ hạng mục/.test(s.textContent || ""));
  if (!el) return null;
  const m = (el.textContent || "").match(/(\d+)\/(\d+)/);
  return m ? { hien: +m[1], tong: +m[2] } : null;
};

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--window-size=1600,1200"],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1200 });

  const loiConsole = [];
  page.on("console", (m) => { if (m.type() === "error") loiConsole.push(m.text()); });
  page.on("pageerror", (e) => loiConsole.push("pageerror: " + e.message));

  // ---- Nạp hồ sơ giả để qua màn đăng nhập (chỉ ảnh hưởng localStorage) ----
  await page.goto(GOC, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    localStorage.setItem("vmp_monitor_user_v1", JSON.stringify({
      name: "E2E Tester", email: "e2e@test.local", role: "admin", perm: "admin",
    }));
    localStorage.removeItem("vmp_monitor_loc_v1:e2e@test.local");
  });

  console.log("\n── 1. Khởi động & nạp dữ liệu thật ──");
  await page.goto(GOC, { waitUntil: "networkidle2" });
  const tong = await cho(page, docChip, { ten: "thanh bộ lọc toàn cục" });
  kiem("App dựng được, thanh lọc toàn cục hiện ra", !!tong, `${tong.hien}/${tong.tong} hạng mục`);
  kiem("Đọc được dữ liệu thật từ Supabase", tong.tong > 400, `tổng = ${tong.tong}`);

  console.log("\n── 2. Chỉ báo độ tươi dữ liệu ──");
  const tuoi = await cho(page, () => {
    const el = [...document.querySelectorAll("span")]
      .find((s) => (s.textContent || "").includes("· Dữ liệu:"));
    return el ? { chu: el.textContent.trim(), title: el.getAttribute("title") || "" } : null;
  }, { ten: "mốc dữ liệu trên Topbar" });
  kiem("Topbar hiện mốc dữ liệu (không phải giờ trình duyệt tải)",
    /· Dữ liệu: \d{2}\/\d{2} \d{2}:\d{2}/.test(tuoi.chu), tuoi.chu);
  kiem("Có tooltip nêu rõ mốc sửa gần nhất", /sửa gần nhất lúc/.test(tuoi.title), tuoi.title.slice(0, 60));

  console.log("\n── 3. URL lái được màn hình + bộ lọc ──");
  await page.goto(`${GOC}#v=alerts&dept=xsx`, { waitUntil: "networkidle2" });
  const sauUrl = await cho(page, docChip, { ten: "chip đếm sau khi mở URL có bộ lọc" });
  const tieuDe = await page.evaluate(() => {
    const el = [...document.querySelectorAll("div")]
      .find((d) => d.children.length === 0 && /Cảnh báo & Rủi ro/.test(d.textContent || ""));
    return el ? el.textContent.trim() : "";
  });
  kiem("URL #v=alerts mở đúng trang Cảnh báo", /Cảnh báo/.test(tieuDe), tieuDe || "(không thấy tiêu đề)");
  kiem("URL dept=xsx lọc thật sự (ít hơn tổng)", sauUrl.hien < sauUrl.tong && sauUrl.hien > 0,
    `${sauUrl.hien}/${sauUrl.tong}`);
  // Chip là <span>XSX<button aria-label="Bỏ XSX">×</button></span> — bám vào
  // aria-label cho chắc, đừng dò theo cây con.
  const coChip = await page.evaluate(() =>
    !!document.querySelector('[aria-label="Bỏ XSX"]'));
  kiem("Chip bộ phận XSX hiện trên thanh lọc", coChip);

  console.log("\n── 4. Đổi bộ lọc thì URL đổi theo ──");
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => /Xóa lọc/.test(x.textContent || ""));
    if (b) b.click();
  });
  await doi(600);
  const hashSauXoa = await page.evaluate(() => location.hash);
  kiem("Xóa lọc → hash bỏ dept, giữ màn hình", hashSauXoa === "#v=alerts", hashSauXoa || "(rỗng)");

  console.log("\n── 5. Nút Back của trình duyệt ──");
  // Đổi MÀN mới đẩy mục vào lịch sử (pushState); đổi BỘ LỌC thì replaceState —
  // cố ý, để gõ ngày tháng không nhồi hàng chục mục vào lịch sử. Nên phép kiểm
  // Back phải chạy trên thao tác đổi màn.
  await page.goto(`${GOC}#v=overview&dept=xsx`, { waitUntil: "networkidle2" });
  await cho(page, docChip, { ten: "chip ở màn Tổng quan" });
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")]
      .find((x) => /Phân công & Tải việc/.test(x.textContent || ""));
    if (b) b.click();
  });
  await doi(900);
  const sauDoiMan = await page.evaluate(() => location.hash);
  kiem("Đổi màn ghi màn mới vào URL", /v=workload/.test(sauDoiMan), sauDoiMan || "(rỗng)");
  await page.goBack({ waitUntil: "domcontentloaded" });
  await doi(900);
  const sauBack = await page.evaluate(() => location.hash);
  kiem("Back quay về màn trước, giữ nguyên bộ lọc", /dept=xsx/.test(sauBack) && !/v=workload/.test(sauBack),
    sauBack || "(rỗng)");
  const chipSauBack = await cho(page, docChip, { ten: "chip sau khi Back" });
  kiem("Back áp lại đúng bộ lọc lên dữ liệu", chipSauBack.hien === sauUrl.hien,
    `${chipSauBack.hien} vs ${sauUrl.hien}`);

  console.log("\n── 6. Nhớ bộ lọc sau khi tải lại ──");
  await page.goto(`${GOC}#v=overview&dept=qa`, { waitUntil: "networkidle2" });
  const chipQa = await cho(page, docChip, { ten: "chip với dept=qa" });
  await doi(700);                                   // chờ ghi localStorage
  await page.goto(GOC, { waitUntil: "networkidle2" });   // mở URL TRỐNG
  const chipNho = await cho(page, docChip, { ten: "chip sau khi mở URL trống" });
  const hashNho = await page.evaluate(() => location.hash);
  kiem("Mở URL trống vẫn nhớ bộ lọc lần trước", /dept=qa/.test(hashNho), hashNho || "(rỗng)");
  kiem("Số hạng mục khớp với lúc lọc thủ công", chipNho.hien === chipQa.hien,
    `${chipNho.hien} vs ${chipQa.hien}`);

  console.log("\n── 7. URL thắng bộ lọc đã nhớ ──");
  await page.goto(`${GOC}#dept=xsx`, { waitUntil: "networkidle2" });
  const chipUuTien = await cho(page, docChip, { ten: "chip khi URL có dept khác bản nhớ" });
  kiem("URL đè bộ lọc đã nhớ (không bị trộn)", chipUuTien.hien === sauUrl.hien,
    `xsx=${chipUuTien.hien}, qa=${chipQa.hien}`);

  console.log("\n── 8. Việc của tôi ──");
  await page.goto(GOC, { waitUntil: "networkidle2" });
  await cho(page, docChip, { ten: "chip trước khi bật Việc của tôi" });
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => /Xóa lọc/.test(x.textContent || ""));
    if (b) b.click();
  });
  await doi(500);
  const coNut = await page.evaluate(() =>
    [...document.querySelectorAll("button")].some((b) => /Việc của tôi/.test(b.textContent || "")));
  kiem("Nút 'Việc của tôi' hiện khi biết tên người đăng nhập", coNut);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => /Việc của tôi/.test(x.textContent || ""));
    if (b) b.click();
  });
  await doi(700);
  const hashMine = await page.evaluate(() => location.hash);
  const chipMine = await cho(page, docChip, { ten: "chip khi bật Việc của tôi" });
  kiem("Bật 'Việc của tôi' ghi me=1 vào URL", /me=1/.test(hashMine), hashMine);
  kiem("Tên lạ (E2E Tester) → lọc ra 0 hạng mục, không phải bỏ qua bộ lọc",
    chipMine.hien === 0, `${chipMine.hien}/${chipMine.tong}`);

  if (QA) {
    console.log("\n── 8b. Việc của tôi với QA có thật ──");
    await page.evaluate((ten) => {
      localStorage.setItem("vmp_monitor_user_v1", JSON.stringify({
        name: ten, email: "e2e@test.local", role: "admin", perm: "admin",
      }));
    }, QA);
    // goto sang URL chỉ khác mỗi hash là điều hướng trong cùng tài liệu —
    // React KHÔNG dựng lại, nên tên vừa đặt sẽ không được đọc. Phải reload.
    await page.goto(`${GOC}#me=1`, { waitUntil: "networkidle2" });
    await page.reload({ waitUntil: "networkidle2" });
    const chipQaThat = await cho(page, docChip, { ten: "chip với QA có thật" });
    kiem(`'Việc của tôi' ra đúng việc của ${QA}`, chipQaThat.hien > 0,
      `${chipQaThat.hien}/${chipQaThat.tong}`);
  }

  console.log("\n── 9. Không có lỗi console ──");
  const loiThat = loiConsole.filter((t) => !/favicon|Download the React DevTools/i.test(t));
  kiem("Không có lỗi JS nào trong suốt phiên", loiThat.length === 0,
    loiThat.slice(0, 3).join(" | ") || "sạch");

  
} finally {
  await browser.close();
}

console.log(`\n═══ ${ket.length - hong}/${ket.length} phép kiểm đạt ═══`);
process.exit(hong ? 1 : 0);
