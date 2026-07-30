// Node "Đóng gói cho web" — workflow "Vani VMP 5" (id RWwTaTtzjjfgE5np).
// Bản 2026-07-30: chạy cho MỌI item, và dựng thêm bản HTML cho email.
//
// Web và mail dùng CHUNG một lần chạy AI: nếu tách ra thì cùng một phạm vi sẽ
// có hai bản chữ khác nhau, người đọc mail và người xem web sẽ cãi nhau về số.
//
// Cũng chốt luôn danh sách người nhận cuối cùng ở đây: email gõ tay/chọn tay
// (email_nhan) hợp với danh sách định kỳ khớp phạm vi (nếu bật dung_danh_sach).
// Nếu chốt xong mà rỗng thì HẠ gui_mail xuống false — để nhánh gửi mail không
// chạy rỗng rồi làm webhook treo không ai trả lời.

function doc(v) {
  if (!v) return null;
  if (typeof v === 'object') return v;
  var s = String(v).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(s); } catch (e) {
    var a = s.indexOf('{'), b = s.lastIndexOf('}');
    if (a >= 0 && b > a) { try { return JSON.parse(s.slice(a, b + 1)); } catch (e2) { /* chịu */ } }
    return null;
  }
}

// Ép về mảng chuỗi. BẮT BUỘC phải phòng thủ: mô hình thường trả một trường
// lẽ ra là mảng thành CHUỖI, mà chuỗi cũng có .length nên bản cũ lọt qua rồi
// vỡ ở .forEach ("arr.forEach is not a function") — hỏng cả báo cáo chỉ vì AI
// lệch định dạng. Đã gặp thật ở execution 3103212 (keHoachThangToi trả chuỗi).
function veMang(v) {
  if (Array.isArray(v)) return v.filter(function (x) { return x != null && x !== ''; })
    .map(function (x) { return typeof x === 'string' ? x : JSON.stringify(x); });
  if (typeof v === 'string') return v.trim() ? [v.trim()] : [];
  if (v == null) return [];
  return [JSON.stringify(v)];
}

// Chữ do AI sinh đi thẳng vào HTML gửi ra ngoài — phải escape, không có ngoại lệ.
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function laEmail(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(s || '').trim()); }

var ctxAll = $('Dựng prompt tổng hợp').all().map(function (i) { return i.json; });

return $input.all().map(function (it, idx) {
  var raw = it.json || {};
  var th = doc(raw.text != null ? raw.text : raw.output) || {};
  var ctx = ctxAll[idx] || ctxAll[0] || {};
  var d = ctx.du_lieu || {};
  var laCanhBao = ctx.loai === 'canh_bao';

  var NHAN = laCanhBao
    ? { tienDo: 'QUÁ HẠN NẶNG NHẤT', ruiRo: 'THỨ TỰ XỬ LÝ THEO RỦI RO', phanCong: 'AI ĐANG ÔM NHIỀU VIỆC TRỄ',
        mucTieu: 'SO VỚI MỤC TIÊU 50%/THÁNG', batCap: 'BỘ PHẬN ĐANG NGHẼN', thangToi: 'SẮP TỚI HẠN — CHUẨN BỊ NGAY',
        uuTien: 'VIỆC PHẢI LÀM TUẦN TỚI' }
    : { tienDo: 'TIẾN ĐỘ & QUÁ HẠN', ruiRo: 'THỨ TỰ RỦI RO & HỒ SƠ', phanCong: 'PHÂN CÔNG & TẢI VIỆC',
        mucTieu: 'SO VỚI MỤC TIÊU 50%/THÁNG', batCap: 'BẤT CẬP THEO BỘ PHẬN', thangToi: 'KẾ HOẠCH THÁNG TỚI',
        uuTien: 'VIỆC ƯU TIÊN TUẦN TỚI' };

  // ---------- Bản chữ cho web ----------
  var L = [];
  function muc(ten, v) {
    var xs = veMang(v);
    if (!xs.length) return;
    L.push('', ten);
    xs.forEach(function (x) { L.push('· ' + x); });
  }

  if (th.tieuDe) L.push(th.tieuDe);
  if (th.tomTat) L.push('', th.tomTat);
  if (th.mucRuiRoTongThe) L.push('', 'Mức rủi ro tổng thể: ' + th.mucRuiRoTongThe);
  muc(NHAN.tienDo, th.tienDo);
  muc(NHAN.ruiRo, th.ruiRo);
  muc(NHAN.phanCong, th.phanCong);
  muc(NHAN.mucTieu, th.soSanhMucTieu);
  muc(NHAN.batCap, th.batCapBoPhan);
  muc(NHAN.thangToi, th.keHoachThangToi);
  muc('BẰNG CHỨNG CHÍNH', th.bangChungChinh);
  var uuTien = veMang(th.viecUuTien);
  if (uuTien.length) {
    L.push('', NHAN.uuTien);
    uuTien.forEach(function (x, i) { L.push((i + 1) + '. ' + x); });
  }
  muc('GIỚI HẠN DỮ LIỆU', th.luuYDuLieu);
  L.push('', th.gioiHanAI || 'AI chỉ hỗ trợ nhận định, không thay thế đánh giá của QA và không phải căn cứ phê duyệt GMP.');
  if (th.confidence != null) L.push('Độ tin cậy tự đánh giá: ' + th.confidence);
  if (!th.tieuDe && !th.tomTat) L.push('Không đọc được kết quả AI — xem workflow_runs để tra.');
  var aiText = L.join('\n');

  // ---------- Chốt người nhận ----------
  var nguoi = {};
  (ctx.email_nhan || []).forEach(function (e) {
    if (laEmail(e)) nguoi[String(e).trim().toLowerCase()] = { email: String(e).trim(), ten: '' };
  });
  if (ctx.dung_danh_sach) {
    (d.nguoi_nhan_danh_sach || []).forEach(function (n) {
      var e = String(n.email || '').trim();
      if (!laEmail(e)) return;
      var k = e.toLowerCase();
      if (!nguoi[k] || !nguoi[k].ten) nguoi[k] = { email: e, ten: String(n.ten || '') };
    });
  }
  var dsNhan = Object.keys(nguoi).map(function (k) { return nguoi[k]; });
  var thucSuGui = !!ctx.gui_mail && dsNhan.length > 0;

  // ---------- Bản HTML cho mail ----------
  var tieuDe = th.tieuDe || (laCanhBao ? 'Phân tích cảnh báo VMP' : 'Nhận xét AI cho báo cáo VMP');
  var phamViChu = ctx.pham_vi === 'all' ? 'Toàn nhà máy' : ('Bộ phận ' + ctx.pham_vi);
  var mau = laCanhBao ? '#b00020' : '#6b46a8';
  var subject = '[VMP] ' + (laCanhBao ? 'Phân tích cảnh báo' : 'Nhận xét báo cáo')
    + ' · ' + phamViChu + ' · ' + (d.ngay_chay || '');

  function khoiHtml(ten, v) {
    var xs = veMang(v);
    if (!xs.length) return '';
    return '<div style="margin-top:16px">'
      + '<div style="font-size:12px;font-weight:bold;color:' + mau + ';letter-spacing:.6px">' + esc(ten) + '</div>'
      + '<ul style="margin:6px 0 0;padding-left:20px;color:#222;font-size:13.5px;line-height:1.65">'
      + xs.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('')
      + '</ul></div>';
  }

  var soQuaHan = ctx.so_qua_han || 0;
  var soSapToiHan = (d.sap_toi_han_60_ngay || []).length;
  var oSo = [
    ['Tổng hạng mục', d.tong_hang_muc || 0],
    ['Đang quá hạn', soQuaHan],
    ['Tới hạn ≤ 60 ngày', soSapToiHan],
    ['Chưa phân công', d.chua_phan_cong || 0],
  ].map(function (p) {
    return '<td style="padding:10px 14px;background:#f7f4fb;border-radius:10px">'
      + '<div style="font-size:11px;color:#777">' + esc(p[0]) + '</div>'
      + '<div style="font-size:20px;font-weight:bold;color:#2d1b45">' + esc(p[1]) + '</div></td>';
  }).join('<td style="width:8px"></td>');

  // Bảng quá hạn nặng nhất: phần KHÔNG do AI viết — mã và số lấy thẳng từ truy
  // vấn. Người đọc mail cần một chỗ chắc chắn đúng để đối chiếu với phần chữ.
  var hangQuaHan = (d.qua_han || []).slice(0, 15).map(function (q) {
    return '<tr>'
      + '<td style="padding:6px 10px;border-top:1px solid #eee;font-size:12.5px"><b>' + esc(q.ma) + '</b></td>'
      + '<td style="padding:6px 10px;border-top:1px solid #eee;font-size:12.5px">' + esc(q.ten) + '</td>'
      + '<td style="padding:6px 10px;border-top:1px solid #eee;font-size:12.5px">' + esc(q.nguoi) + '</td>'
      + '<td style="padding:6px 10px;border-top:1px solid #eee;font-size:12.5px;text-align:center">' + esc(q.diem) + '</td>'
      + '<td style="padding:6px 10px;border-top:1px solid #eee;font-size:12.5px;text-align:center;color:#b00020"><b>' + esc(q.tre_ngay) + '</b></td>'
      + '</tr>';
  }).join('');

  var bangQuaHan = hangQuaHan
    ? '<div style="margin-top:20px">'
      + '<div style="font-size:12px;font-weight:bold;color:#b00020;letter-spacing:.6px">SỐ GỐC — QUÁ HẠN NẶNG NHẤT (không do AI viết)</div>'
      + '<table style="border-collapse:collapse;width:100%;margin-top:6px">'
      + '<tr style="text-align:left;color:#777;font-size:11px">'
      + '<th style="padding:4px 10px">Mã</th><th style="padding:4px 10px">Hạng mục</th>'
      + '<th style="padding:4px 10px">Phụ trách</th><th style="padding:4px 10px;text-align:center">Trọng yếu</th>'
      + '<th style="padding:4px 10px;text-align:center">Trễ (ngày)</th></tr>'
      + hangQuaHan + '</table>'
      + ((d.qua_han || []).length > 15
        ? '<div style="font-size:11px;color:#999;margin-top:5px">Đang hiện 15/' + (d.qua_han || []).length + ' hạng mục quá hạn — xem đủ trên dashboard.</div>'
        : '')
      + '</div>'
    : '';

  var html = '<div style="font-family:Arial,Helvetica,sans-serif;max-width:720px;margin:0 auto;border:1px solid #eee;border-radius:12px;overflow:hidden">'
    + '<div style="background:' + mau + ';color:#fff;padding:14px 18px">'
    + '<div style="font-size:16px;font-weight:bold">VMP Monitor · ' + esc(tieuDe) + '</div>'
    + '<div style="font-size:12px;opacity:.9;margin-top:3px">' + esc(phamViChu) + ' · số liệu ngày ' + esc(d.ngay_chay || '') + '</div>'
    + '</div>'
    + '<div style="padding:18px">'
    + (th.tomTat ? '<div style="font-size:14px;line-height:1.7;color:#222">' + esc(th.tomTat) + '</div>' : '')
    + (th.mucRuiRoTongThe ? '<div style="margin-top:10px;display:inline-block;padding:5px 12px;border-radius:999px;background:#f3eefa;color:' + mau + ';font-size:12px;font-weight:bold">Mức rủi ro tổng thể: ' + esc(th.mucRuiRoTongThe) + '</div>' : '')
    + '<table style="border-collapse:separate;border-spacing:0;margin-top:16px;width:100%"><tr>' + oSo + '</tr></table>'
    + khoiHtml(NHAN.tienDo, th.tienDo)
    + khoiHtml(NHAN.ruiRo, th.ruiRo)
    + khoiHtml(NHAN.phanCong, th.phanCong)
    + khoiHtml(NHAN.mucTieu, th.soSanhMucTieu)
    + khoiHtml(NHAN.batCap, th.batCapBoPhan)
    + khoiHtml(NHAN.thangToi, th.keHoachThangToi)
    + khoiHtml(NHAN.uuTien, th.viecUuTien)
    + khoiHtml('BẰNG CHỨNG CHÍNH', th.bangChungChinh)
    + khoiHtml('GIỚI HẠN DỮ LIỆU', th.luuYDuLieu)
    + bangQuaHan
    + '<div style="margin-top:20px;padding-top:12px;border-top:1px solid #eee;font-size:11px;color:#999;line-height:1.6">'
    + esc(th.gioiHanAI || 'AI chỉ hỗ trợ nhận định, không thay thế đánh giá của QA và không phải căn cứ phê duyệt GMP.')
    + (th.confidence != null ? ' · Độ tin cậy AI tự đánh giá: ' + esc(th.confidence) : '')
    + '<br/>Mail tự động từ VMP Monitor (workflow Vani VMP 5). Phần chữ do AI soạn — CẦN QA XÁC NHẬN trước khi dùng làm căn cứ.'
    + '</div></div></div>';

  return { json: {
    ok: true,
    loai: ctx.loai,
    ai_text: aiText,
    html: html,
    tieu_de_mail: subject,
    chi_tiet: { tong_hop: th },
    so_hang_muc: d.tong_hang_muc || 0,
    so_qua_han: soQuaHan,
    pham_vi: ctx.pham_vi,
    tu_web: ctx.tu_web,
    gui_mail: thucSuGui,
    // Nói thật vì sao không gửi, thay vì im lặng trả ok rồi để người dùng ngồi
    // đợi một cái mail không bao giờ tới.
    ghi_chu_mail: ctx.gui_mail && !thucSuGui ? 'Không có địa chỉ nhận nào hợp lệ nên không gửi mail.' : '',
    nguoi_nhan: dsNhan,
    goc_idx: idx,
    nguon: 'gpt-4o-mini',
    luc: new Date().toISOString(),
  } };
});
