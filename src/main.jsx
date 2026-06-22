import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

// Lưới an toàn: nếu App lỗi khi render, hiện thông báo thay vì trang trắng.
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err, info) { console.error("VMP Monitor crash:", err, info); }
  render() {
    if (this.state.err) {
      return (
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Quicksand, system-ui, sans-serif", background: "linear-gradient(160deg,#FFF1F6,#F3ECFB)", padding: 24 }}>
          <div style={{ maxWidth: 560, width: "100%", background: "#fff", borderRadius: 22, padding: "30px 28px", boxShadow: "0 18px 48px rgba(238,123,169,.18)", border: "1.5px solid #FBD6E6" }}>
            <div style={{ fontSize: 40, marginBottom: 6 }}>🛠️</div>
            <div style={{ fontSize: 21, fontWeight: 800, color: "#7A4A6E" }}>Ứng dụng gặp lỗi khi hiển thị</div>
            <div style={{ fontSize: 14, color: "#9B7B96", fontWeight: 600, marginTop: 8, lineHeight: 1.6 }}>Hãy thử <b>tải lại trang</b> (giữ Ctrl/Cmd + Shift + R để xoá cache). Nếu vẫn lỗi, gửi đoạn chữ đỏ bên dưới cho người hỗ trợ:</div>
            <pre style={{ marginTop: 14, background: "#FFF1F6", border: "1px solid #FBD6E6", borderRadius: 12, padding: "12px 14px", fontSize: 12.5, color: "#C0306B", whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 220, overflow: "auto" }}>{String(this.state.err && this.state.err.stack ? this.state.err.stack : this.state.err)}</pre>
            <button onClick={() => location.reload()} style={{ marginTop: 16, padding: "11px 20px", borderRadius: 12, border: "none", cursor: "pointer", background: "linear-gradient(135deg,#F8A5C8,#EE7BA9)", color: "#fff", fontWeight: 800, fontSize: 14, fontFamily: "inherit" }}>↻ Tải lại trang</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
