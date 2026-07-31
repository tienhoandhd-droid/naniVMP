/* Chờ server phục vụ được rồi mới chạy kiểm.
 *
 * Không có bước này thì lúc server chưa kịp lên, mọi màn đều trả về trang
 * rỗng và bộ kiểm báo "12 MÀN HỎNG" — một báo động giả trông y hệt sự cố
 * thật. Đã bị đúng một lần, ngay trước khi deploy. */
export async function choServer(goc, { hanMs = 20000, nhip = 400 } = {}) {
  const het = Date.now() + hanMs;
  for (;;) {
    try {
      const res = await fetch(goc, { method: "GET" });
      if (res.ok) return;
    } catch { /* chưa lên — thử lại */ }
    if (Date.now() > het) {
      console.error(
        `\n✖ Không kết nối được ${goc} sau ${hanMs / 1000}s.\n`
        + "  Chạy trước: npm run build && npx vite preview --port 4173 --strictPort &\n"
        + "  (phải là bản BUILD, không phải dev server)\n",
      );
      process.exit(2);
    }
    await new Promise((r) => setTimeout(r, nhip));
  }
}
