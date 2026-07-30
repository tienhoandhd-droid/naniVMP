// Node "Dựng prompt tổng hợp" — workflow "Vani VMP 5" (id RWwTaTtzjjfgE5np).
// Bản 2026-07-30: chạy cho MỌI item (đường lịch có N phạm vi), và dựng hai
// loại prompt khác nhau:
//   loai='bao_cao'  → nhận xét cho Báo cáo quản lý (như bản cũ)
//   loai='canh_bao' → phân tích cảnh báo: nhắc ai, việc nào trước, vì sao nghẽn
//
// Ghép item theo CHỈ SỐ với node "Chuẩn hoá yêu cầu": Postgres executeQuery
// trả đúng một item cho mỗi item vào, theo thứ tự. Không đọc thẳng $json cho
// phần yêu cầu vì node Postgres chỉ trả cột kết quả, nuốt mất mọi trường khác.
//
// Rào chắn quan trọng nhất giữ nguyên: AI KHÔNG được tự tính lại phần trăm,
// và KHÔNG được chấm đạt/trượt cho tháng chưa tới kỳ.

var yc = $('Chuẩn hoá yêu cầu').all().map(function (i) { return i.json; });

var CHUNG = 'Bạn là chuyên gia QA thẩm định nhà máy dược GMP, đọc số liệu thật của Kế hoạch Thẩm định Gốc (VMP). '
 + 'Bạn chỉ là lớp nhận định. Không thay đổi số liệu. Không phê duyệt GMP. Không bịa số, không bịa mã hạng mục. '
 + 'Mọi con số và mã nêu ra phải có trong dữ liệu. Các danh sách chi tiết đã bị cắt bớt để gọn, nên khi nói số tổng phải dùng các trường dem_* chứ không đếm độ dài danh sách. '
 + 'Dữ liệu thiếu không phải là đạt hay không đạt và phải làm giảm confidence. '
 + 'Chỉ trả về MỘT JSON object thuần, không markdown, không code fence. ';

var SCHEMA_BAO_CAO = 'Đúng schema: '
 + 'mucRuiRoTongThe, tieuDe, tomTat, tienDo, ruiRo, phanCong, soSanhMucTieu, batCapBoPhan, keHoachThangToi, bangChungChinh, viecUuTien, luuYDuLieu, gioiHanAI, confidence. '
 + 'mucRuiRoTongThe thuộc {cao, trung binh, thap}. confidence là số 0..1. tomTat tối đa 100 từ. '
 + 'tienDo, ruiRo, phanCong, soSanhMucTieu, batCapBoPhan, keHoachThangToi, bangChungChinh, viecUuTien, luuYDuLieu là mảng chuỗi, mỗi mảng tối đa 4 mục, mỗi mục tối đa 35 từ. '
 + 'tienDo: tiến độ và quá hạn theo bộ phận. '
 + 'ruiRo: nhóm trọng yếu cao 7-9 điểm có bị làm chậm hơn nhóm thấp không (ICH Q9, EU GMP Annex 15) và lỗi hồ sơ theo ALCOA+, có dẫn mã hạng mục. '
 + 'phanCong: tải việc theo người và hạng mục chưa phân công — số hạng mục chưa phân công phải lấy ĐÚNG dem_chua_phan_cong, không được lấy con số khác. '
 + 'soSanhMucTieu: so tỷ lệ hoàn thành với mục tiêu 50%/tháng, dùng đúng số ty_le đã cho, KHÔNG tự tính lại phần trăm. '
 + 'CHỈ được kết luận đạt/chưa đạt cho tháng có ky="da_qua". Tháng ky="dang_dien_ra" phải nói rõ là số giữa kỳ, chưa phải kết quả chốt. '
 + 'TUYỆT ĐỐI KHÔNG nói tháng ky="chua_toi" là chưa đạt hay 0% — kỳ đó chưa xảy ra, ty_le của nó là null, chỉ được nhắc tới như khối lượng sắp phải bố trí. '
 + 'Tháng có can_hoan_thanh=0 nghĩa là không có hạng mục nào đến hạn, không phải 0%. '
 + 'batCapBoPhan: bộ phận nào đang nghẽn — dùng ĐÚNG cặp giai_doan_nghen_nhat + so_cham_o_giai_doan_nghen của bộ phận đó, KHÔNG dùng qua_han_vmp thay. '
 + 'keHoachThangToi: nêu khối lượng và trọng tâm công việc tháng sau dựa trên danh sách thang_toi (số hạng mục, bộ phận nào nhiều việc nhất) — không liệt kê hết từng mã, chỉ tóm nhóm chính. '
 + 'viecUuTien: mỗi mục là một việc cụ thể phải làm, có động từ và gắn mã hạng mục hoặc tên người, không được chỉ liệt kê mã. '
 + 'luuYDuLieu: nói về GIỚI HẠN CỦA DỮ LIỆU (thiếu ngày thực tế, chưa chấm điểm, danh sách bị cắt), không phải khuyến nghị. '
 + 'gioiHanAI phải nói rõ AI chỉ hỗ trợ nhận định, không thay thế QA và không phải căn cứ phê duyệt. Toàn bộ bằng tiếng Việt.';

// Bản cảnh báo dùng CHUNG schema với báo cáo, chỉ đổi ý nghĩa từng mảng. Giữ
// một schema duy nhất để node đóng gói không phải rẽ nhánh — chỗ rẽ nhánh
// theo hình dạng AI trả về chính là chỗ bản cũ từng vỡ.
var SCHEMA_CANH_BAO = 'Đúng schema: '
 + 'mucRuiRoTongThe, tieuDe, tomTat, tienDo, ruiRo, phanCong, soSanhMucTieu, batCapBoPhan, keHoachThangToi, bangChungChinh, viecUuTien, luuYDuLieu, gioiHanAI, confidence. '
 + 'mucRuiRoTongThe thuộc {cao, trung binh, thap}. confidence là số 0..1. tomTat tối đa 100 từ, nói ngay tình trạng cảnh báo nặng nhất. '
 + 'Các trường mảng là mảng chuỗi, mỗi mảng tối đa 4 mục, mỗi mục tối đa 35 từ. '
 + 'Đây là BẢN PHÂN TÍCH CẢNH BÁO, không phải báo cáo tháng, nên hiểu từng mảng như sau: '
 + 'tienDo: hạng mục quá hạn nặng nhất, trễ bao nhiêu ngày, thuộc bộ phận nào — dẫn mã cụ thể. '
 + 'ruiRo: xếp thứ tự xử lý theo rủi ro ICH Q9 — quá hạn của nhóm trọng yếu cao 7-9 điểm phải đứng trước quá hạn lâu hơn của nhóm điểm thấp; nói rõ vì sao. '
 + 'phanCong: ai đang ôm nhiều hạng mục quá hạn nhất, và bao nhiêu hạng mục chưa có người — số chưa phân công phải lấy ĐÚNG dem_chua_phan_cong, không được lấy con số khác. '
 + 'soSanhMucTieu: tháng này đang ở đâu so với mục tiêu 50%, dùng đúng ty_le đã cho, KHÔNG tự tính lại. '
 + 'CHỈ kết luận đạt/chưa đạt cho tháng ky="da_qua"; tháng ky="dang_dien_ra" phải nói rõ là số giữa kỳ; TUYỆT ĐỐI KHÔNG nói tháng ky="chua_toi" là chưa đạt hay 0%. '
 + 'batCapBoPhan: bộ phận nào nghẽn ở giai đoạn nào — dùng ĐÚNG cặp giai_doan_nghen_nhat + so_cham_o_giai_doan_nghen của bộ phận đó, KHÔNG dùng qua_han_vmp thay. '
 + 'keHoachThangToi: hạng mục sắp tới hạn trong 60 ngày cần chuẩn bị ngay, nhóm theo bộ phận. '
 + 'bangChungChinh: mã hạng mục và con số làm chỗ dựa cho các nhận định trên. '
 + 'viecUuTien: mỗi mục là MỘT việc phải làm trong tuần tới, có động từ, có mã hạng mục hoặc tên người phụ trách. '
 + 'luuYDuLieu: giới hạn của dữ liệu (thiếu ngày thực tế, chưa chấm điểm trọng yếu, danh sách bị cắt). '
 + 'gioiHanAI phải nói rõ AI chỉ hỗ trợ nhận định, không thay thế QA và không phải căn cứ phê duyệt. Toàn bộ bằng tiếng Việt.';

return $input.all().map(function (it, idx) {
  var d = (it.json || {}).du_lieu || {};
  var ctx = yc[idx] || yc[0] || {};
  var tt = d.theo_trang_thai || {};
  var soQuaHan = tt.over || 0;
  var soXong = tt.done || 0;

  var thangHienTai = new Date(d.ngay_chay).getMonth() + 1;
  var thangRow = (d.theo_thang || []).find(function (r) { return r.thang === thangHienTai; }) || null;

  var laCanhBao = ctx.loai === 'canh_bao';

  // theo_muc_trong_yeu do SQL trả CHỈ có tổng/xong, không có số quá hạn — mà
  // đó đúng là con số mô hình cần khi xếp thứ tự rủi ro. Thiếu thì nó tự ghép
  // bừa: đã thấy thật ngày 2026-07-30 — "nhóm cao có 149 hạng mục, trong đó
  // 159 quá hạn" (159 là tổng quá hạn toàn nhà máy). Tính sẵn ở đây từ
  // chi_tiet_toan_bo để không còn chỗ nào cho nó phải đoán.
  var NHOM = ['1_cao_7_9', '2_trung_binh_4_6', '3_thap_1_3', '4_chua_cham'];
  var nhom = {};
  NHOM.forEach(function (k) { nhom[k] = { muc: k, tong: 0, xong: 0, qua_han: 0 }; });
  (d.chi_tiet_toan_bo || []).forEach(function (x) {
    var dm = Number(x.diem) || 0;
    var k = dm >= 7 ? NHOM[0] : dm >= 4 ? NHOM[1] : dm > 0 ? NHOM[2] : NHOM[3];
    nhom[k].tong++;
    if (x.trang_thai === 'done') nhom[k].xong++;
    if (x.trang_thai === 'over') nhom[k].qua_han++;
  });
  var theoMucTrongYeu = NHOM.map(function (k) {
    var r = nhom[k];
    r.ty_le_xong = r.tong ? Math.round(100 * r.xong / r.tong) : null;
    r.ty_le_qua_han = r.tong ? Math.round(100 * r.qua_han / r.tong) : null;
    return r;
  }).filter(function (r) { return r.tong > 0; });

  // Câu lệnh cứng cho tháng hiện tại. Rào chắn chung trong prompt đã có nhưng
  // mô hình vẫn viết "tháng này 5%, chưa đạt" cho một tháng chưa kết thúc —
  // chốt sổ một kỳ chưa xảy ra. Nói thẳng bằng một câu tính sẵn thì chắc hơn.
  var cachNoiThang = !thangRow
    ? 'Không có dữ liệu tháng hiện tại — không được nhận định gì về tháng này.'
    : thangRow.ky === 'dang_dien_ra'
      ? ('Tháng ' + thangHienTai + ' ĐANG DIỄN RA. ' + (thangRow.ty_le == null
          ? 'Chưa có hạng mục nào đến hạn trong tháng — KHÔNG được nói 0% hay chưa đạt.'
          : 'Con số ' + thangRow.ty_le + '% là SỐ GIỮA KỲ, chưa phải kết quả chốt. Phải nói rõ đó là số giữa kỳ; TUYỆT ĐỐI KHÔNG viết "chưa đạt", "trượt mục tiêu" hay "không đạt" cho tháng này.'))
      : ('Tháng ' + thangHienTai + ' có ky=' + thangRow.ky + '.');

  // Mỗi bộ phận có 4 con số gần giống nhau (cham_de_cuong / cham_tham_dinh /
  // cham_bao_cao / qua_han_vmp) và mô hình chọn nhầm — 2026-07-30 nó viết "qc
  // nghẽn ở thẩm định thực tế với 64" trong khi 64 là qua_han_vmp còn giai
  // đoạn nghẽn thật là báo cáo (71). Chọn hộ nó ngay tại đây.
  var batCap = (d.bat_cap_theo_bo_phan || []).map(function (b) {
    var gd = [
      { ten: 'đề cương', n: b.cham_de_cuong || 0 },
      { ten: 'thẩm định thực tế', n: b.cham_tham_dinh || 0 },
      { ten: 'báo cáo', n: b.cham_bao_cao || 0 },
    ].sort(function (x, y) { return y.n - x.n; })[0];
    return Object.assign({}, b, {
      giai_doan_nghen_nhat: gd.n > 0 ? gd.ten : 'không nghẽn giai đoạn nào',
      so_cham_o_giai_doan_nghen: gd.n,
    });
  });

  var payload = {
    loai_phan_tich: laCanhBao ? 'phan_tich_canh_bao' : 'nhan_xet_bao_cao',
    pham_vi: ctx.pham_vi, ngay_chay: d.ngay_chay,
    // Kỳ báo cáo: mọi con số dưới đây CHỈ nói về kỳ này, trừ mau_sap_toi_han
    // (việc sắp tới hạn vốn không thuộc kỳ nào).
    ky_bao_cao: ctx.ky_nhan,
    ky_nam: d.nam, ky_thang_tu: d.thang_tu, ky_thang_den: d.thang_den,
    giai_thich_ky: 'Kỳ là lát cắt theo MỐC ĐÍCH VMP: hạng mục có mốc đích rơi vào kỳ, tính tới ngay_chay đã xong bao nhiêu. KHÔNG phải ảnh chụp tại thời điểm kỳ đó — dữ liệu không có ngày hoàn thành thực tế.',
    dem_tong_hang_muc: d.tong_hang_muc,
    dem_theo_trang_thai: tt,
    dem_qua_han: soQuaHan,
    dem_da_xong: soXong,
    dem_chua_phan_cong: d.chua_phan_cong,
    dem_loi_ho_so: (d.loi_ho_so || []).length,
    dem_sap_toi_han_60_ngay: (d.sap_toi_han_60_ngay || []).length,
    theo_muc_trong_yeu: theoMucTrongYeu,
    giai_thich_theo_muc_trong_yeu: 'Trong theo_muc_trong_yeu, "tong"/"xong"/"qua_han" là số hạng mục CỦA RIÊNG nhóm đó. Không được lấy dem_qua_han (số của TOÀN phạm vi) gán cho một nhóm.',
    theo_bo_phan: d.theo_bo_phan,
    theo_nguoi: d.theo_nguoi,
    // Bản cảnh báo cần nhiều mẫu quá hạn hơn để xếp thứ tự cho đúng; bản báo
    // cáo cần nhiều số tổng hợp hơn. Cắt khác nhau để prompt không phình.
    mau_qua_han_nang_nhat: (d.qua_han || []).slice(0, laCanhBao ? 40 : 30),
    mau_sap_toi_han: (d.sap_toi_han_60_ngay || []).slice(0, laCanhBao ? 30 : 20),
    mau_loi_ho_so: (d.loi_ho_so || []).slice(0, 30),
    thang_hien_tai: thangHienTai,
    du_lieu_theo_thang: d.theo_thang || [],
    ty_le_thang_hien_tai: thangRow,
    cach_noi_ve_thang_hien_tai: cachNoiThang,
    du_lieu_bat_cap_bo_phan: batCap,
    giai_thich_bat_cap: 'Khi nói bộ phận nào nghẽn ở giai đoạn nào, dùng ĐÚNG cặp giai_doan_nghen_nhat + so_cham_o_giai_doan_nghen của chính bộ phận đó. qua_han_vmp là con số KHÁC (quá hạn mốc đích VMP), không được dùng thay.',
    so_luong_viec_thang_toi: (d.thang_toi || []).length,
    mau_viec_thang_toi: (d.thang_toi || []).slice(0, laCanhBao ? 15 : 30),
    ghi_chu_cat_bot: 'Các trường mau_* và du_lieu_* chỉ là ví dụ hoặc số đã tính sẵn; số tổng dùng các trường dem_*. KHÔNG tự tính lại % — dùng đúng ty_le đã cho trong du_lieu_theo_thang.'
  };

  var prompt = CHUNG + (laCanhBao ? SCHEMA_CANH_BAO : SCHEMA_BAO_CAO)
    + ' Toàn bộ nhận định chỉ nói về KỲ ' + (ctx.ky_nhan || '') + '; mở đầu tieuDe phải nêu rõ kỳ này.'
    + ' BẮT BUỘC tuân theo câu sau khi nói về tháng hiện tại: ' + cachNoiThang
    + '\nDữ liệu: ' + JSON.stringify(payload);

  return { json: {
    promptTongHop: prompt,
    du_lieu: d,
    so_qua_han: soQuaHan,
    loai: ctx.loai,
    pham_vi: ctx.pham_vi,
    ky_nhan: ctx.ky_nhan,
    gui_mail: ctx.gui_mail,
    dung_danh_sach: ctx.dung_danh_sach,
    email_nhan: ctx.email_nhan || [],
    tu_web: ctx.tu_web,
  } };
});
