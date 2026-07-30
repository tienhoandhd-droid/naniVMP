// Node "Bung người nhận" — workflow "Vani VMP 5" (id RWwTaTtzjjfgE5np).
// Mỗi người nhận một item, để node Gửi mail chạy đúng một lần cho mỗi địa chỉ.
// Giữ goc_idx để node gom kết quả biết mail này thuộc phạm vi nào — đường chạy
// theo lịch có nhiều phạm vi cùng lúc, mất goc_idx là gom nhầm.
return $input.all().flatMap(function (it) {
  var j = it.json || {};
  return (j.nguoi_nhan || []).map(function (n) {
    return { json: {
      email: n.email,
      ten: n.ten || '',
      tieu_de_mail: j.tieu_de_mail,
      html: j.html,
      pham_vi: j.pham_vi,
      loai: j.loai,
      goc_idx: j.goc_idx,
    } };
  });
});
