// Node "Đóng gói cho web" — bản mở rộng 2026-07-30.
// Thêm 2 mục vào văn bản trả về: SO VỚI MỤC TIÊU 50%/THÁNG và KẾ HOẠCH THÁNG
// TỚI, đọc từ th.soSanhMucTieu / th.batCapBoPhan / th.keHoachThangToi (AI trả
// theo schema mới trong "Dựng prompt tổng hợp").
function doc(v){ if(!v) return null; if(typeof v==='object') return v; var s=String(v).trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''); try{ return JSON.parse(s);}catch(e){ var a=s.indexOf('{'),b=s.lastIndexOf('}'); if(a>=0&&b>a){ try{ return JSON.parse(s.slice(a,b+1)); }catch(e2){} } return null; } }

var raw=$input.first().json;
var th=doc(raw.text!=null?raw.text:raw.output)||{};
var ctx=$('Dựng prompt tổng hợp').first().json||{};
var d=ctx.du_lieu||{};
var L=[];

// Ép về mảng chuỗi. BẮT BUỘC phải phòng thủ: mô hình thường trả một trường
// lẽ ra là mảng thành CHUỖI, mà chuỗi cũng có .length nên bản cũ lọt qua rồi
// vỡ ở .forEach ("arr.forEach is not a function") — hỏng cả báo cáo chỉ vì AI
// lệch định dạng. Đã gặp thật ở execution 3103212 (keHoachThangToi trả chuỗi).
function veMang(v){
  if (Array.isArray(v)) return v.filter(function(x){ return x != null && x !== ''; })
    .map(function(x){ return typeof x === 'string' ? x : JSON.stringify(x); });
  if (typeof v === 'string') return v.trim() ? [v.trim()] : [];
  if (v == null) return [];
  return [JSON.stringify(v)];
}
function muc(ten, v){
  var xs = veMang(v);
  if (!xs.length) return;
  L.push('', ten);
  xs.forEach(function(x){ L.push('· '+x); });
}

if(th.tieuDe) L.push(th.tieuDe);
if(th.tomTat) L.push('', th.tomTat);
if(th.mucRuiRoTongThe) L.push('', 'Mức rủi ro tổng thể: '+th.mucRuiRoTongThe);
muc('TIẾN ĐỘ & QUÁ HẠN', th.tienDo);
muc('THỨ TỰ RỦI RO & HỒ SƠ', th.ruiRo);
muc('PHÂN CÔNG & TẢI VIỆC', th.phanCong);
muc('SO VỚI MỤC TIÊU 50%/THÁNG', th.soSanhMucTieu);
muc('BẤT CẬP THEO BỘ PHẬN', th.batCapBoPhan);
muc('KẾ HOẠCH THÁNG TỚI', th.keHoachThangToi);
muc('BẰNG CHỨNG CHÍNH', th.bangChungChinh);
var uuTien = veMang(th.viecUuTien);
if(uuTien.length){ L.push('','VIỆC ƯU TIÊN TUẦN TỚI'); uuTien.forEach(function(x,i){ L.push((i+1)+'. '+x); }); }
muc('GIỚI HẠN DỮ LIỆU', th.luuYDuLieu);
L.push('', th.gioiHanAI||'AI chỉ hỗ trợ nhận định, không thay thế đánh giá của QA và không phải căn cứ phê duyệt GMP.');
if(th.confidence!=null) L.push('Độ tin cậy tự đánh giá: '+th.confidence);
if(!th.tieuDe && !th.tomTat) L.push('Không đọc được kết quả AI — xem workflow_runs để tra.');

return [{ json: { ok:true, ai_text:L.join('\n'), chi_tiet:{tong_hop:th}, so_hang_muc:d.tong_hang_muc||0, so_qua_han:ctx.so_qua_han||0, pham_vi:ctx.pham_vi, ky:ctx.ky, nguon:'gpt-4o-mini', luc:new Date().toISOString() } }];
