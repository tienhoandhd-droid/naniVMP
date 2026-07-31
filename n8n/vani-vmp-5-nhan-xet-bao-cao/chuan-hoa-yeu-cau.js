// Node "Chuẩn hoá yêu cầu" — workflow "Vani VMP 5" (id RWwTaTtzjjfgE5np).
// Bản 2026-07-31: nhận CẢ HAI đường vào và thêm KỲ BÁO CÁO.
//
//   1. Webhook từ web  → 1 item: người dùng bấm nút trên trang Báo cáo/Cảnh báo
//   2. Schedule + rpc_ai_mail_targets → N item: mỗi phạm vi cần gửi định kỳ
//      một item, vì AI phải chạy riêng cho từng phạm vi (số của Xưởng sản
//      xuất không nói được gì về Kho).
//
// Kỳ báo cáo: web gửi { nam, thang_tu, thang_den, nhan }. Thiếu thì lấy CẢ NĂM
// hiện tại — đúng hành vi cũ, để trang Cảnh báo (không có bộ chọn kỳ) và
// đường chạy theo lịch không phải đổi gì.
//
// KỲ SAU tính ở đây chứ không tính trong SQL: kỳ luôn là dải tháng liền nhau
// nên chỉ cần cộng đúng độ dài của nó, làm bằng JS dễ đọc hơn nhiều so với
// nhồi interval vào truy vấn.
//
// Đường lịch KHÔNG bật dung_danh_sach: rpc đã lọc đúng người theo phạm vi và
// theo lịch rồi, bật thêm sẽ gửi trùng cho người khai phạm vi 'tất cả'.
//
// Trả 0 item khi hôm nay không ai tới lượt — đúng, không phải lỗi.

var items = $input.all();
var dau = (items[0] && items[0].json) || {};

function laEmail(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(s || '').trim()); }
function that(v) { return v === true || v === 'true' || v === 1 || v === '1'; }
function so(v, mac) { var n = parseInt(v, 10); return isNaN(n) ? mac : n; }

var NAM_NAY = new Date().getFullYear();

/** Chuẩn hoá kỳ + tính kỳ kế tiếp cùng độ dài. */
function dungKy(k) {
  var nam = so(k && k.nam, NAM_NAY);
  var tu = Math.min(12, Math.max(1, so(k && k.thang_tu, 1)));
  var den = Math.min(12, Math.max(tu, so(k && k.thang_den, 12)));
  var dai = den - tu + 1;
  // Cộng dồn theo chỉ số tháng tuyệt đối để kỳ sau nhảy sang năm mới đúng.
  var m0 = nam * 12 + (tu - 1) + dai;
  var namSau = Math.floor(m0 / 12);
  var tuSau = (m0 % 12) + 1;
  var denSau = tuSau + dai - 1;
  // Kỳ dài (quý/năm) có thể vắt qua giao thừa; kẹp lại trong năm để truy vấn
  // không phải xử lý hai năm cùng lúc — phần vắt sang năm sau rất hiếm dùng.
  if (denSau > 12) denSau = 12;
  return {
    nam: nam, thang_tu: tu, thang_den: den,
    nam_sau: namSau, thang_sau_tu: tuSau, thang_sau_den: denSau,
    ky_nhan: (k && k.nhan) ? String(k.nhan)
      : (tu === 1 && den === 12 ? 'năm ' + nam : 'tháng ' + tu + '-' + den + '/' + nam),
  };
}

// ---- Đường 2: chạy theo lịch ----
if (Object.prototype.hasOwnProperty.call(dau, 'muc_tieu')) {
  var ds = dau.muc_tieu;
  if (typeof ds === 'string') { try { ds = JSON.parse(ds); } catch (e) { ds = []; } }
  if (!Array.isArray(ds)) ds = [];
  var kyNam = dungKy(null);   // lịch định kỳ nhìn cả năm hiện tại
  return ds.map(function (m) {
    var mails = (m.nguoi_nhan || []).map(function (n) { return String(n.email || '').trim(); }).filter(laEmail);
    return { json: Object.assign({
      loai: 'canh_bao',
      pham_vi: String(m.pham_vi || 'all').trim() || 'all',
      gui_mail: true,
      dung_danh_sach: false,
      email_nhan: mails,
      tu_web: false,
    }, kyNam) };
  }).filter(function (x) { return x.json.email_nhan.length > 0; });
}

// ---- Đường 1: bấm nút trên web ----
return items.map(function (it) {
  var b = (it.json && it.json.body) || it.json || {};
  // Danh sách trắng, KHÔNG phải phép so hai nhánh: bản cũ viết
  //   loai === 'canh_bao' ? 'canh_bao' : 'bao_cao'
  // nên mọi giá trị mới (vd 'phan_tich_sau') bị nuốt về 'bao_cao' — thêm nhánh
  // mà quên chỗ này thì nó chạy nhánh cũ mà không báo lỗi gì.
  var LOAI_HOP_LE = ['bao_cao', 'canh_bao', 'phan_tich_sau'];
  var loaiRaw = String(b.loai || 'bao_cao').trim();
  var loai = LOAI_HOP_LE.indexOf(loaiRaw) >= 0 ? loaiRaw : 'bao_cao';
  var pv = String(b.pham_vi != null ? b.pham_vi : (b.scope != null ? b.scope : 'all')).trim() || 'all';
  var mails = Array.isArray(b.email_nhan)
    ? b.email_nhan.map(function (e) { return String(e || '').trim(); }).filter(laEmail)
    : [];
  return { json: Object.assign({
    loai: loai,
    pham_vi: pv,
    gui_mail: that(b.gui_mail),
    dung_danh_sach: that(b.dung_danh_sach),
    email_nhan: mails,
    tu_web: true,
  }, dungKy(b.ky)) };
});
