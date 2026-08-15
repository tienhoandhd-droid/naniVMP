import React from "react";
import type { ErrorInfo, ReactNode } from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import { LOTUS_VISUAL_ID } from "./lib/visualContract";
import { C, R, TEXT, DISPLAY } from "./constants/theme.ts";
/* Thứ tự hai dòng dưới có ý nghĩa: lotus-tokens.css bắc cầu các token
   `--c-*` cũ sang `--lp-*` mới, nên nó phải nạp SAU index.css thì mới đè
   được khai báo cũ. Đảo thứ tự là bảng màu cũ thắng và cả app vẫn pastel. */
import "./index.css";
import "./styles/lotus-tokens.css";

/* Đặt ngôn ngữ thị giác và chế độ sáng/tối TRƯỚC khi React mount — nếu để
   trong component thì trang sẽ loé bảng màu cũ một nhịp rồi mới nhảy. */
(function applyTheme() {
  document.documentElement.dataset.visual = LOTUS_VISUAL_ID;
  try {
    const saved = localStorage.getItem("vmp-theme");           // "light" | "dark" | "auto"
    const mode = saved === "light" || saved === "dark" ? saved
      : (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    document.documentElement.setAttribute("data-theme", mode);
  } catch { /* riêng tư chặn localStorage thì cứ để mặc định sáng */ }
})();

// Lưới an toàn: nếu App lỗi khi render, hiện thông báo thay vì trang trắng.
interface BoundaryProps { children?: ReactNode }
interface BoundaryState { err: Error | null }

class ErrorBoundary extends React.Component<BoundaryProps, BoundaryState> {
  constructor(props: BoundaryProps) { super(props); this.state = { err: null }; }
  static getDerivedStateFromError(err: Error): BoundaryState { return { err }; }
  componentDidCatch(err: Error, info: ErrorInfo) { console.error("VMP Monitor crash:", err, info); }
  render() {
    if (this.state.err) {
      return (
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: TEXT, background: C.bg1, padding: 24 }}>
          <div style={{ maxWidth: 560, width: "100%", background: "var(--lp-sheen)", borderRadius: R.xl, padding: "30px 28px", boxShadow: "var(--e-modal)", border: "1px solid var(--lp-gold-hairline)" }}>
            <div style={{ fontSize: 40, marginBottom: 6 }} aria-hidden="true">🛠️</div>
            <h1 style={{ fontFamily: DISPLAY, fontSize: 28, fontWeight: 600, color: C.plum, margin: 0, letterSpacing: "-0.01em" }}>Ứng dụng gặp lỗi khi hiển thị</h1>
            <div style={{ fontSize: 14, color: C.plumSoft, fontWeight: 500, marginTop: 8, lineHeight: 1.6 }}>Hãy thử <b>tải lại trang</b> (giữ Ctrl/Cmd + Shift + R để xoá cache). Nếu vẫn lỗi, gửi đoạn chữ bên dưới cho người hỗ trợ:</div>
            <pre style={{ marginTop: 14, background: "var(--lp-danger-soft)", border: "1px solid var(--c-rasp)", borderRadius: R.md, padding: "12px 14px", fontSize: 12, color: "var(--c-rasp-text)", whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 220, overflow: "auto" }}>{String(this.state.err && this.state.err.stack ? this.state.err.stack : this.state.err)}</pre>
            <button onClick={() => location.reload()} style={{ marginTop: 16, padding: "11px 20px", borderRadius: R.sm, border: "none", cursor: "pointer", background: "var(--grad)", color: "#fff", fontWeight: 700, fontSize: 14, fontFamily: TEXT }}>↻ Tải lại trang</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
