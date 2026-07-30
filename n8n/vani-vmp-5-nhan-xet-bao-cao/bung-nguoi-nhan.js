// Node "Bung người nhận" — workflow "Vani VMP 5" (id RWwTaTtzjjfgE5np).
// Mỗi người nhận một item, để node Gửi mail chạy đúng một lần cho mỗi địa chỉ.
// Giữ goc_idx để node gom kết quả biết mail này thuộc phạm vi nào — đường chạy
// theo lịch có nhiều phạm vi cùng lúc, mất goc_idx là gom nhầm.
//
// CSV dữ liệu thô gắn vào BINARY của từng item: node Send Email chỉ đính kèm
// được từ binary property, không nhận chuỗi. Mỗi người nhận một bản — tốn bộ
// nhớ hơn nhưng đổi lại một địa chỉ hỏng không kéo theo địa chỉ khác.
return $input.all().flatMap(function (it) {
  var j = it.json || {};
  return (j.nguoi_nhan || []).map(function (n) {
    var item = {
      json: {
        email: n.email,
        ten: n.ten || '',
        tieu_de_mail: j.tieu_de_mail,
        html: j.html,
        pham_vi: j.pham_vi,
        ky_nhan: j.ky_nhan,
        loai: j.loai,
        ten_tep_csv: j.ten_tep_csv,
        so_dong_tho: j.so_dong_tho,
        goc_idx: j.goc_idx,
      },
    };
    if (j.csv_tho) {
      item.binary = {
        du_lieu_tho: {
          data: Buffer.from(j.csv_tho, 'utf8').toString('base64'),
          mimeType: 'text/csv',
          fileName: j.ten_tep_csv || 'du-lieu-tho.csv',
          fileExtension: 'csv',
        },
      };
    }
    return item;
  });
});
