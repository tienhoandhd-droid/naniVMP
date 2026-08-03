/* =====================================================================
 *  phien-het-han.mjs — Phiên chết mà hồ sơ còn thì phải rơi về đăng nhập
 *  ---------------------------------------------------------------------
 *  Sự cố 2026-08-03: người dùng báo "web không tải được dữ liệu". Dashboard
 *  dựng đủ khung, đủ tên người, đủ menu — nhưng "0/0 hạng mục" và banner
 *  đứng mãi ở "Đang chờ đồng bộ…". Không một dòng lỗi trong console, không
 *  một request nào đỏ. Tải lại trang cũng y hệt.
 *
 *  Nguyên nhân: app có HAI nguồn chân lý cho câu hỏi "đã đăng nhập chưa".
 *    · useAuth   đọc hồ sơ trong localStorage (vmp_monitor_user_v1)
 *    · useVmpData hỏi phiên thật (supabase.auth.getSession)
 *  Khi vé Supabase hết hạn mà hồ sơ còn nằm lại, useAuth bảo "rồi" nên
 *  không hiện màn đăng nhập, còn useVmpData bảo "chưa" nên không gọi RPC
 *  nào. Hai vế đều "đúng" theo cách riêng, và người dùng kẹt vĩnh viễn ở
 *  giữa. Đây là loại lỗi không lộ ra ở bất kỳ phép kiểm nào chạy trên một
 *  phiên vừa đăng nhập — nên phải kiểm bằng cách giết phiên giữa chừng.
 *
 *  Phép kiểm này giả lập đúng cảnh đó: đăng nhập thật, xoá khoá phiên
 *  Supabase (sb-*) mà GIỮ hồ sơ, rồi tải lại. Yêu cầu: về màn đăng nhập.
 * ===================================================================== */
import puppeteer from "puppeteer-core";
import { choServer } from "./cho-server.mjs";
import { dangNhap } from "./dang-nhap.mjs";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const GOC = process.env.E2E_URL || "http://localhost:4173";

let hong = 0;
const kiem = (ten, dat, chiTiet = "") => {
  if (!dat) hong++;
  console.log(`${dat ? "  ✅" : "  ❌"} ${ten}${chiTiet ? ` — ${chiTiet}` : ""}`);
};

await choServer(GOC);

const b = await puppeteer.launch({
  executablePath: CHROME, headless: "new", args: ["--no-sandbox"],
});
const p = await b.newPage();
await p.setViewport({ width: 1500, height: 1000 });

try {
  console.log("\n── Phiên hết hạn nhưng hồ sơ còn trong localStorage ──");
  await dangNhap(p, GOC);

  const truoc = await p.evaluate(() => Object.keys(localStorage).some((k) => /^sb-/.test(k)));
  kiem("Đăng nhập xong có khoá phiên Supabase", truoc);

  // Giết phiên, giữ hồ sơ — đúng cảnh vé hết hạn / bị thu hồi.
  const daXoa = await p.evaluate(() => {
    let n = 0;
    for (const k of Object.keys(localStorage)) if (/^sb-/.test(k)) { localStorage.removeItem(k); n++; }
    return { n, conHoSo: !!localStorage.getItem("vmp_monitor_user_v1") };
  });
  kiem("Xoá được phiên mà hồ sơ vẫn còn", daXoa.n > 0 && daXoa.conHoSo,
    `xoá ${daXoa.n} khoá sb-*, hồ sơ còn: ${daXoa.conHoSo}`);

  await p.reload({ waitUntil: "networkidle2" });
  await new Promise((r) => setTimeout(r, 6000));

  const sau = await p.evaluate(() => ({
    oMatKhau: document.querySelectorAll("input[type=password]").length > 0,
    chip0: /0\s*\/\s*0\s*hạng mục/.test(document.body.innerText),
    choDongBo: /Đang chờ đồng bộ/.test(document.body.innerText),
  }));

  kiem("Rơi về màn đăng nhập", sau.oMatKhau,
    sau.oMatKhau ? "" : "vẫn dựng dashboard như đã đăng nhập");
  kiem("Không hiện dashboard rỗng 0/0 hạng mục", !sau.chip0);
  kiem("Không đứng ở 'Đang chờ đồng bộ…'", !sau.choDongBo);

  // Đăng nhập lại phải vào được ngay, không cần xoá cache thủ công.
  await dangNhap(p, GOC);
  /* dangNhap() chỉ chờ tới khi chữ "hạng mục" xuất hiện, mà chip lúc mới
     dựng là "0/0 hạng mục" — khớp ngay trước khi số thật về. Chờ thêm tới
     lúc tổng > 0 chứ không đọc một phát rồi kết luận. */
  const laiCo = await (async () => {
    const het = Date.now() + 30000;
    for (;;) {
      const n = await p.evaluate(() => {
        const m = document.body.innerText.match(/(\d+)\s*\/\s*(\d+)\s*hạng mục/);
        return m ? +m[2] : 0;
      });
      if (n > 0 || Date.now() > het) return n;
      await new Promise((r) => setTimeout(r, 500));
    }
  })();
  kiem("Đăng nhập lại là có dữ liệu ngay", laiCo > 0, `${laiCo} hạng mục`);
} finally {
  await b.close();
}

console.log(`\n═══ ${hong ? `${hong} PHÉP KIỂM HỎNG` : "phiên hết hạn được xử lý đúng"} ═══`);
process.exit(hong ? 1 : 0);
