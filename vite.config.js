import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base: './' (đường dẫn tương đối) hoạt động tốt cho GitHub Pages dạng
// project page (https://<user>.github.io/<repo>/) mà KHÔNG cần biết tên repo.
// App này dùng điều hướng nội bộ (state), không dùng router theo URL nên
// base tương đối là an toàn. Nếu bạn deploy lên custom domain hoặc user page
// (https://<user>.github.io/) thì có thể đổi thành '/'.
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    outDir: "dist",
    target: "es2020",
    cssMinify: true,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        // Tách vendor để trình duyệt cache riêng (đổi code app không phải
        // tải lại react/supabase) + tải song song → nhanh hơn ở lần sau.
        manualChunks: {
          "vendor-react": ["react", "react-dom"],
          "vendor-supabase": ["@supabase/supabase-js"],
          "vendor-icons": ["lucide-react"],
        },
      },
    },
  },
});
