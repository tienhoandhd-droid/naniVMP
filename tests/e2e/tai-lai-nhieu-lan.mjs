/* =====================================================================
 *  tai-lai-nhieu-lan.mjs — trang phải chịu được tải lại liên tục
 *  ---------------------------------------------------------------------
 *  Người dùng báo "đôi khi bị lỗi tải lại trang" (2026-08-03). Loại lỗi
 *  thỉnh thoảng mới bị thì một lần kiểm không nói lên gì — phải lặp cho đủ
 *  nhiều lần rồi mới dám kết luận.
 *
 *  Hai phép kiểm:
 *    A. Tải lại N lần liên tiếp — không lần nào được rơi về màn đăng nhập,
 *       mất số liệu, hay bung ErrorBoundary.
 *    B. Giả lập bản deploy mới: chặn 404 mọi chunk của một màn, rồi mở màn
 *       đó. App phải TỰ tải lại và vào được, chứ không đứng ở màn lỗi.
 * ===================================================================== */
import puppeteer from "puppeteer-core";
import { choServer } from "./cho-server.mjs";
import { dangNhap } from "./dang-nhap.mjs";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const GOC = process.env.E2E_URL || "http://localhost:4173";
const SO_LAN = Number(process.env.E2E_SO_LAN || 20);

let hong = 0;
const kiem = (ten, dat, chiTiet = "") => {
  if (!dat) hong++;
  console.log(`${dat ? "  ✅" : "  ❌"} ${ten}${chiTiet ? ` — ${chiTiet}` : ""}`);
};
const doi = (ms) => new Promise((r) => setTimeout(r, ms));

await choServer(GOC);

const b = await puppeteer.launch({
  executablePath: CHROME, headless: "new", args: ["--no-sandbox"],
});
const p = await b.newPage();
await p.setViewport({ width: 1500, height: 1000 });

const loiJs = [];
p.on("pageerror", (e) => loiJs.push(e.message.slice(0, 200)));

try {
  console.log(`\n── A. Tải lại ${SO_LAN} lần liên tiếp ──`);
  await dangNhap(p, GOC);

  const xau = [];
  for (let i = 1; i <= SO_LAN; i++) {
    await p.reload({ waitUntil: "networkidle2" });
    // Chờ tới khi số liệu về, tối đa 30s.
    let tong = 0;
    const het = Date.now() + 30000;
    for (;;) {
      const t = await p.evaluate(() => {
        if (document.querySelectorAll("input[type=password]").length) return -1;
        if (/Ứng dụng gặp lỗi khi hiển thị/.test(document.body.innerText)) return -2;
        const m = document.body.innerText.match(/(\d+)\s*\/\s*(\d+)\s*hạng mục/);
        return m ? +m[2] : 0;
      });
      if (t !== 0 || Date.now() > het) { tong = t; break; }
      await doi(400);
    }
    if (tong <= 0) {
      xau.push(`lần ${i}: ${tong === -1 ? "rơi về đăng nhập" : tong === -2 ? "màn lỗi" : "không có số liệu"}`);
    }
  }
  kiem(`${SO_LAN} lần tải lại đều giữ được phiên và số liệu`, xau.length === 0,
    xau.length ? xau.slice(0, 4).join(" · ") : `${SO_LAN}/${SO_LAN} lần sạch`);

  console.log("\n── B. Chunk cũ biến mất sau bản deploy mới ──");
  /* Chặn chunk của màn Timeline như thể bản deploy mới đã xoá nó — nhưng
     CHỈ lượt đầu. Sau khi app tự tải lại, nó nhận index.html mới trỏ sang
     chunk MỚI, và chunk đó có thật. Chặn tiếp sau thời điểm ấy là mô phỏng
     một tình huống không tồn tại, và sẽ đổ lỗi oan cho phần phục hồi —
     bản đầu của phép kiểm này mắc đúng lỗi đó. */
  await p.setRequestInterception(true);
  let daChan = 0;
  const chan = (req) => {
    if (/TimelinePage-.*\.js$/.test(req.url()) && daChan < 1) { daChan++; req.abort("failed"); }
    else req.continue();
  };
  p.on("request", chan);

  await p.evaluate(() => sessionStorage.removeItem("vmp_da_tai_lai_vi_chunk"));
  await p.goto(`${GOC}#v=timeline`, { waitUntil: "networkidle2" });
  await doi(9000);   // đủ cho: hỏng → thử lại → tự reload → dựng lại

  const sau = await p.evaluate(() => ({
    manLoi: /Ứng dụng gặp lỗi khi hiển thị/.test(document.body.innerText),
    coChu: document.body.innerText.trim().length > 200,
    daDanhDau: !!sessionStorage.getItem("vmp_da_tai_lai_vi_chunk"),
  }));
  kiem("Đã chặn được chunk (phép kiểm có hiệu lực)", daChan > 0, `chặn ${daChan} lượt`);
  kiem("App tự tải lại thay vì đứng ở màn lỗi", !sau.manLoi);
  kiem("Có ghi dấu chống lặp tải lại", sau.daDanhDau);
  kiem("Vào được màn sau khi tự phục hồi", sau.coChu);

  p.off("request", chan);
  await p.setRequestInterception(false);

  kiem("Không có lỗi JS ngoài dự kiến", loiJs.length === 0, loiJs.slice(0, 2).join(" | "));
} finally {
  await b.close();
}

console.log(`\n═══ ${hong ? `${hong} PHÉP KIỂM HỎNG` : "tải lại trang ổn định"} ═══`);
process.exit(hong ? 1 : 0);
