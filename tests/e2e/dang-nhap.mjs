/* =====================================================================
 *  dang-nhap.mjs — đăng nhập thật cho bộ kiểm
 *  ---------------------------------------------------------------------
 *  Từ migration 20260801090000, vai `anon` không gọi được hàm rpc_* nào
 *  nữa: mở web mà chưa đăng nhập thì không có số liệu. Trước đó bộ kiểm
 *  chỉ nhét một hồ sơ giả vào localStorage rồi đọc dữ liệu qua khoá anon
 *  — nghĩa là nó KHÔNG hề kiểm đường đăng nhập, mà đường đăng nhập lại là
 *  cửa duy nhất vào hệ thống.
 *
 *  Nay bộ kiểm gõ đúng vào ô đăng nhập như người dùng. Chậm hơn vài giây
 *  mỗi lượt, đổi lại mỗi lần chạy đều đi qua cửa thật.
 *
 *  Tài khoản dùng: E2E_EMAIL / E2E_PASSWORD trong .env.local (file này
 *  không vào git). Vai `viewer` — đọc được, không ghi được gì; muốn xoá
 *  thì vào màn Phân quyền → Danh sách email được phép.
 * ===================================================================== */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const GOC_DA = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** Đọc .env.local thủ công — node không tự nạp, mà thêm phụ thuộc chỉ để
 *  đọc mấy dòng key=value thì không đáng. */
export function docEnv() {
  const f = path.join(GOC_DA, ".env.local");
  const env = {};
  if (!fs.existsSync(f)) return env;
  for (const dong of fs.readFileSync(f, "utf8").split("\n")) {
    const m = dong.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

/** Đã đăng nhập chưa — nhìn vào việc còn ô mật khẩu trên màn hay không. */
export const dangOManDangNhap = (p) =>
  p.evaluate(() => document.querySelectorAll("input[type=password]").length > 0);

/**
 * Đăng nhập rồi chờ tới khi số liệu thật đã về.
 * Trả về true nếu vào được, ném lỗi nếu không — bộ kiểm phải dừng hẳn chứ
 * không chạy tiếp rồi báo hàng loạt lỗi giao diện, vì lúc đó nguyên nhân
 * thật (không đăng nhập được) sẽ chìm trong đống lỗi hệ quả.
 */
export async function dangNhap(p, GOC) {
  const env = docEnv();
  const email = env.E2E_EMAIL;
  const matKhau = env.E2E_PASSWORD;
  if (!email || !matKhau) {
    throw new Error(
      "Thiếu E2E_EMAIL / E2E_PASSWORD trong .env.local.\n"
      + "Từ 2026-08-01 web bắt buộc đăng nhập nên bộ kiểm cần một tài khoản chỉ-xem.\n"
      + "Xem .env.local.example.",
    );
  }

  // Supabase/Google Fonts có request sống lâu nên `networkidle2` không phải
  // tín hiệu trang đăng nhập đã sẵn sàng. Chờ DOM rồi chờ đúng ô mật khẩu
  // bên dưới: đây là điều kiện người dùng thật sự cần để tiếp tục.
  await p.goto(GOC, { waitUntil: "domcontentloaded" });
  await p.waitForSelector("input[type=password]", { timeout: 30000 });

  const oNhap = await p.$$("input");
  // Ô đầu là email/tài khoản, ô mật khẩu là ô type=password.
  await oNhap[0].click({ clickCount: 3 });
  await oNhap[0].type(email);
  const oMk = await p.$("input[type=password]");
  await oMk.click({ clickCount: 3 });
  await oMk.type(matKhau);
  await oMk.press("Enter");

  try {
    await p.waitForFunction(
      () => document.querySelectorAll("input[type=password]").length === 0,
      { timeout: 30000 },
    );
  } catch {
    const loi = await p.evaluate(() => document.body.innerText.slice(0, 400));
    throw new Error("Đăng nhập không vào được. Màn hình đang hiện:\n" + loi);
  }

  /* Chờ số liệu thật về, không chỉ chờ mất ô mật khẩu: giữa hai mốc đó có
     một khoảng màn đã dựng mà mảng hạng mục còn rỗng, kiểm vào đúng lúc
     ấy sẽ báo sai hàng loạt. */
  await p.waitForFunction(
    () => /\d+\s*\/\s*\d+\s*hạng mục|hạng mục/.test(document.body.innerText),
    { timeout: 45000 },
  );
  return true;
}

/**
 * Ghi đè hồ sơ trong localStorage để thử giao diện của một vai khác.
 * CHỈ đổi vế client — quyền thật vẫn do phiên đăng nhập ở trên quyết định,
 * nên đây không phải lỗ hổng: nó chỉ cho bộ kiểm xem giao diện của vai đó
 * trông ra sao. Mọi lời gọi ghi vẫn bị server từ chối như thường.
 */
export async function doiVaiTrenMan(p, perm, ten = "Bộ kiểm E2E") {
  await p.evaluate(([q, t]) => {
    const cu = JSON.parse(localStorage.getItem("vmp_monitor_user_v1") || "{}");
    localStorage.setItem("vmp_monitor_user_v1", JSON.stringify({
      ...cu, name: t, perm: q, role: q === "admin" ? "admin" : q === "edit" ? "qa_manager" : "viewer",
    }));
  }, [perm, ten]);
}
