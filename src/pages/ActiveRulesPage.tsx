/* =====================================================================
 *  ActiveRulesPage.tsx — Luật hệ thống ĐANG áp dụng
 *  ---------------------------------------------------------------------
 *  Trang này KHÔNG gõ lại luật trong giao diện. Toàn bộ nội dung đọc từ
 *  rpc_active_rules(), và RPC đó lấy số liệu thẳng từ DB. Nhờ vậy trang
 *  luật không thể nói khác cái hệ thống thật sự làm — vấn đề đã từng xảy
 *  ra với tab "0.Rule timeline VMP" trong Google Sheet.
 *
 *  Dùng khi: đào tạo người mới · trả lời thanh tra "hệ thống áp luật gì" ·
 *  đối chiếu trước khi sửa luật.
 * ===================================================================== */
import { useState, useEffect } from "react";
import {
  Scale, RefreshCw, Calculator, GanttChartSquare, ShieldCheck, Lock, Info,
} from "lucide-react";
import { C, TEXT, NUM, btnPrimary } from "../constants/theme.ts";
import { Card, CardTitle, Tag } from "../components/ui/Primitives.tsx";
import { fetchActiveRules, recalcCriticality } from "../lib/supabaseData.ts";
import type { ActiveRules } from "../lib/supabaseData.ts";
import type { AppUser } from "../types/domain.ts";

/** Màu theo điểm trọng yếu 1..9 — cao thì đỏ, thấp thì xanh. */
function toneForScore(score: number) {
  if (score >= 7) return { c: C.raspText, bg: C.raspSoft };
  if (score >= 4) return { c: C.marigoldText, bg: C.marigoldSoft };
  return { c: C.mintText, bg: C.mintSoft };
}

function Section({ icon: Icon, title, sub, children }: {
  icon: typeof Scale; title: string; sub?: string; children: React.ReactNode;
}) {
  return (
    <Card>
      <CardTitle icon={Icon} sub={sub}>{title}</CardTitle>
      {children}
    </Card>
  );
}

/** Bảng hai cột đơn giản, dùng lại cho mọi mục luật. */
function Rows({ rows }: { rows: Array<[React.ReactNode, React.ReactNode]> }) {
  return (
    <table style={{ borderCollapse: "collapse", width: "100%", fontFamily: TEXT, fontSize: 13 }}>
      <tbody>
        {rows.map(([a, b], i) => (
          <tr key={i} style={{ borderBottom: `1px solid ${C.pinkMist}` }}>
            <td style={{ padding: "9px 10px 9px 0", color: C.plum, fontWeight: 700,
                         verticalAlign: "top", minWidth: 170 }}>{a}</td>
            <td style={{ padding: "9px 0", color: C.plumSoft, lineHeight: 1.6 }}>{b}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Một trục chấm điểm: từng mức kèm tiêu chí và ví dụ thiết bị.
 *  Ví dụ là phần quan trọng nhất — không có nó thì "Cao / Trung bình /
 *  Thấp" chỉ là ba chữ, QA không đối chiếu được thiết bị của mình. */
function ScoreAxis({ title, muc }: {
  title: string;
  muc: Array<{ muc: string; diem: number; mo_ta?: string; vi_du?: string }>;
}) {
  return (
    <div>
      <div style={{ fontSize: 12.5, fontWeight: 800, color: C.plum, marginBottom: 8 }}>
        {title}
      </div>
      <div style={{ display: "grid", gap: 9 }}>
        {muc.map((x) => {
          const t = toneForScore(x.diem === 3 ? 9 : x.diem === 2 ? 6 : 3);
          return (
            <div key={x.muc} style={{ padding: "10px 12px", borderRadius: 12,
                                      background: t.bg, fontFamily: TEXT }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 9 }}>
                <span style={{ fontFamily: NUM, fontSize: 18, fontWeight: 800, color: t.c }}>
                  {x.diem}
                </span>
                <span style={{ fontSize: 12.5, fontWeight: 800, color: t.c }}>{x.muc}</span>
              </div>
              {x.mo_ta && (
                <div style={{ fontSize: 12, color: C.plumSoft, lineHeight: 1.6, marginTop: 5 }}>
                  {x.mo_ta}
                </div>
              )}
              {x.vi_du && (
                <div style={{ fontSize: 11.5, color: C.plumSoft, lineHeight: 1.7, marginTop: 6,
                              paddingTop: 6, borderTop: `1px solid ${C.pinkMist}` }}>
                  <b style={{ color: t.c }}>Ví dụ: </b>{x.vi_du}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function ActiveRulesView({ user }: { user?: AppUser | null }) {
  const canRun = user?.perm === "admin";
  const [rules, setRules] = useState<ActiveRules | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = async () => {
    setLoading(true); setErr("");
    try { setRules(await fetchActiveRules()); }
    catch (e) { setErr((e as Error).message || "Lỗi đọc luật"); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const recalc = async () => {
    if (!window.confirm(
      "Chấm lại điểm trọng yếu cho các đối tượng CHƯA được QA chốt tay?\n\n"
      + "Dòng nào QA đã sửa (nguồn = 'đã duyệt') sẽ KHÔNG bị ghi đè.")) return;
    setBusy(true);
    try {
      const r = await recalcCriticality(true);
      alert(r.msg || "Đã chấm lại");
      await load();
    } catch (e) { alert("Lỗi: " + ((e as Error).message || "không rõ")); }
    setBusy(false);
  };

  if (loading) return <Card><div style={{ padding: 20, color: C.plumSoft }}>Đang tải luật…</div></Card>;
  if (err) return (
    <Card><div style={{ padding: 16, borderRadius: 10, background: C.raspSoft,
                        color: C.raspText, fontSize: 13 }}>{err}</div></Card>
  );
  if (!rules) return null;

  const dtl = rules.diem_trong_yeu;
  const tl = rules.sinh_timeline;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Lời dẫn */}
      <Card variant="strong">
        <CardTitle icon={Scale}
          sub={`Đọc thẳng từ database · cập nhật ${new Date(rules.cap_nhat).toLocaleString("vi-VN")}`}>
          Luật hệ thống đang áp dụng
        </CardTitle>
        <div style={{ display: "flex", gap: 9, alignItems: "flex-start", padding: "11px 13px",
                      borderRadius: 12, background: C.skySoft, color: C.skyText,
                      fontSize: 12.5, fontFamily: TEXT, lineHeight: 1.6 }}>
          <Info size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            Nội dung trang này <b>không được gõ tay trong giao diện</b> — mọi con số và quy tắc
            đọc trực tiếp từ database. Nhờ vậy trang luật không thể mô tả khác cái hệ thống thật
            sự làm. Dùng khi đào tạo người mới, khi thanh tra hỏi "hệ áp luật gì", và khi cần
            đối chiếu trước lúc sửa luật.
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
          {[["Đối tượng nguồn", rules.so_lieu_hien_tai.doi_tuong_nguon],
            ["Có thẩm định", rules.so_lieu_hien_tai.co_tham_dinh],
            ["Hạng mục timeline", rules.so_lieu_hien_tai.hang_muc],
            ["Bản ghi audit", rules.so_lieu_hien_tai.ban_ghi_audit]].map(([l, v]) => (
            <div key={String(l)} style={{ padding: "9px 15px", borderRadius: 12,
                                          background: C.pinkMist, minWidth: 130 }}>
              <div style={{ fontFamily: NUM, fontSize: 19, fontWeight: 800, color: C.plum }}>
                {Number(v).toLocaleString("vi-VN")}
              </div>
              <div style={{ fontSize: 11.5, color: C.plumSoft, fontWeight: 700 }}>{l}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Điểm trọng yếu */}
      <Section icon={Calculator} title="Điểm trọng yếu"
        sub="Công thức lấy từ tab '0.Rule timeline VMP' trong Google Sheet">
        <div style={{ padding: "12px 14px", borderRadius: 12, background: C.lavSoft,
                      color: C.lavText, fontFamily: TEXT, fontSize: 14, fontWeight: 800,
                      marginBottom: 14 }}>
          {dtl.cong_thuc}
          <span style={{ marginLeft: 10, fontSize: 12, fontWeight: 700, opacity: 0.8 }}>
            (thang {dtl.thang})
          </span>
        </div>

        <div style={{ display: "grid", gap: 14,
                      gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
          <ScoreAxis title="Điểm mức độ phức tạp" muc={dtl.phuc_tap} />
          <ScoreAxis title="Điểm ảnh hưởng tới chất lượng sản phẩm" muc={dtl.anh_huong} />
        </div>

        <div style={{ fontSize: 12.5, fontWeight: 800, color: C.plum, margin: "16px 0 8px" }}>
          Phân bố điểm hiện tại
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {dtl.phan_bo.map((x) => {
            const t = toneForScore(x.diem);
            return (
              <div key={x.diem} style={{ padding: "8px 14px", borderRadius: 12,
                                         background: t.bg, color: t.c, fontFamily: TEXT }}>
                <span style={{ fontFamily: NUM, fontSize: 17, fontWeight: 800 }}>{x.diem}</span>
                <span style={{ fontSize: 12, fontWeight: 700, marginLeft: 7 }}>
                  {x.so_luong} đối tượng
                </span>
              </div>
            );
          })}
        </div>

        {dtl.phan_bo_truc && (
          <div style={{ marginTop: 16, padding: "11px 13px", borderRadius: 12,
                        background: C.skySoft, color: C.skyText,
                        fontSize: 12.5, fontFamily: TEXT, lineHeight: 1.65 }}>
            <b>Sức phân biệt của từng trục</b>
            <div style={{ display: "grid", gap: 10, marginTop: 8,
                          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
              {([["Mức độ phức tạp", dtl.phan_bo_truc.phuc_tap],
                 ["Ảnh hưởng chất lượng", dtl.phan_bo_truc.anh_huong]] as const).map(([lb, arr]) => {
                const tong = arr.reduce((a, x) => a + x.so_luong, 0) || 1;
                const lonNhat = Math.max(...arr.map((x) => x.so_luong));
                const tapTrung = Math.round((lonNhat / tong) * 100);
                return (
                  <div key={lb}>
                    <div style={{ fontWeight: 800 }}>{lb}</div>
                    {arr.map((x) => (
                      <div key={x.diem}>
                        điểm {x.diem}: {x.so_luong} ({Math.round((x.so_luong / tong) * 100)}%)
                      </div>
                    ))}
                    <div style={{ marginTop: 3, fontWeight: 700,
                                  color: tapTrung >= 90 ? C.raspText : C.skyText }}>
                      {tapTrung >= 90
                        ? `⚠️ ${tapTrung}% dồn vào một mức — trục này gần như không phân biệt`
                        : `Phân tán tốt (mức đông nhất ${tapTrung}%)`}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 14 }}>
          <Tag color={C.marigoldText} bg={C.marigoldSoft}>{dtl.cho_duyet} chờ QA duyệt</Tag>
          <Tag color={C.mintText} bg={C.mintSoft}>{dtl.da_duyet} đã duyệt</Tag>
          {canRun && (
            <button onClick={recalc} disabled={busy}
              style={{ ...btnPrimary, background: C.surface, color: C.plum,
                       border: `1.5px solid ${C.pinkSoft}`, opacity: busy ? 0.6 : 1 }}>
              <RefreshCw size={15} /> {busy ? "Đang chấm…" : "Chấm lại (không đụng dòng đã duyệt)"}
            </button>
          )}
        </div>

        <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 12,
                      background: C.marigoldSoft, color: C.marigoldText,
                      fontSize: 12.5, fontFamily: TEXT, lineHeight: 1.6 }}>
          <b>Điểm do máy chấm là ĐỀ XUẤT, không phải quyết định.</b> Chấm rủi ro là phán quyết
          chuyên môn GMP. Máy phân loại theo từ khoá trong tên đối tượng — minh bạch và tái lập
          được — rồi đánh dấu "chờ QA duyệt". Khi QA sửa tay ở màn <b>Danh mục nguồn</b>, dòng đó
          chuyển sang "đã duyệt" và lần chấm tự động sau <b>không ghi đè</b>.
        </div>
      </Section>

      {/* Sinh timeline */}
      <Section icon={GanttChartSquare} title="Luật sinh hạng mục timeline"
        sub="Rà từ workflow VMP01, nay cài trong rpc_generate_timeline">
        <Rows rows={[
          ["Điều kiện lọc", tl.loc],
          ["Loại thẩm định", (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {tl.loai_tham_dinh.map((x) => (
                <div key={x.phan_loai}>
                  <b style={{ color: C.plum }}>{x.phan_loai}</b> → {x.loai}
                </div>
              ))}
            </div>
          )],
          ["Điều kiện \"lần đầu\"", tl.lan_dau],
          ["Số lần trong năm", tl.so_lan_trong_nam],
          ["Quy ước mã", <code style={{ fontSize: 12.5 }}>{tl.ma_id}</code>],
          ["Mốc thời gian", (
            <ol style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
              {tl.moc_thoi_gian.map((m, i) => <li key={i}>{m}</li>)}
            </ol>
          )],
          ["Khoảng cách báo cáo", (
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {tl.khoang_cach_bao_cao.map((x) => (
                <div key={x.dieu_kien}>
                  {x.dieu_kien} → <b style={{ color: C.plum }}>{x.ngay} ngày</b>
                </div>
              ))}
            </div>
          )],
        ]} />
      </Section>

      {/* Phân quyền */}
      <Section icon={Lock} title="Phân quyền"
        sub="Kiểm tra nằm phía server trong RPC — giao diện chỉ ẩn nút cho gọn, không phải lớp bảo mật">
        <Rows rows={rules.phan_quyen.map((x) => [
          <code key={x.vai_tro} style={{ fontSize: 12.5 }}>{x.vai_tro}</code>, x.quyen,
        ])} />
      </Section>

      {/* Toàn vẹn dữ liệu */}
      <Section icon={ShieldCheck} title="Luật toàn vẹn dữ liệu"
        sub="Các ràng buộc luôn được áp, không tắt được từ giao diện">
        <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 2, fontSize: 13,
                     color: C.plumSoft, fontFamily: TEXT }}>
          {rules.toan_ven_du_lieu.map((x, i) => <li key={i}>{x}</li>)}
        </ul>
      </Section>
    </div>
  );
}
