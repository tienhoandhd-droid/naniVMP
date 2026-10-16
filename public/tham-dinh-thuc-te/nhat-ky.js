(() => {
  'use strict';
  // Nhật ký thay đổi (gói 2, 16/10): đọc cpc1_audit_trail — Annex 11 §9.
  const $ = id => document.getElementById(id);
  const HE = { steam: 'Hơi tinh khiết', air: 'Khí nén', nitrogen: 'Khí nitơ' };
  const LOAI = { luu: 'Lưu phiên bản', sua: 'Sửa số liệu', dot: 'Sự kiện đợt', in: 'In PDF' };
  const DOT = { created: 'Tạo đợt', history_imported: 'Nhập dữ liệu lịch sử', closed: 'Kết thúc đợt', completed: 'Hoàn thành đợt', calibration_updated: 'Đổi hạn thiết bị' };
  const LUU = { save_draft: 'Lưu' };
  let rows = [];
  // dd/mm/yyyy HH:mm theo giờ VN — tự ghép để không phụ thuộc thứ tự locale của trình duyệt.
  const thoiDiem = iso => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso)).map(x => [x.type, x.value]));
    return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
  };
  const giaTri = v => v === null || v === undefined || v === '' ? '—' : String(v);
  const thayDoi = list => Array.isArray(list) ? list.map(c => `${(c.path || []).join(' › ')}: ${giaTri(c.before)} → ${giaTri(c.after)}`).join('; ') : '';
  const chiTiet = r => r.loai === 'dot' ? (DOT[r.chi_tiet] || r.chi_tiet || '') : r.loai === 'luu' ? (LUU[r.chi_tiet] || r.chi_tiet || '') : r.loai === 'sua' ? thayDoi(r.thay_doi) : (r.chi_tiet || '');
  const cot = r => [thoiDiem(r.thoi_diem), r.nguoi || '', LOAI[r.loai] || r.loai, HE[r.he_thong] || '', r.dot || '', r.phien_ban ?? '', chiTiet(r), r.ly_do || ''];

  function hien() {
    const bang = $('nk-bang'), body = bang.querySelector('tbody');
    body.replaceChildren(...rows.map(r => { const tr = document.createElement('tr'); cot(r).forEach(v => { const td = document.createElement('td'); td.textContent = String(v); tr.append(td); }); return tr; }));
    bang.hidden = rows.length === 0;
    $('nk-xuat').disabled = rows.length === 0;
    $('nk-trang-thai').textContent = rows.length ? `${rows.length} sự kiện${rows.length >= 500 ? ' (giới hạn 500 mới nhất — thu hẹp khoảng ngày để xem thêm)' : ''}.` : 'Không có sự kiện nào trong phạm vi đã chọn.';
  }

  async function tai() {
    $('nk-trang-thai').textContent = 'Đang tải…'; $('nk-bang').hidden = true; $('nk-xuat').disabled = true;
    try {
      const backend = window.CPC1Backend;
      if (!backend || typeof backend.auditTrail !== 'function') throw new Error('Dịch vụ nhật ký chưa sẵn sàng.');
      if (!await backend.getSession()) throw new Error('Đăng nhập VMP để xem nhật ký.');
      const kq = await backend.auditTrail({ system: $('nk-he-thong').value || null, from: $('nk-tu').value || null, to: $('nk-den').value || null });
      if (!kq || kq.ok !== true || !Array.isArray(kq.rows)) throw new Error('Máy chủ trả dữ liệu không hợp lệ.');
      rows = kq.rows; hien();
    } catch (loi) {
      rows = []; $('nk-trang-thai').textContent = `Không tải được nhật ký: ${loi.message}`;
    }
  }

  function xuat() {
    const o = v => `"${String(v).replaceAll('"', '""')}"`;
    const dong = [['Thời điểm', 'Người', 'Hành động', 'Hệ thống', 'Đợt', 'Phiên bản', 'Chi tiết', 'Lý do'].map(o).join(','), ...rows.map(r => cot(r).map(o).join(','))];
    const url = URL.createObjectURL(new Blob(['﻿' + dong.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `nhat-ky-tham-dinh-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.append(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  $('nhat-ky-loc').addEventListener('submit', e => { e.preventDefault(); void tai(); });
  $('nk-xuat').addEventListener('click', xuat);
  window.addEventListener('cpc1:permissions-refreshed', () => void tai());
  void tai();
})();
