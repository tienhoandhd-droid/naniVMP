// Node "Dựng prompt tổng hợp" — bản mở rộng 2026-07-30.
// Thêm 2 mảng nhận định vào schema JSON: soSanhMucTieu (mục tiêu 50%/tháng)
// và keHoachThangToi (việc dự kiến tháng tới) — đọc từ theo_thang/thang_toi/
// bat_cap_theo_bo_phan mà node "Đọc dữ liệu thô VMP" đã tính sẵn (không để
// AI tự cộng trừ số, chỉ diễn giải số đã có).
var it = $input.first().json || {};
var d = it.du_lieu || {};
var tt = d.theo_trang_thai || {};
var soQuaHanThuc = tt.over || 0;
var soXong = tt.done || 0;

var thangHienTai = new Date(d.ngay_chay).getMonth() + 1;
var thangRow = (d.theo_thang || []).find(function (r) { return r.thang === thangHienTai; }) || null;

var RAO = 'Bạn là chuyên gia QA thẩm định nhà máy dược GMP, đọc số liệu thật của Kế hoạch Thẩm định Gốc (VMP). '
 + 'Bạn chỉ là lớp nhận định. Không thay đổi số liệu. Không phê duyệt GMP. Không bịa số, không bịa mã hạng mục. '
 + 'Mọi con số và mã nêu ra phải có trong dữ liệu. Các danh sách chi tiết đã bị cắt bớt để gọn, nên khi nói số tổng phải dùng các trường dem_* chứ không đếm độ dài danh sách. '
 + 'Dữ liệu thiếu không phải là đạt hay không đạt và phải làm giảm confidence. '
 + 'Chỉ trả về MỘT JSON object thuần, không markdown, không code fence, đúng schema: '
 + 'mucRuiRoTongThe, tieuDe, tomTat, tienDo, ruiRo, phanCong, soSanhMucTieu, batCapBoPhan, keHoachThangToi, bangChungChinh, viecUuTien, luuYDuLieu, gioiHanAI, confidence. '
 + 'mucRuiRoTongThe thuộc {cao, trung binh, thap}. confidence là số 0..1. tomTat tối đa 100 từ. '
 + 'tienDo, ruiRo, phanCong, soSanhMucTieu, batCapBoPhan, keHoachThangToi, bangChungChinh, viecUuTien, luuYDuLieu là mảng chuỗi, mỗi mảng tối đa 4 mục, mỗi mục tối đa 35 từ. '
 + 'tienDo: tiến độ và quá hạn theo bộ phận. '
 + 'ruiRo: nhóm trọng yếu cao 7-9 điểm có bị làm chậm hơn nhóm thấp không (ICH Q9, EU GMP Annex 15) và lỗi hồ sơ theo ALCOA+, có dẫn mã hạng mục. '
 + 'phanCong: tải việc theo người và hạng mục chưa phân công. '
 + 'soSanhMucTieu: so tỷ lệ hoàn thành với mục tiêu 50%/tháng, dùng đúng số ty_le đã cho, KHÔNG tự tính lại phần trăm. '
 + 'CHỈ được kết luận đạt/chưa đạt cho tháng có ky="da_qua". Tháng ky="dang_dien_ra" phải nói rõ là số giữa kỳ, chưa phải kết quả chốt. '
 + 'TUYỆT ĐỐI KHÔNG nói tháng ky="chua_toi" là chưa đạt hay 0% — kỳ đó chưa xảy ra, ty_le của nó là null, chỉ được nhắc tới như khối lượng sắp phải bố trí. '
 + 'Tháng có can_hoan_thanh=0 nghĩa là không có hạng mục nào đến hạn, không phải 0%. '
 + 'batCapBoPhan: bộ phận nào đang nghẽn, chậm ở giai đoạn đề cương hay thẩm định thực tế hay báo cáo — dùng đúng số cham_de_cuong/cham_tham_dinh/cham_bao_cao đã cho. '
 + 'keHoachThangToi: nêu khối lượng và trọng tâm công việc tháng sau dựa trên danh sách thang_toi (số hạng mục, bộ phận nào nhiều việc nhất) — không liệt kê hết từng mã, chỉ tóm nhóm chính. '
 + 'viecUuTien: mỗi mục là một việc cụ thể phải làm, có động từ và gắn mã hạng mục hoặc tên người, không được chỉ liệt kê mã. '
 + 'luuYDuLieu: nói về GIỚI HẠN CỦA DỮ LIỆU (thiếu ngày thực tế, chưa chấm điểm, danh sách bị cắt), không phải khuyến nghị. '
 + 'gioiHanAI phải nói rõ AI chỉ hỗ trợ nhận định, không thay thế QA và không phải căn cứ phê duyệt. Toàn bộ bằng tiếng Việt.';

var payload = {
  ky: it.ky, pham_vi: it.pham_vi, ngay_chay: d.ngay_chay,
  dem_tong_hang_muc: d.tong_hang_muc,
  dem_theo_trang_thai: tt,
  dem_qua_han: soQuaHanThuc,
  dem_da_xong: soXong,
  dem_chua_phan_cong: d.chua_phan_cong,
  dem_loi_ho_so: (d.loi_ho_so || []).length,
  theo_muc_trong_yeu: d.theo_muc_trong_yeu,
  theo_bo_phan: d.theo_bo_phan,
  theo_nguoi: d.theo_nguoi,
  mau_qua_han_nang_nhat: (d.qua_han || []).slice(0, 30),
  mau_sap_toi_han: (d.sap_toi_han_60_ngay || []).slice(0, 20),
  mau_loi_ho_so: (d.loi_ho_so || []).slice(0, 30),
  // MỚI — mục tiêu 50%/tháng + bất cập theo bộ phận + việc tháng tới.
  thang_hien_tai: thangHienTai,
  du_lieu_theo_thang: d.theo_thang || [],
  ty_le_thang_hien_tai: thangRow,
  du_lieu_bat_cap_bo_phan: d.bat_cap_theo_bo_phan || [],
  so_luong_viec_thang_toi: (d.thang_toi || []).length,
  mau_viec_thang_toi: (d.thang_toi || []).slice(0, 30),
  ghi_chu_cat_bot: 'Các trường mau_* và du_lieu_* chỉ là ví dụ hoặc số đã tính sẵn; số tổng dùng các trường dem_*. KHÔNG tự tính lại % — dùng đúng ty_le đã cho trong du_lieu_theo_thang.'
};

return [{ json: { promptTongHop: RAO + '\nDữ liệu: ' + JSON.stringify(payload), du_lieu: d, so_qua_han: soQuaHanThuc, ky: it.ky, pham_vi: it.pham_vi } }];
