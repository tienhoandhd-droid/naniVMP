import { existsSync } from "node:fs";
import { platform } from "node:os";

const candidates = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean);

export const CHROME = candidates.find((path) => existsSync(path));

if (!CHROME) {
  throw new Error(
    "Không tìm thấy Chrome. Đặt CHROME_PATH hoặc cài Google Chrome/Chromium ở đường dẫn chuẩn.",
  );
}

export const CHROME_GL_ARGS = platform() === "darwin"
  ? ["--use-gl=angle", "--use-angle=metal"]
  : ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"];
