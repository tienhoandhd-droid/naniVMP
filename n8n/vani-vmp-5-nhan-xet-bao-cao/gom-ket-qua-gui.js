// Node "Gom kết quả gửi" — workflow "Vani VMP 5" (id RWwTaTtzjjfgE5np).
// Gom kết quả từng mail về lại từng phạm vi, rồi trả về đúng hình dạng mà node
// "Đóng gói cho web" đã trả — để web chỉ phải đọc một kiểu dữ liệu dù có gửi
// mail hay không.
//
// Node Gửi mail đặt onError='continueRegularOutput' nên item hỏng vẫn đi tiếp,
// chỉ khác là có trường error. Nhờ vậy MỘT địa chỉ sai không chặn những địa chỉ
// còn lại, và web vẫn nhận được câu trả lời thay vì treo tới lúc timeout.
var goi = $('Bung người nhận').all().map(function (i) { return i.json; });
var kq = $input.all().map(function (i) { return i.json || {}; });
var gocs = $('Đóng gói cho web').all().map(function (i) { return i.json; });

var mail = gocs.map(function () { return { da_gui: [], that_bai: [] }; });

goi.forEach(function (g, i) {
  var r = kq[i] || {};
  var idx = typeof g.goc_idx === 'number' && mail[g.goc_idx] ? g.goc_idx : 0;
  if (!mail[idx]) return;
  var loi = r.error ? (r.error.message || r.error.description || String(r.error)) : '';
  if (loi) mail[idx].that_bai.push({ email: g.email, loi: String(loi).slice(0, 200) });
  else mail[idx].da_gui.push(g.email);
});

return gocs.map(function (g, i) {
  return { json: Object.assign({}, g, { mail: mail[i] }) };
});
