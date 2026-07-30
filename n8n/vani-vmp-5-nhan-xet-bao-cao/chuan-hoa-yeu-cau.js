// Node "Chuẩn hoá yêu cầu" — workflow "Vani VMP 5" (id RWwTaTtzjjfgE5np).
// Bản 2026-07-30: nhận CẢ HAI đường vào, trả về cùng một hình dạng để phần
// sau không phải biết mình đang chạy vì ai.
//
//   1. Webhook từ web  → 1 item: người dùng bấm nút trên trang Báo cáo/Cảnh báo
//   2. Schedule + rpc_ai_mail_targets → N item: mỗi phạm vi cần gửi định kỳ
//      một item, vì AI phải chạy riêng cho từng phạm vi (số của Xưởng sản
//      xuất không nói được gì về Kho).
//
// Đường lịch KHÔNG bật dung_danh_sach: rpc đã lọc đúng người theo phạm vi và
// theo lịch rồi, bật thêm sẽ gửi trùng cho người phạm vi 'tất cả'.
//
// Trả 0 item khi hôm nay không ai tới lượt — đúng, không phải lỗi. Các node
// sau tự bỏ qua, không cần cổng IF.

var items = $input.all();
var dau = (items[0] && items[0].json) || {};

function laEmail(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(s || '').trim()); }
function that(v) { return v === true || v === 'true' || v === 1 || v === '1'; }

// ---- Đường 2: chạy theo lịch ----
if (Object.prototype.hasOwnProperty.call(dau, 'muc_tieu')) {
  var ds = dau.muc_tieu;
  if (typeof ds === 'string') { try { ds = JSON.parse(ds); } catch (e) { ds = []; } }
  if (!Array.isArray(ds)) ds = [];
  return ds.map(function (m) {
    var mails = (m.nguoi_nhan || []).map(function (n) { return String(n.email || '').trim(); }).filter(laEmail);
    return { json: {
      loai: 'canh_bao',
      pham_vi: String(m.pham_vi || 'all').trim() || 'all',
      gui_mail: true,
      dung_danh_sach: false,
      email_nhan: mails,
      tu_web: false,
    } };
  }).filter(function (x) { return x.json.email_nhan.length > 0; });
}

// ---- Đường 1: bấm nút trên web ----
return items.map(function (it) {
  var b = (it.json && it.json.body) || it.json || {};
  var loai = String(b.loai || 'bao_cao').trim() === 'canh_bao' ? 'canh_bao' : 'bao_cao';
  var pv = String(b.pham_vi != null ? b.pham_vi : (b.scope != null ? b.scope : 'all')).trim() || 'all';
  var mails = Array.isArray(b.email_nhan)
    ? b.email_nhan.map(function (e) { return String(e || '').trim(); }).filter(laEmail)
    : [];
  return { json: {
    loai: loai,
    pham_vi: pv,
    gui_mail: that(b.gui_mail),
    dung_danh_sach: that(b.dung_danh_sach),
    email_nhan: mails,
    tu_web: true,
  } };
});
