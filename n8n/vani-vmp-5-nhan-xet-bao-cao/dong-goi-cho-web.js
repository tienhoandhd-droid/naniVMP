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

// Người dùng chốt 2026-07-31: mail phải có CẢ dữ liệu thô LẪN phần phân tích.
// Cùng ngày, BỎ mục "phân công & tải việc" khỏi báo cáo — cả khối chữ lẫn ô
// "Chưa phân công". Cột "Người thực hiện" trong dữ liệu thô thì GIỮ: đó là để
// nhận diện hạng mục, không phải phép đo tải việc.
// 448 dòng x 18 cột nhồi vào thân mail thì hộp thư nào cũng cắt, nên: bảng gọn
// 60 dòng đầu trong thân để đọc ngay, còn TOÀN BỘ đính kèm dưới dạng CSV.
var COT_THO = [
  ['ma', 'Mã'], ['ten', 'Tên hạng mục'], ['loai', 'Loại'], ['bo_phan', 'Bộ phận'],
  ['khu_vuc', 'Khu vực'], ['nguoi', 'Người thực hiện'], ['diem', 'Điểm trọng yếu'],
  ['trang_thai', 'Trạng thái'], ['tre_ngay', 'Trễ (ngày)'], ['han', 'Hạn VMP'],
  ['dl_de_cuong', 'Hạn đề cương'], ['dl_tham_dinh', 'Hạn thẩm định'], ['dl_bao_cao', 'Hạn báo cáo'],
  ['ngay_xong', 'Ngày hoàn thành'], ['de_cuong', 'TT đề cương'], ['tham_dinh', 'TT thẩm định'],
  ['bao_cao', 'TT báo cáo'], ['vmp', 'TT VMP'],
];

function oCsv(v) {
  if (v == null) return '';
  var s = Array.isArray(v) ? v.join('+') : String(v);
  return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function dungCsv(rows) {
  var L = [COT_THO.map(function (c) { return oCsv(c[1]); }).join(';')];
  rows.forEach(function (r) {
    L.push(COT_THO.map(function (c) { return oCsv(r[c[0]]); }).join(';'));
  });
  // Dấu ; và BOM UTF-8: Excel bản tiếng Việt mở CSV phẩy ra một cột và làm
  // hỏng dấu — đã gặp ở bản xuất trước.
  return '\ufeff' + L.join('\r\n');
}


/* ===================== BIỂU ĐỒ CHO EMAIL =====================
 * Hộp thư KHÔNG chạy JavaScript, và Gmail còn cắt luôn thẻ <svg>. Nên biểu
 * đồ trong mail phải dựng bằng BẢNG HTML lồng nhau + width phần trăm +
 * bgcolor — kỹ thuật cũ nhưng là thứ duy nhất hiện đúng ở cả Gmail, Outlook
 * lẫn app điện thoại. Đừng thay bằng SVG hay <canvas>, người nhận sẽ thấy ô
 * trống.
 *
 * Phần "động" thật nằm ở link dashboard cuối mail — mail chỉ là ảnh chụp.
 * ============================================================= */

var TRANG_DASHBOARD = 'https://tienhoandhd-droid.github.io/naniVMP/';

function thanh(pct, mau, cao) {
  var p = Math.max(0, Math.min(100, Math.round(pct || 0)));
  return '<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;table-layout:fixed"><tr>'
    + (p > 0 ? '<td width="' + p + '%" bgcolor="' + mau + '" style="height:' + (cao || 14) + 'px;font-size:1px;line-height:1px">&nbsp;</td>' : '')
    + (p < 100 ? '<td bgcolor="#ece7f1" style="height:' + (cao || 14) + 'px;font-size:1px;line-height:1px">&nbsp;</td>' : '')
    + '</tr></table>';
}

function dongBieuDo(nhan, noiDung, ghiChu) {
  return '<tr>'
    + '<td width="86" style="font-size:11.5px;color:#555;padding:4px 8px 4px 0;white-space:nowrap">' + esc(nhan) + '</td>'
    + '<td style="padding:4px 0">' + noiDung + '</td>'
    + '<td width="132" style="font-size:11.5px;color:#555;padding:4px 0 4px 8px;white-space:nowrap">' + esc(ghiChu) + '</td>'
    + '</tr>';
}

function khungBieuDo(tieu, than, chuThich) {
  if (!than) return '';
  return '<div style="margin-top:22px">'
    + '<div style="font-size:12px;font-weight:bold;color:#2d1b45;letter-spacing:.6px">' + esc(tieu) + '</div>'
    + (chuThich ? '<div style="font-size:11px;color:#888;margin:3px 0 6px">' + chuThich + '</div>' : '<div style="height:6px"></div>')
    + '<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">' + than + '</table>'
    + '</div>';
}

/** 12 tháng so mục tiêu 50%. Tháng chưa tới kỳ KHÔNG vẽ cột tỷ lệ — vẽ ra là
 *  kết luận sai; chỉ ghi khối lượng sắp đến hạn. */
function bieuDoThang(rows, thangTrongKy) {
  var than = (rows || []).map(function (r) {
    var trongKy = (thangTrongKy || []).indexOf(r.thang) >= 0;
    var nhan = (trongKy ? '\u25B8 ' : '') + 'T' + r.thang;
    if (r.can_hoan_thanh === 0) return dongBieuDo(nhan, thanh(0, '#ccc'), 'chưa có hạng mục');
    if (r.ky === 'chua_toi') return dongBieuDo(nhan, thanh(0, '#ccc'), r.can_hoan_thanh + ' sẽ đến hạn');
    var mau = r.ky === 'dang_dien_ra' ? '#e8a33d' : (r.ty_le >= r.muc_tieu ? '#2e9e6b' : '#c0405f');
    var ghi = r.ty_le + '% (' + r.da_hoan_thanh + '/' + r.can_hoan_thanh + ')'
      + (r.ky === 'dang_dien_ra' ? ' giữa kỳ' : '');
    return dongBieuDo(nhan, thanh(r.ty_le, mau), ghi);
  }).join('');
  return khungBieuDo('TỶ LỆ HOÀN THÀNH VMP THEO THÁNG — MỤC TIÊU 50%', than,
    'Xanh = đạt · Đỏ = chưa đạt · Cam = tháng đang diễn ra (số giữa kỳ) · Xám = chưa tới kỳ. Mũi thọn ▸ là tháng thuộc kỳ đang xem.');
}

/** Bộ phận nghẽn ở giai đoạn nào — ba thanh cạnh nhau, cùng một thang đo. */
function bieuDoBoPhan(rows) {
  var ds = (rows || []).filter(function (r) {
    return (r.cham_de_cuong + r.cham_tham_dinh + r.cham_bao_cao) > 0;
  }).slice(0, 8);
  if (!ds.length) return '';
  var max = 1;
  ds.forEach(function (r) { max = Math.max(max, r.cham_de_cuong, r.cham_tham_dinh, r.cham_bao_cao); });
  var than = ds.map(function (r) {
    var ba = '<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">'
      + '<tr><td style="padding:1px 0">' + thanh(100 * r.cham_de_cuong / max, '#8b6fc7', 9) + '</td></tr>'
      + '<tr><td style="padding:1px 0">' + thanh(100 * r.cham_tham_dinh / max, '#3f8fc4', 9) + '</td></tr>'
      + '<tr><td style="padding:1px 0">' + thanh(100 * r.cham_bao_cao / max, '#d4699a', 9) + '</td></tr>'
      + '</table>';
    return dongBieuDo(r.bo_phan, ba,
      'ĐC ' + r.cham_de_cuong + ' · TĐ ' + r.cham_tham_dinh + ' · BC ' + r.cham_bao_cao);
  }).join('');
  return khungBieuDo('BỘ PHẬN ĐANG NGHẼN Ở GIAI ĐOẠN NÀO', than,
    '<span style="color:#8b6fc7">\u25A0</span> chậm đề cương &nbsp; '
    + '<span style="color:#3f8fc4">\u25A0</span> chậm thẩm định thực tế &nbsp; '
    + '<span style="color:#d4699a">\u25A0</span> chậm báo cáo');
}

/** Khối lượng kỳ sau theo bộ phận. */
function bieuDoKySau(items, nhanKy) {
  var dem = {};
  (items || []).forEach(function (it) {
    (it.bo_phan || []).forEach(function (bp) { dem[bp] = (dem[bp] || 0) + 1; });
  });
  var ds = Object.keys(dem).map(function (k) { return { bp: k, n: dem[k] }; })
    .sort(function (a, b) { return b.n - a.n; }).slice(0, 8);
  if (!ds.length) return '';
  var max = ds[0].n || 1;
  var than = ds.map(function (r) {
    return dongBieuDo(r.bp, thanh(100 * r.n / max, '#6b46a8'), r.n + ' hạng mục');
  }).join('');
  return khungBieuDo('KHỐI LƯỢNG ' + String(nhanKy || 'kỳ sau').toUpperCase() + ' — CHƯA HOÀN THÀNH VMP', than,
    'Hạng mục có mốc đích VMP rơi vào kỳ sau và hiện chưa xong.');
}


/* ============ BẢNG & Ô SỐ CHO DASHBOARD TRONG MAIL ============
 * Mail nay là dashboard đầy đủ, không phải bản tóm tắt (người dùng chốt
 * 2026-07-31: "chấp nhận nặng hơn vì nó là dashboard"). Nên nó lặp lại ĐỦ
 * các mục của trang web: tổng quan năm, tổng quan kỳ, mục tiêu 50%, bất cập
 * theo bộ phận, việc kỳ sau, chất lượng dữ liệu, dữ liệu thô.
 * ============================================================= */

function oSoLon(nhan, so, phu, mau, nen) {
  return '<td style="padding:12px 14px;background:' + (nen || '#f7f4fb') + ';border-radius:10px;vertical-align:top">'
    + '<div style="font-size:11px;color:#777;line-height:1.4">' + esc(nhan) + '</div>'
    + '<div style="font-size:22px;font-weight:bold;color:' + (mau || '#2d1b45') + ';margin-top:2px">' + esc(so) + '</div>'
    + (phu ? '<div style="font-size:10.5px;color:#888;margin-top:2px;line-height:1.4">' + esc(phu) + '</div>' : '')
    + '</td>';
}

function hangO(os) {
  return '<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:6px 0;margin-top:10px"><tr>'
    + os.join('') + '</tr></table>';
}

function bangHtml(tieu, cot, hang, ghiChu) {
  if (!hang.length) return '';
  return '<div style="margin-top:22px">'
    + '<div style="font-size:12px;font-weight:bold;color:#2d1b45;letter-spacing:.6px">' + esc(tieu) + '</div>'
    + (ghiChu ? '<div style="font-size:11px;color:#888;margin:3px 0 6px">' + esc(ghiChu) + '</div>' : '<div style="height:6px"></div>')
    + '<div style="overflow-x:auto"><table style="border-collapse:collapse;width:100%">'
    + '<tr style="text-align:left;color:#777;font-size:10.5px">'
    + cot.map(function (c) { return '<th style="padding:4px 8px;white-space:nowrap">' + esc(c) + '</th>'; }).join('')
    + '</tr>'
    + hang.map(function (r) {
        return '<tr>' + r.map(function (v) {
          return '<td style="padding:5px 8px;border-top:1px solid #eee;font-size:11.5px;white-space:nowrap">'
            + esc(v == null ? '' : v) + '</td>';
        }).join('') + '</tr>';
      }).join('')
    + '</table></div></div>';
}

var TEN_GIAI_DOAN = {
  chua: 'Chưa bắt đầu', dang_dc: 'Đang làm đề cương', cho_td: 'Xong đề cương · chờ thực tế',
  dang_td: 'Đang thẩm định thực tế', cho_bc: 'Xong thực tế · chờ báo cáo',
  bc: 'Đang/đã làm báo cáo', done: 'Hoàn thành VMP'
};

var ctxAll = $('Dựng prompt tổng hợp').all().map(function (i) { return i.json; });

return $input.all().map(function (it, idx) {
  var raw = it.json || {};
  var th = doc(raw.text != null ? raw.text : raw.output) || {};
  var ctx = ctxAll[idx] || ctxAll[0] || {};
  var d = ctx.du_lieu || {};
  var laCanhBao = ctx.loai === 'canh_bao';

  var NHAN = laCanhBao
    ? { tienDo: 'QUÁ HẠN NẶNG NHẤT', ruiRo: 'THỨ TỰ XỬ LÝ THEO RỦI RO',
        mucTieu: 'SO VỚI MỤC TIÊU 50%/THÁNG', batCap: 'BỘ PHẬN ĐANG NGHẼN', thangToi: 'SẮP TỚI HẠN — CHUẨN BỊ NGAY',
        uuTien: 'VIỆC PHẢI LÀM TUẦN TỚI' }
    : { tienDo: 'TIẾN ĐỘ & QUÁ HẠN', ruiRo: 'THỨ TỰ RỦI RO & HỒ SƠ',
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
  var kyChu = ctx.ky_nhan || ('năm ' + (d.nam || ''));
  var mau = laCanhBao ? '#b00020' : '#6b46a8';
  var subject = '[VMP] ' + (laCanhBao ? 'Phân tích cảnh báo' : 'Nhận xét báo cáo')
    + ' · ' + phamViChu + ' · kỳ ' + kyChu;

  var thangTrongKy = [];
  for (var mm = (d.thang_tu || 1); mm <= (d.thang_den || 12); mm++) thangTrongKy.push(mm);

  var tho = d.chi_tiet_toan_bo || [];
  var csv = dungCsv(tho);
  var tenTep = 'DuLieuTho_VMP_' + String(kyChu).replace(/[^0-9A-Za-z]+/g, '-') + '.csv';
  function tenTepCsv() { return tenTep; }
  function tenTepHtmlChu() { return 'Dashboard_VMP_' + String(kyChu).replace(/[^0-9A-Za-z]+/g, '-') + '.html'; }

  // Thân mail chỉ 60 dòng đầu (hộp thư nào cũng cắt mail quá dài); bản HTML
  // đính kèm có ĐỦ — đó mới là chỗ tra cứu thật.
  function dungBangTho(gioiHan) {
    if (!tho.length) return '';
    var n = Math.min(gioiHan, tho.length);
    var hang = tho.slice(0, n).map(function (r) {
      return '<tr>' + COT_THO.map(function (c) {
        var v = r[c[0]];
        return '<td style="padding:5px 8px;border-top:1px solid #eee;font-size:11.5px;white-space:nowrap">'
          + esc(Array.isArray(v) ? v.join('+') : (v == null ? '' : v)) + '</td>';
      }).join('') + '</tr>';
    }).join('');
    return '<div style="margin-top:22px">'
      + '<div style="font-size:12px;font-weight:bold;color:#2d1b45;letter-spacing:.6px">DỮ LIỆU THÔ — KỲ ' + esc(String(kyChu).toUpperCase()) + '</div>'
      + '<div style="font-size:11px;color:#777;margin:3px 0 6px">'
      + esc(tho.length) + ' hạng mục'
      + (n < tho.length
          ? '. Bảng dưới hiện ' + n + ' dòng đầu; toàn bộ nằm trong tệp CSV và tệp HTML đính kèm.'
          : ' — đầy đủ.')
      + '</div>'
      + '<div style="overflow-x:auto"><table style="border-collapse:collapse;width:100%">'
      + '<tr style="text-align:left;color:#777;font-size:10.5px">'
      + COT_THO.map(function (c) { return '<th style="padding:4px 8px;white-space:nowrap">' + esc(c[1]) + '</th>'; }).join('')
      + '</tr>' + hang + '</table></div></div>';
  }

  function dungLoiNhacTho() {
    if (!tho.length) return '';
    return '<div style="margin-top:22px;padding:13px 15px;background:#fff8e6;border-radius:10px;font-size:12px;color:#6a5326;line-height:1.6">'
      + '<b>Dữ liệu thô ' + esc(tho.length) + ' hạng mục</b> nằm trong hai tệp đính kèm: '
      + esc(tenTepCsv()) + ' (mở bằng Excel để lọc/xoay) và ' + esc(tenTepHtmlChu()) + ' (dashboard đầy đủ, mở bằng trình duyệt).'
      + '</div>';
  }

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

  // ---------- MỤC 1: TỔNG QUAN CẢ NĂM (khớp mục 1 trên web) ----------
  var tqn = d.tong_quan_nam || null;
  var pct = function (x, t) { return t ? Math.round(100 * x / t) + '%' : '—'; };
  var mucNam = !tqn ? '' :
    '<div style="margin-top:22px">'
    + '<div style="font-size:12px;font-weight:bold;color:#2d1b45;letter-spacing:.6px">1. TỔNG QUAN NĂM ' + esc(d.nam) + ' — ĐÃ LÀM ĐƯỢC BAO NHIÊU</div>'
    + '<div style="font-size:11px;color:#888;margin-top:3px">Toàn bộ hạng mục có mốc đích VMP trong năm. Hoàn thành VMP là chỉ số chính; ba mức còn lại là dữ liệu bổ sung.</div>'
    + hangO([
        oSoLon('Tổng hạng mục năm ' + d.nam, tqn.tong, '', '#2d1b45'),
        oSoLon('\u2605 Hoàn thành VMP — chỉ số chính', pct(tqn.vmp.xong, tqn.tong),
          tqn.vmp.xong + '/' + tqn.tong + ' · quá hạn ' + tqn.vmp.qua_han, '#2e9e6b', '#e8f6ef'),
      ])
    + '<div style="font-size:10.5px;color:#888;margin-top:12px;letter-spacing:.4px;font-weight:bold">DỮ LIỆU BỔ SUNG — ba giai đoạn trước đó</div>'
    + hangO([
        oSoLon('Đề cương hoàn thành', pct(tqn.de_cuong.xong, tqn.tong), tqn.de_cuong.xong + '/' + tqn.tong + ' · quá hạn ' + tqn.de_cuong.qua_han, '#8b6fc7'),
        oSoLon('Thẩm định thực tế', pct(tqn.tham_dinh.xong, tqn.tong), tqn.tham_dinh.xong + '/' + tqn.tong + ' · quá hạn ' + tqn.tham_dinh.qua_han, '#3f8fc4'),
        oSoLon('Hồ sơ hoàn thiện', pct(tqn.ho_so.xong, tqn.tong), tqn.ho_so.xong + '/' + tqn.tong + ' · quá hạn ' + tqn.ho_so.qua_han, '#d4699a'),
      ])
    + bangHtml('HẠNG MỤC ĐANG Ở GIAI ĐOẠN NÀO — NĂM ' + d.nam, ['Giai đoạn', 'Số hạng mục'],
        (d.giai_doan_nam || []).map(function (g) { return [TEN_GIAI_DOAN[g.id] || g.id, g.so]; }))
    + '</div>';

  // ---------- MỤC 2: TỔNG QUAN KỲ ĐANG XEM ----------
  var thangKy = (d.theo_thang || []).filter(function (r) {
    return r.thang >= (d.thang_tu || 1) && r.thang <= (d.thang_den || 12);
  });
  var kyDue = thangKy.reduce(function (a2, r) { return a2 + (r.can_hoan_thanh || 0); }, 0);
  var kyDone = thangKy.reduce(function (a2, r) { return a2 + (r.da_hoan_thanh || 0); }, 0);
  // Kỳ CHƯA TỚI thì không có tỷ lệ — 0% ở kỳ chưa xảy ra không phải một tỷ lệ.
  var kyChuaToi = thangKy.length > 0 && thangKy.every(function (r) { return r.ky === 'chua_toi'; });
  var kyDangDienRa = thangKy.some(function (r) { return r.ky === 'dang_dien_ra'; });
  var kyRate = (kyDue && !kyChuaToi) ? Math.round(100 * kyDone / kyDue) : null;

  var dai = (d.thang_den || 12) - (d.thang_tu || 1) + 1;
  var trTu = (d.thang_tu || 1) - dai, trDen = (d.thang_tu || 1) - 1;
  var thangTruoc = trTu >= 1
    ? (d.theo_thang || []).filter(function (r) { return r.thang >= trTu && r.thang <= trDen; })
    : [];
  var trDue = thangTruoc.reduce(function (a2, r) { return a2 + (r.can_hoan_thanh || 0); }, 0);
  var trDone = thangTruoc.reduce(function (a2, r) { return a2 + (r.da_hoan_thanh || 0); }, 0);
  var trRate = trDue ? Math.round(100 * trDone / trDue) : null;

  var soSanh = kyRate == null ? '—'
    : kyChuaToi ? 'Chưa chấm được'
    : kyDangDienRa ? (kyRate >= 50 ? 'Tạm đạt' : 'Tạm dưới')
    : (kyRate >= 50 ? 'Đạt' : 'Chưa đạt');
  var soSanhPhu = kyRate == null ? 'Chưa có hạng mục đến hạn'
    : kyChuaToi ? 'Kỳ chưa tới'
    : kyDangDienRa ? 'Số giữa kỳ — kỳ chưa kết thúc' : 'Kết quả đã chốt';

  var mucKy = '<div style="margin-top:24px">'
    + '<div style="font-size:12px;font-weight:bold;color:#2d1b45;letter-spacing:.6px">2. TỔNG QUAN ' + esc(String(kyChu).toUpperCase()) + '</div>'
    + hangO([
        oSoLon('Cần hoàn thành ' + kyChu, kyDue, '', '#2d1b45'),
        oSoLon('Đã hoàn thành VMP', kyDone, kyRate == null ? 'chưa có hạng mục đến hạn' : kyRate + '% trong kỳ', '#2e9e6b', '#e8f6ef'),
        oSoLon('Tỷ lệ kỳ trước', trRate == null ? '—' : trRate + '%',
          trRate == null ? (trTu < 1 ? 'kỳ trước ở năm khác' : 'kỳ trước chưa có hạng mục') : trDone + '/' + trDue + ' hạng mục', '#3f8fc4'),
        oSoLon('So mục tiêu 50%', soSanh, soSanhPhu, (kyRate != null && kyRate >= 50) ? '#2e9e6b' : '#c0405f',
          (kyRate != null && kyRate >= 50) ? '#e8f6ef' : '#fdeff2'),
      ])
    + '</div>';

  // ---------- MỤC 4: BẢNG BẤT CẬP THEO BỘ PHẬN ----------
  var xongTheoBp = {};
  (d.theo_bo_phan || []).forEach(function (b2) { xongTheoBp[b2.bo_phan] = b2; });
  var bangBatCap = bangHtml('4. BẤT CẬP THEO BỘ PHẬN — KỲ ' + String(kyChu).toUpperCase(),
    ['Bộ phận', 'Tổng', 'Chậm đề cương', 'Chậm thẩm định', 'Chậm báo cáo', 'Quá hạn VMP', 'Tỷ lệ đúng hạn'],
    (d.bat_cap_theo_bo_phan || []).map(function (r) {
      var bp = xongTheoBp[r.bo_phan] || {};
      var tyLe = bp.tong ? Math.round(100 * (bp.xong || 0) / bp.tong) + '%' : '—';
      return [r.bo_phan, r.tong, r.cham_de_cuong, r.cham_tham_dinh, r.cham_bao_cao, r.qua_han_vmp, tyLe];
    }),
    'Chậm = quá hạn của chính giai đoạn đó mà chưa xong. Quá hạn VMP là con số khác — quá mốc đích.');

  // ---------- MỤC 5: BẢNG VIỆC KỲ SAU ----------
  function dungBangKySau(n) {
    var ds = d.thang_toi || [];
    return bangHtml('5. CÔNG VIỆC DỰ KIẾN KỲ SAU — CHƯA HOÀN THÀNH VMP',
      ['Mã', 'Tên hạng mục', 'Bộ phận', 'Người thực hiện', 'Hạn đích VMP', 'Điểm trọng yếu'],
      ds.slice(0, n).map(function (r) {
        return [r.ma, r.ten, (r.bo_phan || []).join('+'), r.nguoi, r.han, r.diem];
      }),
      ds.length + ' hạng mục có mốc đích VMP rơi vào kỳ sau'
        + (n < ds.length ? ' — bảng dưới hiện ' + n + ' dòng đầu, xem đủ trong tệp đính kèm.' : '.'));
  }

  // ---------- CHẤT LƯỢNG DỮ LIỆU ----------
  var loi = d.loi_ho_so || [];
  function dungBangChatLuong(n) {
    return bangHtml('CHẤT LƯỢNG DỮ LIỆU — KỲ ' + String(kyChu).toUpperCase(),
      ['Mã', 'Vấn đề'], loi.slice(0, n).map(function (r) { return [r.ma, r.loi]; }),
      loi.length + ' vấn đề'
        + ((d.chua_co_moc_dich || 0) > 0 ? ' · ' + d.chua_co_moc_dich + ' hạng mục chưa có mốc đích VMP nên không thuộc kỳ nào' : '')
        + (n < loi.length ? ' · bảng dưới hiện ' + n + ' dòng đầu, xem đủ trong tệp đính kèm' : ''));
  }

  // Thân mail phải GỌN: Gmail cắt mail quá ~100KB và người nhận chỉ thấy
  // "[Message clipped]". Bản ĐẦY ĐỦ nằm ở tệp HTML đính kèm — đó mới là
  // dashboard. Cùng một hàm dựng, khác nhau ở giới hạn số dòng.
  function dungHtml(dayDu) {
    var gh = dayDu ? 100000 : 15;
    // Thân mail KHÔNG kèm bảng dữ liệu thô — 18 cột nhân N dòng với style nội
    // tuyến lặp lại là phần nặng nhất, mà đó đúng là thứ nên nằm ở tệp đính kèm.
    var bangThoBlock = dayDu ? dungBangTho(tho.length) : dungLoiNhacTho();
  return '<div style="font-family:Arial,Helvetica,sans-serif;max-width:900px;margin:0 auto;border:1px solid #eee;border-radius:12px;overflow:hidden">'
    + '<div style="background:' + mau + ';color:#fff;padding:14px 18px">'
    + '<div style="font-size:16px;font-weight:bold">VMP Monitor · ' + esc(tieuDe) + '</div>'
    + '<div style="font-size:12px;opacity:.9;margin-top:3px">' + esc(phamViChu) + ' · kỳ ' + esc(kyChu) + ' · số liệu đọc ngày ' + esc(d.ngay_chay || '') + '</div>'
    + '</div>'
    + '<div style="padding:18px">'
    + (th.tomTat ? '<div style="font-size:14px;line-height:1.7;color:#222">' + esc(th.tomTat) + '</div>' : '')
    + (th.mucRuiRoTongThe ? '<div style="margin-top:10px;display:inline-block;padding:5px 12px;border-radius:999px;background:#f3eefa;color:' + mau + ';font-size:12px;font-weight:bold">Mức rủi ro tổng thể: ' + esc(th.mucRuiRoTongThe) + '</div>' : '')
    + '<table style="border-collapse:separate;border-spacing:0;margin-top:16px;width:100%"><tr>' + oSo + '</tr></table>'
    + mucNam
    + mucKy
    + khoiHtml(NHAN.tienDo, th.tienDo)
    + khoiHtml(NHAN.ruiRo, th.ruiRo)
    + khoiHtml(NHAN.mucTieu, th.soSanhMucTieu)
    + khoiHtml(NHAN.batCap, th.batCapBoPhan)
    + khoiHtml(NHAN.thangToi, th.keHoachThangToi)
    + khoiHtml(NHAN.uuTien, th.viecUuTien)
    + khoiHtml('BẰNG CHỨNG CHÍNH', th.bangChungChinh)
    + khoiHtml('GIỚI HẠN DỮ LIỆU', th.luuYDuLieu)
    + bieuDoThang(d.theo_thang, thangTrongKy)
    + bieuDoBoPhan(d.bat_cap_theo_bo_phan)
    + bangBatCap
    + bieuDoKySau(d.thang_toi, 'kỳ sau')
    + dungBangKySau(gh)
    + bangQuaHan
    + dungBangChatLuong(gh)
    + bangThoBlock
    + '<div style="margin-top:22px;padding:14px 16px;background:#f3eefa;border-radius:10px">'
    + '<a href="' + TRANG_DASHBOARD + '" style="color:#6b46a8;font-weight:bold;font-size:13.5px;text-decoration:none">'
    + '\u2192 Mở dashboard động (lọc, đổi kỳ, bấm vào số để xem chi tiết)</a>'
    + '<div style="font-size:11px;color:#777;margin-top:4px">Mail này là ảnh chụp lúc gửi. Hộp thư không chạy được JavaScript nên bảng biểu ở đây là tĩnh; muốn xoay số thì mở dashboard.</div>'
    + '</div>'
    + '<div style="margin-top:20px;padding-top:12px;border-top:1px solid #eee;font-size:11px;color:#999;line-height:1.6">'
    + 'Kỳ là lát cắt theo mốc đích VMP, không phải ảnh chụp tại thời điểm đó.<br/>'
    + esc(th.gioiHanAI || 'AI chỉ hỗ trợ nhận định, không thay thế đánh giá của QA và không phải căn cứ phê duyệt GMP.')
    + (th.confidence != null ? ' · Độ tin cậy AI tự đánh giá: ' + esc(th.confidence) : '')
    + '<br/>Mail tự động từ VMP Monitor (workflow Vani VMP 5). Phần chữ do AI soạn — CẦN QA XÁC NHẬN trước khi dùng làm căn cứ.'
    + '</div></div></div>';
  }

  var html = dungHtml(false);
  // Tệp đính kèm: cùng một dashboard nhưng ĐỦ dòng dữ liệu thô, bọc trong
  // khung HTML hoàn chỉnh để mở thẳng bằng trình duyệt.
  var htmlDayDu = '<!doctype html><html lang="vi"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<title>' + esc(subject) + '</title></head>'
    + '<body style="margin:0;padding:18px;background:#faf7fb">' + dungHtml(true) + '</body></html>';
  var tenTepHtml = 'Dashboard_VMP_' + String(kyChu).replace(/[^0-9A-Za-z]+/g, '-') + '.html';

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
    ky_nhan: kyChu,
    csv_tho: csv,
    ten_tep_csv: tenTep,
    html_day_du: htmlDayDu,
    ten_tep_html: tenTepHtml,
    so_dong_tho: tho.length,
    goc_idx: idx,
    nguon: 'gpt-4o-mini',
    luc: new Date().toISOString(),
  } };
});
