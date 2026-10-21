(() => {
  'use strict';
  // Gói 3 (16/10): kiểm tra – duyệt – ký điện tử – khoá – mở lại.
  // Luật ký (ai được ký, ba người khác nhau, mã deviation, khoá) do máy chủ
  // quyết định — xem 20261016190000_tham_dinh_ky_duyet.sql. Ở đây chỉ hiển
  // thị trạng thái và mở hộp ký khi máy chủ báo người đang xem được ký.
  const $ = id => document.getElementById(id);
  const NHAN = { kiem_tra: 'Kiểm tra', duyet: 'Duyệt', mo_lai: 'Mở lại' };
  const Y_NGHIA = {
    kiem_tra: 'Tôi đã kiểm tra số liệu và kết quả của phiên bản này.',
    duyet: 'Tôi phê duyệt phiên bản này. Sau khi duyệt, hồ sơ được khoá.',
    mo_lai: 'Tôi mở lại hồ sơ đã duyệt để sửa. Hồ sơ phải được kiểm tra và duyệt lại.',
  };
  const TRANG_THAI = { chua_ky: 'Chưa kiểm tra', da_kiem_tra: 'Đã kiểm tra · chờ duyệt', da_duyet: 'Đã duyệt · hồ sơ khoá' };
  let hoSo = null, trangThai = null, loiTai = '', token = 0;

  function el(name, attributes = {}, children = []) {
    const node = document.createElement(name);
    for (const [key, value] of Object.entries(attributes)) {
      if (key === 'text') node.textContent = String(value);
      else if (key === 'className') node.className = value;
      else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value);
    }
    node.append(...children);
    return node;
  }
  // dd/mm/yyyy HH:mm theo giờ VN — tự ghép như nhat-ky.js để không phụ thuộc thứ tự locale.
  const luc = iso => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso)).map(x => [x.type, x.value]));
    return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
  };

  function khung() {
    let host = $('ky-duyet');
    if (host) return host;
    host = el('section', { id: 'ky-duyet', className: 'ky-duyet', 'aria-labelledby': 'ky-duyet-title' }, [
      el('h2', { id: 'ky-duyet-title', text: 'Kiểm tra và duyệt' }),
      el('p', { id: 'ky-duyet-trang-thai', role: 'status', 'aria-live': 'polite' }),
      el('ol', { id: 'ky-duyet-lich-su', className: 'ky-duyet-lich-su', 'aria-label': 'Lịch sử ký' }),
      el('div', { id: 'ky-duyet-nut', className: 'ky-duyet-nut' }),
    ]);
    document.getElementById('entry-form')?.before(host);
    return host;
  }

  function hienThi() {
    const host = khung();
    host.hidden = !hoSo;
    if (!hoSo) return;
    const st = trangThai;
    host.dataset.trangThai = st?.trang_thai || '';
    $('ky-duyet-trang-thai').textContent = loiTai ? `Không tải được trạng thái ký: ${loiTai}`
      : !st ? 'Đang tải trạng thái ký…'
      : `${TRANG_THAI[st.trang_thai] || st.trang_thai} · phiên bản v${st.version}${st.o_sai?.length ? ` · Còn ${st.o_sai.length} ô nhập sai — sửa trước khi ký` : ''}`;
    $('ky-duyet-lich-su').replaceChildren(...(st?.rows || []).map(row => el('li', {
      text: [`${NHAN[row.y_nghia] || row.y_nghia} · ${row.ho_ten}`, luc(row.luc), `v${row.version}`,
        row.ma_deviation ? `Deviation ${row.ma_deviation}` : '', row.ly_do ? `Lý do: ${row.ly_do}` : ''].filter(Boolean).join(' · '),
    })));
    $('ky-duyet-nut').replaceChildren(...['kiem_tra', 'duyet', 'mo_lai'].filter(y => st?.co_the?.[y] === true)
      .map(y => el('button', { type: 'button', 'data-y-nghia': y, text: y === 'mo_lai' ? 'Mở lại hồ sơ' : `Ký ${NHAN[y].toLowerCase()}`, onclick: () => moHop(y) })));
  }

  async function tai() {
    const minh = ++token, dangXet = hoSo;
    loiTai = '';
    try {
      const ketQua = await window.CPC1Backend.recordSignatures(dangXet.recordId);
      if (minh !== token) return;
      if (!ketQua?.ok) throw new Error(ketQua?.error || 'Máy chủ không trả trạng thái ký.');
      const truoc = trangThai?.trang_thai;
      trangThai = ketQua;
      hienThi();
      if (truoc !== ketQua.trang_thai) window.CPC1RunEntry?.reflect();
    } catch (error) {
      if (minh !== token) return;
      trangThai = null; loiTai = error?.message || 'Lỗi không rõ.';
      hienThi();
    }
  }

  function moHop(yNghia) {
    $('ky-duyet-hop')?.remove();
    const canDeviation = yNghia === 'kiem_tra' && trangThai?.bat_buoc_deviation === true;
    const matKhau = el('input', { id: 'ky-mat-khau', type: 'password', autocomplete: 'current-password', required: 'required' });
    const deviation = canDeviation ? el('input', { id: 'ky-deviation', type: 'text', maxlength: '60', required: 'required' }) : null;
    const lyDo = yNghia === 'mo_lai' ? el('textarea', { id: 'ky-ly-do', maxlength: '1000', required: 'required' }) : null;
    const loi = el('p', { id: 'ky-loi', className: 'form-error', role: 'alert' });
    const nutKy = el('button', { type: 'submit', text: `Ký ${NHAN[yNghia].toLowerCase()}` });
    const hop = el('dialog', { id: 'ky-duyet-hop', className: 'ky-duyet-hop', 'aria-labelledby': 'ky-hop-title' });
    const form = el('form', { method: 'dialog', novalidate: 'novalidate' }, [
      el('h2', { id: 'ky-hop-title', text: `Ký ${NHAN[yNghia].toLowerCase()} · phiên bản v${trangThai.version}` }),
      el('p', { className: 'ky-y-nghia', text: Y_NGHIA[yNghia] }),
      ...(deviation ? [el('p', { className: 'help', text: 'Kết quả chưa đạt hoặc chưa đủ: ghi mã deviation.' }), el('label', { for: 'ky-deviation', text: 'Mã deviation' }), deviation] : []),
      ...(lyDo ? [el('label', { for: 'ky-ly-do', text: 'Lý do mở lại' }), lyDo] : []),
      el('label', { for: 'ky-mat-khau', text: 'Nhập lại mật khẩu để ký' }), matKhau,
      loi,
      el('div', { className: 'ky-hop-nut' }, [el('button', { type: 'button', text: 'Huỷ', onclick: () => hop.close() }), nutKy]),
    ]);
    hop.append(form);
    hop.addEventListener('close', () => hop.remove());
    form.addEventListener('submit', async event => {
      event.preventDefault();
      loi.textContent = '';
      try {
        if (deviation && !deviation.value.trim()) throw new Error('Ghi mã deviation.');
        if (lyDo && !lyDo.value.trim()) throw new Error('Ghi lý do mở lại.');
        if (!matKhau.value) throw new Error('Nhập mật khẩu để ký.');
        nutKy.disabled = true;
        await window.CPC1Backend.signRecord({ recordId: hoSo.recordId, version: trangThai.version, meaning: yNghia,
          password: matKhau.value, reason: lyDo?.value.trim() || null, deviation: deviation?.value.trim() || null });
        hop.close();
        await tai();
      } catch (error) {
        // Máy chủ chặn ký khi còn ô nhập sai (INVALID_DATA kèm issues): báo số ô và để trang nhập đánh dấu từng ô.
        const oSai = Array.isArray(error?.issues) ? error.issues : [];
        const thongBao = String(error?.message || 'Không ký được.').trim();
        loi.textContent = oSai.length ? `${/[.!?]$/.test(thongBao) ? thongBao : thongBao + '.'} Còn ${oSai.length} ô nhập sai — xem các ô được đánh dấu.` : thongBao;
        if (oSai.length) window.dispatchEvent(new CustomEvent('cpc1:input-issues', { detail: oSai }));
      } finally {
        matKhau.value = '';
        nutKy.disabled = false;
      }
    });
    document.body.append(hop);
    hop.showModal();
    (deviation || lyDo || matKhau).focus();
  }

  // Gọi từ run-entry.js mỗi khi hồ sơ của đợt được tải hoặc lưu phiên bản mới.
  function capNhat({ recordId, version, loaded }) {
    // Bộ giả lập cũ không có chức năng ký thì bỏ qua khung này.
    if (!loaded || !recordId || typeof window.CPC1Backend?.recordSignatures !== 'function') {
      if (hoSo) { hoSo = null; trangThai = null; token++; hienThi(); }
      return;
    }
    if (hoSo?.recordId === recordId && hoSo?.version === version) return;
    hoSo = { recordId, version }; trangThai = null;
    hienThi();
    void tai();
  }

  window.CPC1KyDuyet = Object.freeze({ capNhat, get khoa() { return trangThai?.trang_thai === 'da_duyet'; } });
})();
